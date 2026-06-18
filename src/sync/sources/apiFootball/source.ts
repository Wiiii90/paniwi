import { readFile } from "node:fs/promises";
import { participantTeams } from "../../../config/teams";
import { buildFixtureSyncState, matchHasPickedTeam } from "../../../domain/fixtureSyncState";
import type { ExternalGoalRecord, GoalRecord } from "../../../domain/goalTypes";
import { isCompetitionScorerAggregateGoal } from "../../../domain/effectiveGoals";
import { getExternalMatchKey, goalBelongsToExternalMatch } from "../../../domain/matchIdentity";
import type { ExternalMatchParticipantRecord, ExternalMatchRecord, FixtureSyncState } from "../../../domain/matchTypes";
import type { GoalSource, GoalSourceResult } from "../types";
import {
  createApiFootballRequestBudget,
  getApiFootballEnrichmentExtraMatchLimit,
  hasRequestBudget,
  parseCommaSeparated,
  type ApiFootballRequestBudget
} from "./config";
import {
  fetchFixtureById,
  fetchFixturesByDate,
  filterWorldCupFixtures,
  fixtureHasPickedTeam,
  getFixtureId,
  parseApiFootballFixture,
  type ApiFootballFixture
} from "./fixtures";
import { fetchFixtureEvents, fixtureCanHaveEvents, parseApiFootballEvents, parseApiFootballSubstitutions } from "./events";
import { fetchFixtureLineups, parseApiFootballLineups } from "./lineups";

type Snapshot = {
  goals: GoalRecord[];
  matches: ExternalMatchRecord[];
  participants: ExternalMatchParticipantRecord[];
};

export type ApiFootballEnrichmentCandidate = {
  match: ExternalMatchRecord;
  syncState: FixtureSyncState;
  reason: "explicit" | "latest-finished" | "backfill";
};

type ResolvedFixture = {
  fixture: ApiFootballFixture;
  fixtureId: string;
};

const pickedTeamIds = new Set(participantTeams.flatMap((team) => team.players.map((player) => player.teamId)));

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function readSnapshot(): Promise<Snapshot> {
  const [goals, matches, participants] = await Promise.all([
    readJson<GoalRecord[]>("public/data/raw-goals.json", []),
    readJson<ExternalMatchRecord[]>("public/data/raw-matches.json", []),
    readJson<ExternalMatchParticipantRecord[]>("public/data/raw-participants.json", [])
  ]);

  return { goals, matches, participants };
}

function getDateKey(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString().slice(0, 10);
}

function isDetailedGoalForMatch(goal: GoalRecord, match: ExternalMatchRecord): boolean {
  return !isCompetitionScorerAggregateGoal(goal) && goalBelongsToExternalMatch(goal, match);
}

function countDetailedGoalsForMatch(goals: GoalRecord[], match: ExternalMatchRecord): number {
  return goals.filter((goal) => isDetailedGoalForMatch(goal, match)).length;
}

function participantBelongsToMatch(participant: ExternalMatchParticipantRecord, match: ExternalMatchRecord): boolean {
  if (participant.matchId === match.matchId) {
    return true;
  }

  return Boolean(match.source === "api-football" && match.fixtureId && participant.fixtureId === match.fixtureId);
}

function matchHasLineups(match: ExternalMatchRecord, participants: ExternalMatchParticipantRecord[]): boolean {
  return participants.some(
    (participant) =>
      participantBelongsToMatch(participant, match) && (participant.status === "starter" || participant.status === "bench")
  );
}

function buildCandidate(match: ExternalMatchRecord, goals: GoalRecord[], participants: ExternalMatchParticipantRecord[]): ApiFootballEnrichmentCandidate | null {
  if (match.source === "api-football" || match.status !== "finished") {
    return null;
  }

  const syncState = buildFixtureSyncState(
    match,
    countDetailedGoalsForMatch(goals, match),
    matchHasLineups(match, participants),
    matchHasPickedTeam(match, pickedTeamIds)
  );

  if (!syncState.needsEventBackfill && !syncState.needsLineupBackfill) {
    return null;
  }

  return {
    match,
    syncState,
    reason: "backfill"
  };
}

