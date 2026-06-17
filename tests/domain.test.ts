import assert from "node:assert/strict";
import { buildLeaderboard, scoreGoalsForTeams } from "../src/domain/buildLeaderboard";
import { buildMatches } from "../src/domain/buildMatches";
import { buildScorers } from "../src/domain/buildScorers";
import { normalizePlayerName } from "../src/domain/normalizePlayerName";
import { enrichGoalsWithRoster } from "../src/domain/rosterResolver";
import { getGoalPoints, matchesPlayer } from "../src/domain/scoring";
import { sortGoalsChronologically } from "../src/domain/sortGoals";
import { getLatestFinishedMatches, getTodayOrLiveMatches } from "../src/domain/matchFilters";
import type { GoalRecord, ParticipantTeam } from "../src/domain/types";
import type { RosterSnapshot } from "../src/domain/rosterTypes";
import { normalizeGoals } from "../src/sync/normalizeGoals";
import {
  filterWorldCupFixtures,
  getApiFootballRequestLimit,
  getApiFootballDateKeys,
  getLiveCarryoverFixtureIds,
  getApiFootballLineupRequestLimit,
  parseApiFootballFixture,
  parseApiFootballEvents,
  parseApiFootballLineups,
  parseApiFootballSubstitutions,
  shouldFetchFixtureEvents
} from "../src/sync/sources/apiFootballSource";
import { apiFootballSource } from "../src/sync/sources/apiFootballSource";
import { getSourcesForMode, parseSyncSourceMode } from "../src/sync/sources/sourceSelection";
import { parseWikipediaFootballBoxes, parseWikipediaGoalscorers } from "../src/sync/sources/wikipediaSource";
import { buildSourceErrorMeta, mergeGoalSnapshots } from "../src/sync/syncGoals";
import { buildSnapshotFingerprint } from "../src/sync/snapshotFingerprint";
import { validateGoals } from "../src/sync/validateGoals";
import { formatTeamValidationIssues, validateTeams } from "../src/sync/validateTeams";

const teams: ParticipantTeam[] = [
  {
    owner: "Anna",
    players: [
      {
        playerName: "Alexander Isak",
        teamId: "sweden",
        aliases: ["A. Isak"]
      }
    ]
  },
  {
    owner: "Ben",
    players: [
      {
        playerName: "Felix Nmecha",
        teamId: "germany"
      }
    ]
  }
];

const baseGoal: GoalRecord = {
  externalGoalId: "goal-1",
  playerName: "A. Isak",
  nationalTeam: "Sweden",
  goals: 1,
  source: "api-football",
  apiPlayerId: 2864,
  timeConfidence: "exact",
  detail: "normal"
};

const rosterSnapshot: RosterSnapshot = {
  lastUpdated: "2026-06-16T00:00:00.000Z",
  source: "wikipedia",
  pageTitle: "2026 FIFA World Cup squads",
  teamCount: 1,
  playerCount: 2,
  teams: [
    {
      teamName: "Sweden",
      teamId: "sweden",
      players: [
        {
          playerName: "Yasin Ayari",
          normalizedPlayerName: "yasin ayari",
          position: "midfielder",
          shirtNumber: 18,
          sourceName: "Yasin Ayari"
        },
        {
          playerName: "Mattias Svanberg",
          normalizedPlayerName: "mattias svanberg",
          position: "midfielder",
          shirtNumber: 8,
          sourceName: "Mattias Svanberg"
        }
      ]
    }
  ]
};

