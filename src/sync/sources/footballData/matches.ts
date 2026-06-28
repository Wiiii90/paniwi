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
    winner?: string | null;
    fullTime?: FootballDataScorePeriod | null;
    regularTime?: FootballDataScorePeriod | null;
    extraTime?: FootballDataScorePeriod | null;
    halfTime?: FootballDataScorePeriod | null;
  };
};

const liveStatuses = new Set(["IN_PLAY", "LIVE", "PAUSED", "EXTRA_TIME", "PENALTY_SHOOTOUT", "SUSPENDED"]);
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

function getCurrentScore(match: FootballDataMatch, side: "home" | "away", status: MatchStatus): number | undefined {
  const periods = [match.score?.fullTime, match.score?.regularTime, match.score?.extraTime, match.score?.halfTime];
  for (const period of periods) {
    const value = getScoreValue(period, side);
    if (value !== undefined) {
      return value;
    }
  }

  if (status === "live" && match.score) {
    return 0;
  }

  return undefined;
}

function getMatchLabel(homeTeam: string, awayTeam: string, homeScore: number | undefined, awayScore: number | undefined): string {
  if (homeScore !== undefined && awayScore !== undefined) {
    return `${homeTeam} ${homeScore}-${awayScore} ${awayTeam}`;
  }

  return `${homeTeam} vs ${awayTeam}`;
}

function mapFootballDataWinner(winner: string | null | undefined): ExternalMatchRecord["winnerTeam"] | undefined {
  if (winner === "HOME_TEAM") {
    return "home";
  }

  if (winner === "AWAY_TEAM") {
    return "away";
  }

  if (winner === "DRAW") {
    return "draw";
  }

  return undefined;
}

export function parseFootballDataMatch(match: FootballDataMatch): ExternalMatchRecord | null {
  const matchId = typeof match.id === "number" ? String(match.id) : null;
  const homeTeam = getTeamName(match.homeTeam);
  const awayTeam = getTeamName(match.awayTeam);

  if (!matchId || !homeTeam || !awayTeam) {
    return null;
  }

  const status = mapFootballDataStatus(match.status);
  const homeScore = getCurrentScore(match, "home", status);
  const awayScore = getCurrentScore(match, "away", status);
  const winnerTeam = mapFootballDataWinner(match.score?.winner);

  return {
    source: "football-data",
    matchId: `football-data:${matchId}`,
    fixtureId: matchId,
    label: getMatchLabel(homeTeam, awayTeam, homeScore, awayScore),
    kickedOffAt: match.utcDate,
    status,
    ...(winnerTeam ? { winnerTeam } : {}),
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
