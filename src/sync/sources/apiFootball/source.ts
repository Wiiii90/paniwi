import { readFile } from "node:fs/promises";
import type { ExternalGoalRecord } from "../../../domain/goalTypes";
import type { ExternalMatchParticipantRecord, ExternalMatchRecord } from "../../../domain/matchTypes";
import type { GoalSource, GoalSourceResult } from "../types";
import {
  createLineupRequestBudget,
  createRequestBudget,
  getSyncWindowPhase,
  parseCommaSeparated,
  type ApiFootballLineupRequestBudget,
  type ApiFootballRequestBudget,
  type SyncWindowPhase
} from "./config";
import {
  fetchFixtureById,
  fetchFixturesByDate,
  filterWorldCupFixtures,
  getApiFootballDateKeys,
  getFixtureId,
  getFixtureIdsOutsideDateKeys,
  getFixtureKickoffMs,
  getLiveCarryoverFixtureIds,
  getMatchesByFixtureId,
  isFixtureInLiveWindow,
  isFixtureInPreMatchWindow,
  isPostMatchWindow,
  mergeFixtures,
  parseApiFootballFixture,
  shouldFetchFixtureEvents,
  shouldFetchFixtureEventsForPhase,
  shouldFetchFixtureLineups,
  type ApiFootballFixture
} from "./fixtures";
import {
  fetchFixtureEvents,
  fixtureNeedsGoalEvents,
  getMissingEventBackfillFixtureIds,
  getMissingEventBackfillLimit,
  parseApiFootballEvents,
  parseApiFootballSubstitutions
} from "./events";
import {
  fetchOptionalFixtureLineups,
  getExistingFixtureIdsWithLineups,
  getLineupBackfillLimit,
  getMissingLineupBackfillFixtureIds,
  parseApiFootballLineups
} from "./lineups";

async function readExistingApiFootballMatches(): Promise<ExternalMatchRecord[]> {
  try {
    const matches = JSON.parse(await readFile("public/data/raw-matches.json", "utf8")) as ExternalMatchRecord[];
    return matches.filter((match) => match.source === "api-football" && match.fixtureId);
  } catch {
    return [];
  }
}

async function readExistingApiFootballGoalCountsByFixture(): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  try {
    const goals = JSON.parse(await readFile("public/data/raw-goals.json", "utf8")) as ExternalGoalRecord[];
    for (const goal of goals) {
      if (goal.source !== "api-football" || !goal.fixtureId) {
        continue;
      }

      counts.set(goal.fixtureId, (counts.get(goal.fixtureId) ?? 0) + 1);
    }
  } catch {
    return counts;
  }

  return counts;
}

async function readExistingApiFootballParticipants(): Promise<ExternalMatchParticipantRecord[]> {
  try {
    const participants = JSON.parse(await readFile("public/data/raw-participants.json", "utf8")) as ExternalMatchParticipantRecord[];
    return participants.filter((participant) => participant.source === "api-football" && participant.fixtureId);
  } catch {
    return [];
  }
}

type FixtureFetchPlan = {
  manualEventFixtureIds: Set<string>;
  scoreAwareEventFixtureIds: Set<string>;
  lineupFixtureIds: Set<string>;
  goalCountsByFixture: Map<string, number>;
};

type ExplicitFixtureFetchResult = {
  goals: ExternalGoalRecord[];
  fixtures: ApiFootballFixture[];
  participants: ExternalMatchParticipantRecord[];
  eventFixtureIds: Set<string>;
};

type LineupFetchCandidate = {
  fixture: ApiFootballFixture;
  fixtureId: string;
  rank: number;
  sortTime: number;
};

function shouldFetchEventsForFixturePlan(fixture: ApiFootballFixture, plan: FixtureFetchPlan): boolean {
  const fixtureId = getFixtureId(fixture);
  if (!fixtureId) {
    return false;
  }

  if (plan.manualEventFixtureIds.has(fixtureId)) {
    return shouldFetchFixtureEvents(fixture);
  }

  if (!plan.scoreAwareEventFixtureIds.has(fixtureId)) {
    return false;
  }

  return fixtureNeedsGoalEvents(fixture, plan.goalCountsByFixture);
}

function shouldFetchEventsForDateFixture(
  fixture: ApiFootballFixture,
  phase: SyncWindowPhase,
  now: Date,
  plan: FixtureFetchPlan
): boolean {
  const fixtureId = getFixtureId(fixture);
  if (!fixtureId) {
    return false;
  }

  if (plan.manualEventFixtureIds.has(fixtureId)) {
    return shouldFetchFixtureEvents(fixture);
  }

  const isQueuedBackfill = plan.scoreAwareEventFixtureIds.has(fixtureId);
  const isActiveWindow = shouldFetchFixtureEventsForPhase(fixture, phase, now);
  if (!isQueuedBackfill && !isActiveWindow) {
    return false;
  }

  return fixtureNeedsGoalEvents(fixture, plan.goalCountsByFixture);
}

