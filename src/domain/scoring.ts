import type { GoalRecord, PlayerPick, ScoredGoal } from "./types";
import { normalizePlayerName } from "./normalizePlayerName";

export function getGoalPoints(goal: GoalRecord): number {
  if (goal.detail === "own-goal" || goal.detail === "penalty-shootout") {
    return 0;
  }

  return goal.goals;
}

function matchesAbbreviatedName(goalName: string, playerName: string): boolean {
  const goalParts = normalizePlayerName(goalName).split(" ");
  const playerParts = normalizePlayerName(playerName).split(" ");

  if (goalParts.length !== 2 || playerParts.length < 2) {
    return false;
  }

  const [goalInitial, goalLastName] = goalParts;
  const playerFirstName = playerParts[0];
  const playerLastName = playerParts[playerParts.length - 1];

  return goalInitial.length === 1 && goalInitial === playerFirstName[0] && goalLastName === playerLastName;
}

export function matchesPlayer(goal: GoalRecord, player: PlayerPick): boolean {
  if (goal.apiPlayerId && player.apiPlayerId && goal.apiPlayerId === player.apiPlayerId) {
    return true;
  }

  const goalName = normalizePlayerName(goal.playerName);
  const names = [player.name, ...(player.aliases ?? [])];
  const nationalTeamsMatch = normalizePlayerName(goal.nationalTeam) === normalizePlayerName(player.nationalTeam);
  return (
    names.map(normalizePlayerName).includes(goalName) ||
    (nationalTeamsMatch && names.some((name) => matchesAbbreviatedName(goal.playerName, name)))
  );
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
