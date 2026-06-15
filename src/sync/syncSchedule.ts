export type SyncWindow = {
  id: string;
  from: string;
  until: string;
  label: string;
};

export const syncPolicy = {
  tournamentStart: "2026-06-11",
  tournamentEnd: "2026-07-19",
  /** Earliest sync after a window opens (Wikipedia needs time to update). */
  windowWarmupMinutes: 45,
  /** Minimum gap between two successful syncs in the same window. */
  minMinutesBetweenSyncs: 120,
  /** Maximum sync attempts per window when the snapshot stays unchanged. */
  maxSyncAttemptsPerWindow: 2,
  /** Minimum wait before an unchanged follow-up. */
  unchangedFollowUpMinutes: 90
} as const;

/**
 * Calendar days with scheduled FIFA World Cup 2026 matches.
 * Source: FIFA match schedule (group stage + knockout). Used only to gate sync frequency.
 */
export const matchDaysUtc = [
  "2026-06-11",
  "2026-06-12",
  "2026-06-13",
  "2026-06-14",
  "2026-06-15",
  "2026-06-16",
  "2026-06-17",
  "2026-06-18",
  "2026-06-19",
  "2026-06-20",
  "2026-06-21",
  "2026-06-22",
  "2026-06-23",
  "2026-06-24",
  "2026-06-25",
  "2026-06-26",
  "2026-06-27",
  "2026-06-28",
  "2026-06-29",
  "2026-06-30",
  "2026-07-01",
  "2026-07-02",
  "2026-07-03",
  "2026-07-04",
  "2026-07-05",
  "2026-07-06",
  "2026-07-07",
  "2026-07-08",
  "2026-07-09",
  "2026-07-10",
  "2026-07-11",
  "2026-07-12",
  "2026-07-13",
  "2026-07-14",
  "2026-07-15",
  "2026-07-16",
  "2026-07-17",
  "2026-07-18",
  "2026-07-19"
] as const;

/** UTC sync slots on match days: after late US games and after evening sessions. */
export const dailySyncSlotsUtc = [
  { hour: 5, minute: 30, label: "morning catch-up" },
  { hour: 22, minute: 30, label: "evening catch-up" }
] as const;

function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildWindowId(dateKey: string, slotIndex: number): string {
  return `${dateKey}-slot-${slotIndex + 1}`;
}

export function buildSyncWindowsForDate(dateKey: string): SyncWindow[] {
  if (!matchDaysUtc.includes(dateKey as (typeof matchDaysUtc)[number])) {
    return [];
  }

  return dailySyncSlotsUtc.map((slot, index) => {
    const start = new Date(`${dateKey}T${String(slot.hour).padStart(2, "0")}:${String(slot.minute).padStart(2, "0")}:00.000Z`);
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

    return {
      id: buildWindowId(dateKey, index),
      from: start.toISOString(),
      until: end.toISOString(),
      label: `${dateKey} ${slot.label}`
    };
  });
}

export function getActiveSyncWindow(now: Date = new Date()): SyncWindow | null {
  const dateKey = utcDateKey(now);
  const windows = buildSyncWindowsForDate(dateKey);
  const timestamp = now.getTime();

  for (const window of windows) {
    const from = new Date(window.from).getTime() + syncPolicy.windowWarmupMinutes * 60 * 1000;
    const until = new Date(window.until).getTime();

    if (timestamp >= from && timestamp <= until) {
      return window;
    }
  }

  return null;
}

export function isTournamentDay(now: Date = new Date()): boolean {
  const dateKey = utcDateKey(now);
  return dateKey >= syncPolicy.tournamentStart && dateKey <= syncPolicy.tournamentEnd;
}
