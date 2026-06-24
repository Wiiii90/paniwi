import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { buildLeaderboard, scoreGoalsForTeams } from "../domain/buildLeaderboard";
import { buildMatches } from "../domain/buildMatches";
import { buildScorers } from "../domain/buildScorers";
import { selectEffectiveGoalsForScorers, selectEffectiveGoalsForScoring } from "../domain/effectiveGoals";
import { enrichGoalsWithRoster } from "../domain/rosterResolver";
import type { PickStatusSnapshot } from "../domain/pickStatusTypes";
import type { GoalRecord } from "../domain/goalTypes";
import type { ExternalMatchParticipantRecord, ExternalMatchRecord } from "../domain/matchTypes";
import type { StaticMeta } from "../domain/staticMeta";
import type { RosterSnapshot } from "../domain/rosterTypes";
import { sortGoalsChronologically } from "../domain/sortGoals";
import { participantTeams } from "../config/teams";
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
  const [rawGoals, rawMatches, rawParticipants, meta, rosters, previousPickStatuses] = await Promise.all([
    readJson<GoalRecord[]>("public/data/raw-goals.json"),
    readJson<ExternalMatchRecord[]>("public/data/raw-matches.json"),
    readOptionalJson<ExternalMatchParticipantRecord[]>("public/data/raw-participants.json"),
    readJson<StaticMeta>("public/data/meta.json"),
    readOptionalJson<RosterSnapshot>("public/data/rosters.json"),
    readOptionalJson<PickStatusSnapshot>("public/data/pick-statuses.json")
  ]);
  const strictSources = rawGoals.some((goal) => goal.source === "api-football") ? ["api-football" as const] : [];
  const enrichedRawGoals = enrichGoalsWithRoster(rawGoals, rosters, {
    strictSources
  });
  const { validGoals } = validateGoals(enrichedRawGoals);
  const effectiveGoals = selectEffectiveGoalsForScoring(validGoals);
  const scorerGoals = selectEffectiveGoalsForScorers(validGoals);
  const scoredGoals = sortGoalsChronologically(scoreGoalsForTeams(participantTeams, effectiveGoals, rosters));
  const leaderboard = buildLeaderboard(participantTeams, effectiveGoals, rosters);
  const scorers = buildScorers(scorerGoals, participantTeams, rosters, effectiveGoals);
  const matches = buildMatches(validGoals, scoredGoals, rawMatches, rawParticipants ?? [], participantTeams, rosters);
  const snapshotFingerprint = buildSnapshotFingerprint(validGoals, rawMatches, rawParticipants ?? []);

  await writeStaticData({
    leaderboard,
    goals: scoredGoals,
    rawGoals: validGoals,
    rawMatches,
    rawParticipants: rawParticipants ?? [],
    scorers,
    matches,
    meta: {
      ...meta,
      goalCount: validGoals.length,
      scoredGoalCount: scoredGoals.length,
      skippedGoalCount: 0,
      duplicateGoalCount: 0,
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
