import type { PlayerPosition } from "./rosterTypes";

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
