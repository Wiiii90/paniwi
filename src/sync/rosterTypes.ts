import type { RosterStatus } from "../domain/types";

export type RosterPosition = "goalkeeper" | "defender" | "midfielder" | "forward" | "unknown";

export type RosterPlayer = {
  playerName: string;
  normalizedPlayerName: string;
  position: RosterPosition;
  shirtNumber?: number;
  sourceName: string;
};

export type RosterTeam = {
  teamName: string;
  teamId?: string;
  players: RosterPlayer[];
};

export type RosterAuditEntry = {
  owner: string;
  playerId: string;
  playerName: string;
  teamId: string;
  teamName: string;
  currentRosterStatus?: RosterStatus;
  suggestedRosterStatus: RosterStatus;
  matched: boolean;
  matchedName?: string;
  reason: "found-in-roster" | "not-found-in-team-roster" | "team-roster-missing";
};

export type RosterSnapshot = {
  lastUpdated: string;
  source: "wikipedia";
  pageTitle: string;
  teamCount: number;
  playerCount: number;
  teams: RosterTeam[];
  audit: {
    picks: RosterAuditEntry[];
    nominatedCount: number;
    notNominatedCount: number;
    unknownCount: number;
    changedStatusCount: number;
  };
};
