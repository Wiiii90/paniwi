import type { SourceName } from "../../domain/types";
import { apiFootballSource } from "./apiFootballSource";
import { mockSource } from "./mockSource";
import type { GoalSource } from "./types";
import { wikipediaSource } from "./wikipediaSource";

export type SyncSourceMode = SourceName | "auto";

const sourceMap: Record<SourceName, GoalSource> = {
  mock: mockSource,
  "api-football": apiFootballSource,
  wikipedia: wikipediaSource
};

export function parseSyncSourceMode(value: string | undefined): SyncSourceMode {
  if (value === "api-football" || value === "wikipedia" || value === "mock" || value === "auto") {
    return value;
  }

  return "mock";
}

export function getSourcesForMode(mode: SyncSourceMode): GoalSource[] {
  if (mode === "auto") {
    return [apiFootballSource, wikipediaSource, mockSource];
  }

  return [sourceMap[mode]];
}

export function getSourcesFromEnv(env: NodeJS.ProcessEnv = process.env): GoalSource[] {
  return getSourcesForMode(parseSyncSourceMode(env.SYNC_SOURCE));
}
