import type { LeaderboardEntry, StaticMeta } from "../../domain/types";
import { StatusPill } from "../components/StatusPill";

type LeaderboardPageProps = {
  leaderboard: LeaderboardEntry[];
  meta: StaticMeta;
};

export function LeaderboardPage({ leaderboard, meta }: LeaderboardPageProps) {
  const baseUrl = import.meta.env.BASE_URL;

  return (
    <section className="page-stack">
      <div className="hero-band">
        <div>
          <p className="eyebrow">WM 2026</p>
          <h1>Leaderboard</h1>
        </div>
        <StatusPill meta={meta} />
      </div>

      <div className="leaderboard-list">
        {leaderboard.map((entry) => (
          <a className="leaderboard-row" href={`${baseUrl}team/${encodeURIComponent(entry.owner)}`} key={entry.owner}>
            <span className="rank">#{entry.rank}</span>
            <span className="owner">{entry.owner}</span>
            <span className="small-stat">{entry.playersWithGoals} Spieler</span>
            <strong>{entry.points} Pkt.</strong>
          </a>
        ))}
      </div>
    </section>
  );
}
