import { buildPlayerId } from "./playerId";
import { findUniqueRosterPlayer } from "./rosterNameMatcher";
import { getTeamDisplayName } from "./teamDisplay";
import { resolveGoalTeamId, resolveTeamFromApiFootball, resolveTeamFromWikipedia } from "./teamResolver";
import type { SourceName } from "./types";
import type { GoalRecord } from "./types";
import type { RosterPlayer, RosterSnapshot, RosterTeam } from "./rosterTypes";

export type RosterGoalMatch = {
  player: RosterPlayer;
  team: RosterTeam;
  teamId: string;
  displayTeamName: string;
  playerId: string;
};

type EnrichGoalsWithRosterOptions = {
  strictSources?: SourceName[];
};

function getRosterTeam(snapshot: RosterSnapshot | undefined, teamId: string): RosterTeam | null {
  return snapshot?.teams.find((team) => team.teamId === teamId) ?? null;
}

function parseMatchLabelTeams(matchLabel: string | undefined): string[] {
  if (!matchLabel) {
    return [];
  }

  const scoreMatch = matchLabel.match(/^(.*?)\s+\d+\s*-\s*\d+\s+(.*?)$/);
  if (scoreMatch) {
    return [scoreMatch[1].trim(), scoreMatch[2].trim()].filter(Boolean);
  }

  const versusMatch = matchLabel.match(/^(.*?)\s+vs\s+(.*?)$/i);
  if (versusMatch) {
    return [versusMatch[1].trim(), versusMatch[2].trim()].filter(Boolean);
  }

  return [];
}

function getOwnGoalCandidateTeams(goal: GoalRecord, rosterSnapshot: RosterSnapshot, beneficiaryTeamId: string): RosterTeam[] {
  const candidateTeams: RosterTeam[] = [];

  for (const teamName of parseMatchLabelTeams(goal.matchLabel)) {
    const resolvedTeam =
      goal.source === "api-football"
        ? resolveTeamFromApiFootball(teamName)
        : resolveTeamFromWikipedia(teamName) ?? resolveTeamFromApiFootball(teamName);

    if (!resolvedTeam?.teamId || resolvedTeam.teamId === beneficiaryTeamId) {
      continue;
    }

    const rosterTeam = getRosterTeam(rosterSnapshot, resolvedTeam.teamId);
    if (rosterTeam) {
      candidateTeams.push(rosterTeam);
    }
  }

  return candidateTeams;
}

function resolveRosterPlayer(goal: GoalRecord, rosterTeam: RosterTeam): RosterPlayer | null {
  return findUniqueRosterPlayer(rosterTeam.players, [goal.playerName]);
}

export function resolveRosterPlayerForGoal(
  goal: GoalRecord,
  rosterSnapshot: RosterSnapshot | undefined
): RosterGoalMatch | null {
  if (!rosterSnapshot) {
    return null;
  }

  const teamId = resolveGoalTeamId(goal);
  if (!teamId) {
    return null;
  }

  const rosterTeam = getRosterTeam(rosterSnapshot, teamId);
  const player = rosterTeam ? resolveRosterPlayer(goal, rosterTeam) : null;
  if (player && rosterTeam) {
    return {
      player,
      team: rosterTeam,
      teamId,
      displayTeamName: getTeamDisplayName(teamId, rosterTeam.teamName),
      playerId: buildPlayerId(teamId, player.playerName)
    };
  }

  if (goal.detail !== "own-goal") {
    return null;
  }

  const ownGoalMatches = getOwnGoalCandidateTeams(goal, rosterSnapshot, teamId)
    .map((candidateTeam) => {
      const ownGoalPlayer = resolveRosterPlayer(goal, candidateTeam);
      if (!ownGoalPlayer || !candidateTeam.teamId) {
        return null;
      }

      return {
        player: ownGoalPlayer,
        team: candidateTeam,
        teamId: candidateTeam.teamId,
        displayTeamName: getTeamDisplayName(candidateTeam.teamId, candidateTeam.teamName),
        playerId: buildPlayerId(candidateTeam.teamId, ownGoalPlayer.playerName)
      } satisfies RosterGoalMatch;
    })
    .filter((match): match is RosterGoalMatch => Boolean(match));

  return ownGoalMatches.length === 1 ? ownGoalMatches[0] : null;
}

function describeGoal(goal: GoalRecord): string {
  const matchLabel = goal.matchLabel ?? goal.matchId ?? goal.fixtureId ?? "unbekanntes Spiel";
  return `${goal.playerName} (${goal.nationalTeam}) in ${matchLabel}`;
}

export function enrichGoalsWithRoster(
  goals: GoalRecord[],
  rosterSnapshot: RosterSnapshot | undefined,
  options: EnrichGoalsWithRosterOptions = {}
): GoalRecord[] {
  const strictSources = new Set(options.strictSources ?? []);
  const unmatchedGoals: string[] = [];
  const enrichedGoals = goals.map((goal) => {
    const rosterMatch = resolveRosterPlayerForGoal(goal, rosterSnapshot);
    if (!rosterMatch) {
      if (strictSources.has(goal.source)) {
        unmatchedGoals.push(describeGoal(goal));
      }
      return goal;
    }

    return {
      ...goal,
      playerId: rosterMatch.playerId,
      playerName: rosterMatch.player.playerName,
      nationalTeam: rosterMatch.team.teamName,
      teamId: rosterMatch.teamId
    };
  });

  if (unmatchedGoals.length > 0) {
    throw new Error(
      `Roster-Match fehlgeschlagen fuer ${unmatchedGoals.length} ${unmatchedGoals.length === 1 ? "Torschuetzen" : "Torschuetzen"}: ${unmatchedGoals.join("; ")}`
    );
  }

  return enrichedGoals;
}
