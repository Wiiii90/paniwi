import assert from "node:assert/strict";
import { parseKickoffUtc } from "./parseKickoffTime";

const block = `{{#invoke:football box|main
|date={{Start date|2026|6|11}}
|time=1:00&nbsp;p.m. [[UTC−06:00|UTC−6]]
|team1={{#invoke:flag|fb-rt|MEX}}
|team2={{#invoke:flag|fb|RSA}}
}}`;

assert.equal(parseKickoffUtc(block), "2026-06-11T19:00:00.000Z");

console.log("Kickoff parse tests passed.");
