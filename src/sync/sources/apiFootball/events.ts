import type { GoalDetail } from "../../../domain/goalTypes";
import type { ExternalGoalRecord } from "../../../domain/goalTypes";
import type { ExternalMatchParticipantRecord } from "../../../domain/matchTypes";
import { fetchApiFootball, hasApiErrors, type ApiFootballRequestBudget } from "./config";
import { buildParticipantRecord } from "./lineups";
import { getFixtureLabel, shouldFetchFixtureEvents, type ApiFootballFixture } from "./fixtures";

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

export function fixtureCanHaveEvents(fixture: ApiFootballFixture): boolean {
  return shouldFetchFixtureEvents(fixture);
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
