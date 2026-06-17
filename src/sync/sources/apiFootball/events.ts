import { buildFixtureSyncState } from "../../../domain/fixtureSyncState";
import type { ExternalGoalRecord } from "../../../domain/goalTypes";
import type { ExternalMatchParticipantRecord, ExternalMatchRecord } from "../../../domain/matchTypes";
import {
  defaultMissingEventBackfillLimit,
  fetchApiFootball,
  getOptionalEnvValue,
  hasApiErrors,
  type ApiFootballRequestBudget
} from "./config";
import { buildParticipantRecord } from "./lineups";
import {
  getFixtureId,
  getFixtureLabel,
  getFixtureScoreTotal,
  shouldFetchFixtureEvents,
  type ApiFootballFixture
} from "./fixtures";
import type { GoalDetail } from "../../../domain/goalTypes";

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
  assist?: {
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

export function getMissingEventBackfillLimit(env: NodeJS.ProcessEnv = process.env): number {
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
    .filter((match) =>
      buildFixtureSyncState(match, goalCountsByFixture.get(match.fixtureId!) ?? 0, true, false).needsEventBackfill
    )
    .sort((left, right) => (left.kickedOffAt ?? "").localeCompare(right.kickedOffAt ?? ""))
    .map((match) => match.fixtureId!)
    .slice(0, limit);

  return [...new Set(missingFixtureIds)];
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

export async function fetchFixtureEvents(
  fixtureId: string,
  env: NodeJS.ProcessEnv = process.env,
  budget: ApiFootballRequestBudget
): Promise<ApiFootballEvent[]> {
  const body = await fetchApiFootball<ApiFootballEventsResponse>("/fixtures/events", { fixture: fixtureId }, env, budget);
  if (hasApiErrors(body.errors)) {
    throw new Error(`API-Football returned errors for fixture ${fixtureId}: ${JSON.stringify(body.errors)}`);
  }

  return body.response ?? [];
}
