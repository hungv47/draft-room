# Draft Room

A fantasy football squad builder built for agents. You and an AI agent share one XI, one £100.0m
budget, and one floodlit pitch. The agent works through fourteen
[WebMCP](https://webmachinelearning.github.io/webmcp/) tools that run the same state transitions
as your clicks, so the room can always say who did what, and the budget can never disagree with
itself.

Six of the fourteen tools have no button. Formation changes, what-if scenarios, atomic multi-step
plans, and a points-probability model exist only for agents. Two more carry the manager's brief
both ways: click a card on the pitch to name a captain, protect a player, or leave a note, and the
agent reads it with `get_brief` (and can write it with `set_assignment`). That is the point: the
page is a better fantasy tool with an agent in it than without one.

Built for the WebMCP challenge. No accounts, no backend, no live stats. The draft resets on reload.

## What the agent can do

| Tool | Reach | Annotation | What it does |
|---|---|---|---|
| `simulate_scenarios` | agent-only | read-only | Evaluate up to six hypothetical plans (formation, drafts, removals, swaps, a fill) side by side against the probability model. Nothing changes. |
| `apply_scenario` | agent-only | writes | Apply one plan atomically: every step succeeds or nothing changes, with the failing step named. |
| `project_points` | agent-only | read-only | Monte Carlo the current squad: mean, sd, p10/p90, P(≥ target), club stacks. |
| `player_outlook` | agent-only | read-only | Per-player floor/ceiling, start probability, and rotation risk. Accepts ids or names. |
| `find_upgrades` | agent-only | read-only | Rank single swaps that raise mean, floor, or ceiling within the money left. |
| `set_formation` | agent-only | writes | Re-shape the squad to any of seven formations; drafted players are re-seated, surplus is named or released with `force`. Protected players are never released. |
| `get_brief` | | read-only | The manager's standing instructions: captain and vice, duties (penalties, set pieces, protected), per-player notes, and the same brief as prose. |
| `set_assignment` | | writes | Give a drafted player the armband, replace their duties, or set a note. Only the fields passed change. |
| `list_available_players` | | read-only | Undrafted players by position, club, price band, name; sort by points, price, value, floor, or ceiling. |
| `get_roster_summary` | | read-only | Formation, slots, players, spend, remaining, projected points, and the squad outlook. |
| `draft_player` | | | Put a player in the first open slot of their position (or a named slot). |
| `remove_player` | | destructive | Free a slot by slot id or player id. Refuses protected players unless `force`. |
| `swap_player` | | destructive | Replace a slot's player in one step, budget-checked against the net change. Refuses to swap out a protected player unless `force`. |
| `auto_fill_roster` | | | Fill open slots under the remaining budget: `value` or `stars_and_scrubs`, optimising `mean`, `floor`, or `ceiling`. |

Every tool returns a plain JSON object with a one-sentence `message` an agent can relay verbatim.
Failures come back as `{ ok: false, code, error }` and land in the activity feed too, so a rejected
call is visible on screen rather than swallowed. The agent console (right rail; a sheet on phones)
lists every tool with a copyable example prompt, and logs each call with its input, result, and
duration.

Tools are registered from an inline script during HTML parse (`src/webmcp/boot.ts`), so a host can
discover them before React hydrates. Agent input is parsed once, at the boundary, with zod
(`src/webmcp/schemas.ts`): `""` and `null` mean "omitted", `"£6.0m"` is a price, `"fw1"` is a slot,
`"3-5-2"` is a formation. The engine only ever sees typed values.

## The model

`src/lib/model.ts` is a deterministic points-probability model. Each player has a start probability
(from price tier and position), a regular-season distribution, and a disrupted-season distribution
for the rotation/injury branch. `projectSquad` runs a seeded Monte Carlo (default 4,000 samples)
with a shared per-club shock, so stacking one club widens the variance instead of hiding it. The
captain's draw counts twice; when the captain's season is disrupted the vice's draw doubles instead.
Same squad, same numbers, every time: agents can compare scenarios without noise.

## The brief

`src/lib/assignments.ts`. Clicking a card on the pitch opens the inspector: armband (captain, vice),
duties (penalties, set pieces, protected), and a note of up to 280 characters. Everything lands in
`state.assignments`, which the agent reads through `get_brief` and can write through
`set_assignment`; the activity feed says which side changed what. "Protected" is the one duty with
teeth: an agent cannot remove, swap out, or release a protected player without `force`, and
`find_upgrades` skips protected slots. Assignments leave with the player; the console's Brief tab
shows the brief as the agent reads it, with a copy button for pasting into any agent.

## Squad

Eleven starters in one of seven formations: `4-3-3` (default), `4-4-2`, `3-5-2`, `3-4-3`, `5-3-2`,
`4-5-1`, `5-4-1`. Positions are `GK`, `DF`, `MF`, `FW`; slot ids are `GK1`, `DF1`…, `MF1`…, `FW1`….
Budget £100.0m in £0.5m steps. A "dream XI" costs about £120m, so the budget binds. Click a pool
row or drag it onto the pitch (grass fills the first open slot of that position; a named chip
picks that slot). Wrong position, overspend, and already-drafted drops fail in the ticker the
same way a tool would.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run check      # typecheck + lint + tests + static build (out/)
npm run demo       # headed recording: build, serve, drive WebMCP beats in Chrome
npm run e2e        # same beats headless, with screenshots
```

The build is a fully static export. Serve `out/` from any static host; set `BASE_PATH=/repo-name`
at build time if it lives under a sub-path.

## Try it with an agent

1. Chrome: enable `chrome://flags/#enable-webmcp-testing`, relaunch, open the page. The console
   header reads "14 tools live".
2. Call tools from the Model Context Tool Inspector extension, or from DevTools:

```js
const tools = await document.modelContext.getTools();
const t = (n) => tools.find((x) => x.name === n);
JSON.parse(await document.modelContext.executeTool(t("simulate_scenarios"), JSON.stringify({
  target: 1700,
  scenarios: [
    { label: "4-3-3 value", fill: { strategy: "value" } },
    { label: "3-5-2 ceiling", formation: "3-5-2", fill: { strategy: "stars_and_scrubs", objective: "ceiling" } },
  ],
})));
```

Chrome 152's testing build wants the arguments as a JSON string; the draft spec says an object, and
an agent host serialises for you either way.

3. In an agent browser, try: "Compare a 4-3-3 built around Haaland with a 3-5-2 built around Saka.
   Which is more likely to clear 1,800 points?", "Switch us to a 3-5-2 and tell me who no longer
   fits", "Find the one swap that raises our floor the most without going over budget", "Read my
   brief, respect every protected player, and pick the captain that maximises our expected points".

## Stack

Next.js 15 (App Router, static export), TypeScript, Tailwind CSS v4, shadcn/ui (Radix primitives:
tabs, tooltip, sheet, scroll area, toggle group, switch, textarea), Zustand, zod, lucide-react, `webmcp-types`,
Vitest. Three.js r185 (`three/webgpu`, TSL bloom) through `@react-three/fiber` and
`@react-three/drei` for the pitch; cards on the pitch are React components projected with drei's
`Html`. Fonts: Big Shoulders for surnames, Sofia Sans for UI, Doto for the scoreboard. Club kits are
procedural SVG in club colours (`src/lib/kits.ts`, `Kit.tsx`); no crests, badges, or photos. The
design system is recorded in [DESIGN.md](./DESIGN.md).

Rendering ladder: `PitchScene` tries `WebGPURenderer` (which itself falls back to WebGL2), and if
that throws or no GL context exists it renders `PitchFallback`, a CSS pitch with the same formation
and cards. The CSS pitch also covers the canvas until GPU pipelines compile, so the field is never
a black void. All motion honours `prefers-reduced-motion`.

Linting is ESLint (Next's config) plus Oxlint running the vendored
[anti-slop](https://github.com/dmmulroy/anti-slop) rules in `tools/oxlint/anti-slop/` at error
level. `npm run lint` runs both; vendored `src/components/ui/` is excluded.

## Licence

MIT. See [LICENSE](./LICENSE). Player names are real footballers; prices, projections, and
probabilities are illustrative, not live data.
