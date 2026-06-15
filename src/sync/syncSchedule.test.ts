import assert from "node:assert/strict";
import type { StaticMeta } from "../domain/types";
import { evaluateSyncWindow } from "./evaluateSyncWindow";
import { buildSyncWindowsForDate, getActiveSyncWindow } from "./syncSchedule";

const baseMeta: StaticMeta = {
  lastUpdated: "2026-06-15T15:00:00.000Z",
  source: "wikipedia",
  fallbackUsed: false,
  status: "ok",
  snapshotFingerprint: "abc",
  snapshotChanged: false,
  syncWindowId: "2026-06-15-slot-2",
  windowSyncAttempts: 1
};

assert.equal(buildSyncWindowsForDate("2026-06-15").length, 2);
assert.equal(buildSyncWindowsForDate("2026-06-01").length, 0);

const activeWindow = getActiveSyncWindow(new Date("2026-06-15T23:15:00.000Z"));
assert.equal(activeWindow?.id, "2026-06-15-slot-2");

assert.equal(
  evaluateSyncWindow(baseMeta, new Date("2026-06-15T23:15:00.000Z")).shouldRun,
  true
);

assert.equal(
  evaluateSyncWindow(
    { ...baseMeta, windowSyncAttempts: 2, snapshotChanged: false },
    new Date("2026-06-15T23:15:00.000Z")
  ).shouldRun,
  false
);

assert.equal(
  evaluateSyncWindow(baseMeta, new Date("2026-06-15T12:00:00.000Z")).shouldRun,
  false
);

assert.equal(
  evaluateSyncWindow(baseMeta, new Date("2026-06-15T23:15:00.000Z"), true).shouldRun,
  true
);

console.log("Sync schedule tests passed.");