const apiResolverRosterSnapshot: RosterSnapshot = {
  lastUpdated: "2026-06-16T00:00:00.000Z",
  source: "wikipedia",
  pageTitle: "2026 FIFA World Cup squads",
  teamCount: 2,
  playerCount: 2,
  teams: [
    {
      teamName: "Egypt",
      teamId: "egypt",
      players: [
        {
          playerName: "Mohamed Hany",
          normalizedPlayerName: "mohamed hany",
          position: "defender",
          shirtNumber: 4,
          sourceName: "Mohamed Hany"
        }
      ]
    },
    {
      teamName: "Saudi Arabia",
      teamId: "saudi-arabia",
      players: [
        {
          playerName: "Abdulelah Al-Amri",
          normalizedPlayerName: "abdulelah al amri",
          position: "defender",
          shirtNumber: 4,
          sourceName: "Abdulelah Al-Amri"
        }
      ]
    }
  ]
};

const initialLastNameRosterSnapshot: RosterSnapshot = {
  lastUpdated: "2026-06-16T00:00:00.000Z",
  source: "wikipedia",
  pageTitle: "2026 FIFA World Cup squads",
  teamCount: 1,
  playerCount: 2,
  teams: [
    {
      teamName: "Iraq",
      teamId: "iraq",
      players: [
        {
          playerName: "Hussein Ali",
          normalizedPlayerName: "hussein ali",
          position: "defender",
          sourceName: "Hussein Ali"
        },
        {
          playerName: "Aymen Hussein",
          normalizedPlayerName: "aymen hussein",
          position: "forward",
          sourceName: "Aymen Hussein"
        }
      ]
    }
  ]
};

assert.equal(normalizePlayerName("Kylian Mbappé"), "kylian mbappe");
assert.equal(normalizePlayerName("  K.   Mbappe! "), "k mbappe");

assert.equal(matchesPlayer(baseGoal, teams[0].players[0]), true);
assert.equal(matchesPlayer({ ...baseGoal, playerName: "Felix Nmecha", nationalTeam: "Germany", apiPlayerId: undefined, source: "wikipedia" }, teams[1].players[0]), true);
assert.equal(matchesPlayer({ ...baseGoal, playerName: "B. Isak", nationalTeam: "Sweden", apiPlayerId: undefined }, teams[0].players[0]), false);
assert.equal(matchesPlayer({ ...baseGoal, playerName: "A. Isak", nationalTeam: "France", apiPlayerId: undefined }, teams[0].players[0]), false);
assert.equal(matchesPlayer({ ...baseGoal, playerName: "Nobody", apiPlayerId: undefined }, teams[0].players[0]), false);

assert.equal(getGoalPoints(baseGoal), 1);
assert.equal(getGoalPoints({ ...baseGoal, detail: "penalty" }), 1);
assert.equal(getGoalPoints({ ...baseGoal, detail: "own-goal" }), 0);
assert.equal(getGoalPoints({ ...baseGoal, detail: "penalty-shootout" }), 0);

const scoredGoals = scoreGoalsForTeams(teams, [
  baseGoal,
  { ...baseGoal, playerName: "Felix Nmecha", nationalTeam: "Germany", apiPlayerId: undefined, source: "wikipedia", detail: "penalty" },
  { ...baseGoal, detail: "own-goal" }
]);

assert.deepEqual(
  scoredGoals.map((goal) => [goal.owner, goal.pickedPlayerName, goal.points]),
  [
    ["Anna", "Alexander Isak", 1],
    ["Ben", "Felix Nmecha", 1]
  ]
);
assert.equal(scoredGoals[0].displayNationalTeam, "Schweden");

const parsedMatches = buildMatches(
  [
    {
      ...baseGoal,
      externalGoalId: "civ-goal",
      playerName: "Seko Fofana",
      nationalTeam: "Ivory Coast",
      source: "wikipedia",
      matchId: "civ-ecuador",
      matchLabel: "CIV 1–0 Ecuador"
    }
  ],
  []
);
assert.deepEqual(
  [parsedMatches[0].homeTeam.name, parsedMatches[0].homeTeam.score, parsedMatches[0].awayTeam.name, parsedMatches[0].awayTeam.score],
  ["Elfenbeinküste", 1, "Ecuador", 0]
);

