import type { ScoredGoal, ScorerEntry, StaticMeta } from "../../domain/types";
import { SyncSummary } from "../components/SyncSummary";
import { formatGoalMinute, formatTimeConfidence } from "../formatGoal";

type GoalsPageProps = {
  goals: ScoredGoal[];
  scorers: ScorerEntry[];
  meta: StaticMeta;
};

export function GoalsPage({ goals, scorers, meta }: GoalsPageProps) {
  return (
    <section className="page-stack">
      <div className="hero-band">
        <div>
          <p className="eyebrow">Trefferfeed</p>
          <h1>Tore und Torschuetzen</h1>
        </div>
        <strong>{scorers.reduce((sum, scorer) => sum + scorer.goals, 0)} WM-Tore</strong>
      </div>

      <h2>Torschuetzenliste</h2>
      <div className="table-card">
        <div className="table-header scorer-grid">
          <span>Rang</span>
          <span>Spieler</span>
          <span>Land</span>
          <span>Tore</span>
        </div>
        {scorers.length === 0 ? (
          <p className="empty-state">Noch keine Torschuetzendaten im Snapshot.</p>
        ) : (
          scorers.map((scorer) => (
            <div className="scorer-grid player-row" key={`${scorer.normalizedPlayerName}-${scorer.nationalTeam}`}>
              <strong>#{scorer.rank}</strong>
              <span>
                <strong>{scorer.playerName}</strong>
                {scorer.selected ? <small>Panini: {scorer.scoringOwners.join(", ")}</small> : null}
              </span>
              <span>{scorer.nationalTeam}</span>
              <span>{scorer.goals}</span>
            </div>
          ))
        )}
      </div>

      <h2>Punkte-Tore</h2>
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

      <SyncSummary meta={meta} />
    </section>
  );
}
