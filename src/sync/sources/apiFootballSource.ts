import { readFile } from "node:fs/promises";
import { resolveTeamFromApiFootball } from "../../domain/teamResolver";
import { teams } from "../../config/teams";
import type {
  ExternalGoalRecord,
  ExternalMatchParticipantRecord,
  ExternalMatchRecord,
  GoalDetail,
  MatchParticipationStatus,
  MatchStatus
} from "../../domain/types";
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
  assist?: {
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

type ApiFootballLineupPlayer = {
  player?: {
    id?: number;
    name?: string;
    number?: number | null;
  };
};

type ApiFootballLineup = {
  team?: {
    id?: number;
    name?: string;
  };
  startXI?: ApiFootballLineupPlayer[];
  substitutes?: ApiFootballLineupPlayer[];
};

type ApiFootballLineupsResponse = {
  response?: ApiFootballLineup[];
  errors?: unknown;
};

type ApiFootballFixturesResponse = {
  response?: ApiFootballFixture[];
  errors?: unknown;
};

const defaultBaseUrl = "https://v3.football.api-sports.io";
const defaultRequestLimit = 90;
const defaultLineupRequestLimit = 4;
const defaultMissingEventBackfillLimit = 6;
const worldCupLeagueId = 1;
const worldCupSeason = 2026;
const skippedFixtureStatuses = new Set(["NS", "TBD", "PST", "CANC", "ABD", "AWD", "WO"]);
const liveFixtureStatuses = new Set(["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT", "LIVE"]);
const finishedFixtureStatuses = new Set(["FT", "AET", "PEN"]);
const scheduledFixtureStatuses = new Set(["NS", "TBD"]);
const preMatchLineupMinutesBefore = 60;
const preMatchLineupEndMinutesBefore = 5;
const liveWindowMinutesAfterKickoff = 120;
const staleLiveFixtureMaxMinutesAfterKickoff = 180;
const expectedMatchMinutes = 105;
const postMatchWindowOffsets = [15, 60, 120] as const;
const postMatchWindowDurationMinutes = 30;
const earlyUtcPreviousDayLookbackHours = 6;

type SyncWindowPhase = "pre-match" | "live" | "post-match" | "settlement" | "maintenance" | "forced" | "settled";

type ApiFootballRequestBudget = {
  limit: number;
  used: number;
};

type ApiFootballLineupRequestBudget = {
  limit: number;
  used: number;
};

function parseCommaSeparated(value: string | undefined): string[] {
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

function getSyncWindowPhase(env: NodeJS.ProcessEnv = process.env): SyncWindowPhase {
  const phase = env.SYNC_WINDOW_PHASE;
  if (
    phase === "pre-match" ||
    phase === "live" ||
    phase === "post-match" ||
    phase === "settlement" ||
    phase === "maintenance" ||
    phase === "forced"
  ) {
    return phase;
  }

  return "settled";
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

export function getApiFootballLineupRequestLimit(env: NodeJS.ProcessEnv = process.env): number {
  const configured = getOptionalEnvValue(env.API_FOOTBALL_MAX_LINEUP_REQUESTS);
  if (!configured) {
    return defaultLineupRequestLimit;
  }

  const limit = Number(configured);
  if (!Number.isInteger(limit) || limit < 0) {
    throw new Error("API_FOOTBALL_MAX_LINEUP_REQUESTS must be zero or a positive integer.");
  }

  return limit;
}

function createRequestBudget(env: NodeJS.ProcessEnv = process.env): ApiFootballRequestBudget {
  return {
    limit: getApiFootballRequestLimit(env),
    used: 0
  };
}

function createLineupRequestBudget(env: NodeJS.ProcessEnv = process.env): ApiFootballLineupRequestBudget {
  return {
    limit: getApiFootballLineupRequestLimit(env),
    used: 0
  };
}

function claimRequestBudget(budget: ApiFootballRequestBudget): void {
  if (budget.used >= budget.limit) {
    throw new Error(`API-Football request budget exhausted (${budget.used}/${budget.limit}).`);
  }

  budget.used += 1;
}

function claimLineupRequestBudget(budget: ApiFootballLineupRequestBudget): boolean {
  if (budget.used >= budget.limit) {
    return false;
  }

  budget.used += 1;
  return true;
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

function getKnownScoreTotal(match: ExternalMatchRecord): number | null {
  if (typeof match.homeTeam.score !== "number" || typeof match.awayTeam.score !== "number") {
    return null;
  }

  return match.homeTeam.score + match.awayTeam.score;
}

export function getMissingEventBackfillFixtureIds(
  matches: ExternalMatchRecord[],
  goalCountsByFixture: Map<string, number>,
  limit: number
): string[] {
  if (limit <= 0) {
    return [];
  }

  const missingFixtureIds = matches
    .filter((match) => match.fixtureId && (match.status === "finished" || match.status === "live"))
    .filter((match) => {
      const scoreTotal = getKnownScoreTotal(match);
      return scoreTotal !== null && scoreTotal > 0 && (goalCountsByFixture.get(match.fixtureId!) ?? 0) < scoreTotal;
    })
    .sort((left, right) => (left.kickedOffAt ?? "").localeCompare(right.kickedOffAt ?? ""))
    .map((match) => match.fixtureId!)
    .slice(0, limit);

  return [...new Set(missingFixtureIds)];
}

export function getExistingFixtureIdsWithLineups(participants: ExternalMatchParticipantRecord[]): Set<string> {
  return new Set(
    participants
      .filter((participant) => participant.source === "api-football" && participant.fixtureId)
      .filter((participant) => participant.status === "starter" || participant.status === "bench")
      .map((participant) => participant.fixtureId!)
  );
}

function matchHasPickedTeam(match: ExternalMatchRecord): boolean {
  const homeTeamId = getApiTeamId(match.homeTeam.name);
  const awayTeamId = getApiTeamId(match.awayTeam.name);
  return Boolean((homeTeamId && pickedTeamIds.has(homeTeamId)) || (awayTeamId && pickedTeamIds.has(awayTeamId)));
}

function getLineupBackfillSortRank(match: ExternalMatchRecord): number {
  return match.status === "live" ? 0 : 1;
}

export function getMissingLineupBackfillFixtureIds(
  matches: ExternalMatchRecord[],
  participants: ExternalMatchParticipantRecord[],
  limit: number
): string[] {
  if (limit <= 0) {
    return [];
  }

  const fixtureIdsWithLineups = getExistingFixtureIdsWithLineups(participants);
  const candidates = matches
    .filter((match) => match.source === "api-football" && match.fixtureId)
    .filter((match) => match.status === "live" || match.status === "finished")
    .filter((match) => !fixtureIdsWithLineups.has(match.fixtureId!))
    .filter(matchHasPickedTeam)
    .sort((left, right) => {
      const rankDiff = getLineupBackfillSortRank(left) - getLineupBackfillSortRank(right);
      if (rankDiff !== 0) {
        return rankDiff;
      }

      return (right.kickedOffAt ?? "").localeCompare(left.kickedOffAt ?? "");
    })
    .map((match) => match.fixtureId!);

  return [...new Set(candidates)].slice(0, limit);
}

export function getLineupBackfillLimit(env: NodeJS.ProcessEnv = process.env): number {
  return getApiFootballLineupRequestLimit(env);
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

function getMatchesByFixtureId(matches: ExternalMatchRecord[]): Map<string, ExternalMatchRecord> {
  const matchesByFixtureId = new Map<string, ExternalMatchRecord>();
  for (const match of matches) {
    if (match.fixtureId) {
      matchesByFixtureId.set(match.fixtureId, match);
    }
  }

  return matchesByFixtureId;
}

function getMatchDateKey(match: ExternalMatchRecord): string | null {
  if (!match.kickedOffAt) {
    return null;
  }

  const date = new Date(match.kickedOffAt);
  return Number.isNaN(date.getTime()) ? null : formatDateKey(date);
}

function getFixtureIdsOutsideDateKeys(
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

function getFixtureScoreTotal(fixture: ApiFootballFixture): number | null {
  const homeGoals = fixture.goals?.home;
  const awayGoals = fixture.goals?.away;
  if (typeof homeGoals !== "number" || typeof awayGoals !== "number") {
    return null;
  }

  return homeGoals + awayGoals;
}

export function fixtureNeedsGoalEvents(
  fixture: ApiFootballFixture,
  goalCountsByFixture: Map<string, number>
): boolean {
  const fixtureId = getFixtureId(fixture);
  if (!fixtureId || !shouldFetchFixtureEvents(fixture)) {
    return false;
  }

  const scoreTotal = getFixtureScoreTotal(fixture);
  if (scoreTotal === null) {
    return true;
  }

  if (scoreTotal <= 0) {
    return false;
  }

  return (goalCountsByFixture.get(fixtureId) ?? 0) < scoreTotal;
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

function getApiTeamId(teamName: string | undefined): string | undefined {
  return teamName ? (resolveTeamFromApiFootball(teamName)?.teamId ?? undefined) : undefined;
}

const pickedTeamIds = new Set(teams.flatMap((team) => team.players.map((player) => player.teamId)));

function fixtureHasPickedTeam(fixture: ApiFootballFixture): boolean {
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

function getFixtureKickoffMs(fixture: ApiFootballFixture): number | null {
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

function getMissingEventBackfillLimit(env: NodeJS.ProcessEnv = process.env): number {
  const configured = getOptionalEnvValue(env.API_FOOTBALL_MISSING_EVENT_BACKFILL_LIMIT);
  if (!configured) {
    return defaultMissingEventBackfillLimit;
  }

  const limit = Number(configured);
  if (!Number.isInteger(limit) || limit < 0) {
    throw new Error("API_FOOTBALL_MISSING_EVENT_BACKFILL_LIMIT must be zero or a positive integer.");
  }

  return limit;
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

function isSubstitutionEvent(event: ApiFootballEvent): boolean {
  const type = event.type?.toLowerCase() ?? "";
  return type === "subst" || type === "substitution";
}

function buildParticipantRecord(
  fixtureId: string,
  playerName: string | undefined,
  nationalTeam: string | undefined,
  status: MatchParticipationStatus,
  apiPlayerId?: number,
  shirtNumber?: number | null
): ExternalMatchParticipantRecord[] {
  const normalizedPlayerName = playerName?.trim();
  const normalizedTeamName = nationalTeam?.trim();
  if (!normalizedPlayerName || !normalizedTeamName) {
    return [];
  }

  return [
    {
      source: "api-football",
      matchId: `api-football:${fixtureId}`,
      fixtureId,
      playerName: normalizedPlayerName,
      nationalTeam: normalizedTeamName,
      teamId: getApiTeamId(normalizedTeamName),
      apiPlayerId,
      status,
      shirtNumber: typeof shirtNumber === "number" ? shirtNumber : undefined
    }
  ];
}

export function parseApiFootballLineups(
  fixtureId: string,
  lineups: ApiFootballLineup[]
): ExternalMatchParticipantRecord[] {
  return lineups.flatMap((lineup) => {
    const nationalTeam = lineup.team?.name;
    const starters = (lineup.startXI ?? []).flatMap((entry) =>
      buildParticipantRecord(fixtureId, entry.player?.name, nationalTeam, "starter", entry.player?.id, entry.player?.number)
    );
    const substitutes = (lineup.substitutes ?? []).flatMap((entry) =>
      buildParticipantRecord(fixtureId, entry.player?.name, nationalTeam, "bench", entry.player?.id, entry.player?.number)
    );

    return [...starters, ...substitutes];
  });
}

export function parseApiFootballSubstitutions(
  fixtureId: string,
  events: ApiFootballEvent[]
): ExternalMatchParticipantRecord[] {
  return events.filter(isSubstitutionEvent).flatMap((event) => {
    const nationalTeam = event.team?.name;
    return [
      ...buildParticipantRecord(fixtureId, event.player?.name, nationalTeam, "subbed-out", event.player?.id),
      ...buildParticipantRecord(fixtureId, event.assist?.name, nationalTeam, "subbed-in", event.assist?.id)
    ];
  });
}

async function fetchApiFootball<T>(
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

async function fetchFixtureLineups(
  fixtureId: string,
  env: NodeJS.ProcessEnv = process.env,
  budget: ApiFootballRequestBudget = createRequestBudget(env)
): Promise<ApiFootballLineup[]> {
  const body = await fetchApiFootball<ApiFootballLineupsResponse>("/fixtures/lineups", { fixture: fixtureId }, env, budget);
  if (hasApiErrors(body.errors)) {
    throw new Error(`API-Football returned lineup errors for fixture ${fixtureId}: ${JSON.stringify(body.errors)}`);
  }

  return body.response ?? [];
}

async function fetchOptionalFixtureLineups(
  fixtureId: string,
  requestBudget: ApiFootballRequestBudget,
  lineupBudget: ApiFootballLineupRequestBudget
): Promise<ApiFootballLineup[]> {
  if (!claimLineupRequestBudget(lineupBudget)) {
    return [];
  }

  try {
    return await fetchFixtureLineups(fixtureId, process.env, requestBudget);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("HTTP 429") || message.includes("request budget exhausted")) {
      return [];
    }

    throw error;
  }
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
