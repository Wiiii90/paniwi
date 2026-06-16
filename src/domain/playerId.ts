import { normalizePlayerName } from "./normalizePlayerName";

export function buildPlayerId(teamId: string, playerName: string): string {
  const normalizedName = normalizePlayerName(playerName).replace(/\s+/g, "-");
  return `${teamId}-${normalizedName || "unknown-player"}`;
}
