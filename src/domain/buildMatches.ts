import type {
  ExternalMatchParticipantRecord,
  ExternalMatchRecord,
  GoalRecord,
  MatchParticipantRecord,
  MatchParticipationStatus,
  MatchRecord,
  MatchTeam,
  ParticipantTeam,
  ScoredGoal
} from "./types";
import type { RosterSnapshot } from "./rosterTypes";
import { sortGoalsChronologically } from "./sortGoals";
import { getTeamDisplayName, resolveTeamDisplayName } from "./teamDisplay";
import { resolveTeamFromApiFootball, resolveTeamFromWikipedia } from "./teamResolver";
import { findUniqueRosterPlayer } from "./rosterNameMatcher";
import { getParticipantPickCandidateNames, getParticipantPickDisplayName } from "./participantPick";
import { normalizePlayerName } from "./normalizePlayerName";

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
        affectedOwners: [...new Set(pointGoals.map((goal) => goal.owner))].sort((a, b) => a.localeCompare(b)),
        participants: []
      };
    });
}

function getParticipantMatchKey(participant: ExternalMatchParticipantRecord): string {
  return participant.matchId || (participant.fixtureId ? `api-football:${participant.fixtureId}` : "unknown");
}

function participantBelongsToFixture(participant: ExternalMatchParticipantRecord, fixture: ExternalMatchRecord): boolean {
  return participant.matchId === fixture.matchId || Boolean(fixture.fixtureId && participant.fixtureId === fixture.fixtureId);
}

function resolveParticipantTeamId(participant: ExternalMatchParticipantRecord): string | undefined {
  if (participant.teamId) {
    return participant.teamId;
  }

  const team =
    participant.source === "api-football"
      ? resolveTeamFromApiFootball(participant.nationalTeam)
      : resolveTeamFromWikipedia(participant.nationalTeam) ?? resolveTeamFromApiFootball(participant.nationalTeam);

  return team?.teamId;
}

function getRosterDisplayName(
  participant: ExternalMatchParticipantRecord,
  teamId: string | undefined,
  rosterSnapshot: RosterSnapshot | undefined
): string {
  const rosterTeam = teamId ? rosterSnapshot?.teams.find((team) => team.teamId === teamId) : undefined;
  const rosterPlayer = rosterTeam ? findUniqueRosterPlayer(rosterTeam.players, [participant.playerName]) : null;
  return rosterPlayer?.playerName ?? participant.playerName;
}

function getPickOwners(
  participant: ExternalMatchParticipantRecord,
  teams: ParticipantTeam[],
  rosterSnapshot: RosterSnapshot | undefined
): string[] {
  const teamId = resolveParticipantTeamId(participant);
  const normalizedParticipantName = normalizePlayerName(participant.playerName);
  const owners = teams.flatMap((team) => {
    const hasPlayer = team.players.some((pick) => {
      if (teamId && pick.teamId !== teamId) {
        return false;
      }

      return [...getParticipantPickCandidateNames(pick), getParticipantPickDisplayName(pick, rosterSnapshot)].some((candidateName) => {
        return normalizePlayerName(candidateName) === normalizedParticipantName;
      });
    });

    return hasPlayer ? [team.owner] : [];
  });

  return [...new Set(owners)].sort((left, right) => left.localeCompare(right));
}

function getParticipantStatusRank(status: MatchParticipationStatus): number {
  switch (status) {
    case "subbed-out":
      return 4;
    case "subbed-in":
      return 3;
    case "starter":
      return 2;
    case "bench":
      return 1;
    case "unknown":
      return 0;
  }
}

function buildParticipantMergeKey(participant: ExternalMatchParticipantRecord): string {
  const teamId = resolveParticipantTeamId(participant) ?? normalizeMatchTeamKey(participant.nationalTeam);
  const playerKey = normalizePlayerName(participant.playerName);
  return [getParticipantMatchKey(participant), teamId, playerKey].join("|");
}

function getFixtureTeamIds(fixture: ExternalMatchRecord): Set<string> {
  return new Set(
    [resolveTeamFromApiFootball(fixture.homeTeam.name), resolveTeamFromApiFootball(fixture.awayTeam.name)]
      .map((team) => team?.teamId)
      .filter((teamId): teamId is string => Boolean(teamId))
  );
}

function isPickInRoster(pickTeamId: string, pickName: string, rosterSnapshot: RosterSnapshot | undefined): boolean {
  const rosterTeam = rosterSnapshot?.teams.find((team) => team.teamId === pickTeamId);
  if (!rosterTeam) {
    return true;
  }

  return Boolean(findUniqueRosterPlayer(rosterTeam.players, [pickName]));
}

