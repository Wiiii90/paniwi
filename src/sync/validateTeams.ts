import type { ParticipantTeam } from "../domain/types";
import { getCanonicalPlayer } from "../domain/canonicalResolver";
import { normalizePlayerName } from "../domain/normalizePlayerName";

export type TeamValidationIssue = {
  owner?: string;
  player?: string;
  reason: string;
};

export type TeamValidationResult = {
  valid: boolean;
  issues: TeamValidationIssue[];
};

export function validateTeams(teams: ParticipantTeam[]): TeamValidationResult {
  const issues: TeamValidationIssue[] = [];
  const ownerNames = new Set<string>();

  for (const team of teams) {
    const owner = team.owner.trim();
    if (!owner) {
      issues.push({ reason: "missing-owner" });
      continue;
    }

    const ownerKey = normalizePlayerName(owner);
    if (ownerNames.has(ownerKey)) {
      issues.push({ owner: team.owner, reason: "duplicate-owner" });
    }
    ownerNames.add(ownerKey);

    if (team.players.length < 10 || team.players.length > 11) {
      issues.push({ owner: team.owner, reason: "invalid-team-size" });
    }

    const resolvedPlayers = team.players.map((pick) => getCanonicalPlayer(pick.playerId));
    const hasPositionMetadata = resolvedPlayers.some((player) => player?.position !== undefined);
    const goalkeeperCount = resolvedPlayers.filter((player) => player?.position === "goalkeeper").length;
    if (goalkeeperCount > 1) {
      issues.push({ owner: team.owner, reason: "too-many-goalkeepers" });
    }
    if (hasPositionMetadata && team.players.length === 11 && goalkeeperCount !== 1) {
      issues.push({ owner: team.owner, reason: "eleven-player-team-needs-one-goalkeeper" });
    }
    if (team.players.length === 10 && goalkeeperCount > 0) {
      issues.push({ owner: team.owner, reason: "ten-player-team-cannot-include-goalkeeper" });
    }

    const playerNames = new Set<string>();
    const playerIds = new Set<string>();
    for (const pick of team.players) {
      const player = getCanonicalPlayer(pick.playerId);

      if (!pick.playerId.trim()) {
        issues.push({ owner: team.owner, reason: "missing-player-id" });
        continue;
      }

      if (!player) {
        issues.push({ owner: team.owner, player: pick.playerId, reason: "unknown-player-id" });
        continue;
      }

      const playerKey = normalizePlayerName(player.displayName);
      if (playerNames.has(playerKey)) {
        issues.push({ owner: team.owner, player: player.displayName, reason: "duplicate-player-in-team" });
      }
      playerNames.add(playerKey);

      if (playerIds.has(pick.playerId)) {
        issues.push({ owner: team.owner, player: player.displayName, reason: "duplicate-player-id-in-team" });
      }
      playerIds.add(pick.playerId);
    }
  }

  return {
    valid: issues.length === 0,
    issues
  };
}

export function formatTeamValidationIssues(issues: TeamValidationIssue[]): string {
  return issues
    .map((issue) => {
      const parts = [issue.reason];
      if (issue.owner) {
        parts.push(`owner=${issue.owner}`);
      }
      if (issue.player) {
        parts.push(`player=${issue.player}`);
      }
      return parts.join(" ");
    })
    .join("; ");
}
