import type { ScoredGoal, ScorerEntry } from "../../domain/goalTypes";
import type { MatchRecord } from "../../domain/matchTypes";
import type { LeaderboardEntry } from "../../domain/participantTypes";
import { isCompetitionScorerAggregateGoal } from "../../domain/effectiveGoals";
import { getLiveAndUpcomingMatches } from "../../domain/matchFilters";
import { sortGoalsChronologically } from "../../domain/sortGoals";
import { GoalFeedStrip } from "../components/GoalFeedStrip";
import { TeamFlag } from "../components/TeamFlag";
import { formatKickoff, formatMatchScore } from "../formatters/matchFormat";

type HomePageProps = {
  leaderboard: LeaderboardEntry[];
  goals: ScoredGoal[];
  scorers: ScorerEntry[];
  matches: MatchRecord[];
};

function formatMatchImpact(match: MatchRecord): string | null {
  const selectedParticipants = match.participants.filter((participant) => participant.selected && participant.owners.length > 0);
  if (selectedParticipants.length === 0) {
    return null;
  }

  const visibleParticipants = selectedParticipants.slice(0, 2).map((participant) => `${participant.owners.join("/")} · ${participant.displayPlayerName}`);
  const remainingCount = selectedParticipants.length - visibleParticipants.length;
  return remainingCount > 0 ? `${visibleParticipants.join(" · ")} · +${remainingCount}` : visibleParticipants.join(" · ");
}

function FlaggedName({ name, teamName }: { name: string; teamName: string }) {
  return (
    <span className="home-flagged-name">
      <TeamFlag className="home-match-flag" teamName={teamName} />
      <span>{name}</span>
    </span>
  );
}

function formatLeaderboardMeta(entry: LeaderboardEntry): string {
  const pointsLabel = entry.points === 1 ? "Punkt" : "Punkte";
  const scorersLabel = entry.playersWithGoals === 1 ? "Torschütze" : "Torschützen";
  return `${entry.points} ${pointsLabel} · ${entry.playersWithGoals} ${scorersLabel}`;
}

function PreviewMore({ visible, total }: { visible: number; total: number }) {
  if (total <= visible) {
    return null;
  }

  return (
    <div className="mini-more" aria-label={`${total - visible} weitere Einträge`}>
      <span aria-hidden="true" />
      <span aria-hidden="true" />
      <span aria-hidden="true" />
    </div>
  );
}

type OwnedScorerPreview = {
  key: string;
  playerName: string;
  nationalTeam: string;
  owners: string[];
  goals: number;
};

function getOwnedScorerPreviews(scorers: ScorerEntry[]): OwnedScorerPreview[] {
  return scorers
    .filter((scorer) => scorer.selected)
    .map((scorer) => ({
      key: `${scorer.normalizedPlayerName}-${scorer.nationalTeam}`,
      playerName: scorer.playerName,
      nationalTeam: scorer.nationalTeam,
      owners: scorer.scoringOwners,
      goals: scorer.goals
    }));
}

export function HomePage({ leaderboard, goals, scorers, matches }: HomePageProps) {
  const baseUrl = import.meta.env.BASE_URL;
  const latestGoals = sortGoalsChronologically(goals.filter((goal) => !isCompetitionScorerAggregateGoal(goal))).reverse();
  const ownedScorers = getOwnedScorerPreviews(scorers);
  const tableLeaders = leaderboard.slice(0, 6);
  const topOwnedScorers = ownedScorers.slice(0, 6);
  const topScorers = scorers.slice(0, 4);
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
                    <small>{formatLeaderboardMeta(entry)}</small>
                  </span>
                  <span>{entry.rank}. Platz</span>
                </div>
              ))}
              <PreviewMore visible={tableLeaders.length} total={leaderboard.length} />
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
            {topOwnedScorers.length === 0 ? (
              <p className="empty-inline">Noch keine Tore.</p>
            ) : (
              topOwnedScorers.map((scorer) => (
                <div className="mini-row" key={`${scorer.key}-${scorer.nationalTeam}`}>
                  <span>
                    <strong>
                      <FlaggedName name={scorer.playerName} teamName={scorer.nationalTeam} />
                    </strong>
                    <small>{scorer.owners.join(", ")}</small>
                  </span>
                  <span>{scorer.goals} {scorer.goals === 1 ? "Tor" : "Tore"}</span>
                </div>
              ))
            )}
            <PreviewMore visible={topOwnedScorers.length} total={ownedScorers.length} />
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
                    <strong>
                      <FlaggedName name={scorer.playerName} teamName={scorer.nationalTeam} />
                    </strong>
                    <small>{scorer.nationalTeam}</small>
                  </span>
                  <span>{scorer.goals} Tore</span>
                </div>
              ))
            )}
            <PreviewMore visible={topScorers.length} total={scorers.length} />
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
                        <span className="match-name-text">
                          <span className="home-match-team">
                            <TeamFlag className="home-match-flag" teamName={match.homeTeam.name} />
                            <span>{match.homeTeam.name}</span>
                          </span>
                          <span aria-hidden="true">-</span>
                          <span className="home-match-team">
                            <TeamFlag className="home-match-flag" teamName={match.awayTeam.name} />
                            <span>{match.awayTeam.name}</span>
                          </span>
                        </span>
                      </strong>
                      <small>
                        {formatKickoff(match.kickedOffAt, {
                          weekday: "short",
                          day: "2-digit",
                          month: "2-digit",
                          year: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit"
                        })}
                        {match.pointGoals.length > 0 ? ` · ${match.pointGoals.length} Panini-Tore` : ""}
                      </small>
                      {matchImpact ? <small className="match-impact-line">{matchImpact}</small> : null}
                    </span>
                    <span className="match-mini-score">{formatMatchScore(match, "offen")}</span>
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
