import type { ExternalMatchRecord, MatchStatus } from "../../../domain/matchTypes";

export type FootballDataTeam = {
  id?: number;
  name?: string | null;
  shortName?: string | null;
  tla?: string | null;
};

type FootballDataScorePeriod = {
  home?: number | null;
  away?: number | null;
};

export type FootballDataMatch = {
  id?: number;
  utcDate?: string;
  status?: string;
  homeTeam?: FootballDataTeam;
  awayTeam?: FootballDataTeam;
  score?: {
    fullTime?: FootballDataScorePeriod | null;
    regularTime?: FootballDataScorePeriod | null;
    extraTime?: FootballDataScorePeriod | null;
    halfTime?: FootballDataScorePeriod | null;
  };
};

const liveStatuses = new Set(["IN_PLAY", "PAUSED", "EXTRA_TIME", "PENALTY_SHOOTOUT", "SUSPENDED"]);
const scheduledStatuses = new Set(["SCHEDULED", "TIMED"]);
const finishedStatuses = new Set(["FINISHED", "AWARDED"]);

function mapFootballDataStatus(status: string | undefined): MatchStatus {
  if (!status) {
    return "unknown";
  }

  if (finishedStatuses.has(status)) {
    return "finished";
  }

  if (liveStatuses.has(status)) {
    return "live";
  }

  if (scheduledStatuses.has(status)) {
    return "scheduled";
  }

  return "unknown";
}

function getTeamName(team: FootballDataTeam | undefined): string | null {
  return team?.name?.trim() || team?.shortName?.trim() || team?.tla?.trim() || null;
}

function getScoreValue(period: FootballDataScorePeriod | null | undefined, side: "home" | "away"): number | undefined {
  const value = period?.[side];
  return typeof value === "number" ? value : undefined;
}

function getCurrentScore(match: FootballDataMatch, side: "home" | "away"): number | undefined {
  const periods = [match.score?.fullTime, match.score?.regularTime, match.score?.extraTime, match.score?.halfTime];
  for (const period of periods) {
    const value = getScoreValue(period, side);
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function getMatchLabel(homeTeam: string, awayTeam: string, homeScore: number | undefined, awayScore: number | undefined): string {
  if (homeScore !== undefined && awayScore !== undefined) {
    return `${homeTeam} ${homeScore}-${awayScore} ${awayTeam}`;
  }

  return `${homeTeam} vs ${awayTeam}`;
}

export function parseFootballDataMatch(match: FootballDataMatch): ExternalMatchRecord | null {
  const matchId = typeof match.id === "number" ? String(match.id) : null;
  const homeTeam = getTeamName(match.homeTeam);
  const awayTeam = getTeamName(match.awayTeam);

  if (!matchId || !homeTeam || !awayTeam) {
    return null;
  }

  const homeScore = getCurrentScore(match, "home");
  const awayScore = getCurrentScore(match, "away");

  return {
    source: "football-data",
    matchId: `football-data:${matchId}`,
    fixtureId: matchId,
    label: getMatchLabel(homeTeam, awayTeam, homeScore, awayScore),
    kickedOffAt: match.utcDate,
    status: mapFootballDataStatus(match.status),
    homeTeam: {
      id: match.homeTeam?.id,
      name: homeTeam,
      score: homeScore
    },
    awayTeam: {
      id: match.awayTeam?.id,
      name: awayTeam,
      score: awayScore
    }
  };
}

export function parseFootballDataMatches(matches: FootballDataMatch[]): ExternalMatchRecord[] {
  return matches.flatMap((match) => parseFootballDataMatch(match) ?? []);
}
