import { teams } from "../../config/teams";
import { buildPlayerScores } from "../../domain/buildLeaderboard";
import { sortGoalsChronologically } from "../../domain/sortGoals";
import type { ScoredGoal } from "../../domain/types";
import { LinkButton } from "../components/LinkButton";
import { formatGoalMinute, formatTimeConfidence } from "../formatGoal";

type TeamPageProps = {
  owner: string;
  goals: ScoredGoal[];
};

export function TeamPage({ owner, goals }: TeamPageProps) {
  const baseUrl = import.meta.env.BASE_URL;
  const team = teams.find((candidate) => candidate.owner.toLowerCase() === owner.toLowerCase());

  if (!team) {
    return (
      <section className="page-stack">
        <div className="hero-band">
          <div>
            <p className="eyebrow">Teamdetails</p>
            <h1>Team nicht gefunden</h1>
          </div>
        </div>
        <p className="empty-state">Dieses Team ist nicht in der statischen Teamkonfiguration enthalten.</p>
        <LinkButton href={baseUrl}>Zurueck zur Tabelle</LinkButton>
      </section>
    );
  }

  const playerScores = buildPlayerScores(team, goals);
  const teamGoals = sortGoalsChronologically(goals.filter((goal) => goal.owner === team.owner));
  const goalsByPlayer = new Map<string, ScoredGoal[]>();
  for (const goal of teamGoals) {
    const playerGoals = goalsByPlayer.get(goal.pickedPlayerName) ?? [];
    playerGoals.push(goal);
    goalsByPlayer.set(goal.pickedPlayerName, playerGoals);
  }

  return (
    <section className="page-stack">
      <div className="hero-band" style={{ borderColor: team.color }}>
        <div>
          <p className="eyebrow">Teamdetails</p>
          <h1>{team.owner}</h1>
        </div>
        <strong>{playerScores.reduce((sum, player) => sum + player.points, 0)} Pkt.</strong>
      </div>

      <div className="table-card">
        <div className="table-header player-grid">
          <span>Spieler</span>
          <span>Land</span>
          <span>Tore</span>
          <span>Punkte</span>
        </div>
        {playerScores.map((player) => (
          <div className="player-grid player-row" key={player.name}>
            <strong>{player.name}</strong>
            <span>{player.nationalTeam}</span>
            <span>{player.goals}</span>
            <span>{player.points}</span>
          </div>
        ))}
      </div>

      <h2>Treffer dieses Teams</h2>
      <div className="player-history-list">
        {teamGoals.length === 0 ? (
          <p className="empty-state">Noch keine Treffer fuer dieses Team.</p>
        ) : (
          playerScores
            .filter((player) => player.points > 0)
            .map((player) => (
              <section className="player-history" key={player.name}>
                <div className="player-history-header">
                  <strong>{player.name}</strong>
                  <span>
                    {player.goals} Tore · {player.points} Pkt.
                  </span>
                </div>
                <div className="feed-list">
                  {(goalsByPlayer.get(player.name) ?? []).map((goal) => (
                    <article className="feed-item compact-feed-item" key={`${goal.externalGoalId}-${goal.owner}`}>
                      <span>{goal.matchLabel ?? "Spiel offen"}</span>
                      <span>
                        {formatGoalMinute(goal)} · {formatTimeConfidence(goal.timeConfidence)} · {goal.points} Punkt
                      </span>
                    </article>
                  ))}
                </div>
              </section>
            ))
        )}
      </div>
    </section>
  );
}
