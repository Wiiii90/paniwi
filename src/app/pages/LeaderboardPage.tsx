import type { LeaderboardEntry, MatchRecord, ScoredGoal, ScorerEntry, StaticMeta } from "../../domain/types";
import { StatusPill } from "../components/StatusPill";
import { SyncSummary } from "../components/SyncSummary";
import { formatGoalMinute } from "../formatGoal";

type LeaderboardPageProps = {
  leaderboard: LeaderboardEntry[];
  goals: ScoredGoal[];
  scorers: ScorerEntry[];
  matches: MatchRecord[];
  meta: StaticMeta;
};

function formatKickoff(value: string | undefined): string {
  if (!value) {
    return "Termin offen";
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function getLatestMatches(matches: MatchRecord[]): MatchRecord[] {
  return [...matches]
    .sort((a, b) => {
      const aTime = a.kickedOffAt ? new Date(a.kickedOffAt).getTime() : 0;
      const bTime = b.kickedOffAt ? new Date(b.kickedOffAt).getTime() : 0;
      return bTime - aTime || a.label.localeCompare(b.label);
    })
    .slice(0, 3);
}

export function LeaderboardPage({ leaderboard, goals, scorers, matches, meta }: LeaderboardPageProps) {
  const baseUrl = import.meta.env.BASE_URL;
  const latestGoals = goals.slice(-3).reverse();
  const topScorers = scorers.slice(0, 5);
  const latestMatches = getLatestMatches(matches);

  return (
    <section className="page-stack">
      <div className="hero-band">
        <div>
          <p className="eyebrow">WM 2026</p>
          <h1>Leaderboard</h1>
        </div>
        <StatusPill meta={meta} />
      </div>

      <div className="dashboard-grid">
        <section className="summary-card">
          <div className="section-heading">
            <h2>Punkte-Tore</h2>
            <a className="text-link" href={`${baseUrl}goals`}>Alle</a>
          </div>
          <div className="mini-list">
            {latestGoals.length === 0 ? (
              <p className="empty-inline">Noch keine Punkte.</p>
            ) : (
              latestGoals.map((goal) => (
                <a className="mini-row" href={`${baseUrl}team/${encodeURIComponent(goal.owner)}`} key={`${goal.externalGoalId}-${goal.owner}`}>
                  <span>
                    <strong>{goal.displayPlayerName}</strong>
                    <small>{goal.owner} · {goal.displayNationalTeam}</small>
                  </span>
                  <span>{goal.points} Pkt.</span>
                </a>
              ))
            )}
          </div>
        </section>

        <section className="summary-card">
          <div className="section-heading">
            <h2>Top-Torschuetzen</h2>
            <a className="text-link" href={`${baseUrl}goals`}>Liste</a>
          </div>
          <div className="mini-list">
            {topScorers.length === 0 ? (
              <p className="empty-inline">Noch keine Tore.</p>
            ) : (
              topScorers.map((scorer) => (
                <div className="mini-row" key={`${scorer.normalizedPlayerName}-${scorer.nationalTeam}`}>
                  <span>
                    <strong>{scorer.playerName}</strong>
                    <small>{scorer.nationalTeam}</small>
                  </span>
                  <span>{scorer.goals}</span>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="summary-card wide-summary-card">
          <div className="section-heading">
            <h2>Letzte Spiele</h2>
            <a className="text-link" href={`${baseUrl}matches`}>Spielplan</a>
          </div>
          <div className="mini-list">
            {latestMatches.length === 0 ? (
              <p className="empty-inline">Noch keine Spiele.</p>
            ) : (
              latestMatches.map((match) => (
                <a className="mini-row match-mini-row" href={`${baseUrl}matches`} key={match.matchId}>
                  <span>
                    <strong>{match.label}</strong>
                    <small>
                      {formatKickoff(match.kickedOffAt)}
                      {match.pointGoals.length > 0 ? ` · ${match.pointGoals.length} Panini-Tore` : ""}
                    </small>
                  </span>
                  <span>
                    {match.homeTeam.score ?? "-"}:{match.awayTeam.score ?? "-"}
                  </span>
                </a>
              ))
            )}
          </div>
        </section>
      </div>

      {latestGoals.length > 0 ? (
        <section className="summary-card">
          <div className="section-heading">
            <h2>Aktueller Feed</h2>
            <a className="text-link" href={`${baseUrl}goals`}>Treffer</a>
          </div>
          <div className="feed-strip">
            {latestGoals.map((goal) => (
              <article className="feed-chip" key={`feed-${goal.externalGoalId}-${goal.owner}`}>
                <strong>{goal.displayPlayerName}</strong>
                <span>
                  {formatGoalMinute(goal)} · {goal.matchLabel ?? "Spiel offen"}
                </span>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <div className="leaderboard-list">
        {leaderboard.length === 0 ? (
          <p className="empty-state">Noch keine Teams im Snapshot.</p>
        ) : (
          leaderboard.map((entry) => (
            <a className="leaderboard-row" href={`${baseUrl}team/${encodeURIComponent(entry.owner)}`} key={entry.owner}>
              <span className="rank">#{entry.rank}</span>
              <span className="owner">{entry.owner}</span>
              <span className="small-stat">{entry.playersWithGoals} Spieler</span>
              <strong>{entry.points} Pkt.</strong>
            </a>
          ))
        )}
      </div>

      <SyncSummary meta={meta} />
    </section>
  );
}
