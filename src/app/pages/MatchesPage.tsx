import { useMemo, useState, type CSSProperties } from "react";
import { participantTeams } from "../../config/teams";
import {
  groupGoalsBySide,
  groupMatchesBySection,
  groupSelectedParticipantsBySide,
  isCooldownMatch,
  isUnknownFinishedResult,
  isUnknownResultInActiveWindow,
  isWarmupMatch,
  type MatchSectionKey
} from "../../domain/matchGrouping";
import type { GoalRecord, ScoredGoal } from "../../domain/goalTypes";
import type { MatchParticipantRecord, MatchParticipationStatus, MatchRecord } from "../../domain/matchTypes";
import { TeamFlag } from "../components/TeamFlag";
import { formatCompactGoalMinute } from "../formatters/goalFormat";
import { formatKickoff, formatMatchScore } from "../formatters/matchFormat";

type MatchesPageProps = {
  matches: MatchRecord[];
};

function formatStatus(match: MatchRecord, now: Date): string {
  if (isWarmupMatch(match, now)) {
    return "Aufwärmen";
  }

  if (isCooldownMatch(match, now)) {
    return "Auslaufen";
  }

  if (isUnknownResultInActiveWindow(match, now)) {
    return "Läuft";
  }

  if (isUnknownFinishedResult(match, now)) {
    return "Beendet";
  }

  if (match.status === "finished") {
    return "Beendet";
  }

  if (match.status === "live") {
    return "Läuft";
  }

  if (match.status === "scheduled") {
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

function participantMatchesGoal(participant: MatchParticipantRecord, goal: ScoredGoal): boolean {
  if (participant.apiPlayerId && goal.apiPlayerId && participant.apiPlayerId === goal.apiPlayerId) {
    return true;
  }

  const sameTeam = participant.teamId && goal.teamId ? participant.teamId === goal.teamId : participant.nationalTeam === goal.nationalTeam;
  if (!sameTeam) {
    return false;
  }

  return [goal.playerName, goal.displayPlayerName, goal.pickedPlayerName, goal.sourcePlayerName].some(
    (name) => name === participant.playerName || name === participant.displayPlayerName
  );
}

function countParticipantGoals(participant: MatchParticipantRecord, pointGoals: ScoredGoal[]): number {
  return pointGoals
    .filter((goal) => participantMatchesGoal(participant, goal))
    .reduce((total, goal) => total + goal.goals, 0);
}

function getOwnerColors(owners: string[], ownerColors: Map<string, string | undefined>): string[] {
  return owners.flatMap((owner) => ownerColors.get(owner) ?? []);
}

function getOwnerColorStyle(colors: string[]): CSSProperties {
  if (colors.length <= 1) {
    return { "--participant-color": colors[0] ?? "var(--color-text)" } as CSSProperties;
  }

  return {
    "--participant-color": colors[0],
    "--participant-border": `linear-gradient(90deg, ${colors.join(", ")})`
  } as CSSProperties;
}

function PlayerChip({
  baseUrl,
  goalCount,
  matchStatus,
  ownerColors,
  participant
}: {
  baseUrl: string;
  goalCount: number;
  matchStatus: MatchRecord["status"];
  ownerColors: Map<string, string | undefined>;
  participant: MatchParticipantRecord;
}) {
  const colors = getOwnerColors(participant.owners, ownerColors);
  const ballIconUrl = `${import.meta.env.BASE_URL}assets/ball.svg`;

  return (
    <span
      className={`lineup-chip lineup-chip-${participant.status} ${participant.selected ? "lineup-chip-selected" : ""} ${colors.length > 1 ? "lineup-chip-multi-owner" : ""}`}
      style={getOwnerColorStyle(colors)}
    >
      <span className="lineup-chip-main">
        <strong>{participant.displayPlayerName}</strong>
        {participant.owners.length > 0 ? (
          <span className="lineup-chip-owners">
            {participant.owners.map((owner) => (
              <a
                href={`${baseUrl}team/${encodeURIComponent(owner)}`}
                key={`${participant.playerName}-${owner}`}
                style={{ "--participant-color": ownerColors.get(owner) ?? "var(--color-text)" } as CSSProperties}
              >
                {owner}
              </a>
            ))}
          </span>
        ) : null}
      </span>
      <span className="lineup-chip-meta">
        <span>{formatParticipationStatus(participant.status, matchStatus)}</span>
        {goalCount > 0 ? (
          <span className="lineup-chip-goals" title={`${goalCount} Tor${goalCount === 1 ? "" : "e"}`}>
            {goalCount}x <img src={ballIconUrl} alt="" aria-hidden="true" />
          </span>
        ) : null}
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

function formatGoalDetailShort(goal: GoalRecord): string {
  if (goal.detail === "own-goal") {
    return "ET";
  }

  if (goal.detail === "penalty") {
    return "FE";
  }

  if (goal.detail === "penalty-shootout") {
    return "i.E.";
  }

  return "";
}

function getGoalChipKey(goal: GoalRecord): string {
  return [goal.playerId ?? goal.apiPlayerId ?? goal.playerName, goal.teamId ?? goal.nationalTeam].join("|");
}

function groupGoalChips(goals: GoalRecord[]): GoalRecord[][] {
  const groups = new Map<string, GoalRecord[]>();
  for (const goal of goals) {
    const key = getGoalChipKey(goal);
    groups.set(key, [...(groups.get(key) ?? []), goal]);
  }

  return [...groups.values()];
}

function formatGoalChipMinute(goal: GoalRecord): string {
  const detail = formatGoalDetailShort(goal);
  return detail ? `${formatCompactGoalMinute(goal)} (${detail})` : formatCompactGoalMinute(goal);
}

function getGoalOwnerColors(goals: GoalRecord[], pointGoals: ScoredGoal[], ownerColors: Map<string, string | undefined>): string[] {
  const goalIds = new Set(goals.map((goal) => goal.externalGoalId));
  const owners = new Set(pointGoals.filter((goal) => goalIds.has(goal.externalGoalId)).map((goal) => goal.owner));
  return getOwnerColors([...owners], ownerColors);
}

function GoalChip({
  goals,
  ownerColors,
  pointGoals
}: {
  goals: GoalRecord[];
  ownerColors: Map<string, string | undefined>;
  pointGoals: ScoredGoal[];
}) {
  const firstGoal = goals[0];
  const colors = getGoalOwnerColors(goals, pointGoals, ownerColors);
  const scoredClass = colors.length > 0 ? "match-goal-chip-scored" : "";
  const minutes = goals.map(formatGoalChipMinute).join(", ");
  const title = goals.map((goal) => `${formatGoalChipMinute(goal)} ${goal.playerName}`).join(", ");

  return (
    <span className={`${scoredClass} ${colors.length > 1 ? "match-goal-chip-multi-owner" : ""}`} style={getOwnerColorStyle(colors)} title={title}>
      {minutes} {firstGoal.playerName}
    </span>
  );
}

type MatchSectionProps = {
  sectionKey: MatchSectionKey;
  title: string;
  emptyText: string;
  matches: MatchRecord[];
  now: Date;
  visibleCount: number;
  initialVisibleCount: number;
  onShowMore: (section: MatchSectionKey, amount: number) => void;
  onShowLess: (section: MatchSectionKey, amount: number) => void;
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
  now,
  visibleCount,
  initialVisibleCount,
  onShowMore,
  onShowLess,
  onShowAll,
  onCollapse
}: MatchSectionProps) {
  const [expandedLineupIds, setExpandedLineupIds] = useState<Set<string>>(() => new Set());
  const baseUrl = import.meta.env.BASE_URL;
  const ownerColors = useMemo(() => new Map(participantTeams.map((team) => [team.owner, team.color])), []);
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
        {matches.length > initialVisibleCount ? (
          <button
            aria-label={hiddenCount > 0 ? `${title} vollständig anzeigen` : `${title} einklappen`}
            className="section-toggle-button"
            type="button"
            onClick={() => (hiddenCount > 0 ? onShowAll(sectionKey, matches.length) : onCollapse(sectionKey))}
          >
            <span aria-hidden="true" className={hiddenCount > 0 ? "section-toggle-icon section-toggle-icon-down" : "section-toggle-icon"} />
          </button>
        ) : null}
      </div>
      <div className="match-list">
        {visibleMatches.length === 0 ? (
          <p className="match-section-empty">{emptyText}</p>
        ) : (
          visibleMatches.map((match) => {
            const relevantParticipants = match.participants.filter((participant) => participant.selected);
            const goalsBySide = groupGoalsBySide(match);
            const participantsBySide = groupSelectedParticipantsBySide(match);
            const lineupExpanded = expandedLineupIds.has(match.matchId);
            const pointImpact = formatPointImpact(match);
            return (
              <article className={`match-card match-card-${match.status}`} key={match.matchId}>
                <div className="match-card-header">
                  <div className="match-card-meta">
                    <span>
                      {formatKickoff(match.kickedOffAt, {
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                        month: "short",
                        weekday: "short",
                        year: "numeric"
                      })}
                    </span>
                  </div>
                  <div className="match-card-status">
                    <strong>{formatStatus(match, now)}</strong>
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
                      {groupGoalChips(goalsBySide.home).map((goals) => (
                        <GoalChip goals={goals} key={goals.map((goal) => goal.externalGoalId).join("|")} ownerColors={ownerColors} pointGoals={match.pointGoals} />
                      ))}
                    </div>
                    <div className="match-goal-side match-goal-side-away">
                      {groupGoalChips(goalsBySide.away).map((goals) => (
                        <GoalChip goals={goals} key={goals.map((goal) => goal.externalGoalId).join("|")} ownerColors={ownerColors} pointGoals={match.pointGoals} />
                      ))}
                    </div>
                    {goalsBySide.unknown.length > 0 ? (
                      <div className="match-goal-side match-goal-side-unknown">
                        {groupGoalChips(goalsBySide.unknown).map((goals) => (
                          <GoalChip goals={goals} key={goals.map((goal) => goal.externalGoalId).join("|")} ownerColors={ownerColors} pointGoals={match.pointGoals} />
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
                              baseUrl={baseUrl}
                              key={`${participant.fixtureId ?? participant.matchId}-${participant.apiPlayerId ?? participant.playerName}-${participant.status}`}
                              goalCount={countParticipantGoals(participant, match.pointGoals)}
                              matchStatus={match.status}
                              ownerColors={ownerColors}
                              participant={participant}
                            />
                          ))}
                        </div>
                        <div className="lineup-chip-list relevant-lineup-list relevant-lineup-list-away">
                          {participantsBySide.away.map((participant) => (
                            <PlayerChip
                              baseUrl={baseUrl}
                              key={`${participant.fixtureId ?? participant.matchId}-${participant.apiPlayerId ?? participant.playerName}-${participant.status}`}
                              goalCount={countParticipantGoals(participant, match.pointGoals)}
                              matchStatus={match.status}
                              ownerColors={ownerColors}
                              participant={participant}
                            />
                          ))}
                        </div>
                        {participantsBySide.unknown.length > 0 ? (
                          <div className="lineup-chip-list relevant-lineup-list relevant-lineup-list-unknown">
                            {participantsBySide.unknown.map((participant) => (
                              <PlayerChip
                                baseUrl={baseUrl}
                                key={`${participant.fixtureId ?? participant.matchId}-${participant.apiPlayerId ?? participant.playerName}-${participant.status}`}
                                goalCount={countParticipantGoals(participant, match.pointGoals)}
                                matchStatus={match.status}
                                ownerColors={ownerColors}
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
          <div className="match-section-actions match-section-actions-left">
            {hiddenCount >= 1 ? (
              <button className="plain-button compact-button" type="button" onClick={() => onShowMore(sectionKey, 1)}>
                +1
              </button>
            ) : null}
            {hiddenCount >= 2 ? (
              <button className="plain-button compact-button" type="button" onClick={() => onShowMore(sectionKey, 2)}>
                +2
              </button>
            ) : null}
            {hiddenCount >= 5 ? (
              <button className="plain-button compact-button" type="button" onClick={() => onShowMore(sectionKey, 5)}>
                +5
              </button>
            ) : null}
          </div>
          <span>{visibleMatches.length} von {matches.length} Spielen</span>
          <div className="match-section-actions match-section-actions-right">
            {visibleMatches.length - initialVisibleCount >= 5 ? (
              <button className="plain-button compact-button" type="button" onClick={() => onShowLess(sectionKey, 5)}>
                -5
              </button>
            ) : null}
            {visibleMatches.length - initialVisibleCount >= 2 ? (
              <button className="plain-button compact-button" type="button" onClick={() => onShowLess(sectionKey, 2)}>
                -2
              </button>
            ) : null}
            {visibleMatches.length > initialVisibleCount ? (
              <button className="plain-button compact-button" type="button" onClick={() => onShowLess(sectionKey, 1)}>
                -1
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function MatchesPage({ matches }: MatchesPageProps) {
  const now = new Date();
  const { live: liveMatches, upcoming: upcomingMatches, finished: finishedMatches } = groupMatchesBySection(matches, now);
  const sectionInitialCounts: VisibleMatchCounts = {
    live: initialVisibleCounts.live,
    upcoming: Math.min(upcomingMatches.length, upcomingMatches.filter((match) => isWarmupMatch(match, now)).length + 1),
    finished: Math.min(finishedMatches.length, finishedMatches.filter((match) => isCooldownMatch(match, now)).length + 1)
  };
  const [visibleCounts, setVisibleCounts] = useState<VisibleMatchCounts>(sectionInitialCounts);

  function showMore(section: MatchSectionKey, amount: number): void {
    const totalBySection = { live: liveMatches.length, upcoming: upcomingMatches.length, finished: finishedMatches.length };
    setVisibleCounts((current) => ({ ...current, [section]: Math.min(current[section] + amount, totalBySection[section]) }));
  }

  function showLess(section: MatchSectionKey, amount: number): void {
    setVisibleCounts((current) => ({ ...current, [section]: Math.max(current[section] - amount, sectionInitialCounts[section]) }));
  }

  function showAll(section: MatchSectionKey, total: number): void {
    setVisibleCounts((current) => ({ ...current, [section]: total }));
  }

  function collapseSection(section: MatchSectionKey): void {
    setVisibleCounts((current) => ({ ...current, [section]: sectionInitialCounts[section] }));
  }

  return (
    <section className="page-stack">
      {liveMatches.length > 0 ? (
        <MatchSection
          sectionKey="live"
          title="Live"
          emptyText=""
          matches={liveMatches}
          now={now}
          visibleCount={Math.max(visibleCounts.live, sectionInitialCounts.live)}
          initialVisibleCount={sectionInitialCounts.live}
          onShowMore={showMore}
          onShowLess={showLess}
          onShowAll={showAll}
          onCollapse={collapseSection}
        />
      ) : null}
      <MatchSection
        sectionKey="upcoming"
        title="Kommende Spiele"
        emptyText="Daten konnten nicht geladen werden."
        matches={upcomingMatches}
        now={now}
        visibleCount={Math.max(visibleCounts.upcoming, sectionInitialCounts.upcoming)}
        initialVisibleCount={sectionInitialCounts.upcoming}
        onShowMore={showMore}
        onShowLess={showLess}
        onShowAll={showAll}
        onCollapse={collapseSection}
      />
      <MatchSection
        sectionKey="finished"
        title="Vergangene Spiele"
        emptyText="Daten konnten nicht geladen werden."
        matches={finishedMatches}
        now={now}
        visibleCount={Math.max(visibleCounts.finished, sectionInitialCounts.finished)}
        initialVisibleCount={sectionInitialCounts.finished}
        onShowMore={showMore}
        onShowLess={showLess}
        onShowAll={showAll}
        onCollapse={collapseSection}
      />
    </section>
  );
}
