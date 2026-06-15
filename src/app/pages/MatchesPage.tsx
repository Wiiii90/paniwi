import type { MatchRecord } from "../../domain/types";
import { formatGoalMinute } from "../formatGoal";

type MatchesPageProps = {
  matches: MatchRecord[];
};

function formatKickoff(value: string | undefined): string {
  if (!value) {
    return "Termin offen";
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatStatus(status: MatchRecord["status"]): string {
  if (status === "finished") {
    return "Beendet";
  }

  if (status === "live") {
    return "Live";
  }

  if (status === "scheduled") {
    return "Geplant";
  }

  return "Daten offen";
}

export function MatchesPage({ matches }: MatchesPageProps) {
  return (
    <section className="page-stack">
      <div className="hero-band">
        <div>
          <p className="eyebrow">Spielplan</p>
          <h1>Spiele</h1>
        </div>
        <strong>{matches.length} Spiele</strong>
      </div>

      <div className="match-list">
        {matches.length === 0 ? (
          <p className="empty-state">Noch keine Spiele im Snapshot.</p>
        ) : (
          matches.map((match) => (
            <article className="match-card" key={match.matchId}>
              <div className="match-card-header">
                <span>{formatKickoff(match.kickedOffAt)}</span>
                <strong>{formatStatus(match.status)}</strong>
              </div>
              <div className={`match-scoreline match-scoreline-${match.status}`}>
                <span>{match.homeTeam.name}</span>
                <strong>
                  {match.homeTeam.score ?? "-"}:{match.awayTeam.score ?? "-"}
                </strong>
                <span>{match.awayTeam.name}</span>
              </div>
              <div className="match-goals">
                {match.goals.length === 0 ? (
                  <span>Keine Treffer im Snapshot.</span>
                ) : (
                  match.goals.map((goal) => (
                    <span key={goal.externalGoalId}>
                      {formatGoalMinute(goal)} {goal.playerName}
                    </span>
                  ))
                )}
              </div>
              {match.affectedOwners.length > 0 ? (
                <p className="match-impact">Panini-Punkte fuer {match.affectedOwners.join(", ")}</p>
              ) : null}
            </article>
          ))
        )}
      </div>
    </section>
  );
}
