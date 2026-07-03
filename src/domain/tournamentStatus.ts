import { resolveKnownTeamId, teamCatalog } from "../config/teamCatalog";
import { getTeamDisplayName } from "./teamDisplay";
import type { MatchRecord } from "./matchTypes";
import type { RosterSnapshot } from "./rosterTypes";

export type TeamTournamentStatus = "active" | "eliminated" | "unknown";

export type TeamTournamentStatusReason =
  | "knockout-fixture"
  | "knockout-winner"
  | "knockout-loser"
  | "not-in-first-knockout-round"
  | "knockout-field-incomplete";

export type TeamTournamentStatusEntry = {
  teamId: string;
  teamName: string;
  status: TeamTournamentStatus;
  reason: TeamTournamentStatusReason;
};

export type TeamTournamentStatusSnapshot = {
  firstKnockoutRoundComplete: boolean;
  knockoutMatchCount: number;
  knockoutTeamCount: number;
  teams: TeamTournamentStatusEntry[];
};

type TournamentMatch = Pick<MatchRecord, "kickedOffAt" | "status" | "winnerTeam" | "homeTeam" | "awayTeam">;
type TeamTournamentState = Pick<TeamTournamentStatusEntry, "status" | "reason">;

const firstKnockoutRoundStartsAt = "2026-06-28T18:00:00.000Z";
const firstKnockoutRoundMatchCount = 16;
const firstKnockoutRoundTeamCount = 32;

function getKnownRosterTeamIds(rosterSnapshot?: RosterSnapshot): string[] {
  const rosterTeamIds = rosterSnapshot?.teams.flatMap((team) => (team.teamId ? [team.teamId] : [])) ?? [];
  return rosterTeamIds.length > 0 ? rosterTeamIds : teamCatalog.map((team) => team.teamId);
}

function getTeamId(teamName: string): string | null {
  return resolveKnownTeamId(teamName);
}

function isKnockoutMatch(match: TournamentMatch): boolean {
  return Boolean(match.kickedOffAt && new Date(match.kickedOffAt).getTime() >= new Date(firstKnockoutRoundStartsAt).getTime());
}

function getMatchTeamIds(match: TournamentMatch): { homeTeamId: string | null; awayTeamId: string | null } {
  return {
    homeTeamId: getTeamId(match.homeTeam.name),
    awayTeamId: getTeamId(match.awayTeam.name)
  };
}

function getFinishedWinnerAndLoser(match: TournamentMatch): { winnerTeamId: string; loserTeamId: string } | null {
  if (match.status !== "finished") {
    return null;
  }

  const { homeTeamId, awayTeamId } = getMatchTeamIds(match);
  if (!homeTeamId || !awayTeamId) {
    return null;
  }

  if (match.winnerTeam === "home") {
    return { winnerTeamId: homeTeamId, loserTeamId: awayTeamId };
  }

  if (match.winnerTeam === "away") {
    return { winnerTeamId: awayTeamId, loserTeamId: homeTeamId };
  }

  const homeScore = match.homeTeam.score;
  const awayScore = match.awayTeam.score;
  if (typeof homeScore !== "number" || typeof awayScore !== "number" || homeScore === awayScore) {
    return null;
  }

  return homeScore > awayScore
    ? { winnerTeamId: homeTeamId, loserTeamId: awayTeamId }
    : { winnerTeamId: awayTeamId, loserTeamId: homeTeamId };
}

function getUniqueFirstKnockoutRoundTeamIds(knockoutMatches: TournamentMatch[]): Set<string> {
  const teamIds = new Set<string>();

  for (const match of knockoutMatches) {
    const { homeTeamId, awayTeamId } = getMatchTeamIds(match);
    if (homeTeamId) {
      teamIds.add(homeTeamId);
    }
    if (awayTeamId) {
      teamIds.add(awayTeamId);
    }
  }

  return teamIds;
}

export function buildTeamTournamentStatusSnapshot(
  matches: TournamentMatch[] = [],
  rosterSnapshot?: RosterSnapshot
): TeamTournamentStatusSnapshot {
  const knockoutMatches = matches.filter(isKnockoutMatch).sort((left, right) => (left.kickedOffAt ?? "").localeCompare(right.kickedOffAt ?? ""));
  const firstKnockoutRoundTeamIds = getUniqueFirstKnockoutRoundTeamIds(knockoutMatches);
  const firstKnockoutRoundComplete =
    knockoutMatches.length >= firstKnockoutRoundMatchCount && firstKnockoutRoundTeamIds.size >= firstKnockoutRoundTeamCount;
  const statusByTeamId = new Map<string, TeamTournamentState>();

  const setActiveStatus = (teamId: string, reason: TeamTournamentStatusReason) => {
    if (statusByTeamId.get(teamId)?.status === "eliminated") {
      return;
    }

    statusByTeamId.set(teamId, { status: "active", reason });
  };

  for (const match of knockoutMatches) {
    const { homeTeamId, awayTeamId } = getMatchTeamIds(match);
    const result = getFinishedWinnerAndLoser(match);

    if (result) {
      statusByTeamId.set(result.winnerTeamId, { status: "active", reason: "knockout-winner" });
      statusByTeamId.set(result.loserTeamId, { status: "eliminated", reason: "knockout-loser" });
      continue;
    }

    if (homeTeamId) {
      setActiveStatus(homeTeamId, "knockout-fixture");
    }
    if (awayTeamId) {
      setActiveStatus(awayTeamId, "knockout-fixture");
    }
  }

  const rosterTeamIds = getKnownRosterTeamIds(rosterSnapshot);
  const entries = rosterTeamIds.map((teamId): TeamTournamentStatusEntry => {
    const status = statusByTeamId.get(teamId);
    if (status) {
      return {
        teamId,
        teamName: getTeamDisplayName(teamId),
        status: status.status,
        reason: status.reason
      };
    }

    return {
      teamId,
      teamName: getTeamDisplayName(teamId),
      status: firstKnockoutRoundComplete ? "eliminated" : "unknown",
      reason: firstKnockoutRoundComplete ? "not-in-first-knockout-round" : "knockout-field-incomplete"
    };
  });

  return {
    firstKnockoutRoundComplete,
    knockoutMatchCount: knockoutMatches.length,
    knockoutTeamCount: firstKnockoutRoundTeamIds.size,
    teams: entries.sort((left, right) => left.teamName.localeCompare(right.teamName, "de"))
  };
}
