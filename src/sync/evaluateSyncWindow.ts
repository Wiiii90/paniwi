import type { StaticMeta } from "../domain/types";
import { getActiveSyncWindow, isTournamentDay, syncPolicy } from "./syncSchedule";

export type SyncWindowDecision = {
  shouldRun: boolean;
  reason: string;
  windowId?: string;
};

function minutesBetween(earlier: string, later: Date): number {
  return (later.getTime() - new Date(earlier).getTime()) / (60 * 1000);
}

export function evaluateSyncWindow(meta: StaticMeta | null, now: Date = new Date(), force = false): SyncWindowDecision {
  if (force) {
    return { shouldRun: true, reason: "forced sync" };
  }

  if (!isTournamentDay(now)) {
    return { shouldRun: false, reason: "outside tournament dates" };
  }

  const window = getActiveSyncWindow(now);
  if (!window) {
    return { shouldRun: false, reason: "outside sync window" };
  }

  if (!meta || meta.status === "error") {
    return { shouldRun: true, reason: window.label, windowId: window.id };
  }

  if (meta.syncWindowId === window.id) {
    if (meta.snapshotChanged === false && (meta.windowSyncAttempts ?? 0) >= syncPolicy.maxSyncAttemptsPerWindow) {
      return {
        shouldRun: false,
        reason: `attempt limit reached for ${window.id}`,
        windowId: window.id
      };
    }

    if (meta.lastUpdated) {
      const minutesSinceLastSync = minutesBetween(meta.lastUpdated, now);
      const minGap =
        meta.snapshotChanged === false ? syncPolicy.unchangedFollowUpMinutes : syncPolicy.minMinutesBetweenSyncs;

      if (minutesSinceLastSync < minGap) {
        return {
          shouldRun: false,
          reason: `last sync was ${Math.round(minutesSinceLastSync)} minutes ago`,
          windowId: window.id
        };
      }
    }
  }

  return { shouldRun: true, reason: window.label, windowId: window.id };
}
