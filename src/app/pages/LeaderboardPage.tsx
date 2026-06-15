import type { LeaderboardEntry, StaticMeta } from "../../domain/types";
import { StatusPill } from "../components/StatusPill";
import { SyncSummary } from "../components/SyncSummary";

type LeaderboardPageProps = {
  leaderboard: LeaderboardEntry[];
  meta: StaticMeta;
};

function getLastPlaceOwners(leaderboard: LeaderboardEntry[]): Set<string> {
  if (leaderboard.length === 0) {
    return new Set();
  }

  const minPoints = Math.min(...leaderboard.map((entry) => entry.points));
  return new Set(leaderboard.filter((entry) => entry.points === minPoints).map((entry) => entry.owner));
}

export function LeaderboardPage({ leaderboard, meta }: LeaderboardPageProps) {
  const baseUrl = import.meta.env.BASE_URL;
  const lastPlaceOwners = getLastPlaceOwners(leaderboard);

  return (
    <section className="page-stack">
      <div className="hero-band compact-hero-band">
        <div>
          <p className="eyebrow">Rangliste</p>
          <h1>Tabelle</h1>
        </div>
        <StatusPill meta={meta} />
      </div>

      <div className="leaderboard-list">
        {leaderboard.length === 0 ? (
          <p className="empty-state">Noch keine Teams im Snapshot.</p>
        ) : (
          leaderboard.map((entry) => {
            const hasRedLantern = lastPlaceOwners.has(entry.owner);

            return (
              <a className="leaderboard-row" href={`${baseUrl}team/${encodeURIComponent(entry.owner)}`} key={entry.owner}>
                <span className="rank">#{entry.rank}</span>
                <span className="owner">{entry.owner}</span>
                <span className="small-stat">{entry.playersWithGoals} Spieler</span>
                {hasRedLantern ? <span className="lantern-badge">Rote Laterne</span> : <span className="lantern-spacer" />}
                <strong>{entry.points} Pkt.</strong>
              </a>
            );
          })
        )}
      </div>

      <SyncSummary meta={meta} />
    </section>
  );
}
