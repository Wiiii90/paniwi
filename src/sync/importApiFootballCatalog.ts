import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { canonicalPlayers, canonicalTeams } from "../config/canonical";
import { normalizePlayerName } from "../domain/normalizePlayerName";
import type { CanonicalPlayer, CanonicalTeam, RosterStatus } from "../domain/types";
import {
  createRequestBudget,
  fetchApiFootball,
  filterWorldCupFixtures,
  getApiFootballDateKeys,
  getFixtureId,
  parseCommaSeparated,
  type ApiFootballFixture,
  type ApiFootballRequestBudget
} from "./sources/apiFootballSource";

const allCanonicalTeams = canonicalTeams as readonly CanonicalTeam[];
const allCanonicalPlayers = canonicalPlayers as readonly CanonicalPlayer[];
const worldCupLeagueId = 1;
const worldCupSeason = 2026;
const enableFixtureFallbackValue = "true";

type ApiFootballFixtureResponse = {
  response?: ApiFootballFixture[];
  errors?: unknown;
};

type ApiFootballTeamRecord = {
  team?: {
    id?: number;
    name?: string;
    country?: string;
    national?: boolean;
    logo?: string;
  };
};

type ApiFootballTeamsResponse = {
  response?: ApiFootballTeamRecord[];
  errors?: unknown;
};

type ApiFootballSquadPlayer = {
  id?: number;
  name?: string;
  age?: number;
  number?: number;
  position?: string;
  photo?: string;
};

type ApiFootballSquadEntry = {
  team?: {
    id?: number;
    name?: string;
    logo?: string;
  };
  players?: ApiFootballSquadPlayer[];
};

type ApiFootballSquadResponse = {
  response?: ApiFootballSquadEntry[];
  errors?: unknown;
};

type CatalogTeamRef = {
  apiFootballTeamId: number;
  name: string;
  canonicalTeamId?: string;
};

type CatalogTeamSource = "teams" | "manual" | "fixtures";

type CatalogPlayer = {
  apiFootballPlayerId: number;
  name: string;
  position?: string;
  number?: number;
  age?: number;
  photo?: string;
  canonicalPlayerId?: string;
};

type CatalogTeam = CatalogTeamRef & {
  players: CatalogPlayer[];
  errors?: string[];
};

type RosterAuditEntry = {
  playerId: string;
  displayName: string;
  teamId: string;
  currentRosterStatus?: RosterStatus;
  apiFootballPlayerId?: number;
  apiFootballName?: string;
  suggestedRosterStatus?: RosterStatus;
  reason: string;
};

type ApiFootballCatalog = {
  generatedAt: string;
  source: "api-football";
  teamSource: CatalogTeamSource;
  sourceErrors: string[];
  fixtureDateKeys: string[];
  fixtureCount: number;
  requestCount: number;
  requestLimit: number;
  teams: CatalogTeam[];
  audit: {
    matchedCanonicalPlayers: number;
    apiFootballPlayerIdSuggestions: RosterAuditEntry[];
    statusSuggestions: RosterAuditEntry[];
    teamsWithoutSquads: CatalogTeamRef[];
    canonicalTeamsNotInFixtureCatalog: string[];
  };
};

function getCatalogEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return {
    ...env,
    API_FOOTBALL_DATES: env.API_FOOTBALL_CATALOG_DATES ?? env.API_FOOTBALL_DATES,
    API_FOOTBALL_DATE_FROM: env.API_FOOTBALL_CATALOG_DATE_FROM ?? env.API_FOOTBALL_DATE_FROM,
    API_FOOTBALL_DATE_TO: env.API_FOOTBALL_CATALOG_DATE_TO ?? env.API_FOOTBALL_DATE_TO
  };
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

function sortByName<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name));
}

function hasDateConfig(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.API_FOOTBALL_DATES || env.API_FOOTBALL_DATE_FROM || env.API_FOOTBALL_DATE_TO);
}

function getTeamNameKeys(team: CanonicalTeam): string[] {
  return [team.displayName, ...(team.aliases ?? [])].map(normalizePlayerName);
}

function getPlayerNameKeys(player: CanonicalPlayer): string[] {
  return [player.displayName, ...(player.aliases ?? [])].map(normalizePlayerName);
}

function resolveCanonicalTeam(teamName: string, apiFootballTeamId: number): CanonicalTeam | null {
  return (
    allCanonicalTeams.find((team) => team.apiFootballTeamId === apiFootballTeamId) ??
    allCanonicalTeams.find((team) => getTeamNameKeys(team).includes(normalizePlayerName(teamName))) ??
    null
  );
}

