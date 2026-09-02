#!/usr/bin/env node
/**
 * Draft Room demo driver.
 *
 * Builds the static export, serves it, opens Chrome with WebMCP enabled, and drives the agent side of
 * the demo through document.modelContext exactly as an agent host would.
 *
 *   npm run demo              headed, paced for screen recording; prints a narration cue per beat
 *   npm run demo -- --step    headed, waits for Enter before each beat
 *   npm run e2e               headless check: same beats plus a mobile pass, screenshots, JSON summary
 *
 * Flags: --no-build, --shots <dir>, --port <n>, --slow <ms>. CHROME_PATH overrides the browser binary.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(APP, "out");

const args = new Set(process.argv.slice(2));
const flag = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
};
const CHECK = args.has("--check");
const STEP = args.has("--step");
const BUILD = !args.has("--no-build");
const PORT = Number(flag("--port", "4173"));
const SHOTS = flag("--shots", "/tmp/draftroom-shots");
const SLOW = Number(flag("--slow", "2600"));

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".txt": "text/plain",
};

function serve(root, port) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    let file = path.join(root, decodeURIComponent(url.pathname));
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!fs.existsSync(file)) file = path.join(root, "404.html");
    if (!fs.existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

function build() {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", ["run", "build"], { cwd: APP, stdio: "inherit" });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`build exited ${code}`))));
  });
}

const rl = STEP ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null;
const waitForEnter = (prompt) => new Promise((resolve) => rl.question(prompt, () => resolve()));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sleepIfRecording = (ms) => (CHECK ? Promise.resolve() : sleep(ms));

/** Chrome native WebMCP: executeTool(RegisteredTool, jsonString). Object input throws on this build. */
const RUNNER = `
  window.__run = async (name, input) => {
    const mc = document.modelContext;
    const tool = (await mc.getTools()).find((t) => t.name === name);
    if (!tool) throw new Error("not registered: " + name);
    let raw;
    try { raw = await mc.executeTool(tool, JSON.stringify(input)); }
    catch { raw = await mc.executeTool(tool, input); }
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  };
`;

const run = (page, name, input) => page.evaluate(([n, i]) => window.__run(n, i), [name, input]);

async function waitForRoom(page, ms) {
  await page.waitForFunction(() => Boolean(document.modelContext), { timeout: 20000 });
  await page.waitForFunction(async () => {
    try {
      return (await document.modelContext.getTools()).length >= 14;
    } catch {
      return false;
    }
  }, { timeout: 20000 });
  await page.waitForSelector('[data-pitch-ready="true"]', { timeout: 20000 });
  await page.waitForTimeout(ms);
  await page.evaluate(RUNNER);
}

async function dragOntoPitch(page, playerId) {
  const row = page.locator(`[data-player-id="${playerId}"]`);
  const pitch = page.locator("[data-drop-pitch]");
  await row.scrollIntoViewIfNeeded();
  const from = await row.boundingBox();
  const to = await pitch.boundingBox();
  if (!from || !to) throw new Error(`drag: no boxes for ${playerId}`);
  await page.mouse.move(from.x + 36, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width * 0.52, to.y + to.height * 0.58, { steps: 18 });
  await page.mouse.up();
}

/** Beats follow ops/DEMO.md. `say` is the narration cue printed in recording mode. */
const BEATS = [
  {
    id: "01-room",
    say: "The room: empty pitch, £100.0m, fourteen tools in the console.",
    async run({ page, results }) {
      results.boot = await page.evaluate(async () => ({
        tools: (await document.modelContext.getTools()).map((t) => t.name),
        status: document.querySelector("[role=status]")?.textContent,
      }));
    },
  },
  {
    id: "02-human-pick",
    say: "Human move: drag Haaland onto the pitch. Coral card lands on FW 1.",
    async run({ page }) {
      await dragOntoPitch(page, "erling-haaland");
      await page.getByRole("button", { name: /Erling Haaland.*Open to assign duties/ }).first().waitFor({ timeout: 12000 });
    },
  },
  {
    id: "03-agent-plan",
    say: "Agent move: simulate_scenarios compares plans without touching the squad, then apply_scenario re-shapes the pitch.",
    async run({ page, results }) {
      const sim = await run(page, "simulate_scenarios", {
        target: 1800,
        scenarios: [
          { label: "4-3-3 around Haaland", fill: { strategy: "value" } },
          { label: "3-5-2 around Saka", formation: "3-5-2", fill: { strategy: "stars_and_scrubs", objective: "ceiling" } },
        ],
      });
      await sleepIfRecording(1800);
      const viable = (sim.scenarios ?? []).filter((s) => s.ok);
      const best = [...viable].sort((a, b) => b.projection.probabilityAtLeast - a.projection.probabilityAtLeast)[0];
      if (!best) throw new Error(`no viable scenario: ${sim.message ?? JSON.stringify(sim)}`);
      const applied = await run(page, "apply_scenario", {
        scenario: { label: best.label, formation: best.formation, fill: { strategy: "value", objective: "mean" } },
      });
      results.plan = { sim: sim.message, chosen: best.label, applied: applied.message };
      await page.waitForTimeout(CHECK ? 1200 : 2200);
    },
  },
  {
    id: "04-probability",
    say: "Probability, not just points: project_points and find_upgrades.",
    async run({ page, results }) {
      const projected = await run(page, "project_points", { target: 1900 });
      const upgrades = await run(page, "find_upgrades", { objective: "floor", limit: 3 });
      results.model = { projected: projected.message, upgrades: upgrades.message };
      await page.getByRole("tab", { name: /Calls/ }).click();
      await page.waitForTimeout(600);
    },
  },
  {
    id: "05-brief",
    say: "Constraint: click Haaland's card, captain him, protect him. Gold C lands, scoreboard jumps.",
    async run({ page }) {
      await page.getByRole("button", { name: /Erling Haaland.*Open to assign duties/ }).first().click({ force: true });
      const inspector = page.getByRole("complementary", { name: /assignments/ });
      await inspector.waitFor({ timeout: 8000 });
      await inspector.locator("[data-slot=toggle-group-item]").filter({ hasText: "Captain" }).click();
      await inspector.getByRole("switch", { name: /^Protected/ }).click();
      const note = inspector.getByRole("textbox", { name: /^Note/ });
      await note.fill("Keep him whatever happens.");
      await note.blur();
      await page.waitForTimeout(700);
    },
  },
  {
    id: "06-agent-blocked",
    say: "Agent tries to sell him: remove_player fails with PROTECTED. Nothing hidden.",
    async run({ page, results }) {
      const brief = await run(page, "get_brief", {});
      const blocked = await run(page, "remove_player", { playerId: brief.protectedPlayerIds[0] });
      const vice = await run(page, "set_assignment", { playerId: "MF1", armband: "vice", duties: ["set_pieces"] });
      const summary = await run(page, "get_roster_summary", {});
      results.brief = {
        text: brief.text,
        blocked: blocked.code,
        blockedMessage: blocked.error,
        vice: vice.message,
        captain: summary.brief?.captain?.name,
        projected: summary.projectedPoints,
      };
      await page.waitForTimeout(800);
    },
  },
  {
    id: "07-close",
    say: "Close: Escape the inspector, open Brief. Coral is you, cyan is the agent.",
    async run({ page, results }) {
      await page.keyboard.press("Escape");
      await page.getByRole("tab", { name: /Brief/ }).click();
      await page.waitForTimeout(600);
      results.scoreboard = await page.evaluate(() => document.querySelector("output")?.textContent);
    },
  },
];

