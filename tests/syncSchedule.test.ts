import assert from "node:assert/strict";
import type { StaticMeta } from "../src/domain/staticMeta";
import { evaluateSyncWindow } from "../src/sync/evaluateSyncWindow";
import { shouldFetchFixtureEventsForPhase, shouldFetchFixtureLineups, type ApiFootballFixture } from "../src/sync/sources/apiFootball/fixtures";
import { buildSyncWindowsForKickoff, getActiveSyncWindow, getLastScheduledWindow, getSettlementWindow, syncPolicy } from "../src/sync/syncSchedule";

const sampleKickoff = {
  id: "sample:brazil-morocco:2026-06-13T16:00:00.000Z",
  kickedOffAt: "2026-06-13T16:00:00.000Z",
  label: "Brazil vs Morocco"
};

const windows = buildSyncWindowsForKickoff(sampleKickoff);
assert.equal(windows.length, 5);

const expectedEndMs = new Date(sampleKickoff.kickedOffAt).getTime() + syncPolicy.expectedMatchMinutes * 60 * 1000;
const preMatchWindow = windows.find((window) => window.phase === "pre-match");
const liveWindow = windows.find((window) => window.phase === "live");
const postMatchWindows = windows.filter((window) => window.phase === "post-match");
assert.ok(preMatchWindow);
assert.ok(liveWindow);
assert.equal(new Date(preMatchWindow.from).getTime(), new Date(sampleKickoff.kickedOffAt).getTime() - syncPolicy.preMatchStartsMinutesBefore * 60 * 1000);
assert.equal(new Date(liveWindow.until).getTime(), new Date(sampleKickoff.kickedOffAt).getTime() + syncPolicy.liveWindowMinutesAfterKickoff * 60 * 1000);

const firstCheckStart = new Date(postMatchWindows[0]!.from).getTime();
assert.equal(firstCheckStart, expectedEndMs + syncPolicy.checkOffsetsAfterExpectedEndMinutes[0]! * 60 * 1000);

const baseMeta: StaticMeta = {
  lastUpdated: "2026-06-15T15:00:00.000Z",
  source: "wikipedia",
  fallbackUsed: false,
  status: "ok",
  snapshotFingerprint: "abc",
  snapshotChanged: false,
  syncWindowId: postMatchWindows[0]?.id,
  windowSyncAttempts: 1
};

assert.equal(
  evaluateSyncWindow(baseMeta, new Date(firstCheckStart + 5 * 60 * 1000), false, postMatchWindows[0] ?? null).shouldRun,
  false
);

const postMatchStillLiveMeta: StaticMeta = {
  ...baseMeta,
  lastUpdated: new Date(firstCheckStart).toISOString(),
  snapshotChanged: false,
  liveMatchCount: 1,
  windowSyncAttempts: 3
};

assert.equal(
  evaluateSyncWindow(postMatchStillLiveMeta, new Date(firstCheckStart + 4 * 60 * 1000), false, postMatchWindows[0] ?? null).shouldRun,
  false
);

assert.equal(
  evaluateSyncWindow(postMatchStillLiveMeta, new Date(firstCheckStart + 5 * 60 * 1000), false, postMatchWindows[0] ?? null).shouldRun,
  true
);

assert.equal(
  evaluateSyncWindow(baseMeta, new Date(firstCheckStart + 5 * 60 * 1000), false, null).shouldRun,
  false
);

assert.equal(
  evaluateSyncWindow(baseMeta, new Date(firstCheckStart + 5 * 60 * 1000), true).shouldRun,
  true
);

const liveMeta: StaticMeta = {
  ...baseMeta,
  lastUpdated: "2026-06-13T16:04:00.000Z",
  syncWindowId: liveWindow.id,
  snapshotChanged: false,
  windowSyncAttempts: 3
};
assert.equal(evaluateSyncWindow(liveMeta, new Date("2026-06-13T16:08:00.000Z"), false, liveWindow).shouldRun, false);
assert.equal(evaluateSyncWindow(liveMeta, new Date("2026-06-13T16:09:00.000Z"), false, liveWindow).shouldRun, true);
assert.equal(evaluateSyncWindow(null, new Date("2026-06-13T15:20:00.000Z"), false, preMatchWindow).windowPhase, "pre-match");

const overlappingLiveWindow = getActiveSyncWindow(new Date("2026-06-17T01:05:00.000Z"));
assert.ok(overlappingLiveWindow);
assert.equal(overlappingLiveWindow.phase, "live");
assert.equal(overlappingLiveWindow.id, "2026 fifa world cup group j:argentina-algeria:2026-06-17T01:00:00.000Z-live");

const settlementWindow = getSettlementWindow(new Date("2026-06-16T06:05:00.000Z"));
assert.ok(settlementWindow);
assert.equal(settlementWindow.phase, "settlement");
assert.equal(settlementWindow.id, "settlement:2026-06-16:06");
assert.equal(evaluateSyncWindow(null, new Date("2026-06-16T06:05:00.000Z"), false, settlementWindow).windowPhase, "settlement");

const lastScheduledWindow = getLastScheduledWindow();
assert.ok(lastScheduledWindow);
const knockoutWindowStart = new Date(Math.max(new Date(lastScheduledWindow.until).getTime() + 60 * 60 * 1000, new Date("2026-06-29T00:00:00.000Z").getTime()));
knockoutWindowStart.setUTCMinutes(5, 0, 0);
knockoutWindowStart.setUTCHours(18);
const knockoutWindow = getActiveSyncWindow(knockoutWindowStart);
assert.ok(knockoutWindow);
assert.equal(knockoutWindow.id.startsWith("knockout-maintenance:"), true);

const pickedLiveFixture: ApiFootballFixture = {
  fixture: {
    id: 1539016,
    date: "2026-06-16T22:00:00+00:00",
    status: { short: "1H" }
  },
  teams: {
    home: { id: 1567, name: "Iraq" },
    away: { id: 1090, name: "Norway" }
  }
};
const pickedFinishedFixture: ApiFootballFixture = {
  fixture: {
    id: 1539001,
    date: "2026-06-16T19:00:00+00:00",
    status: { short: "FT" }
  },
  teams: {
    home: { id: 2, name: "France" },
    away: { id: 13, name: "Senegal" }
  }
};
const notPickedPreMatchFixture: ApiFootballFixture = {
  fixture: {
    id: 1539999,
    date: "2026-06-17T13:00:00+00:00",
    status: { short: "NS" }
  },
  teams: {
    home: { id: 999, name: "Example A" },
    away: { id: 998, name: "Example B" }
  }
};
const overlappingPostMatchRun = new Date("2026-06-16T22:10:00.000Z");
assert.equal(shouldFetchFixtureEventsForPhase(pickedLiveFixture, "post-match", overlappingPostMatchRun), true);
assert.equal(shouldFetchFixtureLineups(pickedLiveFixture, "post-match", overlappingPostMatchRun), true);
assert.equal(shouldFetchFixtureEventsForPhase(pickedFinishedFixture, "live", overlappingPostMatchRun), true);
assert.equal(shouldFetchFixtureLineups(notPickedPreMatchFixture, "pre-match", new Date("2026-06-17T12:10:00.000Z")), false);

console.log("Sync schedule tests passed.");
