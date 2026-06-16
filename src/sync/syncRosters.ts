import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { PickStatusSnapshot } from "../domain/pickStatusTypes";
import type { RosterSnapshot, RosterTeam } from "../domain/rosterTypes";
import { buildPickStatusSnapshot, writePickStatusSnapshot } from "./pickStatuses";
import { fetchWikipediaRosterPage, parseWikipediaSquads } from "./sources/wikipediaRosterSource";

export function buildRosterSnapshot(pageTitle: string, rosterTeams: RosterTeam[], now = new Date()): RosterSnapshot {
  return {
    lastUpdated: now.toISOString(),
    source: "wikipedia",
    pageTitle,
    teamCount: rosterTeams.length,
    playerCount: rosterTeams.reduce((sum, team) => sum + team.players.length, 0),
    teams: rosterTeams
  };
}

async function writeRosterSnapshot(snapshot: RosterSnapshot, path = "public/data/rosters.json"): Promise<void> {
  const target = resolve(path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}

async function readOptionalJson<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return undefined;
  }
}

export async function syncRosters(): Promise<{ rosterSnapshot: RosterSnapshot; pickStatusSnapshot: PickStatusSnapshot }> {
  const page = await fetchWikipediaRosterPage();
  const rosterTeams = parseWikipediaSquads(page.wikitext);
  if (rosterTeams.length === 0) {
    throw new Error(`Wikipedia roster page "${page.title}" did not yield any roster teams.`);
  }

  const rosterSnapshot = buildRosterSnapshot(page.title, rosterTeams);
  const previousPickStatusSnapshot = await readOptionalJson<PickStatusSnapshot>("public/data/pick-statuses.json");
  const pickStatusSnapshot = buildPickStatusSnapshot(rosterSnapshot, { previousSnapshot: previousPickStatusSnapshot });
  await Promise.all([writeRosterSnapshot(rosterSnapshot), writePickStatusSnapshot(pickStatusSnapshot)]);
  return { rosterSnapshot, pickStatusSnapshot };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { rosterSnapshot, pickStatusSnapshot } = await syncRosters();
    console.log(
      `Wrote public/data/rosters.json from ${rosterSnapshot.pageTitle}: ${rosterSnapshot.teamCount} teams, ${rosterSnapshot.playerCount} players.`
    );
    console.log(
      `Pick statuses: ${pickStatusSnapshot.summary.nominatedCount} nominated, ${pickStatusSnapshot.summary.notNominatedCount} not nominated, ${pickStatusSnapshot.summary.lateCallupCount} late callups, ${pickStatusSnapshot.summary.unknownCount} unknown.`
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
