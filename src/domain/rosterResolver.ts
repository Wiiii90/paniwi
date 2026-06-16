import { getCanonicalTeam, resolveGoalPlayer, resolveTeamFromApiFootball, resolveTeamFromWikipedia } from "./canonicalResolver";
import { normalizePlayerName } from "./normalizePlayerName";
import { getTeamDisplayName } from "./teamDisplay";
import type { GoalRecord } from "./types";
import type { RosterPlayer, RosterSnapshot, RosterTeam } from "./rosterTypes";

export type RosterGoalMatch = {
  player: RosterPlayer;
  team: RosterTeam;
  teamId: string;
  displayTeamName: string;
  key: string;
};

function getRosterTeam(snapshot: RosterSnapshot | undefined, teamId: string): RosterTeam | null {
  return snapshot?.teams.find((team) => team.teamId === teamId) ?? null;
}

function getGoalTeamId(goal: GoalRecord): string | null {
  if (goal.teamId) {
    return goal.teamId;
  }

  const team =
    goal.source === "api-football"
      ? resolveTeamFromApiFootball(goal.nationalTeam)
      : resolveTeamFromWikipedia(goal.nationalTeam) ?? resolveTeamFromApiFootball(goal.nationalTeam);

  return team?.teamId ?? null;
}

function getTokens(normalizedName: string): string[] {
  return normalizedName.split(" ").filter(Boolean);
}

function isInitialLastNameMatch(sourceName: string, rosterName: string): boolean {
  const sourceTokens = getTokens(normalizePlayerName(sourceName));
  const rosterTokens = getTokens(rosterName);
  if (sourceTokens.length < 2 || sourceTokens[0].length !== 1 || rosterTokens.length < sourceTokens.length) {
    return false;
  }

  const sourceTail = sourceTokens.slice(1);
  const rosterTail = rosterTokens.slice(-sourceTail.length);
  return rosterTokens[0]?.startsWith(sourceTokens[0]) && sourceTail.every((token, index) => token === rosterTail[index]);
}

function pickUnique(candidates: RosterPlayer[]): RosterPlayer | null {
  return candidates.length === 1 ? candidates[0] : null;
}

function resolveRosterPlayer(goal: GoalRecord, rosterTeam: RosterTeam): RosterPlayer | null {
  const normalizedGoalName = normalizePlayerName(goal.playerName);
  const exactMatch = pickUnique(rosterTeam.players.filter((player) => player.normalizedPlayerName === normalizedGoalName));
  if (exactMatch) {
    return exactMatch;
  }

  return pickUnique(rosterTeam.players.filter((player) => isInitialLastNameMatch(goal.playerName, player.normalizedPlayerName)));
}

export function resolveRosterPlayerForGoal(
  goal: GoalRecord,
  rosterSnapshot: RosterSnapshot | undefined
): RosterGoalMatch | null {
  if (!rosterSnapshot || goal.detail === "own-goal" || goal.detail === "penalty-shootout") {
    return null;
  }

  const teamId = getGoalTeamId(goal);
  if (!teamId) {
    return null;
  }

  const rosterTeam = getRosterTeam(rosterSnapshot, teamId);
  if (!rosterTeam) {
    return null;
  }

  const player = resolveRosterPlayer(goal, rosterTeam);
  if (!player) {
    return null;
  }

  const canonicalTeam = getCanonicalTeam(teamId);
  return {
    player,
    team: rosterTeam,
    teamId,
    displayTeamName: canonicalTeam ? getTeamDisplayName(canonicalTeam) : rosterTeam.teamName,
    key: `roster:${teamId}:${player.normalizedPlayerName}`
  };
}

export function enrichGoalsWithRoster(goals: GoalRecord[], rosterSnapshot: RosterSnapshot | undefined): GoalRecord[] {
  return goals.map((goal) => {
    if (resolveGoalPlayer(goal)) {
      return goal;
    }

    const rosterMatch = resolveRosterPlayerForGoal(goal, rosterSnapshot);
    if (!rosterMatch) {
      return goal;
    }

    return {
      ...goal,
      playerName: rosterMatch.player.playerName,
      teamId: rosterMatch.teamId
    };
  });
}
