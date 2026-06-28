import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { participantTeams as defaultParticipantTeams } from "../config/teams";
import { findUniqueRosterPlayer } from "../domain/rosterNameMatcher";
import { getParticipantPickCandidateNames, getParticipantPickId } from "../domain/participantPick";
import { getTeamDisplayName } from "../domain/teamDisplay";
import { buildTeamTournamentStatusSnapshot } from "../domain/tournamentStatus";
import type { MatchRecord } from "../domain/matchTypes";
import type { ParticipantTeam } from "../domain/participantTypes";
import type { PickDisplayStatus, PickStatusEntry, PickStatusSnapshot } from "../domain/pickStatusTypes";
import type { PlayerPosition, RosterSnapshot, RosterStatus, RosterTeam } from "../domain/rosterTypes";

function getRosterTeamIndex(rosterSnapshot: RosterSnapshot): Map<string, RosterTeam> {
  const index = new Map<string, RosterTeam>();

  for (const team of rosterSnapshot.teams) {
    if (team.teamId) {
      index.set(team.teamId, team);
    }
  }

  return index;
}

function getCurrentRosterMatch(
  participantPick: ParticipantTeam["players"][number],
  rosterTeam: RosterTeam | undefined
): { status: RosterStatus; matchedName?: string; position?: PlayerPosition } {
  if (!rosterTeam) {
    return { status: "unknown" };
  }

  const matchedPlayer = findUniqueRosterPlayer(rosterTeam.players, getParticipantPickCandidateNames(participantPick));
  if (!matchedPlayer) {
    return { status: "not-nominated" };
  }

  return {
    status: "nominated",
    matchedName: matchedPlayer.playerName,
    position: matchedPlayer.position === "unknown" ? undefined : matchedPlayer.position
  };
}

function getPreviousEntryIndex(previousSnapshot?: PickStatusSnapshot): Map<string, PickStatusEntry> {
  const index = new Map<string, PickStatusEntry>();

  for (const entry of previousSnapshot?.picks ?? []) {
    index.set(`${entry.owner}:${entry.pickId}`, entry);
  }

  return index;
}

function resolveDisplayStatus(
  previousEntry: PickStatusEntry | undefined,
  baselineRosterStatus: RosterStatus,
  currentRosterStatus: RosterStatus
): PickDisplayStatus {
  if (previousEntry?.displayStatus === "late-callup") {
    return "late-callup";
  }

  if (baselineRosterStatus === "not-nominated" && currentRosterStatus === "nominated") {
    return "late-callup";
  }

  if (baselineRosterStatus === "nominated") {
    return "nominated";
  }

  if (baselineRosterStatus === "not-nominated") {
    return "not-nominated";
  }

  return currentRosterStatus;
}

function resolveReason(displayStatus: PickDisplayStatus, currentRosterStatus: RosterStatus): PickStatusEntry["reason"] {
  if (displayStatus === "late-callup") {
    return "late-callup";
  }

  if (currentRosterStatus === "nominated") {
    return "found-in-current-roster";
  }

  if (currentRosterStatus === "not-nominated") {
    return "not-found-in-current-team-roster";
  }

  return "team-roster-missing";
}

export function buildPickStatusSnapshot(
  rosterSnapshot: RosterSnapshot,
  options: {
    participantTeams?: ParticipantTeam[];
    previousSnapshot?: PickStatusSnapshot;
    matches?: MatchRecord[];
    now?: Date;
  } = {}
): PickStatusSnapshot {
  const participantTeams = options.participantTeams ?? defaultParticipantTeams;
  const previousSnapshot = options.previousSnapshot;
  const now = options.now ?? new Date();
  const rosterTeamIndex = getRosterTeamIndex(rosterSnapshot);
  const previousEntryIndex = getPreviousEntryIndex(previousSnapshot);
  const tournamentStatusSnapshot = buildTeamTournamentStatusSnapshot(options.matches, rosterSnapshot);
  const tournamentStatusByTeamId = new Map(tournamentStatusSnapshot.teams.map((team) => [team.teamId, team] as const));

  const picks = participantTeams.flatMap((participantTeam) =>
    participantTeam.players.map((pick) => {
      const pickId = getParticipantPickId(pick);
      const currentMatch = getCurrentRosterMatch(pick, rosterTeamIndex.get(pick.teamId));
      const previousEntry = previousEntryIndex.get(`${participantTeam.owner}:${pickId}`);
      const baselineRosterStatus = previousEntry?.baselineRosterStatus ?? currentMatch.status;
      const displayStatus = resolveDisplayStatus(previousEntry, baselineRosterStatus, currentMatch.status);
      const tournamentStatus = tournamentStatusByTeamId.get(pick.teamId);
      const position = currentMatch.position ?? pick.position;

      return {
        owner: participantTeam.owner,
        pickId,
        playerName: pick.playerName,
        teamId: pick.teamId,
        teamName: getTeamDisplayName(pick.teamId),
        ...(position ? { position } : {}),
        baselineRosterStatus,
        currentRosterStatus: currentMatch.status,
        displayStatus,
        tournamentStatus: tournamentStatus?.status ?? "unknown",
        tournamentStatusReason: tournamentStatus?.reason ?? "knockout-field-incomplete",
        matchedCurrentRoster: Boolean(currentMatch.matchedName),
        ...(currentMatch.matchedName ? { matchedCurrentRosterName: currentMatch.matchedName } : {}),
        reason: resolveReason(displayStatus, currentMatch.status)
      } satisfies PickStatusEntry;
    })
  );

  return {
    lastUpdated: now.toISOString(),
    rosterSnapshotUpdatedAt: rosterSnapshot.lastUpdated,
    picks,
    summary: {
      nominatedCount: picks.filter((entry) => entry.displayStatus === "nominated").length,
      notNominatedCount: picks.filter((entry) => entry.displayStatus === "not-nominated").length,
      lateCallupCount: picks.filter((entry) => entry.displayStatus === "late-callup").length,
      unknownCount: picks.filter((entry) => entry.displayStatus === "unknown").length,
      activeCount: picks.filter((entry) => entry.tournamentStatus === "active").length,
      eliminatedCount: picks.filter((entry) => entry.tournamentStatus === "eliminated").length,
      tournamentUnknownCount: picks.filter((entry) => entry.tournamentStatus === "unknown").length
    }
  };
}

export async function writePickStatusSnapshot(
  snapshot: PickStatusSnapshot,
  path = "public/data/pick-statuses.json"
): Promise<void> {
  const target = resolve(path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}
