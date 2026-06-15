import { canonicalPlayers, canonicalTeams } from "../config/canonical";
import { normalizePlayerName } from "../domain/normalizePlayerName";
import type { CanonicalPlayer, CanonicalTeam } from "../domain/types";

export type CanonicalValidationIssue = {
  subject?: string;
  reason: string;
};

export type CanonicalValidationResult = {
  valid: boolean;
  issues: CanonicalValidationIssue[];
};

function pushDuplicateIssue(
  seen: Map<string | number, string>,
  key: string | number,
  subject: string,
  reason: string,
  issues: CanonicalValidationIssue[]
): void {
  const existing = seen.get(key);
  if (existing) {
    if (existing === subject) {
      return;
    }

    issues.push({ subject: `${existing}, ${subject}`, reason });
    return;
  }

  seen.set(key, subject);
}

function validateTeams(teams: CanonicalTeam[], issues: CanonicalValidationIssue[]): Set<string> {
  const teamIds = new Set<string>();
  const teamNameKeys = new Map<string, string>();
  const apiFootballTeamIds = new Map<number, string>();

  for (const team of teams) {
    const subject = team.teamId || team.displayName || "unknown-team";
    if (!team.teamId.trim()) {
      issues.push({ subject, reason: "missing-team-id" });
      continue;
    }

    if (!team.displayName.trim()) {
      issues.push({ subject, reason: "missing-team-display-name" });
    }

    if (teamIds.has(team.teamId)) {
      issues.push({ subject: team.teamId, reason: "duplicate-team-id" });
    }
    teamIds.add(team.teamId);

    for (const name of [team.displayName, ...(team.aliases ?? [])]) {
      const key = normalizePlayerName(name);
      if (!key) {
        issues.push({ subject, reason: "empty-team-name-key" });
        continue;
      }
      pushDuplicateIssue(teamNameKeys, key, subject, "duplicate-team-name-key", issues);
    }

    if (team.apiFootballTeamId !== undefined) {
      pushDuplicateIssue(apiFootballTeamIds, team.apiFootballTeamId, subject, "duplicate-api-football-team-id", issues);
    }
  }

  return teamIds;
}

function validatePlayers(players: CanonicalPlayer[], teamIds: Set<string>, issues: CanonicalValidationIssue[]): void {
  const playerIds = new Set<string>();
  const playerKeysByTeam = new Map<string, string>();
  const apiFootballPlayerIds = new Map<number, string>();

  for (const player of players) {
    const subject = player.playerId || player.displayName || "unknown-player";
    if (!player.playerId.trim()) {
      issues.push({ subject, reason: "missing-player-id" });
      continue;
    }

    if (!player.displayName.trim()) {
      issues.push({ subject, reason: "missing-player-display-name" });
    }

    if (!player.teamId.trim()) {
      issues.push({ subject, reason: "missing-player-team-id" });
    } else if (!teamIds.has(player.teamId)) {
      issues.push({ subject, reason: "unknown-player-team-id" });
    }

    if (playerIds.has(player.playerId)) {
      issues.push({ subject: player.playerId, reason: "duplicate-player-id" });
    }
    playerIds.add(player.playerId);

    for (const name of [player.displayName, ...(player.aliases ?? [])]) {
      const key = normalizePlayerName(name);
      if (!key) {
        issues.push({ subject, reason: "empty-player-name-key" });
        continue;
      }
      pushDuplicateIssue(playerKeysByTeam, `${player.teamId}:${key}`, subject, "duplicate-player-name-key-in-team", issues);
    }

    if (player.apiFootballPlayerId !== undefined) {
      pushDuplicateIssue(apiFootballPlayerIds, player.apiFootballPlayerId, subject, "duplicate-api-football-player-id", issues);
    }
  }
}

export function validateCanonicalData(
  teams: CanonicalTeam[] = canonicalTeams,
  players: CanonicalPlayer[] = canonicalPlayers
): CanonicalValidationResult {
  const issues: CanonicalValidationIssue[] = [];
  const teamIds = validateTeams(teams, issues);
  validatePlayers(players, teamIds, issues);

  return {
    valid: issues.length === 0,
    issues
  };
}

export function formatCanonicalValidationIssues(issues: CanonicalValidationIssue[]): string {
  return issues
    .map((issue) => {
      const parts = [issue.reason];
      if (issue.subject) {
        parts.push(`subject=${issue.subject}`);
      }
      return parts.join(" ");
    })
    .join("; ");
}
