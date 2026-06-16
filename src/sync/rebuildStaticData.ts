import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { buildLeaderboard, scoreGoalsForTeams } from "../domain/buildLeaderboard";
import { buildMatches } from "../domain/buildMatches";
import { buildScorers } from "../domain/buildScorers";
import { enrichGoalsWithRoster } from "../domain/rosterResolver";
import type { PickStatusSnapshot } from "../domain/pickStatusTypes";
import type { ExternalMatchRecord, GoalRecord, StaticMeta } from "../domain/types";
import type { RosterSnapshot } from "../domain/rosterTypes";
import { sortGoalsChronologically } from "../domain/sortGoals";
import { teams } from "../config/teams";
import { buildPickStatusSnapshot, writePickStatusSnapshot } from "./pickStatuses";
import { buildSnapshotFingerprint } from "./snapshotFingerprint";
import { validateGoals } from "./validateGoals";
import { writeStaticData } from "./writeStaticData";

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function readOptionalJson<T>(path: string): Promise<T | undefined> {
  try {
    return await readJson<T>(path);
  } catch {
    return undefined;
  }
}

export async function rebuildStaticData(): Promise<void> {
  const [rawGoals, rawMatches, meta, rosters, previousPickStatuses] = await Promise.all([
    readJson<GoalRecord[]>("public/data/raw-goals.json"),
    readJson<ExternalMatchRecord[]>("public/data/raw-matches.json"),
    readJson<StaticMeta>("public/data/meta.json"),
    readOptionalJson<RosterSnapshot>("public/data/rosters.json"),
    readOptionalJson<PickStatusSnapshot>("public/data/pick-statuses.json")
  ]);
  const enrichedRawGoals = enrichGoalsWithRoster(rawGoals, rosters, {
    strictSources: meta.source === "api-football" ? ["api-football"] : []
  });
  const { validGoals, skippedGoals } = validateGoals(enrichedRawGoals);
  const scoredGoals = sortGoalsChronologically(scoreGoalsForTeams(teams, validGoals, rosters));
  const leaderboard = buildLeaderboard(teams, validGoals, rosters);
  const scorers = buildScorers(validGoals, teams, rosters);
  const matches = buildMatches(validGoals, scoredGoals, rawMatches);
  const snapshotFingerprint = buildSnapshotFingerprint(validGoals);

  await writeStaticData({
    leaderboard,
    goals: scoredGoals,
    rawGoals: validGoals,
    rawMatches,
    scorers,
    matches,
    meta: {
      ...meta,
      goalCount: validGoals.length,
      scoredGoalCount: scoredGoals.length,
      skippedGoalCount: skippedGoals.length,
      duplicateGoalCount: skippedGoals.filter((item) => item.reason === "duplicate-goal").length,
      snapshotFingerprint
    }
  });

  if (rosters) {
    await writePickStatusSnapshot(buildPickStatusSnapshot(rosters, { previousSnapshot: previousPickStatuses }));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  rebuildStaticData()
    .then(() => {
      console.log("Rebuilt static data from existing raw snapshots.");
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
