import { useState } from "react";
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

function sortByKickoffAscending(left: MatchRecord, right: MatchRecord): number {
  return new Date(left.kickedOffAt ?? "9999-12-31").getTime() - new Date(right.kickedOffAt ?? "9999-12-31").getTime();
}

function sortByKickoffDescending(left: MatchRecord, right: MatchRecord): number {
  return new Date(right.kickedOffAt ?? "0001-01-01").getTime() - new Date(left.kickedOffAt ?? "0001-01-01").getTime();
}

function formatScore(match: MatchRecord): string {
  if (match.homeTeam.score === undefined || match.awayTeam.score === undefined) {
    return "-:-";
  }

  return `${match.homeTeam.score}:${match.awayTeam.score}`;
}

type MatchSectionProps = {
  title: string;
  emptyText: string;
  matches: MatchRecord[];
  expanded: boolean;
  onToggle: () => void;
};

function MatchSection({ title, emptyText, matches, expanded, onToggle }: MatchSectionProps) {
  const visibleMatches = expanded ? matches : matches.slice(0, 3);
  const hiddenCount = matches.length - visibleMatches.length;

  return (
    <section className="match-section">
      <div className="section-heading">
        <h2>{title}</h2>
        <span className="muted">{matches.length}</span>
      </div>
      <div className="match-list">
        {visibleMatches.length === 0 ? (
          <p className="empty-state">{emptyText}</p>
        ) : (
          visibleMatches.map((match) => (
            <article className={`match-card match-card-${match.status}`} key={match.matchId}>
              <div className="match-card-header">
                <span>{formatKickoff(match.kickedOffAt)}</span>
                <strong>{formatStatus(match.status)}</strong>
              </div>
              <div className="match-scoreline">
                <span>{match.homeTeam.name}</span>
                <strong>{formatScore(match)}</strong>
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
                <p className="match-impact">Panini-Punkte für {match.affectedOwners.join(", ")}</p>
              ) : null}
            </article>
          ))
        )}
      </div>
      {matches.length > 3 ? (
        <button className="plain-button" type="button" onClick={onToggle}>
          {expanded ? "Weniger anzeigen" : `${hiddenCount} weitere anzeigen`}
        </button>
      ) : null}
    </section>
  );
}

export function MatchesPage({ matches }: MatchesPageProps) {
  const [expandedSections, setExpandedSections] = useState({
    live: false,
    upcoming: false,
    finished: false
  });
  const liveMatches = matches.filter((match) => match.status === "live").sort(sortByKickoffAscending);
  const upcomingMatches = matches.filter((match) => match.status === "scheduled").sort(sortByKickoffAscending);
  const finishedMatches = matches.filter((match) => match.status === "finished").sort(sortByKickoffDescending);
  const allExpanded = expandedSections.live && expandedSections.upcoming && expandedSections.finished;

  function toggleSection(section: keyof typeof expandedSections): void {
    setExpandedSections((current) => ({ ...current, [section]: !current[section] }));
  }

  function toggleAll(): void {
    setExpandedSections({
      live: !allExpanded,
      upcoming: !allExpanded,
      finished: !allExpanded
    });
  }

  return (
    <section className="page-stack">
      <div className="hero-band">
        <div>
          <p className="eyebrow">WM 2026</p>
          <h1>Spielplan</h1>
        </div>
        <button className="hero-action" type="button" onClick={toggleAll}>
          {allExpanded ? "Alle einklappen" : "Alles anzeigen"}
        </button>
      </div>

      <MatchSection
        title="Live"
        emptyText="Gerade läuft kein Spiel im Snapshot."
        matches={liveMatches}
        expanded={expandedSections.live}
        onToggle={() => toggleSection("live")}
      />
      <MatchSection
        title="Kommende Spiele"
        emptyText="Keine kommenden Spiele im Snapshot."
        matches={upcomingMatches}
        expanded={expandedSections.upcoming}
        onToggle={() => toggleSection("upcoming")}
      />
      <MatchSection
        title="Vergangene Spiele"
        emptyText="Noch keine vergangenen Spiele im Snapshot."
        matches={finishedMatches}
        expanded={expandedSections.finished}
        onToggle={() => toggleSection("finished")}
      />
    </section>
  );
}
