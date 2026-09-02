import { CanvasTexture, LinearFilter, SRGBColorSpace } from "three";
import { PITCH } from "@/lib/pitch-layout";

function fromCanvas(canvas: HTMLCanvasElement): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  // 1024×1408 is not POT; mipmaps of that fail to sample on some WebGPU backends and the grass goes black.
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

const W = 1024;
const H = Math.round((W * PITCH.depth) / PITCH.width);

/** Real pitch is 68m × 105m; the scene compresses depth for framing, so scale each axis separately. */
const PX_PER_M_X = W / 68;
const PX_PER_M_Z = H / 105;
const INSET = 0;

function mx(m: number): number {
  return INSET + m * PX_PER_M_X;
}
function mz(m: number): number {
  return INSET + m * PX_PER_M_Z;
}

/** Draws pitch markings onto `ctx` in the given colour. Shared by the colour and emissive maps. */
function drawMarkings(ctx: CanvasRenderingContext2D, colour: string, lineWidth: number) {
  ctx.strokeStyle = colour;
  ctx.fillStyle = colour;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "butt";

  const margin = 3; // metres of grass outside the touchline
  const left = mx(margin);
  const right = mx(68 - margin);
  const top = mz(margin);
  const bottom = mz(105 - margin);
  const centreX = mx(68 / 2);
  const centreZ = mz(105 / 2);

  ctx.strokeRect(left, top, right - left, bottom - top);
  ctx.beginPath();
  ctx.moveTo(left, centreZ);
  ctx.lineTo(right, centreZ);
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(centreX, centreZ, 9.15 * PX_PER_M_X, 9.15 * PX_PER_M_Z, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(centreX, centreZ, lineWidth * 0.9, 0, Math.PI * 2);
  ctx.fill();

  const drawEnd = (goalLineZ: number, direction: 1 | -1) => {
    const boxW = 40.32;
    const boxD = 16.5;
    const sixW = 18.32;
    const sixD = 5.5;
    const spot = 11;
    const bx = centreX - (boxW / 2) * PX_PER_M_X;
    const bz = direction === 1 ? goalLineZ : goalLineZ - boxD * PX_PER_M_Z;
    ctx.strokeRect(bx, bz, boxW * PX_PER_M_X, boxD * PX_PER_M_Z);
    const sx = centreX - (sixW / 2) * PX_PER_M_X;
    const sz = direction === 1 ? goalLineZ : goalLineZ - sixD * PX_PER_M_Z;
    ctx.strokeRect(sx, sz, sixW * PX_PER_M_X, sixD * PX_PER_M_Z);
    const spotZ = goalLineZ + direction * spot * PX_PER_M_Z;
    ctx.beginPath();
    ctx.arc(centreX, spotZ, lineWidth * 0.9, 0, Math.PI * 2);
    ctx.fill();
    // The D: arc of radius 9.15m around the spot, clipped to outside the box.
    const edgeZ = goalLineZ + direction * boxD * PX_PER_M_Z;
    const dz = (edgeZ - spotZ) / (9.15 * PX_PER_M_Z);
    const halfAngle = Math.acos(Math.max(-1, Math.min(1, Math.abs(dz))));
    const centreAngle = direction === 1 ? Math.PI / 2 : -Math.PI / 2;
    ctx.beginPath();
    ctx.ellipse(centreX, spotZ, 9.15 * PX_PER_M_X, 9.15 * PX_PER_M_Z, 0, centreAngle - halfAngle, centreAngle + halfAngle);
    ctx.stroke();
    // Goal mouth.
    const goalW = 7.32;
    const goalD = 2.2;
    const gx = centreX - (goalW / 2) * PX_PER_M_X;
    const gz = direction === 1 ? goalLineZ - goalD * PX_PER_M_Z : goalLineZ;
    ctx.strokeRect(gx, gz, goalW * PX_PER_M_X, goalD * PX_PER_M_Z);
  };
  drawEnd(top, 1);
  drawEnd(bottom, -1);

  // Corner arcs.
  const r = 1 * PX_PER_M_X;
  const corners: Array<[number, number, number]> = [
    [left, top, 0],
    [right, top, Math.PI / 2],
    [right, bottom, Math.PI],
    [left, bottom, (Math.PI * 3) / 2],
  ];
  for (const [cx, cy, start] of corners) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, start, start + Math.PI / 2);
    ctx.stroke();
  }
}

/** Grass colour map: mow stripes, grain, and painted lines. */
export function createGrassTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");

  ctx.fillStyle = "#137a3d";
  ctx.fillRect(0, 0, W, H);

  const stripes = 14;
  const stripeH = H / stripes;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#168a46" : "#116f38";
    ctx.fillRect(0, i * stripeH, W, stripeH + 1);
  }

  // Grain: a scatter of tiny darker and lighter blades.
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 26000; i++) {
    const x = rand() * W;
    const y = rand() * H;
    const light = rand() > 0.5;
    ctx.fillStyle = light ? "rgba(140, 230, 170, 0.07)" : "rgba(0, 30, 10, 0.10)";
    ctx.fillRect(x, y, 1.5, 3 + rand() * 4);
  }

  // Vignette toward the touchlines so the pitch sits in the floodlight pool.
  const vignette = ctx.createRadialGradient(W / 2, H / 2, W * 0.25, W / 2, H / 2, W * 0.95);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.42)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);

  drawMarkings(ctx, "rgba(240, 255, 245, 0.92)", 5);

  return fromCanvas(canvas);
}

/** Emissive map: the painted lines only, so bloom can pick them up. */
export function createLinesTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  drawMarkings(ctx, "#ffffff", 5);
  return fromCanvas(canvas);
}

/** Vertical falloff for the floodlight beams: bright at the lamp, gone before the grass. */
export function createBeamTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  // Canvas top maps to the cone apex (uv.y = 1), so the lamp end is opaque and the grass end is clear.
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.55, "rgba(255,255,255,0.3)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 4, 256);
  return fromCanvas(canvas);
}

/** Soft radial disc used for slot glows and floodlight pools. */
export function createGlowTexture(): CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.35, "rgba(255,255,255,0.55)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return fromCanvas(canvas);
}
