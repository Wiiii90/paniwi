import type { MatchRecord } from "./types";

function getLocalDateKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function hasMatchResult(match: MatchRecord): boolean {
  return match.homeTeam.score !== undefined && match.awayTeam.score !== undefined;
}

export function isFinishedResultMatch(match: MatchRecord): boolean {
  return match.status === "finished" && hasMatchResult(match);
}

export function getLatestFinishedMatches(matches: MatchRecord[], limit = 3): MatchRecord[] {
  return [...matches]
    .filter(isFinishedResultMatch)
    .sort((a, b) => {
      const aTime = a.kickedOffAt ? new Date(a.kickedOffAt).getTime() : 0;
      const bTime = b.kickedOffAt ? new Date(b.kickedOffAt).getTime() : 0;
      return bTime - aTime || a.label.localeCompare(b.label);
    })
    .slice(0, limit);
}

export function getTodayOrLiveMatches(matches: MatchRecord[], now = new Date(), limit = 4): MatchRecord[] {
  const todayKey = getLocalDateKey(now);

  return [...matches]
    .filter((match) => {
      const kickedOffAt = match.kickedOffAt ? new Date(match.kickedOffAt) : null;
      const isToday = kickedOffAt ? getLocalDateKey(kickedOffAt) === todayKey : false;
      return match.status === "live" || (isToday && match.status !== "finished");
    })
    .sort((a, b) => (a.kickedOffAt ?? "").localeCompare(b.kickedOffAt ?? ""))
    .slice(0, limit);
}