function buildPickedFixtureParticipants(
  fixture: ExternalMatchRecord,
  teams: ParticipantTeam[],
  rosterSnapshot: RosterSnapshot | undefined
): ExternalMatchParticipantRecord[] {
  const fixtureTeamIds = getFixtureTeamIds(fixture);
  if (fixtureTeamIds.size === 0) {
    return [];
  }

  return teams.flatMap((team) =>
    team.players.flatMap((pick) => {
      if (!fixtureTeamIds.has(pick.teamId) || !isPickInRoster(pick.teamId, pick.playerName, rosterSnapshot)) {
        return [];
      }

      return [
        {
          source: fixture.source,
          matchId: fixture.matchId,
          ...(fixture.fixtureId ? { fixtureId: fixture.fixtureId } : {}),
          playerName: getParticipantPickDisplayName(pick, rosterSnapshot),
          nationalTeam: getTeamDisplayName(pick.teamId),
          teamId: pick.teamId,
          status: "unknown"
        } satisfies ExternalMatchParticipantRecord
      ];
    })
  );
}

function dedupeParticipants(participants: ExternalMatchParticipantRecord[]): ExternalMatchParticipantRecord[] {
  const participantsByKey = new Map<string, ExternalMatchParticipantRecord>();

  for (const participant of participants) {
    const key = buildParticipantMergeKey(participant);
    const existing = participantsByKey.get(key);
    if (!existing || getParticipantStatusRank(participant.status) > getParticipantStatusRank(existing.status)) {
      participantsByKey.set(key, participant);
    }
  }

  return [...participantsByKey.values()];
}

function enrichParticipants(
  participants: ExternalMatchParticipantRecord[],
  teams: ParticipantTeam[] = [],
  rosterSnapshot?: RosterSnapshot
): MatchParticipantRecord[] {
  return dedupeParticipants(participants)
    .map((participant) => {
      const teamId = resolveParticipantTeamId(participant);
      const owners = getPickOwners(participant, teams, rosterSnapshot);

      return {
        ...participant,
        teamId,
        nationalTeam: teamId ? getTeamDisplayName(teamId, participant.nationalTeam) : resolveTeamDisplayName(participant.nationalTeam, participant.source),
        displayPlayerName: getRosterDisplayName(participant, teamId, rosterSnapshot),
        displayNationalTeam: teamId ? getTeamDisplayName(teamId, participant.nationalTeam) : resolveTeamDisplayName(participant.nationalTeam, participant.source),
        owners,
        selected: owners.length > 0
      } satisfies MatchParticipantRecord;
    })
    .sort((left, right) => {
      const selectedSort = Number(right.selected) - Number(left.selected);
      return (
        selectedSort ||
        left.displayNationalTeam.localeCompare(right.displayNationalTeam) ||
        getParticipantStatusRank(right.status) - getParticipantStatusRank(left.status) ||
        left.displayPlayerName.localeCompare(right.displayPlayerName)
      );
    });
}

export function buildMatches(
  goals: GoalRecord[],
  scoredGoals: ScoredGoal[],
  fixtures: ExternalMatchRecord[] = [],
  participants: ExternalMatchParticipantRecord[] = [],
  teams: ParticipantTeam[] = [],
  rosterSnapshot?: RosterSnapshot
): MatchRecord[] {
  const fallbackMatches = buildFallbackMatches(goals, scoredGoals);
  const fixtureMatches = dedupeFixtures(fixtures).map((fixture) => {
    const matchGoals = sortGoalsChronologically(goals.filter((goal) => goalBelongsToFixture(goal, fixture)));
    const pointGoals = sortGoalsChronologically(scoredGoals.filter((goal) => goalBelongsToFixture(goal, fixture)));
    const matchParticipants = [
      ...participants.filter((participant) => participantBelongsToFixture(participant, fixture)),
      ...buildPickedFixtureParticipants(fixture, teams, rosterSnapshot)
    ];

    return {
      matchId: fixture.matchId,
      label: fixture.label,
      kickedOffAt: fixture.kickedOffAt,
      status: fixture.status,
      homeTeam: buildMatchTeam(fixture.homeTeam, fixture.source),
      awayTeam: buildMatchTeam(fixture.awayTeam, fixture.source),
      goals: matchGoals,
      pointGoals,
      affectedOwners: [...new Set(pointGoals.map((goal) => goal.owner))].sort((a, b) => a.localeCompare(b)),
      participants: enrichParticipants(matchParticipants, teams, rosterSnapshot)
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