const fixtureGoal = { ...baseGoal, matchId: "api-football:fixture-with-goal", fixtureId: "fixture-with-goal" };
const fixtureScoredGoals = scoreGoalsForTeams(teams, [fixtureGoal]);
const fixtureBackedMatches = buildMatches(
  [fixtureGoal],
  fixtureScoredGoals,
  [
    {
      source: "api-football",
      matchId: "api-football:fixture-with-goal",
      fixtureId: "fixture-with-goal",
      label: "Sweden 5-1 Tunisia",
      kickedOffAt: "2026-06-15T02:00:00+00:00",
      status: "finished",
      homeTeam: { name: "Sweden", score: 5 },
      awayTeam: { name: "Tunisia", score: 1 }
    },
    {
      source: "api-football",
      matchId: "api-football:fixture-without-goals",
      fixtureId: "fixture-without-goals",
      label: "Spain 0-0 Cape Verde",
      kickedOffAt: "2026-06-15T16:00:00+00:00",
      status: "live",
      homeTeam: { name: "Spain", score: 0 },
      awayTeam: { name: "Cape Verde", score: 0 }
    }
  ]
);
assert.equal(fixtureBackedMatches.length, 2);
assert.deepEqual(
  fixtureBackedMatches.map((match) => [match.homeTeam.name, match.awayTeam.name, match.status, match.goals.length]),
  [
    ["Schweden", "Tunesien", "finished", 1],
    ["Spanien", "Kap Verde", "live", 0]
  ]
);

const dedupedFixtureMatches = buildMatches(
  [],
  [],
  [
    {
      source: "wikipedia",
      matchId: "wikipedia:sweden-tunisia",
      label: "Sweden 5–1 Tunisia",
      kickedOffAt: "2026-06-15T02:00:00.000Z",
      status: "finished",
      homeTeam: { name: "Sweden", score: 5 },
      awayTeam: { name: "Tunisia", score: 1 }
    },
    {
      source: "api-football",
      matchId: "api-football:1539002",
      fixtureId: "1539002",
      label: "Sweden 5-1 Tunisia",
      kickedOffAt: "2026-06-15T02:00:00+00:00",
      status: "finished",
      homeTeam: { name: "Sweden", score: 5 },
      awayTeam: { name: "Tunisia", score: 1 }
    }
  ]
);
assert.deepEqual(
  dedupedFixtureMatches.map((match) => match.matchId),
  ["api-football:1539002"]
);

const matchFilterSample = buildMatches(
  [],
  [],
  [
    {
      source: "api-football",
      matchId: "api-football:finished",
      label: "Sweden 5-1 Tunisia",
      kickedOffAt: "2026-06-15T02:00:00+00:00",
      status: "finished",
      homeTeam: { name: "Sweden", score: 5 },
      awayTeam: { name: "Tunisia", score: 1 }
    },
    {
      source: "api-football",
      matchId: "api-football:unknown-today",
      label: "Spain vs Cape Verde",
      kickedOffAt: "2026-06-15T16:00:00+00:00",
      status: "unknown",
      homeTeam: { name: "Spain" },
      awayTeam: { name: "Cape Verde" }
    },
    {
      source: "api-football",
      matchId: "api-football:live",
      label: "Belgium 1-1 Egypt",
      kickedOffAt: "2026-06-15T19:00:00+00:00",
      status: "live",
      homeTeam: { name: "Belgium", score: 1 },
      awayTeam: { name: "Egypt", score: 1 }
    }
  ]
);
assert.deepEqual(
  getLatestFinishedMatches(matchFilterSample).map((match) => match.matchId),
  ["api-football:finished"]
);
assert.deepEqual(
  getTodayOrLiveMatches(matchFilterSample, new Date("2026-06-15T12:00:00+02:00")).map((match) => match.matchId),
  ["api-football:unknown-today", "api-football:live"]
);

assert.deepEqual(buildLeaderboard(teams, [baseGoal]).map((entry) => [entry.rank, entry.owner, entry.points]), [
  [1, "Anna", 1],
  [2, "Ben", 0]
]);

