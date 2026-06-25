import { buildPlayerId } from "./playerId";
import { normalizePlayerName } from "./normalizePlayerName";
import { getTeamDisplayName } from "./teamDisplay";
import { resolveGoalTeamId, resolveTeamFromApiFootball, resolveTeamFromWikipedia } from "./teamResolver";
import type { GoalRecord, SourceName } from "./goalTypes";
import type { RosterPlayer, RosterSnapshot, RosterTeam } from "./rosterTypes";

export type RosterGoalMatch = {
  player: RosterPlayer;
  team: RosterTeam;
  teamId: string;
  displayTeamName: string;
  playerId: string;
};

type EnrichGoalsWithRosterOptions = {
  strictSources?: SourceName[];
};

const apiFootballGoalNameAliases = new Map<string, string>([
  ["cape-verde|k lenini", "Kevin Pina"],
  ["cape-verde|kevin lenini", "Kevin Pina"],
  ["morocco|bono", "Yassine Bounou"]
]);

function getRosterTeam(snapshot: RosterSnapshot | undefined, teamId: string): RosterTeam | null {
  return snapshot?.teams.find((team) => team.teamId === teamId) ?? null;
}

function parseMatchLabelTeams(matchLabel: string | undefined): string[] {
  if (!matchLabel) {
    return [];
  }

  const scoreMatch = matchLabel.match(/^(.*?)\s+\d+\s*-\s*\d+\s+(.*?)$/);
  if (scoreMatch) {
    return [scoreMatch[1].trim(), scoreMatch[2].trim()].filter(Boolean);
  }

  const versusMatch = matchLabel.match(/^(.*?)\s+vs\s+(.*?)$/i);
  if (versusMatch) {
    return [versusMatch[1].trim(), versusMatch[2].trim()].filter(Boolean);
  }

  return [];
}

function getOwnGoalCandidateTeams(goal: GoalRecord, rosterSnapshot: RosterSnapshot, beneficiaryTeamId: string): RosterTeam[] {
  const candidateTeams: RosterTeam[] = [];

  for (const teamName of parseMatchLabelTeams(goal.matchLabel)) {
    const resolvedTeam =
      goal.source === "api-football"
        ? resolveTeamFromApiFootball(teamName)
        : resolveTeamFromWikipedia(teamName) ?? resolveTeamFromApiFootball(teamName);

    if (!resolvedTeam?.teamId || resolvedTeam.teamId === beneficiaryTeamId) {
      continue;
    }

    const rosterTeam = getRosterTeam(rosterSnapshot, resolvedTeam.teamId);
    if (rosterTeam) {
      candidateTeams.push(rosterTeam);
    }
  }

  return candidateTeams;
}

function resolveRosterPlayer(goal: GoalRecord, rosterTeam: RosterTeam): RosterPlayer | null {
  const aliasKey = [rosterTeam.teamId ?? "", normalizeTransliteratedPlayerName(goal.playerName)].join("|");
  const searchName = goal.source === "api-football" ? apiFootballGoalNameAliases.get(aliasKey) ?? goal.playerName : goal.playerName;
  return findUniqueGoalRosterPlayer(searchName, rosterTeam.players);
}

function normalizeTransliteratedPlayerName(name: string): string {
  return normalizePlayerName(
    name
      .replace(/[Øø]/g, "o")
      .replace(/[Ææ]/g, "ae")
      .replace(/[Œœ]/g, "oe")
      .replace(/[Ðð]/g, "d")
      .replace(/[Þþ]/g, "th")
      .replace(/[Łł]/g, "l")
  );
}

function getNameTokens(name: string): string[] {
  return normalizeTransliteratedPlayerName(name)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

function getRosterPlayerNames(player: RosterPlayer): string[] {
  return [player.playerName, player.sourceName, player.normalizedPlayerName].filter(
    (name, index, names): name is string => Boolean(name) && names.indexOf(name) === index
  );
}

function levenshteinDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + substitutionCost
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length];
}

function getMaxAcceptedDistance(searchName: string): number {
  const normalizedLength = normalizeTransliteratedPlayerName(searchName).length;
  return normalizedLength <= 10 ? 2 : 3;
}

function getTokenSignature(name: string): string {
  return [...getNameTokens(name)].sort((left, right) => left.localeCompare(right)).join(" ");
}