function resolveCanonicalPlayer(apiPlayer: ApiFootballSquadPlayer, canonicalTeamId?: string): CanonicalPlayer | null {
  if (apiPlayer.id !== undefined) {
    const idMatch = allCanonicalPlayers.find((player) => player.apiFootballPlayerId === apiPlayer.id);
    if (idMatch) {
      return idMatch;
    }
  }

  if (!canonicalTeamId || !apiPlayer.name) {
    return null;
  }

  const playerNameKey = normalizePlayerName(apiPlayer.name);
  return (
    allCanonicalPlayers.find(
      (player) => player.teamId === canonicalTeamId && getPlayerNameKeys(player).includes(playerNameKey)
    ) ?? null
  );
}

function getFixtureTeamRefs(fixtures: ApiFootballFixture[]): CatalogTeamRef[] {
  const refsByApiId = new Map<number, CatalogTeamRef>();

  for (const fixture of fixtures) {
    for (const team of [fixture.teams?.home, fixture.teams?.away]) {
      if (typeof team?.id !== "number" || !team.name?.trim()) {
        continue;
      }

      const canonicalTeam = resolveCanonicalTeam(team.name, team.id);
      refsByApiId.set(team.id, {
        apiFootballTeamId: team.id,
        name: team.name.trim(),
        canonicalTeamId: canonicalTeam?.teamId
      });
    }
  }

  return sortByName([...refsByApiId.values()]);
}

function parseManualTeamRefs(value: string | undefined): CatalogTeamRef[] {
  const refs = parseCommaSeparated(value).map((item) => {
    const [rawId, ...nameParts] = item.split(":");
    const apiFootballTeamId = Number(rawId.trim());
    if (!Number.isInteger(apiFootballTeamId) || apiFootballTeamId < 1) {
      throw new Error(`Invalid API_FOOTBALL_CATALOG_TEAM_IDS entry: ${item}`);
    }

    const name = nameParts.join(":").trim() || `Team ${apiFootballTeamId}`;
    const canonicalTeam = resolveCanonicalTeam(name, apiFootballTeamId);
    return {
      apiFootballTeamId,
      name,
      canonicalTeamId: canonicalTeam?.teamId
    };
  });

  const refsById = new Map<number, CatalogTeamRef>();
  for (const ref of refs) {
    refsById.set(ref.apiFootballTeamId, ref);
  }

  return sortByName([...refsById.values()]);
}

async function fetchWorldCupTeams(
  env: NodeJS.ProcessEnv,
  budget: ApiFootballRequestBudget
): Promise<CatalogTeamRef[]> {
  const body = await fetchApiFootball<ApiFootballTeamsResponse>(
    "/teams",
    { league: String(worldCupLeagueId), season: String(worldCupSeason) },
    env,
    budget
  );
  if (hasApiErrors(body.errors)) {
    throw new Error(`API-Football returned team errors: ${JSON.stringify(body.errors)}`);
  }

  const teamRefs = (body.response ?? []).flatMap((record) => {
    const teamId = record.team?.id;
    const teamName = record.team?.name?.trim();
    if (typeof teamId !== "number" || !teamName) {
      return [];
    }

    const canonicalTeam = resolveCanonicalTeam(teamName, teamId);
    return [
      {
        apiFootballTeamId: teamId,
        name: teamName,
        canonicalTeamId: canonicalTeam?.teamId
      }
    ];
  });

  if (teamRefs.length === 0) {
    throw new Error("API-Football returned no World Cup teams.");
  }

  return sortByName(teamRefs);
}

async function fetchFixturesByDate(
  date: string,
  env: NodeJS.ProcessEnv,
  budget: ApiFootballRequestBudget
): Promise<ApiFootballFixture[]> {
  const body = await fetchApiFootball<ApiFootballFixtureResponse>("/fixtures", { date }, env, budget);
  if (hasApiErrors(body.errors)) {
    throw new Error(`API-Football returned fixture errors for ${date}: ${JSON.stringify(body.errors)}`);
  }

  return filterWorldCupFixtures(body.response ?? []);
}

async function fetchWorldCupFixtures(
  dateKeys: string[],
  env: NodeJS.ProcessEnv,
  budget: ApiFootballRequestBudget
): Promise<ApiFootballFixture[]> {
  const fixturesById = new Map<string, ApiFootballFixture>();

  for (const date of dateKeys) {
    const fixtures = await fetchFixturesByDate(date, env, budget);
    for (const fixture of fixtures) {
      const fixtureId = getFixtureId(fixture);
      if (fixtureId) {
        fixturesById.set(fixtureId, fixture);
      }
    }
  }

  return [...fixturesById.values()].sort((a, b) => {
    const dateA = a.fixture?.date ?? "";
    const dateB = b.fixture?.date ?? "";
    return dateA.localeCompare(dateB);
  });
}

