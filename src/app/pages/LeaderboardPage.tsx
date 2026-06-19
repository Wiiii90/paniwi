import { useMemo, type CSSProperties } from "react";
import type { PickStatusSnapshot } from "../../domain/pickStatusTypes";
import type { ScoredGoal } from "../../domain/goalTypes";
import type { LeaderboardEntry } from "../../domain/participantTypes";
import { participantTeams } from "../../config/teams";
import { TeamFlag } from "../components/TeamFlag";
import { useTableSort } from "../useTableSort";

type LeaderboardPageProps = {
  goals: ScoredGoal[];
  leaderboard: LeaderboardEntry[];
  pickStatuses: PickStatusSnapshot;
};

type SortKey = "rank" | "owner" | "misses" | "topScorer" | "playersWithGoals" | "points";

type LeaderboardRow = LeaderboardEntry & {
  color?: string;
  misses: number;
  topScorerLabel: string;
  topScorerGoals: number;
  topScorers: Array<{ name: string; nationalTeam: string }>;
};

const sortLabels: Record<SortKey, string> = {
  rank: "Pl.",
  owner: "Liga-Teilnehmer",
  misses: "Nieten",
  topScorer: "Topspieler",
  playersWithGoals: "Torschützen",
  points: "Punkte"
};

function getLastPlaceOwners(leaderboard: LeaderboardEntry[]): Set<string> {
  if (leaderboard.length === 0) {
    return new Set();
  }

  const minPoints = Math.min(...leaderboard.map((entry) => entry.points));
  return new Set(leaderboard.filter((entry) => entry.points === minPoints).map((entry) => entry.owner));
}

function getMissCounts(pickStatuses: PickStatusSnapshot): Map<string, number> {
  const counts = new Map<string, number>();

  for (const pick of pickStatuses.picks) {
    if (pick.displayStatus !== "not-nominated") {
      continue;
    }

    counts.set(pick.owner, (counts.get(pick.owner) ?? 0) + 1);
  }

  return counts;
}

function getTopScorers(goals: ScoredGoal[]): Map<string, { players: Array<{ name: string; nationalTeam: string }>; goals: number }> {
  const goalsByOwnerAndPlayer = new Map<string, Map<string, { goals: number; nationalTeam: string }>>();

  for (const goal of goals) {
    const ownerGoals = goalsByOwnerAndPlayer.get(goal.owner) ?? new Map<string, { goals: number; nationalTeam: string }>();
    const current = ownerGoals.get(goal.displayPlayerName);
    ownerGoals.set(goal.displayPlayerName, {
      goals: (current?.goals ?? 0) + goal.points,
      nationalTeam: goal.displayNationalTeam
    });
    goalsByOwnerAndPlayer.set(goal.owner, ownerGoals);
  }

  const topScorers = new Map<string, { players: Array<{ name: string; nationalTeam: string }>; goals: number }>();
  for (const [owner, playerGoals] of goalsByOwnerAndPlayer.entries()) {
    const sorted = [...playerGoals.entries()].sort((left, right) => {
      if (right[1].goals !== left[1].goals) {
        return right[1].goals - left[1].goals;
      }

      return left[0].localeCompare(right[0], "de");
    });
    const topGoalCount = sorted[0]?.[1].goals ?? 0;
    topScorers.set(owner, {
      players: sorted
        .filter(([, player]) => player.goals === topGoalCount)
        .map(([name, player]) => ({ name, nationalTeam: player.nationalTeam })),
      goals: topGoalCount
    });
  }

  return topScorers;
}

function compareRows(left: LeaderboardRow, right: LeaderboardRow, sortKey: SortKey): number {
  if (sortKey === "owner") {
    return left.owner.localeCompare(right.owner, "de");
  }

  if (sortKey === "topScorer") {
    return left.topScorerLabel.localeCompare(right.topScorerLabel, "de");
  }

  return left[sortKey] - right[sortKey];
}

function getLeaderboardSummary(goals: ScoredGoal[]): { goalCount: number; scorerCount: number } {
  const goalIds = new Set(goals.map((goal) => goal.externalGoalId));
  const scorerIds = new Set(goals.map((goal) => goal.playerId));
  return { goalCount: goalIds.size, scorerCount: scorerIds.size };
}

