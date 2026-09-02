import type { MetadataRoute } from "next";
import {
  APP_ICON_SVG_DATA_URL,
  PRODUCT_DESCRIPTION,
  PROJECT_NAME,
} from "@/lib/brand";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: ".",
    name: PROJECT_NAME,
    short_name: PROJECT_NAME,
    description: PRODUCT_DESCRIPTION,
    start_url: ".",
    scope: ".",
    display: "standalone",
    background_color: "#07080c",
    theme_color: "#07080c",
    categories: ["sports", "productivity", "games"],
    icons: [
      {
        src: APP_ICON_SVG_DATA_URL,
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
