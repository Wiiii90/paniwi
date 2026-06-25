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

const normalizedGoals = normalizeGoals([
  {
    playerName: "Jamal Musiala",
    nationalTeam: "Germany",
    source: "mock",
    matchId: "germany-uruguay",
    kickedOffAt: "2026-06-14T19:20:00.000Z",
    minute: 64
  }
]);

assert.equal(normalizedGoals[0].timeConfidence, "estimated");
assert.equal(normalizedGoals[0].externalGoalId.includes("jamal musiala"), true);

assert.deepEqual(
  sortGoalsChronologically([
    { ...baseGoal, externalGoalId: "late", scoredAt: "2026-06-12T20:00:00.000Z" },
    { ...baseGoal, externalGoalId: "early", scoredAt: "2026-06-12T19:00:00.000Z" }
  ]).map((goal) => goal.externalGoalId),
  ["early", "late"]
);

const apiAbbreviatedRosterGoals = [
  {
    ...baseGoal,
    externalGoalId: "ayari-1",
    playerName: "Y. Ayari",
    sourcePlayerName: "Y. Ayari",
    nationalTeam: "Sweden",
    apiPlayerId: 265820
  },
  {
    ...baseGoal,
    externalGoalId: "ayari-2",
    playerName: "Y. Ayari",
    sourcePlayerName: "Y. Ayari",
    nationalTeam: "Sweden",
    apiPlayerId: 265820
  }
];
assert.deepEqual(
  enrichGoalsWithRoster(apiAbbreviatedRosterGoals, rosterSnapshot).map((goal) => goal.playerName),
  ["Yasin Ayari", "Yasin Ayari"]
);
assert.deepEqual(
  enrichGoalsWithRoster(
    [
      {
        ...baseGoal,
        externalGoalId: "iraq-goal",
        playerName: "A. Hussein",
        nationalTeam: "Iraq",
        sourcePlayerName: "A. Hussein",
        sourceTeamName: "Iraq",
        source: "api-football",
        matchLabel: "Iraq 1-2 Norway"
      }
    ],
    initialLastNameRosterSnapshot,
    { strictSources: ["api-football"] }
  ).map((goal) => goal.playerName),
  ["Aymen Hussein"]
);
assert.deepEqual(
  enrichGoalsWithRoster(
    [
      {
        ...baseGoal,
        externalGoalId: "norway-goal",
        playerName: "L. Ostigard",
        nationalTeam: "Norway",
        sourcePlayerName: "L. Ostigard",
        sourceTeamName: "Norway",
        source: "api-football",
        matchLabel: "Iraq 1-4 Norway"
      }
    ],
    legacyNormalizedNorwayRosterSnapshot,
    { strictSources: ["api-football"] }
  ).map((goal) => [goal.playerName, goal.teamId]),
  [["Leo Østigård", "norway"]]
);
assert.deepEqual(
  enrichGoalsWithRoster(
    [
      {
        ...baseGoal,
        externalGoalId: "cape-verde-goal",
        playerName: "K. Lenini",
        nationalTeam: "Cape Verde Islands",
        sourcePlayerName: "K. Lenini",
        sourceTeamName: "Cape Verde Islands",
        source: "api-football",
        matchLabel: "Uruguay 2-2 Cape Verde Islands"
      }
    ],
    {
      lastUpdated: "2026-06-16T00:00:00.000Z",
      source: "wikipedia",
      pageTitle: "2026 FIFA World Cup squads",
      teamCount: 1,
      playerCount: 1,
      teams: [
        {
          teamName: "Cape Verde",
          teamId: "cape-verde",
          players: [
            {
              playerName: "Kevin Pina",
              normalizedPlayerName: "kevin pina",
              position: "midfielder",
              shirtNumber: 6,
              sourceName: "Kevin Pina"
            }
          ]
        }
      ]
    },
    { strictSources: ["api-football"] }
  ).map((goal) => [goal.playerName, goal.teamId]),
  [["Kevin Pina", "cape-verde"]]
);
assert.deepEqual(
  enrichGoalsWithRoster(
    [
      {
        ...baseGoal,
        externalGoalId: "mexico-chavez-goal",
        playerName: "M. Chavez Garcia",
        nationalTeam: "Mexico",
        sourcePlayerName: "M. Chavez Garcia",
        sourceTeamName: "Mexico",
        source: "api-football",
        matchLabel: "Czechia 0-3 Mexico"
      }
    ],
    {
      lastUpdated: "2026-06-16T00:00:00.000Z",
      source: "wikipedia",
      pageTitle: "2026 FIFA World Cup squads",
      teamCount: 1,
      playerCount: 2,
      teams: [
        {
          teamName: "Mexico",
          teamId: "mexico",
          players: [
            {
              playerName: "Mateo Chávez",
              normalizedPlayerName: "mateo chavez",
              position: "defender",
              shirtNumber: 20,
              sourceName: "Mateo Chávez"
            },
            {
              playerName: "Luis Chávez",
              normalizedPlayerName: "luis chavez",
              position: "midfielder",
              shirtNumber: 24,
              sourceName: "Luis Chávez"
            }
          ]
        }
      ]
    },
    { strictSources: ["api-football"] }
  ).map((goal) => [goal.playerName, goal.teamId]),
  [["Mateo Chávez", "mexico"]]
);
assert.deepEqual(
  enrichGoalsWithRoster(
    [
      {
        ...baseGoal,
        externalGoalId: "morocco-bono-own-goal",
        playerName: "Bono",
        nationalTeam: "Haiti",
        sourcePlayerName: "Bono",
        sourceTeamName: "Haiti",
        source: "api-football",
        detail: "own-goal",
        matchLabel: "Morocco 4-2 Haiti"
      }
    ],
    {
      lastUpdated: "2026-06-16T00:00:00.000Z",
      source: "wikipedia",
      pageTitle: "2026 FIFA World Cup squads",
      teamCount: 2,
      playerCount: 2,
      teams: [
        {
          teamName: "Morocco",
          teamId: "morocco",
          players: [
            {
              playerName: "Yassine Bounou",
              normalizedPlayerName: "yassine bounou",
              position: "goalkeeper",
              shirtNumber: 1,
              sourceName: "Yassine Bounou"
            }
          ]
        },
        {
          teamName: "Haiti",
          teamId: "haiti",
          players: [
            {
              playerName: "Duckens Nazon",
              normalizedPlayerName: "duckens nazon",
              position: "forward",
              shirtNumber: 9,
              sourceName: "Duckens Nazon"
            }
          ]
        }
      ]
    },
    { strictSources: ["api-football"] }
  ).map((goal) => [goal.playerName, goal.nationalTeam, goal.teamId, goal.detail, goal.sourceTeamName]),
  [["Yassine Bounou", "Morocco", "morocco", "own-goal", "Haiti"]]
);
assert.deepEqual(
  enrichGoalsWithRoster(
    [
      {
        ...baseGoal,
        externalGoalId: "egypt-salah-goal",
        playerName: "M. Salah",
        nationalTeam: "Egypt",
        sourcePlayerName: "M. Salah",
        sourceTeamName: "Egypt",
        source: "api-football",
        matchLabel: "New Zealand 1-3 Egypt"
      }
    ],
    {
      lastUpdated: "2026-06-16T00:00:00.000Z",
      source: "wikipedia",
      pageTitle: "2026 FIFA World Cup squads",
      teamCount: 1,
      playerCount: 2,
      teams: [
        {
          teamName: "Egypt",
          teamId: "egypt",
          players: [
            {
              playerName: "Mohamed Salah",
              normalizedPlayerName: "mohamed salah",
              position: "forward",
              shirtNumber: 10,
              sourceName: "Mohamed Salah"
            },
            {
              playerName: "Mohamed Alaa",
              normalizedPlayerName: "mohamed alaa",
              position: "goalkeeper",
              shirtNumber: 26,
              sourceName: "Mohamed Alaa"
            }
          ]
        }
      ]
    },
    { strictSources: ["api-football"] }
  ).map((goal) => [goal.playerName, goal.teamId]),
  [["Mohamed Salah", "egypt"]]
);
assert.throws(
  () =>
    enrichGoalsWithRoster(
      [
        {
          ...baseGoal,
          externalGoalId: "ambiguous-initial-goal",
          playerName: "M. Al",
          nationalTeam: "Egypt",
          sourcePlayerName: "M. Al",
          sourceTeamName: "Egypt",
          source: "api-football",
          matchLabel: "New Zealand 1-3 Egypt"
        }
      ],
      {
        lastUpdated: "2026-06-16T00:00:00.000Z",
        source: "wikipedia",
        pageTitle: "2026 FIFA World Cup squads",
        teamCount: 1,
        playerCount: 2,
        teams: [
          {
            teamName: "Egypt",
            teamId: "egypt",
            players: [
              {
                playerName: "Mohamed Alaa",
                normalizedPlayerName: "mohamed alaa",
                position: "goalkeeper",
                shirtNumber: 26,
                sourceName: "Mohamed Alaa"
              },
              {
                playerName: "Mostafa Ziko",
                normalizedPlayerName: "mostafa ziko",
                position: "midfielder",
                shirtNumber: 11,
                sourceName: "Mostafa Ziko"
              }
            ]
          }
        ]
      },
      { strictSources: ["api-football"] }
    ),
  /Roster-Match fehlgeschlagen/
);
assert.throws(
  () =>
    enrichGoalsWithRoster(
      [
        {
          ...baseGoal,
          externalGoalId: "ambiguous-norway-goal",
          playerName: "L. Ostigard",
          nationalTeam: "Norway",
          sourcePlayerName: "L. Ostigard",
          sourceTeamName: "Norway",
          source: "api-football",
          matchLabel: "Iraq 1-4 Norway"
        }
      ],
      ambiguousNorwayRosterSnapshot,
      { strictSources: ["api-football"] }
    ),
  /Roster-Match fehlgeschlagen/
);
assert.deepEqual(
  enrichGoalsWithRoster(
    [
      {
        ...baseGoal,
        externalGoalId: "egypt-own-goal",
        playerName: "M. Hany",
        nationalTeam: "Belgium",
        sourcePlayerName: "M. Hany",
        sourceTeamName: "Belgium",
        source: "api-football",
        detail: "own-goal",
        matchLabel: "Belgium 1-1 Egypt"
      },
      {
        ...baseGoal,
        externalGoalId: "saudi-goal",
        playerName: "A. Al Amri",
        nationalTeam: "Saudi Arabia",
        sourcePlayerName: "A. Al Amri",
        sourceTeamName: "Saudi Arabia",
        source: "api-football",
        matchLabel: "Saudi Arabia 1-0 Uruguay"
      },
      {
        ...baseGoal,
        externalGoalId: "qatar-own-goal",
        playerName: "M. Al Mannai",
        nationalTeam: "Canada",
        sourcePlayerName: "M. Al Mannai",
        sourceTeamName: "Canada",
        source: "api-football",
        detail: "own-goal",
        matchLabel: "Canada 6-0 Qatar"
      }
    ],
    apiResolverRosterSnapshot,
    { strictSources: ["api-football"] }
  ).map((goal) => [goal.playerName, goal.nationalTeam, goal.teamId, goal.detail]),
  [
    ["Mohamed Hany", "Egypt", "egypt", "own-goal"],
    ["Abdulelah Al-Amri", "Saudi Arabia", "saudi-arabia", "normal"],
    ["Mohamed Manai", "Qatar", "qatar", "own-goal"]
  ]
);
assert.deepEqual(
  enrichGoalsWithRoster(
    [
      {
        ...baseGoal,
        externalGoalId: "unresolved-own-goal",
        playerName: "Unknown Defender",
        nationalTeam: "Haiti",
        sourcePlayerName: "Unknown Defender",
        sourceTeamName: "Haiti",
        source: "api-football",
        detail: "own-goal",
        matchLabel: "Morocco 4-2 Haiti"
      }
    ],
    apiResolverRosterSnapshot,
    { strictSources: ["api-football"] }
  ).map((goal) => [goal.playerName, goal.nationalTeam, goal.teamId, goal.detail]),
  [["Unknown Defender", "Haiti", undefined, "own-goal"]]
);
assert.deepEqual(
  buildScorers(apiAbbreviatedRosterGoals, teams, rosterSnapshot).map((scorer) => [
    scorer.playerName,
    scorer.nationalTeam,
    scorer.goals
  ]),
  [["Yasin Ayari", "Schweden", 2]]
);

const validation = validateGoals([
  baseGoal,
  { ...baseGoal },
  { ...baseGoal, externalGoalId: "invalid-minute", minute: 200 }
]);

assert.equal(validation.validGoals.length, 1);
assert.deepEqual(
  validation.skippedGoals.map((item) => item.reason),
  ["duplicate-goal", "invalid-minute"]
);


console.log("Domain roster resolver tests passed.");
