import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildLeaderboard, scoreGoalsForTeams } from "../domain/buildLeaderboard";
import { sortGoalsChronologically } from "../domain/sortGoals";
import type { GoalRecord, LeaderboardEntry, ScoredGoal, StaticMeta } from "../domain/types";
import { teams } from "../config/teams";
import { validateGoals } from "./validateGoals";
import { validateTeams } from "./validateTeams";

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

const [leaderboard, goals, rawGoals, meta] = await Promise.all([
  readJson<LeaderboardEntry[]>("public/data/leaderboard.json"),
  readJson<ScoredGoal[]>("public/data/goals.json"),
  readJson<GoalRecord[]>("public/data/raw-goals.json"),
  readJson<StaticMeta>("public/data/meta.json")
]);

assert.equal(validateTeams(teams).valid, true);

const goalValidation = validateGoals(rawGoals);
assert.equal(goalValidation.validGoals.length, rawGoals.length);
assert.equal(goalValidation.skippedGoals.length, 0);

assert.deepEqual(leaderboard, buildLeaderboard(teams, rawGoals));
assert.deepEqual(goals, sortGoalsChronologically(scoreGoalsForTeams(teams, rawGoals)));

assert.equal(meta.status, "ok");
assert.equal(meta.goalCount, rawGoals.length);
assert.equal(meta.scoredGoalCount, goals.length);
assert.equal(meta.skippedGoalCount, 0);
assert.equal(meta.duplicateGoalCount, 0);

const owners = new Set(teams.map((team) => team.owner));
for (const goal of goals) {
  assert.equal(owners.has(goal.owner), true, `Unknown owner in scored goal: ${goal.owner}`);
  assert.equal(goal.points > 0, true, `Scored goal has no points: ${goal.externalGoalId}`);
}

console.log("Static data tests passed.");
