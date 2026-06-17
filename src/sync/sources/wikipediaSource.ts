import type { GoalSource, GoalSourceResult } from "./types";
import type { ExternalGoalRecord, GoalDetail } from "../../domain/goalTypes";
import type { ExternalMatchRecord, MatchStatus } from "../../domain/matchTypes";
import { normalizePlayerName } from "../../domain/normalizePlayerName";
import { parseKickoffUtc } from "../parseKickoffTime";

export type WikipediaMatchKickoff = {
  id: string;
  kickedOffAt: string;
  label: string;
  finished: boolean;
  homeTeam: string;
  awayTeam: string;
  homeScore?: number;
  awayScore?: number;
};

const defaultEndpoint = "https://en.wikipedia.org/w/api.php";
const defaultPage = "2026 FIFA World Cup";

function getOptionalEnvValue(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

const FIFA_COUNTRY_NAMES: Record<string, string> = {
  ALG: "Algeria",
  ARG: "Argentina",
  AUS: "Australia",
  AUT: "Austria",
  BEL: "Belgium",
  BIH: "Bosnia and Herzegovina",
  BRA: "Brazil",
  CAN: "Canada",
  CPV: "Cape Verde",
  COL: "Colombia",
  CRO: "Croatia",
  CUW: "Curaçao",
  CZE: "Czech Republic",
  COD: "DR Congo",
  ECU: "Ecuador",
  EGY: "Egypt",
  ENG: "England",
  FRA: "France",
  GER: "Germany",
  HAI: "Haiti",
  IRN: "Iran",
  IRQ: "Iraq",
  CI: "Ivory Coast",
  JPN: "Japan",
  MEX: "Mexico",
  MAR: "Morocco",
  NED: "Netherlands",
  NOR: "Norway",
  PAN: "Panama",
  PAR: "Paraguay",
  POR: "Portugal",
  QAT: "Qatar",
  KOR: "South Korea",
  RSA: "South Africa",
  SCO: "Scotland",
  SEN: "Senegal",
  ESP: "Spain",
  SWE: "Sweden",
  CHE: "Switzerland",
  SUI: "Switzerland",
  TUN: "Tunisia",
  USA: "United States",
  URU: "Uruguay"
};

function stripWikiMarkup(value: string): string {
  return value
    .replace(/<ref[^>]*>.*?<\/ref>/gi, "")
    .replace(/<ref[^/]*\/>/gi, "")
    .replace(/\{\{flagicon\|([^}|]+).*?\}\}/gi, "")
    .replace(/\{\{[^}]+\}\}/g, "")
    .replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, "$1")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/'''?/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanWikipediaPlayerName(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\s+\([^)]*\)$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseWikiPlayerName(value: string): string {
  const linkMatch = value.match(/\[\[([^|\]]+)(?:\|[^\]]+)?\]\]/);
  if (linkMatch) {
    return cleanWikipediaPlayerName(linkMatch[1]);
  }

  return cleanWikipediaPlayerName(stripWikiMarkup(value.replace(/(\d+(?:\+\d+)?)'.*$/g, "").replace(/^\*+\s*/, "")));
}

function parseMinute(value: string): number | undefined {
  const match = value.match(/(\d+)(?:\+(\d+))?'/);
  if (!match) {
    return undefined;
  }

  return Number(match[1]) + (match[2] ? Number(match[2]) : 0);
}

function parseMinuteValue(value: string): number | undefined {
  const trimmed = value.trim();
  const apostropheMatch = trimmed.match(/^(\d+)(?:\+(\d+))?'$/);
  if (apostropheMatch) {
    return Number(apostropheMatch[1]) + (apostropheMatch[2] ? Number(apostropheMatch[2]) : 0);
  }

  const plainMatch = trimmed.match(/^(\d+)(?:\+(\d+))?$/);
  if (!plainMatch) {
    return undefined;
  }

  return Number(plainMatch[1]) + (plainMatch[2] ? Number(plainMatch[2]) : 0);
}

function parseGoalModifier(value: string): GoalDetail | null {
  const lower = value.toLowerCase();
  if (/\bo\.g\.|own goal|\(o\.g\.\)/.test(lower)) {
    return "own-goal";
  }

  if (/\bpen\.|\bpenalty\b/.test(lower)) {
    return "penalty";
  }

  return null;
}

function parseLegacyGoalLine(line: string): Array<{ minute?: number; detail: GoalDetail }> {
  const minute = parseMinute(line);
  let detail: GoalDetail = "normal";

  if (/\bo\.g\.|\(o\.g\.\)|own goal/i.test(line)) {
    detail = "own-goal";
  } else if (/\bpen\.|\bpenalty\b/i.test(line)) {
    detail = "penalty";
  }

  if (minute === undefined && detail === "normal") {
    return [];
  }

  return [{ minute, detail }];
}

function parseGoalTemplateContent(content: string): Array<{ minute?: number; detail: GoalDetail }> {
  const parts = content
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
  const goals: Array<{ minute?: number; detail: GoalDetail }> = [];

  for (let index = 0; index < parts.length; ) {
    const minute = parseMinuteValue(parts[index]);
    if (minute === undefined) {
      index += 1;
      continue;
    }

    let detail: GoalDetail = "normal";
    index += 1;

    const modifier = index < parts.length ? parseGoalModifier(parts[index]) : null;
    if (modifier) {
      detail = modifier;
      index += 1;
    }

    goals.push({ minute, detail });
  }

  return goals;
}

function parseGoalsFromLine(line: string): Array<{ minute?: number; detail: GoalDetail }> {
  const templateGoals = [...line.matchAll(/\{\{goal\|([^}]+)\}\}/gi)].flatMap((match) => parseGoalTemplateContent(match[1]));
  if (templateGoals.length > 0) {
    return templateGoals;
  }

  return parseLegacyGoalLine(line);
}

function getHeadingLevel(line: string): number | null {
  const match = line.match(/^(=+)\s*.+?\s*\1$/);
  return match ? match[1].length : null;
}

function getHeadingText(line: string): string | null {
  const match = line.match(/^(=+)\s*(.+?)\s*\1$/);
  return match ? stripWikiMarkup(match[2]) : null;
}

function parseGoalCountLine(line: string): { goals: number; detail: GoalDetail } | null {
  const clean = stripWikiMarkup(line).toLowerCase();
  const ownGoalMatch = clean.match(/^(\d+)\s+own goals?$/);
  if (ownGoalMatch) {
    return { goals: Number(ownGoalMatch[1]), detail: "own-goal" };
  }

  const goalMatch = clean.match(/^(\d+)\s+goals?$/);
  if (goalMatch) {
    return { goals: Number(goalMatch[1]), detail: "normal" };
  }

  return null;
}

function parsePlayerLine(line: string): string | null {
  const clean = stripWikiMarkup(line.replace(/^\*+\s*/, ""));
  if (!clean) {
    return null;
  }

  return cleanWikipediaPlayerName(clean);
}

function getField(block: string, fieldName: string): string {
  const match = block.match(new RegExp(`\\|${fieldName}=([\\s\\S]*?)(?=\\n\\|[a-z0-9]+=)`, "i"));
  return match ? match[1].trim() : "";
}

function extractFootballBoxes(wikitext: string): string[] {
  const boxes: string[] = [];
  const pattern = /\{\{#invoke:football box|\{\{football box/gi;
  let searchFrom = 0;

  while (searchFrom < wikitext.length) {
    pattern.lastIndex = searchFrom;
    const match = pattern.exec(wikitext);
    if (!match) {
      break;
    }

    const boxStart = match.index;
    const sectionEnd = wikitext.indexOf("}}<section", boxStart);
    const kitEnd = wikitext.indexOf("}}\n\n{|", boxStart);
    const candidates = [sectionEnd, kitEnd].filter((index) => index >= 0);
    const boxEnd = candidates.length > 0 ? Math.min(...candidates) + 2 : Math.min(boxStart + 2500, wikitext.length);
    boxes.push(wikitext.slice(boxStart, boxEnd));
    searchFrom = boxEnd;
  }

  return boxes;
}

function parseMatchDate(block: string): string | undefined {
  return parseKickoffUtc(block);
}

export function parseWikipediaMatchKickoffs(wikitext: string, pageTitle: string): WikipediaMatchKickoff[] {
  const records: WikipediaMatchKickoff[] = [];

  for (const block of extractFootballBoxes(wikitext)) {
    const kickedOffAt = parseKickoffUtc(block);
    const homeCode = parseTeamCode(block, "team1");
    const awayCode = parseTeamCode(block, "team2");
    if (!kickedOffAt || !homeCode || !awayCode) {
      continue;
    }

    const homeTeam = FIFA_COUNTRY_NAMES[homeCode] ?? homeCode;
    const awayTeam = FIFA_COUNTRY_NAMES[awayCode] ?? awayCode;
    const score = parseMatchScore(block);
    const scoreParts = parseScoreParts(score);
    const label = buildMatchLabel(homeTeam, awayTeam, score);
    const id = `${normalizePlayerName(pageTitle)}:${normalizePlayerName(homeTeam)}-${normalizePlayerName(awayTeam)}:${kickedOffAt}`;

    records.push({
      id,
      kickedOffAt,
      label,
      finished: scoreParts.homeScore !== undefined && scoreParts.awayScore !== undefined,
      homeTeam,
      awayTeam,
      ...scoreParts
    });
  }

  return records;
}

function parseTeamCode(block: string, fieldName: "team1" | "team2"): string | undefined {
  const match = block.match(new RegExp(`\\|${fieldName}=\\{\\{#invoke:flag\\|fb(?:-rt)?\\|([A-Z]{3})\\}\\}`, "i"));
  return match?.[1];
}

function parseMatchScore(block: string): string | undefined {
  const scoreLinkMatch = block.match(/\|score=\{\{score link\|[^|]+\|([^}]+)\}\}/i);
  if (scoreLinkMatch) {
    return stripWikiMarkup(scoreLinkMatch[1]);
  }

  const plainScoreMatch = block.match(/\|score=([^\n|]+)/i);
  return plainScoreMatch ? stripWikiMarkup(plainScoreMatch[1]) : undefined;
}

function parseScoreParts(score: string | undefined): { homeScore?: number; awayScore?: number } {
  const match = score?.replace(/[–—]/g, "-").match(/^(\d+)-(\d+)$/);
  if (!match) {
    return {};
  }

  return {
    homeScore: Number(match[1]),
    awayScore: Number(match[2])
  };
}

function parseGoalLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.length > 0 &&
        /\[\[/.test(line) &&
        (/\{\{goal\|/i.test(line) || /(\d+(?:\+\d+)?)'/.test(line) || /\bo\.g\./i.test(line))
    );
}

function resolveNationalTeam(
  detail: GoalDetail,
  groupTeamCode: string | undefined,
  groupTeamName: string,
  homeCode: string | undefined,
  homeTeam: string,
  awayCode: string | undefined,
  awayTeam: string
): string {
  if (detail === "own-goal") {
    if (groupTeamCode && groupTeamCode === homeCode) {
      return awayCode ? (FIFA_COUNTRY_NAMES[awayCode] ?? awayTeam) : awayTeam;
    }

    return homeCode ? (FIFA_COUNTRY_NAMES[homeCode] ?? homeTeam) : homeTeam;
  }

  return groupTeamCode ? (FIFA_COUNTRY_NAMES[groupTeamCode] ?? groupTeamName) : groupTeamName;
}

function buildMatchLabel(homeTeam: string, awayTeam: string, score: string | undefined): string {
  if (score) {
    return `${homeTeam} ${score} ${awayTeam}`;
  }

  return `${homeTeam} vs ${awayTeam}`;
}

function mapWikipediaKickoffToMatch(kickoff: WikipediaMatchKickoff): ExternalMatchRecord {
  const status: MatchStatus = kickoff.finished ? "finished" : "scheduled";
  return {
    source: "wikipedia",
    matchId: `wikipedia:${kickoff.id}`,
    label: kickoff.label,
    kickedOffAt: kickoff.kickedOffAt,
    status,
    homeTeam: {
      name: kickoff.homeTeam,
      score: kickoff.homeScore
    },
    awayTeam: {
      name: kickoff.awayTeam,
      score: kickoff.awayScore
    }
  };
}

export function parseWikipediaFootballBoxes(wikitext: string, pageTitle: string): ExternalGoalRecord[] {
  const records: ExternalGoalRecord[] = [];

  for (const block of extractFootballBoxes(wikitext)) {
    const kickedOffAt = parseMatchDate(block);
    const homeCode = parseTeamCode(block, "team1");
    const awayCode = parseTeamCode(block, "team2");
    const homeTeam = homeCode ? (FIFA_COUNTRY_NAMES[homeCode] ?? homeCode) : "Unknown";
    const awayTeam = awayCode ? (FIFA_COUNTRY_NAMES[awayCode] ?? awayCode) : "Unknown";
    const score = parseMatchScore(block);
    const matchId = `wikipedia:${normalizePlayerName(pageTitle)}:${normalizePlayerName(homeTeam)}-${normalizePlayerName(awayTeam)}:${kickedOffAt ?? "unknown-date"}`;
    const matchLabel = buildMatchLabel(homeTeam, awayTeam, score);

    const goalGroups: Array<{ teamCode: string | undefined; teamName: string; goalsText: string }> = [
      { teamCode: homeCode, teamName: homeTeam, goalsText: getField(block, "goals1") },
      { teamCode: awayCode, teamName: awayTeam, goalsText: getField(block, "goals2") }
    ];

    for (const group of goalGroups) {
      for (const line of parseGoalLines(group.goalsText)) {
        const playerName = parseWikiPlayerName(line);
        if (!playerName) {
          continue;
        }

        for (const parsedGoal of parseGoalsFromLine(line)) {
          const { minute, detail } = parsedGoal;
          const nationalTeam = resolveNationalTeam(
            detail,
            group.teamCode,
            group.teamName,
            homeCode,
            homeTeam,
            awayCode,
            awayTeam
          );

          records.push({
            externalGoalId: `${matchId}:${normalizePlayerName(playerName)}:${minute ?? "unknown"}:${detail}`,
            playerName,
            nationalTeam,
            goals: 1,
            source: "wikipedia",
            matchId,
            matchLabel,
            kickedOffAt,
            minute,
            timeConfidence:
              minute !== undefined ? (kickedOffAt ? "estimated" : "match-only") : kickedOffAt ? "match-only" : "unknown",
            detail
          });
        }
      }
    }
  }

  return records;
}

export function discoverWikipediaGroupPages(wikitext: string): string[] {
  const pages = new Set<string>();
  const patterns = [
    /\[\[(2026 FIFA World Cup Group [A-L])\]\]/g,
    /2026 FIFA World Cup Group [A-L]#/g
  ];

  for (const pattern of patterns) {
    for (const match of wikitext.matchAll(pattern)) {
      const page = match[1] ?? match[0]?.replace(/#$/, "");
      if (page) {
        pages.add(page);
      }
    }
  }

  return [...pages].sort();
}

export function parseWikipediaGoalscorers(wikitext: string, pageTitle: string): ExternalGoalRecord[] {
  const lines = wikitext.split(/\r?\n/);
  const records: ExternalGoalRecord[] = [];
  let inGoalscorers = false;
  let goalscorersHeadingLevel: number | null = null;
  let currentGoals = 0;
  let currentDetail: GoalDetail = "normal";

  for (const line of lines) {
    const headingLevel = getHeadingLevel(line);
    const headingText = getHeadingText(line);

    if (headingText) {
      if (/^goalscorers?$/i.test(headingText)) {
        inGoalscorers = true;
        goalscorersHeadingLevel = headingLevel;
        currentGoals = 0;
        currentDetail = "normal";
        continue;
      }

      if (inGoalscorers && goalscorersHeadingLevel !== null && headingLevel !== null && headingLevel <= goalscorersHeadingLevel) {
        break;
      }
    }

    if (!inGoalscorers) {
      continue;
    }

    const goalCount = parseGoalCountLine(line);
    if (goalCount) {
      currentGoals = goalCount.goals;
      currentDetail = goalCount.detail;
      continue;
    }

    if (!line.trim().startsWith("*") || currentGoals < 1) {
      continue;
    }

    const playerName = parsePlayerLine(line);
    if (!playerName) {
      continue;
    }

    records.push({
      externalGoalId: `wikipedia:${normalizePlayerName(pageTitle)}:${normalizePlayerName(playerName)}:${currentGoals}:${currentDetail}`,
      playerName,
      nationalTeam: "Unknown",
      goals: currentGoals,
      source: "wikipedia",
      matchId: `wikipedia:${normalizePlayerName(pageTitle)}:goalscorers`,
      matchLabel: `${pageTitle} goalscorers`,
      timeConfidence: "unknown",
      detail: currentDetail
    });
  }

  return records;
}

function dedupeGoals(goals: ExternalGoalRecord[]): ExternalGoalRecord[] {
  const seen = new Set<string>();
  const unique: ExternalGoalRecord[] = [];

  for (const goal of goals) {
    if (!goal.externalGoalId || seen.has(goal.externalGoalId)) {
      continue;
    }

    seen.add(goal.externalGoalId);
    unique.push(goal);
  }

  return unique;
}

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

async function fetchWikipediaPages(
  pages: string[],
  env: NodeJS.ProcessEnv = process.env
): Promise<Array<{ title: string; wikitext: string }>> {
  const endpoint = getOptionalEnvValue(env.WIKIPEDIA_API_ENDPOINT) ?? defaultEndpoint;
  const timeoutMs = Number(getOptionalEnvValue(env.WIKIPEDIA_TIMEOUT_MS) ?? 15_000);
  const maxAttempts = Number(getOptionalEnvValue(env.WIKIPEDIA_MAX_ATTEMPTS) ?? 1);
  const batchSize = Number(getOptionalEnvValue(env.WIKIPEDIA_BATCH_SIZE) ?? 12);
  const userAgent =
    getOptionalEnvValue(env.WIKIPEDIA_USER_AGENT) ??
    "wm-2026-panini-liga/0.1 (https://github.com/Wiiii90/paniwi; private hobby project; contact: wilhelmaltemeier@gmail.com)";
  const results: Array<{ title: string; wikitext: string }> = [];

  for (let offset = 0; offset < pages.length; offset += batchSize) {
    const batch = pages.slice(offset, offset + batchSize);
    const url = new URL(endpoint);
    url.searchParams.set("action", "query");
    url.searchParams.set("prop", "revisions");
    url.searchParams.set("rvslots", "main");
    url.searchParams.set("rvprop", "content");
    url.searchParams.set("titles", batch.join("|"));
    url.searchParams.set("format", "json");
    url.searchParams.set("formatversion", "2");
    url.searchParams.set("origin", "*");

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
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
          throw new Error("Wikipedia API returned HTTP 429 (rate limited). Try again in the next sync window.");
        }

        if (!response.ok) {
          throw new Error(`Wikipedia API returned HTTP ${response.status}`);
        }

        const body = (await response.json()) as WikipediaQueryResponse;
        if (body.error) {
          throw new Error(body.error.info ?? body.error.code ?? "Wikipedia API error");
        }

        for (const page of body.query?.pages ?? []) {
          const wikitext = page.revisions?.[0]?.slots?.main?.content;
          if (!page.title || !wikitext || page.missing) {
            continue;
          }

          results.push({ title: page.title, wikitext });
        }

        break;
      } finally {
        clearTimeout(timeout);
      }
    }
  }

  return results;
}

const DEFAULT_2026_GROUP_PAGES = Array.from({ length: 12 }, (_, index) => `2026 FIFA World Cup Group ${String.fromCharCode(65 + index)}`);

function getConfiguredGroupPages(env: NodeJS.ProcessEnv, mainPageTitle: string, tournamentWikitext: string): string[] {
  const configured = env.WIKIPEDIA_GROUP_PAGES?.split(",")
    .map((page) => page.trim())
    .filter(Boolean);

  if (configured && configured.length > 0) {
    return configured;
  }

  const discovered = discoverWikipediaGroupPages(tournamentWikitext);
  const tournamentPage = getOptionalEnvValue(env.WIKIPEDIA_GOALS_PAGE) ?? defaultPage;
  if (/2026 FIFA World Cup/i.test(mainPageTitle) || /2026 FIFA World Cup/i.test(tournamentPage)) {
    return [...new Set([...DEFAULT_2026_GROUP_PAGES, ...discovered])].sort();
  }

  return discovered;
}

export const wikipediaSource: GoalSource = {
  name: "wikipedia",
  async fetchGoals(): Promise<GoalSourceResult> {
    const env = process.env;
    const mainPageName = getOptionalEnvValue(env.WIKIPEDIA_GOALS_PAGE) ?? defaultPage;
    const groupPages = getConfiguredGroupPages(env, mainPageName, "");
    const pagesToFetch = [...new Set([mainPageName, ...groupPages])];
    const fetchedPages = await fetchWikipediaPages(pagesToFetch, env);
    const mainPage = fetchedPages.find((page) => page.title === mainPageName) ?? fetchedPages[0];

    if (!mainPage) {
      throw new Error(`Wikipedia page "${mainPageName}" could not be loaded.`);
    }

    const groupPagesWithContent = fetchedPages.filter((page) => page.title !== mainPage.title);
    const goals = dedupeGoals([
      ...parseWikipediaGoalscorers(mainPage.wikitext, mainPage.title),
      ...groupPagesWithContent.flatMap((page) => parseWikipediaFootballBoxes(page.wikitext, page.title))
    ]);
    const matches = groupPagesWithContent.flatMap((page) =>
      parseWikipediaMatchKickoffs(page.wikitext, page.title).map(mapWikipediaKickoffToMatch)
    );

    if (goals.length === 0) {
      throw new Error(`No goal records found on Wikipedia page "${mainPage.title}" or linked group pages.`);
    }

    return {
      source: "wikipedia",
      fetchedAt: new Date().toISOString(),
      goals,
      matches
    };
  }
};
