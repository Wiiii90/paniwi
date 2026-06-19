import { appendFileSync, readFileSync } from "node:fs";

const policy = {
  tournamentStart: "2026-06-11",
  tournamentEnd: "2026-07-19",
  expectedMatchMinutes: 105,
  preMatchStartsMinutesBefore: 60,
  preMatchEndsMinutesBefore: 5,
  liveWindowMinutesAfterKickoff: 120,
  checkOffsetsAfterExpectedEndMinutes: [15, 60, 120],
  windowDurationMinutes: 30,
  knockoutMaintenanceIntervalHours: 6,
  knockoutMaintenanceWindowDurationMinutes: 30
};

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function isTournamentDay(now) {
  const dateKey = now.toISOString().slice(0, 10);
  return dateKey >= policy.tournamentStart && dateKey <= policy.tournamentEnd;
}

function buildWindows(kickoff) {
  const kickoffMs = Date.parse(kickoff.kickedOffAt);
  if (Number.isNaN(kickoffMs)) {
    return [];
  }

  const expectedEndMs = kickoffMs + policy.expectedMatchMinutes * 60 * 1000;
  return [
    {
      id: `${kickoff.id}-pre-match`,
      phase: "pre-match",
      from: new Date(kickoffMs - policy.preMatchStartsMinutesBefore * 60 * 1000),
      until: new Date(kickoffMs - policy.preMatchEndsMinutesBefore * 60 * 1000),
      label: `${kickoff.label} (Aufstellung vor Anpfiff)`
    },
    {
      id: `${kickoff.id}-live`,
      phase: "live",
      from: new Date(kickoffMs),
      until: new Date(kickoffMs + policy.liveWindowMinutesAfterKickoff * 60 * 1000),
      label: `${kickoff.label} (Live-Fenster)`
    },
    ...policy.checkOffsetsAfterExpectedEndMinutes.map((offsetMinutes, index) => {
      const from = new Date(expectedEndMs + offsetMinutes * 60 * 1000);
      return {
        id: `${kickoff.id}-check-${index + 1}`,
        phase: "post-match",
        from,
        until: new Date(from.getTime() + policy.windowDurationMinutes * 60 * 1000),
        label: `${kickoff.label} (+${offsetMinutes}m nach erwartetem Abpfiff)`
      };
    })
  ];
}

function getMaintenanceWindow(now, windows) {
  if (!isTournamentDay(now)) {
    return null;
  }

  const lastWindow = [...windows].sort((left, right) => right.until.getTime() - left.until.getTime())[0];
  if (lastWindow && now.getTime() <= lastWindow.until.getTime()) {
    return null;
  }

  const start = new Date(now);
  start.setUTCMinutes(0, 0, 0);
  start.setUTCHours(Math.floor(start.getUTCHours() / policy.knockoutMaintenanceIntervalHours) * policy.knockoutMaintenanceIntervalHours);
  const until = new Date(start.getTime() + policy.knockoutMaintenanceWindowDurationMinutes * 60 * 1000);
  if (now.getTime() > until.getTime()) {
    return null;
  }

  return {
    id: `knockout-maintenance:${start.toISOString().slice(0, 10)}:${String(start.getUTCHours()).padStart(2, "0")}`,
    phase: "maintenance",
    from: start,
    until,
    label: `KO-Runden Sync ${start.toISOString()}`
  };
}

function getActiveWindow(now) {
  const kickoffs = readJson("src/config/matchKickoffs.json", []);
  const windows = kickoffs.flatMap(buildWindows);
  const active = windows.find((window) => now.getTime() >= window.from.getTime() && now.getTime() <= window.until.getTime());
  return active ?? getMaintenanceWindow(now, windows);
}

function setOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) {
    return;
  }

  appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`, "utf8");
}

const force = process.env.SYNC_FORCE === "true";
const now = new Date();
const activeWindow = getActiveWindow(now);
const requiresManualForce = process.env.SYNC_SOURCE === "api-football-enrich" || process.env.SYNC_SOURCE === "api-football";
const shouldRun = requiresManualForce ? force : force || Boolean(activeWindow);
const reason =
  requiresManualForce && !force
    ? "api-football enrichment requires forced manual dispatch"
    : force
      ? "forced sync"
      : activeWindow
        ? activeWindow.label
        : "outside active sync window";

console.log(shouldRun ? `Sync gate open: ${reason}` : `Sync gate closed: ${reason}`);
setOutput("should_run", String(shouldRun));
setOutput("sync_reason", reason);
setOutput("sync_window_id", force ? "" : (activeWindow?.id ?? ""));
setOutput("sync_window_phase", force ? "forced" : (activeWindow?.phase ?? ""));
