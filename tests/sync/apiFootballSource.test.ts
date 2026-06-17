import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildLeaderboard, scoreGoalsForTeams } from "../../src/domain/buildLeaderboard";
import { buildFixtureSyncState } from "../../src/domain/fixtureSyncState";
import { buildMatches } from "../../src/domain/buildMatches";
import { buildScorers } from "../../src/domain/buildScorers";
import { normalizePlayerName } from "../../src/domain/normalizePlayerName";
import { enrichGoalsWithRoster } from "../../src/domain/rosterResolver";
import { getGoalPoints, matchesPlayer } from "../../src/domain/scoring";
import { sortGoalsChronologically } from "../../src/domain/sortGoals";
import { getLatestFinishedMatches, getTodayOrLiveMatches } from "../../src/domain/matchFilters";
import { groupGoalsBySide } from "../../src/domain/matchGrouping";
import type { GoalRecord } from "../../src/domain/goalTypes";
import type { ParticipantTeam } from "../../src/domain/participantTypes";
import type { RosterSnapshot } from "../../src/domain/rosterTypes";
import { normalizeGoals } from "../../src/sync/normalizeGoals";
import { getApiFootballLineupRequestLimit, getApiFootballRequestLimit } from "../../src/sync/sources/apiFootball/config";
import {
  filterWorldCupFixtures,
  getApiFootballDateKeys,
  getLiveCarryoverFixtureIds,
  parseApiFootballFixture,
  shouldFetchFixtureEvents,
  type ApiFootballFixture
} from "../../src/sync/sources/apiFootball/fixtures";
import {
  fixtureNeedsGoalEvents,
  getMissingEventBackfillFixtureIds,
  parseApiFootballEvents,
  parseApiFootballSubstitutions
} from "../../src/sync/sources/apiFootball/events";
import {
  getExistingFixtureIdsWithLineups,
  getMissingLineupBackfillFixtureIds,
  parseApiFootballLineups
} from "../../src/sync/sources/apiFootball/lineups";
import { apiFootballSource } from "../../src/sync/sources/apiFootball/source";
import { getSourcesForMode, parseSyncSourceMode } from "../../src/sync/sources/sourceSelection";
import { parseWikipediaFootballBoxes, parseWikipediaGoalscorers } from "../../src/sync/sources/wikipediaSource";
import { buildSourceErrorMeta, mergeGoalSnapshots, mergeParticipantSnapshots } from "../../src/sync/syncGoals";
import { buildSnapshotFingerprint } from "../../src/sync/snapshotFingerprint";
import { validateGoals } from "../../src/sync/validateGoals";
import { ambiguousNorwayRosterSnapshot, apiResolverRosterSnapshot, baseGoal, initialLastNameRosterSnapshot, legacyNormalizedNorwayRosterSnapshot, rosterSnapshot, teams } from "../helpers/domainFixtures";

const apiFootballGoals = parseApiFootballEvents("12345", [
  {
    time: { elapsed: 12 },
    team: { id: 1, name: "France" },
    player: { id: 278, name: "Kylian Mbappé" },
    type: "Goal",
    detail: "Normal Goal"
  },
  {
    time: { elapsed: 30 },
    team: { id: 2, name: "England" },
    player: { id: 10, name: "Harry Kane" },
    type: "Goal",
    detail: "Penalty"
  },
  {
    time: { elapsed: 77, extra: 2 },
    team: { id: 3, name: "Brazil" },
    player: { id: 99, name: "Own Goal Test" },
    type: "Goal",
    detail: "Own Goal"
  },
  {
    team: { name: "France" },
    player: { name: "Ignored Assist" },
    type: "subst",
    detail: "Substitution 1"
  }
]);

assert.deepEqual(
  apiFootballGoals.map((goal) => [goal.playerName, goal.nationalTeam, goal.minute, goal.detail, goal.timeConfidence]),
  [
    ["Kylian Mbappé", "France", 12, "normal", "match-only"],
    ["Harry Kane", "England", 30, "penalty", "match-only"],
    ["Own Goal Test", "Brazil", 77, "own-goal", "match-only"]
  ]
);
assert.equal(apiFootballGoals[0].fixtureId, "12345");
assert.equal(apiFootballGoals[0].apiPlayerId, 278);

