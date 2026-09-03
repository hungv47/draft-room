import { describe, expect, it } from "vitest";
import * as z from "zod";
import { loadPlayers } from "@/lib/data";
import { createDraftStore } from "@/lib/store";
import { buildBootScript } from "@/webmcp/boot";
import { TOOL_DEFINITIONS, TOOL_NAMES, registrationFields } from "@/webmcp/definitions";
import { executeTool } from "@/webmcp/execute";
import type { JsonObject } from "@/webmcp/json";
import { TOOL_INPUT } from "@/webmcp/schemas";

// Result shapes the tests rely on. Parsing them is stricter than casting: a drifted payload fails loudly.
const player = z.object({ id: z.string(), position: z.string(), price: z.number(), floor: z.number(), ceiling: z.number() });
const failure = z.object({ ok: z.literal(false), code: z.string(), error: z.string() });
const listed = z.object({ ok: z.literal(true), count: z.number(), players: z.array(player) });
const drafted = z.object({ ok: z.literal(true), pick: z.object({ slotId: z.string() }) });
const filled = z.object({
  ok: z.literal(true),
  objective: z.string(),
  picks: z.array(z.object({ slotId: z.string(), reason: z.string().nullable() })),
  squad: z.object({ complete: z.boolean(), formation: z.string() }),
});
const projection = z.object({ mean: z.number(), p10: z.number(), p90: z.number(), probabilityAtLeast: z.number().nullable() });
const summarized = z.object({
  ok: z.literal(true),
  complete: z.boolean(),
  formation: z.string(),
  projectedPoints: z.number(),
  budget: z.object({ spent: z.number(), remaining: z.number() }),
  projection,
  availableFormations: z.array(z.object({ id: z.string() })),
});
const swapped = z.object({ ok: z.literal(true), outgoing: z.object({ id: z.string() }) });
const removed = z.object({ ok: z.literal(true), squad: z.object({ remaining: z.number() }) });
const reformed = z.object({ ok: z.literal(true), from: z.string(), to: z.string(), released: z.array(z.object({ slotId: z.string() })), moved: z.array(z.object({ from: z.string(), to: z.string() })) });
const simulated = z.object({
  ok: z.literal(true),
  current: z.object({ projectedPoints: z.number(), projection }),
  scenarios: z.array(
    z.discriminatedUnion("ok", [
      z.object({ ok: z.literal(true), label: z.string(), formation: z.string(), steps: z.array(z.string()), projectedPoints: z.number(), projection, delta: z.object({ projectedPoints: z.number() }) }),
      z.object({ ok: z.literal(false), label: z.string(), code: z.string(), failedStep: z.string() }),
    ]),
  ),
});
const applied = z.object({ ok: z.literal(true), scenario: z.object({ steps: z.array(z.string()), formation: z.string() }), squad: z.object({ complete: z.boolean() }) });
const projected = z.object({ ok: z.literal(true), scope: z.string(), projection, contributions: z.array(z.object({ id: z.string(), share: z.number() })) });
const outlooks = z.object({
  ok: z.literal(true),
  players: z.array(z.object({ id: z.string(), profile: z.string(), outlook: z.object({ p10: z.number(), p90: z.number(), startProbability: z.number(), probabilityAtLeast: z.number().nullable() }) })),
});
const upgrades = z.object({ ok: z.literal(true), upgrades: z.array(z.object({ slotId: z.string(), gain: z.number(), cost: z.number(), out: player, in: player })) });
const okOnly = z.object({ ok: z.literal(true) });
const briefed = z.object({
  ok: z.literal(true),
  message: z.string(),
  captain: z.object({ id: z.string(), name: z.string() }).nullable(),
  vice: z.object({ id: z.string(), name: z.string() }).nullable(),
  protectedPlayerIds: z.array(z.string()),
  players: z.array(z.object({ id: z.string(), slotId: z.string(), armband: z.string(), duties: z.array(z.string()), note: z.string() })),
  text: z.string(),
});
const assigned = z.object({ ok: z.literal(true), message: z.string(), armband: z.string(), duties: z.array(z.string()), note: z.string(), changes: z.array(z.string()) });

type Store = ReturnType<typeof createDraftStore>;

