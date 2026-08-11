import type { Config } from "tailwindcss";

/**
 * Tailwind bindings for the XTNL_thesis design language.
 *
 * The authority for this system is `src/app/globals.css`, which mirrors
 * XTNL_thesis/app/globals.css token-for-token. This file exists so Tailwind
 * utilities resolve to those same CSS variables — a component may write
 * either `bg-card` or `background: var(--card)` and land on one value.
 *
 * The legacy names from the previous "Arcane Terminal" direction (`ink`,
 * `surface`, `gold`, `arcane`, `crimson`, `emerald`) are deliberately kept
 * and re-pointed at ecosystem tokens, so components not yet swept adopt the
 * new language instead of rendering against dead colors. `gold` is no longer
 * gold — XTNL's emphasis colour is green — and `arcane` is no longer violet.
 */
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        canvas: "var(--canvas)",
        base: "var(--base)",
        sub: "var(--sub)",
        card: "var(--card)",
        raised: "var(--raised)",
        lift: "var(--lift)",

        // Cool blue-tinted text ramp.
        ink: {
          DEFAULT: "var(--base)", // legacy: `bg-ink` was the page background
          raised: "var(--sub)",
          0: "var(--ink-0)",
          1: "var(--ink-1)",
          2: "var(--ink-2)",
          3: "var(--ink-3)",
        },
        fg: {
          DEFAULT: "var(--ink-0)",
          muted: "var(--ink-1)",
          faint: "var(--ink-2)",
          dim: "var(--ink-3)",
        },
        surface: {
          DEFAULT: "var(--card)",
          hover: "var(--raised)",
          border: "var(--line)",
          rule: "var(--line-hi)",
          active: "var(--line-act)",
        },

        // Brand + semantics. Green is the XTNL accent and carries both
        // "primary action" and "healthy/correct"; red, amber, blue are the
        // only other hues in the system.
        green: { DEFAULT: "var(--green)", hi: "var(--green-hi)" },
        accent: { DEFAULT: "var(--green)", bright: "var(--green-hi)" },
        red: "var(--red)",
        amber: "var(--amber)",
        blue: "var(--blue)",

        // Review state, named for what it means in this app.
        overdue: "var(--red)",
        due: "var(--amber)",
        ok: "var(--green)",

        // ── Legacy aliases, re-pointed ──────────────────────────────
        gold: { DEFAULT: "var(--green)", dim: "var(--ink-2)" },
        arcane: { DEFAULT: "var(--blue)", bright: "var(--blue)" },
        crimson: { DEFAULT: "var(--red)", dim: "var(--ink-3)" },
        emerald: { DEFAULT: "var(--green)", dim: "var(--ink-3)" },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "JetBrains Mono", "monospace"],
      },
      borderRadius: {
        // Thesis geometry: 12px cards, 10px controls, 6px chips.
        card: "12px",
        control: "10px",
        chip: "6px",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        card: "inset 0 1px 0 rgba(255,255,255,0.055)",
        // Legacy glow names, reduced to a 1px ring in the correct hue.
        "glow-gold": "0 0 0 1px rgba(0,204,122,0.30)",
        "glow-arcane": "0 0 0 1px rgba(77,156,245,0.35)",
        "glow-crimson": "0 0 0 1px rgba(240,58,87,0.35)",
        "glow-emerald": "0 0 0 1px rgba(0,204,122,0.35)",
      },
      keyframes: {
        fadeUp: {
          from: { opacity: "0", transform: "translateY(14px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        // Delta readout on a scored answer — retained, travel halved and
        // the scale bounce dropped.
        "float-up-fade": {
          "0%": { transform: "translateY(0)", opacity: "0" },
          "20%": { opacity: "1" },
          "100%": { transform: "translateY(-14px)", opacity: "0" },
        },
      },
      animation: {
        "fade-up": "fadeUp 0.55s cubic-bezier(0.4,0,0.2,1) both",
        "fade-in": "fadeIn 0.2s ease-out",
        "float-up-fade": "float-up-fade 0.9s ease-out forwards",
        // Legacy animation names from the RPG direction, mapped onto quiet
        // equivalents so no call site loses its transition or keeps a
        // shake/shockwave the new language wouldn't use.
        "level-up": "fadeUp 0.3s cubic-bezier(0.4,0,0.2,1) both",
        "discovery-pulse": "fadeIn 0.2s ease-out",
        "crit-shake": "fadeIn 0.2s ease-out",
        "rank-shockwave": "fadeIn 0.2s ease-out",
        "pop-in": "fadeIn 0.2s ease-out",
        "idle-drift": "fadeIn 0.2s ease-out",
      },
    },
  },
};

export default config;
