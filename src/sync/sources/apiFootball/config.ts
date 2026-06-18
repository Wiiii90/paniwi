export const defaultBaseUrl = "https://v3.football.api-sports.io";
export const defaultEnrichmentRequestLimit = 6;
export const defaultExtraMatchLimit = 1;

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

export function getOptionalEnvValue(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function parseNonNegativeInteger(value: string | undefined, fallback: number, name: string): number {
  const configured = getOptionalEnvValue(value);
  if (!configured) {
    return fallback;
  }

  const limit = Number(configured);
  if (!Number.isInteger(limit) || limit < 0) {
    throw new Error(`${name} must be zero or a positive integer.`);
  }

  return limit;
}

export function getApiFootballEnrichmentRequestLimit(env: NodeJS.ProcessEnv = process.env): number {
  const limit = parseNonNegativeInteger(
    env.API_FOOTBALL_ENRICH_MAX_REQUESTS,
    defaultEnrichmentRequestLimit,
    "API_FOOTBALL_ENRICH_MAX_REQUESTS"
  );
  if (limit < 1) {
    throw new Error("API_FOOTBALL_ENRICH_MAX_REQUESTS must be at least 1.");
  }

  return limit;
}

export function getApiFootballEnrichmentExtraMatchLimit(env: NodeJS.ProcessEnv = process.env): number {
  const limit = parseNonNegativeInteger(
    env.API_FOOTBALL_ENRICH_EXTRA_MATCH_LIMIT,
    defaultExtraMatchLimit,
    "API_FOOTBALL_ENRICH_EXTRA_MATCH_LIMIT"
  );
  if (limit > 1) {
    throw new Error("API_FOOTBALL_ENRICH_EXTRA_MATCH_LIMIT must be 0 or 1.");
  }

  return limit;
}

export function createApiFootballRequestBudget(env: NodeJS.ProcessEnv = process.env): ApiFootballRequestBudget {
  return {
    limit: getApiFootballEnrichmentRequestLimit(env),
    used: 0
  };
}

export function hasRequestBudget(budget: ApiFootballRequestBudget): boolean {
  return budget.used < budget.limit;
}

export function claimRequestBudget(budget: ApiFootballRequestBudget): void {
  if (!hasRequestBudget(budget)) {
    throw new Error(`API-Football enrichment request budget exhausted (${budget.used}/${budget.limit}).`);
  }

  budget.used += 1;
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
  budget: ApiFootballRequestBudget = createApiFootballRequestBudget(env)
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
