import type { ExternalGoalRecord, ExternalMatchRecord, GoalDetail, MatchStatus } from "../../domain/types";
import type { GoalSource, GoalSourceResult } from "./types";

export type ApiFootballEvent = {
  time?: {
    elapsed?: number;
    extra?: number | null;
  };
  team?: {
    id?: number;
    name?: string;
  };
  player?: {
    id?: number;
    name?: string;
  };
  type?: string;
  detail?: string;
};

export type ApiFootballFixture = {
  fixture?: {
    id?: number;
    date?: string;
    status?: {
      short?: string;
      long?: string;
    };
  };
  league?: {
    id?: number;
    name?: string;
    season?: number;
  };
  teams?: {
    home?: {
      id?: number;
      name?: string;
    };
    away?: {
      id?: number;
      name?: string;
    };
  };
  goals?: {
    home?: number | null;
    away?: number | null;
  };
};

type ApiFootballEventsResponse = {
  response?: ApiFootballEvent[];
  errors?: unknown;
};

type ApiFootballFixturesResponse = {
  response?: ApiFootballFixture[];
  errors?: unknown;
};

const defaultBaseUrl = "https://v3.football.api-sports.io";
const defaultRequestLimit = 90;
const worldCupLeagueId = 1;
const worldCupSeason = 2026;
const skippedFixtureStatuses = new Set(["NS", "TBD", "PST", "CANC", "ABD", "AWD", "WO"]);
const liveFixtureStatuses = new Set(["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT", "LIVE"]);
const finishedFixtureStatuses = new Set(["FT", "AET", "PEN"]);
const scheduledFixtureStatuses = new Set(["NS", "TBD"]);

export type ApiFootballRequestBudget = {
  limit: number;
  used: number;
};

