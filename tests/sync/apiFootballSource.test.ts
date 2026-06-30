import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GoalRecord } from "../../src/domain/goalTypes";
import type { ExternalMatchParticipantRecord, ExternalMatchRecord } from "../../src/domain/matchTypes";
import {
  getApiFootballEnrichmentExtraMatchLimit,
  getApiFootballEnrichmentRequestLimit
} from "../../src/sync/sources/apiFootball/config";
import { parseApiFootballEvents, parseApiFootballSubstitutions } from "../../src/sync/sources/apiFootball/events";
import { parseApiFootballFixture, type ApiFootballFixture } from "../../src/sync/sources/apiFootball/fixtures";
import { parseApiFootballLineups } from "../../src/sync/sources/apiFootball/lineups";
import { apiFootballSource, getApiFootballEnrichmentCandidates } from "../../src/sync/sources/apiFootball/source";
import { getSourcesForMode, parseSyncSourceMode } from "../../src/sync/sources/sourceSelection";

assert.equal(getApiFootballEnrichmentRequestLimit({}), 6);
assert.equal(getApiFootballEnrichmentRequestLimit({ API_FOOTBALL_ENRICH_MAX_REQUESTS: "3" }), 3);
assert.throws(() => getApiFootballEnrichmentRequestLimit({ API_FOOTBALL_ENRICH_MAX_REQUESTS: "0" }), /at least 1/);
assert.equal(getApiFootballEnrichmentExtraMatchLimit({}), 0);
assert.equal(getApiFootballEnrichmentExtraMatchLimit({ API_FOOTBALL_ENRICH_EXTRA_MATCH_LIMIT: "0" }), 0);
assert.throws(() => getApiFootballEnrichmentExtraMatchLimit({ API_FOOTBALL_ENRICH_EXTRA_MATCH_LIMIT: "2" }), /0 or 1/);
assert.equal(parseSyncSourceMode("api-football-enrich"), "api-football-enrich");
assert.deepEqual(
  getSourcesForMode("api-football-enrich").map((source) => source.name),
  ["api-football"]
);
assert.deepEqual(
  getSourcesForMode("api-football").map((source) => source.name),
  ["api-football"]
);

const apiFixture: ApiFootballFixture = {
  fixture: {
    id: 9001,
    date: "2026-06-18T19:00:00+00:00",
    status: { short: "FT" }
  },
  league: { id: 1, name: "World Cup", season: 2026 },
  teams: {
    home: { id: 1, name: "Norway" },
    away: { id: 2, name: "Iraq" }
  },
  goals: { home: 4, away: 1 }
};

assert.deepEqual(parseApiFootballFixture(apiFixture), {
  source: "api-football",
  matchId: "api-football:9001",
  fixtureId: "9001",
  label: "Norway 4-1 Iraq",
  kickedOffAt: "2026-06-18T19:00:00+00:00",
  status: "finished",
  homeTeam: { id: 1, name: "Norway", score: 4 },
  awayTeam: { id: 2, name: "Iraq", score: 1 }
});

assert.deepEqual(
  parseApiFootballEvents(
    "9001",
    [
      {
        time: { elapsed: 12 },
        team: { id: 1, name: "Norway" },
        player: { id: 1100, name: "Erling Haaland" },
        type: "Goal",
        detail: "Penalty"
      },
      {
        time: { elapsed: 58 },
        team: { id: 1, name: "Norway" },
        player: { id: 1100, name: "Erling Haaland" },
        type: "Goal",
        detail: "Missed Penalty"
      },
      {
        team: { name: "Norway" },
        player: { id: 1100, name: "Erling Haaland" },
        assist: { id: 42, name: "Antonio Nusa" },
        type: "subst",
        detail: "Substitution 1"
      }
    ],
    apiFixture
  ).map((goal) => [goal.externalGoalId, goal.playerName, goal.minute, goal.detail, goal.matchLabel]),
  [["api-football:9001:1100:12:Penalty:0", "Erling Haaland", 12, "penalty", "Norway 4-1 Iraq"]]
);

