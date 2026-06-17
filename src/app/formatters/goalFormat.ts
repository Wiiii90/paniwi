export function formatGoalMinute(goal: { minute?: number }): string {
  return goal.minute ? `${goal.minute}. Minute` : "Minute offen";
}
