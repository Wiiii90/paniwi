import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import type { MatchKickoff } from "./syncSchedule";
import { DEFAULT_2026_GROUP_PAGES, fetchWikipediaPagesForExport } from "./wikipediaExport";

export async function exportMatchKickoffs(): Promise<MatchKickoff[]> {
  const pages = await fetchWikipediaPagesForExport(DEFAULT_2026_GROUP_PAGES);
  const kickoffs: MatchKickoff[] = [];

  for (const page of pages) {
    kickoffs.push(...page.kickoffs);
  }

  const unique = new Map<string, MatchKickoff>();
  for (const kickoff of kickoffs.sort((left, right) => left.kickedOffAt.localeCompare(right.kickedOffAt))) {
    unique.set(kickoff.id, kickoff);
  }

  return [...unique.values()];
}

export async function writeMatchKickoffsFile(kickoffs: MatchKickoff[]): Promise<void> {
  await writeFile("src/config/matchKickoffs.json", `${JSON.stringify(kickoffs, null, 2)}\n`, "utf8");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  exportMatchKickoffs()
    .then(async (kickoffs) => {
      await writeMatchKickoffsFile(kickoffs);
      console.log(`Exported ${kickoffs.length} match kickoffs to src/config/matchKickoffs.json`);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
