import { resolveTeamFromApiFootball, resolveTeamFromWikipedia } from "./teamResolver";
import type { GoalRecord } from "./goalTypes";
import type { ExternalMatchParticipantRecord, ExternalMatchRecord, FixtureSyncState } from "./matchTypes";

function getScoreTotal(match: ExternalMatchRecord): number | null {
  if (typeof match.homeTeam.score !== "number" || typeof match.awayTeam.score !== "number") {
    return null;
  }

  return match.homeTeam.score + match.awayTeam.score;
}

function getMatchTeamIds(match: ExternalMatchRecord): Set<string> {
  return new Set(
    [
      resolveTeamFromApiFootball(match.homeTeam.name) ?? resolveTeamFromWikipedia(match.homeTeam.name),
      resolveTeamFromApiFootball(match.awayTeam.name) ?? resolveTeamFromWikipedia(match.awayTeam.name)
    ]
      .map((team) => team?.teamId)
      .filter((teamId): teamId is string => Boolean(teamId))
  );
}

function isStartedMatch(match: ExternalMatchRecord): boolean {
  return match.status === "live" || match.status === "finished";
}

export function matchHasPickedTeam(match: ExternalMatchRecord, pickedTeamIds: Set<string>): boolean {
  const matchTeamIds = getMatchTeamIds(match);
  return [...matchTeamIds].some((teamId) => pickedTeamIds.has(teamId));
}

export function buildFixtureSyncState(
  match: ExternalMatchRecord,
  goalEventCount: number,
  hasLineups: boolean,
  hasPickedTeam: boolean
): FixtureSyncState {
  const scoreTotal = getScoreTotal(match);
  const eventsComplete = scoreTotal !== null && goalEventCount >= scoreTotal;
  const needsEventBackfill = isStartedMatch(match) && scoreTotal !== null && goalEventCount < scoreTotal;
  const lineupsComplete = !hasPickedTeam || hasLineups;
  const needsLineupBackfill = isStartedMatch(match) && hasPickedTeam && !hasLineups;

  return {
    scoreTotal,
    goalEventCount,
    eventsComplete,
    lineupsComplete,
    needsEventBackfill,
    needsLineupBackfill
  };
}

function countFixtureGoals(goals: Pick<GoalRecord, "fixtureId" | "matchId">[], match: ExternalMatchRecord): number {
  return goals.filter((goal) => {
    if (match.fixtureId && goal.fixtureId === match.fixtureId) {
      return true;
    }

    return goal.matchId === match.matchId;
  }).length;
}

function fixtureHasLineups(participants: ExternalMatchParticipantRecord[], match: ExternalMatchRecord): boolean {
  return participants.some((participant) => {
    const belongsToFixture = match.fixtureId
      ? participant.fixtureId === match.fixtureId || participant.matchId === match.matchId
      : participant.matchId === match.matchId;
    const isLineupStatus = participant.status === "starter" || participant.status === "bench";
    return belongsToFixture && isLineupStatus;
  });
}

export function buildFixtureSyncStateForMatch(
  match: ExternalMatchRecord,
  goals: Pick<GoalRecord, "fixtureId" | "matchId">[],
  participants: ExternalMatchParticipantRecord[],
  pickedTeamIds: Set<string>
): FixtureSyncState {
  return buildFixtureSyncState(
    match,
    countFixtureGoals(goals, match),
    fixtureHasLineups(participants, match),
    matchHasPickedTeam(match, pickedTeamIds)
  );
}
