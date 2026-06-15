import type { GoalSource, GoalSourceResult } from "./types";
import type { ExternalGoalRecord, GoalDetail } from "../../domain/types";
import { normalizePlayerName } from "../../domain/normalizePlayerName";

type WikipediaParseResponse = {
  parse?: {
    title?: string;
    wikitext?: string;
  };
  error?: {
    code?: string;
    info?: string;
  };
};

const defaultEndpoint = "https://en.wikipedia.org/w/api.php";
const defaultPage = "2026 FIFA World Cup";

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

  return clean.replace(/\s+\(.+?\)$/g, "").trim();
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

async function fetchWikipediaWikitext(env: NodeJS.ProcessEnv = process.env): Promise<{ title: string; wikitext: string }> {
  const endpoint = env.WIKIPEDIA_API_ENDPOINT ?? defaultEndpoint;
  const page = env.WIKIPEDIA_GOALS_PAGE ?? defaultPage;
  const timeoutMs = Number(env.WIKIPEDIA_TIMEOUT_MS ?? 10_000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const url = new URL(endpoint);
  url.searchParams.set("action", "parse");
  url.searchParams.set("page", page);
  url.searchParams.set("prop", "wikitext");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  url.searchParams.set("origin", "*");

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "wm-2026-panini-liga/0.1 (private static sync script)"
      }
    });

    if (!response.ok) {
      throw new Error(`Wikipedia API returned HTTP ${response.status}`);
    }

    const body = (await response.json()) as WikipediaParseResponse;
    if (body.error) {
      throw new Error(body.error.info ?? body.error.code ?? "Wikipedia API error");
    }

    if (!body.parse?.wikitext) {
      throw new Error("Wikipedia response did not include wikitext.");
    }

    return {
      title: body.parse.title ?? page,
      wikitext: body.parse.wikitext
    };
  } finally {
    clearTimeout(timeout);
  }
}

export const wikipediaSource: GoalSource = {
  name: "wikipedia",
  async fetchGoals(): Promise<GoalSourceResult> {
    const page = await fetchWikipediaWikitext();
    const goals = parseWikipediaGoalscorers(page.wikitext, page.title);

    if (goals.length === 0) {
      throw new Error(`No goalscorer records found on Wikipedia page "${page.title}".`);
    }

    return {
      source: "wikipedia",
      fetchedAt: new Date().toISOString(),
      goals
    };
  }
};