assert.deepEqual(
  buildLeaderboard(teams, [
    baseGoal,
    { ...baseGoal, externalGoalId: "goal-2", playerName: "Felix Nmecha", nationalTeam: "Germany", apiPlayerId: undefined, source: "wikipedia" }
  ]).map((entry) => [entry.rank, entry.owner, entry.points]),
  [
    [1, "Anna", 1],
    [1, "Ben", 1]
  ]
);

const normalizedGoals = normalizeGoals([
  {
    playerName: "Jamal Musiala",
    nationalTeam: "Germany",
    source: "mock",
    matchId: "germany-uruguay",
    kickedOffAt: "2026-06-14T19:20:00.000Z",
    minute: 64
  }
]);

assert.equal(normalizedGoals[0].timeConfidence, "estimated");
assert.equal(normalizedGoals[0].externalGoalId.includes("jamal musiala"), true);

assert.deepEqual(
  sortGoalsChronologically([
    { ...baseGoal, externalGoalId: "late", scoredAt: "2026-06-12T20:00:00.000Z" },
    { ...baseGoal, externalGoalId: "early", scoredAt: "2026-06-12T19:00:00.000Z" }
  ]).map((goal) => goal.externalGoalId),
  ["early", "late"]
);

const apiAbbreviatedRosterGoals = [
  {
    ...baseGoal,
    externalGoalId: "ayari-1",
    playerName: "Y. Ayari",
    sourcePlayerName: "Y. Ayari",
    nationalTeam: "Sweden",
    apiPlayerId: 265820
  },
  {
    ...baseGoal,
    externalGoalId: "ayari-2",
    playerName: "Y. Ayari",
    sourcePlayerName: "Y. Ayari",
    nationalTeam: "Sweden",
    apiPlayerId: 265820
  }
];
assert.deepEqual(
  enrichGoalsWithRoster(apiAbbreviatedRosterGoals, rosterSnapshot).map((goal) => goal.playerName),
  ["Yasin Ayari", "Yasin Ayari"]
);
assert.deepEqual(
  enrichGoalsWithRoster(
    [
      {
        ...baseGoal,
        externalGoalId: "iraq-goal",
        playerName: "A. Hussein",
        nationalTeam: "Iraq",
        sourcePlayerName: "A. Hussein",
        sourceTeamName: "Iraq",
        source: "api-football",
        matchLabel: "Iraq 1-2 Norway"
      }
    ],
    initialLastNameRosterSnapshot,
    { strictSources: ["api-football"] }
  ).map((goal) => goal.playerName),
  ["Aymen Hussein"]
);
assert.deepEqual(
  enrichGoalsWithRoster(
    [
      {
        ...baseGoal,
        externalGoalId: "egypt-own-goal",
        playerName: "M. Hany",
        nationalTeam: "Belgium",
        sourcePlayerName: "M. Hany",
        sourceTeamName: "Belgium",
        source: "api-football",
        detail: "own-goal",
        matchLabel: "Belgium 1-1 Egypt"
      },
      {
        ...baseGoal,
        externalGoalId: "saudi-goal",
        playerName: "A. Al Amri",
        nationalTeam: "Saudi Arabia",
        sourcePlayerName: "A. Al Amri",
        sourceTeamName: "Saudi Arabia",
        source: "api-football",
        matchLabel: "Saudi Arabia 1-0 Uruguay"
      }
    ],
    apiResolverRosterSnapshot,
    { strictSources: ["api-football"] }
  ).map((goal) => [goal.playerName, goal.nationalTeam, goal.teamId, goal.detail]),
  [
    ["Mohamed Hany", "Egypt", "egypt", "own-goal"],
    ["Abdulelah Al-Amri", "Saudi Arabia", "saudi-arabia", "normal"]
  ]
);
assert.deepEqual(
  buildScorers(apiAbbreviatedRosterGoals, teams, rosterSnapshot).map((scorer) => [
    scorer.playerName,
    scorer.nationalTeam,
    scorer.goals
  ]),
  [["Yasin Ayari", "Schweden", 2]]
);

