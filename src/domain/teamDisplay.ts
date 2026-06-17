import { getTeamCatalogEntry } from "../config/teamCatalog";
import { resolveTeamFromApiFootball, resolveTeamFromWikipedia } from "./teamResolver";
import type { SourceName } from "./goalTypes";

export function getTeamDisplayName(teamId: string, fallbackName?: string): string {
  return getTeamCatalogEntry(teamId)?.displayName ?? fallbackName ?? teamId;
}

export function resolveTeamDisplayName(teamName: string, source: SourceName = "wikipedia"): string {
  const team =
    source === "api-football"
      ? resolveTeamFromApiFootball(teamName)
      : resolveTeamFromWikipedia(teamName) ?? resolveTeamFromApiFootball(teamName);

  return team ? getTeamDisplayName(team.teamId, team.displayName) : teamName;
}
