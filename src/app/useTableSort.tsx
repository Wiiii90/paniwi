import { useState } from "react";

export type SortDirection = "asc" | "desc";

type UseTableSortOptions<Key extends string> = {
  initialKey: Key;
  labels: Record<Key, string>;
  getInitialDirection: (key: Key) => SortDirection;
  onSortChange?: () => void;
};

export function useTableSort<Key extends string>({
  initialKey,
  labels,
  getInitialDirection,
  onSortChange
}: UseTableSortOptions<Key>) {
  const [sortKey, setSortKey] = useState<Key>(initialKey);
  const [sortDirection, setSortDirection] = useState<SortDirection>(getInitialDirection(initialKey));

  function updateSort(nextSortKey: Key): void {
    onSortChange?.();
    if (nextSortKey === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextSortKey);
    setSortDirection(getInitialDirection(nextSortKey));
  }

  function renderSortButton(nextSortKey: Key) {
    const isActive = sortKey === nextSortKey;
    const directionLabel = sortDirection === "asc" ? "aufsteigend" : "absteigend";

    return (
      <button
        aria-label={`${labels[nextSortKey]} sortieren${isActive ? `, aktuell ${directionLabel}` : ""}`}
        aria-sort={isActive ? (sortDirection === "asc" ? "ascending" : "descending") : undefined}
        className="table-sort-button"
        onClick={() => updateSort(nextSortKey)}
        type="button"
      >
        {labels[nextSortKey]}
        {isActive ? <span>{sortDirection === "asc" ? "▲" : "▼"}</span> : null}
      </button>
    );
  }

  return { renderSortButton, sortDirection, sortKey };
}