const validation = validateGoals([
  baseGoal,
  { ...baseGoal },
  { ...baseGoal, externalGoalId: "invalid-minute", minute: 200 }
]);

assert.equal(validation.validGoals.length, 1);
assert.deepEqual(
  validation.skippedGoals.map((item) => item.reason),
  ["duplicate-goal", "invalid-minute"]
);

assert.equal(parseSyncSourceMode(undefined), "mock");
assert.equal(parseSyncSourceMode("nope"), "mock");
assert.equal(parseSyncSourceMode("api-football"), "api-football");
assert.deepEqual(
  getSourcesForMode("mock").map((source) => source.name),
  ["mock"]
);
assert.deepEqual(
  getSourcesForMode("api-football").map((source) => source.name),
  ["api-football"]
);

const wikipediaGoals = parseWikipediaGoalscorers(
  `
== Goalscorers ==
3 goals
* [[Kylian Mbappé]]
1 goal
* [[Harry Kane]]
1 own goal
* [[Own Goal Test]]
== Awards ==
`,
  "Example Cup"
);

assert.deepEqual(
  wikipediaGoals.map((goal) => [goal.playerName, goal.goals, goal.detail, goal.timeConfidence]),
  [
    ["Kylian Mbappé", 3, "normal", "unknown"],
    ["Harry Kane", 1, "normal", "unknown"],
    ["Own Goal Test", 1, "own-goal", "unknown"]
  ]
);

const wikipediaMatchGoals = parseWikipediaFootballBoxes(
  `{{#invoke:football box|main
|date={{Start date|2026|6|11}}
|time=1:00&nbsp;p.m. [[UTC−06:00|UTC−6]]
|team1={{#invoke:flag|fb-rt|MEX}}
|score={{score link|2026 FIFA World Cup Group A#Mexico vs South Africa|2–0}}
|team2={{#invoke:flag|fb|RSA}}
|goals1=
*[[Julián Quiñones|Quiñones]] 9'
*[[Raúl Jiménez|Jiménez]] 67'
|goals2=
|stadium=[[Estadio Azteca]], [[Mexico City]]
}}<section end=A1 />`,
  "2026 FIFA World Cup Group A"
);

assert.deepEqual(
  wikipediaMatchGoals.map((goal) => [
    goal.playerName,
    goal.nationalTeam,
    goal.minute,
    goal.detail,
    goal.timeConfidence,
    goal.matchLabel
  ]),
  [
    ["Julián Quiñones", "Mexico", 9, "normal", "estimated", "Mexico 2–0 South Africa"],
    ["Raúl Jiménez", "Mexico", 67, "normal", "estimated", "Mexico 2–0 South Africa"]
  ]
);

const wikipediaDisambiguatedGoal = parseWikipediaFootballBoxes(
  `{{#invoke:football box|main
|date={{Start date|2026|6|12}}
|time=2:00 a.m. UTC
|team1={{#invoke:flag|fb-rt|KOR}}
|score=2–1
|team2={{#invoke:flag|fb|CZE}}
|goals1=
|goals2=
*[[Ladislav Krejčí (footballer, born 1999)|Krejčí]] 59'
|stadium=[[BMO Field]]
}}<section end=A2 />`,
  "2026 FIFA World Cup Group A"
);

assert.deepEqual(
  wikipediaDisambiguatedGoal.map((goal) => [goal.playerName, goal.nationalTeam, goal.minute]),
  [["Ladislav Krejčí", "Czech Republic", 59]]
);

