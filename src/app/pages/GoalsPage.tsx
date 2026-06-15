import type { ScoredGoal } from "../../domain/types";

type GoalsPageProps = {
  goals: ScoredGoal[];
};

export function GoalsPage({ goals }: GoalsPageProps) {
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
        {goals.map((goal) => (
          <article className="feed-item" key={`${goal.owner}-${goal.pickedPlayerName}-${goal.scoredAt}-${goal.minute}`}>
            <div className="feed-topline">
              <strong>{goal.pickedPlayerName}</strong>
              <span>{goal.points} Pkt.</span>
            </div>
            <span>{goal.owner} · {goal.nationalTeam}</span>
            <span>{goal.matchLabel ?? "Spiel offen"}</span>
            <span>{goal.minute ? `${goal.minute}. Minute` : "Minute offen"}</span>
          </article>
        ))}
      </div>
    </section>
  );
}
