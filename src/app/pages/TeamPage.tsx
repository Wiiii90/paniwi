import { type CSSProperties } from "react";
import { participantTeams } from "../../config/teams";
import { buildPlayerScores } from "../../domain/buildLeaderboard";
import { isCompetitionScorerAggregateGoal } from "../../domain/effectiveGoals";
import { sortGoalsChronologically } from "../../domain/sortGoals";
import type { ScoredGoal } from "../../domain/goalTypes";
import type { MatchRecord } from "../../domain/matchTypes";
import type { PickStatusEntry, PickStatusSnapshot } from "../../domain/pickStatusTypes";
import type { RosterSnapshot } from "../../domain/rosterTypes";
import { GoalFeedStrip } from "../components/GoalFeedStrip";
import { LinkButton } from "../components/LinkButton";
import { TeamFlag } from "../components/TeamFlag";

type TeamPageProps = {
  owner: string;
  goals: ScoredGoal[];
  matches: MatchRecord[];
  pickStatuses: PickStatusSnapshot;
  rosters: RosterSnapshot;
};

function formatRosterStatus(status: string | undefined, tournamentStatus: string | undefined, position: string | undefined): string {
  const labels: string[] = [];
  const isGoalkeeper = position === "goalkeeper";

  if (tournamentStatus === "eliminated") {
    return "ausgeschieden";
  }

  if (status === "not-nominated") {
    labels.push("Niete");
    if (isGoalkeeper) {
      labels.push("Torwart");
    }
    return labels.join(" · ");
  }

  if (status === "nominated") {
    labels.push("nominiert");
  }

  if (status === "late-callup") {
    labels.push("nachnominiert");
  }

  if (labels.length === 0) {
    labels.push("ungeprüft");
  }

  if (isGoalkeeper) {
    labels.push("Torwart");
  }

  return labels.join(" · ");
}

function getRosterStatus(
  pickStatuses: PickStatusSnapshot,
  owner: string,
  pickId: string
): PickStatusEntry | undefined {
  return pickStatuses.picks.find((entry) => entry.owner === owner && entry.pickId === pickId);
}

function getRosterStatusClassName(status: PickStatusEntry | undefined): string {
  if (status?.displayStatus === "not-nominated") {
    return "roster-miss";
  }

  if (status?.tournamentStatus === "eliminated") {
    return "roster-eliminated";
  }

  if (status?.displayStatus === "late-callup") {
    return "roster-late-callup";
  }

  return "muted";
}

export function TeamPage({ owner, goals, matches, pickStatuses, rosters }: TeamPageProps) {
  const baseUrl = import.meta.env.BASE_URL;
  const team = participantTeams.find((candidate) => candidate.owner.toLowerCase() === owner.toLowerCase());

  if (!team) {
    return (
      <section className="page-stack">
        <div className="page-title">
          <h1>Team nicht gefunden</h1>
        </div>
        <p className="empty-state">Dieses Team ist nicht in der statischen Teamkonfiguration enthalten.</p>
        <LinkButton href={baseUrl}>Zurück zur Tabelle</LinkButton>
      </section>
    );
  }

  const playerScores = buildPlayerScores(team, goals, rosters);
  const teamGoals = sortGoalsChronologically(
    goals.filter((goal) => goal.owner === team.owner && !isCompetitionScorerAggregateGoal(goal))
  );
  const playerRows = playerScores.map((player) => ({
    ...player,
    pickStatus: getRosterStatus(pickStatuses, team.owner, player.pickId)
  }));

  return (
    <section className="page-stack">
      <div className="page-title team-title">
        <div className="team-title-copy">
          <span>Panini-Team</span>
          <h1 style={{ "--participant-color": team.color ?? "var(--color-text)" } as CSSProperties}>{team.owner}</h1>
        </div>
        <strong className="team-points-chip">
          <span>{playerScores.reduce((sum, player) => sum + player.points, 0)}</span>
          Punkte
        </strong>
      </div>

      <div className="table-card">
        <div className="table-header player-grid">
          <span>Spieler</span>
          <span>Land</span>
          <span>Kader</span>
          <span>Pts</span>
        </div>
        {playerRows.map((player) => (
          <div className="player-grid player-row" key={`${player.name}-${player.nationalTeam}`}>
            <strong>{player.name}</strong>
            <span className="team-roster-country" data-label="Land">
              <TeamFlag className="team-roster-flag" teamName={player.nationalTeam} />
              <span>{player.nationalTeam}</span>
            </span>
            <span className={getRosterStatusClassName(player.pickStatus)} data-label="Kader">
              {formatRosterStatus(player.pickStatus?.displayStatus, player.pickStatus?.tournamentStatus, player.pickStatus?.position ?? player.position)}
            </span>
            <span data-label="Pts">{player.points}</span>
          </div>
        ))}
      </div>

      <GoalFeedStrip goals={teamGoals.slice().reverse()} matches={matches} title="Torschützen-Historie" />
    </section>
  );
}
