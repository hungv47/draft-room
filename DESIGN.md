# Draft Room design system

Recorded from the shipped build, 2026-09-02 (second direction). Refine within this; do not split the
difference with either retired look (the original flat board, or the first foil-heavy 3D cut).

## Direction

WebMCP is the headline. The interface is a quiet shell around one saturated object, the floodlit
pitch. Everything that only an agent can do is marked cyan and listed in the agent console, which
is a first-class column, not a footer.

## Surfaces and colour

- `--night` `#07080c` page, `--night-2` `#0c0e15` panels, `--night-3` `#12151e` raised.
- Hairline borders: `--line` `rgba(255,255,255,.07)`, `--line-2` `.12`. No drop shadows on panels
  except `shadow-panel` (a 1px inner highlight plus a soft 24px ambient).
- Text: `--fog` `#eef0f7`, `--fog-2` `#a9b0c4`, `--fog-3` `#6f7690`.
- Actors: `--human` coral `#ff4d85`, `--agent` cyan `#3ce0ff`. Cyan also marks agent-only tools,
  read/writes chips, and the WebMCP status dot. Nothing else takes a hue.
- Pitch: `--pitch` `#1d8a4b`, `--pitch-glow` `#6cf0a4`. Position tints on slot markers and pool
  labels: GK amber, DF sky, MF violet, FW coral. Gold/silver tier dots are material, 8px, never text.
- shadcn tokens map onto the above (`--background` = night, `--card` = night-2, `--primary` = fog,
  `--ring` = agent).

## Type

- Sofia Sans for UI (11/12/13/15 px) and for tool names / JSON (`code` utility, tabular). `eyebrow`
  is 10.5px uppercase tracking 0.14em fog-3.
- Big Shoulders (`display`) for surnames and the room name only.
- Doto (`board`) for scoreboard numerals only. Tabular figures everywhere numbers align.
- Three families total. No system monospace.

## Layout

- Header 52px. Desktop grid `320 | 1fr | 340` (xl: `340 | 1fr | 380`), one viewport tall; rails
  scroll inside. Below `lg`: pitch (66dvh) then pool; the console opens as a right sheet.
- Rails share one rhythm: 24px icon buttons with 16px icons, 32px menu rows, a scroll fade at the
  list edges. Tool groups collapse from their label (chevron on hover). No icon-only collapsed rail.
- Score bug top-centre of the pitch; ticker bottom. A backend badge appears bottom-right only when
  the pitch is not WebGPU (`WebGL` or `Flat pitch`).
- Radius 12px on panels, 8px on rows, 6px on chips, full on actor tags.

## Motion

Authored set only: card land/leave, slot ring pulse and burst, scoreboard tween, ticker slide,
camera drift, `anim-rise-in` on the newest console row, drag ghost that follows the pointer.
Everything honours `prefers-reduced-motion` via `src/lib/motion.ts`. Pool rows and pitch cards drag
onto `data-drop-slot` chips or the grass (`data-drop-pitch`); engine errors surface in the ticker.

## Components

shadcn/ui primitives in `src/components/ui/` (button, badge, input, tabs, tooltip, sheet,
scroll-area, separator, toggle-group), restyled through tokens rather than per-instance overrides.
Domain components: `Header`, `PlayerPool`, `PitchPanel` (+ `pitch/*`), `Scoreboard`, `Ticker`,
`AgentConsole` (Tools / Calls / Brief / Activity), `PlayerInspector`, `ActivityFeed`, `PlayerCard`,
`Kit`, `ActorTag`, `WebMcpStatus`, `CopyButton`, `DragController`. Copy is labels and actions; empty
states are one line; agent-only tools still carry a copyable prompt and a cyan dot.
