export function formatGoalMinute(goal: { minute?: number }): string {
  return goal.minute ? `${goal.minute}. Minute` : "Minute offen";
}

export function formatCompactGoalMinute(goal: { minute?: number }): string {
  return goal.minute ? `${goal.minute}'` : "offen";
}
