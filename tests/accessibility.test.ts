import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

function palette(name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`Missing six-digit colour token --${name}`);
  return match[1];
}

function luminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/../g)
    ?.map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  if (!channels || channels.length !== 3) throw new Error(`Invalid colour ${hex}`);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground: string, background: string): number {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

describe("accent contrast", () => {
  it.each(["human", "agent", "gold"])("keeps %s text above WCAG AA on both dark surfaces", (accent) => {
    expect(contrast(palette(accent), palette("night"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(palette(accent), palette("night-2"))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(["human", "agent"])("uses dark badge ink that passes WCAG AA on %s", (accent) => {
    expect(contrast(palette("night"), palette(accent))).toBeGreaterThanOrEqual(4.5);
  });
});
