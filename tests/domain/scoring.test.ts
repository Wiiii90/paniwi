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
import type { GoalRecord, ParticipantTeam } from "../../src/domain/types";
import type { RosterSnapshot } from "../../src/domain/rosterTypes";
import { normalizeGoals } from "../../src/sync/normalizeGoals";
import {
  filterWorldCupFixtures,
  fixtureNeedsGoalEvents,
  getExistingFixtureIdsWithLineups,
  getApiFootballRequestLimit,
  getApiFootballDateKeys,
  getLiveCarryoverFixtureIds,
  getApiFootballLineupRequestLimit,
  getMissingEventBackfillFixtureIds,
  getMissingLineupBackfillFixtureIds,
  parseApiFootballFixture,
  parseApiFootballEvents,
  parseApiFootballLineups,
  parseApiFootballSubstitutions,
  shouldFetchFixtureEvents
} from "../../src/sync/sources/apiFootballSource";
import { apiFootballSource } from "../../src/sync/sources/apiFootballSource";
import { getSourcesForMode, parseSyncSourceMode } from "../../src/sync/sources/sourceSelection";
import { parseWikipediaFootballBoxes, parseWikipediaGoalscorers } from "../../src/sync/sources/wikipediaSource";
import { buildSourceErrorMeta, mergeGoalSnapshots, mergeParticipantSnapshots } from "../../src/sync/syncGoals";
import { buildSnapshotFingerprint } from "../../src/sync/snapshotFingerprint";
import { validateGoals } from "../../src/sync/validateGoals";
import { ambiguousNorwayRosterSnapshot, apiResolverRosterSnapshot, baseGoal, initialLastNameRosterSnapshot, legacyNormalizedNorwayRosterSnapshot, rosterSnapshot, teams } from "../helpers/domainFixtures";

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


console.log("Domain scoring tests passed.");


