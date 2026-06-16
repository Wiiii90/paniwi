import { useMemo, useState } from "react";
import { normalizePlayerName } from "../../domain/normalizePlayerName";
import type { ScorerEntry } from "../../domain/types";
import type { PlayerPosition, RosterSnapshot } from "../../domain/rosterTypes";

type GoalsPageProps = {
  rosters: RosterSnapshot;
  scorers: ScorerEntry[];
};

type OwnershipFilter = "all" | "owned";

type ScorerRow = ScorerEntry & {
  position?: PlayerPosition;
  ownerLabel: string;
};

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

export function GoalsPage({ rosters, scorers }: GoalsPageProps) {
  const [ownershipFilter, setOwnershipFilter] = useState<OwnershipFilter>("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [positionFilter, setPositionFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");
  const [minGoals, setMinGoals] = useState("");
  const [search, setSearch] = useState("");

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

  const visibleRows = rows.filter((row) => {
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

  return (
    <section className="page-stack">
      <div className="table-card">
        <div className="table-header scorer-grid">
          <span>Pl.</span>
          <span>Spieler</span>
          <span>Land</span>
          <span>Position</span>
          <span>Besitzer</span>
          <span>Tore</span>
        </div>
        <div className="scorer-filter-row">
          <div className="segmented-control" aria-label="Besitzer-Filter">
            <button className={ownershipFilter === "all" ? "active" : ""} onClick={() => setOwnershipFilter("all")} type="button">
              Alle
            </button>
            <button className={ownershipFilter === "owned" ? "active" : ""} onClick={() => setOwnershipFilter("owned")} type="button">
              Mit Besitzer
            </button>
          </div>
          <label>
            Besitzer
            <select onChange={(event) => setOwnerFilter(event.target.value)} value={ownerFilter}>
              <option value="all">Alle</option>
              {owners.map((owner) => (
                <option key={owner} value={owner}>{owner}</option>
              ))}
            </select>
          </label>
          <label>
            Position
            <select onChange={(event) => setPositionFilter(event.target.value)} value={positionFilter}>
              <option value="all">Alle</option>
              {positions.map((position) => (
                <option key={position} value={position}>{formatPosition(position)}</option>
              ))}
            </select>
          </label>
          <label>
            Land
            <select onChange={(event) => setCountryFilter(event.target.value)} value={countryFilter}>
              <option value="all">Alle</option>
              {countries.map((country) => (
                <option key={country} value={country}>{country}</option>
              ))}
            </select>
          </label>
          <label>
            Tore ab
            <input min="0" onChange={(event) => setMinGoals(event.target.value)} type="number" value={minGoals} />
          </label>
          <label className="scorer-search">
            Suche
            <input onChange={(event) => setSearch(event.target.value)} placeholder="Name, Besitzer, Land..." type="search" value={search} />
          </label>
        </div>
        {visibleRows.length === 0 ? (
          <p className="empty-state">Noch keine Torschützendaten im Snapshot.</p>
        ) : (
          visibleRows.map((scorer) => (
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
      </div>
    </section>
  );
}