export function LeaderboardPage({ goals, leaderboard, pickStatuses }: LeaderboardPageProps) {
  const baseUrl = import.meta.env.BASE_URL;
  const ballIconUrl = `${baseUrl}assets/ball.svg`;
  const { renderSortButton, sortDirection, sortKey } = useTableSort<SortKey>({
    initialKey: "rank",
    labels: sortLabels,
    getInitialDirection: (key) => (key === "rank" || key === "owner" || key === "topScorer" ? "asc" : "desc")
  });
  const lastPlaceOwners = getLastPlaceOwners(leaderboard);
  const maxPoints = leaderboard.length > 0 ? Math.max(...leaderboard.map((entry) => entry.points)) : 0;
  const jackpotOwners = new Set(leaderboard.filter((entry) => entry.points === maxPoints).map((entry) => entry.owner));
  const ownerColors = useMemo(() => new Map(participantTeams.map((team) => [team.owner, team.color])), []);
  const rows = useMemo(() => {
    const missCounts = getMissCounts(pickStatuses);
    const topScorers = getTopScorers(goals);

    return leaderboard.map((entry) => {
      const topScorer = topScorers.get(entry.owner);

      return {
        ...entry,
        color: ownerColors.get(entry.owner),
        misses: missCounts.get(entry.owner) ?? 0,
        topScorerLabel: topScorer && topScorer.goals > 0 ? topScorer.players.map((player) => player.name).join(", ") : "",
        topScorers: topScorer?.players ?? [],
        topScorerGoals: topScorer?.goals ?? 0
      };
    });
  }, [goals, leaderboard, ownerColors, pickStatuses]);
  const sortedRows = rows.slice().sort((left, right) => {
    const result = compareRows(left, right, sortKey);
    return sortDirection === "asc" ? result : -result;
  });
  const summary = getLeaderboardSummary(goals);

  return (
    <section className="page-stack">
      <div className="table-card leaderboard-table">
        <div className="table-header leaderboard-grid">
          <span>{renderSortButton("rank")}</span>
          <span>{renderSortButton("points")}</span>
          <span>{renderSortButton("playersWithGoals")}</span>
          <span>{renderSortButton("misses")}</span>
          <span>{renderSortButton("owner")}</span>
          <span>{renderSortButton("topScorer")}</span>
        </div>
        {sortedRows.length === 0 ? (
          <p className="empty-state">Noch keine Teams im Snapshot.</p>
        ) : (
          sortedRows.map((entry) => {
            const hasRedLantern = lastPlaceOwners.has(entry.owner);
            const hasJackpot = jackpotOwners.has(entry.owner);

            return (
              <a className="leaderboard-grid leaderboard-row" href={`${baseUrl}team/${encodeURIComponent(entry.owner)}`} key={entry.owner}>
                <span className="rank" data-label="Pl.">{entry.rank}</span>
                <strong data-label="Punkte">{entry.points}</strong>
                <span data-label="Torschützen">{entry.playersWithGoals}</span>
                <span data-label="Nieten">{entry.misses}</span>
                <span className="owner" style={{ "--participant-color": entry.color ?? "var(--color-text)" } as CSSProperties}>
                  <span className="owner-color-blob" />
                  <span className="owner-name">{entry.owner}</span>
                  {hasJackpot ? <img className="award-icon" src={`${baseUrl}assets/money-pot.png`} alt="Geldtopf" /> : null}
                  {hasRedLantern ? <img className="award-icon" src={`${baseUrl}assets/red-lantern.png`} alt="Rote Laterne" /> : null}
                </span>
                <span className="top-scorer-cell" data-label="Topspieler" title={entry.topScorerLabel}>
                  {entry.topScorerGoals > 0 ? (
                    <>
                      <span className="top-scorer-goals">
                        {entry.topScorerGoals}x <img src={ballIconUrl} alt="" aria-hidden="true" />
                      </span>
                      <span className="top-scorer-names">
                        {entry.topScorers.map((player) => (
                          <span className="top-scorer-name" key={`${entry.owner}-${player.name}-${player.nationalTeam}`}>
                            <TeamFlag className="table-player-flag" teamName={player.nationalTeam} />
                            <span>{player.name}</span>
                          </span>
                        ))}
                      </span>
                    </>
                  ) : null}
                </span>
              </a>
            );
          })
        )}
        <div className="table-footer leaderboard-footer">
          Insgesamt wurden <strong>{summary.goalCount}</strong> Tore erzielt, aufgeteilt auf <strong>{summary.scorerCount}</strong> unterschiedliche Torschützen.
        </div>
      </div>
    </section>
  );
}
