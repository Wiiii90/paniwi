import type { GoalRecord } from "./goalTypes";
export const competitionScorerAggregateMatchId = "football-data:scorers";

export function isCompetitionScorerAggregateGoal(goal: Pick<GoalRecord, "source" | "matchId">): boolean {
  return goal.source === "football-data" && goal.matchId === competitionScorerAggregateMatchId;
}

export function selectEffectiveGoalsForScoring(goals: GoalRecord[]): GoalRecord[] {
  return goals.filter((goal) => goal.source === "api-football" || goal.source === "mock");
}
