import { useState } from "react";
import {
  groupGoalsBySide,
  groupMatchesBySection,
  groupSelectedParticipantsBySide,
  type MatchSectionKey
} from "../../domain/matchGrouping";
import type { MatchParticipantRecord, MatchParticipationStatus, MatchRecord } from "../../domain/types";
import { TeamFlag } from "../components/TeamFlag";
import { formatGoalMinute } from "../formatters/goalFormat";
import { formatKickoff, formatMatchScore } from "../formatters/matchFormat";

type MatchesPageProps = {
  matches: MatchRecord[];
};

function formatStatus(status: MatchRecord["status"], sectionKey?: MatchSectionKey): string {
  if (sectionKey === "live" && status === "scheduled") {
    return "Aufwärmen";
  }

  if (sectionKey === "live" && status === "finished") {
    return "Auslaufen";
  }

  if (status === "finished") {
    return "Beendet";
  }

  if (status === "live") {
    return "Läuft";
  }

  if (status === "scheduled") {
    return "Geplant";
  }

  return "Daten offen";
}

function formatParticipationStatus(status: MatchParticipationStatus, matchStatus: MatchRecord["status"]): string {
  switch (status) {
    case "starter":
      return matchStatus === "finished" ? "durchgespielt" : "spielt";
    case "bench":
      return "Bank";
    case "subbed-in":
      return "eingewechselt";
    case "subbed-out":
      return "ausgewechselt";
    case "subbed-in-out":
      return "ein- und ausgewechselt";
    case "unknown":
      return "offen";
  }
}

function formatNoRelevantPlayers(match: MatchRecord): string {
  if (match.status === "live" || match.status === "scheduled") {
    return "Fehlanzeige";
  }

  return "Keine Panini-Spieler in der Aufstellung.";
}

function PlayerChip({ participant, matchStatus }: { participant: MatchParticipantRecord; matchStatus: MatchRecord["status"] }) {
  const ownerLabel = participant.owners.length > 0 ? participant.owners.join(", ") : null;

  return (
    <span className={`lineup-chip lineup-chip-${participant.status} ${participant.selected ? "lineup-chip-selected" : ""}`}>
      <span className="lineup-chip-main">
        <strong>{participant.displayPlayerName}</strong>
        {ownerLabel ? <em>{ownerLabel}</em> : null}
      </span>
      <span className="lineup-chip-meta">
        {participant.displayNationalTeam} · {formatParticipationStatus(participant.status, matchStatus)}
      </span>
    </span>
  );
}

function formatPointImpact(match: MatchRecord): string {
  const goalsByOwner = new Map<string, number>();
  for (const goal of match.pointGoals) {
    goalsByOwner.set(goal.owner, (goalsByOwner.get(goal.owner) ?? 0) + goal.points);
  }

  return [...goalsByOwner]
    .sort(([ownerA], [ownerB]) => ownerA.localeCompare(ownerB))
    .map(([owner, points]) => `${points}x ${owner}`)
    .join(", ");
}

type MatchSectionProps = {
  sectionKey: MatchSectionKey;
  title: string;
  emptyText: string;
  matches: MatchRecord[];
  visibleCount: number;
  initialVisibleCount: number;
  onShowMore: (section: MatchSectionKey, amount: number) => void;
  onShowAll: (section: MatchSectionKey, total: number) => void;
  onCollapse: (section: MatchSectionKey) => void;
};

type VisibleMatchCounts = Record<MatchSectionKey, number>;

const initialVisibleCounts: VisibleMatchCounts = {
  live: Number.MAX_SAFE_INTEGER,
  upcoming: 1,
  finished: 1
};

