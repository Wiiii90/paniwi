import { pathToFileURL } from "node:url";
import {
  getFootballDataBaseUrl,
  getFootballDataCompetitionCode,
  getFootballDataDateRange,
  getFootballDataSeason,
  getFootballDataTimeoutMs,
  getFootballDataToken,
  getOptionalEnvValue
} from "./sources/footballData/config";

type JsonObject = Record<string, unknown>;

type ProbeKind = "core" | "derived";

type ProbePlanEntry = {
  label: string;
  kind: ProbeKind;
  url: URL;
  derivedFrom?: string;
};

type ProbeResponse = ProbePlanEntry & {
  ok: boolean;
  status: number;
  headers: JsonObject;
  responseKeys: string[];
  body: JsonObject;
  summary: JsonObject;
};

const defaultEventProbeTypes = ["GOAL", "SUB_IN", "SUB_OUT"] as const;

function buildApiUrl(path: string, params: Record<string, string | undefined> = {}, env: NodeJS.ProcessEnv = process.env): URL {
  const baseUrl = getFootballDataBaseUrl(env);
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const normalizedPath = path.replace(/^\/+/, "");
  const url = new URL(normalizedPath, normalizedBaseUrl);

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  return url;
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getObjectKeys(value: unknown): string[] {
  return isObject(value) ? Object.keys(value).sort() : [];
}

function getNestedArray(value: JsonObject, key: string): JsonObject[] {
  const nested = value[key];
  return Array.isArray(nested) ? nested.filter(isObject) : [];
}

function getNestedObject(value: JsonObject, key: string): JsonObject | null {
  const nested = value[key];
  return isObject(nested) ? nested : null;
}

function compactSample(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.slice(0, 2).map(compactSample);
  }

  if (!isObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 18)
      .map(([key, child]) => [key, Array.isArray(child) ? `[array:${child.length}]` : isObject(child) ? compactSample(child) : child])
  );
}

function compactObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return `[array:${value.length}]`;
  }

  if (!isObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 20)
      .map(([key, child]) => [key, Array.isArray(child) ? `[array:${child.length}]` : isObject(child) ? compactSample(child) : child])
  );
}

function collectArrayPaths(value: unknown, path = "$", samples: Map<string, { count: number; parents: number; sample: unknown; sampleKeys: string[] }> = new Map()): Map<string, { count: number; parents: number; sample: unknown; sampleKeys: string[] }> {
  if (Array.isArray(value)) {
    if (value.length > 0) {
      const existing = samples.get(path);
      samples.set(path, {
        count: (existing?.count ?? 0) + value.length,
        parents: (existing?.parents ?? 0) + 1,
        sample: existing?.sample ?? compactSample(value[0]),
        sampleKeys: existing?.sampleKeys ?? getObjectKeys(value[0])
      });
    }

    value.forEach((item, index) => collectArrayPaths(item, `${path}[${index}]`, samples));
    return samples;
  }

  if (isObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      collectArrayPaths(child, `${path}.${key}`, samples);
    }
  }

  return samples;
}

function summarizeArrayPaths(value: unknown): JsonObject {
  return Object.fromEntries(
    [...collectArrayPaths(value).entries()]
      .filter(([path]) => /matches|scorers|teams|squad|goals|lineups|bookings|subs|referees/i.test(path))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([path, summary]) => [
        path,
        {
          parents: summary.parents,
          items: summary.count,
          sampleKeys: summary.sampleKeys,
          sample: summary.sample
        }
      ])
  );
}

