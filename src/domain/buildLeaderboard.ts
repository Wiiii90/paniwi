import type { GoalRecord, LeaderboardEntry, ParticipantTeam, PlayerScore, ScoredGoal } from "./types";
import {
  getParticipantPickDisplayName,
  getParticipantPickId,
  getParticipantPickPosition
} from "./participantPick";
import { scoreGoalForPlayer } from "./scoring";
import { getTeamDisplayName } from "./teamDisplay";
import type { RosterSnapshot } from "./rosterTypes";

export function scoreGoalsForTeams(
  teams: ParticipantTeam[],
  goals: GoalRecord[],
  rosterSnapshot?: RosterSnapshot
): ScoredGoal[] {
  return goals.flatMap((goal) =>
    teams.flatMap((team) =>
      team.players.flatMap((player) => {
        const scored = scoreGoalForPlayer(goal, team.owner, player, rosterSnapshot);
        return scored ? [scored] : [];
      })
    )
  );
}

export function buildPlayerScores(
  team: ParticipantTeam,
  scoredGoals: ScoredGoal[],
  rosterSnapshot?: RosterSnapshot
): PlayerScore[] {
  return team.players.map((pick) => {
    const pickId = getParticipantPickId(pick);
    const playerName = getParticipantPickDisplayName(pick, rosterSnapshot);
    const playerGoals = scoredGoals.filter(
      (goal) => goal.owner === team.owner && goal.pickId === pickId
    );

    return {
      pickId,
      name: playerName,
      nationalTeam: getTeamDisplayName(pick.teamId),
      position: getParticipantPickPosition(pick, rosterSnapshot),
      goals: playerGoals.reduce((sum, goal) => sum + goal.goals, 0),
      points: playerGoals.reduce((sum, goal) => sum + goal.points, 0)
    };
  });
}

export function buildLeaderboard(
  teams: ParticipantTeam[],
  goals: GoalRecord[],
  rosterSnapshot?: RosterSnapshot
): LeaderboardEntry[] {
  const scoredGoals = scoreGoalsForTeams(teams, goals, rosterSnapshot);
  const entries = teams.map((team) => {
    const playerScores = buildPlayerScores(team, scoredGoals, rosterSnapshot);
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
