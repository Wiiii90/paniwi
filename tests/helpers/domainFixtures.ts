import type { GoalRecord } from "../../src/domain/goalTypes";
import type { ParticipantTeam } from "../../src/domain/participantTypes";
import type { RosterSnapshot } from "../../src/domain/rosterTypes";

export const teams: ParticipantTeam[] = [
  {
    owner: "Anna",
    players: [
      {
        playerName: "Alexander Isak",
        teamId: "sweden",
        aliases: ["A. Isak"]
      }
    ]
  },
  {
    owner: "Ben",
    players: [
      {
        playerName: "Felix Nmecha",
        teamId: "germany"
      }
    ]
  }
];

export const baseGoal: GoalRecord = {
  externalGoalId: "goal-1",
  playerName: "A. Isak",
  nationalTeam: "Sweden",
  goals: 1,
  source: "api-football",
  apiPlayerId: 2864,
  timeConfidence: "exact",
  detail: "normal"
};

export const rosterSnapshot: RosterSnapshot = {
  lastUpdated: "2026-06-16T00:00:00.000Z",
  source: "wikipedia",
  pageTitle: "2026 FIFA World Cup squads",
  teamCount: 1,
  playerCount: 2,
  teams: [
    {
      teamName: "Sweden",
      teamId: "sweden",
      players: [
        {
          playerName: "Yasin Ayari",
          normalizedPlayerName: "yasin ayari",
          position: "midfielder",
          shirtNumber: 18,
          sourceName: "Yasin Ayari"
        },
        {
          playerName: "Mattias Svanberg",
          normalizedPlayerName: "mattias svanberg",
          position: "midfielder",
          shirtNumber: 8,
          sourceName: "Mattias Svanberg"
        }
      ]
    }
  ]
};

export const apiResolverRosterSnapshot: RosterSnapshot = {
  lastUpdated: "2026-06-16T00:00:00.000Z",
  source: "wikipedia",
  pageTitle: "2026 FIFA World Cup squads",
  teamCount: 3,
  playerCount: 3,
  teams: [
    {
      teamName: "Egypt",
      teamId: "egypt",
      players: [
        {
          playerName: "Mohamed Hany",
          normalizedPlayerName: "mohamed hany",
          position: "defender",
          shirtNumber: 4,
          sourceName: "Mohamed Hany"
        }
      ]
    },
    {
      teamName: "Saudi Arabia",
      teamId: "saudi-arabia",
      players: [
        {
          playerName: "Abdulelah Al-Amri",
          normalizedPlayerName: "abdulelah al amri",
          position: "defender",
          shirtNumber: 4,
          sourceName: "Abdulelah Al-Amri"
        }
      ]
    },
    {
      teamName: "Qatar",
      teamId: "qatar",
      players: [
        {
          playerName: "Mohamed Manai",
          normalizedPlayerName: "mohamed manai",
          position: "defender",
          shirtNumber: 3,
          sourceName: "Mohamed Manai"
        }
      ]
    }
  ]
};

export const initialLastNameRosterSnapshot: RosterSnapshot = {
  lastUpdated: "2026-06-16T00:00:00.000Z",
  source: "wikipedia",
  pageTitle: "2026 FIFA World Cup squads",
  teamCount: 1,
  playerCount: 2,
  teams: [
    {
      teamName: "Iraq",
      teamId: "iraq",
      players: [
        {
          playerName: "Hussein Ali",
          normalizedPlayerName: "hussein ali",
          position: "defender",
          sourceName: "Hussein Ali"
        },
        {
          playerName: "Aymen Hussein",
          normalizedPlayerName: "aymen hussein",
          position: "forward",
          sourceName: "Aymen Hussein"
        }
      ]
    }
  ]
};

export const legacyNormalizedNorwayRosterSnapshot: RosterSnapshot = {
  lastUpdated: "2026-06-16T00:00:00.000Z",
  source: "wikipedia",
  pageTitle: "2026 FIFA World Cup squads",
  teamCount: 1,
  playerCount: 1,
  teams: [
    {
      teamName: "Norway",
      teamId: "norway",
      players: [
        {
          playerName: "Leo Østigård",
          normalizedPlayerName: "leo stigard",
          position: "defender",
          sourceName: "Leo Østigård"
        }
      ]
    }
  ]
};

export const ambiguousNorwayRosterSnapshot: RosterSnapshot = {
  lastUpdated: "2026-06-16T00:00:00.000Z",
  source: "wikipedia",
  pageTitle: "2026 FIFA World Cup squads",
  teamCount: 1,
  playerCount: 2,
  teams: [
    {
      teamName: "Norway",
      teamId: "norway",
      players: [
        {
          playerName: "Leo Østigård",
          normalizedPlayerName: "leo stigard",
          position: "defender",
          sourceName: "Leo Østigård"
        },
        {
          playerName: "Lars Ostigard",
          normalizedPlayerName: "lars ostigard",
          position: "defender",
          sourceName: "Lars Ostigard"
        }
      ]
    }
  ]
};
