# Redesign contracts (L0-foundation)

What the page lanes build on. Everything below is **frozen**: a change is a lead decision, not a lane edit. Each file carries the same contract in its header comment. The spec is `redesign.md`; the look is `redesign/final-*.html`.

## 1. CSS: layers, tokens, classes

- **Layer order**: `@layer theme, base, components, art, effects, utilities;` is the first line of every hand-written CSS file (checked by `scripts/shell-check.ts`). Put component CSS in `@layer components { … }`, persistent decoration in `art`, one-shot reward motion in `effects`. Tailwind utilities are always last, so a utility class beats any rule you write.
- **Tokens** (`src/app/styles/tokens.css`): surfaces `--canvas --page --sunken --card --raised --overlay --bar --scrim --curtain --face`; ink `--ink-0 --ink-1 --ink-2` (text) and `--ink-mute` (non-text only); lines `--line-1 --line-2 --line-ctl --hi`; signal `--kept --owed --held` (+ `--on-*`, `--hatch`); currency `--xp --pts --mp` (+ `--on-*`); light `--light --light-glow`; materials `--{iron,bronze,silver,gold,astral}-{a,m,b}`; `--focus --shadow-pop`; fonts `--font-ui --font-display --font-display-italic --font-mono`; space `--s-1…--s-11`; radii `--r-chip 8 --r-ctl 12 --r-card 16 --r-sheet 24 --r-pill`; `--hit 44 --hit-min 40`; chrome `--topbar-h --tabbar-h --rail-w --sidebar-w`; motion `--t-press … --t-ceremony`, `--ease-out --ease-inout --ease-stamp`, `--ambient-play`; layers `--z-sky --z-bar 20 --z-toast 30 --z-sheet 50 --z-ceremony 70 --z-fx 80`. Night is the default; `html[data-theme="vellum"]` is token-complete (ships after launch); `.theme-night` re-scopes Night (the curtain).
- **Tailwind v4 utilities** (`globals.css @theme`): `bg-page bg-card bg-raised bg-overlay bg-sunken`, `text-ink-0/1/2`, `text-ink-mute`, `text-kept/owed/held/xp/pts/mp`, `border-line-1/2/ctl`, `font-sans` (ui) `font-display` `font-mono`, `rounded-chip/ctl/card/sheet`, `text-meta` `text-eyebrow`, `ease-out ease-inout ease-stamp`. `tailwind.config.mts` is gone.
- **Legacy aliases** (bottom of `tokens.css`, and legacy classes in `styles/legacy.css`): only the ones a remaining user reads are left: `--ink-3 → --ink-2`, `--line → --line-1`, `--green → --kept`, `--green-10`, `--nav-h` (only the retired AppNav, kept for life-day-check, still reads them), plus `--rank-*` (unchanged values). The rest reached 0 uses and are gone; shell-check keeps them gone. Classes `.site-container .label-xs .section-eyebrow .panel-title .panel-sub .mono .input .btn-ghost .slot .loadout-bar .res-chip`, and the emblem art loops. Stop using them in files you restyle; each is deleted when grep reaches 0.
- **Type roles** (base layer): `.t-display-xl .t-display-l .t-display-m .t-question .t-display-s .t-numeral(-s/-l) .t-epithet .t-body-l .t-body .t-meta .t-eyebrow .t-mono .t-num/.num .ink-0/1/2`, and `.t-error` (an action's error line: ink, 600, an ink diamond; use with `role="alert"`, never `--owed`, which names debt). Floor 12 px; sentence case except eyebrows and lane labels. Replace inline `{fontSize, color}` objects with roles (codemod below).
- **Kit classes** you may use directly in your own markup (all in `components.css`/`effects.css`): `.card .pad .pad-l .sunk .divide .cv-auto`, `.btn .btn-{primary,secondary,quiet,gold,danger} .lg .btn-block .kbd .icon-btn .link`, `.badge(.owed)`, `.chip(.kept/.owed/.held/.ready/.btn-chip)`, `.price .pill(.paid)`, `.tick` (its circle is `.tick-ring`), `.meter`, `.segs`, `.pring`, `.crest .coin .medal`, `.tabs .tab-s .segc .switch-hit .switch`, `.sec-h .lane-mark .ph`, `.collapsed .ask-dot(.owed/.kept/.held/.quiet)`, receipt `.rc-*` `.dbar`, `.skel .skel-card`, `.page(.narrow)`, overlays `.scrim .sheet(.center) .dock .toast .seal-card(.seal-inline) .what .curtain .cur-* .grants`, effects `.sweep(.go) .stamp(.landing) .pring.glinting .coin .orbit .fx-token .fx-mote .fx-floater`.
- **Never name a class like a Tailwind utility** (`block`, `inline`, `ring`, `grow`, `hidden`, `flex`, `grid`, `contents`, `collapse`, …): the class also gets the utility's declarations, and the utilities layer always wins (`.block` made full-width buttons display:block; `.ring` haloed every tick; `.inline` collapsed the in-panel Seal). Namespace it (`btn-block`, `tick-ring`, `seal-inline`, `rail-grow`). shell-check compiles every hand-written class through the real Tailwind and fails on a collision.
- **Container queries**: `<main class="main">` is the only container (`@container main (min-width: 640px)` …). It is **opt-in per page** until every lane portals its fixed layers: add `cq-main` to your page root once no `position: fixed` element renders inside it (use `ui/Sheet` and the ToastDock, which portal to `<body>`). A fixed layer inside a container is positioned against the container, not the viewport.
- **Motion rule**: only `transform`, `opacity` and `stroke-dashoffset` animate (keyframes in every sheet, art included); no transition moves layout (`width`, `height`, `left`, `border-width`…); every infinite loop pauses on `--ambient-play`. Every rule's resting style is its final state (Still shows it with no motion). In the kit the only infinite loops are `.coin .orbit` (14 s) and `.curtain .rays` (90 s). No page-entrance fades or staggers. shell-check enforces all of it repo-wide.
- **Inputs are 16 px on phones** (base.css, `@layer base`). A component class that sizes an input below 16 px sits in `@layer components`, which outranks base, so it must repeat `@media (max-width: 599px) { .your-input { font-size: 16px } }` itself (shell-check).

## 2. TypeScript modules

| Import | What |
|---|---|
| `@/lib/celebration-types` | `CelebrationEvent {id, tier, kind, facts, what[], shownAt?, dedupeKey?, createdAt?}`, `CelebrationFacts`, `WhatMoved`, `AmountFact`, `CurrencyKind`, `CelebrationArt`, `KIND_TIER`, `T0_KINDS…T3_KINDS`, `makeEvent`, `honestyProblem`, `ProgressSnapshot`, `DetectCelebrations`, `CaptureSnapshot`, `FeedbackPrefs`, `parsePrefs`, `resolveMotion`, `autoAdvances`, `PREFS_STORAGE_KEY`, `DEFAULT_PREFS` |
| `@/lib/celebrate` (client) | `mark(opts)` T0 → Promise (resolves when the token lands), `chime(opts)` T1 (once per id per tab; `hasChimed(id)`), `enqueue(ev)` T2/T3, `celebrate(ev, visuals?)`, `registerPresenter(fn, {fallback?})`, `hasPresenter()`, `openRun(id)` / `closeRun()`, `ledgerTarget(kind)`, `announce(text)`, `sound(kind)`, `haptic(kind)`, `replay(ev)`, `getLog/subscribeLog/clearLog`, `signedFigure` |
| `@/lib/motion` | `motionLevel()`, `play(el, keyframes, {flourish?})`, `fly(from, to, {text, kind})`, `burst(x, y, n, seedId)`, `countTo(els, fromLastSeen, to)`, `roll(el, text)`, `bump(el)`, `floater`, `center`, `inViewport`, `seededRandom`, `hashSeed`, `formatFigure`, `DUR`, `EASE` |
| `@/lib/materials` | `Material`, `MATERIALS`, `crestMaterial(level, transcendent?)`, `emblemDepthMaterial(depth)`, `medallionMaterial(level)`, `RANK_MATERIAL`, `rankMaterial`, `MATERIAL_STOPS`, `materialGradientId`, `crestBandStarts` |
| `@/lib/shell-data` (server) | `loadShellData(userId)` — the one cached shell query. The title counts OWNED Ultimates (titles are earned once), like /you and the detectors. |
| `@/lib/notifications` | `NotificationFeed {notices, actionable, hasPenalty, counts: {due, overdue, today}}`, `Notice {…, action?}`. The Asks cards on Today read the same feed. |
| `@/lib/celebrations` (server, L3) | `captureSnapshot(userId, { scope, templateIds, fresh })` (take before and after with the same scope: `"review"`, `"boss"`, `"tick"`, `"settle"`), `detectCelebrations(before, after, { cause })` |
| `@/app/actions/celebrations` (L3) | `listPending()`, `ackCelebration(id)`, `ackCelebrations(ids)`, `listMoments()`, `savePrefs(patch)`, `loadPrefs()`; the host's background channel is `/api/celebrations` (GET pending and prefs, POST `{ack}`) |
| `@/components/celebrate/stage` (client, L3) | `present(ev, extras)` (`art`, `backdrop`, `fromEl`, `sky`, `primary`), `presentAll(evs)`, `stage(id, extras)`, `ackShown(evs)` (marks seen on the server: call it for any T2 shown outside the host), `refreshPending()` |
| `@/components/celebrate/*` (L3) | `CelebrationHost` (mounted once in the root layout), `<SealCard ev inline animate={false}/>` (acks itself when inline), `<WhatMoved rows/>`, `<AscensionCurtain/>`, `MomentArt` / `momentCaption` |

### T0 in practice (Today tick)

```ts
const paid = 3.6;
void mark({ kind: "tick", id: `tick:${instanceId}`, text: `Kept ${title} · paid ${paid} exactly`,
            amount: { kind: "xp", value: paid }, from: pillRef.current })   // lands on ledgerTarget("xp")
  .then(() => { countTo(xpCellRef.current, before, after); bump(xpGlyphRef.current); });
```
Mark the page's ledger cells `data-ledger-target="xp"` / `"pts"` and publish them with `useMiniLedger({ xp, pts }, watchRef)` (below) so the flight has a visible target when the cells scroll away.

### T1

```ts
chime({ kind: "ring-closed", id: `ring:musts:${dayKey}`, text: "Musts kept", sweepEl: tileRef.current, burstEl: ringRef.current, ringEl: ringRef.current });
```
Add `.stamp.landing` / `glint` on `<PromiseRing>` yourself; `chime` adds the sweep, the seeded burst of 8, sound, haptic, the live-region sentence and the log.

### T2 / T3

Server actions return L3's events; the client calls `enqueue(ev)` for each (or `celebrate(ev)`). The review runner wraps a session in `openRun(sessionId)` … `closeRun()` and renders the merged T2s in its recap / result panel (`.seal-card.inline`, no button). Every T2/T3 must pass `honestyProblem(ev) === null`.

## 3. Components

`src/components/ui/*` (import each by its file):

- `Button` (`variant`, `size`, `block` → `.btn-block`, `kbd`, `icon`, `href` → Link), `IconButton` (`icon`, `label` required). `buttonClass()` is the class list it renders.
- `Badge` (`count`, `tone: ink|owed`, `pinned`, `label`) — nothing at 0.
- `Chip` (`tone`, `icon`, `held`, `sigil`), `ChipButton` (`pressed`) — 40 px.
- `Amount` (`kind`, `value`, `sign`, `dp`, `label`).
- `PricePill` (`value`, `paid`, `kind`, `expanded`, `controls`, `subject`, `ref`).
- `Receipt` (`amount`, `kind`, `source`, `factors[{key,label,detail,mult}]`, `formula`, `note`, `version`, `howHref`) + `receipt-math` (`divergingBar`, `factorMoved`, `receiptTotal`).
- `Tick` (`shape: circle|diamond`, `state: open|done|minimum`, `label`) — role=checkbox.
- `Meter` (`value`, `from`, `gain{value,from,kind}`, `cap`, `thin`, `label`), `SegmentStrip` (`segs`, `tall`, `label`).
- `PromiseRing` (`value`, `target`, `size`, `label`, `closed`, `glint`, `dashed`, `lap`, `from`, `showCount`).
- `Crest` (`level`, `size`, `material`, `tracks`, `label`; the numeral grows to 12 px where the hex holds it and is left off below that, the 24 tab and 20 inline crests: `crestNumeralUnits`), `Medallion` (`material`, `numeral`, `size`), `EmblemCoin` (`rank`, `depth`, `state`, `size`, `percent`, children = the SkillLogo art with `animated={false}`).
- `Sheet` (`open`, `onClose`, `title`, `description`, `variant: auto|center`, `footer`) — portalled, focus-trapped, shared Escape stack.
- `ToastDock` (mounted by AppShell) + `toast-store`: `pushToast({title, body, action, holdMs, ring, key})`, `dismissToast`.
- `Tabs.tsx`: `TabLinks`, `Segmented`, `Switch`, `SectionHeader`, `PageActions`, `Skeleton`, `SkeletonCard` (also re-exported from `Segmented.tsx`, `Switch.tsx`, `SectionHeader.tsx`, `Skeleton.tsx`).
- `TypedConfirm` (`phrase`, `action`, `onConfirm(typed)`, `exact?`, `pending?`, `hint?`) — the danger confirm. Arms on a trimmed, case-insensitive match (exactly, capitals included, with `exact`), and hands back what was TYPED so the server checks the words itself; `phraseMatches(typed, phrase, exact)` is the rule.
- `MotionPrefs`: `useMotionPref()` → `{prefs, motion, setPref}`, `readPrefs`, `currentMotion`, `MotionPrefsProvider` (mounted).
- `useLastSeen(key, value)` — last-seen value for rings, meters and tickers (null on first render).
- `Icon`: `Icon` (`name`), `CurrencyGlyph` (`kind`), `Sigil` (`track`), `HeldGlyph` (`kind`), `IconSprite` (mounted). Unicode glyph icons are retired.
- `format`: `formatNumber`, `formatAmount` (+/− true minus), `approx`, `formatMultiplier`, `formatPercent`, `MINUS`.

`src/components/shell/*`:

- `AppShell` (root layout only): tab bar < 600, rail 600–1279, sidebar ≥ 1280; `TopBar` with the section tabs (medium), MiniLedger and Asks bell.
- `<ShellTitle eyebrow title/>` — override the top bar's title for a DATA-driven title only. A title known from the path belongs in `nav.titleFor` (/today's date, /you "Character", /library/<id> "Study · Idea", each /dev/style page): an override paints one title on the server and swaps after hydration (shell-check rejects a literal override that titleFor does not already give). In-page headers carry actions only (`PageActions`).
- `<FocusMode/>` — the runner's focus mode: the chrome steps aside from the first paint (pure CSS).
- `useMiniLedger({ xp, pts }, watchRef)` — Today's Day ledger publishes its figures and the element whose scrolling away docks the MiniLedger.
- `nav.ts`: `SECTIONS`, `sectionOf`, `activeSub`, `titleFor`, `longDate`, `DEV_STYLE_PAGES`.
- `openCaptureSheet()` (`capture-bridge.ts`) — opens QuickCapture via the `xtnl:capture` event.
- `shell-types.ts`: `ShellData`, `ShellCharacter`, `ShellAsk`, `levelCaption`, `crestLabel`, `characterLevelOf`, `asksFromNotices` (the rows that ask, then the effects in play), `asksOfYou`, `askCount` (the bell counts exactly the asking rows), `toneOf` (owed only for a penalty in effect, held for a boon, kept only for the quota met, ink for everything that asks), `EFFECTS_GROUP`.

