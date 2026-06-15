import type { ExternalGoalRecord, GoalDetail } from "../../domain/types";
import type { GoalSource, GoalSourceResult } from "./types";

type ApiFootballEvent = {
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

type ApiFootballFixture = {
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
const worldCupLeagueId = 1;
const worldCupSeason = 2026;
const skippedFixtureStatuses = new Set(["NS", "TBD", "PST", "CANC", "ABD", "AWD", "WO"]);

function parseCommaSeparated(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
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

function getFixtureId(fixture: ApiFootballFixture): string | null {
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

async function fetchApiFootball<T>(
  path: string,
  params: Record<string, string>,
  env: NodeJS.ProcessEnv = process.env
): Promise<T> {
  const apiKey = env.API_FOOTBALL_KEY;
  if (!apiKey) {
    throw new Error("API_FOOTBALL_KEY is not set.");
  }

  const baseUrl = env.API_FOOTBALL_BASE_URL ?? defaultBaseUrl;
  const timeoutMs = Number(env.API_FOOTBALL_TIMEOUT_MS ?? 10_000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const url = new URL(path, baseUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

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

async function fetchFixtureEvents(fixtureId: string, env: NodeJS.ProcessEnv = process.env): Promise<ApiFootballEvent[]> {
  const body = await fetchApiFootball<ApiFootballEventsResponse>("/fixtures/events", { fixture: fixtureId }, env);
  if (hasApiErrors(body.errors)) {
    throw new Error(`API-Football returned errors for fixture ${fixtureId}: ${JSON.stringify(body.errors)}`);
  }

  return body.response ?? [];
}

async function fetchFixturesByDate(date: string, env: NodeJS.ProcessEnv = process.env): Promise<ApiFootballFixture[]> {
  const body = await fetchApiFootball<ApiFootballFixturesResponse>("/fixtures", { date }, env);
  if (hasApiErrors(body.errors)) {
    throw new Error(`API-Football returned errors for date ${date}: ${JSON.stringify(body.errors)}`);
  }

  return body.response ?? [];
}

async function fetchGoalsForFixtureIds(fixtureIds: string[]): Promise<ExternalGoalRecord[]> {
  const goalsByFixture = await Promise.all(
    fixtureIds.map(async (fixtureId) => parseApiFootballEvents(fixtureId, await fetchFixtureEvents(fixtureId)))
  );

  return goalsByFixture.flat();
}

async function fetchGoalsForDates(dateKeys: string[]): Promise<ExternalGoalRecord[]> {
  const fixturesByDate = await Promise.all(dateKeys.map((date) => fetchFixturesByDate(date)));
  const worldCupFixtures = fixturesByDate.flatMap(filterWorldCupFixtures);

  if (worldCupFixtures.length === 0) {
    throw new Error(`API-Football returned no World Cup fixtures for dates: ${dateKeys.join(", ")}.`);
  }

  const fixturesWithEvents = worldCupFixtures.filter(shouldFetchFixtureEvents);
  if (fixturesWithEvents.length === 0) {
    throw new Error(`API-Football returned no started World Cup fixtures for dates: ${dateKeys.join(", ")}.`);
  }

  const goalsByFixture = await Promise.all(
    fixturesWithEvents.map(async (fixture) => {
      const fixtureId = getFixtureId(fixture);
      return fixtureId ? parseApiFootballEvents(fixtureId, await fetchFixtureEvents(fixtureId), fixture) : [];
    })
  );

  return goalsByFixture.flat();
}

export const apiFootballSource: GoalSource = {
  name: "api-football",
  async fetchGoals(): Promise<GoalSourceResult> {
    const fixtureIds = parseCommaSeparated(process.env.API_FOOTBALL_FIXTURE_IDS);
    if (fixtureIds.length > 0) {
      return {
        source: "api-football",
        fetchedAt: new Date().toISOString(),
        goals: await fetchGoalsForFixtureIds(fixtureIds),
        mergeWithExisting: true
      };
    }

    const dateKeys = getApiFootballDateKeys();
    return {
      source: "api-football",
      fetchedAt: new Date().toISOString(),
      goals: await fetchGoalsForDates(dateKeys),
      coveredDateKeys: dateKeys,
      mergeWithExisting: true
    };
  }
};