async function fetchGoalsAndMatchesForFixtureIds(
  fixtureIds: string[],
  budget: ApiFootballRequestBudget,
  plan: FixtureFetchPlan
): Promise<ExplicitFixtureFetchResult> {
  const goals: ExternalGoalRecord[] = [];
  const fixtures: ApiFootballFixture[] = [];
  const participants: ExternalMatchParticipantRecord[] = [];
  const eventFixtureIds = new Set<string>();
  for (const fixtureId of fixtureIds) {
    const fixture = await fetchFixtureById(fixtureId, process.env, budget);
    if (fixture) {
      fixtures.push(fixture);
    }

    if (fixture && shouldFetchEventsForFixturePlan(fixture, plan)) {
      const events = await fetchFixtureEvents(fixtureId, process.env, budget);
      eventFixtureIds.add(fixtureId);
      goals.push(...parseApiFootballEvents(fixtureId, events, fixture));
      participants.push(...parseApiFootballSubstitutions(fixtureId, events));
    }
  }

  return { goals, fixtures, participants, eventFixtureIds };
}

async function fetchFixturesForDates(dateKeys: string[], budget: ApiFootballRequestBudget): Promise<ApiFootballFixture[]> {
  const fixtures: ApiFootballFixture[] = [];
  for (const date of dateKeys) {
    fixtures.push(...filterWorldCupFixtures(await fetchFixturesByDate(date, process.env, budget)));
  }

  if (fixtures.length === 0) {
    throw new Error(`API-Football returned no World Cup fixtures for dates: ${dateKeys.join(", ")}.`);
  }

  return fixtures;
}

function getLineupCandidateRank(
  fixture: ApiFootballFixture,
  phase: SyncWindowPhase,
  now: Date,
  plan: FixtureFetchPlan
): number | null {
  const fixtureId = getFixtureId(fixture);
  if (!fixtureId) {
    return null;
  }

  if (isFixtureInLiveWindow(fixture, now)) {
    return 0;
  }

  if (phase === "pre-match" && isFixtureInPreMatchWindow(fixture, now)) {
    return 1;
  }

  if (isPostMatchWindow(fixture, now)) {
    return 2;
  }

  const match = parseApiFootballFixture(fixture, now);
  if (plan.lineupFixtureIds.has(fixtureId) && match?.status === "live") {
    return 3;
  }

  if (shouldFetchFixtureLineups(fixture, phase, now)) {
    return 4;
  }

  return plan.lineupFixtureIds.has(fixtureId) ? 5 : null;
}

function getLineupSortTime(fixture: ApiFootballFixture, rank: number): number {
  const kickoffMs = getFixtureKickoffMs(fixture) ?? 0;
  return rank === 5 ? -kickoffMs : kickoffMs;
}

function getLineupFetchCandidates(
  fixtures: ApiFootballFixture[],
  fixtureIdsWithLineups: Set<string>,
  phase: SyncWindowPhase,
  now: Date,
  plan: FixtureFetchPlan
): LineupFetchCandidate[] {
  return fixtures
    .flatMap((fixture): LineupFetchCandidate[] => {
      const fixtureId = getFixtureId(fixture);
      if (!fixtureId || fixtureIdsWithLineups.has(fixtureId)) {
        return [];
      }

      const shouldFetchLineup = plan.lineupFixtureIds.has(fixtureId) || shouldFetchFixtureLineups(fixture, phase, now);
      if (!shouldFetchLineup) {
        return [];
      }

      const rank = getLineupCandidateRank(fixture, phase, now, plan);
      if (rank === null) {
        return [];
      }

      return [
        {
          fixture,
          fixtureId,
          rank,
          sortTime: getLineupSortTime(fixture, rank)
        }
      ];
    })
    .sort((left, right) => left.rank - right.rank || left.sortTime - right.sortTime || left.fixtureId.localeCompare(right.fixtureId));
}

async function fetchGoalsAndParticipantsForFixtures(
  fixtures: ApiFootballFixture[],
  budget: ApiFootballRequestBudget,
  lineupBudget: ApiFootballLineupRequestBudget,
  phase: SyncWindowPhase,
  now: Date,
  fixtureIdsWithLineups: Set<string>,
  plan: FixtureFetchPlan,
  eventFixtureIdsAlreadyFetched: Set<string>
): Promise<{ goals: ExternalGoalRecord[]; participants: ExternalMatchParticipantRecord[] }> {
  const fixturesWithEvents = fixtures.filter((fixture) => {
    const fixtureId = getFixtureId(fixture);
    return Boolean(fixtureId && !eventFixtureIdsAlreadyFetched.has(fixtureId) && shouldFetchEventsForDateFixture(fixture, phase, now, plan));
  });
  const lineupCandidates = getLineupFetchCandidates(fixtures, fixtureIdsWithLineups, phase, now, plan);
  const participants: ExternalMatchParticipantRecord[] = [];
  if (fixturesWithEvents.length === 0) {
    for (const candidate of lineupCandidates) {
      participants.push(
        ...parseApiFootballLineups(candidate.fixtureId, await fetchOptionalFixtureLineups(candidate.fixtureId, budget, lineupBudget))
      );
    }

    return { goals: [], participants };
  }

  const goals: ExternalGoalRecord[] = [];
  for (const fixture of fixturesWithEvents) {
    const fixtureId = getFixtureId(fixture);
    if (fixtureId) {
      const events = await fetchFixtureEvents(fixtureId, process.env, budget);
      goals.push(...parseApiFootballEvents(fixtureId, events, fixture));
      participants.push(...parseApiFootballSubstitutions(fixtureId, events));
    }
  }

  for (const candidate of lineupCandidates) {
    participants.push(
      ...parseApiFootballLineups(candidate.fixtureId, await fetchOptionalFixtureLineups(candidate.fixtureId, budget, lineupBudget))
    );
  }

  return { goals, participants };
}

