#!/usr/bin/env node
/**
 * Probe: does the WebGPU canvas show grass (green) or a black void?
 *
 * Canvas 2D readback of a WebGPU canvas is black. Screenshot the canvas element and decode the PNG
 * (including filter bytes) so the green ratio is a real signal.
 *
 *   node tools/demo/pitch-probe.mjs
 *   node tools/demo/pitch-probe.mjs --swiftshader
 */
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import { chromium } from "playwright-core";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(APP, "out");
const SWIFT = process.argv.includes("--swiftshader");

function serve(root, port) {
  const MIME = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
    ".png": "image/png",
  };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    let file = path.join(root, decodeURIComponent(url.pathname));
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!fs.existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

function freePort() {
  return new Promise((resolve, reject) => {
    const sock = net.createServer();
    sock.unref();
    sock.on("error", reject);
    sock.listen(0, "127.0.0.1", () => {
      const addr = sock.address();
      const port = addr && addr.port;
      sock.close(() => {
        if (!port) reject(new Error("no port"));
        else resolve(port);
      });
    });
  });
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function recon(filter, row, prev, out, bpp) {
  for (let i = 0; i < row.length; i++) {
    const left = i >= bpp ? out[i - bpp] : 0;
    const up = prev[i];
    const upLeft = i >= bpp ? prev[i - bpp] : 0;
    let val = row[i];
    if (filter === 1) val += left;
    else if (filter === 2) val += up;
    else if (filter === 3) val += (left + up) >> 1;
    else if (filter === 4) val += paeth(left, up, upLeft);
    else if (filter !== 0) throw new Error(`unsupported png filter ${filter}`);
    out[i] = val & 255;
  }
}

/** 8-bit RGB/RGBA PNG → raw pixels. Playwright screenshots are this. */
function readPng(buf) {
  if (buf.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("not a png");
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idats = [];
  while (offset + 12 <= buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") idats.push(data);
    else if (type === "IEND") break;
    offset += 12 + len;
  }
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (bitDepth !== 8 || bpp === 0) throw new Error(`unsupported png ${bitDepth}/${colorType}`);
  const inflated = zlib.inflateSync(Buffer.concat(idats));
  const stride = width * bpp;
  const pixels = Buffer.alloc(height * stride);
  let src = 0;
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = inflated[src++];
    const row = inflated.subarray(src, src + stride);
    src += stride;
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    recon(filter, row, prev, out, bpp);
    prev = Buffer.from(out);
  }
  return { width, height, bpp, pixels };
}

function sampleGreen(png, crop = 0.3) {
  const { width, height, bpp, pixels } = png;
  const x0 = Math.floor(width * crop);
  const y0 = Math.floor(height * crop);
  const x1 = Math.floor(width * (1 - crop));
  const y1 = Math.floor(height * (1 - crop));
  let green = 0;
  let lit = 0;
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let samples = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * bpp;
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      rSum += r;
      gSum += g;
      bSum += b;
      samples++;
      if (g > r + 12 && g > b + 12 && g > 40) green++;
      if (r + g + b > 40) lit++;
    }
  }
  return {
    greenRatio: samples ? green / samples : 0,
    litRatio: samples ? lit / samples : 0,
    mean: samples ? [Math.round(rSum / samples), Math.round(gSum / samples), Math.round(bSum / samples)] : [0, 0, 0],
    samples,
    width,
    height,
  };
}

async function main() {
  if (!fs.existsSync(path.join(OUT, "index.html"))) throw new Error("no out/; npm run build first");
  const port = await freePort();
  const server = await serve(OUT, port);
  const browser = await chromium.launch({
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" }),
    headless: true,
    args: [
      "--enable-unsafe-webgpu",
      "--ignore-gpu-blocklist",
      "--enable-webmcp-testing",
      ...(SWIFT
        ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-gpu-rasterization"]
        : ["--enable-features=Vulkan,WebGPU", "--use-angle=metal"]),
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && errors.push(`${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`page: ${e}`));
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-pitch-ready="true"]', { timeout: 20000 });
  const backend = await page.locator("[data-drop-pitch]").getAttribute("data-pitch-backend");
  const canvas = page.locator("[data-drop-pitch] canvas").first();
  await canvas.waitFor({ state: "visible", timeout: 5000 });
  const suffix = SWIFT ? "-swift" : "-gpu";
  const pageShot = `/tmp/draftroom-pitch-probe${suffix}.png`;
  const canvasShot = `/tmp/draftroom-pitch-probe${suffix}-canvas.png`;
  await page.screenshot({ path: pageShot });
  await canvas.screenshot({ path: canvasShot });
  const png = readPng(fs.readFileSync(canvasShot));
  const field = sampleGreen(png);
  const result = {
    swiftshader: SWIFT,
    backend,
    field,
    errors: errors.slice(0, 20),
    pageShot,
    canvasShot,
  };
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
  server.close();
  process.exit(field.greenRatio > 0.15 ? 0 : 2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
