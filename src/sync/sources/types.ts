import type { ExternalGoalRecord, SourceName } from "../../domain/types";

export type GoalSourceResult = {
  source: SourceName;
  fetchedAt: string;
  goals: ExternalGoalRecord[];
  mergeWithExisting?: boolean;
  coveredDateKeys?: string[];
};

export interface GoalSource {
  readonly name: SourceName;
  fetchGoals(): Promise<GoalSourceResult>;
}
