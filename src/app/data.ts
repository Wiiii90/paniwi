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

const staticDataFiles = {
  leaderboard: "leaderboard.json",
  goals: "goals.json",
  scorers: "scorers.json",
  matches: "matches.json",
  meta: "meta.json",
  rosters: "rosters.json",
  pickStatuses: "pick-statuses.json"
} satisfies Record<keyof StaticData, string>;

async function fetchStaticDataFile<Key extends keyof StaticData>(key: Key): Promise<StaticData[Key]> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/${staticDataFiles[key]}`);
  if (!response.ok) {
    throw new Error(`${staticDataFiles[key]} konnte nicht geladen werden (${response.status})`);
  }

  return response.json() as Promise<StaticData[Key]>;
}

export async function loadStaticData(): Promise<StaticData> {
  const [leaderboard, goals, scorers, matches, meta, rosters, pickStatuses] = await Promise.all([
    fetchStaticDataFile("leaderboard"),
    fetchStaticDataFile("goals"),
    fetchStaticDataFile("scorers"),
    fetchStaticDataFile("matches"),
    fetchStaticDataFile("meta"),
    fetchStaticDataFile("rosters"),
    fetchStaticDataFile("pickStatuses")
  ]);

  return { leaderboard, goals, scorers, matches, meta, rosters, pickStatuses };
}
