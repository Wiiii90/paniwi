import type { GoalSource, GoalSourceResult } from "../types";
import { fetchFootballData } from "./client";
import {
  createFootballDataRequestBudget,
  getFootballDataCompetitionCode,
  getFootballDataDateRange,
  getFootballDataScorerLimit,
  getFootballDataSeason
} from "./config";
import { parseFootballDataMatches, type FootballDataMatch } from "./matches";
import { parseFootballDataScorers, type FootballDataScorer } from "./scorers";

type FootballDataMatchesResponse = {
  matches?: FootballDataMatch[];
};

type FootballDataScorersResponse = {
  scorers?: FootballDataScorer[];
};

function getMatchId(match: FootballDataMatch): string | null {
  return typeof match.id === "number" || typeof match.id === "string" ? String(match.id) : null;
}

function getTimestamp(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isMatchInActiveWindow(match: FootballDataMatch, env: NodeJS.ProcessEnv): boolean {
  const kickoff = getTimestamp(match.utcDate);
  const from = getTimestamp(env.SYNC_WINDOW_FROM);
  const until = getTimestamp(env.SYNC_WINDOW_UNTIL);
  const phase = env.SYNC_WINDOW_PHASE;

  if (kickoff === null || from === null || until === null) {
    return false;
  }

  const fiveMinutesMs = 5 * 60 * 1000;
  const fourHoursMs = 4 * 60 * 60 * 1000;

  if (phase === "live") {
    return kickoff >= from - fiveMinutesMs && kickoff <= until;
  }

  if (phase === "post-match") {
    return kickoff >= from - fourHoursMs && kickoff <= until;
  }

  return false;
}

function hasNumericScore(score: FootballDataMatch["score"]): boolean {
  return [score?.fullTime, score?.regularTime, score?.extraTime, score?.halfTime].some(
    (period) => typeof period?.home === "number" || typeof period?.away === "number"
  );
}

function mergeMatchDetail(match: FootballDataMatch, detail: FootballDataMatch): FootballDataMatch {
  return {
    ...match,
    ...detail,
    homeTeam: detail.homeTeam ?? match.homeTeam,
    awayTeam: detail.awayTeam ?? match.awayTeam,
    score: hasNumericScore(detail.score) || !match.score ? detail.score : match.score
  };
}

function mergeMatchDetails(matches: FootballDataMatch[], details: FootballDataMatch[]): FootballDataMatch[] {
  const detailsById = new Map(details.map((detail) => [getMatchId(detail), detail] as const));
  return matches.map((match) => {
    const detail = detailsById.get(getMatchId(match));
    return detail ? mergeMatchDetail(match, detail) : match;
  });
}

function getDetailCandidates(matches: FootballDataMatch[], env: NodeJS.ProcessEnv): FootballDataMatch[] {
  return matches.filter((match) => Boolean(getMatchId(match)) && (match.status === "IN_PLAY" || isMatchInActiveWindow(match, env)));
}

async function fetchActiveMatchDetails(
  matches: FootballDataMatch[],
  env: NodeJS.ProcessEnv,
  budget: ReturnType<typeof createFootballDataRequestBudget>
): Promise<FootballDataMatch[]> {
  const details: FootballDataMatch[] = [];
  const seenIds = new Set<string>();

  for (const match of getDetailCandidates(matches, env)) {
    const matchId = getMatchId(match);
    if (!matchId || seenIds.has(matchId)) {
      continue;
    }

    if (budget.used + 1 >= budget.limit) {
      break;
    }

    seenIds.add(matchId);
    details.push(await fetchFootballData<FootballDataMatch>(`/matches/${matchId}`, {}, {}, env, budget));
  }

  return details;
}

export const footballDataSource: GoalSource = {
  name: "football-data",
  async fetchGoals(): Promise<GoalSourceResult> {
    const budget = createFootballDataRequestBudget(process.env);
    const dateRange = getFootballDataDateRange(process.env);
    const competitionCode = getFootballDataCompetitionCode(process.env);
    const season = getFootballDataSeason(process.env);
    const scorerLimit = getFootballDataScorerLimit(process.env);
    const matchResponse = await fetchFootballData<FootballDataMatchesResponse>(
      `/competitions/${competitionCode}/matches`,
      {
        season,
        dateFrom: dateRange.from,
        dateTo: dateRange.to
      },
      {},
      process.env,
      budget
    );
    const matchDetails = await fetchActiveMatchDetails(matchResponse.matches ?? [], process.env, budget);
    const scorerResponse = await fetchFootballData<FootballDataScorersResponse>(
      `/competitions/${competitionCode}/scorers`,
      {
        season,
        limit: String(scorerLimit)
      },
      {},
      process.env,
      budget
    );
    const matches = parseFootballDataMatches(mergeMatchDetails(matchResponse.matches ?? [], matchDetails));
    const goals = parseFootballDataScorers(scorerResponse.scorers ?? []);

    return {
      source: "football-data",
      fetchedAt: new Date().toISOString(),
      goals,
      matches,
      participants: [],
      mergeWithExisting: true,
      coveredDateKeys: matches.length > 0 ? dateRange.dateKeys : [],
      preserveExistingGoals: true,
      replaceExistingSourceGoals: true,
      preserveExistingMatches: true,
      preserveExistingParticipants: true,
      sourceRequestCount: budget.used,
      sourceRequestLimit: budget.limit
    };
  }
};
