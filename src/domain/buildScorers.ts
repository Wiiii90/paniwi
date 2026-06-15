import type { GoalRecord, ParticipantTeam, ScorerEntry } from "./types";
import { getCanonicalTeam, resolveGoalPlayer } from "./canonicalResolver";
import { normalizePlayerName } from "./normalizePlayerName";
import { getGoalPoints } from "./scoring";

type MutableScorer = Omit<ScorerEntry, "rank" | "selected"> & {
  selected: boolean;
};

function getScoringOwners(goal: GoalRecord, teams: ParticipantTeam[]): string[] {
  const resolved = resolveGoalPlayer(goal);
  if (!resolved) {
    return [];
  }

  const owners = teams.flatMap((team) => {
    const picked = team.players.some((pick) => pick.playerId === resolved.playerId);
    return picked ? [team.owner] : [];
  });

  return [...new Set(owners)].sort((a, b) => a.localeCompare(b));
}

export function buildScorers(goals: GoalRecord[], teams: ParticipantTeam[]): ScorerEntry[] {
  const scorers = new Map<string, MutableScorer>();

  for (const goal of goals) {
    if (getGoalPoints(goal) === 0) {
      continue;
    }

    const resolved = resolveGoalPlayer(goal);
    const canonicalTeam = resolved ? getCanonicalTeam(resolved.teamId) : null;
    const playerName = resolved?.displayName ?? goal.playerName;
    const nationalTeam = canonicalTeam?.displayName ?? goal.nationalTeam;
    const normalizedPlayerName = normalizePlayerName(playerName);
    const key = resolved?.playerId ?? `${normalizedPlayerName}|${goal.nationalTeam.toLowerCase()}`;
    const current = scorers.get(key) ?? {
      playerName,
      normalizedPlayerName,
      nationalTeam,
      goals: 0,
      penaltyGoals: 0,
      scoringOwners: [],
      selected: false
    };
    const scoringOwners = getScoringOwners(goal, teams);

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
