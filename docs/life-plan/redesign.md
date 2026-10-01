# Redesign: Sigil & Slate: final redesign (A as the base, with B's instruments and C's daily hooks grafted in)

## Vision

XTNL is a character sheet for a real life. Weekdays read like a well-kept ledger: matte slate surfaces, ink for structure, and colour only when it reports a state (kept, owed, held) or names a ledger (life XP, review points, MP). Rare, earned moments open a trophy vault: material (iron → bronze → silver → gold → astral) and Light appear, and the existing emblem, sky and cataclysm art plays at unlocks and band changes instead of on the free equip action.

BASE: Direction A (Sigil & Slate). It is the only direction where Today, the runner, the recap, Skills and the ceremonies read as one product, and it has the best reward architecture.

GRAFTED IN
- From B (Instrument):
  - promise rings for fixed targets (Musts, Quest, Life deed, weekly Move), drawn in A's ink; closing one gives one overshoot and one glint;
  - the receipt's diverging factor bars;
  - the off-screen mini-ring toast;
  - ink count badges, with signal colour only for debt;
  - the "What moved" ripple list on every Seal and Ascension;
  - an unpaid second Move lap;
  - the Stats heatmap;
  - the alias-first migration that fixes contrast in one PR;
  - a single WAAPI motion gateway.
- From C (Juice):
  - the Full-day stamp card, which is the M2 FULL_DAY rule (musts done or excused + quest met + one life deed; pays 0.5 MP; can REPAIR the broken day before it). It lives in the Day ledger as three promise rings;
  - the once-a-day "Day N kept" beat;
  - a Moments shelf;
  - the four track levels shown on the crest (its four diagonal edges light in proportion to track level ÷ depth cap);
  - a slightly more energetic Tier 0 token flight ("+4.2" flies to its ledger);
  - small seeded bursts, from Tier 1 up only.
- From the judges:
  - opaque sticky bars: nothing shows through and there is no blur cost;
  - server-persisted shownAt;
  - attribute-themes.ts and the SkillLogo palette unchanged. Rarity becomes a material rim around the art, and A's 13 new enamels are dropped;
  - the currency hues re-picked so the two ledgers stay ≥ 8 ΔE apart under protanopia and deuteranopia;
  - "due" retired as a hue: due is ink plus a clock glyph, and the Must lane is told apart by diamond shape;
  - designed states for a broken or repaired streak and for returning after an absence.

DROPPED
- C's candy emblem restyle, multi-hue Today, particles on every tick, Nunito, the wrong-answer shake and the split Motion/Celebrations settings.
- B's plain ink-ring identity, its generic person icon, its translucent level veil and its blurred persistent bars.
- A's non-text ink-3 as a legacy text alias, its 13 enamels, and its amber tab badges.

FEEL: calm, dense and fast every day. Honest numbers everywhere. The loudness of a celebration follows the rarity of the real outcome, and nothing is random.

## Tokens

/* ===== src/app/globals.css (head) ===== */
@layer theme, base, components, art, effects, utilities;   /* repeated as the FIRST line of every hand-written CSS file */
@import "tailwindcss";
@import "./styles/tokens.css" layer(theme);
/* @config "../../tailwind.config.mts" is REMOVED (≈34 colour-utility uses; the v4 @theme below replaces it) */

/* ===== src/app/styles/tokens.css — values measured with scratchpad/redesign/final-src/lab.mjs (WCAG 2.x; OKLab ΔE×100, Machado CVD) ===== */
:root, .theme-night {            /* Night is the default. .theme-night re-scopes Night inside the ceremony curtain in any theme */
  color-scheme: dark;
  /* surfaces */
  --canvas:#050609; --page:#0a0d13; --sunken:#07090e; --card:#11151d; --raised:#171c26; --overlay:#1d2330;
  --bar:#0c0f15;                 /* top bar, tab bar, rail, sidebar: OPAQUE, never backdrop-blurred */
  --scrim:rgba(3,4,7,.66);       /* transient overlays may add backdrop-filter: blur(3px) */
  --curtain:#05060a; --face:#0d1017;   /* ceremony background; coin face of every crest, emblem and medallion (both themes) */
  /* ink: every text step ≥ 4.5 on page / card / raised / overlay / sunken */
  --ink-0:#f1f3f8;   /* 17.52 / 16.47 / 15.37 / 14.17 / 17.94 */
  --ink-1:#c3cad8;   /* 11.82 / 11.11 / 10.37 /  9.56 / 12.10 */
  --ink-2:#9aa3b5;   /*  7.67 /  7.21 /  6.73 /  6.20 /  7.85  — the lowest step for text of any size */
  --ink-mute:#6f788c;/*  4.39 /  4.13 /  3.85 /  3.55 — NON-TEXT only: disabled glyphs, locked rims, unlit flame */
  /* lines */
  --line-1:rgba(255,255,255,.065); --line-2:rgba(255,255,255,.11);
  --line-ctl:#76819a;  /* every control border + tick ring: 4.98 page, 4.68 card, 4.37 raised, 4.03 overlay (was 1.87) */
  --hi:rgba(255,255,255,.04);
  /* signal = state in time (fg on card; on-solid; on own 14% wash) */
  --kept:#5fd38d; --on-kept:#0b1a12;   /* 9.74; wash 7.41 */
  --owed:#e07a95; --on-owed:#26060e;   /* 6.43 card, 5.53 overlay; on-solid 6.63; wash 5.29; ΔE vs kept: deutan 8.3 (was 4.1) */
  --held:#72d2ec; --on-held:#06161c;   /* 10.57; wash 7.96; always paired with a hatch or glyph plus a word */
  --hatch:repeating-linear-gradient(135deg,color-mix(in srgb,var(--held) 55%,transparent) 0 2px,transparent 2px 5px);
  /* "due" is retired as a hue: due = ink-0 text + clock glyph; the Must lane is told apart by diamond shape */
  /* currency: glyph marks. The figure beside a glyph is always ink */
  --xp:#fdaf3a;  --on-xp:#221400;   /* life XP · spark · 9.90 card / 8.51 overlay */
  --pts:#8ea6ff; --on-pts:#07103a;  /* review points · faceted lozenge · 7.88 / 6.78 */
  --mp:#ffe08a;  --on-mp:#2a1d00;   /* mastery points · hex nut · 14.17 / 12.19 */
  /* CVD: xp↔pts 29.0 normal / 27.0 protan / 29.8 deutan; xp↔mp 12.0/13.6/10.7; pts↔mp 29.7/27.3/31.2 */
  /* light: earned, and only for now */
  --light:#fff1cf; --light-glow:rgba(255,222,150,.34);
  /* materials: rarity, depth, band. Gradients on shapes only; never text on page surfaces, never status */
  --iron-a:#c3c9d4;   --iron-m:#8a93a4;   --iron-b:#434a5a;
  --bronze-a:#f3c08f; --bronze-m:#c0834f; --bronze-b:#8a5530;
  --silver-a:#ffffff; --silver-m:#c9d1de; --silver-b:#7d889c;
  --gold-a:#fff0bd;   --gold-m:#f0c75e;   --gold-b:#c9901f;   /* gold button label #2a1d00: 13.5 top, 5.88 darkest stop */
  --astral-a:#d8f3ff; --astral-m:#c7b5ff; --astral-b:#ffd9ee;
  --focus:var(--ink-0);            /* 2px outline, 2px offset; never reshapes the element */
  --shadow-pop:0 16px 40px -12px rgba(0,0,0,.6);   /* only overlays cast shadows */
}
:root[data-theme="vellum"] {      /* token-complete; ships AFTER launch; lint: identity hues never as text */
  color-scheme: light;
  --canvas:#e2dccf; --page:#f3efe6; --sunken:#e9e3d6; --card:#fffdf8; --raised:#faf6ee; --overlay:#ffffff;
  --bar:#f3efe6; --scrim:rgba(30,26,18,.38); --face:#0d1017;
  --ink-0:#17191f; --ink-1:#3a404d; --ink-2:#595f6e /* 6.28 card, 5.00 sunken */; --ink-mute:#777d8a;
  --line-1:rgba(40,32,16,.08); --line-2:rgba(40,32,16,.14); --line-ctl:#7f7868 /* 4.31 card, 3.43 sunken */; --hi:rgba(255,255,255,.7);
  --kept:#196b3d; --on-kept:#fff; --owed:#9c2f6b /* 6.81 */; --on-owed:#fff; --held:#0e6480; --on-held:#fff;
  --xp:#a33d00 /* 6.41 */; --on-xp:#fff; --pts:#3450c2 /* 6.72 */; --on-pts:#fff; --mp:#b47308 /* 3.83, glyph only */; --on-mp:#1f1500;
  /* Vellum xp↔mp 13.3/14.6/11.4 */
  --light:#b8801f; --light-glow:rgba(184,128,31,.22); --shadow-pop:0 16px 40px -14px rgba(40,30,10,.35);
}
:root {
  --font-ui: var(--font-inter), "Segoe UI", system-ui, sans-serif;
  --font-display: var(--font-fraunces), "Iowan Old Style", "Palatino Linotype", Georgia, serif;
  --font-display-italic: var(--font-fraunces-italic), var(--font-display);
  --font-mono: var(--font-jetbrains), ui-monospace, Consolas, monospace;
  /* spacing: 4-based, in px (html stays 16px) */
  --s-1:2px; --s-2:4px; --s-3:6px; --s-4:8px; --s-5:12px; --s-6:16px; --s-7:20px; --s-8:24px; --s-9:32px; --s-10:40px; --s-11:56px;
  --r-chip:8px; --r-ctl:12px; --r-card:16px; --r-sheet:24px; --r-pill:999px;
  --hit:44px; --hit-min:40px;
  --topbar-h:56px; --tabbar-h:64px; --rail-w:84px; --sidebar-w:232px;   /* replace --nav-h and the 22+60+58 sums */
  --t-press:90ms; --t-quick:160ms; --t-base:240ms; --t-slow:420ms; --t-flight:560ms; --t-seal:1400ms; --t-ceremony:2000ms;
  --ease-out:cubic-bezier(.16,1,.3,1); --ease-inout:cubic-bezier(.65,0,.35,1); --ease-stamp:cubic-bezier(.34,1.56,.64,1);
  --ambient-play:running;
  --z-sky:-1; --z-bar:20; --z-toast:30; --z-sheet:50; --z-ceremony:70; --z-fx:80;
}
html[data-motion="calm"], html[data-motion="still"], html[data-power="save"] { --ambient-play:paused; }
html[data-motion="still"] *, html[data-motion="still"] *::before, html[data-motion="still"] *::after { animation:none !important; transition:none !important; }

