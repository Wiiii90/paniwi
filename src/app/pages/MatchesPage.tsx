import { useState } from "react";
import type { MatchParticipantRecord, MatchParticipationStatus, MatchRecord } from "../../domain/types";
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

function formatParticipationStatus(status: MatchParticipationStatus): string {
  switch (status) {
    case "starter":
      return "spielt";
    case "bench":
      return "Bank";
    case "subbed-in":
      return "eingewechselt";
    case "subbed-out":
      return "ausgewechselt";
    case "unknown":
      return "offen";
  }
}

function PlayerChip({ participant }: { participant: MatchParticipantRecord }) {
  const ownerLabel = participant.owners.length > 0 ? ` · ${participant.owners.join(", ")}` : "";

  return (
    <span className={`lineup-chip lineup-chip-${participant.status}`}>
      <strong>{participant.displayPlayerName}</strong>
      <span>
        {participant.displayNationalTeam}
        {ownerLabel} · {formatParticipationStatus(participant.status)}
      </span>
    </span>
  );
}

type MatchSectionProps = {
  title: string;
  emptyText: string;
  matches: MatchRecord[];
  expanded: boolean;
  onToggle: () => void;
  expandedLineups: Set<string>;
  onToggleLineup: (matchId: string) => void;
};

function MatchSection({ title, emptyText, matches, expanded, onToggle, expandedLineups, onToggleLineup }: MatchSectionProps) {
  const visibleMatches = expanded ? matches : matches.slice(0, 3);
  const hiddenCount = matches.length - visibleMatches.length;

  return (
    <section className="match-section">
      <div className="section-heading">
        <h2>{title}</h2>
        <span className="section-count">{matches.length}</span>
      </div>
      <div className="match-list">
        {visibleMatches.length === 0 ? (
          <p className="empty-state">{emptyText}</p>
        ) : (
          visibleMatches.map((match) => {
            const relevantParticipants = match.participants.filter((participant) => participant.selected);
            const isLineupExpanded = expandedLineups.has(match.matchId);

            return (
              <article className={`match-card match-card-${match.status}`} key={match.matchId}>
                <div className="match-card-header">
                  <span>{formatKickoff(match.kickedOffAt)}</span>
                  <strong className={match.status === "live" ? "live-chip" : undefined}>
                    {match.status === "live" ? <span aria-hidden="true" className="live-dot" /> : null}
                    <span className={match.status === "live" ? "live-chip-text" : undefined}>{formatStatus(match.status)}</span>
                  </strong>
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
                <div className="match-lineup">
                  <div className="match-lineup-heading">
                    <span>Relevante Panini-Spieler</span>
                    {match.participants.length > 0 ? (
                      <button className="plain-button compact-button" type="button" onClick={() => onToggleLineup(match.matchId)}>
                        {isLineupExpanded ? "Aufstellung schließen" : "Aufstellung anzeigen"}
                      </button>
                    ) : null}
                  </div>
                  {relevantParticipants.length > 0 ? (
                    <div className="lineup-chip-list">
                      {relevantParticipants.map((participant) => (
                        <PlayerChip
                          key={`${participant.fixtureId ?? participant.matchId}-${participant.apiPlayerId ?? participant.playerName}-${participant.status}`}
                          participant={participant}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="match-lineup-empty">{match.participants.length > 0 ? "Keine Panini-Spieler in der Aufstellung." : "Aufstellung offen."}</p>
                  )}
                  {isLineupExpanded ? (
                    <div className="lineup-chip-list lineup-chip-list-all">
                      {match.participants.map((participant) => (
                        <PlayerChip
                          key={`all-${participant.fixtureId ?? participant.matchId}-${participant.apiPlayerId ?? participant.playerName}-${participant.status}`}
                          participant={participant}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
                {match.affectedOwners.length > 0 ? (
                  <p className="match-impact">Panini-Punkte für {match.affectedOwners.join(", ")}</p>
                ) : null}
              </article>
            );
          })
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
  const [expandedLineups, setExpandedLineups] = useState<Set<string>>(() => new Set());
  const liveMatches = matches.filter((match) => match.status === "live").sort(sortByKickoffAscending);
  const upcomingMatches = matches.filter((match) => match.status === "scheduled").sort(sortByKickoffAscending);
  const finishedMatches = matches.filter((match) => match.status === "finished").sort(sortByKickoffDescending);

  function toggleSection(section: keyof typeof expandedSections): void {
    setExpandedSections((current) => ({ ...current, [section]: !current[section] }));
  }

  function toggleLineup(matchId: string): void {
    setExpandedLineups((current) => {
      const next = new Set(current);
      if (next.has(matchId)) {
        next.delete(matchId);
      } else {
        next.add(matchId);
      }
      return next;
    });
  }

  return (
    <section className="page-stack">
      <MatchSection
        title="Live"
        emptyText="Gerade läuft kein Spiel im Snapshot."
        matches={liveMatches}
        expanded={expandedSections.live}
        onToggle={() => toggleSection("live")}
        expandedLineups={expandedLineups}
        onToggleLineup={toggleLineup}
      />
      <MatchSection
        title="Kommende Spiele"
        emptyText="Keine kommenden Spiele im Snapshot."
        matches={upcomingMatches}
        expanded={expandedSections.upcoming}
        onToggle={() => toggleSection("upcoming")}
        expandedLineups={expandedLineups}
        onToggleLineup={toggleLineup}
      />
      <MatchSection
        title="Vergangene Spiele"
        emptyText="Noch keine vergangenen Spiele im Snapshot."
        matches={finishedMatches}
        expanded={expandedSections.finished}
        onToggle={() => toggleSection("finished")}
        expandedLineups={expandedLineups}
        onToggleLineup={toggleLineup}
      />
    </section>
  );
}
