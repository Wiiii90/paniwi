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
  preserveExistingGoals?: boolean;
  replaceExistingSourceGoals?: boolean;
  preserveExistingMatches?: boolean;
  preserveExistingParticipants?: boolean;
  sourceRequestCount?: number;
  sourceRequestLimit?: number;
};

export interface GoalSource {
  readonly name: SourceName;
  fetchGoals(): Promise<GoalSourceResult>;
}