assert.deepEqual(
  parseApiFootballEvents(
    "9003",
    [
      {
        time: { elapsed: 42 },
        team: { id: 2380, name: "Paraguay" },
        player: { id: 70747, name: "Julio Enciso" },
        type: "Goal",
        detail: "Normal Goal"
      },
      {
        time: { elapsed: 54 },
        team: { id: 25, name: "Germany" },
        player: { id: 978, name: "Kai Havertz" },
        type: "Goal",
        detail: "Normal Goal"
      },
      {
        time: { elapsed: 120, extra: 1 },
        team: { id: 2380, name: "Paraguay" },
        player: { id: 106485, name: "Mauricio" },
        type: "Goal",
        detail: "Penalty"
      },
      {
        time: { elapsed: 120, extra: 2 },
        team: { id: 25, name: "Germany" },
        player: { id: 502, name: "Joshua Kimmich" },
        type: "Goal",
        detail: "Penalty"
      }
    ],
    {
      fixture: {
        id: 9003,
        date: "2026-06-29T20:30:00+00:00",
        status: { short: "PEN" }
      },
      league: { id: 1, name: "World Cup", season: 2026 },
      teams: {
        home: { id: 25, name: "Germany" },
        away: { id: 2380, name: "Paraguay" }
      },
      goals: { home: 1, away: 1 }
    }
  ).map((goal) => [goal.playerName, goal.minute, goal.detail]),
  [
    ["Julio Enciso", 42, "normal"],
    ["Kai Havertz", 54, "normal"],
    ["Mauricio", 120, "penalty-shootout"],
    ["Joshua Kimmich", 120, "penalty-shootout"]
  ]
);

assert.deepEqual(
  parseApiFootballSubstitutions("9001", [
    {
      team: { name: "Norway" },
      player: { id: 1100, name: "Erling Haaland" },
      assist: { id: 42, name: "Antonio Nusa" },
      type: "subst"
    }
  ]).map((participant) => [participant.playerName, participant.status, participant.teamId]),
  [
    ["Erling Haaland", "subbed-out", "norway"],
    ["Antonio Nusa", "subbed-in", "norway"]
  ]
);

assert.deepEqual(
  parseApiFootballLineups("9001", [
    {
      team: { name: "Norway" },
      startXI: [{ player: { id: 1100, name: "Erling Haaland", number: 9 } }],
      substitutes: [{ player: { id: 42, name: "Antonio Nusa", number: 11 } }]
    }
  ]).map((participant) => [participant.playerName, participant.status, participant.shirtNumber, participant.teamId]),
  [
    ["Erling Haaland", "starter", 9, "norway"],
    ["Antonio Nusa", "bench", 11, "norway"]
  ]
);

const footballDataMatches: ExternalMatchRecord[] = [
  {
    source: "football-data",
    matchId: "football-data:newest",
    fixtureId: "newest",
    label: "Norway 4-1 Iraq",
    kickedOffAt: "2026-06-18T19:00:00.000Z",
    status: "finished",
    homeTeam: { name: "Norway", score: 4 },
    awayTeam: { name: "Iraq", score: 1 }
  },
  {
    source: "football-data",
    matchId: "football-data:older",
    fixtureId: "older",
    label: "Portugal 2-0 DR Congo",
    kickedOffAt: "2026-06-17T16:00:00.000Z",
    status: "finished",
    homeTeam: { name: "Portugal", score: 2 },
    awayTeam: { name: "DR Congo", score: 0 }
  },
  {
    source: "football-data",
    matchId: "football-data:oldest",
    fixtureId: "oldest",
    label: "France 3-1 Senegal",
    kickedOffAt: "2026-06-16T16:00:00.000Z",
    status: "finished",
    homeTeam: { name: "France", score: 3 },
    awayTeam: { name: "Senegal", score: 1 }
  }
];

const candidates = getApiFootballEnrichmentCandidates(footballDataMatches, [], [], {
  API_FOOTBALL_ENRICH_EXTRA_MATCH_LIMIT: "1"
} as NodeJS.ProcessEnv);
assert.deepEqual(
  candidates.map((candidate) => [candidate.match.matchId, candidate.reason]),
  [
    ["football-data:newest", "latest-finished"],
    ["football-data:older", "backfill"]
  ]
);
assert.deepEqual(
  getApiFootballEnrichmentCandidates(footballDataMatches, [], [], {}).map((candidate) => [candidate.match.matchId, candidate.reason]),
  [["football-data:newest", "latest-finished"]]
);

