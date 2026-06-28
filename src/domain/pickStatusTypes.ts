import type { RosterStatus } from "./rosterTypes";
import type { PlayerPosition } from "./rosterTypes";
import type { TeamTournamentStatus, TeamTournamentStatusReason } from "./tournamentStatus";

export type PickDisplayStatus = "nominated" | "not-nominated" | "late-callup" | "unknown";

export type PickStatusReason =
  | "found-in-current-roster"
  | "not-found-in-current-team-roster"
  | "team-roster-missing"
  | "late-callup";

export type PickStatusEntry = {
  owner: string;
  pickId: string;
  playerName: string;
  teamId: string;
  teamName: string;
  position?: PlayerPosition;
  baselineRosterStatus: RosterStatus;
  currentRosterStatus: RosterStatus;
  displayStatus: PickDisplayStatus;
  tournamentStatus: TeamTournamentStatus;
  tournamentStatusReason: TeamTournamentStatusReason;
  matchedCurrentRoster: boolean;
  matchedCurrentRosterName?: string;
  reason: PickStatusReason;
};

export type PickStatusSnapshot = {
  lastUpdated: string;
  rosterSnapshotUpdatedAt?: string;
  picks: PickStatusEntry[];
  summary: {
    nominatedCount: number;
    notNominatedCount: number;
    lateCallupCount: number;
    unknownCount: number;
    activeCount: number;
    eliminatedCount: number;
    tournamentUnknownCount: number;
  };
};
