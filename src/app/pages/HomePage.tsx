import { useRef } from "react";
import type { LeaderboardEntry, MatchRecord, ScoredGoal, ScorerEntry } from "../../domain/types";
import { getTodayOrLiveMatches } from "../../domain/matchFilters";
import { formatGoalMinute } from "../formatGoal";

type HomePageProps = {
  leaderboard: LeaderboardEntry[];
  goals: ScoredGoal[];
  scorers: ScorerEntry[];
  matches: MatchRecord[];
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

function formatMatchScore(match: MatchRecord): string {
  if (match.homeTeam.score === undefined || match.awayTeam.score === undefined) {
    return match.status === "scheduled" ? "offen" : "-:-";
  }

  return `${match.homeTeam.score}:${match.awayTeam.score}`;
}

export function HomePage({ leaderboard, goals, scorers, matches }: HomePageProps) {
  const feedStripRef = useRef<HTMLDivElement>(null);
  const feedDragRef = useRef({ isDragging: false, startX: 0, scrollLeft: 0 });
  const baseUrl = import.meta.env.BASE_URL;
  const latestGoals = goals.slice().reverse();
  const latestPointGoals = latestGoals.slice(0, 3);
  const topScorers = scorers.slice(0, 3);
  const tableLeaders = leaderboard.slice(0, 3);
  const liveMatches = matches.filter((match) => match.status === "live");
  const scheduledMatches = getTodayOrLiveMatches(matches).filter((match) => match.status !== "live");
  const currentMatches = [...liveMatches, ...scheduledMatches].slice(0, 3);
  const handleFeedPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch" || !feedStripRef.current) {
      return;
    }

    feedDragRef.current = {
      isDragging: true,
      startX: event.clientX,
      scrollLeft: feedStripRef.current.scrollLeft
    };
    feedStripRef.current.setPointerCapture(event.pointerId);
    feedStripRef.current.classList.add("is-dragging");
  };

  const handleFeedPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!feedDragRef.current.isDragging || !feedStripRef.current) {
      return;
    }

    event.preventDefault();
    const deltaX = event.clientX - feedDragRef.current.startX;
    feedStripRef.current.scrollLeft = feedDragRef.current.scrollLeft - deltaX;
  };

  const stopFeedDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!feedStripRef.current) {
      return;
    }

    feedDragRef.current.isDragging = false;
    feedStripRef.current.classList.remove("is-dragging");
    if (feedStripRef.current.hasPointerCapture(event.pointerId)) {
      feedStripRef.current.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <section className="page-stack">
      <div className="dashboard-grid">
        <a className="summary-card clickable-card" href={`${baseUrl}table`}>
          <div className="section-heading">
            <h2>Tabellenspitze</h2>
          </div>
          {tableLeaders.length > 0 ? (
            <div className="mini-list">
              {tableLeaders.map((entry) => (
                <div className="mini-row" key={entry.owner}>
                  <span>
                    <strong>{entry.rank} {entry.owner}</strong>
                    <small>{entry.goals} Tore · {entry.playersWithGoals} Torschützen</small>
                  </span>
                  <span>{entry.points} Punkte</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-inline">Noch keine Teams.</p>
          )}
        </a>

        <a className="summary-card clickable-card" href={`${baseUrl}goals`}>
          <div className="section-heading">
            <h2>Topspieler</h2>
          </div>
          <div className="mini-list">
            {latestPointGoals.length === 0 ? (
              <p className="empty-inline">Noch keine Punkte.</p>
            ) : (
              latestPointGoals.map((goal) => (
                <div className="mini-row" key={`${goal.externalGoalId}-${goal.owner}`}>
                  <span>
                    <strong>{goal.displayPlayerName} · {goal.displayNationalTeam}</strong>
                    <small>{goal.owner}</small>
                  </span>
                  <span>{goal.points} Punkte</span>
                </div>
              ))
            )}
          </div>
        </a>

        <a className="summary-card clickable-card" href={`${baseUrl}goals`}>
          <div className="section-heading">
            <h2>Torschützenliste</h2>
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
                  <span>{scorer.goals} Tore</span>
                </div>
              ))
            )}
          </div>
        </a>

        <a className="summary-card clickable-card" href={`${baseUrl}matches`}>
          <div className="section-heading">
            <h2>Aktuelle / Kommende Spiele</h2>
          </div>
          <div className="mini-list">
            {currentMatches.length === 0 ? (
              <p className="empty-inline">Keine aktuellen Spiele.</p>
            ) : (
              currentMatches.map((match) => (
                <div className={`mini-row match-mini-row match-mini-row-${match.status}`} key={match.matchId}>
                  <span>
                    <strong>
                      {match.homeTeam.name} - {match.awayTeam.name}
                    </strong>
                    <small>
                      {formatKickoff(match.kickedOffAt)}
                      {match.pointGoals.length > 0 ? ` · ${match.pointGoals.length} Panini-Tore` : ""}
                    </small>
                  </span>
                  <span>{formatMatchScore(match)}</span>
                </div>
              ))
            )}
          </div>
        </a>
      </div>

      {latestGoals.length > 0 ? (
        <section className="summary-card">
          <div className="section-heading">
            <h2>Aktueller Feed</h2>
          </div>
          <div
            className="feed-strip"
            onPointerCancel={stopFeedDrag}
            onPointerDown={handleFeedPointerDown}
            onPointerLeave={stopFeedDrag}
            onPointerMove={handleFeedPointerMove}
            onPointerUp={stopFeedDrag}
            ref={feedStripRef}
          >
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
    </section>
  );
}