assert.deepEqual(getApiFootballDateKeys({ API_FOOTBALL_DATES: "2026-06-15, 2026-06-16" }), [
  "2026-06-15",
  "2026-06-16"
]);
assert.deepEqual(
  getApiFootballDateKeys({ API_FOOTBALL_DATE_FROM: "2026-06-15", API_FOOTBALL_DATE_TO: "2026-06-17" }),
  ["2026-06-15", "2026-06-16", "2026-06-17"]
);
assert.deepEqual(getApiFootballDateKeys({}, new Date("2026-06-15T12:00:00.000Z")), ["2026-06-15"]);
assert.deepEqual(getApiFootballDateKeys({}, new Date("2026-06-17T01:30:00.000Z")), ["2026-06-16", "2026-06-17"]);
assert.deepEqual(getApiFootballDateKeys({}, new Date("2026-06-17T06:00:00.000Z")), ["2026-06-17"]);
assert.deepEqual(getApiFootballDateKeys({ SYNC_WINDOW_PHASE: "forced" }, new Date("2026-06-15T12:00:00.000Z")), [
  "2026-06-14",
  "2026-06-15"
]);
assert.deepEqual(getApiFootballDateKeys({ SYNC_WINDOW_PHASE: "settlement" }, new Date("2026-06-16T06:05:00.000Z")), [
  "2026-06-15",
  "2026-06-16"
]);
assert.deepEqual(
  getLiveCarryoverFixtureIds([
    {
      source: "api-football",
      matchId: "api-football:1539016",
      fixtureId: "1539016",
      label: "Iraq 1-2 Norway",
      kickedOffAt: "2026-06-16T22:00:00+00:00",
      status: "live",
      homeTeam: { name: "Iraq", score: 1 },
      awayTeam: { name: "Norway", score: 2 }
    },
    {
      source: "api-football",
      matchId: "api-football:1489383",
      fixtureId: "1489383",
      label: "France 3-1 Senegal",
      kickedOffAt: "2026-06-16T19:00:00+00:00",
      status: "finished",
      homeTeam: { name: "France", score: 3 },
      awayTeam: { name: "Senegal", score: 1 }
    },
    {
      source: "wikipedia",
      matchId: "wikipedia:future",
      label: "Future",
      status: "live",
      homeTeam: { name: "A" },
      awayTeam: { name: "B" }
    }
  ]),
  ["1539016"]
);
assert.equal(getApiFootballRequestLimit({}), 90);
assert.equal(getApiFootballRequestLimit({ API_FOOTBALL_MAX_REQUESTS: "12" }), 12);
assert.throws(() => getApiFootballRequestLimit({ API_FOOTBALL_MAX_REQUESTS: "0" }), /positive integer/);
assert.equal(getApiFootballLineupRequestLimit({}), 4);
assert.equal(getApiFootballLineupRequestLimit({ API_FOOTBALL_MAX_LINEUP_REQUESTS: "0" }), 0);
assert.equal(getApiFootballLineupRequestLimit({ API_FOOTBALL_MAX_LINEUP_REQUESTS: "2" }), 2);
assert.throws(() => getApiFootballLineupRequestLimit({ API_FOOTBALL_MAX_LINEUP_REQUESTS: "-1" }), /zero or a positive integer/);
assert.deepEqual(
  [...getExistingFixtureIdsWithLineups([
    {
      source: "api-football",
      matchId: "api-football:with-sub-only",
      fixtureId: "with-sub-only",
      playerName: "Subbed Player",
      nationalTeam: "Norway",
      status: "subbed-in"
    },
    {
      source: "api-football",
      matchId: "api-football:with-lineup",
      fixtureId: "with-lineup",
      playerName: "Starter Player",
      nationalTeam: "Norway",
      status: "starter"
    }
  ])],
  ["with-lineup"]
);
assert.deepEqual(
  getMissingLineupBackfillFixtureIds(
    [
      {
        source: "api-football",
        matchId: "api-football:finished-old",
        fixtureId: "finished-old",
        label: "Sweden 5-1 Tunisia",
        kickedOffAt: "2026-06-15T02:00:00+00:00",
        status: "finished",
        homeTeam: { name: "Sweden", score: 5 },
        awayTeam: { name: "Tunisia", score: 1 }
      },
      {
        source: "api-football",
        matchId: "api-football:finished-new",
        fixtureId: "finished-new",
        label: "Iraq 1-4 Norway",
        kickedOffAt: "2026-06-16T22:00:00+00:00",
        status: "finished",
        homeTeam: { name: "Iraq", score: 1 },
        awayTeam: { name: "Norway", score: 4 }
      },
      {
        source: "api-football",
        matchId: "api-football:live",
        fixtureId: "live",
        label: "Norway 0-0 Senegal",
        kickedOffAt: "2026-06-17T18:00:00+00:00",
        status: "live",
        homeTeam: { name: "Norway", score: 0 },
        awayTeam: { name: "Senegal", score: 0 }
      },
      {
        source: "api-football",
        matchId: "api-football:already-filled",
        fixtureId: "already-filled",
        label: "France 3-1 Senegal",
        kickedOffAt: "2026-06-16T19:00:00+00:00",
        status: "finished",
        homeTeam: { name: "France", score: 3 },
        awayTeam: { name: "Senegal", score: 1 }
      }
    ],
    [
      {
        source: "api-football",
        matchId: "api-football:already-filled",
        fixtureId: "already-filled",
        playerName: "Starter Player",
        nationalTeam: "France",
        status: "starter"
      },
      {
        source: "api-football",
        matchId: "api-football:finished-new",
        fixtureId: "finished-new",
        playerName: "Subbed Player",
        nationalTeam: "Norway",
        status: "subbed-out"
      }
    ],
    3
  ),
  ["live", "finished-new", "finished-old"]
);
assert.deepEqual(
  getMissingEventBackfillFixtureIds(
    [
      {
        source: "api-football",
        matchId: "api-football:complete",
        fixtureId: "complete",
        label: "Norway 2-1 Iraq",
        kickedOffAt: "2026-06-16T22:00:00+00:00",
        status: "finished",
        homeTeam: { name: "Norway", score: 2 },
        awayTeam: { name: "Iraq", score: 1 }
      },
      {
        source: "api-football",
        matchId: "api-football:missing",
        fixtureId: "missing",
        label: "Argentina 1-0 Algeria",
        kickedOffAt: "2026-06-17T02:00:00+00:00",
        status: "live",
        homeTeam: { name: "Argentina", score: 1 },
        awayTeam: { name: "Algeria", score: 0 }
      },
      {
        source: "api-football",
        matchId: "api-football:nil-nil",
        fixtureId: "nil-nil",
        label: "Germany 0-0 Egypt",
        kickedOffAt: "2026-06-17T19:00:00+00:00",
        status: "live",
        homeTeam: { name: "Germany", score: 0 },
        awayTeam: { name: "Egypt", score: 0 }
      }
    ],
    new Map([
      ["complete", 3],
      ["missing", 0],
      ["nil-nil", 0]
    ]),
    10
  ),
  ["missing"]
);
assert.deepEqual(
  buildFixtureSyncState(
    {
      source: "api-football",
      matchId: "api-football:complete-draw",
      fixtureId: "complete-draw",
      label: "Iran 2-2 New Zealand",
      status: "finished",
      homeTeam: { name: "Iran", score: 2 },
      awayTeam: { name: "New Zealand", score: 2 }
    },
    4,
    true,
    true
  ),
  {
    scoreTotal: 4,
    goalEventCount: 4,
    eventsComplete: true,
    lineupsComplete: true,
    needsEventBackfill: false,
    needsLineupBackfill: false
  }
);
assert.equal(
  buildFixtureSyncState(
    {
      source: "api-football",
      matchId: "api-football:missing-draw",
      fixtureId: "missing-draw",
      label: "Iran 2-2 New Zealand",
      status: "finished",
      homeTeam: { name: "Iran", score: 2 },
      awayTeam: { name: "New Zealand", score: 2 }
    },
    2,
    true,
    true
  ).needsEventBackfill,
  true
);
assert.deepEqual(
  buildFixtureSyncState(
    {
      source: "api-football",
      matchId: "api-football:nil-nil-complete",
      fixtureId: "nil-nil-complete",
      label: "Germany 0-0 Egypt",
      status: "finished",
      homeTeam: { name: "Germany", score: 0 },
      awayTeam: { name: "Egypt", score: 0 }
    },
    0,
    false,
    false
  ),
  {
    scoreTotal: 0,
    goalEventCount: 0,
    eventsComplete: true,
    lineupsComplete: true,
    needsEventBackfill: false,
    needsLineupBackfill: false
  }
);
assert.equal(
  buildFixtureSyncState(
    {
      source: "api-football",
      matchId: "api-football:relevant-lineup-missing",
      fixtureId: "relevant-lineup-missing",
      label: "Norway 1-0 Iraq",
      status: "live",
      homeTeam: { name: "Norway", score: 1 },
      awayTeam: { name: "Iraq", score: 0 }
    },
    1,
    false,
    true
  ).needsLineupBackfill,
  true
);
assert.equal(
  buildFixtureSyncState(
    {
      source: "api-football",
      matchId: "api-football:irrelevant-lineup-missing",
      fixtureId: "irrelevant-lineup-missing",
      label: "Norway 1-0 Iraq",
      status: "live",
      homeTeam: { name: "Norway", score: 1 },
      awayTeam: { name: "Iraq", score: 0 }
    },
    1,
    false,
    false
  ).needsLineupBackfill,
  false
);

