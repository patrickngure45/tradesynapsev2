import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * Security-related headers that apply to all responses.
   * The middleware also sets most of these, but having them here ensures
   * they cover static assets and Next.js internal routes too.
   */
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "X-DNS-Prefetch-Control", value: "off" },
        ],
      },
    ];
  },

  poweredByHeader: false,
};

export default nextConfig;
