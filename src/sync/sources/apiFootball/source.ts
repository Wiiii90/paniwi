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
  getLiveCarryoverFixtureIds,
  getMatchesByFixtureId,
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
  lineupBudget: ApiFootballLineupRequestBudget,
  plan: FixtureFetchPlan
): Promise<{ goals: ExternalGoalRecord[]; fixtures: ApiFootballFixture[]; participants: ExternalMatchParticipantRecord[] }> {
  const goals: ExternalGoalRecord[] = [];
  const fixtures: ApiFootballFixture[] = [];
  const participants: ExternalMatchParticipantRecord[] = [];
  for (const fixtureId of fixtureIds) {
    const fixture = await fetchFixtureById(fixtureId, process.env, budget);
    if (fixture) {
      fixtures.push(fixture);
    }

    if (fixture && shouldFetchEventsForFixturePlan(fixture, plan)) {
      const events = await fetchFixtureEvents(fixtureId, process.env, budget);
      goals.push(...parseApiFootballEvents(fixtureId, events, fixture));
      participants.push(...parseApiFootballSubstitutions(fixtureId, events));
    }

    if (plan.lineupFixtureIds.has(fixtureId)) {
      participants.push(...parseApiFootballLineups(fixtureId, await fetchOptionalFixtureLineups(fixtureId, budget, lineupBudget)));
    }
  }

  return { goals, fixtures, participants };
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

async function fetchGoalsAndParticipantsForFixtures(
  fixtures: ApiFootballFixture[],
  budget: ApiFootballRequestBudget,
  lineupBudget: ApiFootballLineupRequestBudget,
  phase: SyncWindowPhase,
  now: Date,
  fixtureIdsWithLineups: Set<string>,
  plan: FixtureFetchPlan
): Promise<{ goals: ExternalGoalRecord[]; participants: ExternalMatchParticipantRecord[] }> {
  const fixturesWithEvents = fixtures.filter((fixture) => shouldFetchEventsForDateFixture(fixture, phase, now, plan));
  const fixturesWithLineups = fixtures.filter((fixture) => {
    const fixtureId = getFixtureId(fixture);
    return Boolean(
      fixtureId &&
        !fixtureIdsWithLineups.has(fixtureId) &&
        (plan.lineupFixtureIds.has(fixtureId) || shouldFetchFixtureLineups(fixture, phase, now))
    );
  });
  const participants: ExternalMatchParticipantRecord[] = [];
  if (fixturesWithEvents.length === 0) {
    for (const fixture of fixturesWithLineups) {
      const fixtureId = getFixtureId(fixture);
      if (fixtureId) {
        participants.push(...parseApiFootballLineups(fixtureId, await fetchOptionalFixtureLineups(fixtureId, budget, lineupBudget)));
      }
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

  for (const fixture of fixturesWithLineups) {
    const fixtureId = getFixtureId(fixture);
    if (fixtureId) {
      participants.push(...parseApiFootballLineups(fixtureId, await fetchOptionalFixtureLineups(fixtureId, budget, lineupBudget)));
    }
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
        ? await fetchGoalsAndMatchesForFixtureIds(fixtureIds, budget, lineupBudget, fetchPlan)
        : { goals: [], fixtures: [], participants: [] };
    const fixtures = mergeFixtures([...dateFixtures, ...explicitFixtureResult.fixtures]);
    const explicitFixtureIdSet = new Set(explicitFixtureResult.fixtures.map((fixture) => getFixtureId(fixture)).filter(Boolean));
    const dateResult = await fetchGoalsAndParticipantsForFixtures(
      fixtures.filter((fixture) => {
        const fixtureId = getFixtureId(fixture);
        return !fixtureId || !explicitFixtureIdSet.has(fixtureId);
      }),
      budget,
      lineupBudget,
      phase,
      now,
      existingFixtureIdsWithLineups,
      fetchPlan
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
