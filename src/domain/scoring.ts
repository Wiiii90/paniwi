import type { GoalRecord, PlayerPick, ScoredGoal } from "./types";
import { normalizePlayerName } from "./normalizePlayerName";

export function getGoalPoints(goal: GoalRecord): number {
  if (goal.detail === "own-goal" || goal.detail === "penalty-shootout") {
    return 0;
  }

  return goal.goals;
}

export function matchesPlayer(goal: GoalRecord, player: PlayerPick): boolean {
  if (goal.apiPlayerId && player.apiPlayerId && goal.apiPlayerId === player.apiPlayerId) {
    return true;
  }

  const goalName = normalizePlayerName(goal.playerName);
  const names = [player.name, ...(player.aliases ?? [])].map(normalizePlayerName);
  return names.includes(goalName);
}

export function scoreGoalForPlayer(goal: GoalRecord, owner: string, player: PlayerPick): ScoredGoal | null {
  if (!matchesPlayer(goal, player)) {
    return null;
  }

  const points = getGoalPoints(goal);
  if (points === 0) {
    return null;
  }

  return {
    ...goal,
    owner,
    pickedPlayerName: player.name,
    points
  };
}
