import type { Metadata, Viewport } from "next";
import { Big_Shoulders, Doto, Sofia_Sans } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  APP_ICON_SVG_DATA_URL,
  PRODUCT_DESCRIPTION,
  PROJECT_NAME,
  TAGLINE,
} from "@/lib/brand";
import { TOOL_DEFINITIONS } from "@/webmcp/definitions";
import { buildBootScript } from "@/webmcp/boot";
import "./globals.css";

const bigShoulders = Big_Shoulders({
  variable: "--font-big-shoulders",
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
});

const sofia = Sofia_Sans({
  variable: "--font-sofia",
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
});

const doto = Doto({
  variable: "--font-doto",
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
});

export const metadata: Metadata = {
  title: `${PROJECT_NAME} — ${TAGLINE}`,
  description: PRODUCT_DESCRIPTION,
  applicationName: PROJECT_NAME,
  keywords: ["WebMCP", "fantasy football", "AI agent", "squad builder", "OpenAI"],
  icons: {
    icon: APP_ICON_SVG_DATA_URL,
    shortcut: APP_ICON_SVG_DATA_URL,
    apple: APP_ICON_SVG_DATA_URL,
  },
  openGraph: {
    type: "website",
    siteName: PROJECT_NAME,
    title: `${PROJECT_NAME} — ${TAGLINE}`,
    description: PRODUCT_DESCRIPTION,
  },
  twitter: {
    card: "summary",
    title: `${PROJECT_NAME} — ${TAGLINE}`,
    description: PRODUCT_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#07080c",
  width: "device-width",
  initialScale: 1,
};

const bootScript = buildBootScript(TOOL_DEFINITIONS);

/*
 * Direction contract, second cut (pinned by Hung on 2026-09-02).
 * THESIS: WebMCP is the headline. The page is a better fantasy tool with an agent in it than without one:
 *   scenarios, probability, formation changes, and atomic plans exist only as tools. Buttons stay minimal.
 * OWN-WORLD: One near-black surface, hairline borders, shadcn primitives; the floodlit WebGPU pitch is the
 *   only saturated thing. Coral for the human, cyan for the agent and for anything agent-only.
 * STORY: A judge sees a quiet room, a pitch, a scoreboard reading £100.0m, and an agent console listing fourteen
 *   tools with six marked agent-only. They ask an agent to compare two formations. The console logs each call,
 *   the pitch re-shapes, eleven cyan cards land, and the scoreboard shows floor and ceiling.
 * FIRST VIEWPORT: Header 52px. Three columns: pool, pitch (dominant), agent console. Score bug top-centre.
 * FORM: Minimal shell around a broadcast pitch. Type: Sofia Sans UI, Big Shoulders surnames, Doto board.
 */
const CONTRACT =
  "draft room v2 | THESIS: WebMCP is the headline; agent-only capability is the product | OWN-WORLD: one dark surface, hairlines, shadcn, floodlit WebGPU pitch as the only saturated thing, coral you / cyan agent | STORY: quiet room, fourteen tools, six agent-only; the agent compares formations and the pitch re-shapes | FIRST VIEWPORT: pool / pitch / console, score bug top | FORM: minimal shell around a broadcast pitch";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${bigShoulders.variable} ${sofia.variable} ${doto.variable}`}>
      <head>
        {/* Registers the WebMCP tools during HTML parse so agent hosts discover them before React hydrates. */}
        <script id="draft-room-webmcp-boot" dangerouslySetInnerHTML={{ __html: bootScript }} />
      </head>
      <body className="font-sans">
        <script type="text/x-direction-contract" dangerouslySetInnerHTML={{ __html: CONTRACT }} />
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
      </body>
    </html>
  );
}
