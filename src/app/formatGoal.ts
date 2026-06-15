import type { GoalRecord } from "../domain/types";

export function formatTimeConfidence(confidence: GoalRecord["timeConfidence"]): string {
  if (confidence === "exact") {
    return "exakt";
  }

  if (confidence === "estimated") {
    return "geschaetzt";
  }

  if (confidence === "match-only") {
    return "nur Spielzeit";
  }

  return "Zeit offen";
}

export function formatGoalMinute(goal: Pick<GoalRecord, "minute">): string {
  return goal.minute ? `${goal.minute}. Minute` : "Minute offen";
}
