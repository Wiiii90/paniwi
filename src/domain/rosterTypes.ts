export type RosterStatus = "nominated" | "not-nominated" | "unknown";

export type PlayerPosition = "goalkeeper" | "defender" | "midfielder" | "forward";

export type RosterPosition = PlayerPosition | "unknown";

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

export type RosterSnapshot = {
  lastUpdated: string;
  source: "wikipedia";
  pageTitle: string;
  teamCount: number;
  playerCount: number;
  teams: RosterTeam[];
};