async function main() {
  if (BUILD) await build();
  if (!fs.existsSync(path.join(OUT, "index.html"))) throw new Error(`no export at ${OUT}; run without --no-build`);
  if (CHECK) {
    fs.rmSync(SHOTS, { recursive: true, force: true });
    fs.mkdirSync(SHOTS, { recursive: true });
  }

  const server = await serve(OUT, PORT);
  const browser = await chromium.launch({
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" }),
    headless: CHECK,
    args: [
      "--enable-webmcp-testing",
      "--enable-features=WebMCP,WebMCPTesting",
      "--enable-unsafe-webgpu",
      "--ignore-gpu-blocklist",
      ...(CHECK
        ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-gpu-rasterization"]
        : ["--window-size=1440,960", "--hide-crash-restore-bubble"]),
    ],
  });

  const results = {};
  const consoleErrors = [];
  let failed = false;
  const stop = async () => {
    await browser.close().catch(() => {});
    server.close();
    rl?.close();
  };

  try {
    // The check asserts state and layout, not Retina raster density. Native-resolution captures keep
    // software WebGPU screenshots inside Playwright's timeout on constrained runners.
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
    page.on("pageerror", (e) => consoleErrors.push(String(e)));
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "networkidle" });
    await waitForRoom(page, CHECK ? 6500 : 5000);

    for (const beat of BEATS) {
      if (STEP) await waitForEnter(`\n▶ ${beat.id} — ${beat.say}\n  Enter to run…`);
      else console.log(`\n▶ ${beat.id} — ${beat.say}`);
      await beat.run({ page, results });
      if (CHECK) await page.screenshot({ path: path.join(SHOTS, `${beat.id}.png`) });
      else await sleep(SLOW);
    }

    if (CHECK) {
      await page.close();
      const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true });
      await mobile.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "networkidle" });
      await waitForRoom(mobile, 9000);
      await mobile.screenshot({ path: path.join(SHOTS, "m1-empty.png") });
      await run(mobile, "apply_scenario", { scenario: { label: "3-4-3", formation: "3-4-3", fill: { strategy: "stars_and_scrubs" } } });
      await mobile.waitForTimeout(2500);
      await mobile.screenshot({ path: path.join(SHOTS, "m2-complete.png") });
      await mobile.getByRole("button", { name: /Open to assign duties/ }).first().click({ force: true });
      await mobile.getByRole("complementary", { name: /assignments/ }).waitFor({ timeout: 8000 });
      await mobile.waitForTimeout(600);
      await mobile.screenshot({ path: path.join(SHOTS, "m3-inspector.png") });
      await mobile.keyboard.press("Escape");
      await mobile.getByRole("button", { name: /Agent/ }).click();
      await mobile.waitForTimeout(900);
      await mobile.screenshot({ path: path.join(SHOTS, "m4-agent-sheet.png") });

      results.consoleErrors = consoleErrors;
      const checks = {
        fourteenTools: results.boot?.tools?.length === 14,
        planApplied: /Applied/.test(results.plan?.applied ?? ""),
        protectedBlocked: results.brief?.blocked === "PROTECTED",
        captainNamed: Boolean(results.brief?.captain),
        noConsoleErrors: consoleErrors.length === 0,
      };
      results.checks = checks;
      failed = Object.values(checks).some((ok) => !ok);
      console.log(JSON.stringify(results, null, 2));
      console.log(`\nscreenshots: ${SHOTS}`);
    } else {
      console.log("\nRecording beats finished. Browser stays open; Ctrl+C to quit.");
      await new Promise((resolve) => {
        process.once("SIGINT", resolve);
        process.once("SIGTERM", resolve);
      });
    }
  } finally {
    await stop();
  }
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