function call<S extends z.ZodType>(store: Store, name: string, input: JsonObject, expected: S): z.output<S> {
  const result = executeTool(store, name, input);
  // The browser stringifies tool results; the round trip proves nothing in there is unserialisable.
  return expected.parse(JSON.parse(JSON.stringify(result)));
}

describe("tool definitions", () => {
  it("registers fourteen tools, six of them agent-only, with valid names and annotations", () => {
    expect(TOOL_DEFINITIONS.map((t) => t.name)).toEqual([...TOOL_NAMES]);
    expect(TOOL_DEFINITIONS).toHaveLength(14);
    for (const tool of TOOL_DEFINITIONS) {
      expect(tool.name).toMatch(/^[A-Za-z0-9_.-]{1,128}$/);
      expect(tool.description.length).toBeGreaterThan(40);
      expect(tool.example.length).toBeGreaterThan(10);
      expect(tool.inputSchema).toMatchObject({ type: "object" });
      expect(tool.annotations.readOnlyHint).toBeTypeOf("boolean");
      expect(tool.annotations.destructiveHint).toBeTypeOf("boolean");
      expect(() => JSON.stringify(tool.inputSchema)).not.toThrow();
      // Nothing UI-only leaks into what the browser sees.
      expect(Object.keys(registrationFields(tool)).sort()).toEqual(["annotations", "description", "inputSchema", "name", "title"]);
    }
    const agentOnly = TOOL_DEFINITIONS.filter((t) => t.agentOnly).map((t) => t.name);
    expect(agentOnly).toEqual(["set_formation", "simulate_scenarios", "apply_scenario", "project_points", "player_outlook", "find_upgrades"]);
    for (const tool of TOOL_DEFINITIONS.filter((t) => t.agentOnly)) expect(tool.description).toMatch(/^Agent-only/);
    const readOnly = TOOL_DEFINITIONS.filter((t) => t.annotations.readOnlyHint).map((t) => t.name);
    expect(readOnly).toEqual(["list_available_players", "get_roster_summary", "simulate_scenarios", "project_points", "player_outlook", "find_upgrades", "get_brief"]);
    const destructive = TOOL_DEFINITIONS.filter((t) => t.annotations.destructiveHint).map((t) => t.name);
    expect(destructive).toEqual(["remove_player", "swap_player", "set_formation", "apply_scenario"]);
  });

  it("parses exactly the fields the published schema advertises", () => {
    for (const tool of TOOL_DEFINITIONS) {
      const parsed = Object.keys(TOOL_INPUT[tool.name].shape).sort();
      const published = Object.keys(tool.inputSchema.properties).sort();
      expect(parsed, tool.name).toEqual(published);
    }
  });

  it("produces a boot script that embeds every tool and escapes HTML", () => {
    const script = buildBootScript(TOOL_DEFINITIONS);
    for (const name of TOOL_NAMES) expect(script).toContain(`"${name}"`);
    expect(script).not.toContain("</script");
    expect(script).not.toContain("agentOnly");
    expect(script).toContain("document.modelContext");
    expect(() => new Function(script)).not.toThrow();
  });
});

