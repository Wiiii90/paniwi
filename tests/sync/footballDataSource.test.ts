import assert from "node:assert/strict";
import { buildMatches } from "../../src/domain/buildMatches";
import { selectEffectiveGoalsForScoring } from "../../src/domain/effectiveGoals";
import type { GoalRecord } from "../../src/domain/goalTypes";
import { footballDataSource } from "../../src/sync/sources/footballData/source";
import { getFootballDataDateRange } from "../../src/sync/sources/footballData/config";
import { parseFootballDataMatch } from "../../src/sync/sources/footballData/matches";
import { parseFootballDataScorer } from "../../src/sync/sources/footballData/scorers";
import { getSourcesForMode, parseSyncSourceMode } from "../../src/sync/sources/sourceSelection";

const originalFetch = globalThis.fetch;
const envSnapshot = {
  FOOTBALL_DATA_TOKEN: process.env.FOOTBALL_DATA_TOKEN,
  FOOTBALL_DATA_DATE_FROM: process.env.FOOTBALL_DATA_DATE_FROM,
  FOOTBALL_DATA_DATE_TO: process.env.FOOTBALL_DATA_DATE_TO,
  FOOTBALL_DATA_DATES: process.env.FOOTBALL_DATA_DATES,
  FOOTBALL_DATA_MAX_REQUESTS: process.env.FOOTBALL_DATA_MAX_REQUESTS
};