function matchesInitialAndLastName(searchName: string, candidateName: string): boolean {
  const searchTokens = getNameTokens(searchName);
  const candidateTokens = getNameTokens(candidateName);
  if (searchTokens.length !== 2 || searchTokens[0].length !== 1 || candidateTokens.length < 2) {
    return false;
  }

  const [initial, lastName] = searchTokens;
  const candidateLastNameIndex = candidateTokens.lastIndexOf(lastName);
  return candidateLastNameIndex > 0 && candidateTokens[candidateLastNameIndex - 1].startsWith(initial);
}

function matchesSingleInitialAndFullTokens(searchName: string, candidateName: string): boolean {
  const searchTokens = getNameTokens(searchName);
  const candidateTokens = getNameTokens(candidateName);
  const initials = searchTokens.filter((token) => token.length === 1);
  const fullTokens = searchTokens.filter((token) => token.length > 1);

  if (initials.length !== 1 || fullTokens.length === 0 || searchTokens.length > candidateTokens.length) {
    return false;
  }

  let cursor = 0;
  const matchedIndexes: number[] = [];
  for (const token of fullTokens) {
    const index = candidateTokens.findIndex((candidateToken, candidateIndex) => candidateIndex >= cursor && candidateToken === token);
    if (index < 0) {
      return false;
    }

    matchedIndexes.push(index);
    cursor = index + 1;
  }

  const firstFullTokenIndex = matchedIndexes[0];
  return candidateTokens.slice(0, firstFullTokenIndex).some((token) => token.startsWith(initials[0]));
}

function removeNameParticles(tokens: string[]): string[] {
  const particles = new Set(["al", "el", "bin", "ben", "ibn"]);
  return tokens.filter((token) => !particles.has(token));
}

function matchesInitialAndFuzzyLastName(searchName: string, candidateName: string): boolean {
  const searchTokens = removeNameParticles(getNameTokens(searchName));
  const candidateTokens = removeNameParticles(getNameTokens(candidateName));
  if (searchTokens.length < 2 || candidateTokens.length < 2 || searchTokens[0].length !== 1) {
    return false;
  }

  const [initial] = searchTokens;
  const searchLastName = searchTokens[searchTokens.length - 1];
  const candidateFirstName = candidateTokens[0];
  const candidateLastName = candidateTokens[candidateTokens.length - 1];
  return (
    Boolean(searchLastName && candidateFirstName?.startsWith(initial)) &&
    levenshteinDistance(searchLastName, candidateLastName ?? "") <= getMaxAcceptedDistance(searchLastName)
  );
}

function getGoalRosterMatchScore(searchName: string, player: RosterPlayer): number {
  const normalizedSearchName = normalizeTransliteratedPlayerName(searchName);
  const searchSignature = getTokenSignature(searchName);
  const candidateNames = getRosterPlayerNames(player);

  if (candidateNames.some((name) => normalizeTransliteratedPlayerName(name) === normalizedSearchName)) {
    return 0;
  }

  if (candidateNames.some((name) => getTokenSignature(name) === searchSignature)) {
    return 0;
  }

  if (
    candidateNames.some(
      (name) =>
        matchesInitialAndLastName(searchName, name) ||
        matchesSingleInitialAndFullTokens(searchName, name) ||
        matchesInitialAndFuzzyLastName(searchName, name)
    )
  ) {
    return 1;
  }

  const distance = Math.min(
    ...candidateNames.map((name) => levenshteinDistance(normalizedSearchName, normalizeTransliteratedPlayerName(name)))
  );
  return 10 + distance;
}

function matchesInitialAbbreviation(searchName: string, candidateName: string): boolean {
  const searchTokens = getNameTokens(searchName);
  const initials = searchTokens.filter((token) => token.length === 1);
  const fullTokens = searchTokens.filter((token) => token.length > 1);

  if (initials.length === 0 || fullTokens.length === 0) {
    return false;
  }

  return matchesInitialAndLastName(searchName, candidateName) || matchesSingleInitialAndFullTokens(searchName, candidateName);
}

function findUniqueInitialRosterPlayer(searchName: string, rosterPlayers: RosterPlayer[]): RosterPlayer | null {
  const matches = rosterPlayers.filter((player) =>
    getRosterPlayerNames(player).some((name) => matchesInitialAbbreviation(searchName, name))
  );
  return matches.length === 1 ? matches[0] : null;
}

