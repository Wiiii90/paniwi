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
  unchangedFollowUpMinutes: 45
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

  return null;
}

export function isTournamentDay(now: Date = new Date()): boolean {
  const dateKey = now.toISOString().slice(0, 10);
  return dateKey >= syncPolicy.tournamentStart && dateKey <= syncPolicy.tournamentEnd;
}

export function getUpcomingSyncWindows(now: Date = new Date(), limit = 5): SyncWindow[] {
  const timestamp = now.getTime();

  return getAllSyncWindows()
    .filter((window) => new Date(window.until).getTime() >= timestamp)
    .sort((left, right) => left.from.localeCompare(right.from))
    .slice(0, limit);
}
