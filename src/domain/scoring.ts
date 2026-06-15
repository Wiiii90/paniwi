import { getCanonicalPlayer, getCanonicalTeam, resolveGoalPlayer } from "./canonicalResolver";
import { getTeamDisplayName } from "./teamDisplay";
import type { GoalRecord, ParticipantPick, ScoredGoal } from "./types";

export function getGoalPoints(goal: GoalRecord): number {
  if (goal.detail === "own-goal" || goal.detail === "penalty-shootout") {
    return 0;
  }

  return goal.goals;
}

export function matchesPlayer(goal: GoalRecord, pick: ParticipantPick): boolean {
  return resolveGoalPlayer(goal)?.playerId === pick.playerId;
}

export function scoreGoalForPlayer(goal: GoalRecord, owner: string, pick: ParticipantPick): ScoredGoal | null {
  const player = getCanonicalPlayer(pick.playerId);
  const team = player ? getCanonicalTeam(player.teamId) : null;
  if (!player || !matchesPlayer(goal, pick)) {
    return null;
  }

  const points = getGoalPoints(goal);
  if (points === 0) {
    return null;
  }

  return {
    ...goal,
    playerId: player.playerId,
    teamId: player.teamId,
    owner,
    pickedPlayerName: player.displayName,
    displayPlayerName: player.displayName,
    displayNationalTeam: team ? getTeamDisplayName(team) : goal.nationalTeam,
    points
  };
}