const apiFootballFixtures = [
  {
    fixture: {
      id: 1539002,
      date: "2026-06-15T02:00:00+00:00",
      status: { short: "FT" }
    },
    league: { id: 1, name: "World Cup", season: 2026 },
    teams: {
      home: { name: "Sweden" },
      away: { name: "Tunisia" }
    },
    goals: { home: 5, away: 1 }
  },
  {
    fixture: {
      id: 1489377,
      date: "2026-06-15T19:00:00+00:00",
      status: { short: "NS" }
    },
    league: { id: 1, name: "World Cup", season: 2026 },
    teams: {
      home: { name: "Belgium" },
      away: { name: "Egypt" }
    },
    goals: { home: null, away: null }
  },
  {
    fixture: { id: 1524932, status: { short: "FT" } },
    league: { id: 256, name: "USL League Two", season: 2026 }
  }
];
const worldCupFixtures = filterWorldCupFixtures(apiFootballFixtures);
assert.equal(worldCupFixtures.length, 2);
assert.equal(shouldFetchFixtureEvents(worldCupFixtures[0]), true);
assert.equal(shouldFetchFixtureEvents(worldCupFixtures[1]), false);
assert.equal(fixtureNeedsGoalEvents(worldCupFixtures[0], new Map([["1539002", 6]])), false);
assert.equal(fixtureNeedsGoalEvents(worldCupFixtures[0], new Map([["1539002", 5]])), true);
assert.equal(fixtureNeedsGoalEvents(worldCupFixtures[1], new Map()), false);
assert.equal(
  fixtureNeedsGoalEvents(
    {
      ...worldCupFixtures[0],
      fixture: { id: 1539003, status: { short: "FT" } },
      goals: { home: null, away: null }
    },
    new Map()
  ),
  true
);
assert.deepEqual(parseApiFootballFixture(worldCupFixtures[0]), {
  source: "api-football",
  matchId: "api-football:1539002",
  fixtureId: "1539002",
  label: "Sweden 5-1 Tunisia",
  kickedOffAt: "2026-06-15T02:00:00+00:00",
  status: "finished",
  homeTeam: { id: undefined, name: "Sweden", score: 5 },
  awayTeam: { id: undefined, name: "Tunisia", score: 1 }
});
assert.deepEqual(parseApiFootballFixture(worldCupFixtures[1]), {
  source: "api-football",
  matchId: "api-football:1489377",
  fixtureId: "1489377",
  label: "Belgium vs Egypt",
  kickedOffAt: "2026-06-15T19:00:00+00:00",
  status: "scheduled",
  homeTeam: { id: undefined, name: "Belgium", score: undefined },
  awayTeam: { id: undefined, name: "Egypt", score: undefined }
});
assert.equal(
  parseApiFootballFixture(
    {
      fixture: {
        id: 1539016,
        date: "2026-06-16T22:00:00+00:00",
        status: { short: "2H" }
      },
      league: { id: 1, name: "World Cup", season: 2026 },
      teams: {
        home: { name: "Iraq" },
        away: { name: "Norway" }
      },
      goals: { home: 1, away: 2 }
    },
    new Date("2026-06-17T01:05:00.000Z")
  )?.status,
  "finished"
);

