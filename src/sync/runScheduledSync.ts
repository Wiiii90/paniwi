import { appendFile, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import type { ExternalMatchRecord } from "../domain/matchTypes";
import type { StaticMeta } from "../domain/staticMeta";
import { evaluateSyncWindow } from "./evaluateSyncWindow";
import { getUpcomingSyncWindows } from "./syncSchedule";
import { syncGoals } from "./syncGoals";
import { apiFootballSource } from "./sources/apiFootball/source";

async function readCurrentMeta(): Promise<StaticMeta | null> {
  try {
    const raw = await readFile("public/data/meta.json", "utf8");
    return JSON.parse(raw) as StaticMeta;
  } catch {
    return null;
  }
}

async function readCurrentRawMatches(): Promise<ExternalMatchRecord[]> {
  try {
    const raw = await readFile("public/data/raw-matches.json", "utf8");
    return JSON.parse(raw) as ExternalMatchRecord[];
  } catch {
    return [];
  }
}

function isFootballDataMatch(match: ExternalMatchRecord): boolean {
  return match.source === "football-data" && match.matchId.startsWith("football-data:");
}

function sortMatchesNewestFirst(left: ExternalMatchRecord, right: ExternalMatchRecord): number {
  return (right.kickedOffAt ?? "").localeCompare(left.kickedOffAt ?? "") || left.matchId.localeCompare(right.matchId);
}

export function getNewlyFinishedFootballDataMatches(
  before: ExternalMatchRecord[],
  after: ExternalMatchRecord[]
): ExternalMatchRecord[] {
  const beforeById = new Map(before.filter(isFootballDataMatch).map((match) => [match.matchId, match] as const));
  return after
    .filter(isFootballDataMatch)
    .filter((match) => match.status === "finished" && beforeById.get(match.matchId)?.status !== "finished")
    .sort(sortMatchesNewestFirst);
}

function shouldAutoEnrichApiFootball(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.API_FOOTBALL_AUTO_ENRICH_ON_FINISHED === "false") {
    return false;
  }

  return env.SYNC_SOURCE === "football-data" && Boolean(env.API_FOOTBALL_KEY);
}

async function autoEnrichNewlyFinishedMatches(before: ExternalMatchRecord[], syncWindowId?: string): Promise<void> {
  if (!shouldAutoEnrichApiFootball()) {
    return;
  }

  const after = await readCurrentRawMatches();
  const [match] = getNewlyFinishedFootballDataMatches(before, after);
  if (!match) {
    console.log("API-Football auto-enrich skipped: no newly finished football-data match.");
    return;
  }

  const previousMatchIds = process.env.API_FOOTBALL_ENRICH_MATCH_IDS;
  const previousExtraLimit = process.env.API_FOOTBALL_ENRICH_EXTRA_MATCH_LIMIT;

  try {
    process.env.API_FOOTBALL_ENRICH_MATCH_IDS = match.matchId;
    process.env.API_FOOTBALL_ENRICH_EXTRA_MATCH_LIMIT = "0";
    console.log(`API-Football auto-enrich started for ${match.label} (${match.matchId}).`);
    await syncGoals([apiFootballSource], { syncWindowId: syncWindowId ? `${syncWindowId}:api-football-enrich` : undefined });
  } finally {
    if (previousMatchIds === undefined) {
      delete process.env.API_FOOTBALL_ENRICH_MATCH_IDS;
    } else {
      process.env.API_FOOTBALL_ENRICH_MATCH_IDS = previousMatchIds;
    }

    if (previousExtraLimit === undefined) {
      delete process.env.API_FOOTBALL_ENRICH_EXTRA_MATCH_LIMIT;
    } else {
      process.env.API_FOOTBALL_ENRICH_EXTRA_MATCH_LIMIT = previousExtraLimit;
    }
  }
}

function parseForceFlag(argv: string[]): boolean {
  return argv.includes("--force") || process.env.SYNC_FORCE === "true";
}

async function setGithubOutput(name: string, value: string): Promise<void> {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    return;
  }

  await appendFile(outputPath, `${name}=${value}\n`, "utf8");
}

export async function runScheduledSync(force = parseForceFlag(process.argv)): Promise<boolean> {
  const meta = await readCurrentMeta();
  const decision = evaluateSyncWindow(meta, new Date(), force);

  if (!decision.shouldRun) {
    const upcoming = getUpcomingSyncWindows(new Date(), 3)
      .map((window) => `${window.label} (${window.from})`)
      .join("; ");
    console.log(`Sync skipped: ${decision.reason}`);
    if (upcoming) {
      console.log(`Next windows: ${upcoming}`);
    }
    await setGithubOutput("sync_performed", "false");
    await setGithubOutput("sync_reason", decision.reason);
    return false;
  }

  console.log(`Sync allowed: ${decision.reason}`);
  if (decision.windowPhase) {
    process.env.SYNC_WINDOW_PHASE = decision.windowPhase;
  }
  if (decision.windowFrom) {
    process.env.SYNC_WINDOW_FROM = decision.windowFrom;
  }
  if (decision.windowUntil) {
    process.env.SYNC_WINDOW_UNTIL = decision.windowUntil;
  }
  const rawMatchesBeforeSync = await readCurrentRawMatches();
  await syncGoals(undefined, { syncWindowId: decision.windowId });
  await autoEnrichNewlyFinishedMatches(rawMatchesBeforeSync, decision.windowId);
  await setGithubOutput("sync_performed", "true");
  await setGithubOutput("sync_reason", decision.reason);
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runScheduledSync().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
