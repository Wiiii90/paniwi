import { normalizePlayerName } from "../domain/normalizePlayerName";

export type TeamCatalogEntry = {
  teamId: string;
  sourceName: string;
  displayName: string;
  flagCode: string;
  aliases?: string[];
};

export const teamCatalog = [
  { teamId: "algeria", sourceName: "Algeria", displayName: "Algerien", flagCode: "DZ" },
  { teamId: "argentina", sourceName: "Argentina", displayName: "Argentinien", flagCode: "AR" },
  { teamId: "australia", sourceName: "Australia", displayName: "Australien", flagCode: "AU" },
  { teamId: "austria", sourceName: "Austria", displayName: "Österreich", flagCode: "AT" },
  { teamId: "belgium", sourceName: "Belgium", displayName: "Belgien", flagCode: "BE" },
  { teamId: "bosnia-and-herzegovina", sourceName: "Bosnia and Herzegovina", displayName: "Bosnien und Herzegowina", flagCode: "BA", aliases: ["BIH"] },
  { teamId: "brazil", sourceName: "Brazil", displayName: "Brasilien", flagCode: "BR" },
  { teamId: "canada", sourceName: "Canada", displayName: "Kanada", flagCode: "CA" },
  { teamId: "cape-verde", sourceName: "Cape Verde", displayName: "Kap Verde", flagCode: "CV", aliases: ["Cape Verde Islands", "CPV"] },
  { teamId: "colombia", sourceName: "Colombia", displayName: "Kolumbien", flagCode: "CO" },
  { teamId: "croatia", sourceName: "Croatia", displayName: "Kroatien", flagCode: "HR" },
  { teamId: "curacao", sourceName: "Curacao", displayName: "Curacao", flagCode: "CW", aliases: ["Curaçao", "CUW"] },
  { teamId: "czech-republic", sourceName: "Czech Republic", displayName: "Tschechien", flagCode: "CZ", aliases: ["CZE"] },
  {
    teamId: "dr-congo",
    sourceName: "DR Congo",
    displayName: "DR Kongo",
    flagCode: "CD",
    aliases: ["Congo DR", "Democratic Republic of the Congo", "COD"]
  },
  { teamId: "ecuador", sourceName: "Ecuador", displayName: "Ecuador", flagCode: "EC" },
  { teamId: "egypt", sourceName: "Egypt", displayName: "Ägypten", flagCode: "EG" },
  { teamId: "england", sourceName: "England", displayName: "England", flagCode: "GB-ENG" },
  { teamId: "france", sourceName: "France", displayName: "Frankreich", flagCode: "FR" },
  { teamId: "ghana", sourceName: "Ghana", displayName: "Ghana", flagCode: "GH", aliases: ["GHA"] },
  { teamId: "germany", sourceName: "Germany", displayName: "Deutschland", flagCode: "DE" },
  { teamId: "haiti", sourceName: "Haiti", displayName: "Haiti", flagCode: "HT" },
  { teamId: "iran", sourceName: "Iran", displayName: "Iran", flagCode: "IR" },
  { teamId: "iraq", sourceName: "Iraq", displayName: "Irak", flagCode: "IQ" },
  { teamId: "japan", sourceName: "Japan", displayName: "Japan", flagCode: "JP" },
  { teamId: "jordan", sourceName: "Jordan", displayName: "Jordanien", flagCode: "JO", aliases: ["JOR"] },
  { teamId: "ivory-coast", sourceName: "Ivory Coast", displayName: "Elfenbeinküste", flagCode: "CI", aliases: ["CIV", "CI"] },
  { teamId: "mexico", sourceName: "Mexico", displayName: "Mexiko", flagCode: "MX" },
  { teamId: "morocco", sourceName: "Morocco", displayName: "Marokko", flagCode: "MA" },
  { teamId: "netherlands", sourceName: "Netherlands", displayName: "Niederlande", flagCode: "NL" },
  { teamId: "new-zealand", sourceName: "New Zealand", displayName: "Neuseeland", flagCode: "NZ", aliases: ["NZL"] },
  { teamId: "norway", sourceName: "Norway", displayName: "Norwegen", flagCode: "NO" },
  { teamId: "panama", sourceName: "Panama", displayName: "Panama", flagCode: "PA" },
  { teamId: "paraguay", sourceName: "Paraguay", displayName: "Paraguay", flagCode: "PY" },
  { teamId: "portugal", sourceName: "Portugal", displayName: "Portugal", flagCode: "PT" },
  { teamId: "qatar", sourceName: "Qatar", displayName: "Katar", flagCode: "QA" },
  { teamId: "saudi-arabia", sourceName: "Saudi Arabia", displayName: "Saudi-Arabien", flagCode: "SA", aliases: ["KSA"] },
  { teamId: "scotland", sourceName: "Scotland", displayName: "Schottland", flagCode: "GB-SCT" },
  { teamId: "senegal", sourceName: "Senegal", displayName: "Senegal", flagCode: "SN" },
  { teamId: "south-africa", sourceName: "South Africa", displayName: "Südafrika", flagCode: "ZA", aliases: ["RSA"] },
  { teamId: "south-korea", sourceName: "South Korea", displayName: "Südkorea", flagCode: "KR", aliases: ["Korea Republic", "KOR"] },
  { teamId: "spain", sourceName: "Spain", displayName: "Spanien", flagCode: "ES" },
  { teamId: "sweden", sourceName: "Sweden", displayName: "Schweden", flagCode: "SE" },
  { teamId: "switzerland", sourceName: "Switzerland", displayName: "Schweiz", flagCode: "CH", aliases: ["SUI", "CHE"] },
  { teamId: "tunisia", sourceName: "Tunisia", displayName: "Tunesien", flagCode: "TN" },
  { teamId: "turkey", sourceName: "Turkey", displayName: "Türkei", flagCode: "TR", aliases: ["Turkiye", "Türkiye", "TUR"] },
  { teamId: "united-states", sourceName: "United States", displayName: "USA", flagCode: "US", aliases: ["USA", "US"] },
  { teamId: "uzbekistan", sourceName: "Uzbekistan", displayName: "Usbekistan", flagCode: "UZ", aliases: ["UZB"] },
  { teamId: "uruguay", sourceName: "Uruguay", displayName: "Uruguay", flagCode: "UY" }
] satisfies TeamCatalogEntry[];

