import type { ParticipantTeam } from "../domain/types";
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
  const apiPlayerIds = new Map<number, string>();

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

    const hasPositionMetadata = team.players.some((player) => player.position !== undefined);
    const goalkeeperCount = team.players.filter((player) => player.position === "goalkeeper").length;
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
    for (const player of team.players) {
      const playerName = player.name.trim();
      const nationalTeam = player.nationalTeam.trim();

      if (!playerName) {
        issues.push({ owner: team.owner, reason: "missing-player-name" });
        continue;
      }

      if (!nationalTeam) {
        issues.push({ owner: team.owner, player: player.name, reason: "missing-national-team" });
      }

      const playerKey = normalizePlayerName(playerName);
      if (playerNames.has(playerKey)) {
        issues.push({ owner: team.owner, player: player.name, reason: "duplicate-player-in-team" });
      }
      playerNames.add(playerKey);

      if (player.apiPlayerId !== undefined) {
        const existingOwner = apiPlayerIds.get(player.apiPlayerId);
        if (existingOwner && existingOwner !== team.owner) {
          issues.push({ owner: team.owner, player: player.name, reason: "duplicate-api-player-id" });
        }
        apiPlayerIds.set(player.apiPlayerId, team.owner);
      }
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
