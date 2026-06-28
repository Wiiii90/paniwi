import type { SourceName, GoalRecord, ScoredGoal } from "./goalTypes";

export type MatchStatus = "scheduled" | "live" | "finished" | "unknown";

export type MatchParticipationStatus = "starter" | "bench" | "subbed-in" | "subbed-out" | "subbed-in-out" | "unknown";

export type MatchTeam = {
  name: string;
  score?: number;
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
  winnerTeam?: "home" | "away" | "draw";
  homeTeam: ExternalMatchTeam;
  awayTeam: ExternalMatchTeam;
};

export type ExternalMatchParticipantRecord = {
  source: SourceName;
  matchId: string;
  fixtureId?: string;
  playerName: string;
  nationalTeam: string;
  teamId?: string;
  apiPlayerId?: number;
  status: MatchParticipationStatus;
  shirtNumber?: number;
};

export type MatchParticipantRecord = ExternalMatchParticipantRecord & {
  displayPlayerName: string;
  displayNationalTeam: string;
  owners: string[];
  selected: boolean;
};

export type FixtureSyncState = {
  scoreTotal: number | null;
  goalEventCount: number;
  eventsComplete: boolean;
  lineupsComplete: boolean;
  needsEventBackfill: boolean;
  needsLineupBackfill: boolean;
};

export type MatchRecord = {
  matchId: string;
  label: string;
  kickedOffAt?: string;
  status: MatchStatus;
  winnerTeam?: "home" | "away" | "draw";
  homeTeam: MatchTeam;
  awayTeam: MatchTeam;
  goals: GoalRecord[];
  pointGoals: ScoredGoal[];
  affectedOwners: string[];
  participants: MatchParticipantRecord[];
  syncState?: FixtureSyncState;
};