export function parseCommaSeparated(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getOptionalEnvValue(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function getApiFootballRequestLimit(env: NodeJS.ProcessEnv = process.env): number {
  const configured = getOptionalEnvValue(env.API_FOOTBALL_MAX_REQUESTS);
  if (!configured) {
    return defaultRequestLimit;
  }

  const limit = Number(configured);
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("API_FOOTBALL_MAX_REQUESTS must be a positive integer.");
  }

  return limit;
}

export function createRequestBudget(env: NodeJS.ProcessEnv = process.env): ApiFootballRequestBudget {
  return {
    limit: getApiFootballRequestLimit(env),
    used: 0
  };
}

function claimRequestBudget(budget: ApiFootballRequestBudget): void {
  if (budget.used >= budget.limit) {
    throw new Error(`API-Football request budget exhausted (${budget.used}/${budget.limit}).`);
  }

  budget.used += 1;
}

function formatDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDateKey(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid API-Football date: ${value}`);
  }

  return date;
}

function enumerateDateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const cursor = parseDateKey(from);
  const end = parseDateKey(to);

  if (cursor.getTime() > end.getTime()) {
    throw new Error(`API_FOOTBALL_DATE_FROM must be before API_FOOTBALL_DATE_TO.`);
  }

  while (cursor.getTime() <= end.getTime()) {
    dates.push(formatDateKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

export function getApiFootballDateKeys(env: NodeJS.ProcessEnv = process.env, now: Date = new Date()): string[] {
  const explicitDates = parseCommaSeparated(env.API_FOOTBALL_DATES);
  if (explicitDates.length > 0) {
    return explicitDates;
  }

  if (env.API_FOOTBALL_DATE_FROM || env.API_FOOTBALL_DATE_TO) {
    const from = env.API_FOOTBALL_DATE_FROM ?? env.API_FOOTBALL_DATE_TO;
    const to = env.API_FOOTBALL_DATE_TO ?? env.API_FOOTBALL_DATE_FROM;
    if (!from || !to) {
      throw new Error("Both API_FOOTBALL_DATE_FROM and API_FOOTBALL_DATE_TO could not be resolved.");
    }
    return enumerateDateRange(from, to);
  }

  return [formatDateKey(now)];
}

function normalizeGoalDetail(detail: string | undefined): GoalDetail {
  const normalized = detail?.toLowerCase() ?? "";

  if (normalized.includes("own")) {
    return "own-goal";
  }

  if (normalized.includes("penalty shootout")) {
    return "penalty-shootout";
  }

  if (normalized.includes("penalty")) {
    return "penalty";
  }

  return "normal";
}

function isGoalEvent(event: ApiFootballEvent): boolean {
  return event.type?.toLowerCase() === "goal";
}

function hasApiErrors(errors: unknown): boolean {
  if (!errors) {
    return false;
  }

  if (Array.isArray(errors)) {
    return errors.length > 0;
  }

  if (typeof errors === "object") {
    return Object.keys(errors).length > 0;
  }

  return Boolean(errors);
}

export function getFixtureId(fixture: ApiFootballFixture): string | null {
  const fixtureId = fixture.fixture?.id;
  return typeof fixtureId === "number" ? String(fixtureId) : null;
}

function getFixtureLabel(fixture: ApiFootballFixture, fixtureId: string): string {
  const homeTeam = fixture.teams?.home?.name ?? "Home";
  const awayTeam = fixture.teams?.away?.name ?? "Away";
  const homeGoals = fixture.goals?.home;
  const awayGoals = fixture.goals?.away;

  if (typeof homeGoals === "number" && typeof awayGoals === "number") {
    return `${homeTeam} ${homeGoals}-${awayGoals} ${awayTeam}`;
  }

  if (homeTeam !== "Home" || awayTeam !== "Away") {
    return `${homeTeam} vs ${awayTeam}`;
  }

  return `Fixture ${fixtureId}`;
}

function mapFixtureStatus(fixture: ApiFootballFixture): MatchStatus {
  const status = fixture.fixture?.status?.short;
  if (!status) {
    return "unknown";
  }

  if (finishedFixtureStatuses.has(status)) {
    return "finished";
  }

  if (liveFixtureStatuses.has(status)) {
    return "live";
  }

  if (scheduledFixtureStatuses.has(status)) {
    return "scheduled";
  }

  return "unknown";
}

function getTeamScore(value: number | null | undefined): number | undefined {
  return typeof value === "number" ? value : undefined;
}

export function parseApiFootballFixture(fixture: ApiFootballFixture): ExternalMatchRecord | null {
  const fixtureId = getFixtureId(fixture);
  const homeTeam = fixture.teams?.home?.name?.trim();
  const awayTeam = fixture.teams?.away?.name?.trim();
  if (!fixtureId || !homeTeam || !awayTeam) {
    return null;
  }

  return {
    source: "api-football",
    matchId: `api-football:${fixtureId}`,
    fixtureId,
    label: getFixtureLabel(fixture, fixtureId),
    kickedOffAt: fixture.fixture?.date,
    status: mapFixtureStatus(fixture),
    homeTeam: {
      id: fixture.teams?.home?.id,
      name: homeTeam,
      score: getTeamScore(fixture.goals?.home)
    },
    awayTeam: {
      id: fixture.teams?.away?.id,
      name: awayTeam,
      score: getTeamScore(fixture.goals?.away)
    }
  };
}

export function filterWorldCupFixtures(fixtures: ApiFootballFixture[]): ApiFootballFixture[] {
  return fixtures.filter((fixture) => fixture.league?.id === worldCupLeagueId && fixture.league?.season === worldCupSeason);
}

export function shouldFetchFixtureEvents(fixture: ApiFootballFixture): boolean {
  const status = fixture.fixture?.status?.short;
  return Boolean(getFixtureId(fixture) && status && !skippedFixtureStatuses.has(status));
}

export function parseApiFootballEvents(
  fixtureId: string,
  events: ApiFootballEvent[],
  fixture?: ApiFootballFixture
): ExternalGoalRecord[] {
  return events.filter(isGoalEvent).flatMap((event, index) => {
    const playerName = event.player?.name?.trim();
    const nationalTeam = event.team?.name?.trim();

    if (!playerName || !nationalTeam) {
      return [];
    }

    const minute = event.time?.elapsed;
    const extra = event.time?.extra;
    const minuteLabel = typeof minute === "number" ? `${minute}${extra ? `+${extra}` : ""}` : "unknown";

    return [
      {
        externalGoalId: `api-football:${fixtureId}:${event.player?.id ?? playerName}:${minuteLabel}:${event.detail ?? "Goal"}:${index}`,
        playerName,
        nationalTeam,
        goals: 1,
        source: "api-football",
        apiPlayerId: event.player?.id,
        fixtureId,
        matchId: `api-football:${fixtureId}`,
        matchLabel: fixture ? getFixtureLabel(fixture, fixtureId) : `Fixture ${fixtureId}`,
        kickedOffAt: fixture?.fixture?.date,
        minute,
        timeConfidence: typeof minute === "number" ? "match-only" : "unknown",
        detail: normalizeGoalDetail(event.detail)
      }
    ];
  });
}

export async function fetchApiFootball<T>(
  path: string,
  params: Record<string, string>,
  env: NodeJS.ProcessEnv = process.env,
  budget: ApiFootballRequestBudget = createRequestBudget(env)
): Promise<T> {
  const apiKey = env.API_FOOTBALL_KEY;
  if (!apiKey) {
    throw new Error("API_FOOTBALL_KEY is not set.");
  }

  const baseUrl = getOptionalEnvValue(env.API_FOOTBALL_BASE_URL) ?? defaultBaseUrl;
  const timeoutMs = Number(getOptionalEnvValue(env.API_FOOTBALL_TIMEOUT_MS) ?? 10_000);
  const url = new URL(path, baseUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  claimRequestBudget(budget);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "x-apisports-key": apiKey
      }
    });

    if (!response.ok) {
      throw new Error(`API-Football returned HTTP ${response.status} for ${path}.`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchFixtureEvents(
  fixtureId: string,
  env: NodeJS.ProcessEnv = process.env,
  budget: ApiFootballRequestBudget = createRequestBudget(env)
): Promise<ApiFootballEvent[]> {
  const body = await fetchApiFootball<ApiFootballEventsResponse>("/fixtures/events", { fixture: fixtureId }, env, budget);
  if (hasApiErrors(body.errors)) {
    throw new Error(`API-Football returned errors for fixture ${fixtureId}: ${JSON.stringify(body.errors)}`);
  }

  return body.response ?? [];
}

async function fetchFixturesByDate(
  date: string,
  env: NodeJS.ProcessEnv = process.env,
  budget: ApiFootballRequestBudget = createRequestBudget(env)
): Promise<ApiFootballFixture[]> {
  const body = await fetchApiFootball<ApiFootballFixturesResponse>("/fixtures", { date }, env, budget);
  if (hasApiErrors(body.errors)) {
    throw new Error(`API-Football returned errors for date ${date}: ${JSON.stringify(body.errors)}`);
  }

  return body.response ?? [];
}

async function fetchFixtureById(
  fixtureId: string,
  env: NodeJS.ProcessEnv = process.env,
  budget: ApiFootballRequestBudget = createRequestBudget(env)
): Promise<ApiFootballFixture | null> {
  const body = await fetchApiFootball<ApiFootballFixturesResponse>("/fixtures", { id: fixtureId }, env, budget);
  if (hasApiErrors(body.errors)) {
    throw new Error(`API-Football returned errors for fixture ${fixtureId}: ${JSON.stringify(body.errors)}`);
  }

  return body.response?.[0] ?? null;
}

async function fetchGoalsAndMatchesForFixtureIds(
  fixtureIds: string[],
  budget: ApiFootballRequestBudget
): Promise<{ goals: ExternalGoalRecord[]; fixtures: ApiFootballFixture[] }> {
  const goals: ExternalGoalRecord[] = [];
  const fixtures: ApiFootballFixture[] = [];
  for (const fixtureId of fixtureIds) {
    const fixture = await fetchFixtureById(fixtureId, process.env, budget);
    if (fixture) {
      fixtures.push(fixture);
    }

    goals.push(...parseApiFootballEvents(fixtureId, await fetchFixtureEvents(fixtureId, process.env, budget), fixture ?? undefined));
  }

  return { goals, fixtures };
}

function mergeFixtures(fixtures: ApiFootballFixture[]): ApiFootballFixture[] {
  const fixturesById = new Map<string, ApiFootballFixture>();
  for (const fixture of fixtures) {
    const fixtureId = getFixtureId(fixture);
    if (fixtureId) {
      fixturesById.set(fixtureId, fixture);
    }
  }

  return [...fixturesById.values()];
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

async function fetchGoalsForFixtures(fixtures: ApiFootballFixture[], budget: ApiFootballRequestBudget): Promise<ExternalGoalRecord[]> {
  const fixturesWithEvents = fixtures.filter(shouldFetchFixtureEvents);
  if (fixturesWithEvents.length === 0) {
    return [];
  }

  const goals: ExternalGoalRecord[] = [];
  for (const fixture of fixturesWithEvents) {
    const fixtureId = getFixtureId(fixture);
    if (fixtureId) {
      goals.push(...parseApiFootballEvents(fixtureId, await fetchFixtureEvents(fixtureId, process.env, budget), fixture));
    }
  }

  return goals;
}

export const apiFootballSource: GoalSource = {
  name: "api-football",
  async fetchGoals(): Promise<GoalSourceResult> {
    const budget = createRequestBudget();
    const fixtureIds = parseCommaSeparated(process.env.API_FOOTBALL_FIXTURE_IDS);
    const dateKeys = getApiFootballDateKeys();
    let dateFixtures: ApiFootballFixture[] = [];
    try {
      dateFixtures = await fetchFixturesForDates(dateKeys, budget);
    } catch (error) {
      if (fixtureIds.length === 0) {
        throw error;
      }
    }

    const explicitFixtureResult =
      fixtureIds.length > 0 ? await fetchGoalsAndMatchesForFixtureIds(fixtureIds, budget) : { goals: [], fixtures: [] };
    const fixtures = mergeFixtures([...dateFixtures, ...explicitFixtureResult.fixtures]);
    const explicitFixtureIds = new Set(explicitFixtureResult.fixtures.map((fixture) => getFixtureId(fixture)).filter(Boolean));
    const dateGoals = await fetchGoalsForFixtures(
      fixtures.filter((fixture) => {
        const fixtureId = getFixtureId(fixture);
        return !fixtureId || !explicitFixtureIds.has(fixtureId);
      }),
      budget
    );

    return {
      source: "api-football",
      fetchedAt: new Date().toISOString(),
      goals: [...dateGoals, ...explicitFixtureResult.goals],
      matches: fixtures.flatMap((fixture) => parseApiFootballFixture(fixture) ?? []),
      coveredDateKeys: dateFixtures.length > 0 ? dateKeys : undefined,
      mergeWithExisting: true,
      sourceRequestCount: budget.used,
      sourceRequestLimit: budget.limit
    };
  }
};
