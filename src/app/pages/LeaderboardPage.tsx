import { useMemo, useState } from "react";
import type { PickStatusSnapshot } from "../../domain/pickStatusTypes";
import type { LeaderboardEntry, ScoredGoal } from "../../domain/types";

type LeaderboardPageProps = {
  goals: ScoredGoal[];
  leaderboard: LeaderboardEntry[];
  pickStatuses: PickStatusSnapshot;
};

type SortKey = "rank" | "owner" | "misses" | "topScorer" | "playersWithGoals" | "points";
type SortDirection = "asc" | "desc";

type LeaderboardRow = LeaderboardEntry & {
  misses: number;
  topScorerLabel: string;
  topScorerGoals: number;
};

const sortLabels: Record<SortKey, string> = {
  rank: "Rang",
  owner: "Spieler",
  misses: "Nieten",
  topScorer: "Toptorschütze",
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

function getTopScorers(goals: ScoredGoal[]): Map<string, { names: string[]; goals: number }> {
  const goalsByOwnerAndPlayer = new Map<string, Map<string, number>>();

  for (const goal of goals) {
    const ownerGoals = goalsByOwnerAndPlayer.get(goal.owner) ?? new Map<string, number>();
    ownerGoals.set(goal.displayPlayerName, (ownerGoals.get(goal.displayPlayerName) ?? 0) + goal.points);
    goalsByOwnerAndPlayer.set(goal.owner, ownerGoals);
  }

  const topScorers = new Map<string, { names: string[]; goals: number }>();
  for (const [owner, playerGoals] of goalsByOwnerAndPlayer.entries()) {
    const sorted = [...playerGoals.entries()].sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }

      return left[0].localeCompare(right[0], "de");
    });
    const topGoalCount = sorted[0]?.[1] ?? 0;
    topScorers.set(owner, {
      names: sorted.filter(([, goalCount]) => goalCount === topGoalCount).map(([name]) => name),
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

export function LeaderboardPage({ goals, leaderboard, pickStatuses }: LeaderboardPageProps) {
  const baseUrl = import.meta.env.BASE_URL;
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const lastPlaceOwners = getLastPlaceOwners(leaderboard);
  const maxPoints = leaderboard.length > 0 ? Math.max(...leaderboard.map((entry) => entry.points)) : 0;
  const jackpotOwners = new Set(leaderboard.filter((entry) => entry.points === maxPoints).map((entry) => entry.owner));
  const rows = useMemo(() => {
    const missCounts = getMissCounts(pickStatuses);
    const topScorers = getTopScorers(goals);

    return leaderboard.map((entry) => {
      const topScorer = topScorers.get(entry.owner);

      return {
        ...entry,
        misses: missCounts.get(entry.owner) ?? 0,
        topScorerLabel: topScorer && topScorer.goals > 0 ? topScorer.names.join(", ") : "-",
        topScorerGoals: topScorer?.goals ?? 0
      };
    });
  }, [goals, leaderboard, pickStatuses]);
  const sortedRows = rows.slice().sort((left, right) => {
    const result = compareRows(left, right, sortKey);
    return sortDirection === "asc" ? result : -result;
  });

  function updateSort(nextSortKey: SortKey): void {
    if (nextSortKey === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextSortKey);
    setSortDirection(nextSortKey === "rank" || nextSortKey === "owner" || nextSortKey === "topScorer" ? "asc" : "desc");
  }

  function renderSortButton(nextSortKey: SortKey) {
    const isActive = sortKey === nextSortKey;
    const directionLabel = sortDirection === "asc" ? "aufsteigend" : "absteigend";

    return (
      <button
        aria-label={`${sortLabels[nextSortKey]} sortieren${isActive ? `, aktuell ${directionLabel}` : ""}`}
        aria-sort={isActive ? (sortDirection === "asc" ? "ascending" : "descending") : undefined}
        className="table-sort-button"
        onClick={() => updateSort(nextSortKey)}
        type="button"
      >
        {sortLabels[nextSortKey]}
        {isActive ? <span>{sortDirection === "asc" ? "▲" : "▼"}</span> : null}
      </button>
    );
  }

  return (
    <section className="page-stack">
      <div className="table-card leaderboard-table">
        <div className="table-header leaderboard-grid">
          <span>{renderSortButton("rank")}</span>
          <span>{renderSortButton("owner")}</span>
          <span>{renderSortButton("misses")}</span>
          <span>{renderSortButton("topScorer")}</span>
          <span>{renderSortButton("playersWithGoals")}</span>
          <span>{renderSortButton("points")}</span>
        </div>
        {sortedRows.length === 0 ? (
          <p className="empty-state">Noch keine Teams im Snapshot.</p>
        ) : (
          sortedRows.map((entry) => {
            const hasRedLantern = lastPlaceOwners.has(entry.owner);
            const hasJackpot = jackpotOwners.has(entry.owner);

            return (
              <a className="leaderboard-grid leaderboard-row" href={`${baseUrl}team/${encodeURIComponent(entry.owner)}`} key={entry.owner}>
                <span className="rank" data-label="Rang">{entry.rank}</span>
                <span className="owner">
                  {entry.owner}
                  {hasJackpot ? <img className="award-icon" src={`${baseUrl}assets/money-pot.png`} alt="Geldtopf" /> : null}
                  {hasRedLantern ? <img className="award-icon" src={`${baseUrl}assets/red-lantern.png`} alt="Rote Laterne" /> : null}
                </span>
                <span data-label="Nieten">{entry.misses}</span>
                <span className="top-scorer-cell" data-label="Toptorschütze" title={entry.topScorerLabel}>
                  {entry.topScorerGoals > 0 ? `${entry.topScorerLabel} (${entry.topScorerGoals})` : "-"}
                </span>
                <span data-label="Torschützen">{entry.playersWithGoals}</span>
                <strong data-label="Punkte">{entry.points}</strong>
              </a>
            );
          })
        )}
      </div>
    </section>
  );
}