function countBy(items: JsonObject[], key: string): JsonObject {
  const counts = new Map<string, number>();

  for (const item of items) {
    const value = item[key];
    const countKey = typeof value === "string" || typeof value === "number" ? String(value) : "null";
    counts.set(countKey, (counts.get(countKey) ?? 0) + 1);
  }

  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function getNumericId(value: unknown): string | null {
  return typeof value === "number" || typeof value === "string" ? String(value) : null;
}

function getMatchIdCounts(matches: JsonObject[]): JsonObject {
  const counts = new Map<string, number>();

  for (const match of matches) {
    const key = getNumericId(match.id) ?? "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function summarizeCompetitionMatches(body: JsonObject): JsonObject {
  const matches = getNestedArray(body, "matches");

  return {
    keys: Object.keys(body).sort(),
    matchCount: matches.length,
    statusCounts: countBy(matches, "status"),
    matchesWithScore: matches.filter((match) => isObject(match.score)).length,
    firstMatchKeys: getObjectKeys(matches[0]),
    firstMatchSample: matches[0] ? compactObject(matches[0]) : null,
    arrayPaths: summarizeArrayPaths(body)
  };
}

function summarizeCompetitionScorers(body: JsonObject): JsonObject {
  const scorers = getNestedArray(body, "scorers");
  const scorersWithPenalties = scorers.filter((scorer) => typeof scorer.penalties === "number" && scorer.penalties > 0);

  return {
    keys: Object.keys(body).sort(),
    scorerCount: scorers.length,
    firstScorerKeys: getObjectKeys(scorers[0]),
    firstScorerSample: scorers[0] ? compactObject(scorers[0]) : null,
    scorersWithPenalties: scorersWithPenalties.slice(0, 5).map(compactObject),
    numericFieldStats: Object.fromEntries(
      ["goals", "penalties"].map((key) => [
        key,
        {
          rowsWithValue: scorers.filter((scorer) => typeof scorer[key] === "number").length,
          sum: scorers.reduce((sum, scorer) => sum + (typeof scorer[key] === "number" ? scorer[key] : 0), 0)
        }
      ])
    ),
    arrayPaths: summarizeArrayPaths(body)
  };
}

function summarizeCompetitionTeams(body: JsonObject): JsonObject {
  const teams = getNestedArray(body, "teams");
  const squadPlayers = teams.flatMap((team) => getNestedArray(team, "squad"));

  return {
    keys: Object.keys(body).sort(),
    teamCount: teams.length,
    teamsWithSquad: teams.filter((team) => getNestedArray(team, "squad").length > 0).length,
    squadPlayerCount: squadPlayers.length,
    squadPositionCounts: countBy(squadPlayers, "position"),
    firstTeamKeys: getObjectKeys(teams[0]),
    firstTeamSample: teams[0] ? compactObject(teams[0]) : null,
    firstSquadPlayerKeys: getObjectKeys(squadPlayers[0]),
    firstSquadPlayerSample: squadPlayers[0] ? compactObject(squadPlayers[0]) : null,
    arrayPaths: summarizeArrayPaths(body)
  };
}

function summarizePersonMatches(body: JsonObject): JsonObject {
  const matches = getNestedArray(body, "matches");

  return {
    keys: Object.keys(body).sort(),
    personKeys: getObjectKeys(getNestedObject(body, "person")),
    aggregations: getNestedObject(body, "aggregations"),
    matchCount: matches.length,
    matchIdCounts: getMatchIdCounts(matches),
    firstMatchKeys: getObjectKeys(matches[0]),
    firstMatchSample: matches[0] ? compactObject(matches[0]) : null,
    arrayPaths: summarizeArrayPaths(body)
  };
}

function summarizeSingleMatch(body: JsonObject): JsonObject {
  return {
    keys: Object.keys(body).sort(),
    id: body.id ?? null,
    status: body.status ?? null,
    utcDate: body.utcDate ?? null,
    homeTeam: compactObject(body.homeTeam),
    awayTeam: compactObject(body.awayTeam),
    score: compactObject(body.score),
    arrayPaths: summarizeArrayPaths(body),
    sample: compactObject(body)
  };
}

function summarizeBody(label: string, body: JsonObject): JsonObject {
  if (label === "competition-matches") {
    return summarizeCompetitionMatches(body);
  }

  if (label.startsWith("match-detail-")) {
    return summarizeSingleMatch(body);
  }

  if (label === "competition-scorers") {
    return summarizeCompetitionScorers(body);
  }

  if (label === "competition-teams") {
    return summarizeCompetitionTeams(body);
  }

  if (Array.isArray(body.matches) || isObject(body.person)) {
    return summarizePersonMatches(body);
  }

  return {
    keys: Object.keys(body).sort(),
    sample: compactObject(body),
    arrayPaths: summarizeArrayPaths(body)
  };
}

function getResponseHeaders(response: Response): JsonObject {
  return {
    apiVersion: response.headers.get("X-API-Version"),
    authenticatedClient: response.headers.get("X-Authenticated-Client"),
    requestsAvailable: response.headers.get("X-RequestsAvailable"),
    requestCounterReset: response.headers.get("X-RequestCounter-Reset")
  };
}

function parseJsonResponse(responseText: string): JsonObject {
  try {
    const parsed = JSON.parse(responseText) as unknown;
    return isObject(parsed) ? parsed : { value: parsed };
  } catch {
    return { text: responseText };
  }
}

async function fetchProbe(entry: ProbePlanEntry, token: string, timeoutMs: number): Promise<ProbeResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(entry.url, {
      signal: controller.signal,
      headers: {
        "X-Auth-Token": token,
        "X-Unfold-Goals": "true",
        "X-Unfold-Lineups": "true",
        "X-Unfold-Subs": "true",
        "X-Unfold-Bookings": "true"
      }
    });
    const responseText = await response.text();
    const body = parseJsonResponse(responseText);

    return {
      ...entry,
      ok: response.ok,
      status: response.status,
      headers: getResponseHeaders(response),
      responseKeys: Object.keys(body).sort(),
      body,
      summary: summarizeBody(entry.label, body)
    };
  } finally {
    clearTimeout(timeout);
  }
}

