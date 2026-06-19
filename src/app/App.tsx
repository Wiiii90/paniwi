import { useEffect, useMemo, useState } from "react";
import { AppShell } from "./components/AppShell";
import { loadStaticData, type StaticData } from "./data";
import { participantTeams } from "../config/teams";
import type { LeaderboardEntry } from "../domain/participantTypes";
import { GoalsPage } from "./pages/GoalsPage";
import { HomePage } from "./pages/HomePage";
import { LeaderboardPage } from "./pages/LeaderboardPage";
import { MatchesPage } from "./pages/MatchesPage";
import { TeamPage } from "./pages/TeamPage";

type Route =
  | { name: "home" }
  | { name: "leaderboard" }
  | { name: "goals" }
  | { name: "matches" }
  | { name: "team"; owner: string };

function parseRoute(pathname: string): Route {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const appPath = basePath && pathname.startsWith(basePath) ? pathname.slice(basePath.length) || "/" : pathname;

  if (appPath === "/") {
    return { name: "home" };
  }

  if (appPath === "/table" || appPath === "/leaderboard") {
    return { name: "leaderboard" };
  }

  if (appPath === "/goals") {
    return { name: "goals" };
  }

  if (appPath === "/matches") {
    return { name: "matches" };
  }

  if (appPath.startsWith("/team/")) {
    return { name: "team", owner: decodeURIComponent(appPath.replace("/team/", "")) };
  }

  return { name: "leaderboard" };
}

const ownerColors = new Map(participantTeams.map((team) => [team.owner.toLowerCase(), team.color]));

function getOwnerColor(owner: string): string | undefined {
  return ownerColors.get(owner.toLowerCase());
}

function getLeaderboardPartyColors(leaderboard: LeaderboardEntry[] | undefined): string[] {
  if (!leaderboard || leaderboard.length === 0) {
    return [];
  }

  return leaderboard
    .filter((entry) => entry.rank <= 3)
    .map((entry) => getOwnerColor(entry.owner))
    .filter((color): color is string => Boolean(color));
}

export function App() {
  const [data, setData] = useState<StaticData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const route = useMemo(() => parseRoute(window.location.pathname), []);
  const partyColors =
    route.name === "team"
      ? [getOwnerColor(route.owner)].filter((color): color is string => Boolean(color))
      : getLeaderboardPartyColors(data?.leaderboard);

  useEffect(() => {
    loadStaticData().then(setData).catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    });
  }, []);

  return (
    <AppShell meta={data?.meta} partyColors={partyColors}>
      {!data && !error ? <p className="loading">Daten werden geladen...</p> : null}
      {error ? <p className="error">Daten konnten nicht geladen werden: {error}</p> : null}
      {data && route.name === "home" ? (
        <HomePage leaderboard={data.leaderboard} goals={data.goals} scorers={data.scorers} matches={data.matches} />
      ) : null}
      {data && route.name === "leaderboard" ? (
        <LeaderboardPage goals={data.goals} leaderboard={data.leaderboard} pickStatuses={data.pickStatuses} />
      ) : null}
      {data && route.name === "goals" ? <GoalsPage scorers={data.scorers} /> : null}
      {data && route.name === "matches" ? <MatchesPage matches={data.matches} /> : null}
      {data && route.name === "team" ? (
        <TeamPage
          owner={route.owner}
          goals={data.goals}
          matches={data.matches}
          pickStatuses={data.pickStatuses}
          rosters={data.rosters}
        />
      ) : null}
    </AppShell>
  );
}