function restoreEnv(): void {
  for (const [key, value] of Object.entries(envSnapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

assert.equal(parseSyncSourceMode("football-data"), "football-data");
assert.deepEqual(
  getSourcesForMode("football-data").map((source) => source.name),
  ["football-data"]
);

assert.deepEqual(getFootballDataDateRange({}, new Date("2026-06-17T17:30:00.000Z")), {
  from: "2026-06-16",
  to: "2026-06-19",
  dateKeys: ["2026-06-16", "2026-06-17", "2026-06-18"]
});

const parsedMatch = parseFootballDataMatch({
  id: 2000,
  utcDate: "2026-06-17T16:00:00Z",
  status: "IN_PLAY",
  homeTeam: { id: 765, name: "Portugal" },
  awayTeam: { id: 766, name: "DR Congo" },
  score: {
    fullTime: { home: 1, away: 0 }
  }
});

assert.deepEqual(
  parsedMatch && [parsedMatch.source, parsedMatch.matchId, parsedMatch.status, parsedMatch.label, parsedMatch.homeTeam.score, parsedMatch.awayTeam.score],
  ["football-data", "football-data:2000", "live", "Portugal 1-0 DR Congo", 1, 0]
);

assert.deepEqual(
  parseFootballDataScorer({
    player: { id: 44, name: "Harry Kane" },
    team: { id: 43942, name: "England" },
    goals: 3,
    penalties: 1
  }).map((goal) => [goal.externalGoalId, goal.playerName, goal.nationalTeam, goal.goals, goal.detail, goal.matchId]),
  [
    ["football-data:scorer:44:normal", "Harry Kane", "England", 2, "normal", "football-data:scorers"],
    ["football-data:scorer:44:penalties", "Harry Kane", "England", 1, "penalty", "football-data:scorers"]
  ]
);

const oldApiGoal: GoalRecord = {
  externalGoalId: "api-football:old:goal",
  playerName: "Cristiano Ronaldo",
  nationalTeam: "Portugal",
  goals: 1,
  source: "api-football",
  fixtureId: "1489300",
  matchId: "api-football:1489300",
  matchLabel: "Portugal 1-0 DR Congo",
  kickedOffAt: "2026-06-17T16:00:00.000Z",
  minute: 11,
  timeConfidence: "match-only",
  detail: "normal"
};

assert.ok(parsedMatch);
const matches = buildMatches([oldApiGoal], [], [parsedMatch], [], []);
assert.equal(matches.length, 1);
assert.equal(matches[0].matchId, "football-data:2000");
assert.equal(matches[0].goals.length, 1);
assert.equal(matches[0].syncState?.goalEventCount, 1);

const aggregateGoal: GoalRecord = {
  externalGoalId: "football-data:scorer:harry-kane:normal",
  playerName: "Harry Kane",
  nationalTeam: "England",
  goals: 2,
  source: "football-data",
  matchId: "football-data:scorers",
  matchLabel: "FIFA World Cup 2026 Torschützenliste",
  timeConfidence: "unknown",
  detail: "normal"
};
const partialDetailedGoal: GoalRecord = {
  externalGoalId: "api-football:kane:one",
  playerName: "Harry Kane",
  nationalTeam: "England",
  goals: 1,
  source: "api-football",
  matchId: "api-football:1",
  matchLabel: "England 1-0 Croatia",
  kickedOffAt: "2026-06-17T20:00:00.000Z",
  minute: 12,
  timeConfidence: "estimated",
  detail: "normal"
};
assert.deepEqual(
  selectEffectiveGoalsForScoring([aggregateGoal, partialDetailedGoal]).map((goal) => goal.externalGoalId),
  ["football-data:scorer:harry-kane:normal"]
);
assert.deepEqual(
  selectEffectiveGoalsForScoring([aggregateGoal, partialDetailedGoal, { ...partialDetailedGoal, externalGoalId: "api-football:kane:two" }]).map(
    (goal) => goal.externalGoalId
  ),
  ["api-football:kane:one", "api-football:kane:two"]
);

process.env.FOOTBALL_DATA_TOKEN = "test-token";
process.env.FOOTBALL_DATA_DATE_FROM = "2026-06-17";
process.env.FOOTBALL_DATA_DATE_TO = "2026-06-17";
process.env.FOOTBALL_DATA_MAX_REQUESTS = "3";
delete process.env.FOOTBALL_DATA_DATES;

const requestedUrls: URL[] = [];
const requestedHeaders: Headers[] = [];
globalThis.fetch = (async (input, init) => {
  const requestedUrl = new URL(String(input));
  requestedUrls.push(requestedUrl);
  requestedHeaders.push(new Headers(init?.headers));

  return new Response(
    JSON.stringify(
      requestedUrl.pathname.endsWith("/scorers")
        ? {
            scorers: [
              {
                player: { id: 10, name: "Kylian Mbappé" },
                team: { id: 1, name: "France" },
                goals: 2,
                penalties: 0
              }
            ]
          }
        : {
            matches: [
              {
                id: 2001,
                utcDate: "2026-06-17T19:00:00Z",
                status: "FINISHED",
                homeTeam: { id: 1, name: "France" },
                awayTeam: { id: 2, name: "Senegal" },
                score: { fullTime: { home: 3, away: 1 } }
              }
            ]
          }
    ),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-RequestsAvailable": "9",
        "X-RequestCounter-Reset": "12"
      }
    }
  );
}) as typeof fetch;

const sourceResult = await footballDataSource.fetchGoals();

assert.deepEqual(requestedUrls.map((url) => url.pathname), ["/v4/competitions/WC/matches", "/v4/competitions/WC/scorers"]);
assert.equal(requestedUrls[0]?.searchParams.get("season"), "2026");
assert.equal(requestedUrls[0]?.searchParams.get("dateFrom"), "2026-06-17");
assert.equal(requestedUrls[0]?.searchParams.get("dateTo"), "2026-06-18");
assert.equal(requestedUrls[1]?.searchParams.get("season"), "2026");
assert.equal(requestedHeaders[0]?.get("X-Auth-Token"), "test-token");
assert.equal(sourceResult.source, "football-data");
assert.equal(sourceResult.sourceRequestCount, 2);
assert.equal(sourceResult.sourceRequestLimit, 3);
assert.deepEqual(sourceResult.coveredDateKeys, ["2026-06-17"]);
assert.equal(sourceResult.preserveExistingGoals, true);
assert.equal(sourceResult.replaceExistingSourceGoals, true);
assert.equal(sourceResult.preserveExistingParticipants, true);
assert.equal(sourceResult.matches?.[0]?.label, "France 3-1 Senegal");
assert.deepEqual(sourceResult.goals.map((goal) => [goal.playerName, goal.nationalTeam, goal.goals, goal.detail]), [
  ["Kylian Mbappé", "France", 2, "normal"]
]);

globalThis.fetch = originalFetch;
restoreEnv();

console.log("football-data source tests passed.");
