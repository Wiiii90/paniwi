import assert from "node:assert/strict";
import type { StaticMeta } from "../src/domain/types";
import { evaluateSyncWindow } from "../src/sync/evaluateSyncWindow";
import { buildSyncWindowsForKickoff, getActiveSyncWindow, getLastScheduledWindow, syncPolicy } from "../src/sync/syncSchedule";

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

const lastScheduledWindow = getLastScheduledWindow();
assert.ok(lastScheduledWindow);
const knockoutWindowStart = new Date(Math.max(new Date(lastScheduledWindow.until).getTime() + 60 * 60 * 1000, new Date("2026-06-29T00:00:00.000Z").getTime()));
knockoutWindowStart.setUTCMinutes(5, 0, 0);
knockoutWindowStart.setUTCHours(
  Math.ceil(knockoutWindowStart.getUTCHours() / syncPolicy.knockoutMaintenanceIntervalHours) *
    syncPolicy.knockoutMaintenanceIntervalHours
);
const knockoutWindow = getActiveSyncWindow(knockoutWindowStart);
assert.ok(knockoutWindow);
assert.equal(knockoutWindow.id.startsWith("knockout-maintenance:"), true);

console.log("Sync schedule tests passed.");
