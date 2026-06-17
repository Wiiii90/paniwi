import { createHash } from "node:crypto";
import type { GoalRecord } from "../domain/goalTypes";
import type { ExternalMatchParticipantRecord, ExternalMatchRecord } from "../domain/matchTypes";

export function buildSnapshotFingerprint(
  rawGoals: GoalRecord[],
  rawMatches: ExternalMatchRecord[] = [],
  rawParticipants: ExternalMatchParticipantRecord[] = []
): string {
  const goalPayload = rawGoals
    .map((goal) =>
      [
        "goal",
        goal.externalGoalId,
        goal.playerName,
        goal.nationalTeam,
        goal.goals,
        goal.matchId ?? "",
        goal.minute ?? "",
        goal.detail
      ].join("|")
    )
    .sort();
  const matchPayload = rawMatches
    .map((match) =>
      [
        "match",
        match.source,
        match.matchId,
        match.fixtureId ?? "",
        match.status,
        match.homeTeam.name,
        match.homeTeam.score ?? "",
        match.awayTeam.name,
        match.awayTeam.score ?? "",
        match.kickedOffAt ?? ""
      ].join("|")
    )
    .sort();
  const participantPayload = rawParticipants
    .map((participant) =>
      [
        "participant",
        participant.source,
        participant.matchId,
        participant.fixtureId ?? "",
        participant.teamId ?? "",
        participant.apiPlayerId ?? "",
        participant.playerName,
        participant.nationalTeam,
        participant.status,
        participant.shirtNumber ?? ""
      ].join("|")
    )
    .sort();

  const payload = [...goalPayload, ...matchPayload, ...participantPayload].join("\n");

  return createHash("sha256").update(payload).digest("hex");
}
