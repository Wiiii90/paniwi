import { useMemo, useState } from "react";
import { normalizePlayerName } from "../../domain/normalizePlayerName";
import type { ScorerEntry } from "../../domain/types";
import type { PlayerPosition, RosterSnapshot } from "../../domain/rosterTypes";

type GoalsPageProps = {
  rosters: RosterSnapshot;
  scorers: ScorerEntry[];
};

type OwnershipFilter = "all" | "owned";
type SortDirection = "asc" | "desc";
type SortKey = "rank" | "playerName" | "nationalTeam" | "position" | "ownerLabel" | "goals";

type ScorerRow = ScorerEntry & {
  position?: PlayerPosition;
  ownerLabel: string;
};

const sortLabels: Record<SortKey, string> = {
  rank: "Pl.",
  playerName: "Spieler",
  nationalTeam: "Land",
  position: "Position",
  ownerLabel: "Besitzer",
  goals: "Tore"
};

const pageSizeOptions = [10, 25, 50, 100];

function formatPosition(position: PlayerPosition | undefined): string {
  if (position === "goalkeeper") {
    return "Tor";
  }
  if (position === "defender") {
    return "Abwehr";
  }
  if (position === "midfielder") {
    return "Mittelfeld";
  }
  if (position === "forward") {
    return "Sturm";
  }
  return "-";
}

function buildPositionIndex(rosters: RosterSnapshot): Map<string, PlayerPosition> {
  const index = new Map<string, PlayerPosition>();
  for (const team of rosters.teams) {
    for (const player of team.players) {
      if (player.position === "unknown") {
        continue;
      }
      index.set(`${player.normalizedPlayerName}|${team.teamName}`, player.position);
      if (team.teamId) {
        index.set(`${player.normalizedPlayerName}|${team.teamId}`, player.position);
      }
      index.set(player.normalizedPlayerName, player.position);
    }
  }
  return index;
}

function getScorerPosition(scorer: ScorerEntry, positionIndex: Map<string, PlayerPosition>): PlayerPosition | undefined {
  const normalizedNationalTeam = normalizePlayerName(scorer.nationalTeam);
  return (
    positionIndex.get(`${scorer.normalizedPlayerName}|${scorer.nationalTeam}`) ??
    positionIndex.get(`${scorer.normalizedPlayerName}|${normalizedNationalTeam}`) ??
    positionIndex.get(scorer.normalizedPlayerName)
  );
}

function matchesSearch(row: ScorerRow, searchTerm: string): boolean {
  if (!searchTerm) {
    return true;
  }

  const haystack = [
    row.playerName,
    row.nationalTeam,
    formatPosition(row.position),
    row.ownerLabel,
    String(row.goals)
  ].join(" ").toLowerCase();

  return haystack.includes(searchTerm);
}

function compareRows(left: ScorerRow, right: ScorerRow, sortKey: SortKey): number {
  if (sortKey === "rank" || sortKey === "goals") {
    return left[sortKey] - right[sortKey];
  }

  if (sortKey === "position") {
    return formatPosition(left.position).localeCompare(formatPosition(right.position), "de");
  }

  return left[sortKey].localeCompare(right[sortKey], "de");
}

