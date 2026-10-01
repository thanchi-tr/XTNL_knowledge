import type { NextConfig } from "next";

/**
 * Old and bare URLs, answered before any render: a real 307/308 from the
 * router, never a page-level `redirect()` (under the root loading.tsx a
 * page's redirect can stream as a meta refresh instead of a status code).
 * Config redirects run before the filesystem and keep the query string.
 *
 *   /           → /today      307 (temporary). The root lands on Today: the
 *                 board carries the day's todos, habits and duties, with the
 *                 review queue as its first card. A redirect rather than
 *                 rendering the board here, so Today keeps one canonical URL
 *                 to link, bookmark and put on a home screen (the TWA's
 *                 start_url is "/"). Temporary, so moving the front door is
 *                 this one line and no browser has cached the old answer.
 *   /workspace  → /review     308. The review screen's URL before it was named
 *                 for what it does; old shortcuts, history and bookmarks still
 *                 point here.
 *   /taxonomy   → /structure  308. Fields & Domains' URL before the redesign
 *                 gave the page one name everywhere.
 *
 * /overview, /dashboard and /skills/preview/* are 308 route handlers (their
 * own folders), tested in-process by scripts/you-check.ts. shell-check asserts
 * this list.
 */
const LEGACY_REDIRECTS = [
  { source: "/", destination: "/today", permanent: false },
  { source: "/workspace", destination: "/review", permanent: true },
  { source: "/taxonomy", destination: "/structure", permanent: true },
] as const;

const nextConfig: NextConfig = {
  async redirects() {
    return LEGACY_REDIRECTS.map((r) => ({ ...r }));
  },
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
};

export default nextConfig;
