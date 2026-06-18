import assert from "node:assert/strict";
import { resolveKnownTeamId } from "../../src/config/teamCatalog";

assert.equal(resolveKnownTeamId("Czechia"), "czech-republic");
assert.equal(resolveKnownTeamId("Bosnia-Herzegovina"), "bosnia-and-herzegovina");
assert.equal(resolveKnownTeamId("South"), null);
assert.equal(resolveKnownTeamId("Congo DR"), "dr-congo");

console.log("Team catalog tests passed.");
