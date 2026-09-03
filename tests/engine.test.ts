import { describe, expect, it } from "vitest";
import { loadPlayers } from "@/lib/data";
import {
  autoFill,
  draftPlayer,
  filterPlayers,
  findUpgrades,
  remaining,
  removePlayer,
  resolvePlayer,
  setFormation,
  spent,
  summarize,
  swapPlayer,
  reseatPlayer,
  type AutoFillInput,
} from "@/lib/engine";
import { BUDGET_TOTAL, DEFAULT_FORMATION, createSlots } from "@/lib/slots";
import { EMPTY_ASSIGNMENTS, type DraftState, type Player } from "@/lib/types";

const VALUE: AutoFillInput = { strategy: "value", objective: "mean" };
const STARS: AutoFillInput = { strategy: "stars_and_scrubs", objective: "mean" };

function fresh(players: Player[] = loadPlayers()): DraftState {
  return { budgetTotal: BUDGET_TOTAL, formation: DEFAULT_FORMATION, slots: createSlots(DEFAULT_FORMATION), players, assignments: EMPTY_ASSIGNMENTS };
}

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function isHalfStep(value: number): boolean {
  return Math.abs(value * 2 - Math.round(value * 2)) < 1e-9;
}

describe("player pool", () => {
  const players = loadPlayers();

  it("has 120 players in the required position split", () => {
    expect(players).toHaveLength(120);
    const counts = players.reduce<Record<string, number>>((acc, p) => ({ ...acc, [p.position]: (acc[p.position] ?? 0) + 1 }), {});
    expect(counts).toEqual({ GK: 14, DF: 36, MF: 40, FW: 30 });
  });

  it("uses unique ids and half-million price steps", () => {
    expect(new Set(players.map((p) => p.id)).size).toBe(players.length);
    for (const p of players) {
      expect(isHalfStep(p.price)).toBe(true);
      expect(p.price).toBeGreaterThanOrEqual(4);
      expect(p.price).toBeLessThanOrEqual(15);
      expect(Number.isInteger(p.projectedPoints)).toBe(true);
    }
  });

  it("can always afford a full squad of the cheapest options in every formation", () => {
    for (const formation of ["4-3-3", "4-4-2", "3-5-2", "3-4-3", "5-3-2", "4-5-1", "5-4-1"] as const) {
      let total = 0;
      for (const slot of createSlots(formation)) {
        total += Math.min(...players.filter((p) => p.position === slot.type).map((p) => p.price));
      }
      expect(total, formation).toBeLessThan(BUDGET_TOTAL);
    }
  });
});

