import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { GoalRecord, ScoredGoal, ScorerEntry } from "../domain/goalTypes";
import type { ExternalMatchParticipantRecord, ExternalMatchRecord, MatchRecord } from "../domain/matchTypes";
import type { LeaderboardEntry } from "../domain/participantTypes";
import type { StaticMeta } from "../domain/staticMeta";

type StaticPayload = {
  leaderboard: LeaderboardEntry[];
  goals: ScoredGoal[];
  rawGoals: GoalRecord[];
  rawMatches: ExternalMatchRecord[];
  rawParticipants: ExternalMatchParticipantRecord[];
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
    writeJson("public/data/raw-matches.json", payload.rawMatches),
    writeJson("public/data/raw-participants.json", payload.rawParticipants),
    writeJson("public/data/scorers.json", payload.scorers),
    writeJson("public/data/matches.json", payload.matches)
  ]);
}

export async function writeStaticMeta(meta: StaticMeta): Promise<void> {
  await writeJson("public/data/meta.json", meta);
}
