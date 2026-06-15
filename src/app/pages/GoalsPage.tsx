import type { ScoredGoal, StaticMeta } from "../../domain/types";
import { SyncSummary } from "../components/SyncSummary";

type GoalsPageProps = {
  goals: ScoredGoal[];
  meta: StaticMeta;
};

function formatTimeConfidence(confidence: ScoredGoal["timeConfidence"]): string {
  if (confidence === "exact") {
    return "exakt";
  }

  if (confidence === "estimated") {
    return "geschaetzt";
  }

  if (confidence === "match-only") {
    return "nur Spielzeit";
  }

  return "Zeit offen";
}

export function GoalsPage({ goals, meta }: GoalsPageProps) {
  return (
    <section className="page-stack">
      <div className="hero-band">
        <div>
          <p className="eyebrow">Trefferfeed</p>
          <h1>Alle Punkte-Tore</h1>
        </div>
        <strong>{goals.length} Treffer</strong>
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
              <span>{goal.owner} · {goal.nationalTeam}</span>
              <span>{goal.matchLabel ?? "Spiel offen"}</span>
              <span>
                {goal.minute ? `${goal.minute}. Minute` : "Minute offen"} · {formatTimeConfidence(goal.timeConfidence)}
              </span>
            </article>
          ))
        )}
      </div>

      <SyncSummary meta={meta} />
    </section>
  );
}
