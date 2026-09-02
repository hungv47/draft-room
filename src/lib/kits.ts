import type { Position } from "./types";

export type KitPattern =
  | "plain"
  | "stripes"
  | "hoops"
  | "halves"
  | "sleeves"
  | "sash"
  | "pinstripes";

export interface Kit {
  /** Body base colour (hex). */
  primary: string;
  /** Pattern colour for stripes/hoops/halves/sleeves/sash; for plain, a subtle tone-on-tone shade. */
  secondary: string;
  pattern: KitPattern;
  /** Collar and cuff colour. */
  trim: string;
  /** Number/text colour that stays legible over the body. */
  ink: string;
}

export interface ClubKits {
  outfield: Kit;
  goalkeeper: Kit;
  /** One saturated colour used by the UI for gradients/glows tied to this club. Must read on a near-black ground (#07090f); never pure white or pure black. Clubs whose home shirt is white/black should use their trim colour here (e.g. Fulham -> black is not allowed, use a red or the deep grey #3a3f4b; Tottenham -> navy #132257; Newcastle -> #41b6e6 sky accent is acceptable, or a light grey #cfd3dc). */
  accent: string;
}

const INK_LIGHT = "#ffffff";
const INK_DARK = "#101318";
const INK_BLACK = "#000000";

const FALLBACK_KIT: Kit = {
  primary: "#2a2f3c",
  secondary: "#3d4454",
  pattern: "plain",
  trim: "#9aa3b8",
  ink: INK_LIGHT,
};

const FALLBACK_CLUB: ClubKits = {
  outfield: FALLBACK_KIT,
  goalkeeper: FALLBACK_KIT,
  accent: "#8b93a7",
};

