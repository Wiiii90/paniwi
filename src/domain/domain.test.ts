import assert from "node:assert/strict";
import { buildLeaderboard, scoreGoalsForTeams } from "./buildLeaderboard";
import { normalizePlayerName } from "./normalizePlayerName";
import { getGoalPoints, matchesPlayer } from "./scoring";
import { sortGoalsChronologically } from "./sortGoals";
import type { GoalRecord, ParticipantTeam } from "./types";
import { normalizeGoals } from "../sync/normalizeGoals";
import { parseApiFootballEvents } from "../sync/sources/apiFootballSource";
import { getSourcesForMode, parseSyncSourceMode } from "../sync/sources/sourceSelection";
import { parseWikipediaFootballBoxes, parseWikipediaGoalscorers } from "../sync/sources/wikipediaSource";
import { buildSourceErrorMeta } from "../sync/syncGoals";
import { validateGoals } from "../sync/validateGoals";
import { formatTeamValidationIssues, validateTeams } from "../sync/validateTeams";

const teams: ParticipantTeam[] = [
  {
    owner: "Anna",
    players: [
      {
        name: "Kylian Mbappe",
        nationalTeam: "France",
        aliases: ["Kylian Mbappé", "K. Mbappe"]
      }
    ]
  },
  {
    owner: "Ben",
    players: [
      {
        name: "Harry Kane",
        nationalTeam: "England",
        apiPlayerId: 10
      }
    ]
  }
];

const baseGoal: GoalRecord = {
  externalGoalId: "goal-1",
  playerName: "Kylian Mbappé",
  nationalTeam: "France",
  goals: 1,
  source: "mock",
  timeConfidence: "exact",
  detail: "normal"
};

assert.equal(normalizePlayerName("Kylian Mbappé"), "kylian mbappe");
assert.equal(normalizePlayerName("  K.   Mbappe! "), "k mbappe");

assert.equal(matchesPlayer(baseGoal, teams[0].players[0]), true);
assert.equal(matchesPlayer({ ...baseGoal, playerName: "H. Kane", apiPlayerId: 10 }, teams[1].players[0]), true);
assert.equal(matchesPlayer({ ...baseGoal, playerName: "Nobody" }, teams[0].players[0]), false);

assert.equal(getGoalPoints(baseGoal), 1);
assert.equal(getGoalPoints({ ...baseGoal, detail: "penalty" }), 1);
assert.equal(getGoalPoints({ ...baseGoal, detail: "own-goal" }), 0);
assert.equal(getGoalPoints({ ...baseGoal, detail: "penalty-shootout" }), 0);

const scoredGoals = scoreGoalsForTeams(teams, [
  baseGoal,
  { ...baseGoal, playerName: "Harry Kane", nationalTeam: "England", apiPlayerId: 10, detail: "penalty" },
  { ...baseGoal, detail: "own-goal" }
]);

assert.deepEqual(
  scoredGoals.map((goal) => [goal.owner, goal.pickedPlayerName, goal.points]),
  [
    ["Anna", "Kylian Mbappe", 1],
    ["Ben", "Harry Kane", 1]
  ]
);

assert.deepEqual(buildLeaderboard(teams, [baseGoal]).map((entry) => [entry.rank, entry.owner, entry.points]), [
  [1, "Anna", 1],
  [2, "Ben", 0]
]);

assert.deepEqual(
  buildLeaderboard(teams, [
    baseGoal,
    { ...baseGoal, externalGoalId: "goal-2", playerName: "Harry Kane", nationalTeam: "England", apiPlayerId: 10 }
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
assert.equal(parseSyncSourceMode("auto"), "auto");
assert.equal(parseSyncSourceMode("nope"), "mock");
assert.deepEqual(
  getSourcesForMode("auto").map((source) => source.name),
  ["api-football", "wikipedia", "mock"]
);
assert.deepEqual(
  getSourcesForMode("mock").map((source) => source.name),
  ["mock"]
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

assert.deepEqual(validateTeams(teams), { valid: false, issues: [{ owner: "Anna", reason: "invalid-team-size" }, { owner: "Ben", reason: "invalid-team-size" }] });

const validTeam = {
  owner: "Valid",
  players: Array.from({ length: 10 }, (_, index) => ({
    name: `Player ${index + 1}`,
    nationalTeam: "Germany"
  }))
};
assert.equal(validateTeams([validTeam]).valid, true);
assert.equal(
  validateTeams([
    {
      owner: "ValidWithGoalkeeper",
      players: [
        { name: "Keeper", nationalTeam: "Germany", position: "goalkeeper" as const },
        ...Array.from({ length: 10 }, (_, index) => ({
          name: `Outfield ${index + 1}`,
          nationalTeam: "Germany"
        }))
      ]
    }
  ]).valid,
  true
);
assert.equal(
  validateTeams([
    { ...validTeam, players: [...validTeam.players, { name: "Extra", nationalTeam: "Germany", position: "forward" }] }
  ]).issues.some((issue) => issue.reason === "eleven-player-team-needs-one-goalkeeper"),
  true
);
assert.equal(
  validateTeams([
    {
      ...validTeam,
      players: [{ name: "Keeper", nationalTeam: "Germany", position: "goalkeeper" }, ...validTeam.players.slice(1)]
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
      { name: "", nationalTeam: "Germany" },
      { name: "Player 1", nationalTeam: "" },
      { name: "Player 1", nationalTeam: "Germany" }
    ]
  }
]);
assert.equal(invalidTeams.valid, false);
assert.equal(formatTeamValidationIssues(invalidTeams.issues).includes("duplicate-owner"), true);
assert.equal(formatTeamValidationIssues(invalidTeams.issues).includes("missing-player-name"), true);
assert.equal(formatTeamValidationIssues(invalidTeams.issues).includes("missing-national-team"), true);
assert.equal(formatTeamValidationIssues(invalidTeams.issues).includes("duplicate-player-in-team"), true);

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
