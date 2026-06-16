import { getTeamCatalogEntry, resolveKnownTeamId, type TeamCatalogEntry } from "../config/teamCatalog";
import { deriveTeamId } from "./deriveTeamId";
import { normalizePlayerName } from "./normalizePlayerName";
import type { GoalRecord } from "./types";

function createFallbackTeam(teamName: string): TeamCatalogEntry | null {
  const normalized = normalizePlayerName(teamName);
  if (!normalized) {
    return null;
  }

  return {
    teamId: deriveTeamId(teamName),
    sourceName: teamName.trim(),
    displayName: teamName.trim(),
    flagCode: "",
    aliases: []
  };
}

export function resolveTeamFromApiFootball(teamName: string): TeamCatalogEntry | null {
  const knownTeamId = resolveKnownTeamId(teamName);
  return (knownTeamId ? getTeamCatalogEntry(knownTeamId) : null) ?? createFallbackTeam(teamName);
}

export function resolveTeamFromWikipedia(teamName: string): TeamCatalogEntry | null {
  const knownTeamId = resolveKnownTeamId(teamName);
  return (knownTeamId ? getTeamCatalogEntry(knownTeamId) : null) ?? createFallbackTeam(teamName);
}

export function resolveGoalTeamId(goal: Pick<GoalRecord, "teamId" | "source" | "nationalTeam">): string | null {
  if (goal.teamId) {
    return goal.teamId;
  }

  const team =
    goal.source === "api-football"
      ? resolveTeamFromApiFootball(goal.nationalTeam)
      : resolveTeamFromWikipedia(goal.nationalTeam) ?? resolveTeamFromApiFootball(goal.nationalTeam);

  return team?.teamId ?? null;
}
