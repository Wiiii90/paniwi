import type { ScoredGoal } from "../domain/types";

export function formatTimeConfidence(confidence: ScoredGoal["timeConfidence"]): string {
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

export function formatGoalMinute(goal: ScoredGoal): string {
  return goal.minute ? `${goal.minute}. Minute` : "Minute offen";
}
