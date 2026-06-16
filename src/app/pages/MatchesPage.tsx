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

function formatMatchTitle(match: MatchRecord): string {
  return `${match.homeTeam.name} - ${match.awayTeam.name}`;
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

function PlayerChip({ participant, compact = false }: { participant: MatchParticipantRecord; compact?: boolean }) {
  const ownerLabel = participant.owners.length > 0 ? participant.owners.join(", ") : null;

  return (
    <span className={`lineup-chip lineup-chip-${participant.status} ${participant.selected ? "lineup-chip-selected" : ""}`}>
      <span className="lineup-chip-main">
        <strong>{participant.displayPlayerName}</strong>
        {ownerLabel ? <em>{ownerLabel}</em> : null}
      </span>
      <span className="lineup-chip-meta">
        {compact ? formatParticipationStatus(participant.status) : `${participant.displayNationalTeam} · ${formatParticipationStatus(participant.status)}`}
      </span>
    </span>
  );
}

function groupParticipantsByTeam(match: MatchRecord): [string, MatchParticipantRecord[]][] {
  const teams = [match.homeTeam.name, match.awayTeam.name];
  return teams.map((teamName) => [
    teamName,
    match.participants.filter((participant) => participant.displayNationalTeam === teamName || participant.nationalTeam === teamName)
  ]);
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
  const previewCount = title === "Kommende Spiele" ? 6 : 4;
  const visibleMatches = expanded ? matches : matches.slice(0, previewCount);
  const hiddenCount = matches.length - visibleMatches.length;

  return (
    <section className="match-section">
      <div className="section-heading">
        <h2>{title}</h2>
      </div>
      <div className="match-list">
        {visibleMatches.length === 0 ? (
          <p className="empty-state">{emptyText}</p>
        ) : (
          visibleMatches.map((match) => {
            const relevantParticipants = match.participants.filter((participant) => participant.selected);
            const isLineupExpanded = expandedLineups.has(match.matchId);
            const lineupTeams = groupParticipantsByTeam(match);
            const visibleGoals = match.goals.slice(0, 8);
            const overflowGoalCount = match.goals.length - visibleGoals.length;

            return (
              <article className={`match-card match-card-${match.status}`} key={match.matchId}>
                <div className="match-card-header">
                  <div className="match-card-title">
                    <span>{formatKickoff(match.kickedOffAt)}</span>
                    <strong>{formatMatchTitle(match)}</strong>
                  </div>
                  <div className="match-card-status">
                    <strong className={match.status === "live" ? "live-chip" : undefined}>
                      {match.status === "live" ? <span aria-hidden="true" className="live-dot" /> : null}
                      <span className={match.status === "live" ? "live-chip-text" : undefined}>{formatStatus(match.status)}</span>
                    </strong>
                    <span className="match-card-score">{formatScore(match)}</span>
                  </div>
                </div>
                <div className={`match-goals ${match.goals.length > 0 ? "" : "match-goals-empty"}`}>
                  {match.goals.length === 0 ? (
                    <span>Keine Treffer</span>
                  ) : (
                    visibleGoals.map((goal) => (
                      <span key={goal.externalGoalId}>
                        {formatGoalMinute(goal)} {goal.playerName}
                      </span>
                    ))
                  )}
                  {overflowGoalCount > 0 ? <span>+{overflowGoalCount}</span> : null}
                </div>
                <div className="match-lineup">
                  <div className="match-lineup-heading">
                    <span>Aufstellung</span>
                    {relevantParticipants.length > 0 ? <strong>{relevantParticipants.length} Panini-Spieler</strong> : null}
                    {match.participants.length > 0 ? (
                      <button className="plain-button compact-button" type="button" onClick={() => onToggleLineup(match.matchId)}>
                        {isLineupExpanded ? "Weniger" : "Alle anzeigen"}
                      </button>
                    ) : null}
                  </div>
                  {match.participants.length === 0 ? (
                    <p className="match-lineup-empty">Aufstellung offen.</p>
                  ) : (
                    <div className={`lineup-team-grid ${isLineupExpanded ? "lineup-team-grid-expanded" : ""}`}>
                      {lineupTeams.map(([teamName, participants]) => {
                        const priorityParticipants = participants.filter((participant) => participant.selected);
                        const regularParticipants = participants.filter((participant) => !participant.selected);
                        const visibleParticipants = isLineupExpanded
                          ? [...priorityParticipants, ...regularParticipants]
                          : [...priorityParticipants, ...regularParticipants].slice(0, Math.max(priorityParticipants.length, 6));

                        return (
                          <div className="lineup-team" key={teamName}>
                            <h3>{teamName}</h3>
                            {visibleParticipants.length > 0 ? (
                              <div className="lineup-chip-list">
                                {visibleParticipants.map((participant) => (
                                  <PlayerChip
                                    compact={!isLineupExpanded}
                                    key={`${participant.fixtureId ?? participant.matchId}-${participant.apiPlayerId ?? participant.playerName}-${participant.status}`}
                                    participant={participant}
                                  />
                                ))}
                              </div>
                            ) : (
                              <span className="match-lineup-empty">Keine Daten</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                {match.affectedOwners.length > 0 ? (
                  <p className="match-impact">Panini-Punkte für {match.affectedOwners.join(", ")}</p>
                ) : null}
              </article>
            );
          })
        )}
      </div>
      {matches.length > previewCount ? (
        <div className="match-section-footer">
          <span>{expanded ? `${matches.length} Spiele sichtbar` : `${visibleMatches.length} von ${matches.length} Spielen`}</span>
          <button className="plain-button compact-button" type="button" onClick={onToggle}>
            {expanded ? "Einklappen" : `${hiddenCount} weitere`}
          </button>
        </div>
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
