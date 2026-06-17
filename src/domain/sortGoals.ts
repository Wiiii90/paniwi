import type { GoalRecord } from "./goalTypes";

const minuteInMs = 60 * 1000;

function toTimestamp(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

export function getGoalSortTimestamp(goal: GoalRecord): number {
  const scoredAt = toTimestamp(goal.scoredAt);
  if (scoredAt !== null) {
    return scoredAt;
  }

  const kickedOffAt = toTimestamp(goal.kickedOffAt);
  if (kickedOffAt !== null && typeof goal.minute === "number") {
    return kickedOffAt + goal.minute * minuteInMs;
  }

  if (kickedOffAt !== null) {
    return kickedOffAt;
  }

  return Number.MAX_SAFE_INTEGER;
}

export function sortGoalsChronologically<T extends GoalRecord>(goals: T[]): T[] {
  return [...goals].sort((a, b) => {
    const timestampDiff = getGoalSortTimestamp(a) - getGoalSortTimestamp(b);
    if (timestampDiff !== 0) {
      return timestampDiff;
    }

    return (
      (a.matchLabel ?? "").localeCompare(b.matchLabel ?? "") ||
      (a.minute ?? 999).toString().localeCompare((b.minute ?? 999).toString()) ||
      a.playerName.localeCompare(b.playerName)
    );
  });
}
