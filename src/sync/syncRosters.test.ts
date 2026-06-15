import assert from "node:assert/strict";
import { buildRosterAudit, buildRosterSnapshot } from "./syncRosters";
import { parseWikipediaSquads } from "./sources/wikipediaRosterSource";

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

const audit = buildRosterAudit(rosterTeams);
const rafaelLamine = audit.find((entry) => entry.owner === "Rafael" && entry.playerId === "spain-lamine-yamal");
const anneEmil = audit.find((entry) => entry.owner === "Anne" && entry.playerId === "sweden-emil-holm");
const felixThomas = audit.find((entry) => entry.owner === "Felix" && entry.playerId === "belgium-thomas-meunier");

assert.equal(rafaelLamine?.suggestedRosterStatus, "nominated");
assert.equal(rafaelLamine?.matchedName, "Lamine Yamal");
assert.equal(anneEmil?.suggestedRosterStatus, "not-nominated");
assert.equal(anneEmil?.reason, "not-found-in-team-roster");
assert.equal(felixThomas?.suggestedRosterStatus, "unknown");
assert.equal(felixThomas?.reason, "team-roster-missing");

const snapshot = buildRosterSnapshot("2026 FIFA World Cup squads", rosterTeams, new Date("2026-06-16T10:00:00.000Z"));
assert.equal(snapshot.lastUpdated, "2026-06-16T10:00:00.000Z");
assert.equal(snapshot.source, "wikipedia");
assert.equal(snapshot.teamCount, 2);
assert.equal(snapshot.playerCount, 5);
assert.equal(snapshot.audit.picks.length > 0, true);

console.log("Roster sync tests passed.");
