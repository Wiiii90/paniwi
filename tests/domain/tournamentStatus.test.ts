import assert from "node:assert/strict";
import { teamCatalog } from "../../src/config/teamCatalog";
import type { MatchRecord } from "../../src/domain/matchTypes";
import type { RosterSnapshot } from "../../src/domain/rosterTypes";
import { buildTeamTournamentStatusSnapshot } from "../../src/domain/tournamentStatus";

function getTeam(teamId: string) {
  const team = teamCatalog.find((entry) => entry.teamId === teamId);
  assert.ok(team, `Missing team catalog entry for ${teamId}`);
  return team;
}

function createMatch(
  index: number,
  homeTeamId: string,
  awayTeamId: string,
  overrides: Partial<MatchRecord> = {}
): MatchRecord {
  const homeTeam = getTeam(homeTeamId);
  const awayTeam = getTeam(awayTeamId);

  return {
    matchId: `football-data:ko-${index}`,
    label: `${homeTeam.sourceName} vs ${awayTeam.sourceName}`,
    kickedOffAt: new Date(Date.parse("2026-06-28T19:00:00.000Z") + index * 3 * 60 * 60 * 1000).toISOString(),
    status: "scheduled",
    homeTeam: { name: homeTeam.sourceName },
    awayTeam: { name: awayTeam.sourceName },
    goals: [],
    pointGoals: [],
    affectedOwners: [],
    participants: [],
    ...overrides
  };
}

const firstRoundTeamIds = teamCatalog.slice(0, 32).map((team) => team.teamId);
const firstRoundMatches = Array.from({ length: 16 }, (_, index) =>
  createMatch(index, firstRoundTeamIds[index * 2]!, firstRoundTeamIds[index * 2 + 1]!)
);
const rosterSnapshot: RosterSnapshot = {
  lastUpdated: "2026-06-28T00:00:00.000Z",
  source: "wikipedia",
  pageTitle: "2026 FIFA World Cup squads",
  teamCount: 3,
  playerCount: 0,
  teams: [
    { teamName: getTeam(firstRoundTeamIds[0]!).sourceName, teamId: firstRoundTeamIds[0]!, players: [] },
    { teamName: getTeam(firstRoundTeamIds[1]!).sourceName, teamId: firstRoundTeamIds[1]!, players: [] },
    { teamName: "Scotland", teamId: "scotland", players: [] }
  ]
};

const incompleteSnapshot = buildTeamTournamentStatusSnapshot(firstRoundMatches.slice(0, 15), rosterSnapshot);
assert.equal(incompleteSnapshot.firstKnockoutRoundComplete, false);
assert.equal(incompleteSnapshot.teams.find((team) => team.teamId === "scotland")?.status, "unknown");

const completeSnapshot = buildTeamTournamentStatusSnapshot(firstRoundMatches, rosterSnapshot);
assert.equal(completeSnapshot.firstKnockoutRoundComplete, true);
assert.equal(completeSnapshot.knockoutMatchCount, 16);
assert.equal(completeSnapshot.knockoutTeamCount, 32);
assert.deepEqual(
  completeSnapshot.teams.find((team) => team.teamId === "scotland"),
  {
    teamId: "scotland",
    teamName: "Schottland",
    status: "eliminated",
    reason: "not-in-first-knockout-round"
  }
);

const duplicateFixtureSnapshot = buildTeamTournamentStatusSnapshot(
  [
    firstRoundMatches[0]!,
    ...firstRoundMatches.map((match, index) =>
      index === firstRoundMatches.length - 1
        ? {
            ...match,
            kickedOffAt: new Date(Date.parse(match.kickedOffAt!) + 24 * 60 * 60 * 1000).toISOString()
          }
        : match
    )
  ],
  rosterSnapshot
);
assert.equal(duplicateFixtureSnapshot.firstKnockoutRoundComplete, true);
assert.equal(duplicateFixtureSnapshot.knockoutTeamCount, 32);
assert.equal(duplicateFixtureSnapshot.teams.find((team) => team.teamId === "scotland")?.status, "eliminated");

