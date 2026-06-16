import { normalizePlayerName } from "./normalizePlayerName";
import type { RosterPlayer } from "./rosterTypes";

function getTokens(name: string): string[] {
  return normalizePlayerName(name)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

function getTokenSignature(name: string): string {
  return [...getTokens(name)].sort((left, right) => left.localeCompare(right)).join(" ");
}

function matchesExact(searchName: string, rosterPlayer: RosterPlayer): boolean {
  return rosterPlayer.normalizedPlayerName === normalizePlayerName(searchName);
}

function matchesTokenSignature(searchName: string, rosterPlayer: RosterPlayer): boolean {
  return getTokenSignature(searchName) === getTokenSignature(rosterPlayer.normalizedPlayerName);
}

function matchesTokenSubset(searchName: string, rosterPlayer: RosterPlayer): boolean {
  const searchTokens = getTokens(searchName);
  const rosterTokens = getTokens(rosterPlayer.normalizedPlayerName);

  if (searchTokens.length < 2 || searchTokens.length > rosterTokens.length) {
    return false;
  }

  return searchTokens.every((token) => rosterTokens.includes(token));
}

function matchesInitialAndTokens(searchName: string, rosterPlayer: RosterPlayer): boolean {
  const searchTokens = getTokens(searchName);
  const rosterTokens = getTokens(rosterPlayer.normalizedPlayerName);
  const initialTokens = searchTokens.filter((token) => token.length === 1);
  const fullTokens = searchTokens.filter((token) => token.length > 1);

  if (initialTokens.length !== 1 || fullTokens.length === 0 || searchTokens.length > rosterTokens.length) {
    return false;
  }

  return (
    fullTokens.every((token) => rosterTokens.includes(token)) &&
    rosterTokens.some((token) => token.startsWith(initialTokens[0]))
  );
}

function matchesLeadingInitialAndLastToken(searchName: string, rosterPlayer: RosterPlayer): boolean {
  const searchTokens = getTokens(searchName);
  const rosterTokens = getTokens(rosterPlayer.normalizedPlayerName);

  if (searchTokens.length !== 2 || searchTokens[0].length !== 1 || rosterTokens.length < 2) {
    return false;
  }

  const [initial, lastName] = searchTokens;
  const rosterLastNameIndex = rosterTokens.lastIndexOf(lastName);
  if (rosterLastNameIndex <= 0) {
    return false;
  }

  return rosterTokens[rosterLastNameIndex - 1].startsWith(initial);
}

function pickUnique(matches: RosterPlayer[]): RosterPlayer | null {
  return matches.length === 1 ? matches[0] : null;
}

export function findUniqueRosterPlayer(rosterPlayers: RosterPlayer[], candidateNames: string[]): RosterPlayer | null {
  const names = [...new Set(candidateNames.map((name) => name.trim()).filter(Boolean))];
  if (names.length === 0) {
    return null;
  }

  for (const matcher of [matchesExact, matchesTokenSignature, matchesTokenSubset, matchesLeadingInitialAndLastToken, matchesInitialAndTokens]) {
    const matches = rosterPlayers.filter((rosterPlayer) => names.some((name) => matcher(name, rosterPlayer)));
    const unique = pickUnique(matches);
    if (unique) {
      return unique;
    }
  }

  return null;
}