function sortNewestFirst(left: ApiFootballEnrichmentCandidate, right: ApiFootballEnrichmentCandidate): number {
  return (right.match.kickedOffAt ?? "").localeCompare(left.match.kickedOffAt ?? "") || left.match.matchId.localeCompare(right.match.matchId);
}

function getConfiguredMatchIds(env: NodeJS.ProcessEnv): string[] {
  return parseCommaSeparated(env.API_FOOTBALL_ENRICH_MATCH_IDS);
}

function matchesConfiguredId(match: ExternalMatchRecord, configuredId: string): boolean {
  const shortMatchId = match.matchId.replace(/^football-data:/, "");
  return configuredId === match.matchId || configuredId === match.fixtureId || configuredId === shortMatchId;
}

export function getApiFootballEnrichmentCandidates(
  matches: ExternalMatchRecord[],
  goals: GoalRecord[],
  participants: ExternalMatchParticipantRecord[],
  env: NodeJS.ProcessEnv = process.env
): ApiFootballEnrichmentCandidate[] {
  const maxCandidates = 1 + getApiFootballEnrichmentExtraMatchLimit(env);
  const candidates = matches
    .flatMap((match) => buildCandidate(match, goals, participants) ?? [])
    .sort(sortNewestFirst);
  const selected: ApiFootballEnrichmentCandidate[] = [];
  const selectedMatchIds = new Set<string>();

  for (const configuredId of getConfiguredMatchIds(env)) {
    const candidate = candidates.find((item) => matchesConfiguredId(item.match, configuredId));
    if (candidate && !selectedMatchIds.has(candidate.match.matchId)) {
      selected.push({ ...candidate, reason: "explicit" });
      selectedMatchIds.add(candidate.match.matchId);
    }

    if (selected.length >= maxCandidates) {
      return selected;
    }
  }

  const latest = candidates.find((candidate) => !selectedMatchIds.has(candidate.match.matchId));
  if (latest) {
    selected.push({ ...latest, reason: "latest-finished" });
    selectedMatchIds.add(latest.match.matchId);
  }

  for (const candidate of candidates) {
    if (selected.length >= maxCandidates) {
      break;
    }

    if (!selectedMatchIds.has(candidate.match.matchId)) {
      selected.push({ ...candidate, reason: "backfill" });
      selectedMatchIds.add(candidate.match.matchId);
    }
  }

  return selected;
}

function getExistingApiFixtureId(match: ExternalMatchRecord, matches: ExternalMatchRecord[]): string | null {
  const matchKey = getExternalMatchKey(match);
  const existing = matches.find((candidate) => candidate.source === "api-football" && candidate.fixtureId && getExternalMatchKey(candidate) === matchKey);
  return existing?.fixtureId ?? null;
}

function fixtureMatchesFootballDataMatch(fixture: ApiFootballFixture, match: ExternalMatchRecord): boolean {
  const parsed = parseApiFootballFixture(fixture);
  return Boolean(parsed && getExternalMatchKey(parsed) === getExternalMatchKey(match));
}

async function getFixturesForDate(
  dateKey: string,
  cache: Map<string, ApiFootballFixture[]>,
  budget: ApiFootballRequestBudget
): Promise<ApiFootballFixture[]> {
  const cached = cache.get(dateKey);
  if (cached) {
    return cached;
  }

  if (!hasRequestBudget(budget)) {
    return [];
  }

  const fixtures = filterWorldCupFixtures(await fetchFixturesByDate(dateKey, process.env, budget));
  cache.set(dateKey, fixtures);
  return fixtures;
}

async function resolveFixtureForMatch(
  match: ExternalMatchRecord,
  existingMatches: ExternalMatchRecord[],
  fixturesByDate: Map<string, ApiFootballFixture[]>,
  budget: ApiFootballRequestBudget
): Promise<ResolvedFixture | null> {
  const existingFixtureId = getExistingApiFixtureId(match, existingMatches);
  if (existingFixtureId) {
    if (!hasRequestBudget(budget)) {
      return null;
    }

    const fixture = await fetchFixtureById(existingFixtureId, process.env, budget);
    return fixture ? { fixture, fixtureId: existingFixtureId } : null;
  }

  const dateKey = getDateKey(match.kickedOffAt);
  if (!dateKey) {
    return null;
  }

  const fixture = (await getFixturesForDate(dateKey, fixturesByDate, budget)).find((item) => fixtureMatchesFootballDataMatch(item, match));
  const fixtureId = fixture ? getFixtureId(fixture) : null;
  return fixture && fixtureId ? { fixture, fixtureId } : null;
}