const apiFootballFixtureGoals = parseApiFootballEvents(
  "1539002",
  [
    {
      time: { elapsed: 12 },
      team: { id: 5, name: "Sweden" },
      player: { id: 100, name: "Alexander Isak" },
      type: "Goal",
      detail: "Normal Goal"
    }
  ],
  worldCupFixtures[0]
);
assert.deepEqual(
  apiFootballFixtureGoals.map((goal) => [goal.matchLabel, goal.kickedOffAt, goal.playerName, goal.nationalTeam]),
  [["Sweden 5-1 Tunisia", "2026-06-15T02:00:00+00:00", "Alexander Isak", "Sweden"]]
);

const apiFootballLineupParticipants = parseApiFootballLineups("1539002", [
  {
    team: { name: "Sweden" },
    startXI: [{ player: { id: 100, name: "Alexander Isak", number: 9 } }],
    substitutes: [{ player: { id: 101, name: "Squad Player", number: 19 } }]
  }
]);
assert.deepEqual(
  apiFootballLineupParticipants.map((participant) => [participant.playerName, participant.teamId, participant.status, participant.shirtNumber]),
  [
    ["Alexander Isak", "sweden", "starter", 9],
    ["Squad Player", "sweden", "bench", 19]
  ]
);

const apiFootballSubstitutionParticipants = parseApiFootballSubstitutions("1539002", [
  {
    team: { name: "Sweden" },
    player: { id: 100, name: "Alexander Isak" },
    assist: { id: 101, name: "Squad Player" },
    type: "subst",
    detail: "Substitution 1"
  }
]);
assert.deepEqual(
  apiFootballSubstitutionParticipants.map((participant) => [participant.playerName, participant.teamId, participant.status]),
  [
    ["Alexander Isak", "sweden", "subbed-out"],
    ["Squad Player", "sweden", "subbed-in"]
  ]
);

const matchWithParticipants = buildMatches(
  [],
  [],
  [parseApiFootballFixture(worldCupFixtures[0])!],
  [...apiFootballLineupParticipants, ...apiFootballSubstitutionParticipants],
  teams
);
const selectedParticipants = matchWithParticipants[0]?.participants.filter((participant) => participant.selected) ?? [];
assert.deepEqual(
  selectedParticipants.map((participant) => [participant.displayPlayerName, participant.owners, participant.status]),
  [["Alexander Isak", ["Anna"], "subbed-out"]]
);
assert.notEqual(buildSnapshotFingerprint([], [], []), buildSnapshotFingerprint([], [], apiFootballLineupParticipants));

const originalFetch = globalThis.fetch;
const originalEnv = {
  API_FOOTBALL_KEY: process.env.API_FOOTBALL_KEY,
  API_FOOTBALL_DATES: process.env.API_FOOTBALL_DATES,
  API_FOOTBALL_MAX_REQUESTS: process.env.API_FOOTBALL_MAX_REQUESTS,
  API_FOOTBALL_MAX_LINEUP_REQUESTS: process.env.API_FOOTBALL_MAX_LINEUP_REQUESTS,
  API_FOOTBALL_MISSING_EVENT_BACKFILL_LIMIT: process.env.API_FOOTBALL_MISSING_EVENT_BACKFILL_LIMIT,
  API_FOOTBALL_FIXTURE_IDS: process.env.API_FOOTBALL_FIXTURE_IDS,
  SYNC_WINDOW_PHASE: process.env.SYNC_WINDOW_PHASE
};
function restoreEnvValue(key: keyof typeof originalEnv): void {
  const value = originalEnv[key];
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}