const wikipediaTemplateGoals = parseWikipediaFootballBoxes(
  `{{#invoke:football box|main
|date={{Start date|2026|6|14}}
|time=12:00 p.m. UTC-5
|team1={{#invoke:flag|fb-rt|GER}}
|score=7–1
|team2={{#invoke:flag|fb|CUW}}
|goals1=
*[[Felix Nmecha|Nmecha]] {{goal|6}}
*[[Kai Havertz|Havertz]] {{goal|45+5|pen.|88}}
|goals2=
*[[Livano Comenencia|Comenencia]] {{goal|21}}
|stadium=[[NRG Stadium]]
}}<section end=E1 />`,
  "2026 FIFA World Cup Group E"
);

assert.deepEqual(
  wikipediaTemplateGoals.map((goal) => [goal.playerName, goal.nationalTeam, goal.minute, goal.detail]),
  [
    ["Felix Nmecha", "Germany", 6, "normal"],
    ["Kai Havertz", "Germany", 50, "penalty"],
    ["Kai Havertz", "Germany", 88, "normal"],
    ["Livano Comenencia", "Curaçao", 21, "normal"]
  ]
);

const wikipediaOwnGoal = parseWikipediaFootballBoxes(
  `{{#invoke:football box|main
|team1={{#invoke:flag|fb-rt|QAT}}
|score=1–1
|team2={{#invoke:flag|fb|SUI}}
|goals1=
*[[Miro Muheim|Muheim]] 90+4' o.g.
|goals2=
*[[Breel Embolo|Embolo]] 17' pen.
|stadium=[[Levi's Stadium]]
}}<section end=B2 />`,
  "2026 FIFA World Cup Group B"
);

assert.deepEqual(
  wikipediaOwnGoal.map((goal) => [goal.playerName, goal.nationalTeam, goal.minute, goal.detail]),
  [
    ["Miro Muheim", "Switzerland", 94, "own-goal"],
    ["Breel Embolo", "Switzerland", 17, "penalty"]
  ]
);

const wikipediaEmptyGoalsColumn = parseWikipediaFootballBoxes(
  `{{#invoke:football box|main
|team1={{#invoke:flag|fb-rt|HAI}}
|score=0–1
|team2={{#invoke:flag|fb|SCO}}
|goals1=
|goals2=
*[[John McGinn|McGinn]] 28'
|stadium=[[Gillette Stadium]]
}}<section end=C2 />`,
  "2026 FIFA World Cup Group C"
);

assert.deepEqual(
  wikipediaEmptyGoalsColumn.map((goal) => [goal.playerName, goal.nationalTeam, goal.minute, goal.detail]),
  [["John McGinn", "Scotland", 28, "normal"]]
);

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
  restoreEnvValue("API_FOOTBALL_FIXTURE_IDS");
}

process.env.API_FOOTBALL_KEY = "test-key";
process.env.API_FOOTBALL_DATES = "2026-06-15";
process.env.API_FOOTBALL_MAX_REQUESTS = "1";
process.env.SYNC_WINDOW_PHASE = "forced";
delete process.env.API_FOOTBALL_FIXTURE_IDS;
try {
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
  globalThis.fetch = originalFetch;
  restoreEnvValue("API_FOOTBALL_KEY");
  restoreEnvValue("API_FOOTBALL_DATES");
  restoreEnvValue("API_FOOTBALL_MAX_REQUESTS");
  restoreEnvValue("API_FOOTBALL_MAX_LINEUP_REQUESTS");
  restoreEnvValue("API_FOOTBALL_FIXTURE_IDS");
  restoreEnvValue("SYNC_WINDOW_PHASE");
}

