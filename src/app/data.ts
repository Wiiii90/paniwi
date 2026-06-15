import type { LeaderboardEntry, MatchRecord, ScoredGoal, ScorerEntry, StaticMeta } from "../domain/types";

export type StaticData = {
  leaderboard: LeaderboardEntry[];
  goals: ScoredGoal[];
  scorers: ScorerEntry[];
  matches: MatchRecord[];
  meta: StaticMeta;
};

export async function loadStaticData(): Promise<StaticData> {
  const baseUrl = import.meta.env.BASE_URL;
  const [leaderboard, goals, scorers, matches, meta] = await Promise.all([
    fetch(`${baseUrl}data/leaderboard.json`).then((response) => response.json() as Promise<LeaderboardEntry[]>),
    fetch(`${baseUrl}data/goals.json`).then((response) => response.json() as Promise<ScoredGoal[]>),
    fetch(`${baseUrl}data/scorers.json`).then((response) => response.json() as Promise<ScorerEntry[]>),
    fetch(`${baseUrl}data/matches.json`).then((response) => response.json() as Promise<MatchRecord[]>),
    fetch(`${baseUrl}data/meta.json`).then((response) => response.json() as Promise<StaticMeta>)
  ]);

  return { leaderboard, goals, scorers, matches, meta };
}