async function fetchCatalogTeamRefs(
  dateKeys: string[],
  env: NodeJS.ProcessEnv,
  budget: ApiFootballRequestBudget
): Promise<{ teamRefs: CatalogTeamRef[]; fixtureCount: number; teamSource: CatalogTeamSource; sourceErrors: string[] }> {
  const sourceErrors: string[] = [];
  const manualTeamRefs = parseManualTeamRefs(env.API_FOOTBALL_CATALOG_TEAM_IDS);

  if (manualTeamRefs.length > 0) {
    return {
      teamRefs: manualTeamRefs,
      fixtureCount: 0,
      teamSource: "manual",
      sourceErrors
    };
  }

  try {
    return {
      teamRefs: await fetchWorldCupTeams(env, budget),
      fixtureCount: 0,
      teamSource: "teams",
      sourceErrors
    };
  } catch (error) {
    sourceErrors.push(error instanceof Error ? error.message : String(error));
  }

  if (env.API_FOOTBALL_CATALOG_ALLOW_FIXTURE_FALLBACK !== enableFixtureFallbackValue) {
    throw new Error(
      [
        "API-Football teams endpoint did not return the World Cup team catalog.",
        ...sourceErrors,
        "Fixture fallback is disabled because it is incomplete and often blocked in the Free plan.",
        "Set API_FOOTBALL_CATALOG_TEAM_IDS to explicit team IDs, or set API_FOOTBALL_CATALOG_ALLOW_FIXTURE_FALLBACK=true with explicit catalog dates for debugging only."
      ].join(" ")
    );
  }

  if (dateKeys.length === 0) {
    throw new Error("Fixture fallback needs API_FOOTBALL_CATALOG_DATES or API_FOOTBALL_CATALOG_DATE_FROM/API_FOOTBALL_CATALOG_DATE_TO.");
  }

  const fixtures = await fetchWorldCupFixtures(dateKeys, env, budget);
  const teamRefs = getFixtureTeamRefs(fixtures);
  if (teamRefs.length === 0) {
    throw new Error(`API-Football returned no World Cup teams from teams endpoint or fixture fallback.`);
  }

  return {
    teamRefs,
    fixtureCount: fixtures.length,
    teamSource: "fixtures",
    sourceErrors
  };
}

async function fetchSquadEntry(
  team: CatalogTeamRef,
  env: NodeJS.ProcessEnv,
  budget: ApiFootballRequestBudget
): Promise<ApiFootballSquadEntry | undefined> {
  const body = await fetchApiFootball<ApiFootballSquadResponse>(
    "/players/squads",
    { team: String(team.apiFootballTeamId) },
    env,
    budget
  );
  if (hasApiErrors(body.errors)) {
    throw new Error(`API-Football returned squad errors for ${team.name}: ${JSON.stringify(body.errors)}`);
  }

  return body.response?.find((item) => item.team?.id === team.apiFootballTeamId) ?? body.response?.[0];
}

function toCatalogPlayer(apiPlayer: ApiFootballSquadPlayer, canonicalTeamId?: string): CatalogPlayer | null {
  if (typeof apiPlayer.id !== "number" || !apiPlayer.name?.trim()) {
    return null;
  }

  const canonicalPlayer = resolveCanonicalPlayer(apiPlayer, canonicalTeamId);
  return {
    apiFootballPlayerId: apiPlayer.id,
    name: apiPlayer.name.trim(),
    position: apiPlayer.position,
    number: apiPlayer.number,
    age: apiPlayer.age,
    photo: apiPlayer.photo,
    canonicalPlayerId: canonicalPlayer?.playerId
  };
}

async function buildCatalogTeams(
  teamRefs: CatalogTeamRef[],
  env: NodeJS.ProcessEnv,
  budget: ApiFootballRequestBudget
): Promise<CatalogTeam[]> {
  const teams: CatalogTeam[] = [];

  for (const team of teamRefs) {
    try {
      const squadEntry = await fetchSquadEntry(team, env, budget);
      const resolvedTeamName = squadEntry?.team?.name?.trim() || team.name;
      const canonicalTeam = team.canonicalTeamId ? null : resolveCanonicalTeam(resolvedTeamName, team.apiFootballTeamId);
      const resolvedTeam = {
        ...team,
        name: resolvedTeamName,
        canonicalTeamId: team.canonicalTeamId ?? canonicalTeam?.teamId
      };
      teams.push({
        ...resolvedTeam,
        players: sortByName((squadEntry?.players ?? []).flatMap((player) => toCatalogPlayer(player, resolvedTeam.canonicalTeamId) ?? []))
      });
    } catch (error) {
      teams.push({
        ...team,
        players: [],
        errors: [error instanceof Error ? error.message : String(error)]
      });
    }
  }

  return teams;
}