const oldWikipediaGoal: GoalRecord = {
  ...baseGoal,
  externalGoalId: "wiki-old",
  source: "wikipedia",
  kickedOffAt: "2026-06-14T17:00:00.000Z"
};
const sameDayWikipediaGoal: GoalRecord = {
  ...baseGoal,
  externalGoalId: "wiki-same-day",
  source: "wikipedia",
  kickedOffAt: "2026-06-15T02:00:00.000Z"
};
const sameDayApiGoal: GoalRecord = {
  ...baseGoal,
  externalGoalId: "api-same-day",
  source: "api-football",
  kickedOffAt: "2026-06-15T02:00:00.000Z"
};
assert.deepEqual(
  mergeGoalSnapshots("api-football", [oldWikipediaGoal, sameDayWikipediaGoal], [sameDayApiGoal], ["2026-06-15"]).map(
    (goal) => goal.externalGoalId
  ),
  ["wiki-old", "api-same-day"]
);
assert.deepEqual(
  mergeGoalSnapshots(
    "api-football",
    [oldWikipediaGoal, { ...sameDayApiGoal, externalGoalId: "api-existing" }],
    [],
    undefined
  ).map((goal) => goal.externalGoalId),
  ["api-existing"]
);

assert.deepEqual(validateTeams(teams), { valid: false, issues: [{ owner: "Anna", reason: "invalid-team-size" }, { owner: "Ben", reason: "invalid-team-size" }] });

const validPlayers = [
  { playerName: "Player One", teamId: "sweden" },
  { playerName: "Player Two", teamId: "germany" },
  { playerName: "Player Three", teamId: "brazil" },
  { playerName: "Player Four", teamId: "australia" },
  { playerName: "Player Five", teamId: "spain" },
  { playerName: "Player Six", teamId: "portugal" },
  { playerName: "Player Seven", teamId: "england" },
  { playerName: "Player Eight", teamId: "morocco" },
  { playerName: "Player Nine", teamId: "canada" },
  { playerName: "Player Ten", teamId: "mexico" }
];
const validTeam: ParticipantTeam = {
  owner: "Valid",
  players: validPlayers
};
assert.equal(validateTeams([validTeam]).valid, true);
assert.equal(
  validateTeams([
    {
      owner: "ValidWithGoalkeeper",
      players: [
        { playerName: "Goalkeeper One", teamId: "scotland", position: "goalkeeper" },
        ...validPlayers
      ]
    }
  ]).valid,
  true
);
assert.equal(
  validateTeams([
    {
      ...validTeam,
      players: [{ playerName: "Goalkeeper One", teamId: "scotland", position: "goalkeeper" }, ...validTeam.players.slice(1)]
    }
  ]).issues.some((issue) => issue.reason === "ten-player-team-cannot-include-goalkeeper"),
  true
);

const invalidTeams = validateTeams([
  validTeam,
  { ...validTeam, owner: "valid" },
  {
    owner: "Broken",
    players: [
      { playerName: "", teamId: "sweden" },
      { playerName: "Ghost Player", teamId: "unknown-team" },
      { playerName: "Repeat Player", teamId: "sweden" },
      { playerName: "Repeat Player", teamId: "sweden" }
    ]
  }
]);
assert.equal(invalidTeams.valid, false);
assert.equal(formatTeamValidationIssues(invalidTeams.issues).includes("duplicate-owner"), true);
assert.equal(formatTeamValidationIssues(invalidTeams.issues).includes("missing-player-name"), true);
assert.equal(formatTeamValidationIssues(invalidTeams.issues).includes("unknown-team-id"), true);
assert.equal(formatTeamValidationIssues(invalidTeams.issues).includes("duplicate-player-id-in-team"), true);

assert.deepEqual(
  buildSourceErrorMeta(
    ["api-football", "wikipedia"],
    ["api-football: missing key", "wikipedia: no records"],
    new Date("2026-06-15T12:00:00.000Z")
  ),
  {
    lastUpdated: "2026-06-15T12:00:00.000Z",
    source: "api-football",
    attemptedSources: ["api-football", "wikipedia"],
    fallbackUsed: true,
    status: "error",
    sourceErrors: ["api-football: missing key", "wikipedia: no records"],
    message: "Alle Datenquellen sind fehlgeschlagen. Bestehende Snapshot-Dateien wurden nicht ueberschrieben."
  }
);

console.log("Domain tests passed.");
