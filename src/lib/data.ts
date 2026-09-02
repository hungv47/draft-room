import * as z from "zod";
import raw from "@/data/players.json";
import { POSITIONS, type Player } from "./types";

const rawPlayerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  position: z.enum(POSITIONS),
  team: z.string().min(1),
  price: z.number().positive(),
  projectedPoints: z.number().int().nonnegative(),
});

const poolSchema = z.object({
  season: z.string(),
  teams: z.record(z.string(), z.string()),
  players: z.array(rawPlayerSchema),
});

// Parsed once at module load; a malformed pool fails the build's test run instead of a demo.
const pool = poolSchema.parse(raw);

export const SEASON = pool.season;
export const TEAMS: Readonly<Record<string, string>> = pool.teams;

export function loadPlayers(): Player[] {
  return pool.players.map((p) => ({ ...p, drafted: false }));
}

export function teamName(abbreviation: string): string {
  return TEAMS[abbreviation] ?? abbreviation;
}
