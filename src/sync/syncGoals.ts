import { buildLeaderboard, scoreGoalsForTeams } from "../domain/buildLeaderboard";
import type { GoalSource } from "./sources/types";
import { teams } from "../config/teams";
import { normalizeGoals } from "./normalizeGoals";
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
  const goals = normalizeGoals(result.goals);
  const scoredGoals = scoreGoalsForTeams(teams, goals).sort((a, b) =>
    (b.scoredAt ?? "").localeCompare(a.scoredAt ?? "")
  );
  const leaderboard = buildLeaderboard(teams, goals);

  await writeStaticData({
    leaderboard,
    goals: scoredGoals,
    rawGoals: goals,
    meta: {
      lastUpdated: result.fetchedAt,
      source: result.source,
      fallbackUsed: false,
      status: "ok",
      message: "Mock-Daten fuer lokales MVP erzeugt."
    }
  });
}

syncGoals().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
