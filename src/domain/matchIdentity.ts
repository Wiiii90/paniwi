import type { GoalRecord, ScoredGoal, SourceName } from "./goalTypes";
import type { ExternalMatchRecord, MatchRecord } from "./matchTypes";
import { resolveTeamDisplayName } from "./teamDisplay";

const matchIdentityTimeToleranceMs = 2 * 60 * 60 * 1000;

export function normalizeScoreLabel(label: string): string {
  return label.replace(/[–—]/g, "-");
}

export function normalizeMatchTeamKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeMatchTimeKey(value: string | undefined): string {
  if (!value) {
    return "time-open";
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? value : new Date(timestamp).toISOString();
}

export function getExternalMatchKey(fixture: ExternalMatchRecord): string {
  return [
    normalizeMatchTimeKey(fixture.kickedOffAt),
    normalizeMatchTeamKey(resolveTeamDisplayName(fixture.homeTeam.name, fixture.source)),
    normalizeMatchTeamKey(resolveTeamDisplayName(fixture.awayTeam.name, fixture.source))
  ].join("|");
}

export function getMatchRecordKey(match: Pick<MatchRecord, "kickedOffAt" | "homeTeam" | "awayTeam">): string {
  return [
    normalizeMatchTimeKey(match.kickedOffAt),
    normalizeMatchTeamKey(match.homeTeam.name),
    normalizeMatchTeamKey(match.awayTeam.name)
  ].join("|");
}

function parseMatchTimestamp(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : timestamp;
}

export function matchTimesAreCloseEnough(left: string | undefined, right: string | undefined): boolean {
  const leftTime = parseMatchTimestamp(left);
  const rightTime = parseMatchTimestamp(right);
  if (leftTime === undefined || rightTime === undefined) {
    return normalizeMatchTimeKey(left) === normalizeMatchTimeKey(right);
  }

  return Math.abs(leftTime - rightTime) <= matchIdentityTimeToleranceMs;
}

function parseTeamsFromMatchLabel(label: string | undefined, source: SourceName): { home: string; away: string } | null {
  if (!label) {
    return null;
  }

  const scoreMatch = normalizeScoreLabel(label).match(/^(.+?)\s+\d+-\d+\s+(.+)$/);
  if (scoreMatch) {
    return {
      home: resolveTeamDisplayName(scoreMatch[1].trim(), source),
      away: resolveTeamDisplayName(scoreMatch[2].trim(), source)
    };
  }

  const versusMatch = label.match(/^(.+?)\s+v(?:s\.?)?\s+(.+)$/i);
  if (versusMatch) {
    return {
      home: resolveTeamDisplayName(versusMatch[1].trim(), source),
      away: resolveTeamDisplayName(versusMatch[2].trim(), source)
    };
  }

  return null;
}

function goalMatchesFixtureIdentity(
  goal: Pick<GoalRecord | ScoredGoal, "matchLabel" | "kickedOffAt" | "source">,
  fixture: ExternalMatchRecord
): boolean {
  if (!goal.kickedOffAt || !fixture.kickedOffAt) {
    return false;
  }

  if (!matchTimesAreCloseEnough(goal.kickedOffAt, fixture.kickedOffAt)) {
    return false;
  }

  const goalTeams = parseTeamsFromMatchLabel(goal.matchLabel, goal.source);
  if (!goalTeams) {
    return false;
  }

  const fixtureHome = resolveTeamDisplayName(fixture.homeTeam.name, fixture.source);
  const fixtureAway = resolveTeamDisplayName(fixture.awayTeam.name, fixture.source);

  return (
    normalizeMatchTeamKey(goalTeams.home) === normalizeMatchTeamKey(fixtureHome) &&
    normalizeMatchTeamKey(goalTeams.away) === normalizeMatchTeamKey(fixtureAway)
  );
}

export function goalBelongsToExternalMatch(
  goal: Pick<GoalRecord | ScoredGoal, "fixtureId" | "matchId" | "matchLabel" | "kickedOffAt" | "source">,
  fixture: ExternalMatchRecord
): boolean {
  if (goal.matchId === fixture.matchId) {
    return true;
  }

  if (fixture.fixtureId && goal.fixtureId && goal.fixtureId === fixture.fixtureId) {
    return true;
  }

  return goalMatchesFixtureIdentity(goal, fixture);
}
