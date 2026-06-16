import assert from "node:assert/strict";
import type { PickStatusSnapshot } from "../src/domain/pickStatusTypes";
import type { ParticipantTeam } from "../src/domain/types";
import { buildPickStatusSnapshot } from "../src/sync/pickStatuses";
import { buildRosterSnapshot } from "../src/sync/syncRosters";
import { parseWikipediaSquads } from "../src/sync/sources/wikipediaRosterSource";

const sampleSquads = `
== Group A ==
=== Spain ===
{| class="wikitable"
|-
! No. !! Pos. !! Player
|-
| 10 || [[Forward (association football)|FW]] || [[Lamine Yamal]]
|-
| 16 || [[Midfielder|MF]] || {{sortname|Rodri|}}
|}

=== Sweden ===
{{nat fs player|no=2|pos=DF|name=[[Daniel Svensson]]}}
{{nat fs player|no=9|pos=FW|name=[[Alexander Isak]]}}
{{nat fs player|no=17|pos=DF|name=[[Ladislav Krejčí (footballer, born 1999)|Ladislav Krejčí]]}}

== Statistics ==
`;

const rosterTeams = parseWikipediaSquads(sampleSquads);
const sampleParticipantTeams: ParticipantTeam[] = [
  {
    owner: "Owner One",
    players: [{ playerName: "Lamine Yamal", teamId: "spain" }]
  },
  {
    owner: "Owner Two",
    players: [{ playerName: "Lucas Bergvall", teamId: "sweden" }]
  },
  {
    owner: "Owner Three",
    players: [{ playerName: "Thomas Meunier", teamId: "belgium", position: "goalkeeper" }]
  }
];

assert.equal(rosterTeams.length, 2);
assert.deepEqual(
  rosterTeams.map((team) => [team.teamName, team.teamId, team.players.length]),
  [
    ["Spain", "spain", 2],
    ["Sweden", "sweden", 3]
  ]
);
assert.deepEqual(
  rosterTeams[0].players.map((player) => [player.shirtNumber, player.position, player.playerName]),
  [
    [10, "forward", "Lamine Yamal"],
    [16, "midfielder", "Rodri"]
  ]
);
assert.deepEqual(
  rosterTeams[1].players.map((player) => [player.shirtNumber, player.position, player.playerName]),
  [
    [2, "defender", "Daniel Svensson"],
    [9, "forward", "Alexander Isak"],
    [17, "defender", "Ladislav Krejčí"]
  ]
);

const snapshot = buildRosterSnapshot("2026 FIFA World Cup squads", rosterTeams, new Date("2026-06-16T10:00:00.000Z"));
const pickStatuses = buildPickStatusSnapshot(snapshot, { participantTeams: sampleParticipantTeams });
const nominatedPick = pickStatuses.picks.find((entry) => entry.owner === "Owner One" && entry.pickId === "spain-lamine-yamal");
const missingPick = pickStatuses.picks.find((entry) => entry.owner === "Owner Two" && entry.pickId === "sweden-lucas-bergvall");
const unknownTeamPick = pickStatuses.picks.find((entry) => entry.owner === "Owner Three" && entry.pickId === "belgium-thomas-meunier");

assert.equal(nominatedPick?.displayStatus, "nominated");
assert.equal(nominatedPick?.matchedCurrentRosterName, "Lamine Yamal");
assert.equal(missingPick?.displayStatus, "not-nominated");
assert.equal(missingPick?.reason, "not-found-in-current-team-roster");
assert.equal(unknownTeamPick?.displayStatus, "unknown");
assert.equal(unknownTeamPick?.reason, "team-roster-missing");

assert.equal(snapshot.lastUpdated, "2026-06-16T10:00:00.000Z");
assert.equal(snapshot.source, "wikipedia");
assert.equal(snapshot.teamCount, 2);
assert.equal(snapshot.playerCount, 5);
assert.equal(snapshot.teams.length, 2);

const previousSnapshot: PickStatusSnapshot = {
  lastUpdated: "2026-06-15T12:00:00.000Z",
  rosterSnapshotUpdatedAt: "2026-06-15T10:00:00.000Z",
  picks: [
    {
      owner: "Owner Two",
      pickId: "sweden-lucas-bergvall",
      playerName: "Lucas Bergvall",
      teamId: "sweden",
      teamName: "Schweden",
      baselineRosterStatus: "not-nominated",
      currentRosterStatus: "not-nominated",
      displayStatus: "not-nominated",
      matchedCurrentRoster: false,
      reason: "not-found-in-current-team-roster"
    }
  ],
  summary: {
    nominatedCount: 0,
    notNominatedCount: 1,
    lateCallupCount: 0,
    unknownCount: 0
  }
};

const lateCallupSnapshot = buildPickStatusSnapshot(
  buildRosterSnapshot(
    "2026 FIFA World Cup squads",
    [
      ...rosterTeams.filter((team) => team.teamId !== "sweden"),
      {
        teamName: "Sweden",
        teamId: "sweden",
        players: [
          ...rosterTeams.find((team) => team.teamId === "sweden")!.players,
          {
            playerName: "Lucas Bergvall",
            normalizedPlayerName: "lucas bergvall",
            position: "midfielder",
            sourceName: "Lucas Bergvall"
          }
        ]
      }
    ],
    new Date("2026-06-17T10:00:00.000Z")
  ),
  {
    participantTeams: sampleParticipantTeams,
    previousSnapshot
  }
);
const lateCallupPick = lateCallupSnapshot.picks.find((entry) => entry.owner === "Owner Two" && entry.pickId === "sweden-lucas-bergvall");

assert.equal(lateCallupPick?.displayStatus, "late-callup");
assert.equal(lateCallupPick?.baselineRosterStatus, "not-nominated");
assert.equal(lateCallupPick?.currentRosterStatus, "nominated");
assert.equal(lateCallupPick?.reason, "late-callup");

console.log("Roster sync tests passed.");
