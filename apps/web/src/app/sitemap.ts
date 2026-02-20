import type { MetadataRoute } from "next";

import { getPublicBaseUrlOrigin } from "@/lib/seo/publicBaseUrl";

const PUBLIC_PATHS: Array<{ path: string; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]; priority: number }> = [
  { path: "/", changeFrequency: "daily", priority: 1 },
  { path: "/markets", changeFrequency: "hourly", priority: 0.9 },
  { path: "/p2p", changeFrequency: "daily", priority: 0.8 },
  { path: "/copy-trading", changeFrequency: "weekly", priority: 0.7 },
  { path: "/arbitrage", changeFrequency: "weekly", priority: 0.7 },
  { path: "/express", changeFrequency: "weekly", priority: 0.6 },
  { path: "/support", changeFrequency: "monthly", priority: 0.5 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = getPublicBaseUrlOrigin();
  const lastModified = new Date();

  return PUBLIC_PATHS.map(({ path, changeFrequency, priority }) => ({
    url: `${origin}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
}
