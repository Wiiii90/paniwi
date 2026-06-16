import type { StaticMeta } from "../domain/types";
import { getActiveSyncWindow, isTournamentDay, syncPolicy, type SyncWindow } from "./syncSchedule";

export type SyncWindowDecision = {
  shouldRun: boolean;
  reason: string;
  windowId?: string;
  windowPhase?: SyncWindow["phase"] | "forced";
  windowFrom?: string;
  windowUntil?: string;
};

function minutesBetween(earlier: string, later: Date): number {
  return (later.getTime() - new Date(earlier).getTime()) / (60 * 1000);
}

export function evaluateSyncWindow(
  meta: StaticMeta | null,
  now: Date = new Date(),
  force = false,
  activeWindow: SyncWindow | null = getActiveSyncWindow(now)
): SyncWindowDecision {
  if (force) {
    return { shouldRun: true, reason: "forced sync", windowPhase: "forced" };
  }

  if (!isTournamentDay(now)) {
    return { shouldRun: false, reason: "outside tournament dates" };
  }

  const window = activeWindow;
  if (!window) {
    return { shouldRun: false, reason: "outside active sync window" };
  }

  if (!meta || meta.status === "error") {
    return {
      shouldRun: true,
      reason: window.label,
      windowId: window.id,
      windowPhase: window.phase,
      windowFrom: window.from,
      windowUntil: window.until
    };
  }

  if (meta.syncWindowId === window.id) {
    if (
      window.phase === "post-match" &&
      meta.snapshotChanged === false &&
      (meta.windowSyncAttempts ?? 0) >= syncPolicy.maxSyncAttemptsPerWindow
    ) {
      return {
        shouldRun: false,
        reason: `attempt limit reached for ${window.id}`,
        windowId: window.id
      };
    }

    if (meta.lastUpdated) {
      const minutesSinceLastSync = minutesBetween(meta.lastUpdated, now);
      const phaseMinGap =
        window.phase === "live"
          ? syncPolicy.liveMinMinutesBetweenSyncs
          : window.phase === "pre-match"
            ? syncPolicy.preMatchMinMinutesBetweenSyncs
            : syncPolicy.postMatchMinMinutesBetweenSyncs;
      const minGap = window.phase === "live" ? phaseMinGap : meta.snapshotChanged === false ? syncPolicy.unchangedFollowUpMinutes : phaseMinGap;

      if (minutesSinceLastSync < minGap) {
        return {
          shouldRun: false,
          reason: `last sync was ${Math.round(minutesSinceLastSync)} minutes ago`,
          windowId: window.id,
          windowPhase: window.phase,
          windowFrom: window.from,
          windowUntil: window.until
        };
      }
    }
  }

  return {
    shouldRun: true,
    reason: window.label,
    windowId: window.id,
    windowPhase: window.phase,
    windowFrom: window.from,
    windowUntil: window.until
  };
}
