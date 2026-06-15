import type { GoalSource, GoalSourceResult } from "./types";

export const apiFootballSource: GoalSource = {
  name: "api-football",
  async fetchGoals(): Promise<GoalSourceResult> {
    throw new Error("API-Football adapter is prepared but not implemented yet.");
  }
};