export const CLUB_KITS = {
  ARS: {
    outfield: {
      primary: "#EF0107",
      secondary: "#ffffff",
      pattern: "sleeves",
      trim: "#ffffff",
      ink: INK_BLACK,
    },
    goalkeeper: {
      primary: "#D8FF3D",
      secondary: "#6B8610",
      pattern: "plain",
      trim: INK_DARK,
      ink: INK_DARK,
    },
    accent: "#EF0107",
  },
  AVL: {
    outfield: {
      primary: "#670E36",
      secondary: "#95BFE5",
      pattern: "sleeves",
      trim: "#95BFE5",
      ink: INK_LIGHT,
    },
    goalkeeper: {
      primary: "#FF7A1A",
      secondary: "#9A3A00",
      pattern: "pinstripes",
      trim: INK_DARK,
      ink: INK_DARK,
    },
    accent: "#95BFE5",
  },
  BHA: {
    outfield: {
      primary: "#0057B8",
      secondary: "#ffffff",
      pattern: "stripes",
      trim: "#ffffff",
      ink: INK_LIGHT,
    },
    goalkeeper: {
      primary: "#FF7A1A",
      secondary: "#9A3A00",
      pattern: "plain",
      trim: INK_DARK,
      ink: INK_DARK,
    },
    accent: "#0057B8",
  },
  BOU: {
    outfield: {
      primary: "#DA291C",
      secondary: "#000000",
      pattern: "stripes",
      trim: "#000000",
      ink: INK_LIGHT,
    },
    goalkeeper: {
      primary: "#7B5CFF",
      secondary: "#E8E0FF",
      pattern: "pinstripes",
      trim: INK_BLACK,
      ink: INK_BLACK,
    },
    accent: "#DA291C",
  },
  BRE: {
    outfield: {
      primary: "#E30613",
      secondary: "#ffffff",
      pattern: "stripes",
      trim: "#ffffff",
      ink: INK_LIGHT,
    },
    goalkeeper: {
      primary: "#7CFF5E",
      secondary: "#2A8018",
      pattern: "plain",
      trim: INK_DARK,
      ink: INK_DARK,
    },
    accent: "#E30613",
  },
  CHE: {
    outfield: {
      primary: "#034694",
      secondary: "#1a5dad",
      pattern: "plain",
      trim: "#ffffff",
      ink: INK_LIGHT,
    },
    goalkeeper: {
      primary: "#FF4FA3",
      secondary: "#9A1860",
      pattern: "pinstripes",
      trim: INK_DARK,
      ink: INK_DARK,
    },
    accent: "#034694",
  },
  COV: {
    outfield: {
      primary: "#78D0F0",
      secondary: "#4db8e0",
      pattern: "plain",
      trim: "#12355c",
      ink: INK_DARK,
    },
    goalkeeper: {
      primary: "#7B5CFF",
      secondary: "#E8E0FF",
      pattern: "plain",
      trim: INK_BLACK,
      ink: INK_BLACK,
    },
    accent: "#78D0F0",
  },
  CRY: {
    outfield: {
      primary: "#C4122E",
      secondary: "#1B458F",
      pattern: "stripes",
      trim: "#1B458F",
      ink: INK_LIGHT,
    },
    goalkeeper: {
      primary: "#D8FF3D",
      secondary: "#6B8610",
      pattern: "pinstripes",
      trim: INK_DARK,
      ink: INK_DARK,
    },
    accent: "#C4122E",
  },
  EVE: {
    outfield: {
      primary: "#003399",
      secondary: "#1a47b0",
      pattern: "plain",
      trim: "#ffffff",
      ink: INK_LIGHT,
    },
    goalkeeper: {
      primary: "#FF7A1A",
      secondary: "#9A3A00",
      pattern: "plain",
      trim: INK_DARK,
      ink: INK_DARK,
    },
    accent: "#003399",
  },
  FUL: {
    outfield: {
      primary: "#F5F5F5",
      secondary: "#d4d4d4",
      pattern: "plain",
      trim: "#000000",
      ink: INK_BLACK,
    },
    goalkeeper: {
      primary: "#00C2B2",
      secondary: "#00665E",
      pattern: "pinstripes",
      trim: INK_DARK,
      ink: INK_DARK,
    },
    accent: "#3a3f4b",
  },
  HUL: {
    outfield: {
      primary: "#F5A12D",
      secondary: "#000000",
      pattern: "stripes",
      trim: "#000000",
      ink: INK_DARK,
    },
    goalkeeper: {
      primary: "#7B5CFF",
      secondary: "#E8E0FF",
      pattern: "plain",
      trim: INK_BLACK,
      ink: INK_BLACK,
    },
    accent: "#F5A12D",
  },
  IPS: {
    outfield: {
      primary: "#3A64A3",
      secondary: "#ffffff",
      pattern: "sleeves",
      trim: "#ffffff",
      ink: INK_LIGHT,
    },
    goalkeeper: {
      primary: "#FF4FA3",
      secondary: "#9A1860",
      pattern: "pinstripes",
      trim: INK_DARK,
      ink: INK_DARK,
    },
    accent: "#3A64A3",
  },
  LEE: {
    outfield: {
      primary: "#F7F7F7",
      secondary: "#dde3ee",
      pattern: "plain",
      trim: "#1D428A",
      ink: INK_DARK,
    },
    goalkeeper: {
      primary: "#FF4FA3",
      secondary: "#9A1860",
      pattern: "plain",
      trim: INK_DARK,
      ink: INK_DARK,
    },
    accent: "#FFCD00",
  },
  LIV: {
    outfield: {
      primary: "#C8102E",
      secondary: "#a00d24",
      pattern: "plain",
      trim: "#ffffff",
      ink: INK_LIGHT,
    },
    goalkeeper: {
      primary: "#00C2B2",
      secondary: "#00665E",
      pattern: "pinstripes",
      trim: INK_DARK,
      ink: INK_DARK,
    },
    accent: "#C8102E",
  },
  MCI: {
    outfield: {
      primary: "#6CABDD",
      secondary: "#4f98d0",
      pattern: "plain",
      trim: "#ffffff",
      ink: INK_DARK,
    },
    goalkeeper: {
      primary: "#7CFF5E",
      secondary: "#2A8018",
      pattern: "plain",
      trim: INK_DARK,
      ink: INK_DARK,
    },
    accent: "#6CABDD",
  },
  MUN: {
    outfield: {
      primary: "#DA020E",
      secondary: "#b0010b",
      pattern: "plain",
      trim: "#000000",
      ink: INK_LIGHT,
    },
    goalkeeper: {
      primary: "#5B7DB1",
      secondary: "#D5DEEC",
      pattern: "pinstripes",
      trim: INK_BLACK,
      ink: INK_BLACK,
    },
    accent: "#DA020E",
  },
  NEW: {
    outfield: {
      primary: "#241F20",
      secondary: "#ffffff",
      pattern: "stripes",
      trim: "#ffffff",
      ink: INK_LIGHT,
    },
    goalkeeper: {
      primary: "#D8FF3D",
      secondary: "#6B8610",
      pattern: "plain",
      trim: INK_DARK,
      ink: INK_DARK,
    },
    accent: "#41B6E6",
  },
  NFO: {
    outfield: {
      primary: "#DD0000",
      secondary: "#b80000",
      pattern: "plain",
      trim: "#ffffff",
      ink: INK_LIGHT,
    },
    goalkeeper: {
      primary: "#5B7DB1",
      secondary: "#D5DEEC",
      pattern: "pinstripes",
      trim: INK_BLACK,
      ink: INK_BLACK,
    },
    accent: "#DD0000",
  },
  SUN: {
    outfield: {
      primary: "#EB172B",
      secondary: "#ffffff",
      pattern: "stripes",
      trim: "#ffffff",
      ink: INK_BLACK,
    },
    goalkeeper: {
      primary: "#00C2B2",
      secondary: "#00665E",
      pattern: "plain",
      trim: INK_DARK,
      ink: INK_DARK,
    },
    accent: "#EB172B",
  },
  TOT: {
    outfield: {
      primary: "#FFFFFF",
      secondary: "#e4e7ee",
      pattern: "plain",
      trim: "#132257",
      ink: "#132257",
    },
    goalkeeper: {
      primary: "#7CFF5E",
      secondary: "#2A8018",
      pattern: "pinstripes",
      trim: INK_DARK,
      ink: INK_DARK,
    },
    accent: "#132257",
  },
} satisfies Record<string, ClubKits>;

function isKnownClub(team: string): team is keyof typeof CLUB_KITS {
  return Object.hasOwn(CLUB_KITS, team);
}

export function kitFor(team: string, position: Position): Kit {
  const club = isKnownClub(team) ? CLUB_KITS[team] : FALLBACK_CLUB;
  if (position === "GK") {
    return club.goalkeeper;
  }
  return club.outfield;
}

export function clubAccent(team: string): string {
  if (isKnownClub(team)) {
    return CLUB_KITS[team].accent;
  }
  return "#8b93a7";
}
