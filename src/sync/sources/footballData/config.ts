export const defaultBaseUrl = "https://api.football-data.org/v4";
export const defaultCompetitionCode = "WC";
export const defaultSeason = "2026";
export const defaultRequestLimit = 6;
export const defaultScorerLimit = 100;
export const defaultTimeoutMs = 10_000;
export const defaultMaxThrottleMs = 70_000;
export const defaultMaintenanceLookaheadDays = 7;

export type FootballDataDateRange = {
  from: string;
  to: string;
  dateKeys: string[];
};

export type FootballDataRequestBudget = {
  limit: number;
  used: number;
  serverRequestsAvailable?: number;
  serverCounterResetSeconds?: number;
};

export function getOptionalEnvValue(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function parsePositiveInteger(value: string, envName: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${envName} must be a positive integer.`);
  }

  return parsed;
}

export function getFootballDataToken(env: NodeJS.ProcessEnv = process.env): string {
  const token = getOptionalEnvValue(env.FOOTBALL_DATA_TOKEN);
  if (!token) {
    throw new Error("FOOTBALL_DATA_TOKEN is not set.");
  }

  return token;
}

export function getFootballDataBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return getOptionalEnvValue(env.FOOTBALL_DATA_BASE_URL) ?? defaultBaseUrl;
}

export function getFootballDataCompetitionCode(env: NodeJS.ProcessEnv = process.env): string {
  return getOptionalEnvValue(env.FOOTBALL_DATA_COMPETITION) ?? defaultCompetitionCode;
}

export function getFootballDataSeason(env: NodeJS.ProcessEnv = process.env): string {
  return getOptionalEnvValue(env.FOOTBALL_DATA_SEASON) ?? defaultSeason;
}

export function getFootballDataTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const configured = getOptionalEnvValue(env.FOOTBALL_DATA_TIMEOUT_MS);
  return configured ? parsePositiveInteger(configured, "FOOTBALL_DATA_TIMEOUT_MS") : defaultTimeoutMs;
}

export function getFootballDataRequestLimit(env: NodeJS.ProcessEnv = process.env): number {
  const configured = getOptionalEnvValue(env.FOOTBALL_DATA_MAX_REQUESTS);
  return configured ? parsePositiveInteger(configured, "FOOTBALL_DATA_MAX_REQUESTS") : defaultRequestLimit;
}

export function getFootballDataScorerLimit(env: NodeJS.ProcessEnv = process.env): number {
  const configured = getOptionalEnvValue(env.FOOTBALL_DATA_SCORER_LIMIT);
  return configured ? parsePositiveInteger(configured, "FOOTBALL_DATA_SCORER_LIMIT") : defaultScorerLimit;
}

export function getFootballDataMaxThrottleMs(env: NodeJS.ProcessEnv = process.env): number {
  const configured = getOptionalEnvValue(env.FOOTBALL_DATA_MAX_THROTTLE_MS);
  return configured ? parsePositiveInteger(configured, "FOOTBALL_DATA_MAX_THROTTLE_MS") : defaultMaxThrottleMs;
}

export function getFootballDataMaintenanceLookaheadDays(env: NodeJS.ProcessEnv = process.env): number {
  const configured = getOptionalEnvValue(env.FOOTBALL_DATA_MAINTENANCE_LOOKAHEAD_DAYS);
  return configured ? parsePositiveInteger(configured, "FOOTBALL_DATA_MAINTENANCE_LOOKAHEAD_DAYS") : defaultMaintenanceLookaheadDays;
}

export function createFootballDataRequestBudget(env: NodeJS.ProcessEnv = process.env): FootballDataRequestBudget {
  return {
    limit: getFootballDataRequestLimit(env),
    used: 0
  };
}

export function claimFootballDataRequestBudget(budget: FootballDataRequestBudget): void {
  if (budget.used >= budget.limit) {
    throw new Error(`football-data request budget exhausted (${budget.used}/${budget.limit}).`);
  }

  budget.used += 1;
}

export function formatDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDateKey(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid football-data date: ${value}`);
  }

  return date;
}

function enumerateDateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const cursor = parseDateKey(from);
  const end = parseDateKey(to);

  if (cursor.getTime() > end.getTime()) {
    throw new Error("FOOTBALL_DATA_DATE_FROM must be before FOOTBALL_DATA_DATE_TO.");
  }

  while (cursor.getTime() <= end.getTime()) {
    dates.push(formatDateKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

function addUtcDays(dateKey: string, days: number): string {
  const date = parseDateKey(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateKey(date);
}

function getDefaultDateRange(now: Date): FootballDataDateRange {
  const from = new Date(now);
  const toInclusive = new Date(now);
  from.setUTCDate(from.getUTCDate() - 1);
  toInclusive.setUTCDate(toInclusive.getUTCDate() + 1);

  const fromKey = formatDateKey(from);
  const toKey = formatDateKey(toInclusive);

  return {
    from: fromKey,
    to: addUtcDays(toKey, 1),
    dateKeys: enumerateDateRange(fromKey, toKey)
  };
}

function getMaintenanceDateRange(env: NodeJS.ProcessEnv, now: Date): FootballDataDateRange {
  const from = new Date(now);
  const toInclusive = new Date(now);
  from.setUTCDate(from.getUTCDate() - 1);
  toInclusive.setUTCDate(toInclusive.getUTCDate() + getFootballDataMaintenanceLookaheadDays(env));

  const fromKey = formatDateKey(from);
  const toKey = formatDateKey(toInclusive);

  return {
    from: fromKey,
    to: addUtcDays(toKey, 1),
    dateKeys: enumerateDateRange(fromKey, toKey)
  };
}

export function getFootballDataDateRange(env: NodeJS.ProcessEnv = process.env, now: Date = new Date()): FootballDataDateRange {
  const explicitDates = getOptionalEnvValue(env.FOOTBALL_DATA_DATES)
    ?.split(",")
    .map((date) => date.trim())
    .filter(Boolean)
    .sort();

  if (explicitDates?.length) {
    const from = explicitDates[0];
    const toInclusive = explicitDates[explicitDates.length - 1];
    return {
      from,
      to: addUtcDays(toInclusive, 1),
      dateKeys: enumerateDateRange(from, toInclusive)
    };
  }

  if (env.FOOTBALL_DATA_DATE_FROM || env.FOOTBALL_DATA_DATE_TO) {
    const from = getOptionalEnvValue(env.FOOTBALL_DATA_DATE_FROM) ?? getOptionalEnvValue(env.FOOTBALL_DATA_DATE_TO);
    const toInclusive = getOptionalEnvValue(env.FOOTBALL_DATA_DATE_TO) ?? getOptionalEnvValue(env.FOOTBALL_DATA_DATE_FROM);
    if (!from || !toInclusive) {
      throw new Error("Both FOOTBALL_DATA_DATE_FROM and FOOTBALL_DATA_DATE_TO could not be resolved.");
    }

    return {
      from,
      to: addUtcDays(toInclusive, 1),
      dateKeys: enumerateDateRange(from, toInclusive)
    };
  }

  if (env.SYNC_WINDOW_PHASE === "maintenance") {
    return getMaintenanceDateRange(env, now);
  }

  return getDefaultDateRange(now);
}
