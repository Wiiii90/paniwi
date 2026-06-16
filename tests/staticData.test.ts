import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildLeaderboard, scoreGoalsForTeams } from "../src/domain/buildLeaderboard";
import { buildMatches } from "../src/domain/buildMatches";
import { buildScorers } from "../src/domain/buildScorers";
import { sortGoalsChronologically } from "../src/domain/sortGoals";
import { getTeamDisplayName } from "../src/domain/teamDisplay";
import type { PickStatusSnapshot } from "../src/domain/pickStatusTypes";
import type {
  ExternalMatchParticipantRecord,
  ExternalMatchRecord,
  GoalRecord,
  LeaderboardEntry,
  MatchRecord,
  ScoredGoal,
  ScorerEntry,
  StaticMeta
} from "../src/domain/types";
import type { RosterSnapshot } from "../src/domain/rosterTypes";
import { teams } from "../src/config/teams";
import { validateGoals } from "../src/sync/validateGoals";
import { validateTeams } from "../src/sync/validateTeams";

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

const [leaderboard, goals, rawGoals, rawMatches, scorers, matches, meta, rosters, pickStatuses] = await Promise.all([
  readJson<LeaderboardEntry[]>("public/data/leaderboard.json"),
  readJson<ScoredGoal[]>("public/data/goals.json"),
  readJson<GoalRecord[]>("public/data/raw-goals.json"),
  readJson<ExternalMatchRecord[]>("public/data/raw-matches.json"),
  readJson<ScorerEntry[]>("public/data/scorers.json"),
  readJson<MatchRecord[]>("public/data/matches.json"),
  readJson<StaticMeta>("public/data/meta.json"),
  readJson<RosterSnapshot>("public/data/rosters.json"),
  readJson<PickStatusSnapshot>("public/data/pick-statuses.json")
]);
const rawParticipants = await readJson<ExternalMatchParticipantRecord[]>("public/data/raw-participants.json").catch(() => []);

assert.equal(validateTeams(teams).valid, true);

const goalValidation = validateGoals(rawGoals);
assert.equal(goalValidation.validGoals.length, rawGoals.length);
assert.equal(goalValidation.skippedGoals.length, 0);

assert.deepEqual(leaderboard, buildLeaderboard(teams, rawGoals, rosters));
assert.deepEqual(goals, sortGoalsChronologically(scoreGoalsForTeams(teams, rawGoals, rosters)));
assert.deepEqual(scorers, buildScorers(rawGoals, teams, rosters));
assert.deepEqual(matches, buildMatches(rawGoals, goals, rawMatches, rawParticipants, teams, rosters));

assert.equal(meta.status, "ok");
assert.equal(meta.goalCount, rawGoals.length);
assert.equal(meta.scoredGoalCount, goals.length);
assert.equal(meta.skippedGoalCount, 0);
assert.equal(meta.duplicateGoalCount, 0);
assert.equal(pickStatuses.picks.length, teams.reduce((sum, team) => sum + team.players.length, 0));

const owners = new Set(teams.map((team) => team.owner));
for (const goal of goals) {
  assert.equal(owners.has(goal.owner), true, `Unknown owner in scored goal: ${goal.owner}`);
  assert.equal(goal.points > 0, true, `Scored goal has no points: ${goal.externalGoalId}`);
  assert.equal(Boolean(goal.playerId), true, `Scored goal has no canonical playerId: ${goal.externalGoalId}`);
  assert.equal(Boolean(goal.pickId), true, `Scored goal has no pickId: ${goal.externalGoalId}`);
  assert.equal(Boolean(goal.teamId), true, `Scored goal has no canonical teamId: ${goal.externalGoalId}`);
  assert.equal(Boolean(goal.displayPlayerName), true, `Scored goal has no display player name: ${goal.externalGoalId}`);
  assert.equal(Boolean(goal.displayNationalTeam), true, `Scored goal has no display national team: ${goal.externalGoalId}`);
  assert.equal(goal.displayNationalTeam, getTeamDisplayName(goal.teamId));
}

for (const goal of rawGoals) {
  if (goal.playerId) {
    assert.equal(Boolean(goal.teamId), true, `Raw goal has playerId without teamId: ${goal.externalGoalId}`);
  }
}

console.log("Static data tests passed.");