const wikipediaMatchWithMissingGoal: ExternalMatchRecord = {
  source: "wikipedia",
  matchId: "wikipedia:usa-paraguay",
  label: "United States 4-1 Paraguay",
  kickedOffAt: "2026-06-13T01:00:00.000Z",
  status: "finished",
  homeTeam: { name: "United States", score: 4 },
  awayTeam: { name: "Paraguay", score: 1 }
};
assert.equal(
  getApiFootballEnrichmentCandidates([wikipediaMatchWithMissingGoal], [], [], {
    API_FOOTBALL_ENRICH_EXTRA_MATCH_LIMIT: "0"
  } as NodeJS.ProcessEnv)[0]?.syncState.needsEventBackfill,
  true
);

const completeWikipediaGoals: GoalRecord[] = [
  {
    externalGoalId: "wikipedia:usa-paraguay:one",
    playerName: "One",
    nationalTeam: "United States",
    goals: 1,
    source: "wikipedia",
    matchId: "wikipedia:usa-paraguay",
    matchLabel: "United States 4-1 Paraguay",
    kickedOffAt: "2026-06-13T01:00:00.000Z",
    minute: 7,
    timeConfidence: "estimated",
    detail: "normal"
  },
  {
    externalGoalId: "wikipedia:usa-paraguay:two",
    playerName: "Two",
    nationalTeam: "United States",
    goals: 1,
    source: "wikipedia",
    matchId: "wikipedia:usa-paraguay",
    matchLabel: "United States 4-1 Paraguay",
    kickedOffAt: "2026-06-13T01:00:00.000Z",
    minute: 31,
    timeConfidence: "estimated",
    detail: "normal"
  },
  {
    externalGoalId: "wikipedia:usa-paraguay:three",
    playerName: "Three",
    nationalTeam: "United States",
    goals: 1,
    source: "wikipedia",
    matchId: "wikipedia:usa-paraguay",
    matchLabel: "United States 4-1 Paraguay",
    kickedOffAt: "2026-06-13T01:00:00.000Z",
    minute: 73,
    timeConfidence: "estimated",
    detail: "normal"
  },
  {
    externalGoalId: "wikipedia:usa-paraguay:four",
    playerName: "Four",
    nationalTeam: "United States",
    goals: 1,
    source: "wikipedia",
    matchId: "wikipedia:usa-paraguay",
    matchLabel: "United States 4-1 Paraguay",
    kickedOffAt: "2026-06-13T01:00:00.000Z",
    minute: 98,
    timeConfidence: "estimated",
    detail: "normal"
  },
  {
    externalGoalId: "wikipedia:usa-paraguay:five",
    playerName: "Five",
    nationalTeam: "Paraguay",
    goals: 1,
    source: "wikipedia",
    matchId: "wikipedia:usa-paraguay",
    matchLabel: "United States 4-1 Paraguay",
    kickedOffAt: "2026-06-13T01:00:00.000Z",
    minute: 7,
    timeConfidence: "estimated",
    detail: "own-goal"
  }
];
assert.equal(
  getApiFootballEnrichmentCandidates([wikipediaMatchWithMissingGoal], completeWikipediaGoals, [], {
    API_FOOTBALL_ENRICH_EXTRA_MATCH_LIMIT: "0"
  } as NodeJS.ProcessEnv)[0]?.syncState.needsEventBackfill,
  true
);

const subOnlyParticipants: ExternalMatchParticipantRecord[] = [
  {
    source: "api-football",
    matchId: "football-data:newest",
    fixtureId: "9001",
    playerName: "Antonio Nusa",
    nationalTeam: "Norway",
    teamId: "norway",
    status: "subbed-in"
  }
];
assert.equal(
  getApiFootballEnrichmentCandidates([footballDataMatches[0]!], [], subOnlyParticipants)[0]?.syncState.needsLineupBackfill,
  true
);

const staleScheduledFootballDataMatch: ExternalMatchRecord = {
  source: "football-data",
  matchId: "football-data:stale-scheduled",
  fixtureId: "stale-scheduled",
  label: "England vs Ghana",
  kickedOffAt: "2026-06-18T20:00:00.000Z",
  status: "scheduled",
  homeTeam: { name: "England" },
  awayTeam: { name: "Ghana" }
};
const staleScheduledCandidates = getApiFootballEnrichmentCandidates([staleScheduledFootballDataMatch], [], [], {
  API_FOOTBALL_ENRICH_EXTRA_MATCH_LIMIT: "0"
} as NodeJS.ProcessEnv);
assert.equal(staleScheduledCandidates[0]?.match.matchId, "football-data:stale-scheduled");
assert.equal(staleScheduledCandidates[0]?.syncState.needsEventBackfill, true);
assert.equal(staleScheduledCandidates[0]?.syncState.needsLineupBackfill, true);

