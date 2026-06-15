import type { GoalSource, GoalSourceResult } from "./types";

export const wikipediaSource: GoalSource = {
  name: "wikipedia",
  async fetchGoals(): Promise<GoalSourceResult> {
    throw new Error("Wikipedia MediaWiki adapter is prepared but not implemented yet.");
  }
};
