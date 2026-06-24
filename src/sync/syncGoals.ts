import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import { buildLeaderboard, scoreGoalsForTeams } from "../domain/buildLeaderboard";
import { buildMatches } from "../domain/buildMatches";
import { buildScorers } from "../domain/buildScorers";
import { selectEffectiveGoalsForScorers, selectEffectiveGoalsForScoring } from "../domain/effectiveGoals";
import { enrichGoalsWithRoster } from "../domain/rosterResolver";
import { sortGoalsChronologically } from "../domain/sortGoals";
import type { SourceName } from "../domain/goalTypes";
import type { ExternalMatchParticipantRecord, ExternalMatchRecord } from "../domain/matchTypes";
import type { StaticMeta } from "../domain/staticMeta";
import type { RosterSnapshot } from "../domain/rosterTypes";
import type { GoalSource } from "./sources/types";
import { participantTeams } from "../config/teams";
import { normalizeGoals } from "./normalizeGoals";
import { buildSnapshotFingerprint } from "./snapshotFingerprint";
import { validateGoals } from "./validateGoals";
import { formatTeamValidationIssues, validateTeams } from "./validateTeams";
import { writeStaticData, writeStaticMeta } from "./writeStaticData";
import { getSourcesFromEnv } from "./sources/sourceSelection";

type SyncGoalsOptions = {
  syncWindowId?: string;
};

type WorkingSourceResult = {
  result: Awaited<ReturnType<GoalSource["fetchGoals"]>>;
  attemptedSources: SourceName[];
  sourceErrors: string[];
};

class SourceFetchError extends Error {
  constructor(
    readonly attemptedSources: SourceName[],
    readonly sourceErrors: string[]
  ) {
    super(sourceErrors.join("; "));
    this.name = "SourceFetchError";
  }
}

type NormalizedGoal = ReturnType<typeof normalizeGoals>[number];
type NormalizedGoals = ReturnType<typeof normalizeGoals>;
type NormalizedMatches = ExternalMatchRecord[];
type NormalizedParticipants = ExternalMatchParticipantRecord[];

export function buildSourceErrorMeta(
  attemptedSources: SourceName[],
  sourceErrors: string[],
  now: Date = new Date()
): StaticMeta {
  return {
    lastUpdated: now.toISOString(),
    source: attemptedSources[0] ?? "mock",
    attemptedSources,
    fallbackUsed: attemptedSources.length > 1,
    status: "error",
    sourceErrors,
    message: "Alle Datenquellen sind fehlgeschlagen. Bestehende Snapshot-Dateien wurden nicht ueberschrieben."
  };
}

