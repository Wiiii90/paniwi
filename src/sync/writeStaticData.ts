import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { GoalRecord, LeaderboardEntry, MatchRecord, ScoredGoal, ScorerEntry, StaticMeta } from "../domain/types";

type StaticPayload = {
  leaderboard: LeaderboardEntry[];
  goals: ScoredGoal[];
  rawGoals: GoalRecord[];
  scorers: ScorerEntry[];
  matches: MatchRecord[];
  meta: StaticMeta;
};

async function writeJson(path: string, value: unknown): Promise<void> {
  const target = resolve(path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeStaticData(payload: StaticPayload): Promise<void> {
  await Promise.all([
    writeJson("public/data/leaderboard.json", payload.leaderboard),
    writeJson("public/data/goals.json", payload.goals),
    writeJson("public/data/meta.json", payload.meta),
    writeJson("public/data/raw-goals.json", payload.rawGoals),
    writeJson("public/data/scorers.json", payload.scorers),
    writeJson("public/data/matches.json", payload.matches)
  ]);
}

export async function writeStaticMeta(meta: StaticMeta): Promise<void> {
  await writeJson("public/data/meta.json", meta);
}
