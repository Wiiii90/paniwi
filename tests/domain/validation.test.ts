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
import { formatTeamValidationIssues, validateTeams } from "../../src/sync/validateTeams";
import { ambiguousNorwayRosterSnapshot, apiResolverRosterSnapshot, baseGoal, initialLastNameRosterSnapshot, legacyNormalizedNorwayRosterSnapshot, rosterSnapshot, teams } from "../helpers/domainFixtures";

assert.deepEqual(validateTeams(teams), { valid: false, issues: [{ owner: "Anna", reason: "invalid-team-size" }, { owner: "Ben", reason: "invalid-team-size" }] });

const validPlayers = [
  { playerName: "Player One", teamId: "sweden" },
  { playerName: "Player Two", teamId: "germany" },
  { playerName: "Player Three", teamId: "brazil" },
  { playerName: "Player Four", teamId: "australia" },
  { playerName: "Player Five", teamId: "spain" },
  { playerName: "Player Six", teamId: "portugal" },
  { playerName: "Player Seven", teamId: "england" },
  { playerName: "Player Eight", teamId: "morocco" },
  { playerName: "Player Nine", teamId: "canada" },
  { playerName: "Player Ten", teamId: "mexico" }
];
const validTeam: ParticipantTeam = {
  owner: "Valid",
  players: validPlayers
};
assert.equal(validateTeams([validTeam]).valid, true);
assert.equal(
  validateTeams([
    {
      owner: "ValidWithGoalkeeper",
      players: [
        { playerName: "Goalkeeper One", teamId: "scotland", position: "goalkeeper" },
        ...validPlayers
      ]
    }
  ]).valid,
  true
);
assert.equal(
  validateTeams([
    {
      ...validTeam,
      players: [{ playerName: "Goalkeeper One", teamId: "scotland", position: "goalkeeper" }, ...validTeam.players.slice(1)]
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
      { playerName: "", teamId: "sweden" },
      { playerName: "Ghost Player", teamId: "unknown-team" },
      { playerName: "Repeat Player", teamId: "sweden" },
      { playerName: "Repeat Player", teamId: "sweden" }
    ]
  }
]);
assert.equal(invalidTeams.valid, false);
assert.equal(formatTeamValidationIssues(invalidTeams.issues).includes("duplicate-owner"), true);
assert.equal(formatTeamValidationIssues(invalidTeams.issues).includes("missing-player-name"), true);
assert.equal(formatTeamValidationIssues(invalidTeams.issues).includes("unknown-team-id"), true);
assert.equal(formatTeamValidationIssues(invalidTeams.issues).includes("duplicate-player-id-in-team"), true);

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

console.log("Domain validation tests passed.");
