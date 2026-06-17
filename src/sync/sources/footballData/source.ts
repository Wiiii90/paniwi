import type { GoalSource, GoalSourceResult } from "../types";
import { fetchFootballData } from "./client";
import {
  createFootballDataRequestBudget,
  getFootballDataCompetitionCode,
  getFootballDataDateRange,
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

export const footballDataSource: GoalSource = {
  name: "football-data",
  async fetchGoals(): Promise<GoalSourceResult> {
    const budget = createFootballDataRequestBudget(process.env);
    const dateRange = getFootballDataDateRange(process.env);
    const competitionCode = getFootballDataCompetitionCode(process.env);
    const season = getFootballDataSeason(process.env);
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
    const scorerResponse = await fetchFootballData<FootballDataScorersResponse>(
      `/competitions/${competitionCode}/scorers`,
      {
        season
      },
      {},
      process.env,
      budget
    );
    const matches = parseFootballDataMatches(matchResponse.matches ?? []);
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
      preserveExistingMatches: matches.length === 0,
      preserveExistingParticipants: true,
      sourceRequestCount: budget.used,
      sourceRequestLimit: budget.limit
    };
  }
};
