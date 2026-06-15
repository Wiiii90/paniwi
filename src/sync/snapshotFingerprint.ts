import { createHash } from "node:crypto";
import type { GoalRecord } from "../domain/types";

export function buildSnapshotFingerprint(rawGoals: GoalRecord[]): string {
  const payload = rawGoals
    .map((goal) =>
      [
        goal.externalGoalId,
        goal.playerName,
        goal.nationalTeam,
        goal.goals,
        goal.matchId ?? "",
        goal.minute ?? "",
        goal.detail
      ].join("|")
    )
    .sort()
    .join("\n");

  return createHash("sha256").update(payload).digest("hex");
}
