import type { ExternalGoalRecord, GoalRecord } from "../domain/types";

export function normalizeGoals(records: ExternalGoalRecord[]): GoalRecord[] {
  return records.map((record) => ({
    playerName: record.playerName.trim(),
    nationalTeam: record.nationalTeam.trim(),
    goals: record.goals ?? 1,
    source: record.source,
    apiPlayerId: record.apiPlayerId,
    fixtureId: record.fixtureId,
    matchLabel: record.matchLabel,
    minute: record.minute,
    scoredAt: record.scoredAt,
    detail: record.detail ?? "normal"
  }));
}
