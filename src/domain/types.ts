export type {
  ExternalGoalRecord,
  GoalDetail,
  GoalRecord,
  GoalTimeConfidence,
  ScoredGoal,
  ScorerEntry,
  SourceName
} from "./goalTypes";
export type {
  ExternalMatchParticipantRecord,
  ExternalMatchRecord,
  ExternalMatchTeam,
  FixtureSyncState,
  MatchParticipantRecord,
  MatchParticipationStatus,
  MatchRecord,
  MatchStatus,
  MatchTeam
} from "./matchTypes";
export type { LeaderboardEntry, ParticipantPick, ParticipantTeam, PlayerScore } from "./participantTypes";

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
