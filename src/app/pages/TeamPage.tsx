import { teams } from "../../config/teams";
import { buildPlayerScores } from "../../domain/buildLeaderboard";
import { sortGoalsChronologically } from "../../domain/sortGoals";
import type { MatchRecord, ScoredGoal } from "../../domain/types";
import type { PickStatusEntry, PickStatusSnapshot } from "../../domain/pickStatusTypes";
import type { RosterSnapshot } from "../../domain/rosterTypes";
import { LinkButton } from "../components/LinkButton";
import { formatGoalMinute, formatTimeConfidence } from "../formatGoal";

type TeamPageProps = {
  owner: string;
  goals: ScoredGoal[];
  matches: MatchRecord[];
  pickStatuses: PickStatusSnapshot;
  rosters: RosterSnapshot;
};

function formatPosition(position: string | undefined): string {
  if (position === "goalkeeper") {
    return "Torwart";
  }

  return "—";
}

function formatRosterStatus(status: string | undefined): string {
  if (status === "nominated") {
    return "nominiert";
  }

  if (status === "late-callup") {
    return "nachnominiert";
  }

  if (status === "not-nominated") {
    return "Niete";
  }

  return "ungeprüft";
}

function getRosterStatus(
  pickStatuses: PickStatusSnapshot,
  owner: string,
  pickId: string
): PickStatusEntry["displayStatus"] | undefined {
  return pickStatuses.picks.find((entry) => entry.owner === owner && entry.pickId === pickId)?.displayStatus;
}

function getRosterStatusClassName(status: PickStatusEntry["displayStatus"] | undefined): string {
  if (status === "not-nominated") {
    return "roster-miss";
  }

  if (status === "late-callup") {
    return "roster-late-callup";
  }

  return "muted";
}

export function TeamPage({ owner, goals, matches, pickStatuses, rosters }: TeamPageProps) {
  const baseUrl = import.meta.env.BASE_URL;
  const team = teams.find((candidate) => candidate.owner.toLowerCase() === owner.toLowerCase());

  if (!team) {
    return (
      <section className="page-stack">
        <div className="hero-band">
          <div>
            <p className="eyebrow">Teamdetails</p>
            <h1>Team nicht gefunden</h1>
          </div>
        </div>
        <p className="empty-state">Dieses Team ist nicht in der statischen Teamkonfiguration enthalten.</p>
        <LinkButton href={baseUrl}>Zurück zur Tabelle</LinkButton>
      </section>
    );
  }

  const playerScores = buildPlayerScores(team, goals, rosters);
  const teamGoals = sortGoalsChronologically(goals.filter((goal) => goal.owner === team.owner));
  const affectedMatches = matches.filter((match) => match.affectedOwners.includes(team.owner));
  const playerRows = playerScores.map((player) => ({
    ...player,
    rosterStatus: getRosterStatus(pickStatuses, team.owner, player.pickId)
  }));
  const goalsByPlayer = new Map<string, ScoredGoal[]>();
  for (const goal of teamGoals) {
    const playerGoals = goalsByPlayer.get(goal.pickedPlayerName) ?? [];
    playerGoals.push(goal);
    goalsByPlayer.set(goal.pickedPlayerName, playerGoals);
  }

  return (
    <section className="page-stack">
      <div className="hero-band" style={{ borderColor: team.color }}>
        <div>
          <p className="eyebrow">Teamdetails</p>
          <h1>{team.owner}</h1>
        </div>
        <strong>{playerScores.reduce((sum, player) => sum + player.points, 0)} Pkt.</strong>
      </div>

      <div className="table-card">
        <div className="table-header player-grid">
          <span>Spieler</span>
          <span>Land</span>
          <span>Position</span>
          <span>Kader</span>
          <span>Pts</span>
        </div>
        {playerRows.map((player) => (
          <div className="player-grid player-row" key={`${player.name}-${player.nationalTeam}`}>
            <strong>{player.name}</strong>
            <span data-label="Land">{player.nationalTeam}</span>
            <span className="muted" data-label="Position">{formatPosition(player.position)}</span>
            <span className={getRosterStatusClassName(player.rosterStatus)} data-label="Kader">
              {formatRosterStatus(player.rosterStatus)}
            </span>
            <span data-label="Pts">{player.points}</span>
          </div>
        ))}
      </div>

      <h2>Treffer dieses Teams</h2>
      <div className="player-history-list">
        {teamGoals.length === 0 ? (
          <p className="empty-state">Noch keine Treffer für dieses Team.</p>
        ) : (
          playerRows
            .filter((player) => player.points > 0)
            .map((player) => (
              <section className="player-history" key={`${player.name}-${player.nationalTeam}`}>
                <div className="player-history-header">
                  <strong>{player.name}</strong>
                  <span>
                    {player.goals} Tore · {player.points} Pkt.
                  </span>
                </div>
                <div className="feed-list">
                  {(goalsByPlayer.get(player.name) ?? []).map((goal) => (
                    <article className="feed-item compact-feed-item" key={`${goal.externalGoalId}-${goal.owner}-${goal.playerId}`}>
                      <span>{goal.matchLabel ?? "Spiel offen"}</span>
                      <span>
                        {formatGoalMinute(goal)} · {formatTimeConfidence(goal.timeConfidence)} · {goal.points} Punkt
                      </span>
                    </article>
                  ))}
                </div>
              </section>
            ))
        )}
      </div>

      <h2>Gespielte Spiele mit Punkten</h2>
      <div className="match-list">
        {affectedMatches.length === 0 ? (
          <p className="empty-state">Noch kein Spiel mit Punkten für dieses Team.</p>
        ) : (
          affectedMatches.map((match) => (
            <article className="match-card" key={match.matchId}>
              <div className="match-card-header">
                <span>{match.kickedOffAt ? new Date(match.kickedOffAt).toLocaleString("de-DE") : "Termin offen"}</span>
                <strong>{match.pointGoals.filter((goal) => goal.owner === team.owner).length} Treffer</strong>
              </div>
              <div className="match-scoreline">
                <span>{match.homeTeam.name}</span>
                <strong>
                  {match.homeTeam.score ?? "-"}:{match.awayTeam.score ?? "-"}
                </strong>
                <span>{match.awayTeam.name}</span>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
