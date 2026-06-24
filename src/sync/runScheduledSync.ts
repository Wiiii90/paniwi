import { appendFile, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { getExternalMatchKey } from "../domain/matchIdentity";
import type { ExternalMatchRecord } from "../domain/matchTypes";
import type { StaticMeta } from "../domain/staticMeta";
import { evaluateSyncWindow } from "./evaluateSyncWindow";
import { getApiFootballEnrichmentRequestLimit } from "./sources/apiFootball/config";
import { getUpcomingSyncWindows, syncPolicy } from "./syncSchedule";
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

function getKickoffTimestamp(match: ExternalMatchRecord): number | null {
  const timestamp = match.kickedOffAt ? Date.parse(match.kickedOffAt) : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isPastPostMatchRepairTime(match: ExternalMatchRecord, now: Date): boolean {
  const kickoff = getKickoffTimestamp(match);
  if (kickoff === null) {
    return false;
  }

  const firstPostMatchCheckMinutes = syncPolicy.expectedMatchMinutes + syncPolicy.checkOffsetsAfterExpectedEndMinutes[0];
  return now.getTime() >= kickoff + firstPostMatchCheckMinutes * 60 * 1000;
}

function hasApiFootballEquivalent(match: ExternalMatchRecord, matches: ExternalMatchRecord[]): boolean {
  const matchKey = getExternalMatchKey(match);
  return matches.some((candidate) => candidate.source === "api-football" && getExternalMatchKey(candidate) === matchKey);
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

export function getStaleScheduledFootballDataMatches(after: ExternalMatchRecord[], now = new Date()): ExternalMatchRecord[] {
  return after
    .filter(isFootballDataMatch)
    .filter((match) => match.status === "scheduled")
    .filter((match) => isPastPostMatchRepairTime(match, now))
    .filter((match) => !hasApiFootballEquivalent(match, after))
    .sort(sortMatchesNewestFirst);
}

export function getApiFootballAutoEnrichMatches(
  before: ExternalMatchRecord[],
  after: ExternalMatchRecord[],
  now = new Date()
): ExternalMatchRecord[] {
  const selected: ExternalMatchRecord[] = [];
  const seen = new Set<string>();

  for (const match of [...getNewlyFinishedFootballDataMatches(before, after), ...getStaleScheduledFootballDataMatches(after, now)]) {
    if (!seen.has(match.matchId)) {
      selected.push(match);
      seen.add(match.matchId);
    }
  }

  return selected;
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
  const matches = getApiFootballAutoEnrichMatches(before, after);
  if (matches.length === 0) {
    console.log("API-Football auto-enrich skipped: no newly finished or stale scheduled football-data match.");
    return;
  }

  const previousMatchIds = process.env.API_FOOTBALL_ENRICH_MATCH_IDS;
  const previousRequestLimit = process.env.API_FOOTBALL_ENRICH_MAX_REQUESTS;
  const requestLimit = getApiFootballEnrichmentRequestLimit();
  let requestCount = 0;

  try {
    for (const match of matches) {
      if (requestCount >= requestLimit) {
        console.log(`API-Football auto-enrich stopped: request budget exhausted (${requestCount}/${requestLimit}).`);
        break;
      }

      process.env.API_FOOTBALL_ENRICH_MATCH_IDS = match.matchId;
      process.env.API_FOOTBALL_ENRICH_MAX_REQUESTS = String(requestLimit - requestCount);
      console.log(`API-Football auto-enrich started for ${match.label} (${match.matchId}).`);
      await syncGoals([apiFootballSource], {
        syncWindowId: syncWindowId ? `${syncWindowId}:api-football-enrich:${match.matchId}` : undefined
      });

      const meta = await readCurrentMeta();
      requestCount += meta?.sourceRequestCount ?? 0;
    }
  } finally {
    if (previousMatchIds === undefined) {
      delete process.env.API_FOOTBALL_ENRICH_MATCH_IDS;
    } else {
      process.env.API_FOOTBALL_ENRICH_MATCH_IDS = previousMatchIds;
    }

    if (previousRequestLimit === undefined) {
      delete process.env.API_FOOTBALL_ENRICH_MAX_REQUESTS;
    } else {
      process.env.API_FOOTBALL_ENRICH_MAX_REQUESTS = previousRequestLimit;
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
