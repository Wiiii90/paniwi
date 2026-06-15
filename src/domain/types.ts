export type GoalDetail = "normal" | "penalty" | "own-goal" | "penalty-shootout";

export type SourceName = "mock" | "api-football" | "wikipedia";

export type GoalTimeConfidence = "exact" | "estimated" | "match-only" | "unknown";

export type PlayerPick = {
  name: string;
  nationalTeam: string;
  apiPlayerId?: number;
  aliases?: string[];
};

export type ParticipantTeam = {
  owner: string;
  color?: string;
  players: PlayerPick[];
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

export type GoalRecord = Required<Pick<ExternalGoalRecord, "playerName" | "nationalTeam" | "source">> & {
  externalGoalId: string;
  goals: number;
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
  owner: string;
  pickedPlayerName: string;
  points: number;
};

export type PlayerScore = {
  name: string;
  nationalTeam: string;
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
};