process.env.API_FOOTBALL_KEY = "test-key";
process.env.API_FOOTBALL_DATES = "2026-06-15";
process.env.API_FOOTBALL_FIXTURE_IDS = "1489377";
process.env.API_FOOTBALL_MAX_REQUESTS = "8";
process.env.API_FOOTBALL_MAX_LINEUP_REQUESTS = "0";
process.env.API_FOOTBALL_MISSING_EVENT_BACKFILL_LIMIT = "0";
try {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(input.toString());
    if (url.pathname.endsWith("/fixtures") && url.searchParams.get("date") === "2026-06-15") {
      return Response.json({
        errors: {},
        response: [
          apiFootballFixtures[0],
          {
            fixture: {
              id: 2000001,
              date: "2026-06-15T16:00:00+00:00",
              status: { short: "FT" }
            },
            league: { id: 1, name: "World Cup", season: 2026 },
            teams: {
              home: { name: "Spain" },
              away: { name: "Cape Verde" }
            },
            goals: { home: 2, away: 1 }
          }
        ]
      });
    }

    if (url.pathname.endsWith("/fixtures") && url.searchParams.get("id") === "1489377") {
      return Response.json({
        errors: {},
        response: [apiFootballFixtures[1]]
      });
    }

    if (url.pathname.endsWith("/fixtures/events")) {
      return Response.json({ errors: {}, response: [] });
    }

    return Response.json({ errors: {}, response: [] });
  }) as typeof fetch;

  const sourceResult = await apiFootballSource.fetchGoals();
  assert.deepEqual(sourceResult.matches?.map((match) => match.matchId).sort(), [
    "api-football:1489377",
    "api-football:1539002",
    "api-football:2000001"
  ]);
  assert.equal(sourceResult.coveredDateKeys?.includes("2026-06-15"), true);
} finally {
  globalThis.fetch = originalFetch;
  restoreEnvValue("API_FOOTBALL_KEY");
  restoreEnvValue("API_FOOTBALL_DATES");
  restoreEnvValue("API_FOOTBALL_MAX_REQUESTS");
  restoreEnvValue("API_FOOTBALL_MAX_LINEUP_REQUESTS");
  restoreEnvValue("API_FOOTBALL_MISSING_EVENT_BACKFILL_LIMIT");
  restoreEnvValue("API_FOOTBALL_FIXTURE_IDS");
}

process.env.API_FOOTBALL_KEY = "test-key";
process.env.API_FOOTBALL_DATES = "2026-06-18";
process.env.API_FOOTBALL_MAX_REQUESTS = "8";
process.env.API_FOOTBALL_MAX_LINEUP_REQUESTS = "0";
process.env.API_FOOTBALL_MISSING_EVENT_BACKFILL_LIMIT = "0";
process.env.SYNC_WINDOW_PHASE = "forced";
delete process.env.API_FOOTBALL_FIXTURE_IDS;
const originalCwdForScoreAwareEventsTest = process.cwd();
try {
  const tempCwd = mkdtempSync(join(tmpdir(), "paniwi-api-football-events-"));
  mkdirSync(join(tempCwd, "public", "data"), { recursive: true });
  writeFileSync(
    join(tempCwd, "public", "data", "raw-goals.json"),
    JSON.stringify([
      {
        externalGoalId: "api-football:4100001:known",
        playerName: "Known Scorer",
        nationalTeam: "Norway",
        goals: 1,
        source: "api-football",
        fixtureId: "4100001",
        matchId: "api-football:4100001",
        detail: "normal"
      }
    ])
  );
  process.chdir(tempCwd);
  const eventFixtureIds: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(input.toString());
    if (url.pathname.endsWith("/fixtures") && url.searchParams.get("date") === "2026-06-18") {
      return Response.json({
        errors: {},
        response: [
          {
            fixture: {
              id: 4100001,
              date: "2026-06-18T16:00:00+00:00",
              status: { short: "FT" }
            },
            league: { id: 1, name: "World Cup", season: 2026 },
            teams: {
              home: { name: "Norway" },
              away: { name: "Iraq" }
            },
            goals: { home: 1, away: 0 }
          },
          {
            fixture: {
              id: 4100002,
              date: "2026-06-18T19:00:00+00:00",
              status: { short: "FT" }
            },
            league: { id: 1, name: "World Cup", season: 2026 },
            teams: {
              home: { name: "Argentina" },
              away: { name: "Algeria" }
            },
            goals: { home: 2, away: 0 }
          }
        ]
      });
    }

    if (url.pathname.endsWith("/fixtures/events")) {
      eventFixtureIds.push(url.searchParams.get("fixture") ?? "");
      return Response.json({
        errors: {},
        response: [
          {
            time: { elapsed: 12 },
            team: { name: "Argentina" },
            player: { id: 200, name: "Missing Scorer" },
            type: "Goal",
            detail: "Normal Goal"
          }
        ]
      });
    }

    return Response.json({ errors: {}, response: [] });
  }) as typeof fetch;

  const sourceResult = await apiFootballSource.fetchGoals();
  assert.deepEqual(eventFixtureIds, ["4100002"]);
  assert.deepEqual(sourceResult.goals.map((goal) => goal.fixtureId), ["4100002"]);
} finally {
  process.chdir(originalCwdForScoreAwareEventsTest);
  globalThis.fetch = originalFetch;
  restoreEnvValue("API_FOOTBALL_KEY");
  restoreEnvValue("API_FOOTBALL_DATES");
  restoreEnvValue("API_FOOTBALL_MAX_REQUESTS");
  restoreEnvValue("API_FOOTBALL_MAX_LINEUP_REQUESTS");
  restoreEnvValue("API_FOOTBALL_MISSING_EVENT_BACKFILL_LIMIT");
  restoreEnvValue("API_FOOTBALL_FIXTURE_IDS");
  restoreEnvValue("SYNC_WINDOW_PHASE");
}

