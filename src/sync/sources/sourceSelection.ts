import type { SourceName } from "../../domain/goalTypes";
import { apiFootballSource } from "./apiFootball/source";
import { footballDataSource } from "./footballData/source";
import { mockSource } from "./mockSource";
import type { GoalSource } from "./types";
import { wikipediaSource } from "./wikipediaSource";

export type SyncSourceMode = SourceName;

const sourceMap: Record<SourceName, GoalSource> = {
  mock: mockSource,
  "api-football": apiFootballSource,
  "football-data": footballDataSource,
  wikipedia: wikipediaSource
};

export function parseSyncSourceMode(value: string | undefined): SyncSourceMode {
  if (value === "api-football" || value === "football-data" || value === "wikipedia" || value === "mock") {
    return value;
  }

  return "mock";
}

export function getSourcesForMode(mode: SyncSourceMode): GoalSource[] {
  return [sourceMap[mode]];
}

export function getSourcesFromEnv(env: NodeJS.ProcessEnv = process.env): GoalSource[] {
  return getSourcesForMode(parseSyncSourceMode(env.SYNC_SOURCE));
}
