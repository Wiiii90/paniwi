import { teams } from "../../../config/teams";
import type { ExternalMatchRecord, MatchStatus } from "../../../domain/matchTypes";
import { resolveTeamFromApiFootball } from "../../../domain/teamResolver";
import {
  earlyUtcPreviousDayLookbackHours,
  fetchApiFootball,
  formatDateKey,
  getMatchDateKey,
  getSyncWindowPhase,
  hasApiErrors,
  type ApiFootballRequestBudget,
  type SyncWindowPhase,
  parseCommaSeparated
} from "./config";

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
export const scheduledFixtureStatuses = new Set(["NS", "TBD"]);
const preMatchLineupMinutesBefore = 60;
const preMatchLineupEndMinutesBefore = 5;
const liveWindowMinutesAfterKickoff = 120;
const staleLiveFixtureMaxMinutesAfterKickoff = 180;
const expectedMatchMinutes = 105;
const postMatchWindowOffsets = [15, 60, 120] as const;
const postMatchWindowDurationMinutes = 30;

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

function getTodayAndYesterdayDateKeys(now: Date): string[] {
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return [formatDateKey(yesterday), formatDateKey(now)];
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

  const phase = getSyncWindowPhase(env);
  if (phase === "forced" || phase === "settlement" || now.getUTCHours() < earlyUtcPreviousDayLookbackHours) {
    return getTodayAndYesterdayDateKeys(now);
  }

  return [formatDateKey(now)];
}

