import type { GoalRecord } from "../domain/types";
import { normalizePlayerName } from "../domain/normalizePlayerName";

export type GoalValidationResult = {
  validGoals: GoalRecord[];
  skippedGoals: Array<{
    goal: GoalRecord;
    reason: string;
  }>;
};

function isValidIsoDate(value: string | undefined): boolean {
  return !value || !Number.isNaN(Date.parse(value));
}

function getDedupeKey(goal: GoalRecord): string {
  if (goal.externalGoalId) {
    return `${goal.source}:${goal.externalGoalId}`;
  }

  return [
    goal.source,
    goal.matchId ?? goal.fixtureId ?? goal.matchLabel ?? "unknown-match",
    normalizePlayerName(goal.playerName),
    goal.minute ?? "unknown-minute",
    goal.detail
  ].join(":");
}

export function validateGoals(goals: GoalRecord[]): GoalValidationResult {
  const seen = new Set<string>();
  const validGoals: GoalRecord[] = [];
  const skippedGoals: GoalValidationResult["skippedGoals"] = [];

  for (const goal of goals) {
    const reason = getInvalidReason(goal);
    if (reason) {
      skippedGoals.push({ goal, reason });
      continue;
    }

    const dedupeKey = getDedupeKey(goal);
    if (seen.has(dedupeKey)) {
      skippedGoals.push({ goal, reason: "duplicate-goal" });
      continue;
    }

    seen.add(dedupeKey);
    validGoals.push(goal);
  }

  return { validGoals, skippedGoals };
}

function getInvalidReason(goal: GoalRecord): string | null {
  if (!goal.playerName.trim()) {
    return "missing-player-name";
  }

  if (!goal.nationalTeam.trim()) {
    return "missing-national-team";
  }

  if (!Number.isInteger(goal.goals) || goal.goals < 1) {
    return "invalid-goal-count";
  }

  if (goal.minute !== undefined && (!Number.isInteger(goal.minute) || goal.minute < 0 || goal.minute > 130)) {
    return "invalid-minute";
  }

  if (!isValidIsoDate(goal.scoredAt)) {
    return "invalid-scored-at";
  }

  if (!isValidIsoDate(goal.kickedOffAt)) {
    return "invalid-kicked-off-at";
  }

  return null;
}