describe("squad tools", () => {
  it("completes a full draft with no human clicks and keeps the feed attributed to the agent", () => {
    const store = createDraftStore(loadPlayers(), () => 1_700_000_000_000);

    const gks = call(store, "list_available_players", { position: "GK", maxPrice: 5.5 }, listed);
    expect(gks.players.length).toBeGreaterThan(0);
    for (const gk of gks.players) {
      expect(gk.position).toBe("GK");
      expect(gk.price).toBeLessThanOrEqual(5.5);
      expect(gk.floor).toBeLessThanOrEqual(gk.ceiling);
    }

    const pick = call(store, "draft_player", { playerId: gks.players[0].id }, drafted);
    expect(pick.pick.slotId).toBe("GK");

    const outcome = call(store, "auto_fill_roster", { strategy: "value" }, filled);
    expect(outcome.picks).toHaveLength(10);
    expect(outcome.objective).toBe("mean");
    expect(outcome.squad.complete).toBe(true);
    expect(outcome.squad.formation).toBe("4-3-3");

    const summary = call(store, "get_roster_summary", {}, summarized);
    expect(summary.complete).toBe(true);
    expect(summary.budget.remaining).toBeGreaterThanOrEqual(0);
    expect(summary.budget.spent + summary.budget.remaining).toBeCloseTo(100, 6);
    expect(summary.projection.p10).toBeLessThan(summary.projection.p90);
    expect(summary.availableFormations).toHaveLength(7);

    const state = store.getState();
    expect(state.activity.every((e) => e.actor === "agent")).toBe(true);
    expect(state.activity.some((e) => e.message.startsWith("Drafted "))).toBe(true);
    expect(state.activity.some((e) => e.message.startsWith("Auto-filled 10 slots"))).toBe(true);
    for (const slot of state.slots) expect(slot.filledBy).toBe("agent");
    expect(state.lastFill?.actor).toBe("agent");
    expect(state.lastFill?.slotIds).toHaveLength(10);
    // Every call is on the console, including the read-only ones.
    expect(state.calls.map((c) => c.tool)).toEqual(["get_roster_summary", "auto_fill_roster", "draft_player", "list_available_players"]);
    expect(state.calls.every((c) => c.ok)).toBe(true);
  });

  it("sorts and filters the pool the way the schema promises", () => {
    const store = createDraftStore(loadPlayers());
    const byCeiling = call(store, "list_available_players", { position: "MF", maxPrice: 8, sort: "ceiling", limit: 5 }, listed);
    expect(byCeiling.players).toHaveLength(5);
    for (let i = 1; i < byCeiling.players.length; i++) expect(byCeiling.players[i - 1].ceiling).toBeGreaterThanOrEqual(byCeiling.players[i].ceiling);
    const arsenal = call(store, "list_available_players", { team: "ars" }, listed);
    expect(arsenal.count).toBeGreaterThan(0);
    const band = call(store, "list_available_players", { minPrice: 10, maxPrice: 12 }, listed);
    for (const p of band.players) {
      expect(p.price).toBeGreaterThanOrEqual(10);
      expect(p.price).toBeLessThanOrEqual(12);
    }
  });

  it("returns readable errors instead of throwing, and logs them", () => {
    const store = createDraftStore(loadPlayers());
    const missing = call(store, "draft_player", { playerId: "nobody-here" }, failure);
    expect(missing.error).toMatch(/No player matches/);

    const noInput = call(store, "draft_player", {}, failure);
    expect(noInput.code).toBe("INVALID_INPUT");
    expect(noInput.error).toMatch(/playerId is required/);

    const badPosition = call(store, "list_available_players", { position: "STRIKER" }, failure);
    expect(badPosition.code).toBe("INVALID_INPUT");
    expect(badPosition.error).toMatch(/GK, DF, MF, FW/);

    const badStrategy = call(store, "auto_fill_roster", { strategy: "yolo" }, failure);
    expect(badStrategy.code).toBe("INVALID_INPUT");

    const unknown = call(store, "not_a_tool", {}, failure);
    expect(unknown.code).toBe("UNKNOWN_TOOL");

    const errors = store.getState().activity.filter((e) => e.kind === "error");
    expect(errors.map((e) => e.message.split(" — ")[0])).toEqual([
      "Rejected call",
      "Rejected auto_fill_roster call",
      "Rejected list_available_players call",
      "Rejected draft_player call",
      "Draft failed",
    ]);
    expect(errors.every((e) => e.actor === "agent")).toBe(true);
    expect(store.getState().calls.every((c) => !c.ok)).toBe(true);
  });

  it("contains unexpected handler exceptions and returns a logged failure", () => {
    const store = createDraftStore(loadPlayers());
    store.setState({
      draft: () => {
        throw new Error("forced handler failure");
      },
    });

    let result: ReturnType<typeof executeTool> | undefined;
    expect(() => {
      result = executeTool(store, "draft_player", { playerId: "erling-haaland" });
    }).not.toThrow();
    expect(result).toMatchObject({
      ok: false,
      code: "INTERNAL_ERROR",
      error: "draft_player could not complete: forced handler failure",
    });
    expect(store.getState().activity[0]).toMatchObject({ actor: "agent", kind: "error" });
    expect(store.getState().calls[0]).toMatchObject({ tool: "draft_player", ok: false });
  });

  it("sanitizes tool-controlled text before it enters the activity feed", () => {
    const store = createDraftStore(loadPlayers());
    call(store, "apply_scenario", { scenario: { label: "<img src=x onerror=alert(1)>\u202e" } }, applied);
    call(store, "draft_player", { playerId: "Erling Haaland" }, drafted);
    call(store, "set_assignment", { playerId: "haaland", note: "<script>alert(1)</script>\u0000" }, assigned);

    const feedText = store.getState().activity.flatMap((entry) => [entry.message, entry.detail ?? ""]).join("\n");
    expect(feedText).not.toContain("<");
    expect(feedText).not.toContain(">");
    expect(feedText).not.toContain("\u0000");
    expect(feedText).not.toContain("\u202e");
    expect(feedText).toContain("‹script›alert(1)‹/script›");
  });

  it("returns a result object for adversarial input to every published tool", () => {
    const store = createDraftStore(loadPlayers());
    const adversarialInputs = {
      list_available_players: { position: "STRIKER" },
      get_roster_summary: {},
      draft_player: {},
      remove_player: { slotId: "not-a-slot" },
      swap_player: { slotId: "not-a-slot", newPlayerId: "" },
      auto_fill_roster: { strategy: "spend_everything" },
      set_formation: { formation: "2-2-6" },
      simulate_scenarios: { scenarios: [] },
      apply_scenario: { scenario: { label: "Broken", add: [{ playerId: "missing-player" }] } },
      project_points: { playerIds: ["missing-player"] },
      player_outlook: { playerIds: ["missing-player"] },
      find_upgrades: { slotId: "not-a-slot" },
      get_brief: {},
      set_assignment: { playerId: "missing-player" },
    } satisfies Record<(typeof TOOL_NAMES)[number], JsonObject>;

    for (const name of TOOL_NAMES) {
      let result: ReturnType<typeof executeTool> | undefined;
      expect(() => {
        result = executeTool(store, name, adversarialInputs[name]);
      }, name).not.toThrow();
      expect(result, name).toEqual(expect.objectContaining({ ok: expect.any(Boolean) }));
      if (result && !result.ok) {
        expect(result.code, name).toBeTruthy();
        expect(result.error, name).toBeTruthy();
      }
    }
    expect(store.getState().calls).toHaveLength(14);
  });

  it("keeps same-turn human and agent drafts without losing either update", async () => {
    const store = createDraftStore(loadPlayers());
    const [human, agent] = await Promise.all([
      Promise.resolve().then(() => store.getState().draft({ playerId: "Erling Haaland" }, "human")),
      Promise.resolve().then(() => executeTool(store, "draft_player", { playerId: "Bukayo Saka" })),
    ]);

    expect(human.ok).toBe(true);
    expect(agent.ok).toBe(true);
    expect(store.getState().slots.find((slot) => slot.id === "FW1")?.playerId).toBe("erling-haaland");
    expect(store.getState().slots.find((slot) => slot.id === "MF1")?.playerId).toBe("bukayo-saka");
    expect(store.getState().activity.slice(0, 2).map((entry) => entry.actor).sort()).toEqual(["agent", "human"]);
  });

  it("keeps rapid tool calls distinct without duplicating activity entries", async () => {
    const store = createDraftStore(loadPlayers());
    const chosen = new Set<string>();
    const picks = store.getState().slots.map((slot) => {
      const player = store
        .getState()
        .players.filter((candidate) => candidate.position === slot.type && !chosen.has(candidate.id))
        .sort((a, b) => a.price - b.price || b.projectedPoints - a.projectedPoints)[0];
      chosen.add(player.id);
      return { playerId: player.id, slotId: slot.id };
    });

    const draftResults = await Promise.all(picks.map((input) => Promise.resolve().then(() => executeTool(store, "draft_player", input))));
    expect(draftResults.every((result) => result.ok)).toBe(true);
    expect(store.getState().activity).toHaveLength(11);
    expect(new Set(store.getState().activity.map((entry) => entry.id)).size).toBe(11);
    expect(new Set(store.getState().activity.map((entry) => entry.message)).size).toBe(11);

    const activityBeforeComparisons = store.getState().activity;
    await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        Promise.resolve().then(() => executeTool(store, "simulate_scenarios", { scenarios: [{ label: `Comparison ${index + 1}` }] })),
      ),
    );
    expect(store.getState().activity).toEqual(activityBeforeComparisons);
    expect(store.getState().calls).toHaveLength(19);
    expect(new Set(store.getState().calls.map((entry) => entry.id)).size).toBe(19);
  });

  it("agent picks up a human's mid-draft squad and swaps for value", () => {
    const store = createDraftStore(loadPlayers());
    const human = store.getState().draft({ playerId: "erling-haaland" }, "human");
    expect(human.ok).toBe(true);

    const cheaper = call(store, "list_available_players", { position: "FW", maxPrice: 7 }, listed);
    const target = cheaper.players[0];
    const swap = call(store, "swap_player", { slotId: "FW1", newPlayerId: target.id }, swapped);
    expect(swap.outgoing.id).toBe("erling-haaland");

    const gone = call(store, "remove_player", { playerId: target.id }, removed);
    expect(gone.squad.remaining).toBe(100);

    const feed = store.getState().activity.map((e) => `${e.actor}:${e.kind}`);
    expect(feed).toEqual(["agent:remove", "agent:swap", "human:draft"]);
  });

  it("accepts loosely typed inputs the way agents actually send them", () => {
    const store = createDraftStore(loadPlayers());
    const searched = call(store, "list_available_players", { maxPrice: "£6.0m", search: "SAKA" }, listed);
    expect(searched.count).toBe(0);
    const nulls = call(store, "list_available_players", { position: null, maxPrice: "", search: null, limit: "500" }, listed);
    expect(nulls.count).toBe(120);
    expect(nulls.players).toHaveLength(120);
    call(store, "draft_player", { playerId: "Bukayo Saka", slotId: "" }, okOnly);
    call(store, "remove_player", { slotId: "mf1" }, okOnly);
    call(store, "auto_fill_roster", { strategy: null, objective: "FLOOR" }, okOnly);
    call(store, "set_formation", { formation: "352", force: "yes" }, okOnly);
  });
});