export function getFixtureId(fixture: ApiFootballFixture): string | null {
  const fixtureId = fixture.fixture?.id;
  return typeof fixtureId === "number" ? String(fixtureId) : null;
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

function isStaleLiveFixture(fixture: ApiFootballFixture, now: Date): boolean {
  const kickoffMs = getFixtureKickoffMs(fixture);
  if (!kickoffMs) {
    return false;
  }

  return now.getTime() > kickoffMs + staleLiveFixtureMaxMinutesAfterKickoff * 60 * 1000;
}

function mapFixtureStatus(fixture: ApiFootballFixture, now: Date = new Date()): MatchStatus {
  const status = fixture.fixture?.status?.short;
  if (!status) {
    return "unknown";
  }

  if (finishedFixtureStatuses.has(status)) {
    return "finished";
  }

  if (liveFixtureStatuses.has(status)) {
    if (isStaleLiveFixture(fixture, now)) {
      return "finished";
    }

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

export function getApiTeamId(teamName: string | undefined): string | undefined {
  return teamName ? (resolveTeamFromApiFootball(teamName)?.teamId ?? undefined) : undefined;
}

const pickedTeamIds = new Set(teams.flatMap((team) => team.players.map((player) => player.teamId)));

export function fixtureHasPickedTeam(fixture: ApiFootballFixture): boolean {
  const homeTeamId = getApiTeamId(fixture.teams?.home?.name);
  const awayTeamId = getApiTeamId(fixture.teams?.away?.name);
  return Boolean((homeTeamId && pickedTeamIds.has(homeTeamId)) || (awayTeamId && pickedTeamIds.has(awayTeamId)));
}

export function parseApiFootballFixture(fixture: ApiFootballFixture, now: Date = new Date()): ExternalMatchRecord | null {
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
    status: mapFixtureStatus(fixture, now),
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

export function getFixtureKickoffMs(fixture: ApiFootballFixture): number | null {
  const kickoff = fixture.fixture?.date ? Date.parse(fixture.fixture.date) : Number.NaN;
  return Number.isNaN(kickoff) ? null : kickoff;
}

function isPostMatchWindow(fixture: ApiFootballFixture, now: Date): boolean {
  const kickoffMs = getFixtureKickoffMs(fixture);
  if (!kickoffMs) {
    return false;
  }

  const expectedEndMs = kickoffMs + expectedMatchMinutes * 60 * 1000;
  return postMatchWindowOffsets.some((offsetMinutes) => {
    const from = expectedEndMs + offsetMinutes * 60 * 1000;
    const until = from + postMatchWindowDurationMinutes * 60 * 1000;
    return now.getTime() >= from && now.getTime() <= until;
  });
}

function isFixtureInPreMatchWindow(fixture: ApiFootballFixture, now: Date): boolean {
  const kickoffMs = getFixtureKickoffMs(fixture);
  if (!kickoffMs) {
    return false;
  }

  const from = kickoffMs - preMatchLineupMinutesBefore * 60 * 1000;
  const until = kickoffMs - preMatchLineupEndMinutesBefore * 60 * 1000;
  return now.getTime() >= from && now.getTime() <= until;
}

function isFixtureInLiveWindow(fixture: ApiFootballFixture, now: Date): boolean {
  const kickoffMs = getFixtureKickoffMs(fixture);
  if (!kickoffMs) {
    return liveFixtureStatuses.has(fixture.fixture?.status?.short ?? "");
  }

  const until = kickoffMs + liveWindowMinutesAfterKickoff * 60 * 1000;
  return now.getTime() >= kickoffMs && now.getTime() <= until;
}

export function shouldFetchFixtureLineups(fixture: ApiFootballFixture, phase: SyncWindowPhase, now: Date): boolean {
  const fixtureId = getFixtureId(fixture);
  if (!fixtureId) {
    return false;
  }

  if (!fixtureHasPickedTeam(fixture)) {
    return false;
  }

  const status = fixture.fixture?.status?.short;
  const hasStarted = status ? !scheduledFixtureStatuses.has(status) && !skippedFixtureStatuses.has(status) : false;

  if (phase === "forced" || phase === "settlement" || phase === "maintenance") {
    return hasStarted;
  }

  if (isFixtureInLiveWindow(fixture, now)) {
    return true;
  }

  if (isPostMatchWindow(fixture, now) && hasStarted) {
    return true;
  }

  return phase === "pre-match" && isFixtureInPreMatchWindow(fixture, now);
}

export function shouldFetchFixtureEventsForPhase(fixture: ApiFootballFixture, phase: SyncWindowPhase, now: Date): boolean {
  if (!shouldFetchFixtureEvents(fixture)) {
    return false;
  }

  if (phase === "forced") {
    return true;
  }

  if (isFixtureInLiveWindow(fixture, now)) {
    return true;
  }

  if (isPostMatchWindow(fixture, now)) {
    return true;
  }

  if (phase === "settlement" || phase === "maintenance") {
    return fixture.fixture?.status?.short ? !scheduledFixtureStatuses.has(fixture.fixture.status.short) : false;
  }

  return false;
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

export function getLiveCarryoverFixtureIds(matches: ExternalMatchRecord[]): string[] {
  return [
    ...new Set(
      matches
        .filter((match) => match.source === "api-football" && match.status === "live" && match.fixtureId)
        .map((match) => match.fixtureId!)
    )
  ];
}

export function getMatchesByFixtureId(matches: ExternalMatchRecord[]): Map<string, ExternalMatchRecord> {
  const matchesByFixtureId = new Map<string, ExternalMatchRecord>();
  for (const match of matches) {
    if (match.fixtureId) {
      matchesByFixtureId.set(match.fixtureId, match);
    }
  }

  return matchesByFixtureId;
}

export function getFixtureIdsOutsideDateKeys(
  fixtureIds: string[],
  matchesByFixtureId: Map<string, ExternalMatchRecord>,
  dateKeys: Set<string>
): string[] {
  return fixtureIds.filter((fixtureId) => {
    const match = matchesByFixtureId.get(fixtureId);
    const dateKey = match ? getMatchDateKey(match) : null;
    return !dateKey || !dateKeys.has(dateKey);
  });
}

export function mergeFixtures(fixtures: ApiFootballFixture[]): ApiFootballFixture[] {
  const fixturesById = new Map<string, ApiFootballFixture>();
  for (const fixture of fixtures) {
    const fixtureId = getFixtureId(fixture);
    if (fixtureId) {
      fixturesById.set(fixtureId, fixture);
    }
  }

  return [...fixturesById.values()];
}