function findUniqueGoalRosterPlayer(searchName: string, rosterPlayers: RosterPlayer[]): RosterPlayer | null {
  const normalizedSearchName = normalizeTransliteratedPlayerName(searchName);
  const searchSignature = getTokenSignature(searchName);
  const exactMatch = rosterPlayers.filter((player) =>
    getRosterPlayerNames(player).some(
      (name) => normalizeTransliteratedPlayerName(name) === normalizedSearchName || getTokenSignature(name) === searchSignature
    )
  );

  if (exactMatch.length === 1) {
    return exactMatch[0];
  }

  const initialMatch = findUniqueInitialRosterPlayer(searchName, rosterPlayers);
  if (initialMatch) {
    return initialMatch;
  }

  const ranked = rosterPlayers
    .map((player) => ({ player, score: getGoalRosterMatchScore(searchName, player) }))
    .sort((left, right) => left.score - right.score);
  const best = ranked[0];
  const second = ranked[1];
  if (!best) {
    return null;
  }

  if (best.score >= 10 && best.score - 10 > getMaxAcceptedDistance(searchName)) {
    return null;
  }

  const requiredMargin = best.score < 10 ? 1 : 2;
  if (second && second.score - best.score < requiredMargin) {
    return null;
  }

  return best.player;
}

export function resolveRosterPlayerForGoal(
  goal: GoalRecord,
  rosterSnapshot: RosterSnapshot | undefined
): RosterGoalMatch | null {
  if (!rosterSnapshot) {
    return null;
  }

  const teamId = resolveGoalTeamId(goal);
  if (!teamId) {
    return null;
  }

  const rosterTeam = getRosterTeam(rosterSnapshot, teamId);
  const player = rosterTeam ? resolveRosterPlayer(goal, rosterTeam) : null;
  if (player && rosterTeam) {
    return {
      player,
      team: rosterTeam,
      teamId,
      displayTeamName: getTeamDisplayName(teamId, rosterTeam.teamName),
      playerId: buildPlayerId(teamId, player.playerName)
    };
  }

  if (goal.detail !== "own-goal") {
    return null;
  }

  const ownGoalMatches = getOwnGoalCandidateTeams(goal, rosterSnapshot, teamId)
    .map((candidateTeam) => {
      const ownGoalPlayer = resolveRosterPlayer(goal, candidateTeam);
      if (!ownGoalPlayer || !candidateTeam.teamId) {
        return null;
      }

      return {
        player: ownGoalPlayer,
        team: candidateTeam,
        teamId: candidateTeam.teamId,
        displayTeamName: getTeamDisplayName(candidateTeam.teamId, candidateTeam.teamName),
        playerId: buildPlayerId(candidateTeam.teamId, ownGoalPlayer.playerName)
      } satisfies RosterGoalMatch;
    })
    .filter((match): match is RosterGoalMatch => Boolean(match));

  return ownGoalMatches.length === 1 ? ownGoalMatches[0] : null;
}

function describeGoal(goal: GoalRecord): string {
  const matchLabel = goal.matchLabel ?? goal.matchId ?? goal.fixtureId ?? "unbekanntes Spiel";
  return `${goal.playerName} (${goal.nationalTeam}) in ${matchLabel}`;
}

function shouldRequireRosterMatch(goal: GoalRecord, strictSources: Set<SourceName>): boolean {
  return strictSources.has(goal.source) && goal.detail !== "own-goal";
}

export function enrichGoalsWithRoster(
  goals: GoalRecord[],
  rosterSnapshot: RosterSnapshot | undefined,
  options: EnrichGoalsWithRosterOptions = {}
): GoalRecord[] {
  const strictSources = new Set(options.strictSources ?? []);
  const unmatchedGoals: string[] = [];
  const enrichedGoals = goals.map((goal) => {
    const rosterMatch = resolveRosterPlayerForGoal(goal, rosterSnapshot);
    if (!rosterMatch) {
      if (shouldRequireRosterMatch(goal, strictSources)) {
        unmatchedGoals.push(describeGoal(goal));
      }
      return goal;
    }

    return {
      ...goal,
      playerId: rosterMatch.playerId,
      playerName: rosterMatch.player.playerName,
      nationalTeam: rosterMatch.team.teamName,
      teamId: rosterMatch.teamId
    };
  });

  if (unmatchedGoals.length > 0) {
    throw new Error(
      `Roster-Match fehlgeschlagen fuer ${unmatchedGoals.length} ${unmatchedGoals.length === 1 ? "Torschuetzen" : "Torschuetzen"}: ${unmatchedGoals.join("; ")}`
    );
  }

  return enrichedGoals;
}
