import type { ExternalMatchParticipantRecord, MatchParticipationStatus } from "../../../domain/matchTypes";
import { fetchApiFootball, hasApiErrors, type ApiFootballRequestBudget } from "./config";
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