async function fetchFromFirstWorkingSource(sources: GoalSource[]): Promise<WorkingSourceResult> {
  const errors: string[] = [];
  const attemptedSources: SourceName[] = [];

  for (const source of sources) {
    attemptedSources.push(source.name);
    try {
      return {
        result: await source.fetchGoals(),
        attemptedSources,
        sourceErrors: errors
      };
    } catch (error) {
      errors.push(`${source.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new SourceFetchError(attemptedSources, errors);
}

async function readExistingMeta(): Promise<StaticMeta | null> {
  try {
    return JSON.parse(await readFile("public/data/meta.json", "utf8")) as StaticMeta;
  } catch {
    return null;
  }
}

async function readExistingRawGoals(): Promise<NormalizedGoals> {
  try {
    return JSON.parse(await readFile("public/data/raw-goals.json", "utf8")) as NormalizedGoals;
  } catch {
    return [];
  }
}

async function readExistingRawMatches(): Promise<NormalizedMatches> {
  try {
    return JSON.parse(await readFile("public/data/raw-matches.json", "utf8")) as NormalizedMatches;
  } catch {
    return [];
  }
}

async function readExistingRawParticipants(): Promise<NormalizedParticipants> {
  try {
    return JSON.parse(await readFile("public/data/raw-participants.json", "utf8")) as NormalizedParticipants;
  } catch {
    return [];
  }
}

async function readExistingRosterSnapshot(): Promise<RosterSnapshot | undefined> {
  try {
    return JSON.parse(await readFile("public/data/rosters.json", "utf8")) as RosterSnapshot;
  } catch {
    return undefined;
  }
}

function getGoalMergeKey(goal: NormalizedGoal): string {
  return [goal.source, goal.externalGoalId].join(":");
}

function getMatchMergeKey(match: ExternalMatchRecord): string {
  return [match.source, match.matchId].join(":");
}

function getParticipantMergeKey(participant: ExternalMatchParticipantRecord): string {
  return [
    participant.source,
    participant.matchId,
    participant.fixtureId ?? "",
    participant.teamId ?? "",
    participant.apiPlayerId ?? "",
    participant.playerName
  ].join(":");
}

function getGoalDateKey(goal: NormalizedGoal): string | null {
  const sourceDate = goal.kickedOffAt ?? goal.scoredAt;
  return sourceDate ? sourceDate.slice(0, 10) : null;
}

function getMatchDateKey(match: ExternalMatchRecord): string | null {
  return match.kickedOffAt ? match.kickedOffAt.slice(0, 10) : null;
}

function getParticipantDateKey(participant: ExternalMatchParticipantRecord, matchesById: Map<string, ExternalMatchRecord>): string | null {
  const match = matchesById.get(participant.matchId) ?? (participant.fixtureId ? matchesById.get(`api-football:${participant.fixtureId}`) : undefined);
  return match?.kickedOffAt ? match.kickedOffAt.slice(0, 10) : null;
}

function shouldPreserveExistingGoal(
  goal: NormalizedGoal,
  source: SourceName,
  coveredDateKeys: Set<string> | null,
  preserveExistingOtherSources = false,
  replaceExistingSourceGoals = false
): boolean {
  if (goal.source === source) {
    return !replaceExistingSourceGoals;
  }

  if (preserveExistingOtherSources) {
    return true;
  }

  if (!coveredDateKeys) {
    return false;
  }

  const goalDateKey = getGoalDateKey(goal);
  if (!goalDateKey) {
    return false;
  }

  return !coveredDateKeys.has(goalDateKey);
}

function shouldPreserveExistingMatch(
  match: ExternalMatchRecord,
  source: SourceName,
  coveredDateKeys: Set<string> | null,
  preserveExistingOtherSources = false
): boolean {
  if (preserveExistingOtherSources) {
    return true;
  }

  if (!coveredDateKeys) {
    return match.source === source;
  }

  const matchDateKey = getMatchDateKey(match);
  if (!matchDateKey) {
    return match.source === source;
  }

  return !coveredDateKeys.has(matchDateKey);
}

function shouldPreserveExistingParticipant(
  participant: ExternalMatchParticipantRecord,
  source: SourceName,
  coveredDateKeys: Set<string> | null,
  matchesById: Map<string, ExternalMatchRecord>,
  preserveExistingOtherSources = false
): boolean {
  if (participant.source === source) {
    return true;
  }

  if (preserveExistingOtherSources) {
    return true;
  }

  if (!coveredDateKeys) {
    return false;
  }

  const participantDateKey = getParticipantDateKey(participant, matchesById);
  if (!participantDateKey) {
    return false;
  }

  return !coveredDateKeys.has(participantDateKey);
}

export function mergeGoalSnapshots(
  source: SourceName,
  existingGoals: NormalizedGoals,
  incomingGoals: NormalizedGoals,
  coveredDateKeys?: string[],
  preserveExistingOtherSources = false,
  replaceExistingSourceGoals = false
): NormalizedGoals {
  const mergedGoals = new Map<string, NormalizedGoal>();
  const coveredDateKeySet = coveredDateKeys?.length ? new Set(coveredDateKeys) : null;

  for (const goal of existingGoals) {
    if (shouldPreserveExistingGoal(goal, source, coveredDateKeySet, preserveExistingOtherSources, replaceExistingSourceGoals)) {
      mergedGoals.set(getGoalMergeKey(goal), goal);
    }
  }

  for (const goal of incomingGoals) {
    mergedGoals.set(getGoalMergeKey(goal), goal);
  }

  return [...mergedGoals.values()];
}

export function mergeMatchSnapshots(
  source: SourceName,
  existingMatches: NormalizedMatches,
  incomingMatches: NormalizedMatches,
  coveredDateKeys?: string[],
  preserveExistingOtherSources = false
): NormalizedMatches {
  const mergedMatches = new Map<string, ExternalMatchRecord>();
  const coveredDateKeySet = coveredDateKeys?.length ? new Set(coveredDateKeys) : null;

  for (const match of existingMatches) {
    if (shouldPreserveExistingMatch(match, source, coveredDateKeySet, preserveExistingOtherSources)) {
      mergedMatches.set(getMatchMergeKey(match), match);
    }
  }

  for (const match of incomingMatches) {
    mergedMatches.set(getMatchMergeKey(match), match);
  }

  return [...mergedMatches.values()];
}

export function mergeParticipantSnapshots(
  source: SourceName,
  existingParticipants: NormalizedParticipants,
  incomingParticipants: NormalizedParticipants,
  matches: NormalizedMatches,
  coveredDateKeys?: string[],
  preserveExistingOtherSources = false
): NormalizedParticipants {
  const mergedParticipants = new Map<string, ExternalMatchParticipantRecord>();
  const coveredDateKeySet = coveredDateKeys?.length ? new Set(coveredDateKeys) : null;
  const matchesById = new Map(matches.flatMap((match) => [[match.matchId, match], ...(match.fixtureId ? [[`api-football:${match.fixtureId}`, match] as const] : [])]));

  for (const participant of existingParticipants) {
    if (shouldPreserveExistingParticipant(participant, source, coveredDateKeySet, matchesById, preserveExistingOtherSources)) {
      mergedParticipants.set(getParticipantMergeKey(participant), participant);
    }
  }

  for (const participant of incomingParticipants) {
    mergedParticipants.set(getParticipantMergeKey(participant), participant);
  }

  return [...mergedParticipants.values()];
}

async function mergeWithExistingGoals(
  source: SourceName,
  incomingGoals: NormalizedGoals,
  coveredDateKeys?: string[],
  preserveExistingOtherSources?: boolean,
  replaceExistingSourceGoals?: boolean
): Promise<NormalizedGoals> {
  const existingGoals = await readExistingRawGoals();
  return mergeGoalSnapshots(source, existingGoals, incomingGoals, coveredDateKeys, preserveExistingOtherSources, replaceExistingSourceGoals);
}

async function mergeWithExistingMatches(
  source: SourceName,
  incomingMatches: NormalizedMatches,
  coveredDateKeys?: string[],
  preserveExistingOtherSources?: boolean
): Promise<NormalizedMatches> {
  const existingMatches = await readExistingRawMatches();
  return mergeMatchSnapshots(source, existingMatches, incomingMatches, coveredDateKeys, preserveExistingOtherSources);
}

async function mergeWithExistingParticipants(
  source: SourceName,
  incomingParticipants: NormalizedParticipants,
  matches: NormalizedMatches,
  coveredDateKeys?: string[],
  preserveExistingOtherSources?: boolean
): Promise<NormalizedParticipants> {
  const existingParticipants = await readExistingRawParticipants();
  return mergeParticipantSnapshots(source, existingParticipants, incomingParticipants, matches, coveredDateKeys, preserveExistingOtherSources);
}

function buildSyncMeta(
  result: WorkingSourceResult["result"],
  attemptedSources: SourceName[],
  sourceErrors: string[],
  goals: ReturnType<typeof validateGoals>["validGoals"],
  scoredGoals: ReturnType<typeof scoreGoalsForTeams>,
  skippedGoals: ReturnType<typeof validateGoals>["skippedGoals"],
  previousMeta: StaticMeta | null,
  options: SyncGoalsOptions,
  matches: ExternalMatchRecord[],
  participants: ExternalMatchParticipantRecord[]
): StaticMeta {
  const duplicateGoalCount = skippedGoals.filter((item) => item.reason === "duplicate-goal").length;
  const snapshotFingerprint = buildSnapshotFingerprint(goals, matches, participants);
  const snapshotChanged = previousMeta?.snapshotFingerprint !== snapshotFingerprint;
  const sameWindow = Boolean(options.syncWindowId && previousMeta?.syncWindowId === options.syncWindowId);
  const windowSyncAttempts = !sameWindow || snapshotChanged ? 1 : (previousMeta?.windowSyncAttempts ?? 0) + 1;

  return {
    lastUpdated: result.fetchedAt,
    source: result.source,
    attemptedSources,
    fallbackUsed: attemptedSources.length > 1,
    status: "ok",
    goalCount: goals.length,
    scoredGoalCount: scoredGoals.length,
    skippedGoalCount: skippedGoals.length,
    duplicateGoalCount,
    sourceErrors,
    message: snapshotChanged
      ? `Daten-Snapshot mit Quelle ${result.source} erzeugt.`
      : `Daten-Snapshot unveraendert (${result.source}).`,
    snapshotFingerprint,
    snapshotChanged,
    syncWindowId: options.syncWindowId,
    windowSyncAttempts,
    liveMatchCount: matches.filter((match) => match.status === "live").length,
    sourceRequestCount: result.sourceRequestCount,
    sourceRequestLimit: result.sourceRequestLimit
  };
}

export async function syncGoals(
  sources: GoalSource[] = getSourcesFromEnv(),
  options: SyncGoalsOptions = {}
): Promise<void> {
  const teamValidation = validateTeams(participantTeams);
  if (!teamValidation.valid) {
    throw new Error(`Invalid team configuration: ${formatTeamValidationIssues(teamValidation.issues)}`);
  }

  let workingSource: WorkingSourceResult;
  try {
    workingSource = await fetchFromFirstWorkingSource(sources);
  } catch (error) {
    if (error instanceof SourceFetchError) {
      await writeStaticMeta(buildSourceErrorMeta(error.attemptedSources, error.sourceErrors));
      throw error;
    }

    throw error;
  }

  const { result, attemptedSources, sourceErrors } = workingSource;
  const previousMeta = await readExistingMeta();
  const incomingGoals = normalizeGoals(result.goals);
  const incomingMatches = result.matches ?? [];
  const incomingParticipants = result.participants ?? [];
  const normalizedGoals = result.mergeWithExisting
    ? await mergeWithExistingGoals(
        result.source,
        incomingGoals,
        result.coveredDateKeys,
        result.preserveExistingGoals,
        result.replaceExistingSourceGoals
      )
    : incomingGoals;
  const normalizedMatches = result.mergeWithExisting
    ? await mergeWithExistingMatches(result.source, incomingMatches, result.coveredDateKeys, result.preserveExistingMatches)
    : incomingMatches;
  const normalizedParticipants = result.mergeWithExisting
    ? await mergeWithExistingParticipants(
        result.source,
        incomingParticipants,
        normalizedMatches,
        result.coveredDateKeys,
        result.preserveExistingParticipants
      )
    : incomingParticipants;
  const rosterSnapshot = await readExistingRosterSnapshot();
  const strictSources: SourceName[] = normalizedGoals.some((goal) => goal.source === "api-football") ? ["api-football"] : [];
  const rosterEnrichedGoals = enrichGoalsWithRoster(normalizedGoals, rosterSnapshot, {
    strictSources
  });
  const { validGoals: goals } = validateGoals(rosterEnrichedGoals);
  const effectiveGoals = selectEffectiveGoalsForScoring(goals);
  const scorerGoals = selectEffectiveGoalsForScorers(goals);
  const scoredGoals = sortGoalsChronologically(scoreGoalsForTeams(participantTeams, effectiveGoals, rosterSnapshot));
  const leaderboard = buildLeaderboard(participantTeams, effectiveGoals, rosterSnapshot);
  const scorers = buildScorers(scorerGoals, participantTeams, rosterSnapshot, effectiveGoals);
  const matches = buildMatches(goals, scoredGoals, normalizedMatches, normalizedParticipants, participantTeams, rosterSnapshot);

  await writeStaticData({
    leaderboard,
    goals: scoredGoals,
    rawGoals: goals,
    rawMatches: normalizedMatches,
    rawParticipants: normalizedParticipants,
    scorers,
    matches,
    meta: buildSyncMeta(
      result,
      attemptedSources,
      sourceErrors,
      goals,
      scoredGoals,
      [],
      previousMeta,
      options,
      normalizedMatches,
      normalizedParticipants
    )
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  syncGoals().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
