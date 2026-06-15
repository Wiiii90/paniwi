import type { StaticMeta } from "../../domain/types";

type SyncSummaryProps = {
  meta: StaticMeta;
};

function formatSourceList(meta: StaticMeta): string {
  const sources = meta.attemptedSources?.length ? meta.attemptedSources : [meta.source];
  return sources.join(" -> ");
}

export function SyncSummary({ meta }: SyncSummaryProps) {
  return (
    <section className="summary-panel" aria-label="Sync-Status">
      <div className="summary-grid">
        <div>
          <span className="summary-label">Quelle</span>
          <strong>{formatSourceList(meta)}</strong>
        </div>
        <div>
          <span className="summary-label">Goals</span>
          <strong>{meta.goalCount ?? 0}</strong>
        </div>
        <div>
          <span className="summary-label">Punkte-Tore</span>
          <strong>{meta.scoredGoalCount ?? 0}</strong>
        </div>
        <div>
          <span className="summary-label">Uebersprungen</span>
          <strong>{meta.skippedGoalCount ?? 0}</strong>
        </div>
      </div>
      {meta.sourceErrors?.length ? (
        <div className="source-errors">
          {meta.sourceErrors.map((error) => (
            <span key={error}>{error}</span>
          ))}
        </div>
      ) : null}
      {meta.message ? <p className="summary-message">{meta.message}</p> : null}
    </section>
  );
}
