import type { GoalRecord, LeaderboardEntry, ParticipantTeam, PlayerScore, ScoredGoal } from "./types";
import { getCanonicalPlayer, getCanonicalTeam } from "./canonicalResolver";
import { scoreGoalForPlayer } from "./scoring";

export function scoreGoalsForTeams(teams: ParticipantTeam[], goals: GoalRecord[]): ScoredGoal[] {
  return goals.flatMap((goal) =>
    teams.flatMap((team) =>
      team.players.flatMap((player) => {
        const scored = scoreGoalForPlayer(goal, team.owner, player);
        return scored ? [scored] : [];
      })
    )
  );
}

export function buildPlayerScores(team: ParticipantTeam, scoredGoals: ScoredGoal[]): PlayerScore[] {
  return team.players.map((pick) => {
    const player = getCanonicalPlayer(pick.playerId);
    if (!player) {
      throw new Error(`Unknown canonical playerId in team "${team.owner}": ${pick.playerId}`);
    }
    const canonicalTeam = getCanonicalTeam(player.teamId);
    const playerGoals = scoredGoals.filter(
      (goal) => goal.owner === team.owner && goal.playerId === player.playerId
    );

    return {
      name: player.displayName,
      nationalTeam: canonicalTeam?.displayName ?? player.teamId,
      position: player.position,
      rosterStatus: player.rosterStatus,
      rosterNote: pick.rosterNote,
      goals: playerGoals.reduce((sum, goal) => sum + goal.goals, 0),
      points: playerGoals.reduce((sum, goal) => sum + goal.points, 0)
    };
  });
}

export function buildLeaderboard(teams: ParticipantTeam[], goals: GoalRecord[]): LeaderboardEntry[] {
  const scoredGoals = scoreGoalsForTeams(teams, goals);
  const entries = teams.map((team) => {
    const playerScores = buildPlayerScores(team, scoredGoals);
    const points = playerScores.reduce((sum, player) => sum + player.points, 0);
    const goalsTotal = playerScores.reduce((sum, player) => sum + player.goals, 0);

    return {
      rank: 0,
      owner: team.owner,
      points,
      goals: goalsTotal,
      playersWithGoals: playerScores.filter((player) => player.goals > 0).length
    };
  });

  entries.sort((a, b) => b.points - a.points || b.goals - a.goals || a.owner.localeCompare(b.owner));

  let previousPoints: number | null = null;
  let previousRank = 0;
  return entries.map((entry, index) => {
    const rank = entry.points === previousPoints ? previousRank : index + 1;
    previousPoints = entry.points;
    previousRank = rank;
    return { ...entry, rank };
  });
}
