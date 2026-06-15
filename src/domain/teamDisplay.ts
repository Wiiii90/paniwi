import { resolveTeamFromApiFootball, resolveTeamFromWikipedia } from "./canonicalResolver";
import type { CanonicalTeam, SourceName } from "./types";

const germanTeamNamesById: Record<string, string> = {
  algeria: "Algerien",
  argentina: "Argentinien",
  australia: "Australien",
  austria: "Oesterreich",
  belgium: "Belgien",
  "bosnia-and-herzegovina": "Bosnien und Herzegowina",
  brazil: "Brasilien",
  canada: "Kanada",
  "cape-verde": "Kap Verde",
  colombia: "Kolumbien",
  croatia: "Kroatien",
  curacao: "Curacao",
  "czech-republic": "Tschechien",
  "dr-congo": "DR Kongo",
  ecuador: "Ecuador",
  egypt: "Aegypten",
  england: "England",
  france: "Frankreich",
  germany: "Deutschland",
  haiti: "Haiti",
  iran: "Iran",
  iraq: "Irak",
  "ivory-coast": "Elfenbeinkueste",
  mexico: "Mexiko",
  morocco: "Marokko",
  netherlands: "Niederlande",
  norway: "Norwegen",
  panama: "Panama",
  paraguay: "Paraguay",
  portugal: "Portugal",
  qatar: "Katar",
  scotland: "Schottland",
  senegal: "Senegal",
  "south-africa": "Suedafrika",
  "south-korea": "Suedkorea",
  spain: "Spanien",
  sweden: "Schweden",
  switzerland: "Schweiz",
  tunisia: "Tunesien",
  turkey: "Tuerkei",
  "united-states": "USA",
  uruguay: "Uruguay"
};

export function getTeamDisplayName(team: CanonicalTeam): string {
  return germanTeamNamesById[team.teamId] ?? team.displayName;
}

export function resolveTeamDisplayName(teamName: string, source: SourceName = "wikipedia"): string {
  const team =
    source === "api-football"
      ? resolveTeamFromApiFootball(teamName)
      : resolveTeamFromWikipedia(teamName) ?? resolveTeamFromApiFootball(teamName);

  return team ? getTeamDisplayName(team) : teamName;
}
