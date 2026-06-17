import type { ExternalGoalRecord, SourceName } from "../../domain/goalTypes";
import type { ExternalMatchParticipantRecord, ExternalMatchRecord } from "../../domain/matchTypes";

export type GoalSourceResult = {
  source: SourceName;
  fetchedAt: string;
  goals: ExternalGoalRecord[];
  matches?: ExternalMatchRecord[];
  participants?: ExternalMatchParticipantRecord[];
  mergeWithExisting?: boolean;
  coveredDateKeys?: string[];
  sourceRequestCount?: number;
  sourceRequestLimit?: number;
};

export interface GoalSource {
  readonly name: SourceName;
  fetchGoals(): Promise<GoalSourceResult>;
}
