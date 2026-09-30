import type { MetadataRoute } from "next";

/**
 * Web app manifest — what makes this installable, and what the TWA wrapper
 * reads to build the Android package.
 *
 * `display: "standalone"` rather than `"fullscreen"`: this is a tool used in
 * short bursts, and hiding the status bar would cost the clock and battery
 * indicator for no gain. `orientation` is deliberately unset — a Fold is
 * used in both, and pinning it would break the device this is built for.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "XTNL Knowledge Engine",
    short_name: "XTNL",
    description: "Spaced-repetition knowledge engine with vector deduplication and automated taxonomy.",
    start_url: "/",
    id: "/",
    display: "standalone",
    background_color: "#0a0d13",
    theme_color: "#0c0f15",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Android crops launcher icons to the launcher's own shape; the
      // maskable variants carry the padding that survives it.
      { src: "/icon-192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // A long-press on the icon. 'Quick task' opens the board with the
    // capture sheet already up — the phone's shortest path from pocket to a
    // saved line. Android shows the first four; the installed TWA only
    // picks up a change here when its APK is rebuilt.
    shortcuts: [
      { name: "Today", short_name: "Today", url: "/today" },
      { name: "Quick task", short_name: "Task", url: "/today?capture=task" },
      { name: "Review due", short_name: "Review", url: "/review" },
      { name: "New idea", short_name: "Idea", url: "/add" },
    ],
  };
}
