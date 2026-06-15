import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { teams } from "../config/teams";
import { getCanonicalPlayer, getCanonicalTeam } from "../domain/canonicalResolver";
import { normalizePlayerName } from "../domain/normalizePlayerName";
import { getTeamDisplayName } from "../domain/teamDisplay";
import type { CanonicalPlayer, RosterStatus } from "../domain/types";
import type { RosterAuditEntry, RosterSnapshot, RosterTeam } from "./rosterTypes";
import { fetchWikipediaRosterPage, parseWikipediaSquads } from "./sources/wikipediaRosterSource";

function getPlayerNameKeys(player: CanonicalPlayer): Set<string> {
  return new Set([player.displayName, ...(player.aliases ?? [])].map(normalizePlayerName));
}

function buildRosterIndex(rosterTeams: RosterTeam[]): Map<string, RosterTeam> {
  const index = new Map<string, RosterTeam>();

  for (const team of rosterTeams) {
    if (team.teamId) {
      index.set(team.teamId, team);
    }
  }

  return index;
}

function findRosterMatch(player: CanonicalPlayer, rosterTeam: RosterTeam): string | undefined {
  const playerKeys = getPlayerNameKeys(player);
  const matchedPlayer = rosterTeam.players.find((rosterPlayer) => playerKeys.has(rosterPlayer.normalizedPlayerName));
  return matchedPlayer?.playerName;
}

export function buildRosterAudit(rosterTeams: RosterTeam[]): RosterAuditEntry[] {
  const rosterByTeamId = buildRosterIndex(rosterTeams);
  const audit: RosterAuditEntry[] = [];

  for (const participantTeam of teams) {
    for (const pick of participantTeam.players) {
      const player = getCanonicalPlayer(pick.playerId);
      if (!player) {
        throw new Error(`Unknown canonical playerId in participant pick: ${pick.playerId}`);
      }

      const team = getCanonicalTeam(player.teamId);
      if (!team) {
        throw new Error(`Unknown canonical teamId for ${player.playerId}: ${player.teamId}`);
      }

      const rosterTeam = rosterByTeamId.get(player.teamId);
      const matchedName = rosterTeam ? findRosterMatch(player, rosterTeam) : undefined;
      const suggestedRosterStatus: RosterStatus = rosterTeam ? (matchedName ? "nominated" : "not-nominated") : "unknown";

      audit.push({
        owner: participantTeam.owner,
        playerId: player.playerId,
        playerName: player.displayName,
        teamId: player.teamId,
        teamName: getTeamDisplayName(team),
        currentRosterStatus: player.rosterStatus,
        suggestedRosterStatus,
        matched: Boolean(matchedName),
        matchedName,
        reason: rosterTeam ? (matchedName ? "found-in-roster" : "not-found-in-team-roster") : "team-roster-missing"
      });
    }
  }

  return audit;
}

export function buildRosterSnapshot(pageTitle: string, rosterTeams: RosterTeam[], now = new Date()): RosterSnapshot {
  const audit = buildRosterAudit(rosterTeams);

  return {
    lastUpdated: now.toISOString(),
    source: "wikipedia",
    pageTitle,
    teamCount: rosterTeams.length,
    playerCount: rosterTeams.reduce((sum, team) => sum + team.players.length, 0),
    teams: rosterTeams,
    audit: {
      picks: audit,
      nominatedCount: audit.filter((entry) => entry.suggestedRosterStatus === "nominated").length,
      notNominatedCount: audit.filter((entry) => entry.suggestedRosterStatus === "not-nominated").length,
      unknownCount: audit.filter((entry) => entry.suggestedRosterStatus === "unknown").length,
      changedStatusCount: audit.filter((entry) => entry.currentRosterStatus !== entry.suggestedRosterStatus).length
    }
  };
}

async function writeRosterSnapshot(snapshot: RosterSnapshot, path = "public/data/rosters.json"): Promise<void> {
  const target = resolve(path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}

export async function syncRosters(): Promise<RosterSnapshot> {
  const page = await fetchWikipediaRosterPage();
  const rosterTeams = parseWikipediaSquads(page.wikitext);
  if (rosterTeams.length === 0) {
    throw new Error(`Wikipedia roster page "${page.title}" did not yield any roster teams.`);
  }

  const snapshot = buildRosterSnapshot(page.title, rosterTeams);
  await writeRosterSnapshot(snapshot);
  return snapshot;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const snapshot = await syncRosters();
    console.log(
      `Wrote public/data/rosters.json from ${snapshot.pageTitle}: ${snapshot.teamCount} teams, ${snapshot.playerCount} players.`
    );
    console.log(
      `Audit: ${snapshot.audit.nominatedCount} nominated, ${snapshot.audit.notNominatedCount} not nominated, ${snapshot.audit.unknownCount} unknown, ${snapshot.audit.changedStatusCount} changed suggestions.`
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