const teamCatalogById = new Map(teamCatalog.map((team) => [team.teamId, team]));
const ignoredTeamWords = new Set(["and", "of", "the", "republic"]);

function getTeamNames(team: TeamCatalogEntry): string[] {
  return [team.sourceName, team.displayName, ...(team.aliases ?? [])];
}

function getTeamTokens(teamName: string): string[] {
  return normalizePlayerName(teamName).split(" ").filter(Boolean);
}

function normalizeTeamMatchKey(teamName: string): string {
  return getTeamTokens(teamName)
    .filter((token) => !ignoredTeamWords.has(token))
    .join(" ");
}

function createTeamNameEntries(): Array<{ teamId: string; key: string; tokens: string[] }> {
  return teamCatalog.flatMap((team) =>
    getTeamNames(team).flatMap((name) => {
      const normalizedName = normalizePlayerName(name);
      const normalizedMatchKey = normalizeTeamMatchKey(name);
      return [
        { teamId: team.teamId, key: normalizedName, tokens: getTeamTokens(name) },
        { teamId: team.teamId, key: normalizedMatchKey, tokens: getTeamTokens(normalizedMatchKey) }
      ];
    })
  );
}

const teamNameEntries = createTeamNameEntries();
const teamIdByNormalizedName = new Map(teamNameEntries.map((entry) => [entry.key, entry.teamId]));

export function getTeamCatalogEntry(teamId: string): TeamCatalogEntry | null {
  return teamCatalogById.get(teamId) ?? null;
}

export function getKnownTeamIds(): Set<string> {
  return new Set(teamCatalog.map((team) => team.teamId));
}

export function resolveKnownTeamId(teamName: string): string | null {
  const normalizedName = normalizePlayerName(teamName);
  const exactTeamId = teamIdByNormalizedName.get(normalizedName) ?? teamIdByNormalizedName.get(normalizeTeamMatchKey(teamName));
  if (exactTeamId) {
    return exactTeamId;
  }

  const tokens = getTeamTokens(teamName).filter((token) => token.length >= 5);
  if (tokens.length === 0) {
    return null;
  }

  const candidates = new Set(
    teamNameEntries
      .filter((entry) =>
        tokens.some((token) => entry.tokens.some((entryToken) => entryToken.length >= 5 && (entryToken.startsWith(token) || token.startsWith(entryToken))))
      )
      .map((entry) => entry.teamId)
  );

  return candidates.size === 1 ? [...candidates][0] : null;
}

export function getTeamFlag(teamName: string): string {
  const teamId = resolveKnownTeamId(teamName);
  const flagCode = teamId ? teamCatalogById.get(teamId)?.flagCode : undefined;
  if (!flagCode) {
    return "";
  }

  return flagCodeToEmoji(flagCode);
}

export function getTeamFlagUrl(teamName: string): string {
  const teamId = resolveKnownTeamId(teamName);
  const flagCode = teamId ? teamCatalogById.get(teamId)?.flagCode : undefined;
  if (!flagCode) {
    return "";
  }

  return `https://flagcdn.com/${flagCode.toLowerCase()}.svg`;
}

function flagCodeToEmoji(flagCode: string): string {
  if (flagCode === "GB-ENG") {
    return String.fromCodePoint(0x1f3f4, 0xe0067, 0xe0062, 0xe0065, 0xe006e, 0xe0067, 0xe007f);
  }

  if (flagCode === "GB-SCT") {
    return String.fromCodePoint(0x1f3f4, 0xe0067, 0xe0062, 0xe0073, 0xe0063, 0xe0074, 0xe007f);
  }

  if (!/^[A-Z]{2}$/.test(flagCode)) {
    return "";
  }

  return String.fromCodePoint(...[...flagCode].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65));
}
