import type { Objective, Player, Position } from "./types";

/*
 * Points-probability model. Every player's season total is a two-state mixture: a "regular" season
 * (starts most weeks) and a "disrupted" one (rotation or injury spell), each Normal around a mean
 * derived from the published projection. Squad totals are drawn by seeded Monte Carlo with a shared
 * club factor, so stacking one club's attack raises variance the way it does in real fantasy.
 *
 * Everything here is deterministic: same inputs, same numbers, on every machine and in every test.
 */

export interface Outlook {
  mean: number;
  sd: number;
  /** 10th / 50th / 90th percentiles of season points. */
  p10: number;
  p50: number;
  p90: number;
  /** Probability the player has an undisrupted season (starts most weeks). */
  startProbability: number;
  /** Coefficient of variation of the regular-season state. */
  volatility: number;
}

export interface SquadProjection {
  mean: number;
  sd: number;
  p10: number;
  p50: number;
  p90: number;
  /** Probability the squad total is at least `target`, when a target was given. */
  probabilityAtLeast: number | null;
  target: number | null;
  samples: number;
  /** Clubs with three or more picks, the concentration that fattens both tails. */
  clubStacks: { team: string; count: number }[];
}

// Attackers swing more than keepers; the numbers are coefficients of variation on season points.
const POSITION_VOLATILITY: Readonly<Record<Position, number>> = { GK: 0.13, DF: 0.17, MF: 0.21, FW: 0.26 };
/** Points retained in a disrupted season (missing ~a third of minutes). */
const DISRUPTED_RETENTION = 0.62;
const DISRUPTED_VOLATILITY_SCALE = 1.5;
/** Correlation between players at the same club. */
const CLUB_RHO = 0.35;

const DEFAULT_SAMPLES = 4000;
const MAX_SAMPLES = 20000;

/** Small deterministic hash so two identically priced teammates still get distinct volatility. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/** mulberry32: tiny, fast, seedable. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal via Box–Muller; consumes two uniforms. */
function gaussian(next: () => number): number {
  const u = Math.max(next(), 1e-12);
  const v = next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export interface PlayerModel {
  startProbability: number;
  regularMean: number;
  regularSd: number;
  disruptedMean: number;
  disruptedSd: number;
  volatility: number;
}

export function playerModel(player: Player): PlayerModel {
  const jitter = (hash(player.id) - 0.5) * 0.06;
  const volatility = Math.max(0.08, POSITION_VOLATILITY[player.position] + jitter);
  // Premium players are picked to start; cheap ones carry rotation risk.
  const startProbability = Math.min(0.95, Math.max(0.68, 0.7 + 0.024 * (player.price - 4)));
  // Solve regularMean so the mixture mean equals the published projection.
  const regularMean = player.projectedPoints / (startProbability + (1 - startProbability) * DISRUPTED_RETENTION);
  const disruptedMean = regularMean * DISRUPTED_RETENTION;
  return {
    startProbability,
    regularMean,
    regularSd: regularMean * volatility,
    disruptedMean,
    disruptedSd: disruptedMean * volatility * DISRUPTED_VOLATILITY_SCALE,
    volatility,
  };
}

function mixtureSd(m: PlayerModel): number {
  const p = m.startProbability;
  const mean = p * m.regularMean + (1 - p) * m.disruptedMean;
  const second =
    p * (m.regularSd ** 2 + m.regularMean ** 2) + (1 - p) * (m.disruptedSd ** 2 + m.disruptedMean ** 2);
  return Math.sqrt(Math.max(0, second - mean ** 2));
}

/** One draw of a player's season given a standard-normal shock (already club-correlated) and a state uniform. */
function drawPlayer(m: PlayerModel, shock: number, stateU: number): number {
  const regular = stateU < m.startProbability;
  const value = regular ? m.regularMean + m.regularSd * shock : m.disruptedMean + m.disruptedSd * shock;
  return Math.max(0, value);
}

function isRegularSeason(m: PlayerModel, stateU: number): boolean {
  return stateU < m.startProbability;
}

function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[index];
}

const outlookCache = new Map<string, Outlook>();