describe("agent-only tools", () => {
  it("set_formation re-shapes, reports conflicts, and forces when asked", () => {
    const store = createDraftStore(loadPlayers());
    call(store, "auto_fill_roster", { strategy: "value" }, filled);
    const blocked = call(store, "set_formation", { formation: "4-5-1" }, failure);
    expect(blocked.code).toBe("FORMATION_CONFLICT");
    expect(blocked.error).toMatch(/force=true/);
    const forced = call(store, "set_formation", { formation: "4-5-1", force: true }, reformed);
    expect(forced.from).toBe("4-3-3");
    expect(forced.to).toBe("4-5-1");
    expect(forced.released).toHaveLength(2);
    expect(store.getState().formation).toBe("4-5-1");
    expect(store.getState().slots.filter((s) => s.type === "MF")).toHaveLength(5);
    const kinds = store.getState().activity.slice(0, 3).map((e) => e.kind);
    expect(kinds).toEqual(["formation", "remove", "remove"]);
  });

  it("simulate_scenarios compares plans without changing the squad, and apply_scenario commits atomically", () => {
    const store = createDraftStore(loadPlayers());
    store.getState().draft({ playerId: "erling-haaland" }, "human");
    const before = JSON.stringify({
      budgetTotal: store.getState().budgetTotal,
      formation: store.getState().formation,
      slots: store.getState().slots,
      players: store.getState().players,
      assignments: store.getState().assignments,
    });

    const sim = call(
      store,
      "simulate_scenarios",
      {
        target: 1600,
        scenarios: [
          { label: "Keep shape", fill: { strategy: "value" } },
          { label: "Midfield five", formation: "3-5-2", fill: { strategy: "stars_and_scrubs", objective: "ceiling" } },
          { label: "Broken", add: [{ playerId: "erling-haaland" }] },
        ],
      },
      simulated,
    );
    expect(sim.scenarios).toHaveLength(3);
    const [keep, five, broken] = sim.scenarios;
    expect(keep.ok && keep.steps.length).toBeGreaterThan(0);
    expect(five.ok && five.formation).toBe("3-5-2");
    expect(!broken.ok && broken.code).toBe("ALREADY_DRAFTED");
    if (keep.ok) {
      expect(keep.projection.probabilityAtLeast).not.toBeNull();
      expect(keep.delta.projectedPoints).toBe(keep.projectedPoints - sim.current.projectedPoints);
    }
    expect(
      JSON.stringify({
        budgetTotal: store.getState().budgetTotal,
        formation: store.getState().formation,
        slots: store.getState().slots,
        players: store.getState().players,
        assignments: store.getState().assignments,
      }),
    ).toBe(before);

    const failed = call(store, "apply_scenario", { scenario: { label: "Broken", add: [{ playerId: "erling-haaland" }] } }, failure);
    expect(failed.code).toBe("SCENARIO_FAILED");
    expect(failed.error).toMatch(/rolled back at step "add erling-haaland"/);
    expect(
      JSON.stringify({
        budgetTotal: store.getState().budgetTotal,
        formation: store.getState().formation,
        slots: store.getState().slots,
        players: store.getState().players,
        assignments: store.getState().assignments,
      }),
    ).toBe(before);

    const done = call(
      store,
      "apply_scenario",
      { scenario: { label: "Midfield five", formation: "3-5-2", fill: { strategy: "value" } } },
      applied,
    );
    expect(done.scenario.formation).toBe("3-5-2");
    expect(done.squad.complete).toBe(true);
    expect(store.getState().formation).toBe("3-5-2");
    expect(store.getState().slots.find((s) => s.id === "FW1")).toMatchObject({ playerId: "erling-haaland", filledBy: "human" });
    expect(store.getState().activity[0].kind).toBe("scenario");
    expect(store.getState().activity[0].message).toMatch(/Applied scenario "Midfield five"/);
  });

  it("fails auto-fill and simulated fills when the remaining constraints are impossible", () => {
    const store = createDraftStore(loadPlayers());
    store.setState({ budgetTotal: 0 });
    const before = JSON.stringify({
      formation: store.getState().formation,
      slots: store.getState().slots,
      players: store.getState().players,
      assignments: store.getState().assignments,
    });

    const fillFailure = call(store, "auto_fill_roster", { strategy: "value", objective: "floor" }, failure);
    expect(fillFailure.code).toBe("IMPOSSIBLE_SQUAD");
    expect(fillFailure.error).toMatch(/cannot fill/i);
    expect(JSON.stringify({ formation: store.getState().formation, slots: store.getState().slots, players: store.getState().players, assignments: store.getState().assignments })).toBe(before);

    const simulation = call(
      store,
      "simulate_scenarios",
      { scenarios: [{ label: "No budget", fill: { strategy: "value", objective: "floor" } }] },
      simulated,
    );
    expect(simulation.scenarios[0]).toMatchObject({ ok: false, code: "IMPOSSIBLE_SQUAD", failedStep: "auto-fill (value, floor)" });
    expect(JSON.stringify({ formation: store.getState().formation, slots: store.getState().slots, players: store.getState().players, assignments: store.getState().assignments })).toBe(before);
  });

  it("project_points models the squad or a hypothetical list", () => {
    const store = createDraftStore(loadPlayers());
    const empty = call(store, "project_points", {}, failure);
    expect(empty.code).toBe("SLOT_EMPTY");

    const hypothetical = call(store, "project_points", { playerIds: ["erling-haaland", "Bukayo Saka"], target: 300, samples: 1000 }, projected);
    expect(hypothetical.scope).toBe("hypothetical");
    expect(hypothetical.contributions.map((c) => c.id)).toEqual(["erling-haaland", "bukayo-saka"]);
    expect(hypothetical.projection.probabilityAtLeast).toBeGreaterThan(0.5);

    call(store, "auto_fill_roster", {}, filled);
    const squad = call(store, "project_points", { target: 1500 }, projected);
    expect(squad.scope).toBe("squad");
    expect(squad.contributions).toHaveLength(11);
    expect(Math.round(squad.contributions.reduce((s, c) => s + c.share, 0))).toBeGreaterThan(90);
  });

  it("player_outlook profiles players and honours a target", () => {
    const store = createDraftStore(loadPlayers());
    const result = call(store, "player_outlook", { playerIds: ["haaland", "alexander-isak"], target: 200 }, outlooks);
    expect(result.players.map((p) => p.id)).toEqual(["erling-haaland", "alexander-isak"]);
    for (const p of result.players) {
      expect(p.outlook.p10).toBeLessThan(p.outlook.p90);
      expect(p.outlook.probabilityAtLeast).not.toBeNull();
      expect(["bankable", "steady", "boom-or-bust"]).toContain(p.profile);
    }
    const ambiguous = call(store, "player_outlook", { playerIds: ["a"] }, failure);
    expect(ambiguous.code).toBe("PLAYER_AMBIGUOUS");
  });

  it("find_upgrades ranks swaps under the remaining budget", () => {
    const store = createDraftStore(loadPlayers());
    call(store, "auto_fill_roster", { strategy: "stars_and_scrubs" }, filled);
    const result = call(store, "find_upgrades", { objective: "mean", limit: 4 }, upgrades);
    const left = store.getState().budgetTotal - store.getState().slots.reduce((s, slot) => s + (store.getState().players.find((p) => p.id === slot.playerId)?.price ?? 0), 0);
    for (const u of result.upgrades) {
      expect(u.gain).toBeGreaterThan(0);
      expect(u.cost).toBeLessThanOrEqual(left + 1e-9);
      expect(u.in.position).toBe(u.out.position);
    }
    const midfield = call(store, "find_upgrades", { position: "MF", objective: "floor", maxCost: "£2.0m", limit: 3 }, upgrades);
    for (const u of midfield.upgrades) {
      expect(u.slotId).toMatch(/^MF/);
      expect(u.cost).toBeLessThanOrEqual(2);
    }
  });
});

