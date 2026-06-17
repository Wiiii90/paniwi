import type { ExternalGoalRecord } from "../../../domain/goalTypes";
import { competitionScorerAggregateMatchId } from "../../../domain/effectiveGoals";
import type { FootballDataTeam } from "./matches";

type FootballDataPlayer = {
  id?: number;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

export type FootballDataScorer = {
  player?: FootballDataPlayer;
  team?: FootballDataTeam;
  goals?: number | null;
  penalties?: number | null;
};

function getPlayerName(player: FootballDataPlayer | undefined): string | null {
  const fullName = player?.name?.trim();
  if (fullName) {
    return fullName;
  }

  const fallbackName = [player?.firstName, player?.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  return fallbackName || null;
}

function getTeamName(team: FootballDataTeam | undefined): string | null {
  return team?.name?.trim() || team?.shortName?.trim() || team?.tla?.trim() || null;
}

function getPositiveInteger(value: number | null | undefined): number {
  return Number.isInteger(value) && value && value > 0 ? value : 0;
}

function createAggregateGoal(
  scorer: FootballDataScorer,
  playerName: string,
  nationalTeam: string,
  goals: number,
  detail: "normal" | "penalty"
): ExternalGoalRecord {
  const playerId = scorer.player?.id;
  const suffix = detail === "penalty" ? "penalties" : "normal";
  return {
    externalGoalId: `football-data:scorer:${playerId ?? playerName}:${suffix}`,
    playerName,
    nationalTeam,
    goals,
    source: "football-data",
    apiPlayerId: playerId,
    matchId: competitionScorerAggregateMatchId,
    matchLabel: "FIFA World Cup 2026 Torschützenliste",
    timeConfidence: "unknown",
    detail
  };
}

export function parseFootballDataScorer(scorer: FootballDataScorer): ExternalGoalRecord[] {
  const playerName = getPlayerName(scorer.player);
  const nationalTeam = getTeamName(scorer.team);
  const totalGoals = getPositiveInteger(scorer.goals);

  if (!playerName || !nationalTeam || totalGoals === 0) {
    return [];
  }

  const penaltyGoals = Math.min(getPositiveInteger(scorer.penalties), totalGoals);
  const normalGoals = totalGoals - penaltyGoals;
  const goals: ExternalGoalRecord[] = [];

  if (normalGoals > 0) {
    goals.push(createAggregateGoal(scorer, playerName, nationalTeam, normalGoals, "normal"));
  }

  if (penaltyGoals > 0) {
    goals.push(createAggregateGoal(scorer, playerName, nationalTeam, penaltyGoals, "penalty"));
  }

  return goals;
}

export function parseFootballDataScorers(scorers: FootballDataScorer[]): ExternalGoalRecord[] {
  return scorers.flatMap(parseFootballDataScorer);
}
