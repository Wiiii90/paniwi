import type { MatchRecord } from "../domain/types";

export function formatKickoff(value: string | undefined, options: Intl.DateTimeFormatOptions): string {
  if (!value) {
    return "Termin offen";
  }

  return new Intl.DateTimeFormat("de-DE", options).format(new Date(value));
}

export function formatMatchScore(match: MatchRecord | undefined, scheduledLabel = "-:-"): string {
  if (!match || match.homeTeam.score === undefined || match.awayTeam.score === undefined) {
    return match?.status === "scheduled" ? scheduledLabel : "-:-";
  }

  return `${match.homeTeam.score}:${match.awayTeam.score}`;
}
