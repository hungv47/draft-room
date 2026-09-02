/** Prices are multiples of 0.5 so float sums are exact, but always round for display. */
export function roundPrice(value: number): number {
  return Math.round(value * 10) / 10;
}

export function formatPrice(value: number): string {
  const safe = Number.isFinite(value) ? roundPrice(value) : 0;
  return `£${safe.toFixed(1)}m`;
}

export function formatPoints(value: number): string {
  const safe = Number.isFinite(value) ? Math.round(value) : 0;
  return safe.toLocaleString("en-GB");
}

export function formatValue(points: number, price: number): string {
  if (!Number.isFinite(points) || !Number.isFinite(price) || price <= 0) return "—";
  return (points / price).toFixed(1);
}

export function slotLabel(slotId: string): string {
  const match = /^([A-Z]+)(\d+)$/.exec(slotId);
  return match ? `${match[1]} ${match[2]}` : slotId;
}
