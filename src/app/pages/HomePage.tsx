import type { LeaderboardEntry, MatchRecord, ScoredGoal, ScorerEntry } from "../../domain/types";
import { getLiveAndUpcomingMatches } from "../../domain/matchFilters";
import { GoalFeedStrip } from "../components/GoalFeedStrip";

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
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatMatchScore(match: MatchRecord): string {
  if (match.homeTeam.score === undefined || match.awayTeam.score === undefined) {
    return match.status === "scheduled" ? "offen" : "-:-";
  }

  return `${match.homeTeam.score}:${match.awayTeam.score}`;
}

function formatMatchImpact(match: MatchRecord): string | null {
  const selectedParticipants = match.participants.filter((participant) => participant.selected && participant.owners.length > 0);
  if (selectedParticipants.length === 0) {
    return null;
  }

  const visibleParticipants = selectedParticipants.slice(0, 2).map((participant) => `${participant.owners.join("/")} · ${participant.displayPlayerName}`);
  const remainingCount = selectedParticipants.length - visibleParticipants.length;
  return remainingCount > 0 ? `${visibleParticipants.join(" · ")} · +${remainingCount}` : visibleParticipants.join(" · ");
}

export function HomePage({ leaderboard, goals, scorers, matches }: HomePageProps) {
  const baseUrl = import.meta.env.BASE_URL;
  const latestGoals = goals.slice().reverse();
  const latestPointGoals = latestGoals.slice(0, 3);
  const topScorers = scorers.slice(0, 3);
  const tableLeaders = leaderboard.slice(0, 3);
  const currentMatches = getLiveAndUpcomingMatches(matches, new Date(), 3);
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
                    <strong>{entry.owner}</strong>
                    <small>{entry.playersWithGoals} Torschützen</small>
                  </span>
                  <span>{entry.rank}. Platz</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-inline">Noch keine Teams.</p>
          )}
        </a>

        <a className="summary-card clickable-card" href={`${baseUrl}goals?besitzer=1`}>
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

        <a className="summary-card clickable-card" href={`${baseUrl}goals?alle=1`}>
          <div className="section-heading">
            <h2>Torjäger</h2>
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
              currentMatches.map((match) => {
                const matchImpact = formatMatchImpact(match);
                return (
                  <div className={`mini-row match-mini-row match-mini-row-${match.status}`} key={match.matchId}>
                    <span>
                      <strong className="match-name-line">
                        {match.status === "live" ? (
                          <span className="live-chip">
                            <span aria-hidden="true" className="live-dot" />
                            <span className="live-chip-text">Live</span>
                          </span>
                        ) : null}
                        <span className="match-name-text">
                          {match.homeTeam.name} - {match.awayTeam.name}
                        </span>
                      </strong>
                      <small>
                        {formatKickoff(match.kickedOffAt)}
                        {match.pointGoals.length > 0 ? ` · ${match.pointGoals.length} Panini-Tore` : ""}
                      </small>
                      {matchImpact ? <small className="match-impact-line">{matchImpact}</small> : null}
                    </span>
                    <span className="match-mini-score">{formatMatchScore(match)}</span>
                  </div>
                );
              })
            )}
          </div>
        </a>
      </div>

      <GoalFeedStrip goals={latestGoals} matches={matches} title="Aktueller Feed" />
    </section>
  );
}