assert.equal(
  getApiFootballEnrichmentCandidates(
    [
      staleScheduledFootballDataMatch,
      {
        source: "api-football",
        matchId: "api-football:999",
        fixtureId: "999",
        label: "England 2-0 Ghana",
        kickedOffAt: "2026-06-18T20:00:00.000Z",
        status: "finished",
        homeTeam: { name: "England", score: 2 },
        awayTeam: { name: "Ghana", score: 0 }
      }
    ],
    [],
    []
  ).length,
  0
);

const completeGoals: GoalRecord[] = [
  {
    externalGoalId: "api-football:9001:1",
    playerName: "One",
    nationalTeam: "Norway",
    goals: 1,
    source: "api-football",
    matchId: "football-data:newest",
    fixtureId: "9001",
    matchLabel: "Norway 4-1 Iraq",
    kickedOffAt: "2026-06-18T19:00:00.000Z",
    timeConfidence: "match-only",
    detail: "normal"
  },
  {
    externalGoalId: "api-football:9001:2",
    playerName: "Two",
    nationalTeam: "Norway",
    goals: 1,
    source: "api-football",
    matchId: "football-data:newest",
    fixtureId: "9001",
    matchLabel: "Norway 4-1 Iraq",
    kickedOffAt: "2026-06-18T19:00:00.000Z",
    timeConfidence: "match-only",
    detail: "normal"
  },
  {
    externalGoalId: "api-football:9001:3",
    playerName: "Three",
    nationalTeam: "Norway",
    goals: 1,
    source: "api-football",
    matchId: "football-data:newest",
    fixtureId: "9001",
    matchLabel: "Norway 4-1 Iraq",
    kickedOffAt: "2026-06-18T19:00:00.000Z",
    timeConfidence: "match-only",
    detail: "normal"
  },
  {
    externalGoalId: "api-football:9001:4",
    playerName: "Four",
    nationalTeam: "Norway",
    goals: 1,
    source: "api-football",
    matchId: "football-data:newest",
    fixtureId: "9001",
    matchLabel: "Norway 4-1 Iraq",
    kickedOffAt: "2026-06-18T19:00:00.000Z",
    timeConfidence: "match-only",
    detail: "normal"
  },
  {
    externalGoalId: "api-football:9001:5",
    playerName: "Five",
    nationalTeam: "Iraq",
    goals: 1,
    source: "api-football",
    matchId: "football-data:newest",
    fixtureId: "9001",
    matchLabel: "Norway 4-1 Iraq",
    kickedOffAt: "2026-06-18T19:00:00.000Z",
    timeConfidence: "match-only",
    detail: "normal"
  }
];
const completeLineups = [
  {
    ...subOnlyParticipants[0]!,
    status: "starter" as const
  }
];
assert.equal(getApiFootballEnrichmentCandidates([footballDataMatches[0]!], completeGoals, completeLineups).length, 0);

const originalFetch = globalThis.fetch;
const originalEnv = {
  API_FOOTBALL_KEY: process.env.API_FOOTBALL_KEY,
  API_FOOTBALL_ENRICH_MAX_REQUESTS: process.env.API_FOOTBALL_ENRICH_MAX_REQUESTS,
  API_FOOTBALL_ENRICH_EXTRA_MATCH_LIMIT: process.env.API_FOOTBALL_ENRICH_EXTRA_MATCH_LIMIT,
  API_FOOTBALL_ENRICH_MATCH_IDS: process.env.API_FOOTBALL_ENRICH_MATCH_IDS
};

