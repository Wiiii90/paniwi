import { useMemo, useState } from "react";
import type { ScorerEntry } from "../../domain/types";
import { teams } from "../../config/teams";
import { teamCatalog } from "../../config/teamCatalog";
import { TeamFlag } from "../components/TeamFlag";
import { useTableSort } from "../useTableSort";

type GoalsPageProps = {
  scorers: ScorerEntry[];
};

type OwnershipFilter = "all" | "owned";
type SortKey = "rank" | "playerName" | "nationalTeam" | "ownerLabel" | "goals";

type ScorerRow = ScorerEntry & {
  ownerLabel: string;
};

const sortLabels: Record<SortKey, string> = {
  rank: "Pl.",
  playerName: "Spieler",
  nationalTeam: "Land",
  ownerLabel: "Besitzer",
  goals: "Tore"
};

const basePageSizeOptions = [10, 20, 50, 100];

function matchesSearch(row: ScorerRow, searchTerm: string): boolean {
  if (!searchTerm) {
    return true;
  }

  const haystack = [
    row.playerName,
    row.nationalTeam,
    row.ownerLabel,
    String(row.goals)
  ].join(" ").toLowerCase();

  return haystack.includes(searchTerm);
}

function compareRows(left: ScorerRow, right: ScorerRow, sortKey: SortKey): number {
  if (sortKey === "rank" || sortKey === "goals") {
    return left[sortKey] - right[sortKey];
  }

  return left[sortKey].localeCompare(right[sortKey], "de");
}

function getPageSizeOptions(resultCount: number, currentPageSize: number): number[] {
  const visibleOptions = basePageSizeOptions.filter((option) => option <= 20 || option <= resultCount);
  const allRowsOption = basePageSizeOptions.find((option) => option >= resultCount);
  const options = new Set([...visibleOptions, allRowsOption ?? basePageSizeOptions.at(-1), currentPageSize]);

  return [...options].filter((option): option is number => typeof option === "number").sort((left, right) => left - right);
}

export function GoalsPage({ scorers }: GoalsPageProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [ownershipFilter, setOwnershipFilter] = useState<OwnershipFilter>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.has("besitzer") || params.has("mit-besitzer") ? "owned" : "all";
  });
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");
  const [minGoals, setMinGoals] = useState("1");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const { renderSortButton, sortDirection, sortKey } = useTableSort<SortKey>({
    initialKey: "rank",
    labels: sortLabels,
    getInitialDirection: (key) => (key === "goals" ? "desc" : "asc"),
    onSortChange: () => setPage(1)
  });

  const rows = useMemo<ScorerRow[]>(() => {
    return scorers.map((scorer) => ({
      ...scorer,
      ownerLabel: scorer.scoringOwners.length > 0 ? scorer.scoringOwners.join(", ") : "-"
    }));
  }, [scorers]);

  const owners = useMemo(
    () => [...new Set(teams.map((team) => team.owner))].sort((a, b) => a.localeCompare(b, "de")),
    []
  );
  const countries = useMemo(() => teamCatalog.map((team) => team.displayName).sort((a, b) => a.localeCompare(b, "de")), []);
  const filteredRows = rows.filter((row) => {
    const parsedMinGoals = minGoals === "" ? 1 : Number(minGoals);
    return (
      (ownershipFilter === "all" || row.selected) &&
      (ownerFilter === "all" || row.scoringOwners.includes(ownerFilter)) &&
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
  const pageSizeOptions = getPageSizeOptions(sortedRows.length, pageSize);

  function resetPage(): void {
    setPage(1);
  }

  return (
    <section className="page-stack">
      <div className="table-card">
        {filtersOpen ? (
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
              <input min="1" onChange={(event) => { setMinGoals(event.target.value); resetPage(); }} type="number" value={minGoals} />
            </label>
            <label className="scorer-search">
              Suche
              <input onChange={(event) => { setSearch(event.target.value); resetPage(); }} placeholder="Name, Besitzer, Land..." type="search" value={search} />
            </label>
          </div>
        ) : null}
        <div className="table-header scorer-grid">
          <span>{renderSortButton("rank")}</span>
          <span>{renderSortButton("playerName")}</span>
          <span>{renderSortButton("nationalTeam")}</span>
          <span>{renderSortButton("ownerLabel")}</span>
          <span className="scorer-goals-header">
            {renderSortButton("goals")}
            <button
              aria-expanded={filtersOpen}
              aria-label={filtersOpen ? "Filter ausblenden" : "Filter öffnen"}
              className="table-filter-icon"
              onClick={() => setFiltersOpen((current) => !current)}
              title={filtersOpen ? "Filter ausblenden" : "Filter"}
              type="button"
            >
              ≡
            </button>
          </span>
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
              <span className="team-roster-country" data-label="Land">
                <TeamFlag className="team-roster-flag" teamName={scorer.nationalTeam} />
                <span>{scorer.nationalTeam}</span>
              </span>
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
