import type { StaticMeta } from "../../domain/staticMeta";

type StatusPillProps = {
  meta: StaticMeta;
};

const freshWindowMs = 60 * 60 * 1000;

export function StatusPill({ meta }: StatusPillProps) {
  const lastUpdated = new Date(meta.lastUpdated);
  const isFresh = meta.status === "ok" && Date.now() - lastUpdated.getTime() <= freshWindowMs;
  const updated = new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(lastUpdated);

  return (
    <div className={`status-pill status-${meta.status}${isFresh ? " status-fresh" : ""}`}>
      <span className="status-dot" aria-hidden="true" />
      {meta.status === "ok" ? null : <span>Fehler</span>}
      <span>{updated}</span>
      <span>{meta.source}</span>
    </div>
  );
}
