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

assert.equal(parseSyncSourceMode(undefined), "mock");
assert.equal(parseSyncSourceMode("nope"), "mock");
assert.equal(parseSyncSourceMode("api-football"), "api-football");
assert.deepEqual(
  getSourcesForMode("mock").map((source) => source.name),
  ["mock"]
);
assert.deepEqual(
  getSourcesForMode("api-football").map((source) => source.name),
  ["api-football"]
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

const wikipediaMatchGoals = parseWikipediaFootballBoxes(
  `{{#invoke:football box|main
|date={{Start date|2026|6|11}}
|time=1:00&nbsp;p.m. [[UTC−06:00|UTC−6]]
|team1={{#invoke:flag|fb-rt|MEX}}
|score={{score link|2026 FIFA World Cup Group A#Mexico vs South Africa|2–0}}
|team2={{#invoke:flag|fb|RSA}}
|goals1=
*[[Julián Quiñones|Quiñones]] 9'
*[[Raúl Jiménez|Jiménez]] 67'
|goals2=
|stadium=[[Estadio Azteca]], [[Mexico City]]
}}<section end=A1 />`,
  "2026 FIFA World Cup Group A"
);

assert.deepEqual(
  wikipediaMatchGoals.map((goal) => [
    goal.playerName,
    goal.nationalTeam,
    goal.minute,
    goal.detail,
    goal.timeConfidence,
    goal.matchLabel
  ]),
  [
    ["Julián Quiñones", "Mexico", 9, "normal", "estimated", "Mexico 2–0 South Africa"],
    ["Raúl Jiménez", "Mexico", 67, "normal", "estimated", "Mexico 2–0 South Africa"]
  ]
);

const wikipediaDisambiguatedGoal = parseWikipediaFootballBoxes(
  `{{#invoke:football box|main
|date={{Start date|2026|6|12}}
|time=2:00 a.m. UTC
|team1={{#invoke:flag|fb-rt|KOR}}
|score=2–1
|team2={{#invoke:flag|fb|CZE}}
|goals1=
|goals2=
*[[Ladislav Krejčí (footballer, born 1999)|Krejčí]] 59'
|stadium=[[BMO Field]]
}}<section end=A2 />`,
  "2026 FIFA World Cup Group A"
);

assert.deepEqual(
  wikipediaDisambiguatedGoal.map((goal) => [goal.playerName, goal.nationalTeam, goal.minute]),
  [["Ladislav Krejčí", "Czech Republic", 59]]
);

const wikipediaTemplateGoals = parseWikipediaFootballBoxes(
  `{{#invoke:football box|main
|date={{Start date|2026|6|14}}
|time=12:00 p.m. UTC-5
|team1={{#invoke:flag|fb-rt|GER}}
|score=7–1
|team2={{#invoke:flag|fb|CUW}}
|goals1=
*[[Felix Nmecha|Nmecha]] {{goal|6}}
*[[Kai Havertz|Havertz]] {{goal|45+5|pen.|88}}
|goals2=
*[[Livano Comenencia|Comenencia]] {{goal|21}}
|stadium=[[NRG Stadium]]
}}<section end=E1 />`,
  "2026 FIFA World Cup Group E"
);

assert.deepEqual(
  wikipediaTemplateGoals.map((goal) => [goal.playerName, goal.nationalTeam, goal.minute, goal.detail]),
  [
    ["Felix Nmecha", "Germany", 6, "normal"],
    ["Kai Havertz", "Germany", 50, "penalty"],
    ["Kai Havertz", "Germany", 88, "normal"],
    ["Livano Comenencia", "Curaçao", 21, "normal"]
  ]
);

const wikipediaOwnGoal = parseWikipediaFootballBoxes(
  `{{#invoke:football box|main
|team1={{#invoke:flag|fb-rt|QAT}}
|score=1–1
|team2={{#invoke:flag|fb|SUI}}
|goals1=
*[[Miro Muheim|Muheim]] 90+4' o.g.
|goals2=
*[[Breel Embolo|Embolo]] 17' pen.
|stadium=[[Levi's Stadium]]
}}<section end=B2 />`,
  "2026 FIFA World Cup Group B"
);

assert.deepEqual(
  wikipediaOwnGoal.map((goal) => [goal.playerName, goal.nationalTeam, goal.minute, goal.detail]),
  [
    ["Miro Muheim", "Switzerland", 94, "own-goal"],
    ["Breel Embolo", "Switzerland", 17, "penalty"]
  ]
);

const wikipediaEmptyGoalsColumn = parseWikipediaFootballBoxes(
  `{{#invoke:football box|main
|team1={{#invoke:flag|fb-rt|HAI}}
|score=0–1
|team2={{#invoke:flag|fb|SCO}}
|goals1=
|goals2=
*[[John McGinn|McGinn]] 28'
|stadium=[[Gillette Stadium]]
}}<section end=C2 />`,
  "2026 FIFA World Cup Group C"
);

assert.deepEqual(
  wikipediaEmptyGoalsColumn.map((goal) => [goal.playerName, goal.nationalTeam, goal.minute, goal.detail]),
  [["John McGinn", "Scotland", 28, "normal"]]
);

console.log("Wikipedia source tests passed.");