function restoreEnv(): void {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

const originalCwd = process.cwd();
try {
  const tempCwd = mkdtempSync(join(tmpdir(), "paniwi-api-football-enrich-"));
  mkdirSync(join(tempCwd, "public", "data"), { recursive: true });
  writeFileSync(join(tempCwd, "public", "data", "raw-matches.json"), JSON.stringify(footballDataMatches));
  writeFileSync(join(tempCwd, "public", "data", "raw-goals.json"), JSON.stringify([]));
  writeFileSync(join(tempCwd, "public", "data", "raw-participants.json"), JSON.stringify([]));
  process.chdir(tempCwd);

  process.env.API_FOOTBALL_KEY = "test-key";
  process.env.API_FOOTBALL_ENRICH_MAX_REQUESTS = "6";
  process.env.API_FOOTBALL_ENRICH_EXTRA_MATCH_LIMIT = "1";
  delete process.env.API_FOOTBALL_ENRICH_MATCH_IDS;

  const requestedUrls: URL[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(input.toString());
    requestedUrls.push(url);

    if (url.pathname.endsWith("/fixtures") && url.searchParams.get("date") === "2026-06-18") {
      return Response.json({ errors: {}, response: [apiFixture] });
    }

    if (url.pathname.endsWith("/fixtures") && url.searchParams.get("date") === "2026-06-17") {
      return Response.json({
        errors: {},
        response: [
          {
            fixture: { id: 9002, date: "2026-06-17T16:00:00+00:00", status: { short: "FT" } },
            league: { id: 1, name: "World Cup", season: 2026 },
            teams: { home: { name: "Portugal" }, away: { name: "DR Congo" } },
            goals: { home: 2, away: 0 }
          }
        ]
      });
    }

    if (url.pathname.endsWith("/fixtures/events")) {
      const fixtureId = url.searchParams.get("fixture");
      return Response.json({
        errors: {},
        response: [
          {
            time: { elapsed: fixtureId === "9001" ? 12 : 33 },
            team: { name: fixtureId === "9001" ? "Norway" : "Portugal" },
            player: { id: fixtureId === "9001" ? 1100 : 99, name: fixtureId === "9001" ? "Erling Haaland" : "Joao Felix" },
            type: "Goal",
            detail: "Normal Goal"
          }
        ]
      });
    }

    if (url.pathname.endsWith("/fixtures/lineups")) {
      const fixtureId = url.searchParams.get("fixture");
      return Response.json({
        errors: {},
        response: [
          {
            team: { name: fixtureId === "9001" ? "Norway" : "Portugal" },
            startXI: [
              {
                player: {
                  id: fixtureId === "9001" ? 1100 : 99,
                  name: fixtureId === "9001" ? "Erling Haaland" : "Joao Felix",
                  number: 9
                }
              }
            ],
            substitutes: []
          }
        ]
      });
    }

    return Response.json({ errors: {}, response: [] });
  }) as typeof fetch;

  const sourceResult = await apiFootballSource.fetchGoals();

  assert.deepEqual(
    requestedUrls.map((url) => `${url.pathname}?${url.searchParams.toString()}`),
    [
      "/fixtures?date=2026-06-18",
      "/fixtures/events?fixture=9001",
      "/fixtures/lineups?fixture=9001",
      "/fixtures?date=2026-06-17",
      "/fixtures/events?fixture=9002",
      "/fixtures/lineups?fixture=9002"
    ]
  );
  assert.equal(sourceResult.sourceRequestCount, 6);
  assert.equal(sourceResult.sourceRequestLimit, 6);
  assert.equal(sourceResult.mergeWithExisting, true);
  assert.equal(sourceResult.preserveExistingGoals, true);
  assert.equal(sourceResult.preserveExistingMatches, true);
  assert.equal(sourceResult.preserveExistingParticipants, true);
  assert.deepEqual(
    sourceResult.goals.map((goal) => [goal.matchId, goal.fixtureId, goal.matchLabel, goal.playerName, goal.minute]),
    [
      ["football-data:newest", "9001", "Norway 4-1 Iraq", "Erling Haaland", 12],
      ["football-data:older", "9002", "Portugal 2-0 DR Congo", "Joao Felix", 33]
    ]
  );
  assert.deepEqual(
    sourceResult.matches?.map((match) => [match.matchId, match.fixtureId, match.label]),
    [
      ["api-football:9001", "9001", "Norway 4-1 Iraq"],
      ["api-football:9002", "9002", "Portugal 2-0 DR Congo"]
    ]
  );
  assert.deepEqual(
    sourceResult.participants?.map((participant) => [participant.matchId, participant.fixtureId, participant.playerName, participant.status]),
    [
      ["football-data:newest", "9001", "Erling Haaland", "starter"],
      ["football-data:older", "9002", "Joao Felix", "starter"]
    ]
  );
} finally {
  process.chdir(originalCwd);
  globalThis.fetch = originalFetch;
  restoreEnv();
}

console.log("API-Football enrichment tests passed.");
