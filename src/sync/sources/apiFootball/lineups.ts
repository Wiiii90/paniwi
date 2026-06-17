import { teams } from "../../../config/teams";
import { buildFixtureSyncState, matchHasPickedTeam as rawMatchHasPickedTeam } from "../../../domain/fixtureSyncState";
import type { ExternalMatchParticipantRecord, ExternalMatchRecord, MatchParticipationStatus } from "../../../domain/matchTypes";
import {
  claimLineupRequestBudget,
  fetchApiFootball,
  getApiFootballLineupRequestLimit,
  hasApiErrors,
  type ApiFootballLineupRequestBudget,
  type ApiFootballRequestBudget
} from "./config";
import { getApiTeamId } from "./fixtures";

type ApiFootballLineupPlayer = {
  player?: {
    id?: number;
    name?: string;
    number?: number | null;
  };
};

export type ApiFootballLineup = {
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

const pickedTeamIds = new Set(teams.flatMap((team) => team.players.map((player) => player.teamId)));

export function buildParticipantRecord(
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

export async function fetchFixtureLineups(
  fixtureId: string,
  env: NodeJS.ProcessEnv = process.env,
  budget: ApiFootballRequestBudget
): Promise<ApiFootballLineup[]> {
  const body = await fetchApiFootball<ApiFootballLineupsResponse>("/fixtures/lineups", { fixture: fixtureId }, env, budget);
  if (hasApiErrors(body.errors)) {
    throw new Error(`API-Football returned lineup errors for fixture ${fixtureId}: ${JSON.stringify(body.errors)}`);
  }

  return body.response ?? [];
}

export async function fetchOptionalFixtureLineups(
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

export function getExistingFixtureIdsWithLineups(participants: ExternalMatchParticipantRecord[]): Set<string> {
  return new Set(
    participants
      .filter((participant) => participant.source === "api-football" && participant.fixtureId)
      .filter((participant) => participant.status === "starter" || participant.status === "bench")
      .map((participant) => participant.fixtureId!)
  );
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
    .filter((match) =>
      buildFixtureSyncState(
        match,
        0,
        fixtureIdsWithLineups.has(match.fixtureId!),
        rawMatchHasPickedTeam(match, pickedTeamIds)
      ).needsLineupBackfill
    )
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
