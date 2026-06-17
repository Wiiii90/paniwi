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

const ownGoalDisplayMatch = buildMatches(
  [
    {
      ...baseGoal,
      externalGoalId: "own-goal-display",
      playerName: "Own Goal Player",
      nationalTeam: "Away Team",
      teamId: "tunisia",
      sourceTeamName: "Home Team",
      detail: "own-goal",
      matchId: "api-football:own-goal-fixture",
      fixtureId: "own-goal-fixture"
    }
  ],
  [],
  [
    {
      source: "api-football",
      matchId: "api-football:own-goal-fixture",
      fixtureId: "own-goal-fixture",
      label: "Sweden 1-0 Tunisia",
      kickedOffAt: "2026-06-15T02:00:00+00:00",
      status: "finished",
      homeTeam: { name: "Sweden", score: 1 },
      awayTeam: { name: "Tunisia", score: 0 }
    }
  ]
);
const ownGoalsBySide = groupGoalsBySide(ownGoalDisplayMatch[0]);
assert.deepEqual(
  [ownGoalsBySide.home.map((goal) => goal.externalGoalId), ownGoalsBySide.away.map((goal) => goal.externalGoalId)],
  [["own-goal-display"], []]
);

const participantStatusMatch = buildMatches(
  [],
  [],
  [
    {
      source: "api-football",
      matchId: "api-football:participant-status",
      fixtureId: "participant-status",
      label: "Sweden 0-0 Tunisia",
      kickedOffAt: "2026-06-15T02:00:00+00:00",
      status: "finished",
      homeTeam: { name: "Sweden", score: 0 },
      awayTeam: { name: "Tunisia", score: 0 }
    }
  ],
  [
    {
      source: "api-football",
      matchId: "api-football:participant-status",
      fixtureId: "participant-status",
      playerName: "Subbed Player",
      nationalTeam: "Sweden",
      teamId: "sweden",
      status: "bench"
    },
    {
      source: "api-football",
      matchId: "api-football:participant-status",
      fixtureId: "participant-status",
      playerName: "Subbed Player",
      nationalTeam: "Sweden",
      teamId: "sweden",
      status: "subbed-in"
    },
    {
      source: "api-football",
      matchId: "api-football:participant-status",
      fixtureId: "participant-status",
      playerName: "Subbed Player",
      nationalTeam: "Sweden",
      teamId: "sweden",
      status: "subbed-out"
    }
  ]
);
assert.equal(participantStatusMatch[0].participants[0].status, "subbed-in-out");

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


console.log("Domain match tests passed.");