process.env.API_FOOTBALL_KEY = "test-key";
process.env.API_FOOTBALL_DATES = "2026-06-20";
process.env.API_FOOTBALL_MAX_REQUESTS = "8";
process.env.API_FOOTBALL_MAX_LINEUP_REQUESTS = "1";
process.env.API_FOOTBALL_MISSING_EVENT_BACKFILL_LIMIT = "0";
process.env.SYNC_WINDOW_PHASE = "settled";
delete process.env.API_FOOTBALL_FIXTURE_IDS;
const originalCwdForLineupOnlyBackfillTest = process.cwd();
try {
  const tempCwd = mkdtempSync(join(tmpdir(), "paniwi-api-football-lineup-only-"));
  mkdirSync(join(tempCwd, "public", "data"), { recursive: true });
  writeFileSync(
    join(tempCwd, "public", "data", "raw-matches.json"),
    JSON.stringify([
      {
        source: "api-football",
        matchId: "api-football:4200001",
        fixtureId: "4200001",
        label: "Iraq 0-1 Norway",
        kickedOffAt: "2026-06-15T19:00:00+00:00",
        status: "finished",
        homeTeam: { name: "Iraq", score: 0 },
        awayTeam: { name: "Norway", score: 1 }
      }
    ])
  );
  writeFileSync(
    join(tempCwd, "public", "data", "raw-goals.json"),
    JSON.stringify([
      {
        externalGoalId: "api-football:4200001:known",
        playerName: "Known Scorer",
        nationalTeam: "Norway",
        goals: 1,
        source: "api-football",
        fixtureId: "4200001",
        matchId: "api-football:4200001",
        detail: "normal"
      }
    ])
  );
  process.chdir(tempCwd);
  const eventFixtureIds: string[] = [];
  const lineupFixtureIds: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(input.toString());
    if (url.pathname.endsWith("/fixtures") && url.searchParams.get("date") === "2026-06-20") {
      return Response.json({ errors: {}, response: [] });
    }

    if (url.pathname.endsWith("/fixtures") && url.searchParams.get("id") === "4200001") {
      return Response.json({
        errors: {},
        response: [
          {
            fixture: {
              id: 4200001,
              date: "2026-06-15T19:00:00+00:00",
              status: { short: "FT" }
            },
            league: { id: 1, name: "World Cup", season: 2026 },
            teams: {
              home: { name: "Iraq" },
              away: { name: "Norway" }
            },
            goals: { home: 0, away: 1 }
          }
        ]
      });
    }

    if (url.pathname.endsWith("/fixtures/events")) {
      eventFixtureIds.push(url.searchParams.get("fixture") ?? "");
      return Response.json({ errors: {}, response: [] });
    }

    if (url.pathname.endsWith("/fixtures/lineups")) {
      lineupFixtureIds.push(url.searchParams.get("fixture") ?? "");
      return Response.json({
        errors: {},
        response: [
          {
            team: { name: "Norway" },
            startXI: [{ player: { id: 1100, name: "Erling Haaland", number: 9 } }],
            substitutes: []
          }
        ]
      });
    }

    return Response.json({ errors: {}, response: [] });
  }) as typeof fetch;

  const sourceResult = await apiFootballSource.fetchGoals();
  assert.deepEqual(eventFixtureIds, []);
  assert.deepEqual(lineupFixtureIds, ["4200001"]);
  assert.deepEqual(sourceResult.participants?.map((participant) => [participant.fixtureId, participant.playerName, participant.status]), [
    ["4200001", "Erling Haaland", "starter"]
  ]);
} finally {
  process.chdir(originalCwdForLineupOnlyBackfillTest);
  globalThis.fetch = originalFetch;
  restoreEnvValue("API_FOOTBALL_KEY");
  restoreEnvValue("API_FOOTBALL_DATES");
  restoreEnvValue("API_FOOTBALL_MAX_REQUESTS");
  restoreEnvValue("API_FOOTBALL_MAX_LINEUP_REQUESTS");
  restoreEnvValue("API_FOOTBALL_MISSING_EVENT_BACKFILL_LIMIT");
  restoreEnvValue("API_FOOTBALL_FIXTURE_IDS");
  restoreEnvValue("SYNC_WINDOW_PHASE");
}

process.env.API_FOOTBALL_KEY = "test-key";
process.env.API_FOOTBALL_DATES = "2026-06-17";
process.env.API_FOOTBALL_MAX_REQUESTS = "8";
process.env.API_FOOTBALL_MAX_LINEUP_REQUESTS = "0";
process.env.API_FOOTBALL_MISSING_EVENT_BACKFILL_LIMIT = "0";
process.env.SYNC_WINDOW_PHASE = "live";
delete process.env.API_FOOTBALL_FIXTURE_IDS;
const liveKickoffForOptionalBackfillFailureTest = new Date(Date.now() - 30 * 60 * 1000).toISOString();
const originalCwdForOptionalBackfillFailureTest = process.cwd();
try {
  const tempCwd = mkdtempSync(join(tmpdir(), "paniwi-api-football-optional-backfill-"));
  mkdirSync(join(tempCwd, "public", "data"), { recursive: true });
  writeFileSync(
    join(tempCwd, "public", "data", "raw-matches.json"),
    JSON.stringify([
      {
        source: "api-football",
        matchId: "api-football:4400001",
        fixtureId: "4400001",
        label: "France 3-1 Senegal",
        kickedOffAt: "2026-06-16T19:00:00+00:00",
        status: "finished",
        homeTeam: { name: "France", score: 3 },
        awayTeam: { name: "Senegal", score: 1 }
      }
    ])
  );
  process.chdir(tempCwd);
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(input.toString());
    if (url.pathname.endsWith("/fixtures") && url.searchParams.get("date") === "2026-06-17") {
      return Response.json({
        errors: {},
        response: [
          {
            fixture: {
              id: 4400002,
              date: liveKickoffForOptionalBackfillFailureTest,
              status: { short: "1H" }
            },
            league: { id: 1, name: "World Cup", season: 2026 },
            teams: {
              home: { name: "Portugal" },
              away: { name: "Congo DR" }
            },
            goals: { home: 0, away: 0 }
          }
        ]
      });
    }

    if (url.pathname.endsWith("/fixtures") && url.searchParams.get("id") === "4400001") {
      return Response.json({
        errors: { access: "Your account is suspended." },
        response: []
      });
    }

    return Response.json({ errors: {}, response: [] });
  }) as typeof fetch;

  const sourceResult = await apiFootballSource.fetchGoals();
  assert.deepEqual(sourceResult.matches?.map((match) => [match.fixtureId, match.status]), [["4400002", "live"]]);
} finally {
  process.chdir(originalCwdForOptionalBackfillFailureTest);
  globalThis.fetch = originalFetch;
  restoreEnvValue("API_FOOTBALL_KEY");
  restoreEnvValue("API_FOOTBALL_DATES");
  restoreEnvValue("API_FOOTBALL_MAX_REQUESTS");
  restoreEnvValue("API_FOOTBALL_MAX_LINEUP_REQUESTS");
  restoreEnvValue("API_FOOTBALL_MISSING_EVENT_BACKFILL_LIMIT");
  restoreEnvValue("API_FOOTBALL_FIXTURE_IDS");
  restoreEnvValue("SYNC_WINDOW_PHASE");
}

