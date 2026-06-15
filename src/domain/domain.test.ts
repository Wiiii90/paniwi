import assert from "node:assert/strict";
import { buildLeaderboard, scoreGoalsForTeams } from "./buildLeaderboard";
import { normalizePlayerName } from "./normalizePlayerName";
import { getGoalPoints, matchesPlayer } from "./scoring";
import { sortGoalsChronologically } from "./sortGoals";
import type { GoalRecord, ParticipantTeam } from "./types";
import { normalizeGoals } from "../sync/normalizeGoals";
import { getSourcesForMode, parseSyncSourceMode } from "../sync/sources/sourceSelection";
import { parseWikipediaGoalscorers } from "../sync/sources/wikipediaSource";
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

assert.deepEqual(validateTeams(teams), { valid: false, issues: [{ owner: "Anna", reason: "invalid-team-size" }, { owner: "Ben", reason: "invalid-team-size" }] });

const validTeam = {
  owner: "Valid",
  players: Array.from({ length: 10 }, (_, index) => ({
    name: `Player ${index + 1}`,
    nationalTeam: "Germany"
  }))
};
assert.equal(validateTeams([validTeam]).valid, true);

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

console.log("Domain tests passed.");
