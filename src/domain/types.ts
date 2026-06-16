import type { PlayerPosition } from "./rosterTypes";

export type GoalDetail = "normal" | "penalty" | "own-goal" | "penalty-shootout";

export type SourceName = "mock" | "api-football" | "wikipedia";

export type GoalTimeConfidence = "exact" | "estimated" | "match-only" | "unknown";

export type ParticipantPick = {
  playerName: string;
  teamId: string;
  position?: PlayerPosition;
  aliases?: string[];
};

export type ParticipantTeam = {
  owner: string;
  color?: string;
  players: ParticipantPick[];
};

export type ExternalGoalRecord = {
  externalGoalId?: string;
  playerName: string;
  nationalTeam: string;
  goals?: number;
  source: SourceName;
  apiPlayerId?: number;
  matchId?: string;
  fixtureId?: string;
  matchLabel?: string;
  kickedOffAt?: string;
  minute?: number;
  scoredAt?: string;
  timeConfidence?: GoalTimeConfidence;
  detail?: GoalDetail;
};

export type ExternalMatchTeam = {
  id?: number;
  name: string;
  score?: number;
};

export type ExternalMatchRecord = {
  matchId: string;
  fixtureId?: string;
  source: SourceName;
  label: string;
  kickedOffAt?: string;
  status: MatchStatus;
  homeTeam: ExternalMatchTeam;
  awayTeam: ExternalMatchTeam;
};

export type GoalRecord = Required<Pick<ExternalGoalRecord, "playerName" | "nationalTeam" | "source">> & {
  externalGoalId: string;
  goals: number;
  playerId?: string;
  teamId?: string;
  sourcePlayerName?: string;
  sourceTeamName?: string;
  apiPlayerId?: number;
  matchId?: string;
  fixtureId?: string;
  matchLabel?: string;
  kickedOffAt?: string;
  minute?: number;
  scoredAt?: string;
  timeConfidence: GoalTimeConfidence;
  detail: GoalDetail;
};

export type ScoredGoal = GoalRecord & {
  playerId: string;
  pickId: string;
  teamId: string;
  owner: string;
  pickedPlayerName: string;
  displayPlayerName: string;
  displayNationalTeam: string;
  points: number;
};

export type PlayerScore = {
  pickId: string;
  name: string;
  nationalTeam: string;
  position?: PlayerPosition;
  goals: number;
  points: number;
};

export type LeaderboardEntry = {
  rank: number;
  owner: string;
  points: number;
  goals: number;
  playersWithGoals: number;
};

export type ScorerEntry = {
  rank: number;
  playerName: string;
  normalizedPlayerName: string;
  nationalTeam: string;
  goals: number;
  penaltyGoals: number;
  scoringOwners: string[];
  selected: boolean;
};

export type MatchStatus = "scheduled" | "live" | "finished" | "unknown";

export type MatchTeam = {
  name: string;
  score?: number;
};

export type MatchRecord = {
  matchId: string;
  label: string;
  kickedOffAt?: string;
  status: MatchStatus;
  homeTeam: MatchTeam;
  awayTeam: MatchTeam;
  goals: GoalRecord[];
  pointGoals: ScoredGoal[];
  affectedOwners: string[];
};

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
  sourceRequestCount?: number;
  sourceRequestLimit?: number;
};
