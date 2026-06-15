import type { ExternalMatchRecord, GoalRecord, MatchRecord, MatchTeam, ScoredGoal } from "./types";
import { sortGoalsChronologically } from "./sortGoals";
import { resolveTeamDisplayName } from "./teamDisplay";

function normalizeScoreLabel(label: string): string {
  return label.replace(/[–—]/g, "-");
}

function parseTeamFromLabel(label: string | undefined, source: GoalRecord["source"], side: "home" | "away"): MatchTeam {
  if (!label) {
    return { name: side === "home" ? "Team A" : "Team B" };
  }

  const match = normalizeScoreLabel(label).match(/^(.+?)\s+(\d+)-(\d+)\s+(.+)$/);
  if (!match) {
    return { name: side === "home" ? resolveTeamDisplayName(label, source) : "Gegner offen" };
  }

  return side === "home"
    ? { name: resolveTeamDisplayName(match[1].trim(), source), score: Number(match[2]) }
    : { name: resolveTeamDisplayName(match[4].trim(), source), score: Number(match[3]) };
}

function inferMatchLabel(goals: GoalRecord[]): string {
  return goals.find((goal) => goal.matchLabel)?.matchLabel ?? goals[0]?.matchId ?? "Spiel offen";
}

function buildMatchTeam(team: ExternalMatchRecord["homeTeam"], source: ExternalMatchRecord["source"]): MatchTeam {
  const matchTeam: MatchTeam = {
    name: resolveTeamDisplayName(team.name, source)
  };

  if (team.score !== undefined) {
    matchTeam.score = team.score;
  }

  return matchTeam;
}

function normalizeMatchTeamKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeMatchTimeKey(value: string | undefined): string {
  if (!value) {
    return "time-open";
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? value : new Date(timestamp).toISOString();
}

function getFixtureMatchKey(fixture: ExternalMatchRecord): string {
  return [
    normalizeMatchTimeKey(fixture.kickedOffAt),
    normalizeMatchTeamKey(resolveTeamDisplayName(fixture.homeTeam.name, fixture.source)),
    normalizeMatchTeamKey(resolveTeamDisplayName(fixture.awayTeam.name, fixture.source))
  ].join("|");
}

function getMatchKey(match: MatchRecord): string {
  return [
    normalizeMatchTimeKey(match.kickedOffAt),
    normalizeMatchTeamKey(match.homeTeam.name),
    normalizeMatchTeamKey(match.awayTeam.name)
  ].join("|");
}

function getFixtureCompletenessScore(fixture: ExternalMatchRecord): number {
  const sourceScore = fixture.source === "api-football" ? 100 : fixture.source === "wikipedia" ? 50 : 0;
  const statusScore = fixture.status === "finished" || fixture.status === "live" ? 10 : fixture.status === "scheduled" ? 5 : 0;
  const scoreScore = fixture.homeTeam.score !== undefined && fixture.awayTeam.score !== undefined ? 10 : 0;
  return sourceScore + statusScore + scoreScore;
}

function dedupeFixtures(fixtures: ExternalMatchRecord[]): ExternalMatchRecord[] {
  const fixturesByKey = new Map<string, ExternalMatchRecord>();
  for (const fixture of fixtures) {
    const key = getFixtureMatchKey(fixture);
    const existing = fixturesByKey.get(key);
    if (!existing || getFixtureCompletenessScore(fixture) > getFixtureCompletenessScore(existing)) {
      fixturesByKey.set(key, fixture);
    }
  }

  return [...fixturesByKey.values()];
}

function getGoalMatchId(goal: GoalRecord): string {
  return goal.matchId ?? goal.fixtureId ?? `unknown-${goal.externalGoalId}`;
}

function goalBelongsToFixture(goal: GoalRecord | ScoredGoal, fixture: ExternalMatchRecord): boolean {
  if (getGoalMatchId(goal) === fixture.matchId) {
    return true;
  }

  return Boolean(fixture.fixtureId && goal.fixtureId && goal.fixtureId === fixture.fixtureId);
}

function buildFallbackMatches(goals: GoalRecord[], scoredGoals: ScoredGoal[]): MatchRecord[] {
  const goalsByMatch = new Map<string, GoalRecord[]>();
  for (const goal of goals) {
    const matchId = getGoalMatchId(goal);
    goalsByMatch.set(matchId, [...(goalsByMatch.get(matchId) ?? []), goal]);
  }

  return [...goalsByMatch.entries()]
    .map(([matchId, matchGoals]) => {
      const label = inferMatchLabel(matchGoals);
      const pointGoals = scoredGoals.filter((goal) => getGoalMatchId(goal) === matchId);
      const homeTeam = parseTeamFromLabel(label, matchGoals[0]?.source ?? "wikipedia", "home");
      const awayTeam = parseTeamFromLabel(label, matchGoals[0]?.source ?? "wikipedia", "away");
      return {
        matchId,
        label,
        kickedOffAt: matchGoals.find((goal) => goal.kickedOffAt)?.kickedOffAt,
        status: homeTeam.score !== undefined && awayTeam.score !== undefined ? ("finished" as const) : ("unknown" as const),
        homeTeam,
        awayTeam,
        goals: sortGoalsChronologically(matchGoals),
        pointGoals: sortGoalsChronologically(pointGoals),
        affectedOwners: [...new Set(pointGoals.map((goal) => goal.owner))].sort((a, b) => a.localeCompare(b))
      };
    });
}

export function buildMatches(goals: GoalRecord[], scoredGoals: ScoredGoal[], fixtures: ExternalMatchRecord[] = []): MatchRecord[] {
  const fallbackMatches = buildFallbackMatches(goals, scoredGoals);
  const fixtureMatches = dedupeFixtures(fixtures).map((fixture) => {
    const matchGoals = sortGoalsChronologically(goals.filter((goal) => goalBelongsToFixture(goal, fixture)));
    const pointGoals = sortGoalsChronologically(scoredGoals.filter((goal) => goalBelongsToFixture(goal, fixture)));

    return {
      matchId: fixture.matchId,
      label: fixture.label,
      kickedOffAt: fixture.kickedOffAt,
      status: fixture.status,
      homeTeam: buildMatchTeam(fixture.homeTeam, fixture.source),
      awayTeam: buildMatchTeam(fixture.awayTeam, fixture.source),
      goals: matchGoals,
      pointGoals,
      affectedOwners: [...new Set(pointGoals.map((goal) => goal.owner))].sort((a, b) => a.localeCompare(b))
    } satisfies MatchRecord;
  });
  const fixtureIds = new Set(fixtureMatches.map((match) => match.matchId));
  const fixtureKeys = new Set(fixtureMatches.map((match) => getMatchKey(match)));

  return [
    ...fixtureMatches,
    ...fallbackMatches.filter((match) => !fixtureIds.has(match.matchId) && !fixtureKeys.has(getMatchKey(match)))
  ]
    .sort((a, b) => {
      const timeA = a.kickedOffAt ? Date.parse(a.kickedOffAt) : Number.MAX_SAFE_INTEGER;
      const timeB = b.kickedOffAt ? Date.parse(b.kickedOffAt) : Number.MAX_SAFE_INTEGER;
      return timeA - timeB || a.label.localeCompare(b.label);
    });
}
