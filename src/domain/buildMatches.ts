import type { GoalRecord, ScoredGoal } from "./goalTypes";
import type {
  ExternalMatchParticipantRecord,
  ExternalMatchRecord,
  MatchParticipantRecord,
  MatchParticipationStatus,
  MatchRecord,
  MatchTeam
} from "./matchTypes";
import type { ParticipantTeam } from "./participantTypes";
import type { RosterSnapshot } from "./rosterTypes";
import { sortGoalsChronologically } from "./sortGoals";
import { isCompetitionScorerAggregateGoal } from "./effectiveGoals";
import { getTeamDisplayName, resolveTeamDisplayName } from "./teamDisplay";
import { resolveTeamFromApiFootball, resolveTeamFromWikipedia } from "./teamResolver";
import { findUniqueRosterPlayer } from "./rosterNameMatcher";
import { resolveParticipantPicks, type ResolvedParticipantPick } from "./participantPick";
import { normalizePlayerName } from "./normalizePlayerName";
import { buildFixtureSyncStateForMatch } from "./fixtureSyncState";
import {
  getExternalMatchKey,
  getMatchRecordKey,
  goalBelongsToExternalMatch,
  normalizeMatchTeamKey,
  normalizeScoreLabel
} from "./matchIdentity";

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

function getFixtureCompletenessScore(fixture: ExternalMatchRecord): number {
  const sourceScore = fixture.source === "football-data" ? 110 : fixture.source === "api-football" ? 100 : fixture.source === "wikipedia" ? 50 : 0;
  const statusScore = fixture.status === "finished" || fixture.status === "live" ? 10 : fixture.status === "scheduled" ? 5 : 0;
  const scoreScore = fixture.homeTeam.score !== undefined && fixture.awayTeam.score !== undefined ? 10 : 0;
  return sourceScore + statusScore + scoreScore;
}

