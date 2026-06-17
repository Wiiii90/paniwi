import {
  claimFootballDataRequestBudget,
  getFootballDataBaseUrl,
  getFootballDataMaxThrottleMs,
  getFootballDataTimeoutMs,
  getFootballDataToken,
  type FootballDataRequestBudget
} from "./config";

type FootballDataRequestHeaders = Record<string, string>;

function parseIntegerHeader(headers: Headers, name: string): number | undefined {
  const rawValue = headers.get(name);
  if (!rawValue) {
    return undefined;
  }

  const parsed = Number(rawValue);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function updateBudgetFromHeaders(budget: FootballDataRequestBudget, headers: Headers): void {
  const requestsAvailable = parseIntegerHeader(headers, "X-RequestsAvailable");
  const counterResetSeconds = parseIntegerHeader(headers, "X-RequestCounter-Reset");

  if (requestsAvailable !== undefined) {
    budget.serverRequestsAvailable = requestsAvailable;
  }

  if (counterResetSeconds !== undefined) {
    budget.serverCounterResetSeconds = counterResetSeconds;
  }
}

function getResetDelayMs(budget: FootballDataRequestBudget): number {
  return ((budget.serverCounterResetSeconds ?? 60) + 1) * 1000;
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServerCounterIfNeeded(
  budget: FootballDataRequestBudget,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  if (budget.serverRequestsAvailable === undefined || budget.serverRequestsAvailable > 0) {
    return;
  }

  const delayMs = getResetDelayMs(budget);
  const maxDelayMs = getFootballDataMaxThrottleMs(env);
  if (delayMs > maxDelayMs) {
    throw new Error(
      `football-data rate counter is exhausted and reset delay ${delayMs}ms exceeds FOOTBALL_DATA_MAX_THROTTLE_MS (${maxDelayMs}ms).`
    );
  }

  console.log(`football-data rate counter exhausted; waiting ${delayMs}ms before the next request.`);
  await delay(delayMs);
  budget.serverRequestsAvailable = undefined;
  budget.serverCounterResetSeconds = undefined;
}

async function readResponseText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function buildUrl(path: string, params: Record<string, string>, env: NodeJS.ProcessEnv): URL {
  const baseUrl = getFootballDataBaseUrl(env);
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const normalizedPath = path.replace(/^\/+/, "");
  const url = new URL(normalizedPath, normalizedBaseUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url;
}

export async function fetchFootballData<T>(
  path: string,
  params: Record<string, string>,
  headers: FootballDataRequestHeaders = {},
  env: NodeJS.ProcessEnv = process.env,
  budget: FootballDataRequestBudget
): Promise<T> {
  const token = getFootballDataToken(env);
  const timeoutMs = getFootballDataTimeoutMs(env);
  const url = buildUrl(path, params, env);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await waitForServerCounterIfNeeded(budget, env);
    claimFootballDataRequestBudget(budget);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "X-Auth-Token": token,
          ...headers
        }
      });
      updateBudgetFromHeaders(budget, response.headers);

      if (response.status === 429 && attempt === 0) {
        budget.serverRequestsAvailable = 0;
        await waitForServerCounterIfNeeded(budget, env);
        continue;
      }

      if (!response.ok) {
        const responseText = await readResponseText(response);
        throw new Error(`football-data returned HTTP ${response.status} for ${path}${responseText ? `: ${responseText}` : ""}`);
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(`football-data returned HTTP 429 for ${path} after retry.`);
}