describe("formations", () => {
  it("4-3-3 is the default and yields eleven position-typed slots", () => {
    const state = fresh();
    expect(state.slots.map((s) => s.id)).toEqual(["GK", "DF1", "DF2", "DF3", "DF4", "MF1", "MF2", "MF3", "FW1", "FW2", "FW3"]);
  });

  it("re-seats players by line and keeps who picked them", () => {
    let state = fresh();
    state = unwrap(draftPlayer(state, { playerId: "erling-haaland" }, "human")).state;
    const mf = filterPlayers(state, { position: "MF" })[0];
    state = unwrap(draftPlayer(state, { playerId: mf.id, slotId: "MF3" }, "agent")).state;

    const change = unwrap(setFormation(state, { formation: "3-5-2" }));
    expect(change.from).toBe("4-3-3");
    expect(change.to).toBe("3-5-2");
    expect(change.released).toEqual([]);
    expect(change.state.slots.map((s) => s.id)).toEqual(["GK", "DF1", "DF2", "DF3", "MF1", "MF2", "MF3", "MF4", "MF5", "FW1", "FW2"]);
    // MF3 was the only midfielder, so it takes MF1 in the new shape and the move is reported.
    expect(change.state.slots.find((s) => s.id === "MF1")).toMatchObject({ playerId: mf.id, filledBy: "agent" });
    expect(change.moved).toEqual([{ playerId: mf.id, from: "MF3", to: "MF1" }]);
    expect(change.state.slots.find((s) => s.id === "FW1")).toMatchObject({ playerId: "erling-haaland", filledBy: "human" });
    expect(spent(change.state)).toBe(spent(state));
  });

  it("refuses a shape with fewer slots than drafted players unless forced, then releases the lowest projected", () => {
    let state = fresh();
    const fws = filterPlayers(state, { position: "FW" }).slice(0, 3);
    for (const fw of fws) state = unwrap(draftPlayer(state, { playerId: fw.id }, "agent")).state;

    const blocked = setFormation(state, { formation: "4-5-1" });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.code).toBe("FORMATION_CONFLICT");
      expect(blocked.error).toMatch(/2 current picks would not fit/);
      expect(blocked.error).toMatch(/force=true/);
    }

    const forced = unwrap(setFormation(state, { formation: "4-5-1", force: true }));
    expect(forced.released).toHaveLength(2);
    const kept = forced.state.slots.find((s) => s.id === "FW1")?.playerId;
    expect(kept).toBe(fws[0].id);
    for (const drop of forced.released) expect(forced.state.players.find((p) => p.id === drop.player.id)?.drafted).toBe(false);
    expect(remaining(forced.state)).toBe(BUDGET_TOTAL - fws[0].price);
  });

  it("rejects unknown shapes and accepts loose spellings", () => {
    const bad = setFormation(fresh(), { formation: "2-2-6" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.code).toBe("FORMATION_UNKNOWN");
    expect(unwrap(setFormation(fresh(), { formation: "442" })).to).toBe("4-4-2");
    expect(unwrap(setFormation(fresh(), { formation: "3 5 2" })).to).toBe("3-5-2");
  });
});

describe("resolvePlayer", () => {
  const state = fresh();

  it("matches by id, exact name, and unique partial", () => {
    expect(unwrap(resolvePlayer(state, "erling-haaland")).name).toBe("Erling Haaland");
    expect(unwrap(resolvePlayer(state, "Erling Haaland")).id).toBe("erling-haaland");
    expect(unwrap(resolvePlayer(state, "haaland")).id).toBe("erling-haaland");
  });

  it("fails clearly on unknown or empty input", () => {
    const missing = resolvePlayer(state, "zlatan");
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.code).toBe("PLAYER_NOT_FOUND");
    const empty = resolvePlayer(state, "");
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.code).toBe("INVALID_INPUT");
  });
});

describe("draftPlayer", () => {
  it("drafts into the first eligible slot and updates budget", () => {
    const state = fresh();
    const { state: next, pick } = unwrap(draftPlayer(state, { playerId: "erling-haaland" }, "human"));
    expect(pick.slotId).toBe("FW1");
    expect(next.slots.find((s) => s.id === "FW1")?.filledBy).toBe("human");
    expect(next.players.find((p) => p.id === "erling-haaland")?.drafted).toBe(true);
    expect(spent(next)).toBe(pick.player.price);
    expect(remaining(next)).toBe(BUDGET_TOTAL - pick.player.price);
    // The original state is untouched.
    expect(state.players.find((p) => p.id === "erling-haaland")?.drafted).toBe(false);
  });

  it("fills a line in order and points at set_formation when the line is full", () => {
    let state = fresh();
    const fws = filterPlayers(state, { position: "FW", maxPrice: 8 }).slice(0, 3);
    const slots: string[] = [];
    for (const fw of fws) {
      const out = unwrap(draftPlayer(state, { playerId: fw.id }, "agent"));
      state = out.state;
      slots.push(out.pick.slotId);
    }
    expect(slots).toEqual(["FW1", "FW2", "FW3"]);
    const fourth = draftPlayer(state, { playerId: filterPlayers(state, { position: "FW" })[0].id }, "agent");
    expect(fourth.ok).toBe(false);
    if (!fourth.ok) {
      expect(fourth.code).toBe("NO_ELIGIBLE_SLOT");
      expect(fourth.error).toMatch(/set_formation/);
    }
  });

  it("rejects wrong position, occupied slot, duplicates, and overspend", () => {
    const state = fresh();
    const wrongSlot = draftPlayer(state, { playerId: "erling-haaland", slotId: "GK" }, "human");
    expect(wrongSlot.ok).toBe(false);
    if (!wrongSlot.ok) expect(wrongSlot.code).toBe("NOT_ELIGIBLE");

    const { state: afterOne } = unwrap(draftPlayer(state, { playerId: "erling-haaland", slotId: "FW1" }, "human"));
    const occupied = draftPlayer(afterOne, { playerId: filterPlayers(afterOne, { position: "FW" })[0].id, slotId: "fw1" }, "human");
    expect(occupied.ok).toBe(false);
    if (!occupied.ok) expect(occupied.code).toBe("SLOT_OCCUPIED");

    const duplicate = draftPlayer(afterOne, { playerId: "erling-haaland" }, "agent");
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.code).toBe("ALREADY_DRAFTED");

    const tight: DraftState = { ...state, budgetTotal: 10 };
    const over = draftPlayer(tight, { playerId: "erling-haaland" }, "agent");
    expect(over.ok).toBe(false);
    if (!over.ok) {
      expect(over.code).toBe("OVER_BUDGET");
      expect(over.error).toMatch(/short by £5\.0m/);
    }
  });
});

