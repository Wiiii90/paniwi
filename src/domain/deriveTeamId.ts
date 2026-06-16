import { normalizePlayerName } from "./normalizePlayerName";

export function deriveTeamId(teamName: string): string {
  return normalizePlayerName(teamName).replace(/ /g, "-");
}
