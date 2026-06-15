import type { GoalRecord, MatchRecord, MatchTeam, ScoredGoal } from "./types";
import { sortGoalsChronologically } from "./sortGoals";
import { resolveTeamDisplayName } from "./teamDisplay";

function normalizeScoreLabel(label: string): string {
  return label.replace(/[–—]/g, "-");
}

function parseTeamFromLabel(label: string | undefined, source: GoalRecord["source"], side: "home" | "away"): MatchTeam {
  if (!label) {
    return { name: side === "home" ? "Team A" : "Team B" };
  }

  const match = normalizeScoreLabel(label).match(/^(.+?)\s+(\d+)-(\d+)\s+(.+)$/);
  if (!match) {
    return { name: side === "home" ? resolveTeamDisplayName(label, source) : "Gegner offen" };
  }

  return side === "home"
    ? { name: resolveTeamDisplayName(match[1].trim(), source), score: Number(match[2]) }
    : { name: resolveTeamDisplayName(match[4].trim(), source), score: Number(match[3]) };
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
      const homeTeam = parseTeamFromLabel(label, matchGoals[0]?.source ?? "wikipedia", "home");
      const awayTeam = parseTeamFromLabel(label, matchGoals[0]?.source ?? "wikipedia", "away");
      return {
        matchId,
        label,
        kickedOffAt: matchGoals.find((goal) => goal.kickedOffAt)?.kickedOffAt,
        status: homeTeam.score !== undefined && awayTeam.score !== undefined ? ("finished" as const) : ("unknown" as const),
        homeTeam,
        awayTeam,
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
