import { appendFile, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import type { StaticMeta } from "../domain/staticMeta";
import { evaluateSyncWindow } from "./evaluateSyncWindow";
import { getUpcomingSyncWindows } from "./syncSchedule";
import { syncGoals } from "./syncGoals";

async function readCurrentMeta(): Promise<StaticMeta | null> {
  try {
    const raw = await readFile("public/data/meta.json", "utf8");
    return JSON.parse(raw) as StaticMeta;
  } catch {
    return null;
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
  await syncGoals(undefined, { syncWindowId: decision.windowId });
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