process.env.API_FOOTBALL_KEY = "test-key";
const nowForLineupPriorityTest = new Date();
const dateKeyForLineupPriorityTest = nowForLineupPriorityTest.toISOString().slice(0, 10);
const historicalKickoffForLineupPriorityTest = new Date(nowForLineupPriorityTest.getTime() - 6 * 60 * 60 * 1000).toISOString();
const preMatchKickoffForLineupPriorityTest = new Date(nowForLineupPriorityTest.getTime() + 45 * 60 * 1000).toISOString();
process.env.API_FOOTBALL_DATES = dateKeyForLineupPriorityTest;
process.env.API_FOOTBALL_MAX_REQUESTS = "8";
process.env.API_FOOTBALL_MAX_LINEUP_REQUESTS = "1";
process.env.API_FOOTBALL_MISSING_EVENT_BACKFILL_LIMIT = "0";
process.env.SYNC_WINDOW_PHASE = "pre-match";
delete process.env.API_FOOTBALL_FIXTURE_IDS;
const originalCwdForLineupPriorityTest = process.cwd();
try {
  const tempCwd = mkdtempSync(join(tmpdir(), "paniwi-api-football-lineup-priority-"));
  mkdirSync(join(tempCwd, "public", "data"), { recursive: true });
  writeFileSync(
    join(tempCwd, "public", "data", "raw-matches.json"),
    JSON.stringify([
      {
        source: "api-football",
        matchId: "api-football:4300001",
        fixtureId: "4300001",
        label: "Iraq 0-1 Norway",
        kickedOffAt: historicalKickoffForLineupPriorityTest,
        status: "finished",
        homeTeam: { name: "Iraq", score: 0 },
        awayTeam: { name: "Norway", score: 1 }
      }
    ])
  );
  process.chdir(tempCwd);
  const lineupFixtureIds: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(input.toString());
    if (url.pathname.endsWith("/fixtures") && url.searchParams.get("date") === dateKeyForLineupPriorityTest) {
      return Response.json({
        errors: {},
        response: [
          {
            fixture: {
              id: 4300001,
              date: historicalKickoffForLineupPriorityTest,
              status: { short: "FT" }
            },
            league: { id: 1, name: "World Cup", season: 2026 },
            teams: {
              home: { name: "Iraq" },
              away: { name: "Norway" }
            },
            goals: { home: 0, away: 1 }
          },
          {
            fixture: {
              id: 4300002,
              date: preMatchKickoffForLineupPriorityTest,
              status: { short: "NS" }
            },
            league: { id: 1, name: "World Cup", season: 2026 },
            teams: {
              home: { name: "Portugal" },
              away: { name: "Congo DR" }
            },
            goals: { home: null, away: null }
          }
        ]
      });
    }

    if (url.pathname.endsWith("/fixtures/lineups")) {
      const fixtureId = url.searchParams.get("fixture") ?? "";
      lineupFixtureIds.push(fixtureId);
      return Response.json({
        errors: {},
        response: [
          {
            team: { name: "Portugal" },
            startXI: [{ player: { id: 211, name: "Joao Felix", number: 11 } }],
            substitutes: []
          }
        ]
      });
    }

    return Response.json({ errors: {}, response: [] });
  }) as typeof fetch;

  const sourceResult = await apiFootballSource.fetchGoals();
  assert.deepEqual(lineupFixtureIds, ["4300002"]);
  assert.deepEqual(sourceResult.participants?.map((participant) => [participant.fixtureId, participant.playerName, participant.status]), [
    ["4300002", "Joao Felix", "starter"]
  ]);
} finally {
  process.chdir(originalCwdForLineupPriorityTest);
  globalThis.fetch = originalFetch;
  restoreEnvValue("API_FOOTBALL_KEY");
  restoreEnvValue("API_FOOTBALL_DATES");
  restoreEnvValue("API_FOOTBALL_MAX_REQUESTS");
  restoreEnvValue("API_FOOTBALL_MAX_LINEUP_REQUESTS");
  restoreEnvValue("API_FOOTBALL_MISSING_EVENT_BACKFILL_LIMIT");
  restoreEnvValue("API_FOOTBALL_FIXTURE_IDS");
  restoreEnvValue("SYNC_WINDOW_PHASE");
}

