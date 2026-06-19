import { resolveKnownTeamId } from "../config/teamCatalog";
import type { GoalRecord } from "./goalTypes";
import type { MatchParticipantRecord, MatchRecord } from "./matchTypes";

export type MatchSide = "home" | "away" | "unknown";
export type MatchSectionKey = "live" | "upcoming" | "finished";
export type MatchSections = Record<MatchSectionKey, MatchRecord[]>;

const preMatchDisplayWindowMinutes = 60;
const recentlyFinishedDisplayWindowMinutesAfterKickoff = 240;

function sortByKickoffAscending(left: MatchRecord, right: MatchRecord): number {
  return new Date(left.kickedOffAt ?? "9999-12-31").getTime() - new Date(right.kickedOffAt ?? "9999-12-31").getTime();
}

function sortByKickoffDescending(left: MatchRecord, right: MatchRecord): number {
  return new Date(right.kickedOffAt ?? "0001-01-01").getTime() - new Date(left.kickedOffAt ?? "0001-01-01").getTime();
}

function getKickoffTime(match: MatchRecord): number | null {
  if (!match.kickedOffAt) {
    return null;
  }

  const kickoffMs = new Date(match.kickedOffAt).getTime();
  return Number.isFinite(kickoffMs) ? kickoffMs : null;
}

export function isWarmupMatch(match: MatchRecord, now: Date): boolean {
  const kickoffMs = getKickoffTime(match);
  return match.status === "scheduled" && kickoffMs !== null && now.getTime() >= kickoffMs - preMatchDisplayWindowMinutes * 60 * 1000;
}

export function isCooldownMatch(match: MatchRecord, now: Date): boolean {
  const kickoffMs = getKickoffTime(match);
  return (
    match.status === "finished" &&
    kickoffMs !== null &&
    now.getTime() >= kickoffMs &&
    now.getTime() <= kickoffMs + recentlyFinishedDisplayWindowMinutesAfterKickoff * 60 * 1000
  );
}

export function isActiveMatch(match: MatchRecord, now: Date): boolean {
  return match.status === "live" || isWarmupMatch(match, now) || isCooldownMatch(match, now);
}

function sortUpcomingMatches(now: Date): (left: MatchRecord, right: MatchRecord) => number {
  return (left, right) => Number(isWarmupMatch(right, now)) - Number(isWarmupMatch(left, now)) || sortByKickoffAscending(left, right);
}

function sortFinishedMatches(now: Date): (left: MatchRecord, right: MatchRecord) => number {
  return (left, right) => Number(isCooldownMatch(right, now)) - Number(isCooldownMatch(left, now)) || sortByKickoffDescending(left, right);
}

export function groupMatchesBySection(matches: MatchRecord[], now: Date): MatchSections {
  return {
    live: matches.filter((match) => match.status === "live").sort(sortByKickoffAscending),
    upcoming: matches.filter((match) => match.status === "scheduled").sort(sortUpcomingMatches(now)),
    finished: matches.filter((match) => match.status === "finished").sort(sortFinishedMatches(now))
  };
}

export function getMatchSide(match: MatchRecord, teamName: string | undefined, teamId?: string): MatchSide {
  const resolvedTeamId = teamId ?? (teamName ? resolveKnownTeamId(teamName) : null);
  if (!resolvedTeamId) {
    return "unknown";
  }

  if (resolvedTeamId === resolveKnownTeamId(match.homeTeam.name)) {
    return "home";
  }

  if (resolvedTeamId === resolveKnownTeamId(match.awayTeam.name)) {
    return "away";
  }

  return "unknown";
}

function getOppositeSide(side: MatchSide): MatchSide {
  if (side === "home") {
    return "away";
  }

  if (side === "away") {
    return "home";
  }

  return "unknown";
}

function getGoalDisplaySide(match: MatchRecord, goal: GoalRecord): MatchSide {
  if (goal.detail !== "own-goal") {
    return getMatchSide(match, goal.nationalTeam, goal.teamId);
  }

  const sourceTeamSide = getMatchSide(match, goal.sourceTeamName, undefined);
  const scorerSide = getMatchSide(match, goal.nationalTeam, goal.teamId);
  if (sourceTeamSide !== "unknown" && sourceTeamSide !== scorerSide) {
    return sourceTeamSide;
  }

  return getOppositeSide(scorerSide);
}

export function groupGoalsBySide(match: MatchRecord): Record<MatchSide, GoalRecord[]> {
  return groupBySide(match.goals, (goal) => getGoalDisplaySide(match, goal));
}

function getGoalEventOrder(goal: GoalRecord): number {
  if (goal.source !== "api-football") {
    return Number.MAX_SAFE_INTEGER;
  }

  const eventOrder = goal.externalGoalId.match(/:(\d+)$/)?.[1];
  return eventOrder ? Number(eventOrder) : Number.MAX_SAFE_INTEGER;
}

function sortMatchGoalsForRunningScore(goals: GoalRecord[]): GoalRecord[] {
  return [...goals].sort((left, right) => {
    const minuteDiff = (left.minute ?? 999) - (right.minute ?? 999);
    if (minuteDiff !== 0) {
      return minuteDiff;
    }

    const orderDiff = getGoalEventOrder(left) - getGoalEventOrder(right);
    if (orderDiff !== 0) {
      return orderDiff;
    }

    return left.externalGoalId.localeCompare(right.externalGoalId);
  });
}

export function buildRunningGoalScores(match: MatchRecord): Map<string, string> {
  const scores = new Map<string, string>();
  let homeScore = 0;
  let awayScore = 0;

  for (const goal of sortMatchGoalsForRunningScore(match.goals)) {
    const side = getGoalDisplaySide(match, goal);
    if (side === "home") {
      homeScore += 1;
    } else if (side === "away") {
      awayScore += 1;
    }

    if (side !== "unknown") {
      scores.set(goal.externalGoalId, `${homeScore}:${awayScore}`);
    }
  }

  return scores;
}

export function groupSelectedParticipantsBySide(match: MatchRecord): Record<MatchSide, MatchParticipantRecord[]> {
  return groupBySide(
    match.participants.filter((participant) => participant.selected),
    (participant) => getMatchSide(match, participant.nationalTeam, participant.teamId)
  );
}

function groupBySide<Value>(values: Value[], getSide: (value: Value) => MatchSide): Record<MatchSide, Value[]> {
  return values.reduce<Record<MatchSide, Value[]>>(
    (groups, value) => {
      groups[getSide(value)].push(value);
      return groups;
    },
    { home: [], away: [], unknown: [] }
  );
}
