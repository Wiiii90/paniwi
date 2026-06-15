import type { GoalSource, GoalSourceResult } from "./types";

export const mockSource: GoalSource = {
  name: "mock",
  async fetchGoals(): Promise<GoalSourceResult> {
    return {
      source: "mock",
      fetchedAt: new Date().toISOString(),
      goals: [
        {
          playerName: "Kylian Mbappé",
          nationalTeam: "France",
          goals: 1,
          source: "mock",
          matchLabel: "France 2-1 Canada",
          minute: 28,
          scoredAt: "2026-06-12T19:28:00.000Z",
          detail: "normal"
        },
        {
          playerName: "Harry Kane",
          nationalTeam: "England",
          goals: 1,
          source: "mock",
          matchLabel: "England 3-0 Japan",
          minute: 7,
          scoredAt: "2026-06-13T16:07:00.000Z",
          detail: "penalty"
        },
        {
          playerName: "Jamal Musiala",
          nationalTeam: "Germany",
          goals: 1,
          source: "mock",
          matchLabel: "Germany 2-2 Uruguay",
          minute: 64,
          scoredAt: "2026-06-14T20:24:00.000Z",
          detail: "normal"
        },
        {
          playerName: "Bruno Fernandes",
          nationalTeam: "Portugal",
          goals: 1,
          source: "mock",
          matchLabel: "Portugal 1-1 Nigeria",
          minute: 51,
          scoredAt: "2026-06-15T18:11:00.000Z",
          detail: "normal"
        },
        {
          playerName: "Christian Pulisic",
          nationalTeam: "United States",
          goals: 1,
          source: "mock",
          matchLabel: "United States 1-0 South Korea",
          minute: 76,
          scoredAt: "2026-06-15T21:36:00.000Z",
          detail: "normal"
        },
        {
          playerName: "Own Goal Test",
          nationalTeam: "Brazil",
          goals: 1,
          source: "mock",
          matchLabel: "Brazil 2-0 Spain",
          minute: 12,
          scoredAt: "2026-06-16T15:12:00.000Z",
          detail: "own-goal"
        }
      ]
    };
  }
};