describe("the manager's brief", () => {
  it("starts empty, then carries armband, duties, and notes both ways", () => {
    const store = createDraftStore(loadPlayers());
    const empty = call(store, "get_brief", {}, briefed);
    expect(empty.players).toEqual([]);
    expect(empty.text).toBe("");

    call(store, "draft_player", { playerId: "Erling Haaland" }, drafted);
    call(store, "draft_player", { playerId: "Bukayo Saka" }, drafted);
    call(store, "draft_player", { playerId: "Cole Palmer" }, drafted);

    // The human clicks a card and writes the brief through the same store action the tool uses.
    const human = store.getState().assign({ playerId: "Erling Haaland", armband: "captain", duties: ["protected"], note: "Never sell." }, "human");
    expect(human.ok && human.value.changes).toHaveLength(3);

    const agent = call(store, "set_assignment", { playerId: "saka", armband: "vice-captain", duties: ["Set pieces"] }, assigned);
    expect(agent.armband).toBe("vice");
    expect(agent.duties).toEqual(["Set pieces"]);

    const brief = call(store, "get_brief", {}, briefed);
    expect(brief.captain?.name).toBe("Erling Haaland");
    expect(brief.vice?.name).toBe("Bukayo Saka");
    expect(brief.protectedPlayerIds).toHaveLength(1);
    expect(brief.text).toContain("captain (points count double)");
    expect(brief.text).toContain("protected: do not remove or swap without asking");
    expect(brief.text).toContain("Never sell.");

    // Vice takes the captaincy and the old captain drops to vice, so two players never share an armband.
    const promoted = call(store, "set_assignment", { playerId: "saka", armband: "captain" }, assigned);
    expect(promoted.changes[0]).toContain("captain");
    const after = call(store, "get_brief", {}, briefed);
    expect(after.captain?.name).toBe("Bukayo Saka");
    expect(after.vice?.name).toBe("Erling Haaland");

    // Idempotent writes report no change; unknown duties and undrafted players are rejected.
    const same = call(store, "set_assignment", { playerId: "saka", armband: "captain" }, assigned);
    expect(same.changes).toEqual([]);
    expect(call(store, "set_assignment", { playerId: "saka", duties: ["corners"] }, failure).code).toBe("INVALID_INPUT");
    expect(call(store, "set_assignment", { playerId: "Alexander Isak", armband: "captain" }, failure).code).toBe("NOT_IN_SQUAD");
    const feed = store.getState().activity.filter((e) => e.kind === "brief");
    expect(feed.some((e) => e.actor === "human")).toBe(true);
    expect(feed.some((e) => e.actor === "agent")).toBe(true);
  });

  it("protection blocks the agent, not the manager, and force overrides it", () => {
    const store = createDraftStore(loadPlayers());
    call(store, "draft_player", { playerId: "Erling Haaland" }, drafted);
    call(store, "set_assignment", { playerId: "haaland", duties: ["protected"] }, assigned);

    const blocked = call(store, "remove_player", { playerId: "haaland" }, failure);
    expect(blocked.code).toBe("PROTECTED");
    const cheaper = call(store, "list_available_players", { position: "FW", maxPrice: 8, limit: 1 }, listed).players[0];
    expect(call(store, "swap_player", { slotId: "FW1", newPlayerId: cheaper.id }, failure).code).toBe("PROTECTED");
    expect(call(store, "find_upgrades", { objective: "mean" }, failure).code).toBe("SLOT_EMPTY");

    // A scenario that would release him fails whole; one that keeps him lands.
    call(store, "draft_player", { playerId: "Alexander Isak" }, drafted);
    call(store, "draft_player", { playerId: "Viktor Gyokeres" }, drafted);
    const sims = call(store, "simulate_scenarios", { scenarios: [{ label: "5-4-1", formation: "5-4-1" }, { label: "4-4-2", formation: "4-4-2" }] }, simulated);
    expect(sims.scenarios[0].ok).toBe(false);
    expect(sims.scenarios[1].ok).toBe(false);
    // Forcing releases unprotected surplus first; it refuses only when a protected player would have to go.
    const kept = call(store, "set_formation", { formation: "4-4-2", force: true }, reformed);
    expect(kept.released.map((r) => r.slotId)).toHaveLength(1);
    expect(store.getState().players.find((p) => p.id === "erling-haaland")?.drafted ?? store.getState().slots.some((s) => s.playerId?.includes("haaland"))).toBe(true);
    call(store, "set_assignment", { playerId: "Alexander Isak", duties: ["protected"] }, assigned);
    const forced = call(store, "set_formation", { formation: "4-5-1", force: true }, failure);
    expect(forced.code).toBe("PROTECTED");

    const human = store.getState().remove({ playerId: "haaland" }, "human");
    expect(human.ok).toBe(true);
    expect(Object.keys(store.getState().assignments.briefs)).toEqual(["alexander-isak"]);

    call(store, "draft_player", { playerId: "Erling Haaland" }, drafted);
    call(store, "set_assignment", { playerId: "haaland", armband: "captain", duties: ["protected"] }, assigned);
    const overridden = call(store, "remove_player", { playerId: "haaland", force: "yes" }, removed);
    expect(overridden.ok).toBe(true);
    expect(store.getState().assignments.captainId).toBeNull();
  });

  it("the captain doubles in every projection and the vice covers a disrupted captain", () => {
    const store = createDraftStore(loadPlayers());
    call(store, "auto_fill_roster", { strategy: "value" }, filled);
    const plain = call(store, "get_roster_summary", {}, summarized);
    const captainId = store.getState().slots.find((slot) => slot.id === "FW1")?.playerId ?? "";
    const captain = store.getState().players.find((p) => p.id === captainId);
    call(store, "set_assignment", { playerId: captainId, armband: "captain" }, assigned);
    const withCaptain = call(store, "get_roster_summary", {}, summarized);
    expect(withCaptain.projectedPoints).toBe(plain.projectedPoints + (captain?.projectedPoints ?? 0));
    expect(withCaptain.projection.mean).toBeGreaterThan(plain.projection.mean + (captain?.projectedPoints ?? 0) * 0.8);
    const points = call(store, "project_points", {}, projected);
    expect(points.projection.mean).toBe(withCaptain.projection.mean);
    expect(points.projection.p10).toBe(withCaptain.projection.p10);
    expect(points.projection.p90).toBe(withCaptain.projection.p90);
    const viceId = store.getState().slots.find((slot) => slot.id === "MF1")?.playerId ?? "";
    call(store, "set_assignment", { playerId: viceId, armband: "vice" }, assigned);
    const withVice = call(store, "get_roster_summary", {}, summarized);
    expect(withVice.projection.p10).toBeGreaterThanOrEqual(withCaptain.projection.p10);
  });
});
