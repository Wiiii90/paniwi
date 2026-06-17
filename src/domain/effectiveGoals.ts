import type { GoalRecord } from "./goalTypes";
import { normalizePlayerName } from "./normalizePlayerName";
import { getGoalPoints } from "./scoring";

export const competitionScorerAggregateMatchId = "football-data:scorers";

export function isCompetitionScorerAggregateGoal(goal: Pick<GoalRecord, "source" | "matchId">): boolean {
  return goal.source === "football-data" && goal.matchId === competitionScorerAggregateMatchId;
}

function getScorerKey(goal: GoalRecord): string {
  return [
    goal.teamId ?? normalizePlayerName(goal.nationalTeam),
    goal.playerId ?? normalizePlayerName(goal.playerName)
  ].join("|");
}

function sumGoalPoints(goals: GoalRecord[]): number {
  return goals.reduce((sum, goal) => sum + getGoalPoints(goal), 0);
}

export function selectEffectiveGoalsForScoring(goals: GoalRecord[]): GoalRecord[] {
  const aggregatesByScorer = new Map<string, GoalRecord[]>();
  const detailedByScorer = new Map<string, GoalRecord[]>();

  for (const goal of goals) {
    const key = getScorerKey(goal);
    const target = isCompetitionScorerAggregateGoal(goal) ? aggregatesByScorer : detailedByScorer;
    target.set(key, [...(target.get(key) ?? []), goal]);
  }

  if (aggregatesByScorer.size === 0) {
    return goals;
  }

  const effectiveGoals: GoalRecord[] = [];

  for (const [key, aggregateGoals] of aggregatesByScorer) {
    const detailedGoals = detailedByScorer.get(key) ?? [];
    if (detailedGoals.length > 0 && sumGoalPoints(detailedGoals) >= sumGoalPoints(aggregateGoals)) {
      effectiveGoals.push(...detailedGoals);
    } else {
      effectiveGoals.push(...aggregateGoals);
    }
  }

  for (const [key, detailedGoals] of detailedByScorer) {
    if (!aggregatesByScorer.has(key)) {
      effectiveGoals.push(...detailedGoals);
    }
  }

  return effectiveGoals;
}
