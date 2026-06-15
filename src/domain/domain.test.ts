import assert from "node:assert/strict";
import { buildLeaderboard, scoreGoalsForTeams } from "./buildLeaderboard";
import { normalizePlayerName } from "./normalizePlayerName";
import { getGoalPoints, matchesPlayer } from "./scoring";
import type { GoalRecord, ParticipantTeam } from "./types";

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
  playerName: "Kylian Mbappé",
  nationalTeam: "France",
  goals: 1,
  source: "mock",
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
    { ...baseGoal, playerName: "Harry Kane", nationalTeam: "England", apiPlayerId: 10 }
  ]).map((entry) => [entry.rank, entry.owner, entry.points]),
  [
    [1, "Anna", 1],
    [1, "Ben", 1]
  ]
);

console.log("Domain tests passed.");
