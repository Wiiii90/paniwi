import { buildLeaderboard, scoreGoalsForTeams } from "../domain/buildLeaderboard";
import { sortGoalsChronologically } from "../domain/sortGoals";
import type { GoalSource } from "./sources/types";
import { teams } from "../config/teams";
import { normalizeGoals } from "./normalizeGoals";
import { validateGoals } from "./validateGoals";
import { writeStaticData } from "./writeStaticData";
import { mockSource } from "./sources/mockSource";

async function fetchFromFirstWorkingSource(sources: GoalSource[]) {
  const errors: string[] = [];

  for (const source of sources) {
    try {
      return await source.fetchGoals();
    } catch (error) {
      errors.push(`${source.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(errors.join("; "));
}

export async function syncGoals(): Promise<void> {
  const result = await fetchFromFirstWorkingSource([mockSource]);
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
      fallbackUsed: false,
      status: "ok",
      goalCount: goals.length,
      scoredGoalCount: scoredGoals.length,
      skippedGoalCount: skippedGoals.length,
      duplicateGoalCount,
      message: "Mock-Daten fuer lokales MVP erzeugt."
    }
  });
}

syncGoals().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
