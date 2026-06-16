import { normalizePlayerName } from "../domain/normalizePlayerName";

export type TeamCatalogEntry = {
  teamId: string;
  sourceName: string;
  displayName: string;
  aliases?: string[];
};

export const teamCatalog = [
  { teamId: "algeria", sourceName: "Algeria", displayName: "Algerien" },
  { teamId: "argentina", sourceName: "Argentina", displayName: "Argentinien" },
  { teamId: "australia", sourceName: "Australia", displayName: "Australien" },
  { teamId: "austria", sourceName: "Austria", displayName: "Österreich" },
  { teamId: "belgium", sourceName: "Belgium", displayName: "Belgien" },
  { teamId: "bosnia-and-herzegovina", sourceName: "Bosnia and Herzegovina", displayName: "Bosnien und Herzegowina" },
  { teamId: "brazil", sourceName: "Brazil", displayName: "Brasilien" },
  { teamId: "canada", sourceName: "Canada", displayName: "Kanada" },
  { teamId: "cape-verde", sourceName: "Cape Verde", displayName: "Kap Verde", aliases: ["Cape Verde Islands", "CPV"] },
  { teamId: "colombia", sourceName: "Colombia", displayName: "Kolumbien" },
  { teamId: "croatia", sourceName: "Croatia", displayName: "Kroatien" },
  { teamId: "curacao", sourceName: "Curacao", displayName: "Curacao", aliases: ["Curaçao", "CUW"] },
  { teamId: "czech-republic", sourceName: "Czech Republic", displayName: "Tschechien" },
  {
    teamId: "dr-congo",
    sourceName: "DR Congo",
    displayName: "DR Kongo",
    aliases: ["Democratic Republic of the Congo", "COD"]
  },
  { teamId: "ecuador", sourceName: "Ecuador", displayName: "Ecuador" },
  { teamId: "egypt", sourceName: "Egypt", displayName: "Ägypten" },
  { teamId: "england", sourceName: "England", displayName: "England" },
  { teamId: "france", sourceName: "France", displayName: "Frankreich" },
  { teamId: "ghana", sourceName: "Ghana", displayName: "Ghana", aliases: ["GHA"] },
  { teamId: "germany", sourceName: "Germany", displayName: "Deutschland" },
  { teamId: "haiti", sourceName: "Haiti", displayName: "Haiti" },
  { teamId: "iran", sourceName: "Iran", displayName: "Iran" },
  { teamId: "iraq", sourceName: "Iraq", displayName: "Irak" },
  { teamId: "japan", sourceName: "Japan", displayName: "Japan" },
  { teamId: "jordan", sourceName: "Jordan", displayName: "Jordanien", aliases: ["JOR"] },
  { teamId: "ivory-coast", sourceName: "Ivory Coast", displayName: "Elfenbeinküste", aliases: ["CIV", "CI"] },
  { teamId: "mexico", sourceName: "Mexico", displayName: "Mexiko" },
  { teamId: "morocco", sourceName: "Morocco", displayName: "Marokko" },
  { teamId: "netherlands", sourceName: "Netherlands", displayName: "Niederlande" },
  { teamId: "new-zealand", sourceName: "New Zealand", displayName: "Neuseeland", aliases: ["NZL"] },
  { teamId: "norway", sourceName: "Norway", displayName: "Norwegen" },
  { teamId: "panama", sourceName: "Panama", displayName: "Panama" },
  { teamId: "paraguay", sourceName: "Paraguay", displayName: "Paraguay" },
  { teamId: "portugal", sourceName: "Portugal", displayName: "Portugal" },
  { teamId: "qatar", sourceName: "Qatar", displayName: "Katar" },
  { teamId: "saudi-arabia", sourceName: "Saudi Arabia", displayName: "Saudi-Arabien", aliases: ["KSA"] },
  { teamId: "scotland", sourceName: "Scotland", displayName: "Schottland" },
  { teamId: "senegal", sourceName: "Senegal", displayName: "Senegal" },
  { teamId: "south-africa", sourceName: "South Africa", displayName: "Südafrika", aliases: ["RSA"] },
  { teamId: "south-korea", sourceName: "South Korea", displayName: "Südkorea", aliases: ["Korea Republic", "KOR"] },
  { teamId: "spain", sourceName: "Spain", displayName: "Spanien" },
  { teamId: "sweden", sourceName: "Sweden", displayName: "Schweden" },
  { teamId: "switzerland", sourceName: "Switzerland", displayName: "Schweiz", aliases: ["SUI", "CHE"] },
  { teamId: "tunisia", sourceName: "Tunisia", displayName: "Tunesien" },
  { teamId: "turkey", sourceName: "Turkey", displayName: "Türkei", aliases: ["Turkiye", "Türkiye", "TUR"] },
  { teamId: "united-states", sourceName: "United States", displayName: "USA", aliases: ["USA", "US"] },
  { teamId: "uzbekistan", sourceName: "Uzbekistan", displayName: "Usbekistan", aliases: ["UZB"] },
  { teamId: "uruguay", sourceName: "Uruguay", displayName: "Uruguay" }
] satisfies TeamCatalogEntry[];

const teamCatalogById = new Map(teamCatalog.map((team) => [team.teamId, team]));
const teamIdByNormalizedName = new Map(
  teamCatalog.flatMap((team) =>
    [team.sourceName, team.displayName, ...(team.aliases ?? [])].map((name) => [normalizePlayerName(name), team.teamId] as const)
  )
);

export function getTeamCatalogEntry(teamId: string): TeamCatalogEntry | null {
  return teamCatalogById.get(teamId) ?? null;
}

export function getKnownTeamIds(): Set<string> {
  return new Set(teamCatalog.map((team) => team.teamId));
}

export function resolveKnownTeamId(teamName: string): string | null {
  return teamIdByNormalizedName.get(normalizePlayerName(teamName)) ?? null;
}