describe("removePlayer and swapPlayer", () => {
  it("removes by slot or player and restores budget", () => {
    const state = fresh();
    const { state: drafted } = unwrap(draftPlayer(state, { playerId: "erling-haaland" }, "human"));
    const bySlot = unwrap(removePlayer(drafted, { slotId: "FW1" }));
    expect(remaining(bySlot.state)).toBe(BUDGET_TOTAL);
    expect(bySlot.state.players.find((p) => p.id === "erling-haaland")?.drafted).toBe(false);

    const byPlayer = unwrap(removePlayer(drafted, { playerId: "Haaland" }));
    expect(byPlayer.slotId).toBe("FW1");

    const emptySlot = removePlayer(state, { slotId: "GK" });
    expect(emptySlot.ok).toBe(false);
    if (!emptySlot.ok) expect(emptySlot.code).toBe("SLOT_EMPTY");

    const nothing = removePlayer(state, {});
    expect(nothing.ok).toBe(false);
    if (!nothing.ok) expect(nothing.code).toBe("INVALID_INPUT");
  });

  it("swaps within budget and respects eligibility", () => {
    const state = fresh();
    const { state: drafted } = unwrap(draftPlayer(state, { playerId: "erling-haaland" }, "human"));
    const cheaperFw = filterPlayers(drafted, { position: "FW", maxPrice: 6 })[0];
    const swapped = unwrap(swapPlayer(drafted, { slotId: "FW1", newPlayerId: cheaperFw.id }, "agent"));
    expect(swapped.outgoing?.id).toBe("erling-haaland");
    expect(swapped.pick.player.id).toBe(cheaperFw.id);
    expect(swapped.state.players.find((p) => p.id === "erling-haaland")?.drafted).toBe(false);
    expect(swapped.state.slots.find((s) => s.id === "FW1")?.filledBy).toBe("agent");
    expect(remaining(swapped.state)).toBe(BUDGET_TOTAL - cheaperFw.price);

    const wrong = swapPlayer(drafted, { slotId: "FW1", newPlayerId: filterPlayers(drafted, { position: "GK" })[0].id }, "agent");
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.code).toBe("NOT_ELIGIBLE");

    const fws = filterPlayers(state, { position: "FW" });
    const cheapFw = fws[fws.length - 1];
    const dearFw = fws[0];
    const withCheap = unwrap(draftPlayer(state, { playerId: cheapFw.id, slotId: "FW1" }, "human")).state;
    const capped: DraftState = { ...withCheap, budgetTotal: dearFw.price - 0.5 };
    const over = swapPlayer(capped, { slotId: "FW1", newPlayerId: dearFw.id }, "agent");
    expect(over.ok).toBe(false);
    if (!over.ok) {
      expect(over.code).toBe("OVER_BUDGET");
      expect(over.error).toMatch(/overspend by £0\.5m/);
    }
  });
});

