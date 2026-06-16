import { buildPlayerId } from "./playerId";
import { findUniqueRosterPlayer } from "./rosterNameMatcher";
import { normalizePlayerName } from "./normalizePlayerName";
import { resolveGoalTeamId } from "./teamResolver";
import type { GoalRecord, ParticipantPick } from "./types";
import type { PlayerPosition, RosterPlayer, RosterSnapshot } from "./rosterTypes";

function getRosterTeam(snapshot: RosterSnapshot | undefined, teamId: string) {
  return snapshot?.teams.find((team) => team.teamId === teamId) ?? null;
}

export function getParticipantPickId(pick: ParticipantPick): string {
  return buildPlayerId(pick.teamId, pick.playerName);
}

export function getParticipantPickCandidateNames(pick: ParticipantPick): string[] {
  return [pick.playerName, ...(pick.aliases ?? [])];
}

export function resolveParticipantPickRosterPlayer(
  pick: ParticipantPick,
  rosterSnapshot: RosterSnapshot | undefined
): RosterPlayer | null {
  const rosterTeam = getRosterTeam(rosterSnapshot, pick.teamId);
  if (!rosterTeam) {
    return null;
  }

  return findUniqueRosterPlayer(rosterTeam.players, getParticipantPickCandidateNames(pick));
}

export function getParticipantPickResolvedPlayerId(
  pick: ParticipantPick,
  rosterSnapshot: RosterSnapshot | undefined
): string {
  const rosterPlayer = resolveParticipantPickRosterPlayer(pick, rosterSnapshot);
  return buildPlayerId(pick.teamId, rosterPlayer?.playerName ?? pick.playerName);
}

export function getParticipantPickDisplayName(
  pick: ParticipantPick,
  rosterSnapshot: RosterSnapshot | undefined
): string {
  return resolveParticipantPickRosterPlayer(pick, rosterSnapshot)?.playerName ?? pick.playerName;
}

export function getParticipantPickPosition(
  pick: ParticipantPick,
  rosterSnapshot: RosterSnapshot | undefined
): PlayerPosition | undefined {
  const rosterPosition = resolveParticipantPickRosterPlayer(pick, rosterSnapshot)?.position;
  if (rosterPosition && rosterPosition !== "unknown") {
    return rosterPosition;
  }

  return pick.position;
}

export function matchesParticipantPickGoal(
  goal: GoalRecord,
  pick: ParticipantPick,
  rosterSnapshot: RosterSnapshot | undefined
): boolean {
  const goalTeamId = resolveGoalTeamId(goal);
  if (goalTeamId !== pick.teamId) {
    return false;
  }

  const resolvedPlayerId = getParticipantPickResolvedPlayerId(pick, rosterSnapshot);
  if (goal.playerId) {
    return goal.playerId === resolvedPlayerId;
  }

  const candidateNames = new Set(
    [...getParticipantPickCandidateNames(pick), getParticipantPickDisplayName(pick, rosterSnapshot)]
      .map(normalizePlayerName)
      .filter(Boolean)
  );

  return candidateNames.has(normalizePlayerName(goal.playerName));
}
