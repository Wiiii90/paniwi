import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import { buildLeaderboard, scoreGoalsForTeams } from "../domain/buildLeaderboard";
import { buildMatches } from "../domain/buildMatches";
import { buildScorers } from "../domain/buildScorers";
import { sortGoalsChronologically } from "../domain/sortGoals";
import type { SourceName, StaticMeta } from "../domain/types";
import type { GoalSource } from "./sources/types";
import { teams } from "../config/teams";
import { normalizeGoals } from "./normalizeGoals";
import { buildSnapshotFingerprint } from "./snapshotFingerprint";
import { validateGoals } from "./validateGoals";
import { formatTeamValidationIssues, validateTeams } from "./validateTeams";
import { writeStaticData, writeStaticMeta } from "./writeStaticData";
import { getSourcesFromEnv } from "./sources/sourceSelection";

type SyncGoalsOptions = {
  syncWindowId?: string;
};

type WorkingSourceResult = {
  result: Awaited<ReturnType<GoalSource["fetchGoals"]>>;
  attemptedSources: SourceName[];
  sourceErrors: string[];
};

class SourceFetchError extends Error {
  constructor(
    readonly attemptedSources: SourceName[],
    readonly sourceErrors: string[]
  ) {
    super(sourceErrors.join("; "));
    this.name = "SourceFetchError";
  }
}

type NormalizedGoal = ReturnType<typeof normalizeGoals>[number];
type NormalizedGoals = ReturnType<typeof normalizeGoals>;

export function buildSourceErrorMeta(
  attemptedSources: SourceName[],
  sourceErrors: string[],
  now: Date = new Date()
): StaticMeta {
  return {
    lastUpdated: now.toISOString(),
    source: attemptedSources[0] ?? "mock",
    attemptedSources,
    fallbackUsed: attemptedSources.length > 1,
    status: "error",
    sourceErrors,
    message: "Alle Datenquellen sind fehlgeschlagen. Bestehende Snapshot-Dateien wurden nicht ueberschrieben."
  };
}