describe("reseatPlayer", () => {
  it("moves a drafted player to an empty slot of the same position and keeps actor tags", () => {
    const drafted = unwrap(draftPlayer(fresh(), { playerId: "erling-haaland", slotId: "FW1" }, "human"));
    const moved = unwrap(reseatPlayer(drafted.state, { playerId: "erling-haaland", slotId: "FW2" }, "human"));
    expect(moved.fromSlotId).toBe("FW1");
    expect(moved.toSlotId).toBe("FW2");
    expect(moved.exchanged).toBeNull();
    expect(moved.state.slots.find((s) => s.id === "FW1")?.playerId).toBeNull();
    expect(moved.state.slots.find((s) => s.id === "FW2")?.playerId).toBe("erling-haaland");
    expect(moved.state.slots.find((s) => s.id === "FW2")?.filledBy).toBe("human");
    expect(moved.state.players.find((p) => p.id === "erling-haaland")?.drafted).toBe(true);
  });

  it("exchanges two drafted players and keeps each filledBy", () => {
    let state = unwrap(draftPlayer(fresh(), { playerId: "erling-haaland", slotId: "FW1" }, "human")).state;
    const other = filterPlayers(state, { position: "FW" }).find((p) => !p.drafted);
    if (!other) throw new Error("need a second forward");
    state = unwrap(draftPlayer(state, { playerId: other.id, slotId: "FW2" }, "agent")).state;
    const exchanged = unwrap(reseatPlayer(state, { playerId: "erling-haaland", slotId: "FW2" }, "human"));
    expect(exchanged.exchanged?.id).toBe(other.id);
    expect(exchanged.state.slots.find((s) => s.id === "FW2")?.playerId).toBe("erling-haaland");
    expect(exchanged.state.slots.find((s) => s.id === "FW2")?.filledBy).toBe("human");
    expect(exchanged.state.slots.find((s) => s.id === "FW1")?.playerId).toBe(other.id);
    expect(exchanged.state.slots.find((s) => s.id === "FW1")?.filledBy).toBe("agent");
  });

  it("rejects the wrong position, a player not in the squad, and the same slot", () => {
    const empty = reseatPlayer(fresh(), { playerId: "erling-haaland", slotId: "FW1" }, "human");
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.code).toBe("NOT_IN_SQUAD");

    const drafted = unwrap(draftPlayer(fresh(), { playerId: "erling-haaland", slotId: "FW1" }, "human"));
    const same = reseatPlayer(drafted.state, { playerId: "erling-haaland", slotId: "FW1" }, "human");
    expect(same.ok).toBe(false);
    if (!same.ok) expect(same.code).toBe("ALREADY_DRAFTED");

    const gk = reseatPlayer(drafted.state, { playerId: "erling-haaland", slotId: "GK" }, "human");
    expect(gk.ok).toBe(false);
    if (!gk.ok) expect(gk.code).toBe("NOT_ELIGIBLE");
  });

  it("blocks an agent from moving a protected player unless force is set; humans are never blocked", () => {
    let state = unwrap(draftPlayer(fresh(), { playerId: "erling-haaland", slotId: "FW1" }, "human")).state;
    state = {
      ...state,
      assignments: {
        ...state.assignments,
        captainId: "erling-haaland",
        briefs: { "erling-haaland": { duties: ["protected"], note: "" } },
      },
    };
    const blocked = reseatPlayer(state, { playerId: "erling-haaland", slotId: "FW2" }, "agent");
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.code).toBe("PROTECTED");

    const forced = unwrap(reseatPlayer(state, { playerId: "erling-haaland", slotId: "FW2", force: true }, "agent"));
    expect(forced.toSlotId).toBe("FW2");
    expect(forced.state.assignments.captainId).toBe("erling-haaland");

    const human = unwrap(reseatPlayer(state, { playerId: "erling-haaland", slotId: "FW2" }, "human"));
    expect(human.toSlotId).toBe("FW2");
    expect(human.state.assignments.captainId).toBe("erling-haaland");
  });
});

