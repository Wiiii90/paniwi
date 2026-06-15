import type { LeaderboardEntry, ScoredGoal, StaticMeta } from "../domain/types";

export type StaticData = {
  leaderboard: LeaderboardEntry[];
  goals: ScoredGoal[];
  meta: StaticMeta;
};

export async function loadStaticData(): Promise<StaticData> {
  const baseUrl = import.meta.env.BASE_URL;
  const [leaderboard, goals, meta] = await Promise.all([
    fetch(`${baseUrl}data/leaderboard.json`).then((response) => response.json() as Promise<LeaderboardEntry[]>),
    fetch(`${baseUrl}data/goals.json`).then((response) => response.json() as Promise<ScoredGoal[]>),
    fetch(`${baseUrl}data/meta.json`).then((response) => response.json() as Promise<StaticMeta>)
  ]);

  return { leaderboard, goals, meta };
}
