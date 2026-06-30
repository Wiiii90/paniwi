import type { GoalRecord } from "./goalTypes";
import type { ExternalMatchRecord } from "./matchTypes";

function getScoreTotal(match: ExternalMatchRecord): number | null {
  if (typeof match.homeTeam.score !== "number" || typeof match.awayTeam.score !== "number") {
    return null;
  }

  return match.homeTeam.score + match.awayTeam.score;
}

function getApiFootballFixtureId(goal: GoalRecord): string | null {
  if (goal.source !== "api-football") {
    return null;
  }

  if (goal.fixtureId) {
    return goal.fixtureId;
  }

  const matchId = goal.matchId?.match(/^api-football:(.+)$/)?.[1];
  if (matchId) {
    return matchId;
  }

  return goal.externalGoalId.match(/^api-football:(\d+):/)?.[1] ?? null;
}

function getApiFootballEventOrder(goal: GoalRecord): number {
  const eventOrder = goal.externalGoalId.match(/:(\d+)$/)?.[1];
  return eventOrder ? Number(eventOrder) : Number.MAX_SAFE_INTEGER;
}

function compareApiFootballEventOrder(left: GoalRecord, right: GoalRecord): number {
  return (
    getApiFootballEventOrder(left) - getApiFootballEventOrder(right) ||
    (left.minute ?? 999) - (right.minute ?? 999) ||
    left.externalGoalId.localeCompare(right.externalGoalId)
  );
}

function buildApiFootballScoreTotals(matches: ExternalMatchRecord[]): Map<string, number> {
  const totals = new Map<string, number>();

  for (const match of matches) {
    const scoreTotal = getScoreTotal(match);
    if (match.source === "api-football" && match.fixtureId && scoreTotal !== null) {
      totals.set(match.fixtureId, scoreTotal);
    }
  }

  return totals;
}

export function markApiFootballPenaltyShootoutGoals(goals: GoalRecord[], matches: ExternalMatchRecord[]): GoalRecord[] {
  const scoreTotals = buildApiFootballScoreTotals(matches);
  if (scoreTotals.size === 0) {
    return goals;
  }

  const goalsByFixtureId = new Map<string, GoalRecord[]>();
  for (const goal of goals) {
    const fixtureId = getApiFootballFixtureId(goal);
    if (!fixtureId || !scoreTotals.has(fixtureId)) {
      continue;
    }

    goalsByFixtureId.set(fixtureId, [...(goalsByFixtureId.get(fixtureId) ?? []), goal]);
  }

  const shootoutGoalIds = new Set<string>();
  for (const [fixtureId, fixtureGoals] of goalsByFixtureId) {
    const scoreTotal = scoreTotals.get(fixtureId);
    if (scoreTotal === undefined || fixtureGoals.length <= scoreTotal) {
      continue;
    }

    for (const goal of fixtureGoals.sort(compareApiFootballEventOrder).slice(scoreTotal)) {
      if (goal.detail === "penalty" || goal.detail === "penalty-shootout") {
        shootoutGoalIds.add(goal.externalGoalId);
      }
    }
  }

  if (shootoutGoalIds.size === 0) {
    return goals;
  }

  return goals.map((goal) => (shootoutGoalIds.has(goal.externalGoalId) ? { ...goal, detail: "penalty-shootout" } : goal));
}

export function isPenaltyShootoutGoal(goal: Pick<GoalRecord, "detail">): boolean {
  return goal.detail === "penalty-shootout";
}
