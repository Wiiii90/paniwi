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
import { getSourcesForMode, parseSyncSourceMode } from "../../src/sync/sources/sourceSelection";
import { parseWikipediaFootballBoxes, parseWikipediaGoalscorers } from "../../src/sync/sources/wikipediaSource";
import { buildSourceErrorMeta, mergeGoalSnapshots, mergeParticipantSnapshots } from "../../src/sync/syncGoals";
import { buildSnapshotFingerprint } from "../../src/sync/snapshotFingerprint";
import { validateGoals } from "../../src/sync/validateGoals";
import { ambiguousNorwayRosterSnapshot, apiResolverRosterSnapshot, baseGoal, initialLastNameRosterSnapshot, legacyNormalizedNorwayRosterSnapshot, rosterSnapshot, teams } from "../helpers/domainFixtures";

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
const existingSameDayApiGoal: GoalRecord = {
  ...baseGoal,
  externalGoalId: "api-existing-same-day",
  source: "api-football",
  kickedOffAt: "2026-06-15T19:00:00.000Z"
};
assert.deepEqual(
  mergeGoalSnapshots("api-football", [oldWikipediaGoal, sameDayWikipediaGoal, existingSameDayApiGoal], [sameDayApiGoal], ["2026-06-15"]).map(
    (goal) => goal.externalGoalId
  ),
  ["wiki-old", "api-existing-same-day", "api-same-day"]
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
assert.deepEqual(
  mergeParticipantSnapshots(
    "api-football",
    [
      {
        source: "api-football",
        matchId: "api-football:existing",
        fixtureId: "existing",
        playerName: "Existing Starter",
        nationalTeam: "Iran",
        teamId: "iran",
        status: "starter"
      },
      {
        source: "wikipedia",
        matchId: "wikipedia:same-day",
        playerName: "Same Day Wiki",
        nationalTeam: "Iran",
        teamId: "iran",
        status: "unknown"
      }
    ],
    [
      {
        source: "api-football",
        matchId: "api-football:incoming",
        fixtureId: "incoming",
        playerName: "Incoming Starter",
        nationalTeam: "Iran",
        teamId: "iran",
        status: "starter"
      }
    ],
    [
      {
        source: "api-football",
        matchId: "api-football:existing",
        fixtureId: "existing",
        label: "Existing",
        kickedOffAt: "2026-06-15T19:00:00.000Z",
        status: "finished",
        homeTeam: { name: "Iran" },
        awayTeam: { name: "Norway" }
      },
      {
        source: "wikipedia",
        matchId: "wikipedia:same-day",
        label: "Same Day",
        kickedOffAt: "2026-06-15T19:00:00.000Z",
        status: "finished",
        homeTeam: { name: "Iran" },
        awayTeam: { name: "Norway" }
      }
    ],
    ["2026-06-15"]
  ).map((participant) => participant.playerName),
  ["Existing Starter", "Incoming Starter"]
);

console.log("Snapshot merge tests passed.");
