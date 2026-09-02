export type CardTier = "gold" | "silver" | "standard";

/** Foil tier by price. Gold is the £11m+ marquee band, silver the £8m+ premium band. */
export function tierFor(price: number): CardTier {
  if (price >= 11) return "gold";
  if (price >= 8) return "silver";
  return "standard";
}

export const TIER_CLASS: Readonly<Record<CardTier, string>> = {
  gold: "tier-gold",
  silver: "tier-silver",
  standard: "",
};

export const TIER_LABEL: Readonly<Record<CardTier, string>> = {
  gold: "Marquee",
  silver: "Premium",
  standard: "",
};
