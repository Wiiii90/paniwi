import type { GoalSource, GoalSourceResult } from "./types";
import type { ExternalGoalRecord, GoalDetail } from "../../domain/types";

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

type ApiFootballEventsResponse = {
  response?: ApiFootballEvent[];
  errors?: unknown;
};

const defaultBaseUrl = "https://v3.football.api-sports.io";

function parseFixtureIds(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((fixtureId) => fixtureId.trim())
    .filter(Boolean);
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

export function parseApiFootballEvents(fixtureId: string, events: ApiFootballEvent[]): ExternalGoalRecord[] {
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
        matchLabel: `Fixture ${fixtureId}`,
        minute,
        timeConfidence: typeof minute === "number" ? "match-only" : "unknown",
        detail: normalizeGoalDetail(event.detail)
      }
    ];
  });
}

async function fetchFixtureEvents(fixtureId: string, env: NodeJS.ProcessEnv = process.env): Promise<ApiFootballEvent[]> {
  const apiKey = env.API_FOOTBALL_KEY;
  if (!apiKey) {
    throw new Error("API_FOOTBALL_KEY is not set.");
  }

  const baseUrl = env.API_FOOTBALL_BASE_URL ?? defaultBaseUrl;
  const timeoutMs = Number(env.API_FOOTBALL_TIMEOUT_MS ?? 10_000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const url = new URL("/fixtures/events", baseUrl);
  url.searchParams.set("fixture", fixtureId);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "x-apisports-key": apiKey
      }
    });

    if (!response.ok) {
      throw new Error(`API-Football returned HTTP ${response.status} for fixture ${fixtureId}.`);
    }

    const body = (await response.json()) as ApiFootballEventsResponse;
    if (body.errors && JSON.stringify(body.errors) !== "[]") {
      throw new Error(`API-Football returned errors for fixture ${fixtureId}: ${JSON.stringify(body.errors)}`);
    }

    return body.response ?? [];
  } finally {
    clearTimeout(timeout);
  }
}

export const apiFootballSource: GoalSource = {
  name: "api-football",
  async fetchGoals(): Promise<GoalSourceResult> {
    const fixtureIds = parseFixtureIds(process.env.API_FOOTBALL_FIXTURE_IDS);
    if (fixtureIds.length === 0) {
      throw new Error("API_FOOTBALL_FIXTURE_IDS is not set.");
    }

    const goalsByFixture = await Promise.all(
      fixtureIds.map(async (fixtureId) => parseApiFootballEvents(fixtureId, await fetchFixtureEvents(fixtureId)))
    );

    const goals = goalsByFixture.flat();
    if (goals.length === 0) {
      throw new Error("API-Football returned no goal events for configured fixtures.");
    }

    return {
      source: "api-football",
      fetchedAt: new Date().toISOString(),
      goals
    };
  }
};
