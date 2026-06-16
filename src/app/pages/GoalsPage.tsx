import type { ScoredGoal, ScorerEntry } from "../../domain/types";
import { formatGoalMinute, formatTimeConfidence } from "../formatGoal";

type GoalsPageProps = {
  goals: ScoredGoal[];
  scorers: ScorerEntry[];
};

export function GoalsPage({ goals, scorers }: GoalsPageProps) {
  return (
    <section className="page-stack">
      <div className="table-card">
        <div className="table-header scorer-grid">
          <span>Rang</span>
          <span>Spieler</span>
          <span>Land</span>
          <span>Tore</span>
        </div>
        {scorers.length === 0 ? (
          <p className="empty-state">Noch keine Torschützendaten im Snapshot.</p>
        ) : (
          scorers.map((scorer) => (
            <div className="scorer-grid player-row" key={`${scorer.normalizedPlayerName}-${scorer.nationalTeam}`}>
              <strong data-label="Rang">#{scorer.rank}</strong>
              <span>
                <strong>{scorer.playerName}</strong>
                {scorer.selected ? <small>Panini: {scorer.scoringOwners.join(", ")}</small> : null}
              </span>
              <span data-label="Land">{scorer.nationalTeam}</span>
              <span data-label="Tore">{scorer.goals}</span>
            </div>
          ))
        )}
      </div>

      <div className="feed-list">
        {goals.length === 0 ? (
          <p className="empty-state">Noch keine punkterelevanten Treffer im Snapshot.</p>
        ) : (
          goals.map((goal) => (
            <article className="feed-item" key={`${goal.externalGoalId}-${goal.owner}`}>
              <div className="feed-topline">
                <strong>{goal.pickedPlayerName}</strong>
                <span>{goal.points} Pkt.</span>
              </div>
              <span>{goal.owner} · {goal.displayNationalTeam}</span>
              <span>{goal.matchLabel ?? "Spiel offen"}</span>
              <span>
                {formatGoalMinute(goal)} · {formatTimeConfidence(goal.timeConfidence)}
              </span>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
