import type { LeaderboardEntry } from "../../domain/types";

type LeaderboardPageProps = {
  leaderboard: LeaderboardEntry[];
};

function getLastPlaceOwners(leaderboard: LeaderboardEntry[]): Set<string> {
  if (leaderboard.length === 0) {
    return new Set();
  }

  const minPoints = Math.min(...leaderboard.map((entry) => entry.points));
  return new Set(leaderboard.filter((entry) => entry.points === minPoints).map((entry) => entry.owner));
}

export function LeaderboardPage({ leaderboard }: LeaderboardPageProps) {
  const baseUrl = import.meta.env.BASE_URL;
  const lastPlaceOwners = getLastPlaceOwners(leaderboard);
  const maxPoints = leaderboard.length > 0 ? Math.max(...leaderboard.map((entry) => entry.points)) : 0;
  const jackpotOwners = new Set(leaderboard.filter((entry) => entry.points === maxPoints).map((entry) => entry.owner));

  return (
    <section className="page-stack">
      <div className="leaderboard-list">
        {leaderboard.length === 0 ? (
          <p className="empty-state">Noch keine Teams im Snapshot.</p>
        ) : (
          leaderboard.map((entry) => {
            const hasRedLantern = lastPlaceOwners.has(entry.owner);
            const hasJackpot = jackpotOwners.has(entry.owner);

            return (
              <a className="leaderboard-row" href={`${baseUrl}team/${encodeURIComponent(entry.owner)}`} key={entry.owner}>
                <span className="rank">#{entry.rank}</span>
                <span className="owner">
                  {entry.owner}
                  {hasJackpot ? <img className="award-icon" src={`${baseUrl}assets/money-pot.png`} alt="Geldtopf" /> : null}
                  {hasRedLantern ? <img className="award-icon" src={`${baseUrl}assets/red-lantern.png`} alt="Rote Laterne" /> : null}
                </span>
                <span className="small-stat">{entry.playersWithGoals} Torschützen</span>
                <strong>{entry.points} Pkt.</strong>
              </a>
            );
          })
        )}
      </div>
    </section>
  );
}