function printProbeResult(result: ProbeResponse): void {
  console.log(
    JSON.stringify(
      {
        label: result.label,
        kind: result.kind,
        derivedFrom: result.derivedFrom,
        ok: result.ok,
        status: result.status,
        request: {
          pathname: result.url.pathname,
          search: Object.fromEntries(result.url.searchParams.entries())
        },
        headers: result.headers,
        responseKeys: result.responseKeys,
        summary: result.summary
      },
      null,
      2
    )
  );
}

function getProbeMaxCalls(env: NodeJS.ProcessEnv = process.env): number {
  const configured = getOptionalEnvValue(env.FOOTBALL_DATA_PROBE_MAX_CALLS);
  if (!configured) {
    return 8;
  }

  const parsed = Number(configured);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("FOOTBALL_DATA_PROBE_MAX_CALLS must be a positive integer.");
  }

  return parsed;
}

function getProbeMode(env: NodeJS.ProcessEnv = process.env): "catalog" | "events" | "all" | "match-detail" {
  const configured = getOptionalEnvValue(env.FOOTBALL_DATA_PROBE_MODE)?.toLowerCase();
  if (!configured) {
    return "catalog";
  }

  if (configured === "catalog" || configured === "events" || configured === "all" || configured === "match-detail") {
    return configured;
  }

  throw new Error("FOOTBALL_DATA_PROBE_MODE must be catalog, events, all, or match-detail.");
}