function dedupeFixtures(fixtures: ExternalMatchRecord[]): ExternalMatchRecord[] {
  const fixturesByKey = new Map<string, ExternalMatchRecord>();
  for (const fixture of fixtures) {
    const key = getExternalMatchKey(fixture);
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
  return goalBelongsToExternalMatch(goal, fixture);
}

function buildFallbackMatches(goals: GoalRecord[], scoredGoals: ScoredGoal[]): MatchRecord[] {
  const goalsByMatch = new Map<string, GoalRecord[]>();
  for (const goal of goals) {
    if (isCompetitionScorerAggregateGoal(goal)) {
      continue;
    }

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

function getParticipantPickKey(teamId: string | undefined, playerName: string): string {
  return [teamId ?? "", normalizePlayerName(playerName)].join("|");
}

function getPickOwners(participant: ExternalMatchParticipantRecord, resolvedPicks: ResolvedParticipantPick[]): string[] {
  const teamId = resolveParticipantTeamId(participant);
  const participantKey = getParticipantPickKey(teamId, participant.playerName);
  const owners = resolvedPicks.flatMap((pick) => (pick.nominated && getParticipantPickKey(pick.teamId, pick.playerName) === participantKey ? [pick.owner] : []));

  return [...new Set(owners)].sort((left, right) => left.localeCompare(right));
}

function getParticipantStatusRank(status: MatchParticipationStatus): number {
  switch (status) {
    case "subbed-in-out":
      return 5;
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

function mergeParticipantStatus(existing: MatchParticipationStatus, incoming: MatchParticipationStatus): MatchParticipationStatus {
  if (existing === incoming) {
    return existing;
  }

  if (
    existing === "subbed-in-out" ||
    (existing === "subbed-in" && incoming === "subbed-out") ||
    (existing === "subbed-out" && incoming === "subbed-in") ||
    (existing === "bench" && incoming === "subbed-out")
  ) {
    return "subbed-in-out";
  }

  return getParticipantStatusRank(incoming) > getParticipantStatusRank(existing) ? incoming : existing;
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

function buildPickedFixtureParticipants(
  fixture: ExternalMatchRecord,
  resolvedPicks: ResolvedParticipantPick[]
): ExternalMatchParticipantRecord[] {
  const fixtureTeamIds = getFixtureTeamIds(fixture);
  if (fixtureTeamIds.size === 0) {
    return [];
  }

  return resolvedPicks.flatMap((pick) =>
    pick.nominated && fixtureTeamIds.has(pick.teamId)
      ? [
          {
            source: fixture.source,
            matchId: fixture.matchId,
            ...(fixture.fixtureId ? { fixtureId: fixture.fixtureId } : {}),
            playerName: pick.playerName,
            nationalTeam: getTeamDisplayName(pick.teamId),
            teamId: pick.teamId,
            status: "unknown"
          } satisfies ExternalMatchParticipantRecord
        ]
      : []
  );
}

function dedupeParticipants(participants: ExternalMatchParticipantRecord[]): ExternalMatchParticipantRecord[] {
  const participantsByKey = new Map<string, ExternalMatchParticipantRecord>();

  for (const participant of participants) {
    const key = buildParticipantMergeKey(participant);
    const existing = participantsByKey.get(key);
    if (!existing) {
      participantsByKey.set(key, participant);
      continue;
    }

    const status = mergeParticipantStatus(existing.status, participant.status);
    if (status !== existing.status || getParticipantStatusRank(participant.status) > getParticipantStatusRank(existing.status)) {
      participantsByKey.set(key, { ...existing, ...participant, status });
    }
  }

  return [...participantsByKey.values()];
}

function enrichParticipants(
  participants: ExternalMatchParticipantRecord[],
  resolvedPicks: ResolvedParticipantPick[] = [],
  rosterSnapshot?: RosterSnapshot
): MatchParticipantRecord[] {
  return dedupeParticipants(participants)
    .map((participant) => {
      const teamId = resolveParticipantTeamId(participant);
      const displayPlayerName = getRosterDisplayName(participant, teamId, rosterSnapshot);
      const owners = getPickOwners({ ...participant, playerName: displayPlayerName, teamId }, resolvedPicks);

      return {
        ...participant,
        teamId,
        nationalTeam: teamId ? getTeamDisplayName(teamId, participant.nationalTeam) : resolveTeamDisplayName(participant.nationalTeam, participant.source),
        displayPlayerName,
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
  const resolvedPicks = resolveParticipantPicks(teams, rosterSnapshot);
  const pickedTeamIds = new Set(resolvedPicks.map((pick) => pick.teamId));
  const fixtureMatches = dedupeFixtures(fixtures).map((fixture) => {
    const matchGoals = sortGoalsChronologically(goals.filter((goal) => goalBelongsToFixture(goal, fixture)));
    const pointGoals = sortGoalsChronologically(scoredGoals.filter((goal) => goalBelongsToFixture(goal, fixture)));
    const matchParticipants = [
      ...participants.filter((participant) => participantBelongsToFixture(participant, fixture)),
      ...buildPickedFixtureParticipants(fixture, resolvedPicks)
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
      participants: enrichParticipants(matchParticipants, resolvedPicks, rosterSnapshot),
      syncState: buildFixtureSyncStateForMatch(fixture, goals, participants, pickedTeamIds)
    } satisfies MatchRecord;
  });
  const fixtureIds = new Set(fixtureMatches.map((match) => match.matchId));
  const fixtureKeys = new Set(fixtureMatches.map((match) => getMatchRecordKey(match)));

  return [
    ...fixtureMatches,
    ...fallbackMatches.filter((match) => !fixtureIds.has(match.matchId) && !fixtureKeys.has(getMatchRecordKey(match)))
  ]
    .sort((a, b) => {
      const timeA = a.kickedOffAt ? Date.parse(a.kickedOffAt) : Number.MAX_SAFE_INTEGER;
      const timeB = b.kickedOffAt ? Date.parse(b.kickedOffAt) : Number.MAX_SAFE_INTEGER;
      return timeA - timeB || a.label.localeCompare(b.label);
    });
}
