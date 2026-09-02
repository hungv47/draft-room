import * as z from "zod";
import { DUTIES, FORMATION_IDS, POSITIONS, type Armband } from "@/lib/types";
import type { ToolName } from "./definitions";

/*
 * Parsers for what agents actually send, which is looser than the published inputSchema:
 * "" or null for omitted fields, "£6.0m" for a price, "mid1" for a slot, "433" for a formation,
 * "true" for a boolean. Everything the engine receives has been through one of these, so it never
 * has to inspect raw JSON itself.
 */

const optionalText = z
  .string()
  .nullish()
  .transform((value) => value?.trim() || undefined);

function requiredText(message: string) {
  return z.string({ error: message }).trim().min(1, { error: message });
}

const position = z
  .string()
  .nullish()
  .transform((value) => value?.trim().toUpperCase() || undefined)
  .pipe(z.enum(POSITIONS, { error: "position must be one of GK, DF, MF, FW" }).optional());

const numberText = (what: string) =>
  z.string().transform((raw, ctx) => {
    const digits = raw.replace(/[£m,\s]/gi, "");
    if (digits === "") return undefined;
    const parsed = Number(digits);
    if (!Number.isFinite(parsed)) {
      ctx.addIssue({ code: "custom", message: `"${raw}" is not ${what}` });
      return z.NEVER;
    }
    return parsed;
  });

const price = z
  .union([z.number().finite(), numberText("a price in £m")])
  .nullish()
  .transform((value) => value ?? undefined);

const points = z
  .union([z.number().finite(), numberText("a points total")])
  .nullish()
  .transform((value) => value ?? undefined);

function boundedInt(min: number, max: number, fallback: number) {
  return z
    .union([z.number(), numberText("a whole number")])
    .nullish()
    .transform((value) => (value === undefined || value === null ? fallback : Math.min(max, Math.max(min, Math.round(value)))));
}

const strategy = z
  .string()
  .nullish()
  .transform((value) => value?.trim() || "value")
  .pipe(z.enum(["value", "stars_and_scrubs"], { error: 'strategy must be "value" or "stars_and_scrubs"' }));

const objective = z
  .string()
  .nullish()
  .transform((value) => value?.trim().toLowerCase() || "mean")
  .pipe(z.enum(["mean", "floor", "ceiling"], { error: 'objective must be "mean", "floor", or "ceiling"' }));

const sort = z
  .string()
  .nullish()
  .transform((value) => value?.trim().toLowerCase() || "points")
  .pipe(z.enum(["points", "price", "value", "floor", "ceiling"], { error: "sort must be points, price, value, floor, or ceiling" }));

/** "4-3-3", "433", "4 3 3". Validated against the known list after normalising. */
const formationText = z
  .string({ error: "formation is required, e.g. 4-3-3" })
  .transform((raw, ctx) => {
    const digits = raw.replace(/[^0-9]/g, "");
    const candidate = digits.length === 3 ? `${digits[0]}-${digits[1]}-${digits[2]}` : raw.trim();
    if (!FORMATION_IDS.some((id) => id === candidate)) {
      ctx.addIssue({ code: "custom", message: `formation must be one of ${FORMATION_IDS.join(", ")}` });
      return z.NEVER;
    }
    return candidate;
  });

const optionalFormation = z
  .string()
  .nullish()
  .transform((value) => value?.trim() || undefined)
  .pipe(formationText.optional());

const looseBoolean = z
  .union([
    z.boolean(),
    z.number().transform((value) => value !== 0),
    z.string().transform((value) => ["true", "yes", "1", "force"].includes(value.trim().toLowerCase())),
  ])
  .nullish()
  .transform((value) => value ?? false);

const ARMBAND_ALIASES = new Map<string, Armband>([
  ["captain", "captain"],
  ["c", "captain"],
  ["vice", "vice"],
  ["vice-captain", "vice"],
  ["vice captain", "vice"],
  ["vc", "vice"],
  ["v", "vice"],
  ["none", "none"],
  ["clear", "none"],
]);

const armband = z
  .string()
  .nullish()
  .transform((value, ctx) => {
    const key = value?.trim().toLowerCase();
    if (!key) return undefined;
    const found = ARMBAND_ALIASES.get(key);
    if (!found) {
      ctx.addIssue({ code: "custom", message: 'armband must be "captain", "vice", or "none"' });
      return z.NEVER;
    }
    return found;
  });

const duties = z
  .array(z.string().transform((value) => value.trim().toLowerCase().replace(/[\s-]+/g, "_")))
  .nullish()
  .transform((value) => value ?? undefined)
  .pipe(z.array(z.enum(DUTIES, { error: "duties must be penalties, set_pieces, or protected" })).optional());

const noteText = z
  .string()
  .nullish()
  .transform((value) => (value === null || value === undefined ? undefined : value.slice(0, 280)));

const idList = z
  .array(z.string().trim().min(1))
  .nullish()
  .transform((value) => value ?? undefined);

const fill = z
  .object({ strategy, objective })
  .nullish()
  .transform((value) => value ?? null);

const scenarioPlan = z.object({
  label: optionalText.transform((value) => value ?? "Scenario"),
  formation: optionalFormation,
  remove: idList,
  swap: z
    .array(z.object({ slotId: requiredText("swap.slotId is required"), newPlayerId: requiredText("swap.newPlayerId is required") }))
    .nullish()
    .transform((value) => value ?? undefined),
  add: z
    .array(z.object({ playerId: requiredText("add.playerId is required"), slotId: optionalText }))
    .nullish()
    .transform((value) => value ?? undefined),
  fill,
});

export type ScenarioPlanInput = z.output<typeof scenarioPlan>;

export const TOOL_INPUT = {
  list_available_players: z.object({
    position,
    team: optionalText,
    maxPrice: price,
    minPrice: price,
    search: optionalText,
    sort,
    limit: boundedInt(1, 120, 40),
  }),
  get_roster_summary: z.object({}),
  draft_player: z.object({
    playerId: requiredText("playerId is required (use the id from list_available_players, or the player's name)."),
    slotId: optionalText,
  }),
  remove_player: z.object({ slotId: optionalText, playerId: optionalText, force: looseBoolean }),
  swap_player: z.object({
    slotId: requiredText("slotId is required."),
    newPlayerId: requiredText("newPlayerId is required (use the id from list_available_players, or the player's name)."),
    force: looseBoolean,
  }),
  auto_fill_roster: z.object({ strategy, objective }),
  set_formation: z.object({ formation: formationText, force: looseBoolean }),
  simulate_scenarios: z.object({
    scenarios: z.array(scenarioPlan).min(1, { error: "scenarios needs at least one plan" }).max(6, { error: "at most six scenarios per call" }),
    target: points,
  }),
  apply_scenario: z.object({ scenario: scenarioPlan }),
  project_points: z.object({
    target: points,
    playerIds: idList,
    samples: boundedInt(500, 20000, 4000),
  }),
  player_outlook: z.object({
    playerIds: z.array(z.string().trim().min(1)).min(1, { error: "playerIds needs at least one id or name" }).max(12, { error: "at most twelve players per call" }),
    target: points,
  }),
  find_upgrades: z.object({
    objective,
    slotId: optionalText,
    position,
    maxCost: price,
    limit: boundedInt(1, 25, 8),
  }),
  get_brief: z.object({}),
  set_assignment: z.object({
    playerId: requiredText("playerId is required (a player id or name in the squad)."),
    armband,
    duties,
    note: noteText,
  }),
} satisfies Record<ToolName, z.ZodObject>;

export type ToolInput<K extends ToolName> = z.output<(typeof TOOL_INPUT)[K]>;
