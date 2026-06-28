import { readFileSync } from "node:fs";
import kickoffs from "../config/matchKickoffs.json";

export type SyncWindow = {
  id: string;
  from: string;
  until: string;
  label: string;
  phase: "pre-match" | "live" | "post-match" | "maintenance";
};

export type MatchKickoff = {
  id: string;
  kickedOffAt: string;
  label: string;
  finished?: boolean;
};

export type RawMatch = {
  source?: string;
  matchId?: string;
  fixtureId?: string;
  label?: string;
  kickedOffAt?: string;
  status?: string;
  homeTeam?: { name?: string };
  awayTeam?: { name?: string };
};

export const syncPolicy = {
  tournamentStart: "2026-06-11",
  tournamentEnd: "2026-07-19",
  /** Regular time plus half-time break. */
  expectedMatchMinutes: 105,
  /** Lineup window before kick-off. */
  preMatchStartsMinutesBefore: 60,
  preMatchEndsMinutesBefore: 5,
  /** Live polling window after kick-off. */
  liveWindowMinutesAfterKickoff: 120,
  /** Sync checks after the expected full-time whistle. */
  checkOffsetsAfterExpectedEndMinutes: [15, 60, 120],
  /** Width of each post-match check window. Cron may run every 5 minutes. */
  windowDurationMinutes: 30,
  /** One Wikipedia fetch per check window if the snapshot stays unchanged. */
  maxSyncAttemptsPerWindow: 1,
  preMatchMinMinutesBetweenSyncs: 15,
  liveMinMinutesBetweenSyncs: 5,
  postMatchMinMinutesBetweenSyncs: 45,
  unchangedFollowUpMinutes: 45,
  knockoutMaintenanceIntervalHours: 6,
  knockoutMaintenanceWindowDurationMinutes: 30
} as const;

export const scheduledKickoffs = kickoffs as MatchKickoff[];

function readRawMatches(path = "public/data/raw-matches.json"): RawMatch[] {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as RawMatch[];
  } catch {
    return [];
  }
}

function getLatestStaticKickoffTimestamp(): number {
  return scheduledKickoffs.reduce((latest, kickoff) => Math.max(latest, Date.parse(kickoff.kickedOffAt)), 0);
}

function rawMatchToKickoff(match: RawMatch, latestStaticKickoffTimestamp: number): MatchKickoff | null {
  if (match.source !== "football-data" || !match.kickedOffAt) {
    return null;
  }

  const kickoffTimestamp = Date.parse(match.kickedOffAt);
  if (!Number.isFinite(kickoffTimestamp) || kickoffTimestamp <= latestStaticKickoffTimestamp) {
    return null;
  }

  const id = match.matchId ?? (match.fixtureId ? `football-data:${match.fixtureId}` : null);
  if (!id) {
    return null;
  }

  return {
    id,
    kickedOffAt: match.kickedOffAt,
    label: match.label ?? `${match.homeTeam?.name ?? "Team A"} vs ${match.awayTeam?.name ?? "Team B"}`,
    finished: match.status === "finished"
  };
}

export function getKnownKickoffs(rawMatches: RawMatch[] = readRawMatches()): MatchKickoff[] {
  const latestStaticKickoffTimestamp = getLatestStaticKickoffTimestamp();
  const kickoffsById = new Map(scheduledKickoffs.map((kickoff) => [kickoff.id, kickoff] as const));

  for (const kickoff of rawMatches.flatMap((match) => rawMatchToKickoff(match, latestStaticKickoffTimestamp) ?? [])) {
    kickoffsById.set(kickoff.id, kickoff);
  }

  return [...kickoffsById.values()].sort((left, right) => left.kickedOffAt.localeCompare(right.kickedOffAt) || left.id.localeCompare(right.id));
}

export function buildSyncWindowsForKickoff(kickoff: MatchKickoff): SyncWindow[] {
  const kickoffMs = new Date(kickoff.kickedOffAt).getTime();
  const expectedEndMs = kickoffMs + syncPolicy.expectedMatchMinutes * 60 * 1000;
  const preMatchFrom = new Date(kickoffMs - syncPolicy.preMatchStartsMinutesBefore * 60 * 1000);
  const preMatchUntil = new Date(kickoffMs - syncPolicy.preMatchEndsMinutesBefore * 60 * 1000);
  const liveUntil = new Date(kickoffMs + syncPolicy.liveWindowMinutesAfterKickoff * 60 * 1000);

  const postMatchWindows = syncPolicy.checkOffsetsAfterExpectedEndMinutes.map((offsetMinutes, index) => {
    const from = new Date(expectedEndMs + offsetMinutes * 60 * 1000);
    const until = new Date(from.getTime() + syncPolicy.windowDurationMinutes * 60 * 1000);

    return {
      id: `${kickoff.id}-check-${index + 1}`,
      from: from.toISOString(),
      until: until.toISOString(),
      label: `${kickoff.label} (+${offsetMinutes}m nach erwartetem Abpfiff)`,
      phase: "post-match" as const
    };
  });

  return [
    {
      id: `${kickoff.id}-pre-match`,
      from: preMatchFrom.toISOString(),
      until: preMatchUntil.toISOString(),
      label: `${kickoff.label} (Aufstellung vor Anpfiff)`,
      phase: "pre-match"
    },
    {
      id: `${kickoff.id}-live`,
      from: new Date(kickoffMs).toISOString(),
      until: liveUntil.toISOString(),
      label: `${kickoff.label} (Live-Fenster)`,
      phase: "live"
    },
    ...postMatchWindows
  ];
}

export function getAllSyncWindows(rawMatches?: RawMatch[]): SyncWindow[] {
  return getKnownKickoffs(rawMatches).flatMap(buildSyncWindowsForKickoff);
}

const activeWindowPhasePriority: Record<SyncWindow["phase"], number> = {
  live: 0,
  "pre-match": 1,
  "post-match": 2,
  maintenance: 3
};

export function getActiveSyncWindow(now: Date = new Date(), rawMatches?: RawMatch[]): SyncWindow | null {
  const timestamp = now.getTime();
  const activeWindows = getAllSyncWindows(rawMatches).filter((window) => {
    const from = new Date(window.from).getTime();
    const until = new Date(window.until).getTime();

    return timestamp >= from && timestamp <= until;
  });

  if (activeWindows.length > 0) {
    return activeWindows.sort(
      (left, right) =>
        activeWindowPhasePriority[left.phase] - activeWindowPhasePriority[right.phase] ||
        left.from.localeCompare(right.from)
    )[0]!;
  }

  return getKnockoutMaintenanceWindow(now);
}

export function isTournamentDay(now: Date = new Date()): boolean {
  const dateKey = now.toISOString().slice(0, 10);
  return dateKey >= syncPolicy.tournamentStart && dateKey <= syncPolicy.tournamentEnd;
}

export function getLastScheduledWindow(rawMatches?: RawMatch[]): SyncWindow | null {
  return (
    getAllSyncWindows(rawMatches)
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
    label: `KO-Runden Sync ${dateKey} ${hour}:00 UTC`,
    phase: "maintenance"
  };
}

export function getUpcomingSyncWindows(now: Date = new Date(), limit = 5): SyncWindow[] {
  const timestamp = now.getTime();

  return getAllSyncWindows()
    .filter((window) => new Date(window.until).getTime() >= timestamp)
    .sort((left, right) => left.from.localeCompare(right.from))
    .slice(0, limit);
}
