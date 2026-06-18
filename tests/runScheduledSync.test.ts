import assert from "node:assert/strict";
import type { ExternalMatchRecord } from "../src/domain/matchTypes";
import { getNewlyFinishedFootballDataMatches } from "../src/sync/runScheduledSync";

const before: ExternalMatchRecord[] = [
  {
    source: "football-data",
    matchId: "football-data:already-finished",
    fixtureId: "already-finished",
    label: "Already 1-0 Done",
    kickedOffAt: "2026-06-18T16:00:00Z",
    status: "finished",
    homeTeam: { name: "Already", score: 1 },
    awayTeam: { name: "Done", score: 0 }
  },
  {
    source: "football-data",
    matchId: "football-data:new-finished",
    fixtureId: "new-finished",
    label: "Fresh 2-1 Done",
    kickedOffAt: "2026-06-18T19:00:00Z",
    status: "live",
    homeTeam: { name: "Fresh", score: 2 },
    awayTeam: { name: "Done", score: 1 }
  },
  {
    source: "football-data",
    matchId: "football-data:newer-finished",
    fixtureId: "newer-finished",
    label: "Newer 3-2 Done",
    kickedOffAt: "2026-06-18T21:00:00Z",
    status: "live",
    homeTeam: { name: "Newer", score: 3 },
    awayTeam: { name: "Done", score: 2 }
  },
  {
    source: "api-football",
    matchId: "api-football:ignored",
    fixtureId: "ignored",
    label: "Ignored 1-0 Done",
    kickedOffAt: "2026-06-18T20:00:00Z",
    status: "live",
    homeTeam: { name: "Ignored", score: 1 },
    awayTeam: { name: "Done", score: 0 }
  }
];

const after: ExternalMatchRecord[] = [
  { ...before[0]!, status: "finished" },
  { ...before[1]!, status: "finished" },
  { ...before[2]!, status: "finished" },
  { ...before[3]!, status: "finished" },
  {
    source: "football-data",
    matchId: "football-data:still-live",
    fixtureId: "still-live",
    label: "Still 0-0 Live",
    kickedOffAt: "2026-06-18T22:00:00Z",
    status: "live",
    homeTeam: { name: "Still", score: 0 },
    awayTeam: { name: "Live", score: 0 }
  }
];

assert.deepEqual(
  getNewlyFinishedFootballDataMatches(before, after).map((match) => match.matchId),
  ["football-data:newer-finished", "football-data:new-finished"]
);

console.log("Scheduled sync auto-enrich tests passed.");
