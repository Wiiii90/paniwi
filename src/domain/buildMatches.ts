import type { GoalRecord, MatchRecord, MatchTeam, ScoredGoal } from "./types";
import { sortGoalsChronologically } from "./sortGoals";

function parseTeamFromLabel(label: string | undefined, side: "home" | "away"): MatchTeam {
  if (!label) {
    return { name: side === "home" ? "Team A" : "Team B" };
  }

  const match = label.match(/^(.+?)\s+(\d+)-(\d+)\s+(.+)$/);
  if (!match) {
    return { name: side === "home" ? label : "Gegner offen" };
  }

  return side === "home"
    ? { name: match[1].trim(), score: Number(match[2]) }
    : { name: match[4].trim(), score: Number(match[3]) };
}

function inferMatchLabel(goals: GoalRecord[]): string {
  return goals.find((goal) => goal.matchLabel)?.matchLabel ?? goals[0]?.matchId ?? "Spiel offen";
}

export function buildMatches(goals: GoalRecord[], scoredGoals: ScoredGoal[]): MatchRecord[] {
  const goalsByMatch = new Map<string, GoalRecord[]>();
  for (const goal of goals) {
    const matchId = goal.matchId ?? goal.fixtureId ?? `unknown-${goal.externalGoalId}`;
    goalsByMatch.set(matchId, [...(goalsByMatch.get(matchId) ?? []), goal]);
  }

  return [...goalsByMatch.entries()]
    .map(([matchId, matchGoals]) => {
      const label = inferMatchLabel(matchGoals);
      const pointGoals = scoredGoals.filter((goal) => (goal.matchId ?? goal.fixtureId) === matchId);
      return {
        matchId,
        label,
        kickedOffAt: matchGoals.find((goal) => goal.kickedOffAt)?.kickedOffAt,
        status: "finished" as const,
        homeTeam: parseTeamFromLabel(label, "home"),
        awayTeam: parseTeamFromLabel(label, "away"),
        goals: sortGoalsChronologically(matchGoals),
        pointGoals: sortGoalsChronologically(pointGoals),
        affectedOwners: [...new Set(pointGoals.map((goal) => goal.owner))].sort((a, b) => a.localeCompare(b))
      };
    })
    .sort((a, b) => {
      const timeA = a.kickedOffAt ? Date.parse(a.kickedOffAt) : Number.MAX_SAFE_INTEGER;
      const timeB = b.kickedOffAt ? Date.parse(b.kickedOffAt) : Number.MAX_SAFE_INTEGER;
      return timeA - timeB || a.label.localeCompare(b.label);
    });
}
