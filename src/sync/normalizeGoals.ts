import type { ExternalGoalRecord, GoalRecord } from "../domain/types";
import { normalizePlayerName } from "../domain/normalizePlayerName";

function makeExternalGoalId(record: ExternalGoalRecord, index: number): string {
  if (record.externalGoalId) {
    return record.externalGoalId;
  }

  return [
    record.source,
    record.matchId ?? record.fixtureId ?? record.matchLabel ?? "unknown-match",
    normalizePlayerName(record.playerName),
    record.minute ?? "unknown-minute",
    record.detail ?? "normal",
    index
  ].join(":");
}

function inferTimeConfidence(record: ExternalGoalRecord) {
  if (record.timeConfidence) {
    return record.timeConfidence;
  }

  if (record.scoredAt) {
    return "exact";
  }

  if (record.kickedOffAt && typeof record.minute === "number") {
    return "estimated";
  }

  if (record.kickedOffAt) {
    return "match-only";
  }

  return "unknown";
}

export function normalizeGoals(records: ExternalGoalRecord[]): GoalRecord[] {
  return records.map((record, index) => ({
    externalGoalId: makeExternalGoalId(record, index),
    playerName: record.playerName.trim(),
    nationalTeam: record.nationalTeam.trim(),
    goals: record.goals ?? 1,
    source: record.source,
    apiPlayerId: record.apiPlayerId,
    matchId: record.matchId,
    fixtureId: record.fixtureId,
    matchLabel: record.matchLabel,
    kickedOffAt: record.kickedOffAt,
    minute: record.minute,
    scoredAt: record.scoredAt,
    timeConfidence: inferTimeConfidence(record),
    detail: record.detail ?? "normal"
  }));
}