export function GoalsPage({ rosters, scorers }: GoalsPageProps) {
  const [ownershipFilter, setOwnershipFilter] = useState<OwnershipFilter>("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [positionFilter, setPositionFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");
  const [minGoals, setMinGoals] = useState("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const rows = useMemo<ScorerRow[]>(() => {
    const positionIndex = buildPositionIndex(rosters);
    return scorers.map((scorer) => ({
      ...scorer,
      ownerLabel: scorer.scoringOwners.length > 0 ? scorer.scoringOwners.join(", ") : "-",
      position: getScorerPosition(scorer, positionIndex)
    }));
  }, [rosters, scorers]);

  const owners = useMemo(
    () => [...new Set(rows.flatMap((row) => row.scoringOwners))].sort((a, b) => a.localeCompare(b, "de")),
    [rows]
  );
  const countries = useMemo(
    () => [...new Set(rows.map((row) => row.nationalTeam))].sort((a, b) => a.localeCompare(b, "de")),
    [rows]
  );
  const positions = useMemo(
    () => [...new Set(rows.map((row) => row.position).filter((position): position is PlayerPosition => Boolean(position)))],
    [rows]
  );

  const filteredRows = rows.filter((row) => {
    const parsedMinGoals = minGoals === "" ? 0 : Number(minGoals);
    return (
      (ownershipFilter === "all" || row.selected) &&
      (ownerFilter === "all" || row.scoringOwners.includes(ownerFilter)) &&
      (positionFilter === "all" || row.position === positionFilter) &&
      (countryFilter === "all" || row.nationalTeam === countryFilter) &&
      row.goals >= parsedMinGoals &&
      matchesSearch(row, search.trim().toLowerCase())
    );
  });
  const sortedRows = filteredRows.slice().sort((left, right) => {
    const result = compareRows(left, right, sortKey);
    if (result !== 0) {
      return sortDirection === "asc" ? result : -result;
    }

    return left.playerName.localeCompare(right.playerName, "de") || left.nationalTeam.localeCompare(right.nationalTeam, "de");
  });
  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageStart = (safePage - 1) * pageSize;
  const pageRows = sortedRows.slice(pageStart, pageStart + pageSize);
  const firstVisibleResult = sortedRows.length === 0 ? 0 : pageStart + 1;
  const lastVisibleResult = Math.min(pageStart + pageSize, sortedRows.length);

  function resetPage(): void {
    setPage(1);
  }

  function updateSort(nextSortKey: SortKey): void {
    resetPage();
    if (nextSortKey === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextSortKey);
    setSortDirection(nextSortKey === "rank" || nextSortKey === "playerName" || nextSortKey === "nationalTeam" ? "asc" : "desc");
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
      <div className="table-card">
        <div className="scorer-filter-row">
          <div className="segmented-control" aria-label="Besitzer-Filter">
            <button className={ownershipFilter === "all" ? "active" : ""} onClick={() => { setOwnershipFilter("all"); resetPage(); }} type="button">
              Alle
            </button>
            <button className={ownershipFilter === "owned" ? "active" : ""} onClick={() => { setOwnershipFilter("owned"); resetPage(); }} type="button">
              Mit Besitzer
            </button>
          </div>
          <label>
            Besitzer
            <select onChange={(event) => { setOwnerFilter(event.target.value); resetPage(); }} value={ownerFilter}>
              <option value="all">Alle</option>
              {owners.map((owner) => (
                <option key={owner} value={owner}>{owner}</option>
              ))}
            </select>
          </label>
          <label>
            Position
            <select onChange={(event) => { setPositionFilter(event.target.value); resetPage(); }} value={positionFilter}>
              <option value="all">Alle</option>
              {positions.map((position) => (
                <option key={position} value={position}>{formatPosition(position)}</option>
              ))}
            </select>
          </label>
          <label>
            Land
            <select onChange={(event) => { setCountryFilter(event.target.value); resetPage(); }} value={countryFilter}>
              <option value="all">Alle</option>
              {countries.map((country) => (
                <option key={country} value={country}>{country}</option>
              ))}
            </select>
          </label>
          <label>
            Tore ab
            <input min="0" onChange={(event) => { setMinGoals(event.target.value); resetPage(); }} type="number" value={minGoals} />
          </label>
          <label className="scorer-search">
            Suche
            <input onChange={(event) => { setSearch(event.target.value); resetPage(); }} placeholder="Name, Besitzer, Land..." type="search" value={search} />
          </label>
        </div>
        <div className="table-header scorer-grid">
          <span>{renderSortButton("rank")}</span>
          <span>{renderSortButton("playerName")}</span>
          <span>{renderSortButton("nationalTeam")}</span>
          <span>{renderSortButton("position")}</span>
          <span>{renderSortButton("ownerLabel")}</span>
          <span>{renderSortButton("goals")}</span>
        </div>
        {pageRows.length === 0 ? (
          <p className="empty-state">Noch keine Torschützendaten im Snapshot.</p>
        ) : (
          pageRows.map((scorer) => (
            <div className="scorer-grid player-row" key={`${scorer.normalizedPlayerName}-${scorer.nationalTeam}`}>
              <strong data-label="Pl.">{scorer.rank}</strong>
              <span>
                <strong>{scorer.playerName}</strong>
              </span>
              <span data-label="Land">{scorer.nationalTeam}</span>
              <span data-label="Position">{formatPosition(scorer.position)}</span>
              <span data-label="Besitzer" title={scorer.ownerLabel}>{scorer.ownerLabel}</span>
              <span data-label="Tore">{scorer.goals}</span>
            </div>
          ))
        )}
        <div className="table-navigation">
          <span>{firstVisibleResult}-{lastVisibleResult} von {sortedRows.length}</span>
          <label>
            Zeilen
            <select
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                resetPage();
              }}
              value={pageSize}
            >
              {pageSizeOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <div className="table-page-buttons">
            <button disabled={safePage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} type="button">
              Zurück
            </button>
            <span>{safePage} / {pageCount}</span>
            <button disabled={safePage >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))} type="button">
              Weiter
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