process.env.API_FOOTBALL_KEY = "test-key";
process.env.API_FOOTBALL_DATES = "2026-06-15";
process.env.API_FOOTBALL_MAX_REQUESTS = "8";
process.env.API_FOOTBALL_MAX_LINEUP_REQUESTS = "1";
process.env.SYNC_WINDOW_PHASE = "forced";
delete process.env.API_FOOTBALL_FIXTURE_IDS;
const originalCwdForLineupLimitTest = process.cwd();
try {
  const tempCwd = mkdtempSync(join(tmpdir(), "paniwi-api-football-"));
  mkdirSync(join(tempCwd, "public", "data"), { recursive: true });
  process.chdir(tempCwd);
  const lineupFixtureIds: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(input.toString());
    if (url.pathname.endsWith("/fixtures") && url.searchParams.get("date") === "2026-06-15") {
      return Response.json({
        errors: {},
        response: [
          {
            fixture: {
              id: 3000001,
              date: "2026-06-15T16:00:00+00:00",
              status: { short: "FT" }
            },
            league: { id: 1, name: "World Cup", season: 2026 },
            teams: {
              home: { name: "Iraq" },
              away: { name: "Norway" }
            },
            goals: { home: 1, away: 4 }
          },
          {
            fixture: {
              id: 3000002,
              date: "2026-06-15T19:00:00+00:00",
              status: { short: "FT" }
            },
            league: { id: 1, name: "World Cup", season: 2026 },
            teams: {
              home: { name: "France" },
              away: { name: "Senegal" }
            },
            goals: { home: 3, away: 1 }
          }
        ]
      });
    }

    if (url.pathname.endsWith("/fixtures/events")) {
      return Response.json({ errors: {}, response: [] });
    }

    if (url.pathname.endsWith("/fixtures/lineups")) {
      lineupFixtureIds.push(url.searchParams.get("fixture") ?? "");
      return Response.json({
        errors: {},
        response: [
          {
            team: { name: "Norway" },
            startXI: [{ player: { id: 1100, name: "Erling Haaland", number: 9 } }],
            substitutes: []
          }
        ]
      });
    }

    return Response.json({ errors: {}, response: [] });
  }) as typeof fetch;

  const sourceResult = await apiFootballSource.fetchGoals();
  assert.deepEqual(lineupFixtureIds, ["3000001"]);
  assert.deepEqual(sourceResult.participants?.map((participant) => [participant.fixtureId, participant.playerName, participant.status]), [
    ["3000001", "Erling Haaland", "starter"]
  ]);
} finally {
  process.chdir(originalCwdForLineupLimitTest);
  globalThis.fetch = originalFetch;
  restoreEnvValue("API_FOOTBALL_KEY");
  restoreEnvValue("API_FOOTBALL_DATES");
  restoreEnvValue("API_FOOTBALL_MAX_REQUESTS");
  restoreEnvValue("API_FOOTBALL_MAX_LINEUP_REQUESTS");
  restoreEnvValue("API_FOOTBALL_FIXTURE_IDS");
  restoreEnvValue("SYNC_WINDOW_PHASE");
}

process.env.API_FOOTBALL_KEY = "test-key";
process.env.API_FOOTBALL_DATES = "2026-06-15";
process.env.API_FOOTBALL_MAX_REQUESTS = "1";
process.env.API_FOOTBALL_MAX_LINEUP_REQUESTS = "0";
process.env.API_FOOTBALL_MISSING_EVENT_BACKFILL_LIMIT = "0";
process.env.SYNC_WINDOW_PHASE = "forced";
delete process.env.API_FOOTBALL_FIXTURE_IDS;
const originalCwdForRequestBudgetTest = process.cwd();
try {
  const tempCwd = mkdtempSync(join(tmpdir(), "paniwi-api-football-budget-"));
  mkdirSync(join(tempCwd, "public", "data"), { recursive: true });
  process.chdir(tempCwd);
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(input.toString());
    if (url.pathname.endsWith("/fixtures")) {
      return Response.json({
        errors: {},
        response: [apiFootballFixtures[0]]
      });
    }

    return Response.json({
      errors: {},
      response: []
    });
  }) as typeof fetch;
  await assert.rejects(() => apiFootballSource.fetchGoals(), /request budget exhausted/);
} finally {
  process.chdir(originalCwdForRequestBudgetTest);
  globalThis.fetch = originalFetch;
  restoreEnvValue("API_FOOTBALL_KEY");
  restoreEnvValue("API_FOOTBALL_DATES");
  restoreEnvValue("API_FOOTBALL_MAX_REQUESTS");
  restoreEnvValue("API_FOOTBALL_MAX_LINEUP_REQUESTS");
  restoreEnvValue("API_FOOTBALL_MISSING_EVENT_BACKFILL_LIMIT");
  restoreEnvValue("API_FOOTBALL_FIXTURE_IDS");
  restoreEnvValue("SYNC_WINDOW_PHASE");
}

console.log("API Football source tests passed.");
