import type { LeaderboardEntry, MatchRecord, ScoredGoal, ScorerEntry, StaticMeta } from "../domain/types";
import type { PickStatusSnapshot } from "../domain/pickStatusTypes";
import type { RosterSnapshot } from "../domain/rosterTypes";

export type StaticData = {
  leaderboard: LeaderboardEntry[];
  goals: ScoredGoal[];
  scorers: ScorerEntry[];
  matches: MatchRecord[];
  meta: StaticMeta;
  rosters: RosterSnapshot;
  pickStatuses: PickStatusSnapshot;
};

export async function loadStaticData(): Promise<StaticData> {
  const baseUrl = import.meta.env.BASE_URL;
  const [leaderboard, goals, scorers, matches, meta, rosters, pickStatuses] = await Promise.all([
    fetch(`${baseUrl}data/leaderboard.json`).then((response) => response.json() as Promise<LeaderboardEntry[]>),
    fetch(`${baseUrl}data/goals.json`).then((response) => response.json() as Promise<ScoredGoal[]>),
    fetch(`${baseUrl}data/scorers.json`).then((response) => response.json() as Promise<ScorerEntry[]>),
    fetch(`${baseUrl}data/matches.json`).then((response) => response.json() as Promise<MatchRecord[]>),
    fetch(`${baseUrl}data/meta.json`).then((response) => response.json() as Promise<StaticMeta>),
    fetch(`${baseUrl}data/rosters.json`).then((response) => response.json() as Promise<RosterSnapshot>),
    fetch(`${baseUrl}data/pick-statuses.json`).then((response) => response.json() as Promise<PickStatusSnapshot>)
  ]);

  return { leaderboard, goals, scorers, matches, meta, rosters, pickStatuses };
}