function makeAuditEntry(player: CanonicalPlayer, reason: string, apiPlayer?: CatalogPlayer): RosterAuditEntry {
  return {
    playerId: player.playerId,
    displayName: player.displayName,
    teamId: player.teamId,
    currentRosterStatus: player.rosterStatus,
    apiFootballPlayerId: apiPlayer?.apiFootballPlayerId,
    apiFootballName: apiPlayer?.name,
    reason
  };
}

function buildAudit(teams: CatalogTeam[]): ApiFootballCatalog["audit"] {
  const matchedCanonicalPlayerIds = new Set<string>();
  const playersByCanonicalId = new Map<string, CatalogPlayer>();
  const fetchedCanonicalTeamIds = new Set(teams.flatMap((team) => team.canonicalTeamId ?? []));

  for (const team of teams) {
    for (const player of team.players) {
      if (player.canonicalPlayerId) {
        matchedCanonicalPlayerIds.add(player.canonicalPlayerId);
        playersByCanonicalId.set(player.canonicalPlayerId, player);
      }
    }
  }

  const apiFootballPlayerIdSuggestions: RosterAuditEntry[] = [];
  const statusSuggestions: RosterAuditEntry[] = [];

  for (const player of allCanonicalPlayers) {
    if (!fetchedCanonicalTeamIds.has(player.teamId)) {
      continue;
    }

    const apiPlayer = playersByCanonicalId.get(player.playerId);
    if (apiPlayer) {
      if (player.apiFootballPlayerId !== apiPlayer.apiFootballPlayerId) {
        apiFootballPlayerIdSuggestions.push(makeAuditEntry(player, "api-football-player-id-suggestion", apiPlayer));
      }

      if (player.rosterStatus === "not-nominated") {
        statusSuggestions.push({
          ...makeAuditEntry(player, "marked-not-nominated-but-found-in-api-squad", apiPlayer),
          suggestedRosterStatus: "nominated"
        });
      }
      continue;
    }

    if (player.rosterStatus === "nominated" || player.rosterStatus === "unknown" || player.rosterStatus === undefined) {
      statusSuggestions.push({
        ...makeAuditEntry(player, "not-found-in-api-squad"),
        suggestedRosterStatus: "not-nominated"
      });
    }
  }

  return {
    matchedCanonicalPlayers: matchedCanonicalPlayerIds.size,
    apiFootballPlayerIdSuggestions: apiFootballPlayerIdSuggestions.sort((a, b) =>
      a.displayName.localeCompare(b.displayName)
    ),
    statusSuggestions: statusSuggestions.sort((a, b) => a.displayName.localeCompare(b.displayName)),
    teamsWithoutSquads: teams
      .filter((team) => team.errors?.length)
      .map(({ apiFootballTeamId, name, canonicalTeamId }) => ({ apiFootballTeamId, name, canonicalTeamId })),
    canonicalTeamsNotInFixtureCatalog: allCanonicalTeams
      .filter((team) => !fetchedCanonicalTeamIds.has(team.teamId))
      .map((team) => team.teamId)
      .sort()
  };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  const target = resolve(path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  const env = getCatalogEnv();
  const dateKeys = hasDateConfig(env) ? getApiFootballDateKeys(env) : [];
  const fixtureIds = parseCommaSeparated(env.API_FOOTBALL_FIXTURE_IDS);

  if (fixtureIds.length > 0) {
    throw new Error("sync:api-catalog uses date windows, not API_FOOTBALL_FIXTURE_IDS.");
  }

  const budget = createRequestBudget(env);
  const { teamRefs, fixtureCount, teamSource, sourceErrors } = await fetchCatalogTeamRefs(dateKeys, env, budget);
  const teams = await buildCatalogTeams(teamRefs, env, budget);
  const catalog: ApiFootballCatalog = {
    generatedAt: new Date().toISOString(),
    source: "api-football",
    teamSource,
    sourceErrors,
    fixtureDateKeys: dateKeys,
    fixtureCount,
    requestCount: budget.used,
    requestLimit: budget.limit,
    teams,
    audit: buildAudit(teams)
  };

  await writeJson("public/data/api-football-catalog.json", catalog);
  console.log(
    [
      `Wrote public/data/api-football-catalog.json`,
      `teamSource=${catalog.teamSource}`,
      `fixtures=${catalog.fixtureCount}`,
      `teams=${catalog.teams.length}`,
      `matchedPlayers=${catalog.audit.matchedCanonicalPlayers}`,
      `requests=${catalog.requestCount}/${catalog.requestLimit}`
    ].join(" ")
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