describe("autoFill", () => {
  it("value strategy fills every slot under budget from an empty squad", () => {
    const outcome = unwrap(autoFill(fresh(), VALUE, "agent"));
    expect(outcome.picks).toHaveLength(11);
    expect(outcome.skipped).toEqual([]);
    const summary = summarize(outcome.state);
    expect(summary.complete).toBe(true);
    expect(summary.spent).toBeLessThanOrEqual(BUDGET_TOTAL);
    expect(summary.remaining).toBeGreaterThanOrEqual(0);
    expect(isHalfStep(summary.spent)).toBe(true);
    for (const slot of outcome.state.slots) {
      expect(slot.filledBy).toBe("agent");
      const player = outcome.state.players.find((p) => p.id === slot.playerId)!;
      expect(slot.type).toBe(player.position);
    }
    expect(summary.spent).toBeGreaterThan(BUDGET_TOTAL * 0.9);
    for (const pick of outcome.picks) expect(pick.reason).toMatch(/projected points per £m/);
  });

  it("stars_and_scrubs concentrates spend and still completes", () => {
    const outcome = unwrap(autoFill(fresh(), STARS, "agent"));
    expect(outcome.picks).toHaveLength(11);
    const summary = summarize(outcome.state);
    expect(summary.complete).toBe(true);
    expect(summary.remaining).toBeGreaterThanOrEqual(0);
    const prices = outcome.picks.map((p) => p.player.price).sort((a, b) => b - a);
    const top = prices.slice(0, 6).reduce((a, b) => a + b, 0);
    const bottom = prices.slice(6).reduce((a, b) => a + b, 0);
    expect(top).toBeGreaterThan(bottom * 1.8);
    expect(outcome.picks.some((p) => p.reason?.includes("star pick"))).toBe(true);
    expect(outcome.picks.some((p) => p.reason?.includes("scrub pick"))).toBe(true);
  });

  it("floor and ceiling objectives produce different squads with different risk", () => {
    const floor = unwrap(autoFill(fresh(), { strategy: "value", objective: "floor" }, "agent"));
    const ceiling = unwrap(autoFill(fresh(), { strategy: "value", objective: "ceiling" }, "agent"));
    expect(floor.objective).toBe("floor");
    expect(summarize(floor.state).complete).toBe(true);
    expect(summarize(ceiling.state).complete).toBe(true);
    const ids = (o: typeof floor) => o.state.slots.map((s) => s.playerId).sort();
    expect(ids(floor)).not.toEqual(ids(ceiling));
    for (const pick of floor.picks) expect(pick.reason).toMatch(/floor/);
    for (const pick of ceiling.picks) expect(pick.reason).toMatch(/ceiling/);
  });

  it("leaves human picks untouched and completes mid-draft", () => {
    const state = fresh();
    const a = unwrap(draftPlayer(state, { playerId: "erling-haaland" }, "human")).state;
    const gk = filterPlayers(a, { position: "GK" })[0];
    const b = unwrap(draftPlayer(a, { playerId: gk.id, slotId: "GK" }, "human")).state;
    const outcome = unwrap(autoFill(b, VALUE, "agent"));
    expect(outcome.picks).toHaveLength(9);
    expect(outcome.state.slots.find((s) => s.id === "FW1")?.playerId).toBe("erling-haaland");
    expect(outcome.state.slots.find((s) => s.id === "FW1")?.filledBy).toBe("human");
    expect(outcome.state.slots.find((s) => s.id === "GK")?.playerId).toBe(gk.id);
    expect(remaining(outcome.state)).toBeGreaterThanOrEqual(0);
    expect(summarize(outcome.state).complete).toBe(true);
  });

  it("rejects a short budget without returning a partial squad", () => {
    for (const input of [VALUE, STARS]) {
      const tightState = { ...fresh(), budgetTotal: 20 };
      const before = JSON.stringify(tightState);
      const tight = autoFill(tightState, input, "agent");
      expect(tight.ok).toBe(false);
      if (!tight.ok) {
        expect(tight.code).toBe("IMPOSSIBLE_SQUAD");
        expect(tight.error).toMatch(/Cannot fill the remaining/);
      }
      expect(JSON.stringify(tightState)).toBe(before);

      let state = fresh();
      state = unwrap(autoFill({ ...state, budgetTotal: 100 }, VALUE, "agent")).state;
      const openTwo: DraftState = {
        ...state,
        slots: state.slots.map((s) => (s.id === "GK" || s.id === "DF1" ? { ...s, playerId: null, filledBy: null } : s)),
      };
      expect(openTwo.slots.filter((s) => !s.playerId).length).toBe(2);
      const withSix: DraftState = { ...openTwo, budgetTotal: spent(openTwo) + 6 };
      const two = autoFill(withSix, input, "agent");
      expect(two.ok).toBe(false);
      if (!two.ok) expect(two.code).toBe("IMPOSSIBLE_SQUAD");
    }
  });

  it("finishes when expensive human picks still leave a feasible budget", () => {
    let state = fresh();
    const stars = filterPlayers(state, {}).slice(0, 7);
    for (const star of stars) {
      const result = draftPlayer(state, { playerId: star.id }, "human");
      if (result.ok) state = result.value.state;
    }
    expect(state.slots.filter((s) => !s.playerId).length).toBeGreaterThan(0);
    const outcome = unwrap(autoFill(state, VALUE, "agent"));
    expect(outcome.picks.length).toBeGreaterThanOrEqual(1);
    expect(outcome.skipped).toEqual([]);
    expect(summarize(outcome.state).complete).toBe(true);
  });

  it("refuses to run on a full squad", () => {
    const full = unwrap(autoFill(fresh(), VALUE, "agent")).state;
    const again = autoFill(full, VALUE, "agent");
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.code).toBe("SQUAD_FULL");
  });
});

