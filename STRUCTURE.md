# Structure

One static Next.js app, a shared squad engine, a WebMCP bridge, and public project records.

## At a glance

```text
src/app/             Page entry, layout, manifest, and global styles
src/components/      Draft room UI, pitch rendering, and UI primitives
src/lib/             Squad rules, shared state, scenarios, and probability model
src/webmcp/          Tool definitions, input schemas, registration, and execution
src/data/            Illustrative player data
tests/               Engine, model, tool, and accessibility checks
tools/demo/          Browser demo and headless E2E driver
tools/oxlint/        Vendored anti-slop lint rules
```

List tracked paths with `git ls-tree -r --name-only HEAD`.

## Code

| Path | Responsibility |
| --- | --- |
| `src/app/page.tsx`, `src/components/DraftRoom.tsx` | Page and room composition |
| `src/lib/engine.ts`, `src/lib/store.ts` | Squad transitions and shared state |
| `src/lib/model.ts`, `src/lib/scenarios.ts` | Points projections and hypothetical plans |
| `src/lib/assignments.ts` | Captain, duties, protection, and manager notes |
| `src/webmcp/boot.ts`, `src/webmcp/WebMcpBridge.tsx` | Early tool discovery and React integration |
| `src/webmcp/definitions.ts`, `src/webmcp/schemas.ts`, `src/webmcp/execute.ts` | Tool metadata, boundary parsing, and execution |
| `src/components/pitch/` | GPU pitch and CSS fallback |
| `src/components/ui/`, `components.json` | shadcn UI primitives and configuration |
| `src/data/players.json` | Player data |
| `tools/demo/drive.mjs`, `tools/demo/pitch-probe.mjs` | Demo automation and pitch probes |
| `.github/workflows/pages.yml` | Check, static build, and Pages deployment |

Commands from `package.json`: install with `bun install`; run `npm run dev`,
`npm run check`, `npm run demo`, or `npm run e2e`. The check script runs
typecheck, lint, tests, and the static build. These commands were inspected,
not executed for this records-only change.

Build and configuration: `next.config.ts` controls static export.
`package-lock.json` is the tracked dependency lock. `tsconfig.json`,
`eslint.config.mjs`, `.oxlintrc.json`, `postcss.config.mjs`, and
`vitest.config.mts` configure types, lint, styles, and tests.
`.openai/hosting.json` records a static hosting target.
The build creates the out directory, which `.gitignore` excludes.

## Read before changing

- [README.md](README.md) before changes to squad behavior, WebMCP tools, or setup.
- [DESIGN.md](DESIGN.md) before visual or motion changes. It records the
  second design direction and the reduced-motion requirement.
- [BRAIN.md](BRAIN.md) before work that depends on a source synchronization route or private material.

Where new work goes:

| To add | Put it in |
| --- | --- |
| A squad rule or model change | `src/lib/`, with the relevant checks in `tests/` |
| A WebMCP capability | `src/webmcp/`, with shared behavior in `src/lib/` |
| A room control or pitch element | `src/components/` or `src/components/pitch/` |
| A player data update | `src/data/players.json` |
| A browser demonstration | `tools/demo/` |

The README describes human and agent actions as sharing the same state
transitions. Tool inputs are parsed at the boundary before the engine sees them.

## Knowledge

Public behavior lives in [README.md](README.md), source, and tests.
[DESIGN.md](DESIGN.md) owns design detail. New knowledge follows the save
rules in [BRAIN.md](BRAIN.md). No external knowledge location is verified.

## Other documents

- [VISION.md](VISION.md): unconfirmed direction. [PROGRESS.md](PROGRESS.md): state and dated delivery evidence.
- [AGENTS.md](AGENTS.md): agent entrypoint. [CLAUDE.md](CLAUDE.md): imports AGENTS.md.
- [LICENSE](LICENSE): MIT terms. No changelog exists at the migration baseline.
