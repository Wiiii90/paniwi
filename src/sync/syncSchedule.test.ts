import assert from "node:assert/strict";
import type { StaticMeta } from "../domain/types";
import { evaluateSyncWindow } from "./evaluateSyncWindow";
import { buildSyncWindowsForKickoff, syncPolicy } from "./syncSchedule";

const sampleKickoff = {
  id: "sample:brazil-morocco:2026-06-13T16:00:00.000Z",
  kickedOffAt: "2026-06-13T16:00:00.000Z",
  label: "Brazil vs Morocco"
};

const windows = buildSyncWindowsForKickoff(sampleKickoff);
assert.equal(windows.length, 3);

const expectedEndMs = new Date(sampleKickoff.kickedOffAt).getTime() + syncPolicy.expectedMatchMinutes * 60 * 1000;
const firstCheckStart = new Date(windows[0]!.from).getTime();
assert.equal(firstCheckStart, expectedEndMs + syncPolicy.checkOffsetsAfterExpectedEndMinutes[0]! * 60 * 1000);

const baseMeta: StaticMeta = {
  lastUpdated: "2026-06-15T15:00:00.000Z",
  source: "wikipedia",
  fallbackUsed: false,
  status: "ok",
  snapshotFingerprint: "abc",
  snapshotChanged: false,
  syncWindowId: windows[0]?.id,
  windowSyncAttempts: 1
};

assert.equal(
  evaluateSyncWindow(baseMeta, new Date(firstCheckStart + 5 * 60 * 1000), false, windows[0] ?? null).shouldRun,
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

console.log("Sync schedule tests passed.");
