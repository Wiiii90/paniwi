import { resolveKnownTeamId } from "../config/teamCatalog";
import type { GoalRecord, MatchParticipantRecord, MatchRecord } from "./types";

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

export function isActiveMatch(match: MatchRecord, now: Date): boolean {
  if (match.status === "live") {
    return true;
  }

  if (!match.kickedOffAt) {
    return false;
  }

  const kickoffMs = new Date(match.kickedOffAt).getTime();
  if (!Number.isFinite(kickoffMs)) {
    return false;
  }

  const nowMs = now.getTime();
  if (match.status === "scheduled") {
    return nowMs >= kickoffMs - preMatchDisplayWindowMinutes * 60 * 1000 && nowMs < kickoffMs;
  }

  if (match.status === "finished") {
    return nowMs >= kickoffMs && nowMs <= kickoffMs + recentlyFinishedDisplayWindowMinutesAfterKickoff * 60 * 1000;
  }

  return false;
}

export function groupMatchesBySection(matches: MatchRecord[], now: Date): MatchSections {
  const live = matches.filter((match) => isActiveMatch(match, now)).sort(sortByKickoffAscending);
  const activeMatchIds = new Set(live.map((match) => match.matchId));

  return {
    live,
    upcoming: matches
      .filter((match) => match.status === "scheduled" && !activeMatchIds.has(match.matchId))
      .sort(sortByKickoffAscending),
    finished: matches
      .filter((match) => match.status === "finished" && !activeMatchIds.has(match.matchId))
      .sort(sortByKickoffDescending)
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
