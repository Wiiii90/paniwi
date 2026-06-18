import { participantTeams } from "../../../config/teams";
import type { ExternalMatchRecord, MatchStatus } from "../../../domain/matchTypes";
import { resolveTeamFromApiFootball } from "../../../domain/teamResolver";
import { fetchApiFootball, hasApiErrors, type ApiFootballRequestBudget } from "./config";

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

type ApiFootballFixturesResponse = {
  response?: ApiFootballFixture[];
  errors?: unknown;
};

const worldCupLeagueId = 1;
const worldCupSeason = 2026;
const skippedFixtureStatuses = new Set(["NS", "TBD", "PST", "CANC", "ABD", "AWD", "WO"]);
const liveFixtureStatuses = new Set(["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT", "LIVE"]);
const finishedFixtureStatuses = new Set(["FT", "AET", "PEN"]);
const scheduledFixtureStatuses = new Set(["NS", "TBD"]);
const pickedTeamIds = new Set(participantTeams.flatMap((team) => team.players.map((player) => player.teamId)));

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

export function getFixtureId(fixture: ApiFootballFixture): string | null {
  const fixtureId = fixture.fixture?.id;
  return typeof fixtureId === "number" ? String(fixtureId) : null;
}

export function getFixtureDateKey(fixture: ApiFootballFixture): string | null {
  const value = fixture.fixture?.date;
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString().slice(0, 10);
}

export function getFixtureLabel(fixture: ApiFootballFixture, fixtureId: string): string {
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

export function getFixtureScoreTotal(fixture: ApiFootballFixture): number | null {
  const homeGoals = fixture.goals?.home;
  const awayGoals = fixture.goals?.away;
  if (typeof homeGoals !== "number" || typeof awayGoals !== "number") {
    return null;
  }

  return homeGoals + awayGoals;
}

export function getApiTeamId(teamName: string | undefined): string | undefined {
  return teamName ? (resolveTeamFromApiFootball(teamName)?.teamId ?? undefined) : undefined;
}

export function fixtureHasPickedTeam(fixture: ApiFootballFixture): boolean {
  const homeTeamId = getApiTeamId(fixture.teams?.home?.name);
  const awayTeamId = getApiTeamId(fixture.teams?.away?.name);
  return Boolean((homeTeamId && pickedTeamIds.has(homeTeamId)) || (awayTeamId && pickedTeamIds.has(awayTeamId)));
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

export async function fetchFixturesByDate(
  date: string,
  env: NodeJS.ProcessEnv = process.env,
  budget: ApiFootballRequestBudget
): Promise<ApiFootballFixture[]> {
  const body = await fetchApiFootball<ApiFootballFixturesResponse>("/fixtures", { date }, env, budget);
  if (hasApiErrors(body.errors)) {
    throw new Error(`API-Football returned errors for date ${date}: ${JSON.stringify(body.errors)}`);
  }

  return body.response ?? [];
}

export async function fetchFixtureById(
  fixtureId: string,
  env: NodeJS.ProcessEnv = process.env,
  budget: ApiFootballRequestBudget
): Promise<ApiFootballFixture | null> {
  const body = await fetchApiFootball<ApiFootballFixturesResponse>("/fixtures", { id: fixtureId }, env, budget);
  if (hasApiErrors(body.errors)) {
    throw new Error(`API-Football returned errors for fixture ${fixtureId}: ${JSON.stringify(body.errors)}`);
  }

  return body.response?.[0] ?? null;
}
