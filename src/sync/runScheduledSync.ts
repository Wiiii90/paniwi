import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import type { StaticMeta } from "../domain/types";
import { evaluateSyncWindow } from "./evaluateSyncWindow";
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

export async function runScheduledSync(force = parseForceFlag(process.argv)): Promise<void> {
  const meta = await readCurrentMeta();
  const decision = evaluateSyncWindow(meta, new Date(), force);

  if (!decision.shouldRun) {
    console.log(`Sync skipped: ${decision.reason}`);
    return;
  }

  console.log(`Sync allowed: ${decision.reason}`);
  await syncGoals(undefined, { syncWindowId: decision.windowId });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runScheduledSync().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
