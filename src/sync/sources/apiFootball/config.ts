import type { ExternalMatchRecord } from "../../../domain/matchTypes";

export const defaultBaseUrl = "https://v3.football.api-sports.io";
export const defaultRequestLimit = 90;
export const defaultLineupRequestLimit = 4;
export const defaultMissingEventBackfillLimit = 6;
export const earlyUtcPreviousDayLookbackHours = 6;

export type SyncWindowPhase = "pre-match" | "live" | "post-match" | "settlement" | "maintenance" | "forced" | "settled";

export type ApiFootballRequestBudget = {
  limit: number;
  used: number;
};

export type ApiFootballLineupRequestBudget = {
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

export function getOptionalEnvValue(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function getSyncWindowPhase(env: NodeJS.ProcessEnv = process.env): SyncWindowPhase {
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

export function createRequestBudget(env: NodeJS.ProcessEnv = process.env): ApiFootballRequestBudget {
  return {
    limit: getApiFootballRequestLimit(env),
    used: 0
  };
}

export function createLineupRequestBudget(env: NodeJS.ProcessEnv = process.env): ApiFootballLineupRequestBudget {
  return {
    limit: getApiFootballLineupRequestLimit(env),
    used: 0
  };
}

export function claimRequestBudget(budget: ApiFootballRequestBudget): void {
  if (budget.used >= budget.limit) {
    throw new Error(`API-Football request budget exhausted (${budget.used}/${budget.limit}).`);
  }

  budget.used += 1;
}

export function claimLineupRequestBudget(budget: ApiFootballLineupRequestBudget): boolean {
  if (budget.used >= budget.limit) {
    return false;
  }

  budget.used += 1;
  return true;
}

export function formatDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getMatchDateKey(match: ExternalMatchRecord): string | null {
  if (!match.kickedOffAt) {
    return null;
  }

  const date = new Date(match.kickedOffAt);
  return Number.isNaN(date.getTime()) ? null : formatDateKey(date);
}

export function hasApiErrors(errors: unknown): boolean {
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
