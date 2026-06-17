import { useMemo, useRef } from "react";
import type { MatchRecord, ScoredGoal } from "../../domain/types";
import { formatGoalMinute } from "../formatters/goalFormat";
import { formatMatchScore } from "../formatters/matchFormat";
import { TeamFlag } from "./TeamFlag";

type GoalFeedStripProps = {
  goals: ScoredGoal[];
  matches: MatchRecord[];
  title: string;
};

function formatGoalDate(goal: ScoredGoal): string {
  const value = goal.scoredAt ?? goal.kickedOffAt;
  if (!value) {
    return "Datum offen";
  }

  const date = new Date(value);
  const dateLabel = new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    weekday: "short"
  }).format(date);

  if (goal.scoredAt && goal.timeConfidence === "exact") {
    const timeLabel = new Intl.DateTimeFormat("de-DE", {
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
    return `${dateLabel} · ${timeLabel} Uhr`;
  }

  return dateLabel;
}

export function GoalFeedStrip({ goals, matches, title }: GoalFeedStripProps) {
  const feedStripRef = useRef<HTMLDivElement>(null);
  const feedDragRef = useRef({ isDragging: false, startX: 0, scrollLeft: 0 });
  const matchById = useMemo(() => {
    const index = new Map<string, MatchRecord>();
    for (const match of matches) {
      index.set(match.matchId, match);
    }
    return index;
  }, [matches]);

  const handleFeedPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch" || !feedStripRef.current) {
      return;
    }

    feedDragRef.current = {
      isDragging: true,
      startX: event.clientX,
      scrollLeft: feedStripRef.current.scrollLeft
    };
    feedStripRef.current.setPointerCapture(event.pointerId);
    feedStripRef.current.classList.add("is-dragging");
  };

  const handleFeedPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!feedDragRef.current.isDragging || !feedStripRef.current) {
      return;
    }

    event.preventDefault();
    const deltaX = event.clientX - feedDragRef.current.startX;
    feedStripRef.current.scrollLeft = feedDragRef.current.scrollLeft - deltaX;
  };

  const stopFeedDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!feedStripRef.current) {
      return;
    }

    feedDragRef.current.isDragging = false;
    feedStripRef.current.classList.remove("is-dragging");
    if (feedStripRef.current.hasPointerCapture(event.pointerId)) {
      feedStripRef.current.releasePointerCapture(event.pointerId);
    }
  };

  if (goals.length === 0) {
    return null;
  }

  return (
    <section className="summary-card">
      <div className="section-heading">
        <h2>{title}</h2>
      </div>
      <div
        className="feed-strip"
        onPointerCancel={stopFeedDrag}
        onPointerDown={handleFeedPointerDown}
        onPointerLeave={stopFeedDrag}
        onPointerMove={handleFeedPointerMove}
        onPointerUp={stopFeedDrag}
        ref={feedStripRef}
      >
        {goals.map((goal) => {
          const match = goal.matchId ? matchById.get(goal.matchId) : undefined;

          return (
            <article className="feed-chip" key={`feed-${goal.externalGoalId}-${goal.owner}`}>
              <div className="feed-chip-topline">
                <small>{formatGoalDate(goal)}</small>
                <small className="feed-chip-owner">{goal.owner}</small>
              </div>
              <strong className="feed-chip-player">
                <TeamFlag className="feed-chip-flag" teamName={goal.displayNationalTeam} />
                <span>{goal.displayPlayerName}</span>
              </strong>
              <span>
                {formatGoalMinute(goal)} · {goal.matchLabel ?? "Spiel offen"} · {formatMatchScore(match)}
              </span>
            </article>
          );
        })}
      </div>
    </section>
  );
}