export const apiFootballSource: GoalSource = {
  name: "api-football",
  async fetchGoals(): Promise<GoalSourceResult> {
    const budget = createRequestBudget();
    const lineupBudget = createLineupRequestBudget();
    const now = new Date();
    const phase = getSyncWindowPhase();
    const configuredFixtureIds = parseCommaSeparated(process.env.API_FOOTBALL_FIXTURE_IDS);
    const dateKeys = getApiFootballDateKeys(process.env, now);
    const dateKeySet = new Set(dateKeys);
    const [existingApiFootballMatches, existingApiFootballGoalCountsByFixture, existingApiFootballParticipants] = await Promise.all([
      readExistingApiFootballMatches(),
      readExistingApiFootballGoalCountsByFixture(),
      readExistingApiFootballParticipants()
    ]);
    const existingFixtureIdsWithLineups = getExistingFixtureIdsWithLineups(existingApiFootballParticipants);
    const missingEventBackfillFixtureIds = getMissingEventBackfillFixtureIds(
      existingApiFootballMatches,
      existingApiFootballGoalCountsByFixture,
      getMissingEventBackfillLimit()
    );
    const liveCarryoverFixtureIds = getLiveCarryoverFixtureIds(existingApiFootballMatches);
    const missingLineupBackfillFixtureIds = getMissingLineupBackfillFixtureIds(
      existingApiFootballMatches,
      existingApiFootballParticipants,
      getLineupBackfillLimit()
    );
    const existingMatchesByFixtureId = getMatchesByFixtureId(existingApiFootballMatches);
    const automaticFixtureIdsOutsideDateKeys = [
      ...getFixtureIdsOutsideDateKeys(missingEventBackfillFixtureIds, existingMatchesByFixtureId, dateKeySet),
      ...getFixtureIdsOutsideDateKeys(liveCarryoverFixtureIds, existingMatchesByFixtureId, dateKeySet),
      ...getFixtureIdsOutsideDateKeys(missingLineupBackfillFixtureIds, existingMatchesByFixtureId, dateKeySet)
    ];
    const lineupBackfillFixtureIdSet = new Set(missingLineupBackfillFixtureIds);
    const fetchPlan: FixtureFetchPlan = {
      manualEventFixtureIds: new Set(configuredFixtureIds),
      scoreAwareEventFixtureIds: new Set([...missingEventBackfillFixtureIds, ...liveCarryoverFixtureIds]),
      lineupFixtureIds: lineupBackfillFixtureIdSet,
      goalCountsByFixture: existingApiFootballGoalCountsByFixture
    };
    const fixtureIds = [...new Set([...configuredFixtureIds, ...automaticFixtureIdsOutsideDateKeys])];
    let dateFixtures: ApiFootballFixture[] = [];
    try {
      dateFixtures = await fetchFixturesForDates(dateKeys, budget);
    } catch (error) {
      if (fixtureIds.length === 0) {
        throw error;
      }
    }

    const explicitFixtureResult =
      fixtureIds.length > 0
        ? await fetchGoalsAndMatchesForFixtureIds(fixtureIds, budget, fetchPlan)
        : { goals: [], fixtures: [], participants: [], eventFixtureIds: new Set<string>() };
    const fixtures = mergeFixtures([...dateFixtures, ...explicitFixtureResult.fixtures]);
    const dateResult = await fetchGoalsAndParticipantsForFixtures(
      fixtures,
      budget,
      lineupBudget,
      phase,
      now,
      existingFixtureIdsWithLineups,
      fetchPlan,
      explicitFixtureResult.eventFixtureIds
    );

    return {
      source: "api-football",
      fetchedAt: now.toISOString(),
      goals: [...dateResult.goals, ...explicitFixtureResult.goals],
      matches: fixtures.flatMap((fixture) => parseApiFootballFixture(fixture) ?? []),
      participants: [...dateResult.participants, ...explicitFixtureResult.participants],
      coveredDateKeys: dateFixtures.length > 0 ? dateKeys : undefined,
      mergeWithExisting: true,
      sourceRequestCount: budget.used,
      sourceRequestLimit: budget.limit
    };
  }
};
