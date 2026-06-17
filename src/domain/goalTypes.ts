export type GoalDetail = "normal" | "penalty" | "own-goal" | "penalty-shootout";

export type SourceName = "mock" | "api-football" | "football-data" | "wikipedia";

export type GoalTimeConfidence = "exact" | "estimated" | "match-only" | "unknown";

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
