import type { StaticMeta } from "../../domain/types";

type StatusPillProps = {
  meta: StaticMeta;
};

export function StatusPill({ meta }: StatusPillProps) {
  const updated = new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(meta.lastUpdated));

  return (
    <div className={`status-pill status-${meta.status}`}>
      {meta.status === "ok" ? null : <span>Fehler</span>}
      <span>{updated}</span>
      <span>{meta.source}</span>
    </div>
  );
}
