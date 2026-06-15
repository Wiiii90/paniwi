import { pathToFileURL } from "node:url";
import { buildLeaderboard, scoreGoalsForTeams } from "../domain/buildLeaderboard";
import { buildMatches } from "../domain/buildMatches";
import { buildScorers } from "../domain/buildScorers";
import { sortGoalsChronologically } from "../domain/sortGoals";
import type { SourceName, StaticMeta } from "../domain/types";
import type { GoalSource } from "./sources/types";
import { teams } from "../config/teams";
import { normalizeGoals } from "./normalizeGoals";
import { validateGoals } from "./validateGoals";
import { formatTeamValidationIssues, validateTeams } from "./validateTeams";
import { writeStaticData, writeStaticMeta } from "./writeStaticData";
import { getSourcesFromEnv } from "./sources/sourceSelection";

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

export async function syncGoals(sources: GoalSource[] = getSourcesFromEnv()): Promise<void> {
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
      return;
    }

    throw error;
  }

  const { result, attemptedSources, sourceErrors } = workingSource;
  const normalizedGoals = normalizeGoals(result.goals);
  const { validGoals: goals, skippedGoals } = validateGoals(normalizedGoals);
  const scoredGoals = sortGoalsChronologically(scoreGoalsForTeams(teams, goals));
  const leaderboard = buildLeaderboard(teams, goals);
  const scorers = buildScorers(goals, teams);
  const matches = buildMatches(goals, scoredGoals);
  const duplicateGoalCount = skippedGoals.filter((item) => item.reason === "duplicate-goal").length;

  await writeStaticData({
    leaderboard,
    goals: scoredGoals,
    rawGoals: goals,
    scorers,
    matches,
    meta: {
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
      message: `Daten-Snapshot mit Quelle ${result.source} erzeugt.`
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  syncGoals().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
