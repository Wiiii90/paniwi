import { canonicalPlayers, canonicalTeams } from "../config/canonical";
import { normalizePlayerName } from "./normalizePlayerName";
import type { CanonicalPlayer, CanonicalTeam, GoalRecord, ParticipantPick } from "./types";

function getNameKeys(name: string, aliases: string[] = []): string[] {
  return [name, ...aliases].map(normalizePlayerName);
}

export function getCanonicalTeam(teamId: string): CanonicalTeam | null {
  return canonicalTeams.find((team) => team.teamId === teamId) ?? null;
}

export function getCanonicalPlayer(playerId: string): CanonicalPlayer | null {
  return canonicalPlayers.find((player) => player.playerId === playerId) ?? null;
}

export function getPickPlayer(pick: ParticipantPick): CanonicalPlayer {
  const player = getCanonicalPlayer(pick.playerId);
  if (!player) {
    throw new Error(`Unknown canonical playerId in participant pick: ${pick.playerId}`);
  }
  return player;
}

export function resolveTeamFromApiFootball(teamName: string, apiFootballTeamId?: number): CanonicalTeam | null {
  return (
    (canonicalTeams as CanonicalTeam[]).find((team) => team.apiFootballTeamId !== undefined && team.apiFootballTeamId === apiFootballTeamId) ??
    canonicalTeams.find((team) => getNameKeys(team.displayName, team.aliases).includes(normalizePlayerName(teamName))) ??
    null
  );
}

export function resolveTeamFromWikipedia(teamName: string): CanonicalTeam | null {
  return canonicalTeams.find((team) => getNameKeys(team.displayName, team.aliases).includes(normalizePlayerName(teamName))) ?? null;
}

export function resolvePlayerFromApiFootball(goal: Pick<GoalRecord, "playerName" | "nationalTeam" | "apiPlayerId">): CanonicalPlayer | null {
  if (goal.apiPlayerId !== undefined) {
    const idMatch = canonicalPlayers.find((player) => player.apiFootballPlayerId === goal.apiPlayerId);
    if (idMatch) {
      return idMatch;
    }
  }

  const team = resolveTeamFromApiFootball(goal.nationalTeam);
  if (!team) {
    return null;
  }

  const goalName = normalizePlayerName(goal.playerName);
  return (
    canonicalPlayers.find(
      (player) => player.teamId === team.teamId && getNameKeys(player.displayName, player.aliases).includes(goalName)
    ) ?? null
  );
}

export function resolvePlayerFromWikipedia(goal: Pick<GoalRecord, "playerName" | "nationalTeam">): CanonicalPlayer | null {
  const team = resolveTeamFromWikipedia(goal.nationalTeam);
  if (!team) {
    return null;
  }

  const goalName = normalizePlayerName(goal.playerName);
  return (
    canonicalPlayers.find(
      (player) => player.teamId === team.teamId && getNameKeys(player.displayName, player.aliases).includes(goalName)
    ) ?? null
  );
}

export function resolveGoalPlayer(goal: GoalRecord): CanonicalPlayer | null {
  if (goal.source === "api-football") {
    return resolvePlayerFromApiFootball(goal);
  }

  if (goal.source === "wikipedia") {
    return resolvePlayerFromWikipedia(goal);
  }

  return resolvePlayerFromWikipedia(goal) ?? resolvePlayerFromApiFootball(goal);
}
