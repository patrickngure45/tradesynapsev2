import type { MetadataRoute } from "next";

import { getPublicBaseUrlOrigin } from "@/lib/seo/publicBaseUrl";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const origin = getPublicBaseUrlOrigin();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/admin",
        "/account",
        "/wallet",
        "/notifications",
        "/verify-email",
        "/login",
        "/signup",
      ],
    },
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
