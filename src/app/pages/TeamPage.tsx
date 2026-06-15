import { teams } from "../../config/teams";
import { buildPlayerScores } from "../../domain/buildLeaderboard";
import type { ScoredGoal } from "../../domain/types";

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
        <h1>Team nicht gefunden</h1>
        <a className="text-link" href={baseUrl}>
          Zurueck zur Tabelle
        </a>
      </section>
    );
  }

  const playerScores = buildPlayerScores(team, goals);
  const teamGoals = goals.filter((goal) => goal.owner === team.owner);

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
      <div className="feed-list">
        {teamGoals.length === 0 ? (
          <p className="muted">Noch keine Treffer.</p>
        ) : (
          teamGoals.map((goal) => (
            <article className="feed-item" key={`${goal.owner}-${goal.pickedPlayerName}-${goal.scoredAt}-${goal.minute}`}>
              <strong>{goal.pickedPlayerName}</strong>
              <span>{goal.matchLabel}</span>
              <span>
                {goal.minute ? `${goal.minute}. Minute` : "Minute offen"} · {goal.points} Punkt · {goal.timeConfidence}
              </span>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