function attachGoalToFootballDataMatch(goal: ExternalGoalRecord, match: ExternalMatchRecord): ExternalGoalRecord {
  return {
    ...goal,
    matchId: match.matchId,
    matchLabel: match.label,
    kickedOffAt: match.kickedOffAt ?? goal.kickedOffAt
  };
}

function attachParticipantToFootballDataMatch(
  participant: ExternalMatchParticipantRecord,
  match: ExternalMatchRecord
): ExternalMatchParticipantRecord {
  return {
    ...participant,
    matchId: match.matchId
  };
}

function shouldFetchEvents(candidate: ApiFootballEnrichmentCandidate, fixture: ApiFootballFixture): boolean {
  return fixtureCanHaveEvents(fixture) && (candidate.syncState.needsEventBackfill || candidate.syncState.needsLineupBackfill);
}

async function enrichCandidate(
  candidate: ApiFootballEnrichmentCandidate,
  fixture: ApiFootballFixture,
  fixtureId: string,
  budget: ApiFootballRequestBudget
): Promise<{
  goals: ExternalGoalRecord[];
  participants: ExternalMatchParticipantRecord[];
  matches: ExternalMatchRecord[];
}> {
  const goals: ExternalGoalRecord[] = [];
  const participants: ExternalMatchParticipantRecord[] = [];
  const parsedMatch = parseApiFootballFixture(fixture);
  const matches = parsedMatch ? [parsedMatch] : [];

  if (shouldFetchEvents(candidate, fixture) && hasRequestBudget(budget)) {
    const events = await fetchFixtureEvents(fixtureId, process.env, budget);
    goals.push(...parseApiFootballEvents(fixtureId, events, fixture).map((goal) => attachGoalToFootballDataMatch(goal, candidate.match)));
    participants.push(
      ...parseApiFootballSubstitutions(fixtureId, events).map((participant) =>
        attachParticipantToFootballDataMatch(participant, candidate.match)
      )
    );
  }

  if (candidate.syncState.needsLineupBackfill && fixtureHasPickedTeam(fixture) && hasRequestBudget(budget)) {
    participants.push(
      ...parseApiFootballLineups(fixtureId, await fetchFixtureLineups(fixtureId, process.env, budget)).map((participant) =>
        attachParticipantToFootballDataMatch(participant, candidate.match)
      )
    );
  }

  return { goals, participants, matches };
}

export const apiFootballSource: GoalSource = {
  name: "api-football",
  async fetchGoals(): Promise<GoalSourceResult> {
    const budget = createApiFootballRequestBudget(process.env);
    const snapshot = await readSnapshot();
    const candidates = getApiFootballEnrichmentCandidates(snapshot.matches, snapshot.goals, snapshot.participants, process.env);
    const fixturesByDate = new Map<string, ApiFootballFixture[]>();
    const goals: ExternalGoalRecord[] = [];
    const matches: ExternalMatchRecord[] = [];
    const participants: ExternalMatchParticipantRecord[] = [];

    for (const candidate of candidates) {
      if (!hasRequestBudget(budget)) {
        break;
      }

      const resolved = await resolveFixtureForMatch(candidate.match, snapshot.matches, fixturesByDate, budget);
      if (!resolved) {
        console.warn(`Skipping API-Football enrichment for ${candidate.match.matchId}: no matching fixture found.`);
        continue;
      }

      const result = await enrichCandidate(candidate, resolved.fixture, resolved.fixtureId, budget);
      goals.push(...result.goals);
      matches.push(...result.matches);
      participants.push(...result.participants);
    }

    return {
      source: "api-football",
      fetchedAt: new Date().toISOString(),
      goals,
      matches,
      participants,
      mergeWithExisting: true,
      preserveExistingGoals: true,
      preserveExistingMatches: true,
      preserveExistingParticipants: true,
      sourceRequestCount: budget.used,
      sourceRequestLimit: budget.limit
    };
  }
};