function MatchSection({
  sectionKey,
  title,
  emptyText,
  matches,
  visibleCount,
  initialVisibleCount,
  onShowMore,
  onShowAll,
  onCollapse
}: MatchSectionProps) {
  const [expandedLineupIds, setExpandedLineupIds] = useState<Set<string>>(() => new Set());
  const visibleMatches = matches.slice(0, visibleCount);
  const hiddenCount = matches.length - visibleMatches.length;

  function toggleLineup(matchId: string): void {
    setExpandedLineupIds((current) => {
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
    <section className={`match-section ${sectionKey === "live" ? "match-section-live" : ""}`}>
      <div className="section-heading">
        <h2>
          {sectionKey === "live" ? (
            <span className="live-chip">
              <span aria-hidden="true" className="live-dot" />
              <span className="live-chip-text">{title}</span>
            </span>
          ) : (
            title
          )}
        </h2>
      </div>
      <div className="match-list">
        {visibleMatches.length === 0 ? (
          <p className="match-section-empty">{emptyText}</p>
        ) : (
          visibleMatches.map((match) => {
            const relevantParticipants = match.participants.filter((participant) => participant.selected);
            const goalsBySide = groupGoalsBySide(match);
            const participantsBySide = groupSelectedParticipantsBySide(match);
            const pointGoalIds = new Set(match.pointGoals.map((goal) => goal.externalGoalId));
            const lineupExpanded = expandedLineupIds.has(match.matchId);
            const pointImpact = formatPointImpact(match);
            return (
              <article className={`match-card match-card-${match.status}`} key={match.matchId}>
                <div className="match-card-header">
                  <div className="match-card-meta">
                    <span>{formatKickoff(match.kickedOffAt, { dateStyle: "medium", timeStyle: "short" })}</span>
                  </div>
                  <div className="match-card-status">
                    <strong>{formatStatus(match.status, sectionKey)}</strong>
                  </div>
                </div>
                <div className="match-card-scoreline">
                  <div className="match-team match-team-home">
                    <TeamFlag teamName={match.homeTeam.name} />
                    <strong>{match.homeTeam.name}</strong>
                  </div>
                  <span className="match-card-score">{formatMatchScore(match)}</span>
                  <div className="match-team match-team-away">
                    <strong>{match.awayTeam.name}</strong>
                    <TeamFlag teamName={match.awayTeam.name} />
                  </div>
                </div>
                {match.goals.length > 0 ? (
                  <div className="match-goals">
                    <div className="match-goal-side match-goal-side-home">
                      {goalsBySide.home.map((goal) => (
                        <span
                          className={[
                            pointGoalIds.has(goal.externalGoalId) ? "match-goal-chip-scored" : "",
                            goal.detail === "own-goal" ? "match-goal-chip-own-goal" : ""
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          key={goal.externalGoalId}
                        >
                          {formatGoalMinute(goal)} {goal.playerName}
                          {goal.detail === "own-goal" ? " Eigentor" : ""}
                        </span>
                      ))}
                    </div>
                    <div className="match-goal-side match-goal-side-away">
                      {goalsBySide.away.map((goal) => (
                        <span
                          className={[
                            pointGoalIds.has(goal.externalGoalId) ? "match-goal-chip-scored" : "",
                            goal.detail === "own-goal" ? "match-goal-chip-own-goal" : ""
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          key={goal.externalGoalId}
                        >
                          {formatGoalMinute(goal)} {goal.playerName}
                          {goal.detail === "own-goal" ? " Eigentor" : ""}
                        </span>
                      ))}
                    </div>
                    {goalsBySide.unknown.length > 0 ? (
                      <div className="match-goal-side match-goal-side-unknown">
                        {goalsBySide.unknown.map((goal) => (
                          <span
                            className={[
                              pointGoalIds.has(goal.externalGoalId) ? "match-goal-chip-scored" : "",
                              goal.detail === "own-goal" ? "match-goal-chip-own-goal" : ""
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            key={goal.externalGoalId}
                          >
                            {formatGoalMinute(goal)} {goal.playerName}
                            {goal.detail === "own-goal" ? " Eigentor" : ""}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="match-lineup">
                  <div className="match-lineup-heading">
                    <span>
                      Panini-Spieler im Spiel
                      {relevantParticipants.length > 0 ? <strong>{relevantParticipants.length}</strong> : null}
                    </span>
                    <button
                      aria-label={lineupExpanded ? "Panini-Spieler einklappen" : "Panini-Spieler aufklappen"}
                      aria-expanded={lineupExpanded}
                      className="match-lineup-toggle"
                      type="button"
                      onClick={() => toggleLineup(match.matchId)}
                    >
                      {lineupExpanded ? "−" : "+"}
                    </button>
                  </div>
                  {lineupExpanded ? (
                    relevantParticipants.length === 0 ? (
                      <p className="match-lineup-empty">{formatNoRelevantPlayers(match)}</p>
                    ) : (
                      <div className="relevant-lineup-sides">
                        <div className="lineup-chip-list relevant-lineup-list relevant-lineup-list-home">
                          {participantsBySide.home.map((participant) => (
                            <PlayerChip
                              key={`${participant.fixtureId ?? participant.matchId}-${participant.apiPlayerId ?? participant.playerName}-${participant.status}`}
                              matchStatus={match.status}
                              participant={participant}
                            />
                          ))}
                        </div>
                        <div className="lineup-chip-list relevant-lineup-list relevant-lineup-list-away">
                          {participantsBySide.away.map((participant) => (
                            <PlayerChip
                              key={`${participant.fixtureId ?? participant.matchId}-${participant.apiPlayerId ?? participant.playerName}-${participant.status}`}
                              matchStatus={match.status}
                              participant={participant}
                            />
                          ))}
                        </div>
                        {participantsBySide.unknown.length > 0 ? (
                          <div className="lineup-chip-list relevant-lineup-list relevant-lineup-list-unknown">
                            {participantsBySide.unknown.map((participant) => (
                              <PlayerChip
                                key={`${participant.fixtureId ?? participant.matchId}-${participant.apiPlayerId ?? participant.playerName}-${participant.status}`}
                                matchStatus={match.status}
                                participant={participant}
                              />
                            ))}
                          </div>
                        ) : null}
                      </div>
                    )
                  ) : null}
                </div>
                {pointImpact ? (
                  <p className="match-impact">
                    <strong>Panini-Punkte:</strong> {pointImpact}
                  </p>
                ) : null}
              </article>
            );
          })
        )}
      </div>
      {matches.length > initialVisibleCount ? (
        <div className="match-section-footer">
          <span>{visibleMatches.length} von {matches.length} Spielen</span>
          <div className="match-section-actions">
            {hiddenCount > 0 ? (
              <>
                <button className="plain-button compact-button" type="button" onClick={() => onShowMore(sectionKey, 2)}>
                  +2
                </button>
                <button className="plain-button compact-button" type="button" onClick={() => onShowMore(sectionKey, 5)}>
                  +5
                </button>
                <button className="plain-button compact-button" type="button" onClick={() => onShowAll(sectionKey, matches.length)}>
                  Alle
                </button>
              </>
            ) : null}
            {visibleMatches.length > initialVisibleCount ? (
              <button className="plain-button compact-button" type="button" onClick={() => onCollapse(sectionKey)}>
                Einklappen
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function MatchesPage({ matches }: MatchesPageProps) {
  const [visibleCounts, setVisibleCounts] = useState<VisibleMatchCounts>(initialVisibleCounts);
  const { live: liveMatches, upcoming: upcomingMatches, finished: finishedMatches } = groupMatchesBySection(matches, new Date());

  function showMore(section: MatchSectionKey, amount: number): void {
    setVisibleCounts((current) => ({ ...current, [section]: current[section] + amount }));
  }

  function showAll(section: MatchSectionKey, total: number): void {
    setVisibleCounts((current) => ({ ...current, [section]: total }));
  }

  function collapseSection(section: MatchSectionKey): void {
    setVisibleCounts((current) => ({ ...current, [section]: initialVisibleCounts[section] }));
  }

  return (
    <section className="page-stack">
      {liveMatches.length > 0 ? (
        <MatchSection
          sectionKey="live"
          title="Live"
          emptyText=""
          matches={liveMatches}
          visibleCount={visibleCounts.live}
          initialVisibleCount={initialVisibleCounts.live}
          onShowMore={showMore}
          onShowAll={showAll}
          onCollapse={collapseSection}
        />
      ) : null}
      <MatchSection
        sectionKey="upcoming"
        title="Kommende Spiele"
        emptyText="Daten konnten nicht geladen werden."
        matches={upcomingMatches}
        visibleCount={visibleCounts.upcoming}
        initialVisibleCount={initialVisibleCounts.upcoming}
        onShowMore={showMore}
        onShowAll={showAll}
        onCollapse={collapseSection}
      />
      <MatchSection
        sectionKey="finished"
        title="Vergangene Spiele"
        emptyText="Daten konnten nicht geladen werden."
        matches={finishedMatches}
        visibleCount={visibleCounts.finished}
        initialVisibleCount={initialVisibleCounts.finished}
        onShowMore={showMore}
        onShowAll={showAll}
        onCollapse={collapseSection}
      />
    </section>
  );
}