/* ===== TYPE ROLES (base layer classes; they replace the 313 inline {fontSize,color} objects) ===== */
.t-display-xl  34/38 600 display    ceremony title
.t-display-l   30/34 600 display    character title, recap headline
.t-display-m   21/26 600 display    card and sheet titles; question text 20/27 500
.t-display-s   19/23 600 display    top-bar page title
.t-numeral     20–34/1 600 display + tabular-nums   streak, level, +N, purse
.t-epithet     17/1.3 italic 400 display, ink-1
.t-body-l      15/20 500 ui         row titles, answers (options 16)
body           15/1.45 400 ui       (line-height drops from 1.75)
.t-meta        13/18 400 ui, ink-2
.t-eyebrow     12/16 600 ui, caps, .11em, ink-2   (the only caps style)
.chip          12/1.25 600 ui, sentence case
.t-mono        12.5/1.4 500 mono    formulas, receipts, typed math only (global `code,pre,.mono{!important}` retired)
Floor: 12px everywhere, radar labels included. Inputs are 16px on phones. Sentence case everywhere except eyebrows and lane labels.

/* ===== FONTS (src/app/layout.tsx; see node_modules/next/dist/docs/01-app/03-api-reference/02-components/font.md) ===== */
Inter({ subsets:['latin'], variable:'--font-inter', display:'swap' })                                    // preloaded, as today
Fraunces({ subsets:['latin'], axes:['opsz'], variable:'--font-fraunces', display:'swap' })              // roman: preloaded
Fraunces({ subsets:['latin'], style:'italic', axes:['opsz'], variable:'--font-fraunces-italic', display:'swap', preload:false })
JetBrains_Mono({ subsets:['latin'], variable:'--font-jetbrains', display:'swap', preload:false })
(no SOFT axis; display serif only for named or earned things)

/* ===== LEGACY ALIASES (PR 1; each deleted when grep reaches 0) ===== */
@layer theme { :root {
  --base:var(--page); --sub:var(--sunken); --lift:var(--overlay);
  --ink-3:var(--ink-2);       /* 141 TSX + 18 CSS text uses: 1.64:1 → 7.21:1 on card, 6.20 on overlay */
  --line:var(--line-1); --line-hi:var(--line-2); --line-act:var(--line-ctl);
  --green:var(--kept); --green-hi:var(--kept); --green-10:color-mix(in srgb,var(--kept) 10%,transparent); --green-06:color-mix(in srgb,var(--kept) 6%,transparent);
  --red:var(--owed); --red-10:color-mix(in srgb,var(--owed) 10%,transparent);
  --blue:var(--held); --blue-10:color-mix(in srgb,var(--held) 10%,transparent);
  --amber:var(--ink-0); --amber-10:color-mix(in srgb,var(--ink-0) 8%,transparent);  /* due → ink; each Apex use → gold material (codemod) */
  --nav-h:var(--topbar-h); --background:var(--page); --foreground:var(--ink-0);
  /* --rank-* keep their values: SkillLogo mirrors them in RANK_META */
}}
The 95 --green uses are reviewed by the codemod: primary button → .btn-primary (ink fill), focus → --focus, done → --kept.

/* ===== TAILWIND v4 ===== */
@theme inline {
  --color-page:var(--page); --color-card:var(--card); --color-raised:var(--raised); --color-overlay:var(--overlay); --color-sunken:var(--sunken);
  --color-ink-0:var(--ink-0); --color-ink-1:var(--ink-1); --color-ink-2:var(--ink-2); --color-ink-mute:var(--ink-mute);
  --color-kept:var(--kept); --color-owed:var(--owed); --color-held:var(--held); --color-xp:var(--xp); --color-pts:var(--pts); --color-mp:var(--mp);
  --color-line-1:var(--line-1); --color-line-2:var(--line-2); --color-line-ctl:var(--line-ctl);
  --font-sans:var(--font-ui); --font-display:var(--font-display); --font-mono:var(--font-mono);
  --radius-chip:8px; --radius-ctl:12px; --radius-card:16px; --radius-sheet:24px;
  --text-meta:13px; --text-meta--line-height:18px; --text-eyebrow:12px; --text-eyebrow--line-height:16px;
  --ease-out:var(--ease-out); --ease-inout:var(--ease-inout); --ease-stamp:var(--ease-stamp);
}

/* ===== MATERIAL LADDERS (TS in src/lib/materials.ts; SkillLogo palettes untouched) ===== */
RANK_MATERIAL = { PURE:'iron', SYNERGY:'bronze', CAPSTONE:'silver', APEX:'gold', ULTIMATE:'astral' }
  - added to skill-visuals.ts beside RANK_META; RANK_META.color is untouched so none of the 749 emblems recolour.
Emblem depth bands: 1–4 iron, 5–8 bronze, 9–12 silver, 13–14 gold, 15 astral.
Character crest bands by level:
  - 1–14 iron (Novice to Adept);
  - 15–27 bronze (Practitioner, Scholar);
  - 28–45 silver (Savant, Master);
  - 46–69 gold (Grandmaster, Luminary);
  - 70+ astral (Sage, Archon); Transcendent ranks also astral.
Domain, field and track medallions by level: 1–4 iron, 5–9 bronze, 10–14 silver, 15–19 gold, 20+ astral.
Attribute hues: attribute-themes.ts, unchanged. Used only inside emblem art, radar vertex markers (as polygon glyphs) and path headers, and never next to status or currency chips.

## Components

