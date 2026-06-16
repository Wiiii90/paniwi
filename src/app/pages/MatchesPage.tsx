import { useState } from "react";
import { resolveKnownTeamId } from "../../config/teamCatalog";
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

function formatStatus(status: MatchRecord["status"], sectionKey?: keyof VisibleMatchCounts): string {
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

function getMatchTeamIds(match: MatchRecord): { homeTeamId: string | null; awayTeamId: string | null } {
  return {
    homeTeamId: resolveKnownTeamId(match.homeTeam.name),
    awayTeamId: resolveKnownTeamId(match.awayTeam.name)
  };
}

function getGoalSide(goal: MatchRecord["goals"][number], match: MatchRecord): "home" | "away" | "unknown" {
  const { homeTeamId, awayTeamId } = getMatchTeamIds(match);
  const goalTeamId = goal.teamId ?? resolveKnownTeamId(goal.nationalTeam);
  if (goalTeamId && goalTeamId === homeTeamId) {
    return "home";
  }

  if (goalTeamId && goalTeamId === awayTeamId) {
    return "away";
  }

  return "unknown";
}

function getParticipantSide(participant: MatchParticipantRecord, match: MatchRecord): "home" | "away" | "unknown" {
  const { homeTeamId, awayTeamId } = getMatchTeamIds(match);
  const participantTeamId = participant.teamId ?? resolveKnownTeamId(participant.nationalTeam);
  if (participantTeamId && participantTeamId === homeTeamId) {
    return "home";
  }

  if (participantTeamId && participantTeamId === awayTeamId) {
    return "away";
  }

  return "unknown";
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
  sectionKey: keyof VisibleMatchCounts;
  title: string;
  emptyText: string;
  matches: MatchRecord[];
  visibleCount: number;
  initialVisibleCount: number;
  onShowMore: (section: keyof VisibleMatchCounts, amount: number) => void;
  onShowAll: (section: keyof VisibleMatchCounts, total: number) => void;
  onCollapse: (section: keyof VisibleMatchCounts) => void;
};

type VisibleMatchCounts = {
  live: number;
  upcoming: number;
  finished: number;
};

const initialVisibleCounts: VisibleMatchCounts = {
  live: Number.MAX_SAFE_INTEGER,
  upcoming: 1,
  finished: 1
};

const preMatchDisplayWindowMinutes = 60;
const recentlyFinishedDisplayWindowMinutesAfterKickoff = 240;

function isActiveMatch(match: MatchRecord, now: Date): boolean {
  if (match.status === "live") {
    return true;
  }

  if (!match.kickedOffAt) {
    return false;
  }

  const kickoffMs = new Date(match.kickedOffAt).getTime();
  if (!Number.isFinite(kickoffMs)) {
    return false;
  }

  const nowMs = now.getTime();
  if (match.status === "scheduled") {
    const preMatchStartsMs = kickoffMs - preMatchDisplayWindowMinutes * 60 * 1000;
    return nowMs >= preMatchStartsMs && nowMs < kickoffMs;
  }

  if (match.status === "finished") {
    const activeUntilMs = kickoffMs + recentlyFinishedDisplayWindowMinutesAfterKickoff * 60 * 1000;
    return nowMs >= kickoffMs && nowMs <= activeUntilMs;
  }

  return false;
}

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
    <section className="match-section">
      <div className="section-heading">
        <h2>{title}</h2>
      </div>
      <div className="match-list">
        {visibleMatches.length === 0 ? (
          <p className="match-section-empty">{emptyText}</p>
        ) : (
          visibleMatches.map((match) => {
            const relevantParticipants = match.participants.filter((participant) => participant.selected);
            const homeGoals = match.goals.filter((goal) => getGoalSide(goal, match) === "home");
            const awayGoals = match.goals.filter((goal) => getGoalSide(goal, match) === "away");
            const unknownGoals = match.goals.filter((goal) => getGoalSide(goal, match) === "unknown");
            const homeParticipants = relevantParticipants.filter((participant) => getParticipantSide(participant, match) === "home");
            const awayParticipants = relevantParticipants.filter((participant) => getParticipantSide(participant, match) === "away");
            const unknownParticipants = relevantParticipants.filter((participant) => getParticipantSide(participant, match) === "unknown");
            const pointGoalIds = new Set(match.pointGoals.map((goal) => goal.externalGoalId));
            const lineupExpanded = expandedLineupIds.has(match.matchId);
            const pointImpact = formatPointImpact(match);
            return (
              <article className={`match-card match-card-${match.status}`} key={match.matchId}>
                <div className="match-card-header">
                  <div className="match-card-meta">
                    <span>{formatKickoff(match.kickedOffAt)}</span>
                  </div>
                  <div className="match-card-status">
                    <strong className={match.status === "live" ? "live-chip" : undefined}>
                      {match.status === "live" ? <span aria-hidden="true" className="live-dot" /> : null}
                      <span className={match.status === "live" ? "live-chip-text" : undefined}>{formatStatus(match.status, sectionKey)}</span>
                    </strong>
                  </div>
                </div>
                <div className="match-card-scoreline">
                  <div className="match-team match-team-home">
                    <strong>{match.homeTeam.name}</strong>
                  </div>
                  <span className="match-card-score">{formatScore(match)}</span>
                  <div className="match-team match-team-away">
                    <strong>{match.awayTeam.name}</strong>
                  </div>
                </div>
                {match.goals.length > 0 ? (
                  <div className="match-goals">
                    <div className="match-goal-side match-goal-side-home">
                      {homeGoals.map((goal) => (
                        <span className={pointGoalIds.has(goal.externalGoalId) ? "match-goal-chip-scored" : undefined} key={goal.externalGoalId}>
                          {formatGoalMinute(goal)} {goal.playerName}
                        </span>
                      ))}
                    </div>
                    <div className="match-goal-side match-goal-side-away">
                      {awayGoals.map((goal) => (
                        <span className={pointGoalIds.has(goal.externalGoalId) ? "match-goal-chip-scored" : undefined} key={goal.externalGoalId}>
                          {formatGoalMinute(goal)} {goal.playerName}
                        </span>
                      ))}
                    </div>
                    {unknownGoals.length > 0 ? (
                      <div className="match-goal-side match-goal-side-unknown">
                        {unknownGoals.map((goal) => (
                          <span className={pointGoalIds.has(goal.externalGoalId) ? "match-goal-chip-scored" : undefined} key={goal.externalGoalId}>
                            {formatGoalMinute(goal)} {goal.playerName}
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
                          {homeParticipants.map((participant) => (
                            <PlayerChip
                              key={`${participant.fixtureId ?? participant.matchId}-${participant.apiPlayerId ?? participant.playerName}-${participant.status}`}
                              matchStatus={match.status}
                              participant={participant}
                            />
                          ))}
                        </div>
                        <div className="lineup-chip-list relevant-lineup-list relevant-lineup-list-away">
                          {awayParticipants.map((participant) => (
                            <PlayerChip
                              key={`${participant.fixtureId ?? participant.matchId}-${participant.apiPlayerId ?? participant.playerName}-${participant.status}`}
                              matchStatus={match.status}
                              participant={participant}
                            />
                          ))}
                        </div>
                        {unknownParticipants.length > 0 ? (
                          <div className="lineup-chip-list relevant-lineup-list relevant-lineup-list-unknown">
                            {unknownParticipants.map((participant) => (
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
  const now = new Date();
  const liveMatches = matches.filter((match) => isActiveMatch(match, now)).sort(sortByKickoffAscending);
  const activeMatchIds = new Set(liveMatches.map((match) => match.matchId));
  const upcomingMatches = matches
    .filter((match) => match.status === "scheduled" && !activeMatchIds.has(match.matchId))
    .sort(sortByKickoffAscending);
  const finishedMatches = matches
    .filter((match) => match.status === "finished" && !activeMatchIds.has(match.matchId))
    .sort(sortByKickoffDescending);

  function showMore(section: keyof VisibleMatchCounts, amount: number): void {
    setVisibleCounts((current) => ({ ...current, [section]: current[section] + amount }));
  }

  function showAll(section: keyof VisibleMatchCounts, total: number): void {
    setVisibleCounts((current) => ({ ...current, [section]: total }));
  }

  function collapseSection(section: keyof VisibleMatchCounts): void {
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