## 4. Routes

The shell links `/today`, `/today/week`, `/today/rules`, `/review`, `/library`, `/add`, `/structure`, `/train`, `/you`, `/skills`, `/you/loadout`, `/you/moments`, `/you/stats`, `/settings`. `/train` is an honest placeholder (no lane owns it until M4).

Old and bare URLs are real redirects, answered before any render (never a page-level `redirect()`, which under the root loading.tsx can stream as a meta refresh): `next.config.ts redirects()` sends `/` → `/today` (307), `/workspace` → `/review` (308) and `/taxonomy` → `/structure` (308); `/overview`, `/dashboard` and `/skills/preview/*` are 308 route handlers (L4).

`/dev/style` is gated (dev, or `XTNL_DEV_STYLE=1`) per request: `dev/style/layout.tsx` awaits `connection()` before the gate, so a runtime env var opens it, and renders one strip linking every page (`nav.DEV_STYLE_PAGES`). The lane fixture routes: `/dev/style/today` (L1: MakeUpCard, OwedSummary, RecordYesterdaySheet, CloseDaySheet, RestControls, WelcomeBack, YesterdaySettled, RepairAsk, week runner, WeekCard), `/dev/style/review?state=…` (L2), `/dev/style/celebrate` (L3), `/dev/style/art` (L4), `/dev/style/settings` (L5's M2-ready Days controls).

## 5. Scripts

- `npm run ui:check` — every pure UI check in one chain: `ui:shell`, `ui:contrast`, `review:check`, `celebrate:check`, `you:check`, `ui:study` (each also runs alone). `life:check` stays its own chain (life-day-check asserts its exact text).
- `npm run ui:contrast` (`scripts/contrast-check.ts [--strict-vellum]`) — gate 1 from tokens.css, plus the pairs the kit paints: chip text on its own wash, ink on a paid pill, ink on `--bar`, `--light` as a mark.
- `npm run ui:shell` (`scripts/shell-check.ts`) — nav and titles, pre-paint parity, materials, the celebration contract and queue order, seeds, formatting, receipt bars, the Asks colour grammar and count, CSS layer/motion/bar rules repo-wide, phone input sizes, Tailwind collisions, the redirects.
- `npm run ui:audit` (`node scripts/ui-audit.mjs --base http://localhost:3000`) — gate 3/4 against a running server (overflow, text spilling past its card, targets, the 12 px floor including SVG text, phone inputs under 16 px, console errors, loops at rest, Still first frame), on every route and the /dev/style fixture states.
- `npm run codemod:roles -- <your files> [--write]` (`scripts/codemod-type-roles.ts`) — inline style objects → type roles, legacy rgba → tokens. Dry run first; review "manual" lines by hand. Do not run it on `tokens.css` (the `--rank-*` literals are deliberate).
