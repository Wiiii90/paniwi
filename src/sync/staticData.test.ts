import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildLeaderboard, scoreGoalsForTeams } from "../domain/buildLeaderboard";
import { buildMatches } from "../domain/buildMatches";
import { buildScorers } from "../domain/buildScorers";
import { sortGoalsChronologically } from "../domain/sortGoals";
import { getTeamDisplayName } from "../domain/teamDisplay";
import type { GoalRecord, LeaderboardEntry, MatchRecord, ScoredGoal, ScorerEntry, StaticMeta } from "../domain/types";
import { teams } from "../config/teams";
import { getCanonicalPlayer, getCanonicalTeam } from "../domain/canonicalResolver";
import { validateCanonicalData } from "./validateCanonicalData";
import { validateGoals } from "./validateGoals";
import { validateTeams } from "./validateTeams";

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

const [leaderboard, goals, rawGoals, scorers, matches, meta] = await Promise.all([
  readJson<LeaderboardEntry[]>("public/data/leaderboard.json"),
  readJson<ScoredGoal[]>("public/data/goals.json"),
  readJson<GoalRecord[]>("public/data/raw-goals.json"),
  readJson<ScorerEntry[]>("public/data/scorers.json"),
  readJson<MatchRecord[]>("public/data/matches.json"),
  readJson<StaticMeta>("public/data/meta.json")
]);

assert.equal(validateCanonicalData().valid, true);
assert.equal(validateTeams(teams).valid, true);

const goalValidation = validateGoals(rawGoals);
assert.equal(goalValidation.validGoals.length, rawGoals.length);
assert.equal(goalValidation.skippedGoals.length, 0);

assert.deepEqual(leaderboard, buildLeaderboard(teams, rawGoals));
assert.deepEqual(goals, sortGoalsChronologically(scoreGoalsForTeams(teams, rawGoals)));
assert.deepEqual(scorers, buildScorers(rawGoals, teams));
assert.deepEqual(matches, buildMatches(rawGoals, goals));

assert.equal(meta.status, "ok");
assert.equal(meta.goalCount, rawGoals.length);
assert.equal(meta.scoredGoalCount, goals.length);
assert.equal(meta.skippedGoalCount, 0);
assert.equal(meta.duplicateGoalCount, 0);

const owners = new Set(teams.map((team) => team.owner));
for (const goal of goals) {
  assert.equal(owners.has(goal.owner), true, `Unknown owner in scored goal: ${goal.owner}`);
  assert.equal(goal.points > 0, true, `Scored goal has no points: ${goal.externalGoalId}`);
  assert.equal(Boolean(goal.playerId), true, `Scored goal has no canonical playerId: ${goal.externalGoalId}`);
  assert.equal(Boolean(goal.teamId), true, `Scored goal has no canonical teamId: ${goal.externalGoalId}`);
  assert.equal(Boolean(goal.displayPlayerName), true, `Scored goal has no display player name: ${goal.externalGoalId}`);
  assert.equal(Boolean(goal.displayNationalTeam), true, `Scored goal has no display national team: ${goal.externalGoalId}`);

  const player = getCanonicalPlayer(goal.playerId);
  const team = getCanonicalTeam(goal.teamId);
  assert.equal(Boolean(player), true, `Scored goal points to unknown canonical player: ${goal.playerId}`);
  assert.equal(Boolean(team), true, `Scored goal points to unknown canonical team: ${goal.teamId}`);
  assert.equal(goal.displayPlayerName, player?.displayName);
  assert.equal(goal.displayNationalTeam, team ? getTeamDisplayName(team) : undefined);
}

for (const goal of rawGoals) {
  if (goal.playerId) {
    const player = getCanonicalPlayer(goal.playerId);
    assert.equal(Boolean(player), true, `Raw goal points to unknown canonical player: ${goal.playerId}`);
    assert.equal(goal.teamId, player?.teamId);
  }
}

console.log("Static data tests passed.");
