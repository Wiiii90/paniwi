import { normalizePlayerName } from "../../domain/normalizePlayerName";
import { deriveTeamId } from "../../domain/deriveTeamId";
import { resolveTeamFromWikipedia } from "../../domain/teamResolver";
import type { RosterPlayer, RosterPosition, RosterTeam } from "../../domain/rosterTypes";

const defaultEndpoint = "https://en.wikipedia.org/w/api.php";
const defaultPage = "2026 FIFA World Cup squads";

type WikipediaQueryResponse = {
  query?: {
    pages?: Array<{
      title?: string;
      missing?: boolean;
      revisions?: Array<{
        slots?: {
          main?: {
            content?: string;
          };
        };
      }>;
    }>;
  };
  error?: {
    code?: string;
    info?: string;
  };
};

function getOptionalEnvValue(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function stripWikiMarkup(value: string): string {
  return value
    .replace(/<ref[^>]*>.*?<\/ref>/gis, "")
    .replace(/<ref[^/]*\/>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\{\{sortname\|([^}|]+)\|([^}|]*)(?:\|[^}]*)?\}\}/gi, (_, first: string, second: string) =>
      `${first} ${second}`.trim()
    )
    .replace(/\{\{flagicon\|([^}|]+).*?\}\}/gi, "")
    .replace(/\{\{[^}]+\}\}/g, "")
    .replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, "$1")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/'''?/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanWikipediaName(value: string): string {
  return stripWikiMarkup(value)
    .replace(/_/g, " ")
    .replace(/\s+\([^)]*\)$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getHeading(line: string): { level: number; text: string } | null {
  const match = line.match(/^(=+)\s*(.+?)\s*\1$/);
  return match ? { level: match[1].length, text: stripWikiMarkup(match[2]) } : null;
}

function mapPosition(value: string | undefined): RosterPosition {
  const clean = stripWikiMarkup(value ?? "").toUpperCase();
  if (/\bGK\b|GOALKEEPER/.test(clean)) {
    return "goalkeeper";
  }
  if (/\bDF\b|DEFENDER/.test(clean)) {
    return "defender";
  }
  if (/\bMF\b|MIDFIELDER/.test(clean)) {
    return "midfielder";
  }
  if (/\bFW\b|FORWARD|ATTACKER|STRIKER/.test(clean)) {
    return "forward";
  }
  return "unknown";
}

function parseShirtNumber(value: string | undefined): number | undefined {
  const match = stripWikiMarkup(value ?? "").match(/\d+/);
  return match ? Number(match[0]) : undefined;
}

function parseTemplateParams(content: string): Record<string, string> {
  const params: Record<string, string> = {};
  const parts = splitTemplateParams(content).map((part) => part.trim());

  parts.slice(1).forEach((part, index) => {
    const equalsIndex = part.indexOf("=");
    if (equalsIndex >= 0) {
      params[part.slice(0, equalsIndex).trim().toLowerCase()] = part.slice(equalsIndex + 1).trim();
      return;
    }
    params[String(index + 1)] = part;
  });

  return params;
}

function splitTemplateParams(content: string): string[] {
  const parts: string[] = [];
  let current = "";
  let linkDepth = 0;
  let templateDepth = 0;

  for (let index = 0; index < content.length; index += 1) {
    const pair = content.slice(index, index + 2);
    if (pair === "[[") {
      linkDepth += 1;
      current += pair;
      index += 1;
      continue;
    }
    if (pair === "]]" && linkDepth > 0) {
      linkDepth -= 1;
      current += pair;
      index += 1;
      continue;
    }
    if (pair === "{{") {
      templateDepth += 1;
      current += pair;
      index += 1;
      continue;
    }
    if (pair === "}}" && templateDepth > 0) {
      templateDepth -= 1;
      current += pair;
      index += 1;
      continue;
    }
    if (content[index] === "|" && linkDepth === 0 && templateDepth === 0) {
      parts.push(current);
      current = "";
      continue;
    }

    current += content[index];
  }

  parts.push(current);
  return parts;
}

function parseRosterTemplate(template: string): RosterPlayer | null {
  const params = parseTemplateParams(template);
  const rawName = params.name ?? params.player ?? params[3] ?? params[2];
  if (!rawName) {
    return null;
  }

  const playerName = cleanWikipediaName(rawName);
  if (!playerName) {
    return null;
  }

  return {
    playerName,
    normalizedPlayerName: normalizePlayerName(playerName),
    position: mapPosition(params.pos ?? params.position ?? params[2]),
    shirtNumber: parseShirtNumber(params.no ?? params.number ?? params[1]),
    sourceName: stripWikiMarkup(rawName)
  };
}

function extractRosterTemplates(sectionText: string): RosterPlayer[] {
  const players: RosterPlayer[] = [];
  const templatePattern = /\{\{\s*(?:nat fs player|nat fs g player|nat fs g start player|fs player)\s*\|([\s\S]*?)\}\}/gi;

  for (const match of sectionText.matchAll(templatePattern)) {
    const player = parseRosterTemplate(`template|${match[1]}`);
    if (player) {
      players.push(player);
    }
  }

  return players;
}

function splitTableCells(row: string): string[] {
  return row
    .replace(/\|\}\s*$/g, "")
    .replace(/^\|+/, "")
    .split(/\s*\|\|\s*/)
    .map((cell) => cell.trim())
    .filter(Boolean);
}

function parseRosterTableRows(sectionText: string): RosterPlayer[] {
  const players: RosterPlayer[] = [];
  const rows = sectionText.split(/\n\|-/).slice(1);

  for (const row of rows) {
    const cells = splitTableCells(row.replace(/\n/g, " "));
    const positionIndex = cells.findIndex((cell) => mapPosition(cell) !== "unknown");
    if (positionIndex < 0 || positionIndex + 1 >= cells.length) {
      continue;
    }

    const rawName = cells[positionIndex + 1];
    if (!/\[\[|\{\{sortname\|/i.test(rawName)) {
      continue;
    }

    const playerName = cleanWikipediaName(rawName);
    if (!playerName) {
      continue;
    }

    players.push({
      playerName,
      normalizedPlayerName: normalizePlayerName(playerName),
      position: mapPosition(cells[positionIndex]),
      shirtNumber: parseShirtNumber(cells[positionIndex - 1]),
      sourceName: stripWikiMarkup(rawName)
    });
  }

  return players;
}

function dedupeRosterPlayers(players: RosterPlayer[]): RosterPlayer[] {
  const seen = new Set<string>();
  const unique: RosterPlayer[] = [];

  for (const player of players) {
    const key = `${player.normalizedPlayerName}:${player.shirtNumber ?? ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(player);
  }

  return unique.sort((a, b) => (a.shirtNumber ?? 999) - (b.shirtNumber ?? 999) || a.playerName.localeCompare(b.playerName));
}

function isGroupHeading(text: string): boolean {
  return /^Group [A-L]$/i.test(text);
}

function isTerminalHeading(text: string): boolean {
  return /^(Statistics|Notes|References|External links)$/i.test(text);
}

function resolveTeamId(teamName: string): string | undefined {
  return resolveTeamFromWikipedia(teamName)?.teamId ?? deriveTeamId(teamName);
}

export function parseWikipediaSquads(wikitext: string): RosterTeam[] {
  const lines = wikitext.split(/\r?\n/);
  const teams: RosterTeam[] = [];
  let inGroupSection = false;
  let currentTeamName: string | null = null;
  let currentSectionLines: string[] = [];

  function flushTeam(): void {
    if (!currentTeamName) {
      currentSectionLines = [];
      return;
    }

    const sectionText = currentSectionLines.join("\n");
    const players = dedupeRosterPlayers([...extractRosterTemplates(sectionText), ...parseRosterTableRows(sectionText)]);
    teams.push({
      teamName: currentTeamName,
      teamId: resolveTeamId(currentTeamName),
      players
    });
    currentTeamName = null;
    currentSectionLines = [];
  }

  for (const line of lines) {
    const heading = getHeading(line);
    if (heading) {
      if (heading.level <= 2) {
        flushTeam();
        inGroupSection = isGroupHeading(heading.text);
        if (isTerminalHeading(heading.text)) {
          break;
        }
        continue;
      }

      if (inGroupSection && heading.level === 3) {
        flushTeam();
        currentTeamName = heading.text;
        currentSectionLines = [];
        continue;
      }
    }

    if (currentTeamName) {
      currentSectionLines.push(line);
    }
  }

  flushTeam();
  return teams;
}

export async function fetchWikipediaRosterPage(
  env: NodeJS.ProcessEnv = process.env
): Promise<{ title: string; wikitext: string }> {
  const page = getOptionalEnvValue(env.WIKIPEDIA_ROSTERS_PAGE) ?? defaultPage;
  const endpoint = getOptionalEnvValue(env.WIKIPEDIA_API_ENDPOINT) ?? defaultEndpoint;
  const timeoutMs = Number(getOptionalEnvValue(env.WIKIPEDIA_TIMEOUT_MS) ?? 15_000);
  const userAgent =
    getOptionalEnvValue(env.WIKIPEDIA_USER_AGENT) ??
    "wm-2026-panini-liga/0.1 (https://github.com/Wiiii90/paniwi; private hobby project; contact: wilhelmaltemeier@gmail.com)";
  const url = new URL(endpoint);
  url.searchParams.set("action", "query");
  url.searchParams.set("prop", "revisions");
  url.searchParams.set("rvslots", "main");
  url.searchParams.set("rvprop", "content");
  url.searchParams.set("titles", page);
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  url.searchParams.set("origin", "*");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": userAgent
      }
    });

    if (response.status === 429) {
      throw new Error("Wikipedia API returned HTTP 429 (rate limited).");
    }

    if (!response.ok) {
      throw new Error(`Wikipedia API returned HTTP ${response.status}`);
    }

    const body = (await response.json()) as WikipediaQueryResponse;
    if (body.error) {
      throw new Error(body.error.info ?? body.error.code ?? "Wikipedia API error");
    }

    const result = body.query?.pages?.[0];
    const wikitext = result?.revisions?.[0]?.slots?.main?.content;
    if (!result?.title || !wikitext || result.missing) {
      throw new Error(`Wikipedia roster page "${page}" could not be loaded.`);
    }

    return { title: result.title, wikitext };
  } finally {
    clearTimeout(timeout);
  }
}