const finishedHomeWinSnapshot = buildTeamTournamentStatusSnapshot(
  [
    createMatch(0, firstRoundTeamIds[0]!, firstRoundTeamIds[1]!, {
      status: "finished",
      homeTeam: { name: getTeam(firstRoundTeamIds[0]!).sourceName, score: 2 },
      awayTeam: { name: getTeam(firstRoundTeamIds[1]!).sourceName, score: 1 }
    }),
    ...firstRoundMatches.slice(1)
  ],
  rosterSnapshot
);
assert.equal(finishedHomeWinSnapshot.teams.find((team) => team.teamId === firstRoundTeamIds[0])?.status, "active");
assert.equal(finishedHomeWinSnapshot.teams.find((team) => team.teamId === firstRoundTeamIds[0])?.reason, "knockout-winner");
assert.equal(finishedHomeWinSnapshot.teams.find((team) => team.teamId === firstRoundTeamIds[1])?.status, "eliminated");
assert.equal(finishedHomeWinSnapshot.teams.find((team) => team.teamId === firstRoundTeamIds[1])?.reason, "knockout-loser");

const penaltyWinnerSnapshot = buildTeamTournamentStatusSnapshot(
  [
    createMatch(0, firstRoundTeamIds[0]!, firstRoundTeamIds[1]!, {
      status: "finished",
      winnerTeam: "away",
      homeTeam: { name: getTeam(firstRoundTeamIds[0]!).sourceName, score: 1 },
      awayTeam: { name: getTeam(firstRoundTeamIds[1]!).sourceName, score: 1 }
    }),
    ...firstRoundMatches.slice(1)
  ],
  rosterSnapshot
);
assert.equal(penaltyWinnerSnapshot.teams.find((team) => team.teamId === firstRoundTeamIds[0])?.status, "eliminated");
assert.equal(penaltyWinnerSnapshot.teams.find((team) => team.teamId === firstRoundTeamIds[1])?.status, "active");

const laterKnockoutLossSnapshot = buildTeamTournamentStatusSnapshot(
  [
    createMatch(0, firstRoundTeamIds[0]!, firstRoundTeamIds[1]!, {
      status: "finished",
      homeTeam: { name: getTeam(firstRoundTeamIds[0]!).sourceName, score: 2 },
      awayTeam: { name: getTeam(firstRoundTeamIds[1]!).sourceName, score: 1 }
    }),
    ...firstRoundMatches.slice(1),
    createMatch(20, firstRoundTeamIds[0]!, firstRoundTeamIds[2]!, {
      status: "finished",
      homeTeam: { name: getTeam(firstRoundTeamIds[0]!).sourceName, score: 0 },
      awayTeam: { name: getTeam(firstRoundTeamIds[2]!).sourceName, score: 1 }
    })
  ],
  rosterSnapshot
);
assert.equal(laterKnockoutLossSnapshot.teams.find((team) => team.teamId === firstRoundTeamIds[0])?.status, "eliminated");
assert.equal(laterKnockoutLossSnapshot.teams.find((team) => team.teamId === firstRoundTeamIds[0])?.reason, "knockout-loser");

const thirdPlaceRosterSnapshot: RosterSnapshot = {
  ...rosterSnapshot,
  teams: [
    { teamName: getTeam("france").sourceName, teamId: "france", players: [] },
    { teamName: getTeam("england").sourceName, teamId: "england", players: [] }
  ]
};
const thirdPlaceFixtureSnapshot = buildTeamTournamentStatusSnapshot(
  [
    ...firstRoundMatches,
    createMatch(40, "france", "spain", {
      kickedOffAt: "2026-07-14T19:00:00.000Z",
      status: "finished",
      homeTeam: { name: getTeam("france").sourceName, score: 0 },
      awayTeam: { name: getTeam("spain").sourceName, score: 2 }
    }),
    createMatch(41, "england", "argentina", {
      kickedOffAt: "2026-07-15T19:00:00.000Z",
      status: "finished",
      homeTeam: { name: getTeam("england").sourceName, score: 1 },
      awayTeam: { name: getTeam("argentina").sourceName, score: 2 }
    }),
    createMatch(42, "france", "england", {
      kickedOffAt: "2026-07-18T21:00:00.000Z",
      status: "scheduled"
    })
  ],
  thirdPlaceRosterSnapshot
);
assert.equal(thirdPlaceFixtureSnapshot.teams.find((team) => team.teamId === "france")?.status, "active");
assert.equal(thirdPlaceFixtureSnapshot.teams.find((team) => team.teamId === "france")?.reason, "knockout-fixture");
assert.equal(thirdPlaceFixtureSnapshot.teams.find((team) => team.teamId === "england")?.status, "active");
assert.equal(thirdPlaceFixtureSnapshot.teams.find((team) => team.teamId === "england")?.reason, "knockout-fixture");

console.log("Tournament status tests passed.");