Everything lives in src/components/ui/* (primitives) and src/components/shell/*, plus src/components/celebrate/*. There is one implementation of each. /dev/style renders them all.

BUTTON (Button.tsx)
- One base with five voices, all transitioning transform and background only; press scale is .98 over 90 ms.
  - primary: ink-0 fill, page-coloured text, 48 lg / 44 md. Green is no longer the call to action.
  - secondary: line-ctl outline, 44.
  - quiet: text only, 44.
  - gold: only for spending earned currency (Unlock, Equip now in a ceremony). Gradient #ffe7a3 → #f0c75e → #c9901f, label #2a1d00.
  - danger: owed outline plus the typed-phrase confirm.
- An optional kbd hint shows on hover-capable devices ("Start review R", "Next card Enter").
- IconButton: 44×44, radius 12.

BADGE (Badge.tsx)
- 18 px pill, 12/700.
- Ink fill for counts that ask something of you; owed fill only for debt.
- Renders nothing at 0. Tab and rail badges are ink. An open debt shows as a separate owed pill on Today ("1 owed").

CHIP (Chip.tsx)
- One dialect: min-height 24, radius 8, 12/600, sentence case.
- Tones: quiet, kept, owed, held (hatch or glyph plus a word), and ready (the only material chip, gold gradient).
- The interactive variant is 40 px tall (filters, parse chips, RPE chips).

AMOUNT (Amount.tsx)
- kind = xp | pts | mp. Glyph in the currency hue, figure in ink, tabular numerals.
- One decimal and thousands separators. A sign only on credits ("+4.2"), a true minus on debt ("−3.8 owed").
- Two ledgers are never summed.

PRICE PILL (PricePill.tsx)
- 30 px pill inside a 44 hit area.
- Open: "≈ 8.3" plus the spark. Paid: "+8.3" on an xp wash.
- Tap opens the Receipt.

RECEIPT (Receipt.tsx, in a Sheet)
- Amount (display 30) plus "pays exactly this · Craft".
- Factor rows (Band + base, Effort, Timing, Streak, Repeat, Volume, Mode) with DIVERGING mini-bars around ×1.00 (log scale; up in ink-0, down in ink-2). Factors that moved the price are ink-0; ×1.00 factors are ink-2.
- Then "20 base × factors = 22.0" in mono, the daily-knee sentence, the formula version and a "How XP works" link.
- The review receipt is the same component with base × combo × focus.

TICK (Tick.tsx)
- 44 target around a 24 circle (todos) or a 21 diamond (musts). Ring border is line-ctl.
- role=checkbox with aria-checked. Press scales to .88.
- Done: kept fill, the check draws via stroke-dashoffset in 220 ms.
- Minimum version: a half-filled ring plus "Minimum kept".
- Meta becomes "Kept 08:05 · paid 3.6 exactly · Undo" (10 s undo that nets to zero).

ROW and LANE
- Row: a 64 px grid of [tick][title 15/20 500 + one meta line: track sigil, rung, due + clock][price pill]. Everything else lives in the drawer.
- Lane: eyebrow header with a diamond mark and "n of m kept". Must lane marks are ink diamonds. A KEPT stamp (display 12, kept outline, −7°) sits in the header, with a line sweep across the lane card.

METER (Meter.tsx)
- One component: 8 px (6 thin), sunken track with a line-2 inset.
- Layers: base in ink-0 (scaleX), an optional gain segment in the currency that fed it (xp for life tracks, pts for Knowledge and domains) animated old → new over 700 ms, and an optional cap tick.
- Replaces the ~10 bar implementations. There is no daily life-XP meter anywhere.

SEGMENT STRIP (SegmentStrip.tsx)
- Quests, runs and history.
- on = ink-0; miss = hatched owed with an outline, never colour alone; cur = ink outline.

PROMISE RING (PromiseRing.tsx)
- SVG with pathLength=100: track at ink 10%, value in ink-0 with round caps.
- Only for fixed targets: Musts n/m, Quest n/15, Life deed n/1, weekly Move n/150 (pro-rated for rest days), and the recap quest.
- closed = kept stroke + check + one 4.5% overshoot + one glint lap.
- empty hides the value stroke. dashed track = calibrating. An optional lap arc (ink-0 at 55%, butt caps) shows the unpaid second lap to 300.
- Sizes: 34 (toast), 40 (Day ledger), 56, 64, 128 (Train).

DAY LEDGER TILE (DayLedger.tsx, Today)
- Top: the DaySeal (flame inside a dashed ring; lit = light ring + halo; broken = hollow flame), the streak numeral, a state caption, and freeze crystals ("2 banked" / "0 banked · 2 used").
- FULL DAY strip: eyebrow, "n of 3", three PromiseRings (Musts, Quest, Life) and the note "+0.5 MP when it settles · also repairs a broken day before it, once a week". When all three close, a FULL DAY stamp lands.
- Cells: life XP (xp glyph), review pts (pts glyph), planned vs capacity.
- Once the cells scroll away, a compact MiniLedger docks in the top bar so every flight lands on a visible target.

MAKE-UP CARD (M2)
- 3 px owed rail, owed chip ("−3.8 owed"), when ("Stretch · Tuesday"), a plain sentence and the 48 h window ("before Fri 04:00 and its 12-day streak comes back").
- Actions: [Make up · ≈ 3.2] [Do minimum · 2 min · ≈ 1.1].
- Resolved: the rail turns kept ("Made up. Nothing owed.", repaid in full) or held (minimum).
- Stacked debts collapse into ONE summary card ("−15.1 owed · 3 musts · Tuesday") that expands. A collapsed OwedSummary row sits at the bottom of the board. There is never a red wall.

NOTICE CARDS
- WelcomeBack (return after absence), YesterdaySettled (deferred outcome with kept, held and MP chips), RepairAsk (broken streak) and AskCard (ink diamond + one action).
- These are the Asks model: the same derived feed opens from the bell as a sheet.

CREST (Crest.tsx)
- Hex coin: face #0d1017, band-material rim, inner hairline hex, Fraunces numeral.
- From 48 px its four diagonal edges carry the tracks (upper-left Body, upper-right Duty, lower-right Craft, lower-left Care), lit in light at 92% in proportion to level ÷ depth cap.
- Sizes: 24 (tab), 34 (rail), 38 (top bar), 48 (sidebar card), 96 (sheet hero), 168 (ceremony). It is the single identity of the character level everywhere.

EMBLEM COIN (EmblemCoin.tsx)
- Wraps SkillLogo with animated={false}; the palette is untouched.
- Adds a RANK_MATERIAL rim, an inner hairline and depth notches.
- States:
  - owned: solid rim;
  - locked: dashed ink-mute rim, glyph at 42% and "64%" beneath;
  - ready: dashed gold orbit (the ONE allowed ambient loop outside ceremonies, 14 s, on --ambient-play) plus a Ready chip.
- Node sizes: 56 on ladders, 44–48 in loadout and callouts, 88 in the detail sheet.

MEDALLION (Medallion.tsx)
- Coin face, band-material rim drawn via dashoffset, 8 notches, and a numeral that rolls old → new.
- The T2 visual. It also marks PRs ("PR") and habit rungs (◆).

LOADOUT GRID
- 5×2 slots, 44–64 px, radius 16. Empty slots are dashed "+".
- Equip = one slot glint (Tier 0). A single tap never detaches: the sheet asks.

SHEET (Sheet.tsx, merges the two current ones)
- Bottom sheet on compact (radius 24, grabber, max 88dvh, keyboard-aware via --kb).
- Right drawer, 420 wide, from 600. A centred 560 dialog variant is used for Capture.
- Scrim (blur allowed: it is transient), focus trap, Escape stack, focus returns to the opener.

TOAST DOCK (ToastDock.tsx, merges the two)
- One dock: tabbar-h + 12 on compact; bottom-right, 380 wide, from 600.
- role=status, one action (Undo / OK), 4–10 s hold that pauses on hover or focus.
- It can carry a closing mini PromiseRing when a ring closed off-screen.

SEAL CARD (celebrate/SealCard.tsx, Tier 2)
- Medallion, eyebrow, display title, fact bullets and "What moved" rows (label left, exact value right).
- Docked at the toast position (Done button, auto-dismiss 9 s, paused on hover or focus), OR rendered inside a result panel or week card with no button of its own.

ASCENSION CURTAIN (celebrate/AscensionCurtain.tsx, Tier 3)
- Full-screen opaque --curtain inside .theme-night in both themes; aria-modal.
- Contents: Skip (it becomes Close), art slot (emblem/crest), kicker (the material colour), display-xl title, epithet, lore line, grant cards, a cost line and a cause line.
- Actions: a gold primary plus quiet Done.
- A backdrop slot takes the sky band or Cataclysm variant; a still tableau is always available.

SHELL (src/components/shell/*)
- AppShell picks chrome by viewport media query (<600 tab bar, 600–1279 rail, ≥1280 sidebar). Content layout uses container queries on <main class="main"> (container: main / inline-size).
- NEVER put container-type on an ancestor of fixed layers (it becomes their containing block) or on a shrink-to-fit flex child (it collapses to 0).
- TopBar (56; 60 from 600; 52 when max-height is 760): crest button (compact only), eyebrow + display-s title, section tabs (medium), MiniLedger (absolute, fades in), Asks bell.
- TabBar (64 + safe area): Today · Study · [+ 52 px ink tile] · Train · You (the crest).
- Rail (84): + Capture at the top, Today, Study, Train, then the crest You at the bottom; items 72×62.
- Sidebar (232): character card (crest 48 with track edges, title, epithet, level meter, "86% to Practitioner at 15"), Capture button with kbd C, sections with their sub-pages open, an ink count per section and an owed pill for debt.
- LoadoutBar leaves the layout. It becomes a one-line strip on the Study hub and in the runner footer, plus You › Loadout. NotificationBubble becomes the Asks bell, and the Asks cards on Today.

OTHER
- Tabs (40), Segmented (40), Switch (52×32 inside a 44 hit area), PageHeader (eyebrow + title live in the top bar; in-page headers only carry actions), SectionHeader (diamond + caps h2 + right aside; wraps).
- Skeleton: static cards at their final geometry, no shimmer.
- Icon: one 24 px stroke sprite (1.75, round) plus filled currency glyphs (c-xp spark, c-pts lozenge, c-mp hex nut), track sigils (Body triangle, Duty shield, Craft square, Care heart, Knowledge book) and held glyphs (freeze crystal, rest moon, sick cross, vacation case). Unicode glyph icons are removed.
- Charts: ChartCard chrome uses line-1 grid, ink-2 labels and an overlay tooltip. A single series is ink-0. Several series are ink with dash patterns plus direct end labels. Review status uses signal tokens. palette.ts REVIEW_STATUS_COLORS and CHART_THEME point at tokens.

## Motion

PRINCIPLE: the end state is written first. Motion only shows the way there, only for what changed, and only once.

TOKENS
- Durations: press 90, quick 160, base 240, slow 420, flight 560–640, seal hold ≤ 1400 (mastery ≤ 2200), ceremony settles ≤ 2000.
- Easings, three instead of 34:
  - out (.16,1,.3,1): the default, also the framer ease;
  - in-out (.65,0,.35,1): sweeps, flights and glints;
  - stamp (.34,1.56,.64,1): pops, stamps, rolls and the ring overshoot.
- Only transform, opacity and stroke-dashoffset animate. No width or height animation, no blend modes, no filter blur.

ONE GATEWAY: src/lib/motion.ts
- play(el, keyframes, opts):
  - Still → returns immediately; the element's resting CSS is the final state.
  - Calm → keyframes stripped to opacity, ≤ 260 ms, delays ≤ 200 ms; flourishes (flights, bursts, rim draws) skipped.
  - Full → WAAPI with fill:both.
- fly(from, to, {text, glyph, tok}): the +N token plus 2 trailing motes on a quadratic curve, 600 ms. Full only; Calm and Still show a static floater under the target instead.
- burst(x, y, n, seedId): seeded by event id, so the same event always gives the same burst.
- countTo(els, fromLastSeen, to), roll(el, text), bump(el).
- Every animation in Today, the runner, the recap and the shell goes through the gateway. framer-motion stays only in dashboard/Stats charts and is lazy-loaded (next/dynamic or LazyMotion). It is kept off /today, the runner and the shell. There is one <MotionConfig reducedMotion="user" transition={{ease:[.16,1,.3,1]}}> for those charts. Number tickers animate from the LAST-SEEN value, never from 0.

WHAT MOVES, AND WHEN
- Nothing moves on arrival. No page-entrance fades or staggers on Today or Review; loading.tsx skeletons cover the wait.
- Tick (T0): ring press .88; fill 160; check draw 220 (40 ms delay); price → "+N"; token flight 600 to the life-XP cell, or the top-bar MiniLedger when the cell is off-screen; count-up 420; glyph bump 320.
- First deed of the day (T1): seal ring draws 620, halo 700, light sweep across the Day tile 900, streak numeral rolls 480, seeded burst of 8.
- Promise ring close (T1): stroke 600 → kept stroke, a 4.5% scale overshoot 520 (stamp ease), one white glint lap 900. The ring's check fades in.
- Full day (T1): the FULL DAY stamp lands (scale 1.7 → 1, rotate −7°, 380), sweep, burst of 8.
- Lane kept (T1): stamp 380 plus a kept line sweep 800 across the lane card.
- Review answer:
  - chosen option locks and the others dim to 45%;
  - result panel slides up 300 (floating 600-wide card from 600 px);
  - +N token flies to the session tally;
  - domain meter gain segment grows old → new 700;
  - the new combo diamond stamps in 420.
- Miss: the combo drains right to left at 55 ms per link. No shake, no red flash. The panel waits.
- Seal (T2): medallion rim draws 520, notches pop at 32 ms each, numeral rolls at 380, 14 motes, card sweep.
- Recap: sections reveal with a 70 ms stagger (the only stagger in the app, and it is a result not an arrival), the quest ring glints, CLEARED stamp.
- Ascension (T3):
  - the curtain fades in 320; the art flies from the tapped node 640 (in-out);
  - rims and polygon draw 760; spokes fade; notches or crest edges pop at 32 ms each;
  - at 1.0 s: flash 900 + one shockwave ring (a 320 px ring scaling .12 → 1.5) + ≤ 26 seeded motes; rays fade in and turn at 90 s per revolution;
  - text rises at an 80 ms stagger from 1.15 s; settled by 1.9 s.

AMBIENT
- Exactly two loops exist: the ready-emblem orbit (14 s) and the ceremony rays (90 s). Both run on animation-play-state: var(--ambient-play).
- Skies drift only on path headers and ceremony backdrops, under the same variable.
- Removed: the btn-primary sheen, nav motes, the arcane conic, res-breathe/mote/sweep, aura-breathe, the field-tile sheen and crest, and rank-ascend and boss-rise replaying on every visit.
- PowerSaver's hidden-tab and battery ≤ 20% pause maps onto html[data-power="save"] → --ambient-play: paused.

SETTINGS › FEEDBACK
- Motion: Full / Calm / Still, written to html[data-motion] by an inline script in the root layout before paint.
  - The default follows prefers-reduced-motion (reduce → Still) until the user picks one.
  - Stored in UserPrefs, with localStorage as the pre-migration fallback.
- Still: animation and transition are none everywhere, and every rule rests on its final state, so a still user sees the finished tableau with identical words. This fixes Cataclysm going to opacity 0. Correct answers never auto-advance in Still.
- Sound (Off | Soft) and Haptics (Off | On) are separate per-device toggles. There is ONE motion control (no separate Celebrations setting).

PACING: a hold is a ceiling, never a toll.
- A correct answer's panel can be skipped after a 220 ms arm. It auto-advances after 1.8 s with a visible countdown hairline (pauses on pointer enter). Settings offers "After a correct answer: Next after 1.8 s | Wait"; Still always waits.
- A miss always waits for Continue.
- A Seal holds ≤ 1.4 s (mastery ≤ 2.2 s), then is dismissible and merges into the recap.
- A ceremony can be skipped from frame 1 by tap, Escape or Skip. The first skip jumps to the final tableau; the second closes.

ACCESSIBILITY OF MOTION
- Every celebration also writes its words to one polite live region (role=status).
- The curtain takes focus on a tabindex=-1 container with no visible ring, and focus returns to the opener.
- Every seal and ascension is written to a dev log (/dev/style event log).

## Rewards

PRINCIPLES
- Celebrate real, deterministic outcomes only; nothing random is celebrated or paid.
- Loudness scales with rarity and meaning, never with how often a button can be pressed.
- Every celebration states the fact, the exact number, and why (receipt, formula, source or "What moved").
- Repeatable or free actions (equip, undo, re-slot, receipt open) stay at Tier 0.
- Two ledgers, never summed: life XP (spark, amber) and review points (lozenge, periwinkle). Mastery points (hex nut, gilt) are the spendable third. The recap states "Life XP: 0, because reviews pay review points".

ONE QUEUE (src/lib/celebrate.ts)
- T0 and T1 render in place immediately.
- T2 and T3 enqueue: one at a time, highest tier first. Lower tiers that fire during a run merge into that run's recap instead of stacking.
- Every event is {id, tier, kind, facts, what[], shownAt?}.
- T2 and T3 persist server-side (CelebrationEvent with a unique dedupeKey), so a moment plays once across the Fold and the desktop. Acknowledging sets shownAt; unseen deferred events surface on the next open.
- "Replay" exists only in You › Moments.

TIER 0 · MARK (many a day)
- Triggers: tick, correct answer, capture saved, equip, make-up paid, idea created, RPE rated.
- Visual: check draws; "≈" becomes the exact figure; the +N token flies to its OWN ledger (xp → life-XP cell or top-bar MiniLedger; pts → session tally); count-up; glyph bump. In place. ≤ 700 ms. 0 particles.
- The review result states a true fact instead of a random affirmation: "Recalled after 34 days · longest gap yet for this idea · next review in 71 days", then "+6.4 review pts · +0.6 MP" and the formula "4.2 base × 1.15 combo × 1.32 focus".
- Sound: Soft = one 1318 Hz sine, 70 ms. Haptic 8 ms.

TIER 1 · CHIME (a few a day)
- Triggers:
  - first deed of the day ("Day 24 kept", seal lights, streak rolls);
  - a promise ring closes (Musts, Quest 15, Life deed, weekly Move 150);
  - FULL DAY (all three rings);
  - lane kept;
  - quest cleared (fires on /review's recap, not on the next Today visit);
  - "Nothing owed" when the last debt clears;
  - Tuesday repaired;
  - Yesterday settled (first sight);
  - field cleared;
  - weekly quota met.
- Visual: seal ring or KEPT/CLEARED/FULL DAY stamp; one glint; light sweep; seeded burst of 8. In place, < 1 s.
- If the ring is off-screen, the toast carries a closing mini ring.
- Sound: two notes (784 → 1175). Haptic [12, 40, 18].

TIER 2 · SEAL (weekly to monthly)
- Triggers:
  - domain, field or track level;
  - character level WITHIN a band (e.g. 15 → 16, "still Practitioner · Scholar at 21");
  - Idea mastered (shows the Idea, first-added date, review count, longest gap, +25 MP; 2.2 s);
  - habit rung (Forming → Established → Automatic);
  - streak milestones 7 / 30 / 100 / 365;
  - kept week (merged: one Seal per week card, not four);
  - PR (sensor sessions only);
  - boss victory (BossSigil face + a boon you CHOOSE);
  - Short or Mid goal finished (frozen MP payout stated).
- Visual: Medallion in the band's material with a rolling numeral, 14 motes, card sweep, facts, and the exact points (a level-up never hides the payout), plus "What moved" rows such as "Economics field L8 · 64% → 67%", "Character 86% → 88%" and "Duty depth cap 12 → 12.2".
- Inside the review result panel it renders below the payout with no button of its own.
- Sound: three notes (523, 784, 1047). Haptic [14, 50, 22, 50, 40].

TIER 3 · ASCENSION (rare)
- Triggers:
  - a title change (every band in titles.ts);
  - a material band re-forge (15 bronze, 28 silver, 46 gold, 70 astral), where the crest is re-forged everywhere in the shell;
  - emblem UNLOCK (MP spent: two taps, Unlock → Confirm, with the balance before and after shown first);
  - a Long goal finished;
  - the first Ultimate / Transcendent rank.
- Visual: full-screen opaque night curtain in both themes. The art flies from the tapped node, rims draw, depth notches pop (or the crest's track edges light), then flash, one shockwave ring, ≤ 26 seeded motes and slow rays.
- Text: what it is; what it grants ("+40 Statistic, now 428. It overtakes Mind, so your epithet becomes 'who Reads the Sample'"); what it cost ("Spent 1,200 MP · 146 left"); what moved it ("Duty reached level 12 when Sunday's week was kept").
- Actions: gold primary (Equip now / See your sheet) + Done.
- The existing art is reused as backdrop:
  - the attribute sky band behind the emblem;
  - the Cataclysm variants (d13–15) on the FIRST unlock of an Apex or Ultimate only, each with a still tableau;
  - boss victories use BossSigil at T2.
- Sound: four notes. Haptic [20, 80, 20, 80, 40, 120, 60].

EQUIP is Tier 0: one slot glint. EquipPulse escalation, BarCharge, the page surge and the Cataclysm move to unlock.

DEFERRED OUTCOMES (M2 settlement, freezes, debt, REPAIR, kept weeks, M4 PRs from sync)
- Shown when first SEEN, not when computed.
- A morning "Yesterday settled" card lists kept, Full day +0.5 MP, freeze earned, repaired, or a make-up card created. It fires a T1, or a T2 when a milestone is inside.
- Kept weeks appear as the weekly review's week card.
- Each remains an Asks row until acknowledged.

STREAK STATES (designed)
- Not counted yet: grey flame in a dashed ring, "Not kept yet. Any tick or review keeps it."
- Kept: light ring, "Kept today, 08:05. Safe until 04:00."
- A freeze will cover yesterday: a held chip.
- Broken:
  - Hollow flame, "Ended Tuesday at 23 days. Best 41." It never shows 0 in a red frame.
  - When REPAIR is possible (≤ 1 per 7 days): a RepairAsk, "Wednesday was 2 of 3 of a Full day. If you did its last must, record it and your streak returns as 25."
  - When it is not possible: "A Full day today is worth +0.5 MP."
- Repaired: a T1 chime "Tuesday repaired · streak 25".

RETURN AFTER ABSENCE (≥ 3 days)
- One WelcomeBack card replaces the Asks:
  - which freezes held which days;
  - the streak line with the best kept;
  - the owed total as ONE collapsed summary with its 48 h window;
  - Wednesday still recordable;
  - "142 due · today's quest is still 15, the rest can wait and nothing is lost".
- Actions: [Record Wednesday] [See what's owed] [Plan time off].
- The quest target is capped at 15 (the M2 FULL_DAY rule), so a backlog never makes the day unwinnable. The Queue ring is never "12/150".

PENALTIES are announced when they apply, each with a way to clear it:
- debt as an owed chip plus a make-up card;
- DOUBT and STAGNATION as owed chips with the reason and how to clear them (recommendation: drop SHAKEN);
- MP decay warned 2 days ahead;
- Ward or shield saves as a positive held beat ("Level 6 held by your Ward of Patience").
There is no guilt copy, no mascot, no red walls and no countdown alarms.

HONESTY DECISIONS (all implemented, not optional)
- xp.ts: rollRewardVariance returns factor 1.0 (the expected value); delete VARIANCE_STRONG_AT, the "Strong roll" band and its UI; srs.ts stops calling the roll. Re-run `npm run balance:horizon`.
- SessionCard AFFIRMATIONS (random) are replaced by true facts from review history (src/lib/review-facts.ts: gap, longest gap, first clean recall after a miss, closest to mastery, rescued overdue).
- The combo label shows the multiplier PAID on this card ("×1.15 on this card", then "×1.20 next card" after answering), respecting cap modifiers; "capped" at 10.
- The boss bar drops only on correct answers and shows "need 7 of 9 · 3 so far"; boss spoils become a chosen boon.
- The nav streak is the DAY streak; the combo lives only in the runner.
- Proficiency becomes "distance to the next title" and never drops on success; rings and meters animate from the last-seen value.
- The capital dividend loses its loudest-panel treatment: shown as a Stats line item until it has a real sink or is tied to kept days.
- Set discoveries are persisted server-side; the codex gets a real button.
- Undo nets to zero, including the streak.
- There is no daily life-XP bar; the day's goal is the Full-day card.

SOUND AND HAPTICS: both off by default and set per device. Soft = WebAudio sines at gain .04, pitches fixed per tier, muted in Still. Haptics use navigator.vibrate (Android and the TWA) with one fixed pattern per tier, skipped in Still.

## Pages

Routes kept: /today, /today?capture=task, /review, /add, /workspace → /review (the manifest and TWA depend on them).
Route changes:
- New: /today/week, /library/[id], /structure (/taxonomy redirects), /you (/overview redirects), /you/loadout, /you/moments, /you/stats (/dashboard redirects), /settings, /train (M4), /dev/style (gated; /skills/preview/* moves under /dev/style/art).
- /skills and /skills/[attribute] keep their URLs.
- Every route gets a loading.tsx skeleton and a metadata title.

SIZE CLASSES
- Compact < 600 (Fold cover 344–420, phones): tab bar, one column, 16 px gutter.
- Medium 600–1279 (unfolded Fold 932×704): rail, section tabs in the top bar, 24 px gutter, boards in two columns from a main width of 640.
- Expanded ≥ 1280: sidebar, 32 px gutter, Board in three columns from a main width of 1100.
- Templates: Board, Runner (focus mode: no shell, max 560, exit top-left with a confirm, progress on top, answers in the thumb zone, result panel from the bottom; a floating 600 card from 600 px), Sheet, Browse (filters in the URL, filter sheet on compact, side detail from medium), Form (max 640, sticky submit).

TODAY (/today, home) — final-today.html
- One DOM, three orders:
  - compact: Notice → Day ledger → Next up → Asks → Must → Planned → Habits → Owed row → Movement → Goals → Inbox/Anytime → Close the day;
  - medium: left column (Day, Next up, Asks, then the lanes), right column (Movement, Goals, Inbox, Close);
  - expanded: Day/Next/Asks | lanes | side.
1. Top bar: crest 14 (opens You), "Today · Thursday, 1 October", Asks bell with an ink count.
2. Day ledger: seal plus streak, freeze crystals, the Full-day strip (Musts / Quest / Life rings, "+0.5 MP when it settles", the repair note), life XP · review pts · planned vs capacity. The MiniLedger docks on scroll.
3. Next up: the priority is the review quest (15 cards of N due), then the oldest open Must, then a workout to rate. Eyebrow, display-m title, segment strip, focus line, boss-ready chip, one primary button (R).
4. Asks: Record yesterday / Owed / Boss ready / Rate your run / Weekly review (Mon). WelcomeBack, YesterdaySettled and RepairAsk replace them when relevant.
5. Must lane (diamond ticks) with make-up cards inline or one collapsed summary; then the Planned lane, the Habits lane (rung in meta), and the collapsed "Owed: n · −x" row.
6. Movement card (M4: 64 ring, strength pips, Rate chip), hidden until M4 data exists.
7. Goals with the MP payout stated ("pays ⬡ 6 × progress from 70%").
8. Inbox and Anytime as collapsed rows.
9. Close the day end-cap, prominent after 18:00.

TODAY SHEETS
- Receipt (diverging bars).
- Record yesterday: Did/Didn't per open item, "Use a freeze for Wed" switch, "Settle Wednesday now" / "it settles on its own at Fri 04:00".
- Close the day: Tomorrow/Anytime/Drop per open todo, "Do the minimum" for open musts, Roll all, a one-line note and a mood of 1–5 (never graded), a Rest tomorrow switch.
- Capture: centred 560 panel from 600. 52 px input, parse chips (clock date, Must, track, #tag, ≈ price; all quiet), [Add to Today] [To Inbox]. Also c, Alt+N, the share target and the manifest shortcut.
- Plan time off: rest tomorrow, sick today (1 per 14 days), vacation from tomorrow (≤ 30 days, never backdated).
- Inbox.
- Asks.
- /today/rules restyled as "How a day is judged".

WEEKLY REVIEW (/today/week, M2) — final-week.html
- Runner with five skippable steps: Last week (kept/not per track with reasons, days shown up, freezes used, velocity), Inbox to zero, Goals check-in, Owed (make up / leave / accept a loss when enabled and ≥ 14 days), Next week (rest days, capacity).
- Ends on the WEEK CARD, which IS the T2 Seal: "3 of 4 tracks kept", track chips, "+4.5 MP (1.5 per kept track)", the Duty kept-week streak.

STUDY › REVIEW (/review) — final-review.html
- Hub: quest ring 0/15 with "17 due · about 9 minutes · pays review points, 0 life XP", Start (Enter), 40 px field chips, a loadout strip (links to You › Loadout), ready encounters (the boss card "win with 7 correct · a Seal and a boon you choose"; the rest collapse to one line), Recent ideas.
- Runner (?view=run in the URL, so Back exits; Escape asks to confirm "3 answered are saved and paid"):
  - exit, a 6-segment strip (hatched misses), Card n of 6 · Quest n of 15, the pts tally;
  - combo chain (10 pts diamonds, "×1.15 on this card");
  - context line (domain · field, idea level);
  - question card (display 20/27, type chip, last seen);
  - 56 px options with 1–4 keycaps anchored low.
- Result panel:
  - correct: true fact, the +N token, MP, the formula, domain meter old → new, in-panel Seal on a domain level, Next card with a 1.8 s hairline;
  - miss: "Not this time", "Back tomorrow · strike 1 of 3 · nothing else is taken", You chose / The answer / why, "The combo resets to 0. Points already paid stay paid", and it waits.
- Boss run: the same runner with "need 7 of 9 · 3 so far" instead of the combo.
- Recap (the session receipt): headline, pts, recalled, best combo; the quest ring closing to CLEARED; What moved (Seal rows, MP minted, character %, Day kept); True facts; Back tomorrow (links to /library/[id]); a per-card receipt table; the next batch; Back to Today.

STUDY › LIBRARY
- Browse: search plus filter chips in the URL, field tiles (tier ornament = material stripe), idea rows (Mastered chip).
- Idea detail (/library/[id]; a sheet on compact): question, answer, level ring, history strip, next due, Edit, and a quiet Delete.

STUDY › NEW IDEA (/add)
- Form: Question first, then Answer, with Field and Domain suggested (type and collection under Advanced).
- The "Checked first" novelty verdict shows Yours vs Already have with a similarity meter.
- Sticky Check first / Create. The Created banner shows "+3.4 review pts · focus +32%"; a new domain is a T1.

STUDY › FIELDS & DOMAINS (/structure): one name. Create and composition editor. Re-attribute and the Danger zone move to Settings › Data.

YOU › SHEET (/you) — final-you.html
- Hero:
  - Crest 96 with track edges, "Adept", epithet, "Character level 14 · Mind leads".
  - "86% to level 15" meter with the next title's crest and blurb.
  - Purse: MP 1,346 · life MP this week 5.5/8 · emblems 38/749.
- Ready-emblem callout (gold border, orbit coin, View).
- Life tracks (M5):
  - Duty, Craft, Body, Care and Knowledge, each with its sigil, level, and meter (ink banked + this week's gain in xp, pts for Knowledge).
  - The 8-week pips: kept (green diamond), held (hatch), missed (outline).
  - The honest depth line ("depth cap 7 · 13 more kept weeks raise it").
- Attributes: a 13-gon radar with a dashed 7-days-ago ghost, attribute polygon markers in their hues, 12 px labels, and the top 3 as a list with sources ("Life · Body +2.8").
- Goals and mastery: the goal ladder with MP stated, ideas mastered, field tiers, rungs and PRs.

YOU › SKILLS (/skills, /skills/[attribute])
- Path chip row (13, polygon glyph in hue, ready dot).
- Path header on its sky (glyph, "11 of 57 unlocked · 1 ready", MP to spend).
- Rank ladder Ultimate → Pure, each rank with its material dot and "n of m". 56 px coins show owned, locked with %, or Ready with orbit.
- Detail sheet (drawer from 600): rank-material chip, 88 coin, grants, requirement meters (kept when met), cost with the balance before and after, a two-step gold Unlock → Confirm, then the Ascension.
- The SkillTree graph stays one tap away, with keyboard-focusable nodes.

YOU › LOADOUT: 5×2 grid and the resonance line; equip is a glint.

YOU › MOMENTS: every T2 and T3 by month with its art. Replay only on T3.

YOU › STATS (/you/stats)
- Track levels over 12 weeks: ink lines with dash patterns and direct labels.
- Kept-weeks heatmap (kept, hatched held, outline).
- Distance to next title: a ring with the change since the last visit.
- Review queue as a stacked bar (due ink, struggling hatched owed, learned kept).
- Field levels, question types, level distribution and nearest thresholds on ChartCard tokens.
- The dividend is a line item.

SETTINGS (/settings, from You)
- Feedback: Theme (Vellum after launch), Motion, Sound, Haptics, After a correct answer.
- Days: capacity, rest weekdays, vacation, Accept a loss.
- Study: field focus.
- Health sync (M4).
- Data: re-attribute and resets, with typed-phrase confirm.
- How XP works.

TRAIN (/train, M4) — final-train.html
- Board: 128 Move ring (95/150, pro-rated for rest days; closes to kept with a glint; the second lap to 300 shows and pays nothing), strength pips, per-day bars (rest hatched).
- Sessions with a paid pill and receipt, and an optional RPE chip row (Easy 3 / Moderate 5 / Hard 7 / All out 10, capped by heart rate) from 30 min to 48 h after the session.
- Gauges: Fitness (CTL), Fatigue (ATL), and Form on a diverging bar with the non-medical copy, OR a dashed "Calibrating 18 of 28 days" ring.
- PRs (sensor-only; bronze medallion; a T2 on first sight).
- History, and Import & sync as secondary tabs.
- The Today Movement card mirrors the ring.

CAPTURE EVERYWHERE (M3): the share target lands on /today?captured=<id>, which opens the Inbox sheet with the item highlighted and Undo. The Win+Shift+Q and API captures show the same toast.

CHARACTER (M5): the crest carries the level everywhere. A band change is a T3 re-forge (final-you.html?play=level15); an in-band level is a T2 (?play=level16).

/dev/style — final-system.html
- Live token table with WCAG ratios per surface, and the CVD ΔE table, in both themes.
- Type roles, every primitive, and the reward playground (T0–T3).
- Motion tokens, the celebration log, and the art previews moved from /skills/preview.

## Build lanes

### L0-foundation

**Owns.** src/app/globals.css; src/app/styles/** (new: tokens.css, base.css, components.css, effects.css); tailwind.config.mts (delete); src/app/layout.tsx; src/app/loading.tsx; src/app/error.tsx; src/app/not-found.tsx; src/app/manifest.ts (colours only); src/components/ui/** (new); src/components/shell/** (new: AppShell, TopBar, TabBar, Rail, Sidebar, MiniLedger, AsksBell, AsksSheet); src/components/AppNav.tsx, NavTitleBadge.tsx, NavTodayLink.tsx, NavReviewLink.tsx, Logo.tsx, PowerSaver.tsx, StreakProvider.tsx; src/components/notifications/**; src/lib/notifications.ts (feed shape only); src/lib/motion.ts (new); src/lib/celebrate.ts (new, client queue + T0/T1 helpers); src/lib/celebration-types.ts (new, frozen contract); src/lib/materials.ts (new); src/lib/shell-data.ts (new, one cached query); src/app/dev/style/** except dev/style/art/**; scripts/contrast-check.ts, scripts/ui-audit.mjs, scripts/codemod-type-roles.ts (new). Held TEMPORARILY for the single layer PR, then handed to L4 (arcane, atmosphere, bar-charge, cataclysm*, equip-attach, field-tier, insignia, powerbar, skies), L1 (capture.css, today.css) and L2: every hand-written CSS file's first line (@layer statement + wrapper).

**Depends on.** nothing (must merge before L1–L5 start restyling; L1–L5 may start reading and planning in parallel)

**Work.** Lands first, as five small PRs in this order, each shippable. Read node_modules/next/dist/docs/01-app/01-getting-started/11-css.md, 13-fonts.md, 03-api-reference/02-components/font.md, 03-file-conventions/loading.md and 02-guides/instant-navigation.md before writing code.

(1) Tokens and aliases.
- Add tokens.css in @layer theme.
- Add the legacy alias block exactly as specified (--ink-3 → --ink-2, --green → --kept, --amber → --ink-0, and so on).
- Add Tailwind v4 @theme inline and delete @config and tailwind.config.mts.
- Add scripts/contrast-check.ts (text ≥ 4.5 on page/card/raised/overlay/sunken, controls and marks ≥ 3, xp↔pts ≥ 8 protan/deutan) and run it in CI.

(2) Cascade layers.
- Put `@layer theme, base, components, art, effects, utilities;` above @import "tailwindcss" and as the first line of EVERY hand-written CSS file.
- Wrap globals in base/components and the art files in art/effects.
- Delete the :root/html specificity patches and !important rules. Remove .card content-visibility:auto (it becomes the opt-in .cv-auto for long lists).
- Verify with `next build`, then a visual diff of the art previews before and after.
- Move skies.css and cataclysm*.css imports out of layout.tsx; L4 re-imports them from the segment and the ceremony.

(3) Fonts and type.
- next/font: Inter (unchanged), Fraunces roman with axes ['opsz'], Fraunces italic with preload:false, JetBrains Mono with preload:false.
- Add the .t-* role classes and retire the global .mono !important.
- Write the ts-morph codemod that rewrites {fontSize, color: var(--ink-N)} inline objects to roles and hand-written rgba literals to tokens. Run it only on L0 files; the page lanes run it on theirs.

(4) Motion and prefs.
- An inline pre-paint script sets html[data-theme] and html[data-motion] from localStorage, defaulting to prefers-reduced-motion.
- MotionPrefs provider plus useMotionPref(); src/lib/motion.ts (play, fly, burst, countTo, roll, bump).
- PowerSaver writes html[data-power]. Delete the global fade-up/stagger, the btn-primary sheen, the arcane conic and the loadout loops.
- Add celebrate.ts: the queue, mark and chime helpers, the live region and the event log. Define CelebrationEvent types and stub server signatures for L3.

(5) Primitives and shell.
- Build the ui/* kit per the component spec and /dev/style.
- AppShell: chrome by media query (tab bar < 600, rail 600–1279, sidebar ≥ 1280). <main class="main"> is the only container (container: main / inline-size); fixed layers are portalled to body.
- Opaque bars, --topbar-h/--tabbar-h and one ToastDock.
- Retire CaptureFab, the header Today N / Review N buttons, the scrolling link strip and the floating NotificationBubble (it becomes the Asks bell). Take LoadoutBarSlot out of layout.tsx bottomSlot.
- Shell data (level, band, badges, asks, debt flag) comes from ONE cached query, rendered via the documented prop-slot pattern, so the root layout never awaits uncached data and loading.tsx fallbacks show.
- Add scripts/ui-audit.mjs: headless at 344, 375, 932 and 1440 on every route; fails on horizontal overflow, interactive targets < 40 (primary < 44), text < 12 px, or console errors.

### L1-today

**Owns.** src/app/today/** (page.tsx, loading.tsx, rules/**, week/** new); src/components/today/** (all, including today.css → CSS module or @layer components); src/components/capture/** (QuickCapture, CaptureChips, DraftPrefill, capture-ui.ts, layers.ts; CaptureFab.tsx deleted); src/app/capture.css; src/components/home/StreakDisplay.tsx; src/lib/full-day.ts (new, pure); src/lib/today-board.ts; src/app/actions/tasks.ts and src/app/actions/capture.ts (return shapes only)

**Depends on.** L0-foundation

**Work.** Restyle M1 on the kit. Keep the optimistic ticks, 10 s undo, receipts and the capture parser exactly as they behave now.

Build:
- DayLedger (DaySeal, freeze crystals, Full-day strip of three PromiseRings from src/lib/full-day.ts, computed read-only from existing data: musts done or excused, quest ≥ 15 or nothing due, and ≥ 1 life task or workout).
- NextUp (priority: quest, then oldest Must, then workout to rate), AskCard, the lanes with KEPT stamps, Row/Tick/PricePill, and Receipt with diverging bars.
- GoalsStrip with the MP stated, the Inbox and Anytime rows, and the Close-the-day end-cap.
- The board's one-DOM, three-order layout (display:contents wrappers plus @container main at 640 and 1100).

Wire T0 (token flight to the ledger or MiniLedger) and T1 (first deed, ring close, lane kept, Full day, nothing owed) through L0's celebrate.ts.

Build the M2-ready presentational components with fixtures in /dev/style, so the M2 lanes only wire data:
- MakeUpCard;
- OwedSummary (collapsed stack) and OwedRow;
- RecordYesterdaySheet (Did/Didn't, freeze switch, Settle now);
- CloseDaySheet;
- RestControls sheet;
- WelcomeBack;
- YesterdaySettled;
- RepairAsk;
- the /today/week five-step runner shell and WeekCard.

The capture sheet uses the centred 560 variant from 600 and one-dialect quiet parse chips. Keep /today?capture=task working.

Run the codemod on the owned files. The loading.tsx skeleton matches the board geometry.

### L2-review

**Owns.** src/app/review/**; src/app/workspace/** (redirect stays); src/components/workspace/** (SessionCard, WorkspaceView, SessionComplete, SessionSummary, BossPanel, BossResult, BossSigil, FormatAnswer); src/app/actions/review.ts; src/app/actions/bosses.ts; src/app/actions/difficulty.ts; src/lib/xp.ts; src/lib/srs.ts; src/lib/review-facts.ts (new); src/lib/bosses.ts; src/lib/boons.ts; src/lib/boon-meta.ts; src/lib/debuffs.ts; src/lib/debuff-meta.ts

**Depends on.** L0-foundation; L3-celebrate server contract (detectCelebrations signature, stubbed by L0)

**Work.** Server:
- xp.ts rollRewardVariance returns factor 1.0; delete VARIANCE_STRONG_AT and the band; srs.ts stops rolling.
- SubmitReviewResult returns: expected answer and explanation, the multiplier paid (with cap modifiers), domain before and after (value, level, max), field before and after, MP minted, questProgress, streakSecured, and the trueFact line from review-facts.ts (gap, longest gap, first clean recall after a miss, closest to mastery, rescued overdue).
- Boss damage only on correct answers, plus the needX/ofY fields. Spoils become a chosen boon.
- Call L3's detectCelebrations(before, after) from the action.
- Re-run balance:horizon and skills:stats.

Client:
- The hub (quest ring, Start with Enter, field chips, loadout strip, ready encounters, Recent).
- The focus runner with its mode in the URL (?view=run, Back exits, Escape asks to confirm), the combo chain showing the multiplier paid, the question card, and options with 1–4 keys.
- The result panel: bottom sheet on compact, floating 600 card from 600 px. Correct: fact, +N token flight to the tally, formula, meter old → new, in-panel Seal, 1.8 s hairline. Miss: waits, answer and why, strike count, combo drains at 55 ms per link. Delete AFFIRMATIONS.
- The boss variant.
- The recap receipt: quest ring to CLEARED (T1 fires here), What moved, True facts, Back tomorrow linking to /library/[id], the per-card receipt, "Life XP: 0".

framer-motion must not be in this route's chunk (SessionComplete/SessionSummary move to the gateway). Run the codemod on the owned files.

### L3-celebrate

**Owns.** prisma/schema.prisma and prisma/migrations/<ts>_celebrations/** (CelebrationEvent{id, userId, tier, kind, dedupeKey @unique, facts Json, createdAt, shownAt?}; UserPrefs{motion, sound, haptics, theme, autoAdvance}); src/lib/celebrations.ts (server: snapshot diff detectors + persistence); src/app/actions/celebrations.ts (listPending, ack, listMoments, savePrefs); src/components/celebrate/** (CelebrationHost, SealCard, AscensionCurtain, WhatMoved); src/lib/snapshot.ts; scripts/celebration-check.ts

**Depends on.** L0-foundation (types, queue, primitives). Lands its server contract early so L2 and L4 can call it.

**Work.** Detectors diff before and after snapshots, each writing an idempotent dedupeKey (e.g. 'title:Practitioner', 'band:bronze', 'domain:<id>:7', 'streak:30', 'rung:<tpl>:Established', 'mastered:<idea>', 'week:<track>:<week>', 'pr:<metric>:<id>', 'goal:<id>', 'unlock:<code>'). They cover: title band, material band, character level, field, domain and track level, field tier, habit rung, streak milestone, mastered, newly unlockable, goal finished, kept week, PR, boss won.

The tier map is exactly the reward ladder. A Seal carries the exact points and What moved; nothing is random.

CelebrationHost:
- reads pending events on load and after each action;
- plays T2 as SealCard at the dock (or inside a target) and T3 as AscensionCurtain (opaque .theme-night, art and backdrop passed in as props by the caller, Skip from frame 1, still tableau);
- acks shownAt so nothing replays on the second device;
- merges lower tiers into an open run's recap.

Prefs are persisted server-side, replacing L0's localStorage fallback (the pre-paint script keeps a cookie or localStorage mirror).

Run the migration against the xtnl-idea Supabase project ONLY (not XTNL_thesis): check the ref first, dry-run, and the lead confirms. celebration-check covers: idempotency, one play across two sessions, the queue order, and that no detector ever fires on page load without a diff.

### L4-you

**Owns.** src/app/you/** (new: page.tsx sheet, loadout/, moments/, stats/); src/app/overview/** (redirect); src/app/dashboard/** (redirect); src/app/skills/** (including preview/**, which moves to src/app/dev/style/art/**, owned here); src/components/skills/**; src/components/dashboard/**; src/components/home/** except StreakDisplay.tsx and FieldFocusPanel.tsx; src/lib/palette.ts; src/lib/skill-visuals.ts (add RANK_MATERIAL only; RANK_META colours untouched); src/lib/resonance-visuals.ts; src/lib/cataclysm-variants.ts; src/lib/sky.ts; src/lib/combo-discovery.ts; src/app/actions/skills.ts; src/app/actions/capital.ts; art CSS after L0's layer PR: src/app/arcane.css, atmosphere.css, bar-charge.css, cataclysm.css, cataclysm-extra.css, equip-attach.css, field-tier.css, insignia.css, powerbar.css, skies.css

**Depends on.** L0-foundation; L3-celebrate (AscensionCurtain, listMoments)

**Work.** Sheet:
- Hero with Crest 96 plus track edges, title and epithet, the level meter to the next title with its crest and blurb, and the purse.
- Ready callout.
- Life tracks: rendered from the M5 CharacterPanel data when present, else the Knowledge row only. Meters are ink banked plus the week's gain in the currency; 8-week pips; the honest depth line.
- Radar with the 7-day ghost, attribute polygon markers and 12 px labels, plus the top-3 list with sources.
- Goals and mastery.

Skills:
- Path chips; the path header on its sky (skies.css imported from this segment only, scoped to .sky-scope).
- Rank ladder with EmblemCoin: SkillLogo animated={false} inside a material rim, depth notches, and the locked, ready and owned states.
- The detail sheet or drawer with the two-step gold unlock.
- The unlock action returns the event. It calls AscensionCurtain with the emblem art and the Cataclysm variant as backdrop (lazy-loaded cataclysm CSS and component; FIRST Apex or Ultimate unlock only; still tableau).
- The SkillTree graph gets focusable nodes; its detail becomes a sheet below 1024.
- The codex gets a real button.

Equip is T0: remove EquipPulse escalation, BarCharge and the page surge from equip, and move the Cataclysm trigger from LoadoutBar.attach to UnlockButton.

Loadout grid.

Moments shelf from listMoments (replay T3).

Stats: merge Overview's duplicated tiles and tables; ChartCard and palette.ts on tokens; track levels over time with ink dashes and direct labels; kept-weeks heatmap; distance to next title animating from the last visit; the dividend as a line item.

Migrate /skills/preview/* into /dev/style/art behind the dev flag.

framer-motion only in Stats charts, lazy-loaded. Run the codemod on the owned files.

### L5-study-side-and-settings

**Owns.** src/app/library/** (+ new [id]/page.tsx); src/components/library/**; src/app/add/**; src/components/AddIdeaForm.tsx; src/components/NoveltyVerdictView.tsx; src/components/WordComplete.tsx; src/components/useAutocorrect.ts; src/components/math/**; src/app/taxonomy/** (redirect) and src/app/structure/** (new); src/components/taxonomy/**; src/app/settings/** (new); src/components/settings/** (new); src/components/home/FieldFocusPanel.tsx; src/app/actions/ideas.ts, taxonomy.ts, reattribute.ts, reset.ts, focus.ts

**Depends on.** L0-foundation; L3-celebrate (savePrefs) for Settings persistence

**Work.** Library (Browse):
- Search and filter families in the URL, a filter sheet on compact, a side detail from medium.
- Field tiles keep their tier ornament, mapped to the material stripe.
- Idea rows carry the Mastered chip.
- New /library/[id]: question, answer, level ring, history strip, next due, edit, quiet delete. Review results and recap rows link here.

New idea (Form):
- Question first, then Field and Domain suggestions; Advanced holds type and collection.
- Sticky Check first / Create, the Yours vs Already have verdict with a similarity meter.
- The Created banner with +pts and focus; a new domain is a T1 via celebrate.

Structure: rename to 'Fields & Domains' everywhere; create and composition editor; move the Danger zone and Re-attribute into Settings › Data.

Settings: Feedback (Theme, Motion, Sound, Haptics, After a correct answer; saving via L3's savePrefs), Days (capacity, rest weekdays, vacation, Accept a loss), Study (Field focus), Health sync placeholder, Data, How XP works.

The math editors are restyled only; the runner consumes them. Run the codemod on the owned files.

## Acceptance

GATES (all automated in CI unless marked manual)

1. CONTRAST (scripts/contrast-check.ts)
- Every text token (ink-0/1/2, kept, owed, held, and the Night currencies) is ≥ 4.5:1 on page, card, raised, overlay and sunken.
- --ink-mute, --line-ctl and the Vellum --mp are ≥ 3:1.
- --xp vs --pts is ≥ 8 ΔE under protan and deutan (Night 27.0 / 29.8).
- The gold button label is ≥ 4.5 at its darkest stop (5.88).
- Vellum passes the same checks before it ships.

2. LEGACY CLEANUP
- After PR 1, the 141 + 18 former --ink-3 text uses render at ≥ 7.2:1 with no per-file change.
- By the end, grep finds 0 uses of var(--ink-3|green|amber|red|blue|line-act|nav-h|base|sub|lift), and the alias block is deleted.
- Inline style objects that set fontSize drop from 313 to ≤ 20 (dynamic values only).

3. UI AUDIT (scripts/ui-audit.mjs, headless, REAL viewports at 344, 375, 932 and 1440, not a device frame)
- On every route and key state (Today morning / away / broken / settled; runner question / correct / miss / seal; recap; library; add; you sheet / skills / settings / stats; train; week; /dev/style):
  - no horizontal overflow;
  - every interactive target ≥ 40×40, primary actions and ticks ≥ 44;
  - no rendered text < 12 px;
  - 0 console errors.
- The final mockups already pass this audit (42 page and width combinations).

4. MOTION
- With prefers-reduced-motion, the first paint has html[data-motion="still"] (no flash).
- In Still, every celebration's final DOM text equals the Full-motion settled text, and nothing has opacity 0.
- Correct answers never auto-advance in Still.
- On /today and the runner at rest, document.getAnimations() contains no infinite animation. The only infinite animations anywhere are the ready orbit and the ceremony rays, both paused under Calm, Still and power-save.
- Only transform, opacity and stroke-dashoffset are animated (review checklist plus a stylelint rule on @keyframes).

5. PERFORMANCE
- `next build`: no framer-motion in the /today or /review route chunks; skies.css and cataclysm*.css are not in the global CSS chunk.
- Sticky bars have no backdrop-filter.
- Ceremonies use ≤ 26 particles.
- A loading.tsx fallback appears on client navigation (the root layout awaits no uncached data outside the prop-slot pattern).
- CSS order is verified in the production build (dev order can differ).

6. LAYERS
- Every hand-written CSS file starts with the @layer order statement.
- A before/after visual diff of /dev/style/art (arcane, skies, cataclysm, insignia, powerbar) is recorded in the layer PR.

7. REWARD HONESTY
- xp.ts pays factor 1.0; VARIANCE_STRONG_AT, 'Strong roll' and AFFIRMATIONS no longer exist.
- The combo label equals the multiplier used in the payout (unit test with cap modifiers).
- The boss bar changes only on correct answers.
- Life XP and review points are never summed in any UI.
- There is no daily life-XP bar.
- Every T2 and T3 shows an exact number and at least one 'What moved' or cause line.

8. PERSISTENCE (celebration-check)
- A T3 acknowledged in session A does not replay in session B.
- Re-running detectors on unchanged snapshots creates 0 events.
- Nothing celebrates on page load without a diff.
- Migrations ran against xtnl-idea only.

9. DAILY LOOP (manual on the Fold at 344 and 932, plus desktop)
- The first tick flies to life XP and lights the seal (Day kept).
- Three musts close the Musts ring and stamp KEPT.
- Quest cleared in the recap closes the Quest ring.
- All three rings give a FULL DAY stamp and '+0.5 MP when it settles'.
- A make-up turns the card kept and says 'Nothing owed'.
- A 4-day absence shows one WelcomeBack card, one collapsed owed summary and a quest capped at 15.
- A broken streak shows best-kept and the repair path.

10. URLS: /today, /today?capture=task, /review, /add and /workspace behave as before; the manifest changes only colours; the TWA opens Today.

11. CHECK SUITES: life:check, board-check, streak-check, skills:stats and balance:horizon pass; next build and lint pass.

## Visual reference

All final references are self-contained HTML. Each page's Demo button opens its states and Feedback settings; ?demo=0 hides the button. The pages link to each other through the real shell (Today · Study · + · Train · You), so they work as one prototype.

C:/Users/Thanc/AppData/Local/Temp/claude/C--Users-Thanc-OneDrive-Desktop-XTNL-idea/dd3bd260-2baf-4833-82dd-c7e980a42ad3/scratchpad/redesign/
- final-today.html: the Board.
  - States: ?state=morning|settled|broken|away
  - Plays: ?play=deed|musts|full|streak30|rung|goal
  - Sheets: ?sheet=receipt|yesterday|close|capture|asks|rest|inbox|rules
  - ?quest=15
- final-review.html: Study.
  - ?view=run, &boss=1, &at=correct|seal|miss
  - ?view=recap
  - ?view=library, &idea=1
  - ?view=add
- final-you.html: You.
  - ?tab=sheet|skills|loadout|moments|stats|settings
  - ?detail=1
  - ?play=unlock|level15|level16|equip
- final-train.html: M4.
  - ?play=close|pr
  - ?state=calibrating
- final-week.html: the M2 weekly review runner. ?step=1..6, where step 6 is the week card.
- final-system.html: /dev/style, with live contrast and CVD tables, every primitive, and the T0–T3 playground.
- Every page also takes ?theme=night|vellum and ?motion=full|calm|still.

Sources (build with `node final-src/build.mjs`):
- final-src/tokens.css: the exact tokens.
- final-src/base.css: primitives and shell.
- final-src/base.js: the motion gateway, celebration queue, crest, medallion and emblem art, and the shell.
- final-src/sprite.svg
- one per-page .html each
- final-src/lab.mjs: the colour and CVD lab.
- final-src/audit.js: the size and overflow audit.
- final-src/shoot.mjs: the CDP screenshot driver.

Verified screenshots (real 344, 375, 932 and 1440 viewports, Night and Vellum, Full and Still, mid-flight and settled): scratchpad/redesign/final-shots/*.png. For example today-375, today-932, today-1440, today-full-still, today-away, today-seal, today-goal-still, rv-correct, rv-seal, rv-miss, rv-recap, you-sheet-932, you-skills-375, you-unlock-still, you-level15, train-932-closed, week-card, system-vellum-932.

Where a detail is not in the final files, fall back to arcane-rpg-*.html (Direction A) for the art and ceremony vocabulary. Do NOT follow calm-performance-* or bold-playful-* for colours or emblem styling.

(The final-*.html mockups are copied to docs/life-plan/redesign/.)
