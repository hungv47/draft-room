export const SITE = {
  name: "Draft Room",
  tagline: "A fantasy squad your agent can actually manage.",
  repoUrl: "https://github.com/hungv47/draft-room",
  licenseUrl: "https://github.com/hungv47/draft-room/blob/main/LICENSE",
  webmcpSpecUrl: "https://webmachinelearning.github.io/webmcp/",
  chromeFlag: "chrome://flags/#enable-webmcp-testing",
} as const;

/** Prompts that only work with an agent in the loop. Shown when the squad is empty and in the console. */
export const EXAMPLE_PROMPTS = [
  "Compare a 4-3-3 built around Haaland with a 3-5-2 built around Saka. Which is more likely to clear 1,800 points?",
  "Fill my squad for the highest floor, then tell me the probability it beats 1,700.",
  "Switch us to a 3-4-3 and find the three best ceiling upgrades I can afford.",
  "Read my brief, respect every protected player, and pick the captain that maximises our expected points.",
] as const;
