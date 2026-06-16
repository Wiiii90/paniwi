import type { ParticipantTeam } from "../domain/types";
import { getKnownTeamIds } from "../config/teamCatalog";
import { getParticipantPickId } from "../domain/participantPick";
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
  const knownTeamIds = getKnownTeamIds();

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

    const hasPositionMetadata = team.players.some((pick) => pick.position !== undefined);
    const goalkeeperCount = team.players.filter((pick) => pick.position === "goalkeeper").length;
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
      if (!pick.playerName.trim()) {
        issues.push({ owner: team.owner, reason: "missing-player-name" });
        continue;
      }

      if (!pick.teamId.trim()) {
        issues.push({ owner: team.owner, player: pick.playerName, reason: "missing-team-id" });
      } else if (!knownTeamIds.has(pick.teamId)) {
        issues.push({ owner: team.owner, player: pick.playerName, reason: "unknown-team-id" });
      }

      const playerKey = `${pick.teamId}:${normalizePlayerName(pick.playerName)}`;
      if (playerNames.has(playerKey)) {
        issues.push({ owner: team.owner, player: pick.playerName, reason: "duplicate-player-in-team" });
      }
      playerNames.add(playerKey);

      const pickId = getParticipantPickId(pick);
      if (playerIds.has(pickId)) {
        issues.push({ owner: team.owner, player: pick.playerName, reason: "duplicate-player-id-in-team" });
      }
      playerIds.add(pickId);
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
