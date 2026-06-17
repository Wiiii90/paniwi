import {
  getParticipantPickDisplayName,
  getParticipantPickId,
  getParticipantPickResolvedPlayerId,
  matchesParticipantPickGoal
} from "./participantPick";
import { getTeamDisplayName } from "./teamDisplay";
import { resolveGoalTeamId } from "./teamResolver";
import type { GoalRecord, ScoredGoal } from "./goalTypes";
import type { ParticipantPick } from "./participantTypes";
import type { RosterSnapshot } from "./rosterTypes";

export function getGoalPoints(goal: GoalRecord): number {
  if (goal.detail === "own-goal" || goal.detail === "penalty-shootout") {
    return 0;
  }

  return goal.goals;
}

export function matchesPlayer(goal: GoalRecord, pick: ParticipantPick, rosterSnapshot?: RosterSnapshot): boolean {
  return matchesParticipantPickGoal(goal, pick, rosterSnapshot);
}

export function scoreGoalForPlayer(
  goal: GoalRecord,
  owner: string,
  pick: ParticipantPick,
  rosterSnapshot?: RosterSnapshot
): ScoredGoal | null {
  const goalTeamId = resolveGoalTeamId(goal);
  if (!goalTeamId || !matchesPlayer(goal, pick, rosterSnapshot)) {
    return null;
  }

  const points = getGoalPoints(goal);
  if (points === 0) {
    return null;
  }

  return {
    ...goal,
    playerId: goal.playerId ?? getParticipantPickResolvedPlayerId(pick, rosterSnapshot),
    teamId: goal.teamId ?? goalTeamId,
    pickId: getParticipantPickId(pick),
    owner,
    pickedPlayerName: getParticipantPickDisplayName(pick, rosterSnapshot),
    displayPlayerName: goal.playerId ? goal.playerName : getParticipantPickDisplayName(pick, rosterSnapshot),
    displayNationalTeam: getTeamDisplayName(goalTeamId, goal.nationalTeam),
    points
  };
}
