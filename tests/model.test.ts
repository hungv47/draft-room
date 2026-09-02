import { describe, expect, it } from "vitest";
import { loadPlayers } from "@/lib/data";
import { autoFill, draftPlayer, filterPlayers, spent } from "@/lib/engine";
import { objectiveScore, playerOutlook, projectSquad } from "@/lib/model";
import { runScenario } from "@/lib/scenarios";
import { BUDGET_TOTAL, DEFAULT_FORMATION, createSlots } from "@/lib/slots";
import { EMPTY_ASSIGNMENTS, type DraftState } from "@/lib/types";

function fresh(): DraftState {
  return { budgetTotal: BUDGET_TOTAL, formation: DEFAULT_FORMATION, slots: createSlots(DEFAULT_FORMATION), players: loadPlayers(), assignments: EMPTY_ASSIGNMENTS };
}

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe("points probability model", () => {
  const players = loadPlayers();

  it("keeps the projection as the mean and orders the percentiles", () => {
    for (const player of players) {
      const o = playerOutlook(player);
      expect(o.mean).toBe(player.projectedPoints);
      expect(o.p10).toBeLessThanOrEqual(o.p50);
      expect(o.p50).toBeLessThanOrEqual(o.p90);
      expect(o.p10).toBeGreaterThanOrEqual(0);
      expect(o.startProbability).toBeGreaterThanOrEqual(0.68);
      expect(o.startProbability).toBeLessThanOrEqual(0.95);
      expect(o.sd).toBeGreaterThan(0);
    }
  });

  it("makes forwards swingier than goalkeepers and premium players safer starters", () => {
    const gk = players.filter((p) => p.position === "GK");
    const fw = players.filter((p) => p.position === "FW");
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(avg(fw.map((p) => playerOutlook(p).volatility))).toBeGreaterThan(avg(gk.map((p) => playerOutlook(p).volatility)));
    const dear = players.filter((p) => p.price >= 12);
    const cheap = players.filter((p) => p.price <= 5);
    expect(avg(dear.map((p) => playerOutlook(p).startProbability))).toBeGreaterThan(avg(cheap.map((p) => playerOutlook(p).startProbability)));
  });

  it("is deterministic and the objectives bracket the mean", () => {
    const haaland = players.find((p) => p.id === "erling-haaland")!;
    expect(playerOutlook(haaland)).toEqual(playerOutlook({ ...haaland }));
    expect(objectiveScore(haaland, "floor")).toBeLessThan(objectiveScore(haaland, "mean"));
    expect(objectiveScore(haaland, "ceiling")).toBeGreaterThan(objectiveScore(haaland, "mean"));
  });

  it("projects a squad total with a sensible spread, target probability, and club stacks", () => {
    const state = unwrap(autoFill(fresh(), { strategy: "value", objective: "mean" }, "agent")).state;
    const squad = state.players.filter((p) => p.drafted);
    const sumMean = squad.reduce((s, p) => s + p.projectedPoints, 0);
    const projection = projectSquad(squad, { target: sumMean });
    // Monte Carlo mean within 3% of the analytic mean.
    expect(Math.abs(projection.mean - sumMean) / sumMean).toBeLessThan(0.03);
    expect(projection.p10).toBeLessThan(projection.p50);
    expect(projection.p50).toBeLessThan(projection.p90);
    expect(projection.probabilityAtLeast).toBeGreaterThan(0.35);
    expect(projection.probabilityAtLeast).toBeLessThan(0.65);
    expect(projection.samples).toBe(4000);
    expect(projectSquad(squad, { target: sumMean })).toEqual(projection);

    const stacked = players.filter((p) => p.team === "ARS").slice(0, 4);
    expect(projectSquad(stacked).clubStacks).toEqual([{ team: "ARS", count: 4 }]);
  });

  it("stacking one club widens the distribution versus a spread squad of equal mean", () => {
    const arsenal = players.filter((p) => p.team === "ARS").sort((a, b) => b.projectedPoints - a.projectedPoints).slice(0, 5);
    const mean = arsenal.reduce((s, p) => s + p.projectedPoints, 0);
    // Five players from five clubs with the same total projection, matched by position mix loosely.
    const spread: typeof arsenal = [];
    const clubs = new Set<string>();
    for (const p of [...players].sort((a, b) => b.projectedPoints - a.projectedPoints)) {
      if (clubs.has(p.team) || p.team === "ARS") continue;
      spread.push(p);
      clubs.add(p.team);
      if (spread.length === 5) break;
    }
    const scale = mean / spread.reduce((s, p) => s + p.projectedPoints, 0);
    const rescaled = spread.map((p) => ({ ...p, projectedPoints: Math.round(p.projectedPoints * scale) }));
    expect(projectSquad(arsenal).sd).toBeGreaterThan(projectSquad(rescaled).sd);
  });
});

describe("scenarios", () => {
  it("runs formation, removes, swaps, adds, and fill in order without touching the input state", () => {
    const state = unwrap(draftPlayer(fresh(), { playerId: "erling-haaland" }, "human")).state;
    const mf = filterPlayers(state, { position: "MF" })[0];
    const outcome = unwrap(
      runScenario(
        state,
        {
          label: "Midfield heavy",
          formation: "3-5-2",
          remove: ["FW1"],
          add: [{ playerId: mf.id }],
          fill: { strategy: "value", objective: "mean" },
        },
        "agent",
        { target: 1500 },
      ),
    );
    expect(outcome.formation).toBe("3-5-2");
    expect(outcome.complete).toBe(true);
    expect(outcome.steps[0]).toMatch(/Formation 4-3-3 → 3-5-2/);
    expect(outcome.steps[1]).toMatch(/Removed Erling Haaland/);
    expect(outcome.steps[2]).toMatch(new RegExp(`Drafted ${mf.name}`));
    expect(outcome.steps[3]).toMatch(/Auto-filled 10 slots/);
    expect(outcome.spent).toBeLessThanOrEqual(BUDGET_TOTAL);
    expect(outcome.projection.probabilityAtLeast).not.toBeNull();
    // Input untouched.
    expect(state.formation).toBe("4-3-3");
    expect(spent(state)).toBe(15);
  });

  it("fails as a whole and names the step when any step breaks a rule", () => {
    const result = runScenario(
      fresh(),
      { label: "Bad", add: [{ playerId: "erling-haaland" }, { playerId: "erling-haaland" }] },
      "agent",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("ALREADY_DRAFTED");
      expect(result.failedStep).toBe("add erling-haaland");
      expect(result.steps).toHaveLength(1);
    }
  });

  it("treats fill on a complete squad as a no-op step, not a failure", () => {
    const full = unwrap(autoFill(fresh(), { strategy: "value", objective: "mean" }, "agent")).state;
    const outcome = unwrap(runScenario(full, { label: "Noop", fill: { strategy: "value", objective: "mean" } }, "agent"));
    expect(outcome.steps).toEqual(["Auto-fill skipped: squad already complete"]);
  });
});
