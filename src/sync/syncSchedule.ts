import kickoffs from "../config/matchKickoffs.json";

export type SyncWindow = {
  id: string;
  from: string;
  until: string;
  label: string;
};

export type MatchKickoff = {
  id: string;
  kickedOffAt: string;
  label: string;
  finished?: boolean;
};

export const syncPolicy = {
  tournamentStart: "2026-06-11",
  tournamentEnd: "2026-07-19",
  /** Regular time plus half-time break. */
  expectedMatchMinutes: 105,
  /** Sync checks after the expected full-time whistle. */
  checkOffsetsAfterExpectedEndMinutes: [15, 60, 120],
  /** Width of each check window. Cron runs every 15 minutes. */
  windowDurationMinutes: 30,
  /** One Wikipedia fetch per check window if the snapshot stays unchanged. */
  maxSyncAttemptsPerWindow: 1,
  minMinutesBetweenSyncs: 45,
  unchangedFollowUpMinutes: 45,
  knockoutMaintenanceIntervalHours: 6,
  knockoutMaintenanceWindowDurationMinutes: 30
} as const;

export const scheduledKickoffs = kickoffs as MatchKickoff[];

export function buildSyncWindowsForKickoff(kickoff: MatchKickoff): SyncWindow[] {
  const kickoffMs = new Date(kickoff.kickedOffAt).getTime();
  const expectedEndMs = kickoffMs + syncPolicy.expectedMatchMinutes * 60 * 1000;

  return syncPolicy.checkOffsetsAfterExpectedEndMinutes.map((offsetMinutes, index) => {
    const from = new Date(expectedEndMs + offsetMinutes * 60 * 1000);
    const until = new Date(from.getTime() + syncPolicy.windowDurationMinutes * 60 * 1000);

    return {
      id: `${kickoff.id}-check-${index + 1}`,
      from: from.toISOString(),
      until: until.toISOString(),
      label: `${kickoff.label} (+${offsetMinutes}m after expected FT)`
    };
  });
}

export function getAllSyncWindows(): SyncWindow[] {
  return scheduledKickoffs.flatMap(buildSyncWindowsForKickoff);
}

export function getActiveSyncWindow(now: Date = new Date()): SyncWindow | null {
  const timestamp = now.getTime();

  for (const window of getAllSyncWindows()) {
    const from = new Date(window.from).getTime();
    const until = new Date(window.until).getTime();

    if (timestamp >= from && timestamp <= until) {
      return window;
    }
  }

  return getKnockoutMaintenanceWindow(now);
}

export function isTournamentDay(now: Date = new Date()): boolean {
  const dateKey = now.toISOString().slice(0, 10);
  return dateKey >= syncPolicy.tournamentStart && dateKey <= syncPolicy.tournamentEnd;
}

export function getLastScheduledWindow(): SyncWindow | null {
  return (
    getAllSyncWindows()
      .sort((left, right) => right.until.localeCompare(left.until))
      .at(0) ?? null
  );
}

export function getKnockoutMaintenanceWindow(now: Date = new Date()): SyncWindow | null {
  if (!isTournamentDay(now)) {
    return null;
  }

  const lastScheduledWindow = getLastScheduledWindow();
  if (lastScheduledWindow && now.getTime() <= new Date(lastScheduledWindow.until).getTime()) {
    return null;
  }

  const interval = syncPolicy.knockoutMaintenanceIntervalHours;
  const windowStart = new Date(now);
  windowStart.setUTCMinutes(0, 0, 0);
  windowStart.setUTCHours(Math.floor(windowStart.getUTCHours() / interval) * interval);
  const windowEnd = new Date(windowStart.getTime() + syncPolicy.knockoutMaintenanceWindowDurationMinutes * 60 * 1000);

  if (now.getTime() > windowEnd.getTime()) {
    return null;
  }

  const dateKey = windowStart.toISOString().slice(0, 10);
  const hour = String(windowStart.getUTCHours()).padStart(2, "0");

  return {
    id: `knockout-maintenance:${dateKey}:${hour}`,
    from: windowStart.toISOString(),
    until: windowEnd.toISOString(),
    label: `KO-Runden Sync ${dateKey} ${hour}:00 UTC`
  };
}

export function getUpcomingSyncWindows(now: Date = new Date(), limit = 5): SyncWindow[] {
  const timestamp = now.getTime();

  return getAllSyncWindows()
    .filter((window) => new Date(window.until).getTime() >= timestamp)
    .sort((left, right) => left.from.localeCompare(right.from))
    .slice(0, limit);
}
