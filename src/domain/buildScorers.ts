import type { GoalRecord, ScorerEntry } from "./goalTypes";
import type { ParticipantTeam } from "./participantTypes";
import { matchesParticipantPickGoal } from "./participantPick";
import { normalizePlayerName } from "./normalizePlayerName";
import { resolveRosterPlayerForGoal } from "./rosterResolver";
import { getGoalPoints } from "./scoring";
import { getTeamDisplayName, resolveTeamDisplayName } from "./teamDisplay";
import type { RosterSnapshot } from "./rosterTypes";

type MutableScorer = Omit<ScorerEntry, "rank" | "selected"> & {
  selected: boolean;
};

type ScorerIdentity = {
  key: string;
  playerName: string;
  normalizedPlayerName: string;
  nationalTeam: string;
};

function getScorerIdentity(goal: GoalRecord, rosterSnapshot?: RosterSnapshot): ScorerIdentity {
  const rosterMatch = goal.playerId && goal.teamId ? null : resolveRosterPlayerForGoal(goal, rosterSnapshot);
  const playerName = goal.playerId ? goal.playerName : rosterMatch?.player.playerName ?? goal.playerName;
  const nationalTeam = goal.teamId
    ? getTeamDisplayName(goal.teamId)
    : rosterMatch?.displayTeamName ?? resolveTeamDisplayName(goal.nationalTeam, goal.source);
  const normalizedPlayerName = normalizePlayerName(playerName);
  const key = goal.playerId ?? rosterMatch?.playerId ?? `${normalizedPlayerName}|${goal.nationalTeam.toLowerCase()}`;

  return {
    key,
    playerName,
    normalizedPlayerName,
    nationalTeam
  };
}

function getScoringOwners(goal: GoalRecord, teams: ParticipantTeam[], rosterSnapshot?: RosterSnapshot): string[] {
  return [...new Set(
    teams.flatMap((team) =>
      team.players.some((pick) => matchesParticipantPickGoal(goal, pick, rosterSnapshot)) ? [team.owner] : []
    )
  )].sort((a, b) => a.localeCompare(b));
}

function buildScoringOwnersByKey(goals: GoalRecord[], teams: ParticipantTeam[], rosterSnapshot?: RosterSnapshot): Map<string, string[]> {
  const ownersByKey = new Map<string, string[]>();

  for (const goal of goals) {
    if (getGoalPoints(goal) === 0) {
      continue;
    }

    const { key } = getScorerIdentity(goal, rosterSnapshot);
    const owners = getScoringOwners(goal, teams, rosterSnapshot);
    ownersByKey.set(key, [...new Set([...(ownersByKey.get(key) ?? []), ...owners])].sort((a, b) => a.localeCompare(b)));
  }

  return ownersByKey;
}

export function buildScorers(
  goals: GoalRecord[],
  teams: ParticipantTeam[],
  rosterSnapshot?: RosterSnapshot,
  scoringGoals: GoalRecord[] = goals
): ScorerEntry[] {
  const scorers = new Map<string, MutableScorer>();
  const scoringOwnersByKey = buildScoringOwnersByKey(scoringGoals, teams, rosterSnapshot);

  for (const goal of goals) {
    if (getGoalPoints(goal) === 0) {
      continue;
    }

    const { key, playerName, normalizedPlayerName, nationalTeam } = getScorerIdentity(goal, rosterSnapshot);
    const current = scorers.get(key) ?? {
      playerName,
      normalizedPlayerName,
      nationalTeam,
      goals: 0,
      penaltyGoals: 0,
      scoringOwners: [],
      selected: false
    };
    const scoringOwners = scoringOwnersByKey.get(key) ?? [];

    current.goals += goal.goals;
    current.penaltyGoals += goal.detail === "penalty" ? goal.goals : 0;
    current.scoringOwners = [...new Set([...current.scoringOwners, ...scoringOwners])].sort((a, b) =>
      a.localeCompare(b)
    );
    current.selected = current.selected || scoringOwners.length > 0;
    scorers.set(key, current);
  }

  const sorted = [...scorers.values()].sort(
    (a, b) => b.goals - a.goals || a.playerName.localeCompare(b.playerName) || a.nationalTeam.localeCompare(b.nationalTeam)
  );

  let previousGoals: number | null = null;
  let previousRank = 0;
  return sorted.map((entry, index) => {
    const rank = entry.goals === previousGoals ? previousRank : index + 1;
    previousGoals = entry.goals;
    previousRank = rank;
    return { ...entry, rank };
  });
}
