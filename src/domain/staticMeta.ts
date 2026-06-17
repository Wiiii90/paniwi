import type { SourceName } from "./goalTypes";

export type StaticMeta = {
  lastUpdated: string;
  source: SourceName;
  attemptedSources?: SourceName[];
  fallbackUsed: boolean;
  status: "ok" | "error";
  goalCount?: number;
  scoredGoalCount?: number;
  skippedGoalCount?: number;
  duplicateGoalCount?: number;
  sourceErrors?: string[];
  message?: string;
  snapshotFingerprint?: string;
  snapshotChanged?: boolean;
  syncWindowId?: string;
  windowSyncAttempts?: number;
  liveMatchCount?: number;
  sourceRequestCount?: number;
  sourceRequestLimit?: number;
};