/** Per-player distribution. Cached by id + price + projection so repeated pool listings stay cheap. */
export function playerOutlook(player: Player): Outlook {
  const key = `${player.id}|${player.price}|${player.projectedPoints}`;
  const cached = outlookCache.get(key);
  if (cached) return cached;

  const m = playerModel(player);
  const next = rng(Math.floor(hash(player.id) * 2 ** 31));
  const samples = 2000;
  const draws = Array.from<number>({ length: samples });
  for (let i = 0; i < samples; i++) draws[i] = drawPlayer(m, gaussian(next), next());
  draws.sort((a, b) => a - b);

  const outlook: Outlook = {
    mean: player.projectedPoints,
    sd: Math.round(mixtureSd(m)),
    p10: Math.round(percentile(draws, 0.1)),
    p50: Math.round(percentile(draws, 0.5)),
    p90: Math.round(percentile(draws, 0.9)),
    startProbability: Math.round(m.startProbability * 100) / 100,
    volatility: Math.round(m.volatility * 100) / 100,
  };
  outlookCache.set(key, outlook);
  return outlook;
}

/** The single number a strategy optimises for a player. */
export function objectiveScore(player: Player, objective: Objective): number {
  if (objective === "mean") return player.projectedPoints;
  const outlook = playerOutlook(player);
  return objective === "floor" ? outlook.p10 : outlook.p90;
}

export interface ProjectionOptions {
  target?: number;
  samples?: number;
  seed?: number;
  /** Captain's points count twice; in a disrupted captain season the vice's do instead. */
  captainId?: string | null;
  viceId?: string | null;
}

/** Monte Carlo over a set of players with club correlation. Deterministic for a given seed. */
export function projectSquad(players: readonly Player[], options: ProjectionOptions = {}): SquadProjection {
  const samples = Math.min(MAX_SAMPLES, Math.max(500, Math.round(options.samples ?? DEFAULT_SAMPLES)));
  const seed = options.seed ?? 20262027;
  const models = players.map(playerModel);
  const clubs = [...new Set(players.map((p) => p.team))];
  const clubIndex = new Map(clubs.map((team, index) => [team, index]));
  const next = rng(seed);

  const clubWeight = Math.sqrt(CLUB_RHO);
  const ownWeight = Math.sqrt(1 - CLUB_RHO);
  const totals = Array.from<number>({ length: samples });
  const clubShock = Array.from<number>({ length: clubs.length });
  const captainIndex = players.findIndex((p) => p.id === options.captainId);
  const viceIndex = players.findIndex((p) => p.id === options.viceId);
  const draws = Array.from<number>({ length: players.length });

  for (let s = 0; s < samples; s++) {
    for (let c = 0; c < clubs.length; c++) clubShock[c] = gaussian(next);
    let total = 0;
    let captainRegular = false;
    for (let i = 0; i < players.length; i++) {
      const shock = clubWeight * clubShock[clubIndex.get(players[i].team) ?? 0] + ownWeight * gaussian(next);
      const stateU = next();
      if (i === captainIndex) captainRegular = isRegularSeason(models[i], stateU);
      draws[i] = drawPlayer(models[i], shock, stateU);
      total += draws[i];
    }
    if (captainIndex >= 0) {
      // The armband doubles one player's haul; the vice inherits it when the captain's season is disrupted.
      const armband = !captainRegular && viceIndex >= 0 ? viceIndex : captainIndex;
      total += draws[armband];
    }
    totals[s] = total;
  }
  totals.sort((a, b) => a - b);

  const mean = totals.reduce((sum, value) => sum + value, 0) / samples;
  const variance = totals.reduce((sum, value) => sum + (value - mean) ** 2, 0) / samples;
  const target = options.target ?? null;
  let probabilityAtLeast: number | null = null;
  if (target !== null) {
    const hits = totals.filter((value) => value >= target).length;
    probabilityAtLeast = Math.round((hits / samples) * 1000) / 1000;
  }

  const counts = new Map<string, number>();
  for (const player of players) counts.set(player.team, (counts.get(player.team) ?? 0) + 1);
  const clubStacks = [...counts.entries()]
    .filter(([, count]) => count >= 3)
    .map(([team, count]) => ({ team, count }))
    .sort((a, b) => b.count - a.count);

  return {
    mean: Math.round(mean),
    sd: Math.round(Math.sqrt(variance)),
    p10: Math.round(percentile(totals, 0.1)),
    p50: Math.round(percentile(totals, 0.5)),
    p90: Math.round(percentile(totals, 0.9)),
    probabilityAtLeast,
    target,
    samples,
    clubStacks,
  };
}
