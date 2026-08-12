import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        // Chrome fetches this exact path to verify the Android TWA owns this
        // domain. Serving it from `public/.well-known/` returned 404 on
        // Vercel, which does not expose dot-directories as static assets.
        source: "/.well-known/assetlinks.json",
        destination: "/api/assetlinks",
      },
    ];
  },
  /* config options here */
};

export default nextConfig;
