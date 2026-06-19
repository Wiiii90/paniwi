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
import { getLatestFinishedMatches, getLiveAndUpcomingMatches, getTodayOrLiveMatches } from "../../src/domain/matchFilters";
import { buildRunningGoalScores, groupGoalsBySide, groupMatchesBySection } from "../../src/domain/matchGrouping";
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

const participantApiIdMatch = buildMatches(
  [],
  [],
  [
    {
      source: "football-data",
      matchId: "football-data:participant-api-id",
      fixtureId: "participant-api-id",
      label: "Switzerland 1-0 Bosnia-Herzegovina",
      kickedOffAt: "2026-06-18T19:00:00.000Z",
      status: "finished",
      homeTeam: { name: "Switzerland", score: 1 },
      awayTeam: { name: "Bosnia-Herzegovina", score: 0 }
    }
  ],
  [
    {
      source: "api-football",
      matchId: "football-data:participant-api-id",
      fixtureId: "1539005",
      playerName: "R. Vargas",
      nationalTeam: "Switzerland",
      teamId: "switzerland",
      apiPlayerId: 48471,
      status: "subbed-in"
    },
    {
      source: "api-football",
      matchId: "football-data:participant-api-id",
      fixtureId: "1539005",
      playerName: "Rubén Vargas",
      nationalTeam: "Switzerland",
      teamId: "switzerland",
      apiPlayerId: 48471,
      status: "bench"
    }
  ],
  teams
);
const apiIdParticipants = participantApiIdMatch[0].participants.filter((participant) => participant.apiPlayerId === 48471);
assert.equal(apiIdParticipants.length, 1);
assert.equal(apiIdParticipants[0]?.status, "subbed-in");

const runningScoreMatch = buildMatches(
  [
    {
      ...baseGoal,
      externalGoalId: "api-football:running:away:29:Normal Goal:0",
      playerName: "Away Scorer",
      nationalTeam: "Norway",
      teamId: "norway",
      sourceTeamName: "Norway",
      detail: "normal",
      minute: 29,
      matchId: "api-football:running",
      fixtureId: "running"
    },
    {
      ...baseGoal,
      externalGoalId: "api-football:running:home:39:Normal Goal:1",
      playerName: "Home Scorer",
      nationalTeam: "Iraq",
      teamId: "iraq",
      sourceTeamName: "Iraq",
      detail: "normal",
      minute: 39,
      matchId: "api-football:running",
      fixtureId: "running"
    },
    {
      ...baseGoal,
      externalGoalId: "api-football:running:away:43:Normal Goal:2",
      playerName: "Away Scorer",
      nationalTeam: "Norway",
      teamId: "norway",
      sourceTeamName: "Norway",
      detail: "normal",
      minute: 43,
      matchId: "api-football:running",
      fixtureId: "running"
    },
    {
      ...baseGoal,
      externalGoalId: "api-football:running:home:90:Own Goal:3",
      playerName: "Home Own Goal",
      nationalTeam: "Iraq",
      teamId: "iraq",
      sourceTeamName: "Norway",
      detail: "own-goal",
      minute: 90,
      matchId: "api-football:running",
      fixtureId: "running"
    }
  ],
  [],
  [
    {
      source: "api-football",
      matchId: "api-football:running",
      fixtureId: "running",
      label: "Iraq 1-3 Norway",
      kickedOffAt: "2026-06-16T22:00:00+00:00",
      status: "finished",
      homeTeam: { name: "Iraq", score: 1 },
      awayTeam: { name: "Norway", score: 3 }
    }
  ]
)[0];
assert.deepEqual([...buildRunningGoalScores(runningScoreMatch)], [
  ["api-football:running:away:29:Normal Goal:0", "0:1"],
  ["api-football:running:home:39:Normal Goal:1", "1:1"],
  ["api-football:running:away:43:Normal Goal:2", "1:2"],
  ["api-football:running:home:90:Own Goal:3", "1:3"]
]);

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

const scheduledAfterKickoffMatch = buildMatches(
  [],
  [],
  [
    {
      source: "api-football",
      matchId: "api-football:scheduled-after-kickoff",
      fixtureId: "scheduled-after-kickoff",
      label: "Portugal 0-0 DR Congo",
      kickedOffAt: "2026-06-17T17:00:00+00:00",
      status: "scheduled",
      homeTeam: { name: "Portugal", score: 0 },
      awayTeam: { name: "DR Congo", score: 0 }
    }
  ]
)[0];
assert.deepEqual(
  groupMatchesBySection([scheduledAfterKickoffMatch], new Date("2026-06-17T15:30:00.000Z")).upcoming.map((match) => match.matchId),
  ["api-football:scheduled-after-kickoff"]
);
assert.deepEqual(
  groupMatchesBySection([scheduledAfterKickoffMatch], new Date("2026-06-17T16:15:00.000Z")).upcoming.map((match) => match.matchId),
  ["api-football:scheduled-after-kickoff"]
);
assert.deepEqual(
  groupMatchesBySection([scheduledAfterKickoffMatch], new Date("2026-06-17T17:11:00.000Z")).upcoming.map((match) => match.matchId),
  ["api-football:scheduled-after-kickoff"]
);
assert.deepEqual(groupMatchesBySection([scheduledAfterKickoffMatch], new Date("2026-06-17T17:11:00.000Z")).live, []);
assert.deepEqual(
  getLiveAndUpcomingMatches([scheduledAfterKickoffMatch], new Date("2026-06-17T17:11:00.000Z")).map((match) => match.matchId),
  ["api-football:scheduled-after-kickoff"]
);

const homePreviewMatches = buildMatches(
  [],
  [],
  [
    {
      source: "api-football",
      matchId: "api-football:upcoming-later",
      fixtureId: "upcoming-later",
      label: "Argentina vs Algeria",
      kickedOffAt: "2026-06-17T21:00:00+00:00",
      status: "scheduled",
      homeTeam: { name: "Argentina" },
      awayTeam: { name: "Algeria" }
    },
    {
      source: "api-football",
      matchId: "api-football:scheduled-active",
      fixtureId: "scheduled-active",
      label: "Portugal 0-0 DR Congo",
      kickedOffAt: "2026-06-17T17:00:00+00:00",
      status: "scheduled",
      homeTeam: { name: "Portugal", score: 0 },
      awayTeam: { name: "DR Congo", score: 0 }
    },
    {
      source: "api-football",
      matchId: "api-football:live-active",
      fixtureId: "live-active",
      label: "Mexico 1-1 Japan",
      kickedOffAt: "2026-06-17T18:00:00+00:00",
      status: "live",
      homeTeam: { name: "Mexico", score: 1 },
      awayTeam: { name: "Japan", score: 1 }
    },
    {
      source: "api-football",
      matchId: "api-football:upcoming-sooner",
      fixtureId: "upcoming-sooner",
      label: "France vs Australia",
      kickedOffAt: "2026-06-17T20:00:00+00:00",
      status: "scheduled",
      homeTeam: { name: "France" },
      awayTeam: { name: "Australia" }
    }
  ]
);
assert.deepEqual(
  getLiveAndUpcomingMatches(homePreviewMatches, new Date("2026-06-17T17:11:00.000Z")).map((match) => match.matchId),
  ["api-football:live-active", "api-football:scheduled-active", "api-football:upcoming-sooner"]
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