describe("findUpgrades", () => {
  it("ranks affordable single swaps by gain and never overspends", () => {
    // A cheap full squad leaves money for upgrades.
    let state = fresh();
    for (const slot of state.slots) {
      const cheapest = filterPlayers(state, { position: slot.type, sort: "price" }).at(-1)!;
      state = unwrap(draftPlayer(state, { playerId: cheapest.id, slotId: slot.id }, "human")).state;
    }
    const left = remaining(state);
    expect(left).toBeGreaterThan(40);

    const upgrades = unwrap(findUpgrades(state, { objective: "mean", limit: 5 }));
    expect(upgrades).toHaveLength(5);
    for (let i = 1; i < upgrades.length; i++) expect(upgrades[i - 1].gain).toBeGreaterThanOrEqual(upgrades[i].gain);
    for (const u of upgrades) {
      expect(u.cost).toBeLessThanOrEqual(left);
      expect(u.gain).toBeGreaterThan(0);
      expect(u.to.position).toBe(u.from.position);
      expect(u.to.drafted).toBe(false);
    }

    const inMidfield = unwrap(findUpgrades(state, { objective: "floor", position: "MF", maxCost: 3, limit: 3 }));
    for (const u of inMidfield) {
      expect(u.slotId).toMatch(/^MF/);
      expect(u.cost).toBeLessThanOrEqual(3);
    }
  });

  it("fails clearly on an empty slot or empty squad", () => {
    const empty = findUpgrades(fresh(), { objective: "mean", limit: 5 });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.code).toBe("SLOT_EMPTY");
    const slot = findUpgrades(fresh(), { objective: "mean", slotId: "GK", limit: 5 });
    expect(slot.ok).toBe(false);
  });
});