function parseCommaSeparated(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getEventProbeTypes(env: NodeJS.ProcessEnv = process.env): string[] {
  const configured = parseCommaSeparated(env.FOOTBALL_DATA_PROBE_EVENTS);
  return configured.length > 0 ? configured : [...defaultEventProbeTypes];
}

function getMatchProbeIds(env: NodeJS.ProcessEnv = process.env): string[] {
  return parseCommaSeparated(env.FOOTBALL_DATA_PROBE_MATCH_IDS);
}

function shouldIncludeLineupFilters(env: NodeJS.ProcessEnv = process.env): boolean {
  return getOptionalEnvValue(env.FOOTBALL_DATA_PROBE_INCLUDE_LINEUPS)?.toLowerCase() === "true";
}

function getCoreProbePlan(env: NodeJS.ProcessEnv = process.env): ProbePlanEntry[] {
  const competition = getFootballDataCompetitionCode(env);
  const season = getFootballDataSeason(env);
  const dateRange = getFootballDataDateRange(env);

  return [
    {
      label: "competition",
      kind: "core",
      url: buildApiUrl(`competitions/${competition}`)
    },
    {
      label: "competition-matches",
      kind: "core",
      url: buildApiUrl(`competitions/${competition}/matches`, {
        season,
        dateFrom: dateRange.from,
        dateTo: dateRange.to
      })
    },
    {
      label: "competition-scorers",
      kind: "core",
      url: buildApiUrl(`competitions/${competition}/scorers`, {
        season,
        limit: "100"
      })
    },
    {
      label: "competition-teams",
      kind: "core",
      url: buildApiUrl(`competitions/${competition}/teams`, {
        season
      })
    }
  ];
}

function getMatchDetailProbePlan(env: NodeJS.ProcessEnv = process.env): ProbePlanEntry[] {
  const matchIds = getMatchProbeIds(env);
  if (matchIds.length === 0) {
    throw new Error("FOOTBALL_DATA_PROBE_MATCH_IDS is required when FOOTBALL_DATA_PROBE_MODE=match-detail.");
  }

  return matchIds.map((matchId) => ({
    label: `match-detail-${matchId}`,
    kind: "core",
    url: buildApiUrl(`matches/${matchId}`)
  }));
}

function findResult(results: ProbeResponse[], label: string): ProbeResponse | undefined {
  return results.find((result) => result.label === label && result.ok);
}

function findRepresentativeMatchId(body: JsonObject): string | null {
  const matches = getNestedArray(body, "matches");
  const preferred = matches.find((match) => ["IN_PLAY", "PAUSED", "EXTRA_TIME", "PENALTY_SHOOTOUT"].includes(String(match.status))) ??
    matches.find((match) => match.status === "FINISHED") ??
    matches[0];

  return preferred ? getNumericId(preferred.id) : null;
}

function findRepresentativeTeamId(body: JsonObject): string | null {
  const teams = getNestedArray(body, "teams");
  return getNumericId(teams[0]?.id);
}

function findRepresentativePersonId(results: ProbeResponse[], env: NodeJS.ProcessEnv = process.env): string | null {
  const manualPersonId = parseCommaSeparated(env.FOOTBALL_DATA_PROBE_PERSON_IDS)[0];
  if (manualPersonId) {
    return manualPersonId;
  }

  const scorers = getNestedArray(findResult(results, "competition-scorers")?.body ?? {}, "scorers");
  const firstScorer = getNestedObject(scorers[0] ?? {}, "player");
  const firstScorerId = getNumericId(firstScorer?.id);
  if (firstScorerId) {
    return firstScorerId;
  }

  const teams = getNestedArray(findResult(results, "competition-teams")?.body ?? {}, "teams");
  for (const team of teams) {
    const playerId = getNumericId(getNestedArray(team, "squad")[0]?.id);
    if (playerId) {
      return playerId;
    }
  }

  return null;
}

function buildDerivedProbePlan(results: ProbeResponse[], env: NodeJS.ProcessEnv = process.env): ProbePlanEntry[] {
  const competition = getFootballDataCompetitionCode(env);
  const mode = getProbeMode(env);
  const plan: ProbePlanEntry[] = [];
  const matchId = findRepresentativeMatchId(findResult(results, "competition-matches")?.body ?? {});
  const teamId = findRepresentativeTeamId(findResult(results, "competition-teams")?.body ?? {});
  const personId = findRepresentativePersonId(results, env);

  if (mode === "catalog" || mode === "all") {
    if (matchId) {
      plan.push({
        label: "match-detail",
        kind: "derived",
        derivedFrom: "competition-matches.id",
        url: buildApiUrl(`matches/${matchId}`)
      });
    }

    if (teamId) {
      plan.push({
        label: "team-detail",
        kind: "derived",
        derivedFrom: "competition-teams.teams[0].id",
        url: buildApiUrl(`teams/${teamId}`)
      });
    }
  }

  if ((mode === "events" || mode === "all") && personId) {
    plan.push({
      label: "person-matches",
      kind: "derived",
      derivedFrom: "FOOTBALL_DATA_PROBE_PERSON_IDS or competition-scorers.scorers[0].player.id",
      url: buildApiUrl(`persons/${personId}/matches`, {
        competitions: competition,
        limit: "20"
      })
    });

    for (const eventType of getEventProbeTypes(env)) {
      plan.push({
        label: `person-matches-event-${eventType.toLowerCase().replace(/_/g, "-")}`,
        kind: "derived",
        derivedFrom: "persons/{id}/matches + e filter",
        url: buildApiUrl(`persons/${personId}/matches`, {
          competitions: competition,
          e: eventType,
          limit: "20"
        })
      });
    }

    if (shouldIncludeLineupFilters(env)) {
      for (const lineup of ["STARTING", "BENCH"]) {
        plan.push({
          label: `person-matches-lineup-${lineup.toLowerCase()}`,
          kind: "derived",
          derivedFrom: "persons/{id}/matches + lineup filter",
          url: buildApiUrl(`persons/${personId}/matches`, {
            competitions: competition,
            lineup,
            limit: "20"
          })
        });
      }
    }
  }

  return plan;
}

async function runProbePlan(plan: ProbePlanEntry[], token: string, timeoutMs: number, maxCalls: number): Promise<ProbeResponse[]> {
  const results: ProbeResponse[] = [];

  for (const entry of plan.slice(0, maxCalls)) {
    const result = await fetchProbe(entry, token, timeoutMs);
    printProbeResult(result);
    results.push(result);
  }

  const skipped = plan.length - results.length;
  if (skipped > 0) {
    console.log(JSON.stringify({ skippedProbeCalls: skipped, reason: `FOOTBALL_DATA_PROBE_MAX_CALLS=${maxCalls}` }, null, 2));
  }

  return results;
}

export async function probeFootballData(): Promise<void> {
  const token = getFootballDataToken();
  const timeoutMs = getFootballDataTimeoutMs();
  const maxCalls = getProbeMaxCalls();
  const mode = getProbeMode();

  if (mode === "match-detail") {
    const matchDetailPlan = getMatchDetailProbePlan();
    console.log(
      JSON.stringify(
        {
          probeMode: mode,
          maxCalls,
          corePlan: matchDetailPlan.map((entry) => ({
            label: entry.label,
            pathname: entry.url.pathname,
            search: Object.fromEntries(entry.url.searchParams.entries())
          }))
        },
        null,
        2
      )
    );
    await runProbePlan(matchDetailPlan, token, timeoutMs, maxCalls);
    return;
  }

  const corePlan = getCoreProbePlan();

  console.log(
    JSON.stringify(
      {
        probeMode: mode,
        maxCalls,
        corePlan: corePlan.map((entry) => ({
          label: entry.label,
          pathname: entry.url.pathname,
          search: Object.fromEntries(entry.url.searchParams.entries())
        }))
      },
      null,
      2
    )
  );

  const coreResults = await runProbePlan(corePlan, token, timeoutMs, Math.min(maxCalls, corePlan.length));
  const remainingCalls = Math.max(0, maxCalls - coreResults.length);
  if (remainingCalls === 0) {
    return;
  }

  const derivedPlan = buildDerivedProbePlan(coreResults);
  console.log(
    JSON.stringify(
      {
        derivedPlan: derivedPlan.map((entry) => ({
          label: entry.label,
          derivedFrom: entry.derivedFrom,
          pathname: entry.url.pathname,
          search: Object.fromEntries(entry.url.searchParams.entries())
        }))
      },
      null,
      2
    )
  );

  await runProbePlan(derivedPlan, token, timeoutMs, remainingCalls);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  probeFootballData().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