async function fetchFromFirstWorkingSource(sources: GoalSource[]): Promise<WorkingSourceResult> {
  const errors: string[] = [];
  const attemptedSources: SourceName[] = [];

  for (const source of sources) {
    attemptedSources.push(source.name);
    try {
      return {
        result: await source.fetchGoals(),
        attemptedSources,
        sourceErrors: errors
      };
    } catch (error) {
      errors.push(`${source.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new SourceFetchError(attemptedSources, errors);
}

async function readExistingMeta(): Promise<StaticMeta | null> {
  try {
    return JSON.parse(await readFile("public/data/meta.json", "utf8")) as StaticMeta;
  } catch {
    return null;
  }
}

async function readExistingRawGoals(): Promise<NormalizedGoals> {
  try {
    return JSON.parse(await readFile("public/data/raw-goals.json", "utf8")) as NormalizedGoals;
  } catch {
    return [];
  }
}

function getGoalMergeKey(goal: NormalizedGoal): string {
  return [goal.source, goal.externalGoalId].join(":");
}

function getGoalDateKey(goal: NormalizedGoal): string | null {
  const sourceDate = goal.kickedOffAt ?? goal.scoredAt;
  return sourceDate ? sourceDate.slice(0, 10) : null;
}

function shouldPreserveExistingGoal(
  goal: NormalizedGoal,
  source: SourceName,
  coveredDateKeys: Set<string> | null
): boolean {
  if (!coveredDateKeys) {
    return goal.source === source;
  }

  const goalDateKey = getGoalDateKey(goal);
  if (!goalDateKey) {
    return goal.source === source;
  }

  return !coveredDateKeys.has(goalDateKey);
}

export function mergeGoalSnapshots(
  source: SourceName,
  existingGoals: NormalizedGoals,
  incomingGoals: NormalizedGoals,
  coveredDateKeys?: string[]
): NormalizedGoals {
  const mergedGoals = new Map<string, NormalizedGoal>();
  const coveredDateKeySet = coveredDateKeys?.length ? new Set(coveredDateKeys) : null;

  for (const goal of existingGoals) {
    if (shouldPreserveExistingGoal(goal, source, coveredDateKeySet)) {
      mergedGoals.set(getGoalMergeKey(goal), goal);
    }
  }

  for (const goal of incomingGoals) {
    mergedGoals.set(getGoalMergeKey(goal), goal);
  }

  return [...mergedGoals.values()];
}

async function mergeWithExistingGoals(
  source: SourceName,
  incomingGoals: NormalizedGoals,
  coveredDateKeys?: string[]
): Promise<NormalizedGoals> {
  const existingGoals = await readExistingRawGoals();
  return mergeGoalSnapshots(source, existingGoals, incomingGoals, coveredDateKeys);
}

function buildSyncMeta(
  result: WorkingSourceResult["result"],
  attemptedSources: SourceName[],
  sourceErrors: string[],
  goals: ReturnType<typeof validateGoals>["validGoals"],
  scoredGoals: ReturnType<typeof scoreGoalsForTeams>,
  skippedGoals: ReturnType<typeof validateGoals>["skippedGoals"],
  previousMeta: StaticMeta | null,
  options: SyncGoalsOptions
): StaticMeta {
  const duplicateGoalCount = skippedGoals.filter((item) => item.reason === "duplicate-goal").length;
  const snapshotFingerprint = buildSnapshotFingerprint(goals);
  const snapshotChanged = previousMeta?.snapshotFingerprint !== snapshotFingerprint;
  const sameWindow = Boolean(options.syncWindowId && previousMeta?.syncWindowId === options.syncWindowId);
  const windowSyncAttempts = !sameWindow || snapshotChanged ? 1 : (previousMeta?.windowSyncAttempts ?? 0) + 1;

  return {
    lastUpdated: result.fetchedAt,
    source: result.source,
    attemptedSources,
    fallbackUsed: attemptedSources.length > 1,
    status: "ok",
    goalCount: goals.length,
    scoredGoalCount: scoredGoals.length,
    skippedGoalCount: skippedGoals.length,
    duplicateGoalCount,
    sourceErrors,
    message: snapshotChanged
      ? `Daten-Snapshot mit Quelle ${result.source} erzeugt.`
      : `Daten-Snapshot unveraendert (${result.source}).`,
    snapshotFingerprint,
    snapshotChanged,
    syncWindowId: options.syncWindowId,
    windowSyncAttempts,
    sourceRequestCount: result.sourceRequestCount,
    sourceRequestLimit: result.sourceRequestLimit
  };
}

export async function syncGoals(
  sources: GoalSource[] = getSourcesFromEnv(),
  options: SyncGoalsOptions = {}
): Promise<void> {
  const teamValidation = validateTeams(teams);
  if (!teamValidation.valid) {
    throw new Error(`Invalid team configuration: ${formatTeamValidationIssues(teamValidation.issues)}`);
  }

  let workingSource: WorkingSourceResult;
  try {
    workingSource = await fetchFromFirstWorkingSource(sources);
  } catch (error) {
    if (error instanceof SourceFetchError) {
      await writeStaticMeta(buildSourceErrorMeta(error.attemptedSources, error.sourceErrors));
      throw error;
    }

    throw error;
  }

  const { result, attemptedSources, sourceErrors } = workingSource;
  const previousMeta = await readExistingMeta();
  const incomingGoals = normalizeGoals(result.goals);
  const normalizedGoals = result.mergeWithExisting
    ? await mergeWithExistingGoals(result.source, incomingGoals, result.coveredDateKeys)
    : incomingGoals;
  const { validGoals: goals, skippedGoals } = validateGoals(normalizedGoals);
  const scoredGoals = sortGoalsChronologically(scoreGoalsForTeams(teams, goals));
  const leaderboard = buildLeaderboard(teams, goals);
  const scorers = buildScorers(goals, teams);
  const matches = buildMatches(goals, scoredGoals);

  await writeStaticData({
    leaderboard,
    goals: scoredGoals,
    rawGoals: goals,
    scorers,
    matches,
    meta: buildSyncMeta(result, attemptedSources, sourceErrors, goals, scoredGoals, skippedGoals, previousMeta, options)
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  syncGoals().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
