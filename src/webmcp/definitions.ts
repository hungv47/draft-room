/**
 * The WebMCP tools, metadata only. `execute` is attached at registration time so this module can be
 * serialised into the inline boot script that registers tools during HTML parse.
 *
 * Six tools mirror what a person can do with clicks. Six more are agent-only: formation changes,
 * what-if scenarios, atomic multi-step plans, probability modelling, per-player outlooks, and
 * upgrade search. Two carry the manager's brief both ways: get_brief reads the armband, duties, and
 * notes set by clicking a card; set_assignment lets the agent write them. The page is a better tool
 * with an agent in it.
 */

export const TOOL_NAMES = [
  "list_available_players",
  "get_roster_summary",
  "draft_player",
  "remove_player",
  "swap_player",
  "auto_fill_roster",
  "set_formation",
  "simulate_scenarios",
  "apply_scenario",
  "project_points",
  "player_outlook",
  "find_upgrades",
  "get_brief",
  "set_assignment",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export interface ToolAnnotations {
  readOnlyHint: boolean;
  /** Not yet in the WebMCP draft (it only defines readOnlyHint/untrustedContentHint), but MCP clients understand it. */
  destructiveHint: boolean;
}

/** The JSON Schema subset these tools publish. Type aliases (not interfaces) so they satisfy WebMCP's open record type. */
export type ToolInputProperty = {
  type: "string" | "number" | "integer" | "boolean" | "array" | "object";
  description?: string;
  enum?: readonly string[];
  default?: string | number | boolean;
  minimum?: number;
  maximum?: number;
  items?: ToolInputProperty;
  properties?: Record<string, ToolInputProperty>;
  required?: readonly string[];
};

export type ToolInputSchema = {
  type: "object";
  properties: Record<string, ToolInputProperty>;
  required?: readonly string[];
};

export type ToolGroup = "squad" | "formation" | "scenarios" | "model" | "brief";

export interface ToolDefinition {
  name: ToolName;
  title: string;
  description: string;
  inputSchema: ToolInputSchema;
  annotations: ToolAnnotations;
  /** UI metadata; never sent to the browser's registerTool. */
  group: ToolGroup;
  /** True when no button on the page can do this. */
  agentOnly: boolean;
  /** A prompt a person can paste into their agent to exercise the tool. */
  example: string;
}

const POSITION_ENUM = ["GK", "DF", "MF", "FW"] as const;
const FORMATION_ENUM = ["4-3-3", "4-4-2", "3-5-2", "3-4-3", "5-3-2", "4-5-1", "5-4-1"] as const;
const OBJECTIVE_ENUM = ["mean", "floor", "ceiling"] as const;
const STRATEGY_ENUM = ["value", "stars_and_scrubs"] as const;
const ARMBAND_ENUM = ["captain", "vice", "none"] as const;
const DUTY_ENUM = ["penalties", "set_pieces", "protected"] as const;

const objective: ToolInputProperty = {
  type: "string",
  enum: OBJECTIVE_ENUM,
  default: "mean",
  description:
    "What to optimise: 'mean' expected points, 'floor' the 10th-percentile season (safe), or 'ceiling' the 90th percentile (upside).",
};

const scenarioPlan: ToolInputProperty = {
  type: "object",
  description:
    "An ordered plan. Steps run as: formation, remove, swap, add, fill. Any failing step fails the whole plan.",
  properties: {
    label: { type: "string", description: "Short name for this scenario, echoed in the result." },
    formation: { type: "string", enum: FORMATION_ENUM, description: "Optional formation to switch to first." },
    remove: {
      type: "array",
      description: "Slot ids or player ids/names to release.",
      items: { type: "string" },
    },
    swap: {
      type: "array",
      description: "Replacements to make, each { slotId, newPlayerId }.",
      items: {
        type: "object",
        properties: { slotId: { type: "string" }, newPlayerId: { type: "string" } },
        required: ["slotId", "newPlayerId"],
      },
    },
    add: {
      type: "array",
      description: "Players to draft, each { playerId, slotId? }.",
      items: {
        type: "object",
        properties: { playerId: { type: "string" }, slotId: { type: "string" } },
        required: ["playerId"],
      },
    },
    fill: {
      type: "object",
      description: "Optional: auto-fill whatever is still open, { strategy, objective }.",
      properties: {
        strategy: { type: "string", enum: STRATEGY_ENUM, default: "value" },
        objective,
      },
    },
  },
};

export const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  {
    name: "list_available_players",
    title: "List available players",
    description:
      "List undrafted players with id, name, position (GK/DF/MF/FW), club, price, projected points, points-per-£m, and a floor/ceiling outlook (p10/p90 season points). Filter by position, club, price band, or a name search; sort by points, price, value, floor, or ceiling. Use the returned id with draft_player, swap_player, or scenario plans.",
    inputSchema: {
      type: "object",
      properties: {
        position: { type: "string", enum: POSITION_ENUM },
        team: { type: "string", description: "Club abbreviation, e.g. ARS, LIV, MCI." },
        maxPrice: { type: "number", description: "Only players at or under this price, in £m." },
        minPrice: { type: "number", description: "Only players at or over this price, in £m." },
        search: { type: "string", description: "Case-insensitive substring match on player name or club." },
        sort: { type: "string", enum: ["points", "price", "value", "floor", "ceiling"], default: "points" },
        limit: { type: "integer", minimum: 1, maximum: 120, description: "Max players to return (default 40)." },
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
    group: "squad",
    agentOnly: false,
    example: "List the five highest-ceiling midfielders under £8m.",
  },
  {
    name: "get_roster_summary",
    title: "Get squad summary",
    description:
      "Return the current squad: formation, each slot and who is in it (and whether you or the agent picked them), money spent and remaining, total projected points, and a probability outlook (mean, p10, p90) for the season total. Also lists the formations available to set_formation.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true, destructiveHint: false },
    group: "squad",
    agentOnly: false,
    example: "Summarise my squad and tell me where the weak spots are.",
  },
  {
    name: "draft_player",
    title: "Draft a player",
    description:
      "Add an available player to the squad. Slots follow the current formation (GK, DF1-n, MF1-n, FW1-n). If slotId is omitted, the first empty slot for the player's position is used. Fails clearly if the player is already drafted, no slot for their position is open (change formation to make room), or the price exceeds the remaining budget.",
    inputSchema: {
      type: "object",
      properties: {
        playerId: { type: "string", description: "Player id from list_available_players (the player's name also works)." },
        slotId: { type: "string", description: "Optional slot id, e.g. GK, DF2, MF1, FW3." },
      },
      required: ["playerId"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    group: "squad",
    agentOnly: false,
    example: "Draft the best goalkeeper under £5.5m.",
  },
  {
    name: "remove_player",
    title: "Remove a player",
    description:
      "Remove a player from the squad by slot id or player id, freeing their price back into the budget and marking them available again. Players the manager has marked protected (see get_brief) cannot be removed without force=true.",
    inputSchema: {
      type: "object",
      properties: {
        slotId: { type: "string" },
        playerId: { type: "string" },
        force: { type: "boolean", default: false, description: "Override the manager's protection on this player." },
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: true },
    group: "squad",
    agentOnly: false,
    example: "Remove my most expensive defender.",
  },
  {
    name: "swap_player",
    title: "Swap a player",
    description:
      "Replace the player in a slot with a different available player of the same position, in one step. Fails if the new player is not eligible for that slot, does not fit under the resulting budget, or the outgoing player is protected by the manager's brief (force=true overrides).",
    inputSchema: {
      type: "object",
      properties: {
        slotId: { type: "string" },
        newPlayerId: { type: "string" },
        force: { type: "boolean", default: false, description: "Override the manager's protection on the outgoing player." },
      },
      required: ["slotId", "newPlayerId"],
    },
    annotations: { readOnlyHint: false, destructiveHint: true },
    group: "squad",
    agentOnly: false,
    example: "Swap my cheapest forward for the best one that still fits.",
  },
  {
    name: "auto_fill_roster",
    title: "Auto-fill the squad",
    description:
      "Fill every empty slot under the remaining budget. strategy 'value' maximises the objective per £m and then spends spare money on the best upgrades; 'stars_and_scrubs' buys the best available for the highest-need slots and fills the rest cheaply. objective picks what is maximised: expected points, a safe floor, or upside. Filled slots are never touched.",
    inputSchema: {
      type: "object",
      properties: {
        strategy: { type: "string", enum: STRATEGY_ENUM, default: "value" },
        objective,
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    group: "squad",
    agentOnly: false,
    example: "Fill the rest of my squad for the highest floor.",
  },
  {
    name: "set_formation",
    title: "Change formation",
    description:
      "Agent-only. Re-shape the squad to one of 4-3-3, 4-4-2, 3-5-2, 3-4-3, 5-3-2, 4-5-1, 5-4-1. Drafted players keep their slots' positions and are re-seated within their line. If more players of a position are drafted than the new shape fields, the call fails and names them, unless force=true, which releases the lowest projected surplus back to the pool. The budget is unchanged.",
    inputSchema: {
      type: "object",
      properties: {
        formation: { type: "string", enum: FORMATION_ENUM },
        force: { type: "boolean", default: false, description: "Release surplus players automatically instead of failing." },
      },
      required: ["formation"],
    },
    annotations: { readOnlyHint: false, destructiveHint: true },
    group: "formation",
    agentOnly: true,
    example: "Switch us to a 3-5-2 and tell me who no longer fits.",
  },
  {
    name: "simulate_scenarios",
    title: "Simulate scenarios",
    description:
      "Agent-only, read-only. Evaluate up to six alternative plans side by side without changing the squad. Each plan can switch formation, remove, swap, and add players, then auto-fill what is left. Returns, per plan, the steps taken, money spent and left, projected points, and a probability outlook (mean, sd, p10, p90, and P(total ≥ target) when a target is given), plus the delta against the current squad. Plans that break a rule report which step failed and why.",
    inputSchema: {
      type: "object",
      properties: {
        scenarios: { type: "array", description: "One to six plans.", items: scenarioPlan },
        target: { type: "number", description: "Optional season points target to compute P(total ≥ target) for." },
      },
      required: ["scenarios"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
    group: "scenarios",
    agentOnly: true,
    example: "Compare a 4-3-3 built around Haaland with a 3-5-2 built around Saka; which is more likely to clear 1,800 points?",
  },
  {
    name: "apply_scenario",
    title: "Apply a scenario",
    description:
      "Agent-only. Run one plan (formation, removes, swaps, adds, fill) and commit it atomically: either every step lands or nothing changes and the failing step is reported. Use after simulate_scenarios to make a multi-step change in one call.",
    inputSchema: {
      type: "object",
      properties: { scenario: scenarioPlan },
      required: ["scenario"],
    },
    annotations: { readOnlyHint: false, destructiveHint: true },
    group: "scenarios",
    agentOnly: true,
    example: "Apply the 3-5-2 plan: release the third forward, add Saka and Palmer, fill the rest on value.",
  },
  {
    name: "project_points",
    title: "Project season points",
    description:
      "Agent-only, read-only. Monte Carlo the current squad's season total (or a hypothetical list of player ids) with rotation risk and club correlation. Returns mean, sd, p10/p50/p90, P(total ≥ target) when a target is given, club stacks that concentrate risk, and each player's contribution with floor and ceiling. Deterministic for a given sample count.",
    inputSchema: {
      type: "object",
      properties: {
        target: { type: "number", description: "Season points target to compute P(total ≥ target) for." },
        playerIds: {
          type: "array",
          description: "Optional. Project this list instead of the current squad.",
          items: { type: "string" },
        },
        samples: { type: "integer", minimum: 500, maximum: 20000, default: 4000 },
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
    group: "model",
    agentOnly: true,
    example: "What is the probability my squad clears 1,750 points, and which club am I over-exposed to?",
  },
  {
    name: "player_outlook",
    title: "Player outlook",
    description:
      "Agent-only, read-only. For one or more players (ids or names), return the probability model behind the projection: mean, sd, p10/p50/p90 season points, start probability (rotation risk), and volatility. Optionally the probability each player scores at least a target. Use to compare a safe pick against a boom-or-bust one.",
    inputSchema: {
      type: "object",
      properties: {
        playerIds: { type: "array", items: { type: "string" }, description: "One to twelve player ids or names." },
        target: { type: "number", description: "Optional points target per player." },
      },
      required: ["playerIds"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
    group: "model",
    agentOnly: true,
    example: "Compare Isak and Watkins: who has the safer floor and who has the higher ceiling?",
  },
  {
    name: "find_upgrades",
    title: "Find upgrades",
    description:
      "Agent-only, read-only. Search every single-swap improvement to the current squad that fits the remaining budget, ranked by gain on the chosen objective (mean, floor, or ceiling). Restrict to one slot or one position, cap the extra spend, and limit the count. Each result gives the outgoing and incoming player, the points gain, the price change, and gain per extra £m.",
    inputSchema: {
      type: "object",
      properties: {
        objective,
        slotId: { type: "string", description: "Only look at this slot." },
        position: { type: "string", enum: POSITION_ENUM, description: "Only look at slots of this position." },
        maxCost: { type: "number", description: "Max extra spend for one swap, in £m (default: remaining budget)." },
        limit: { type: "integer", minimum: 1, maximum: 25, default: 8 },
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
    group: "model",
    agentOnly: true,
    example: "With the money I have left, what are the three best floor upgrades in midfield?",
  },
  {
    name: "get_brief",
    title: "Read the manager's brief",
    description:
      "Read-only. The manager's standing instructions, set by clicking players on the pitch: who wears the captain's armband (points count double) and the vice's, duties (penalties, set pieces), which players are protected from removal or swaps, and free-text notes per player. Read this before making changes so your plan respects it; the same brief is what the manager sees in the console.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true, destructiveHint: false },
    group: "brief",
    agentOnly: false,
    example: "Read my brief, then propose a plan that respects every protected player.",
  },
  {
    name: "set_assignment",
    title: "Set an assignment",
    description:
      "Give a drafted player the armband ('captain' doubles their points in every projection; 'vice' inherits it if the captain's season is disrupted; 'none' hands it back), replace their duties (penalties, set_pieces, protected), and/or set a note the manager will see on the card. Only fields you pass change. The manager can edit the same fields by clicking the card.",
    inputSchema: {
      type: "object",
      properties: {
        playerId: { type: "string", description: "Player id or name; must be in the squad." },
        armband: { type: "string", enum: ARMBAND_ENUM },
        duties: { type: "array", items: { type: "string", enum: DUTY_ENUM }, description: "Replaces the duty list. Pass [] to clear." },
        note: { type: "string", description: "Up to 280 characters. Pass an empty string to clear." },
      },
      required: ["playerId"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    group: "brief",
    agentOnly: false,
    example: "Make Haaland captain and Saka vice, and note that Palmer is our penalty taker.",
  },
];

export function isToolName(name: string): name is ToolName {
  return TOOL_NAMES.some((tool) => tool === name);
}

export function toolDefinition(name: ToolName): ToolDefinition {
  const found = TOOL_DEFINITIONS.find((tool) => tool.name === name);
  if (!found) throw new Error(`No definition for tool ${name}`);
  return found;
}

/** The subset that goes to document.modelContext.registerTool. */
export function registrationFields(tool: ToolDefinition) {
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: tool.annotations,
  };
}
