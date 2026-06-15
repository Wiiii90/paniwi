import { buildLeaderboard, scoreGoalsForTeams } from "../domain/buildLeaderboard";
import { sortGoalsChronologically } from "../domain/sortGoals";
import type { SourceName } from "../domain/types";
import type { GoalSource } from "./sources/types";
import { teams } from "../config/teams";
import { normalizeGoals } from "./normalizeGoals";
import { validateGoals } from "./validateGoals";
import { formatTeamValidationIssues, validateTeams } from "./validateTeams";
import { writeStaticData } from "./writeStaticData";
import { getSourcesFromEnv } from "./sources/sourceSelection";

type WorkingSourceResult = {
  result: Awaited<ReturnType<GoalSource["fetchGoals"]>>;
  attemptedSources: SourceName[];
  sourceErrors: string[];
};

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

  throw new Error(errors.join("; "));
}

export async function syncGoals(): Promise<void> {
  const teamValidation = validateTeams(teams);
  if (!teamValidation.valid) {
    throw new Error(`Invalid team configuration: ${formatTeamValidationIssues(teamValidation.issues)}`);
  }

  const sources = getSourcesFromEnv();
  const { result, attemptedSources, sourceErrors } = await fetchFromFirstWorkingSource(sources);
  const normalizedGoals = normalizeGoals(result.goals);
  const { validGoals: goals, skippedGoals } = validateGoals(normalizedGoals);
  const scoredGoals = sortGoalsChronologically(scoreGoalsForTeams(teams, goals));
  const leaderboard = buildLeaderboard(teams, goals);
  const duplicateGoalCount = skippedGoals.filter((item) => item.reason === "duplicate-goal").length;

  await writeStaticData({
    leaderboard,
    goals: scoredGoals,
    rawGoals: goals,
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

syncGoals().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
