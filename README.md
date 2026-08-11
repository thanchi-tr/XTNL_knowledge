# Gamified SRS — XTNL Knowledge Engine

A Next.js 16 (App Router) + PostgreSQL/pgvector spaced repetition system where
review performance drives an RPG-style XP/leveling state machine. All answer
validation, XP calculation, and state degradation run server-side (Server
Actions / Cron) — the client is a presentation layer only.

Currently implemented: **Phases 1-5** — environment/database/seeding, ML
domain-discovery routing, answer verification + the SRS state machine,
sub-linear leveling + the two Domain-specific skill interceptors, a dark
RPG-styled visual identity ("Arcane Terminal") with a shared `.panel`/
`.btn-gold` component system, and five routes: `/` (account level, radar
chart, real daily streak, level breakdown), `/workspace` (the review queue —
field-toggle filter, session progress bar, per-Field/session-complete
celebrations), `/library` (full-collection advanced search), `/dashboard`
(an animated progress ring, a Review Queue action widget, a "ghost" radar
comparing against 7 days ago, `framer-motion` number tickers/spring bars,
plus the original chart set), `/add`.

## Stack

- Next.js `16.2.12`, React 19, App Router, Tailwind CSS 4
- PostgreSQL with the `pgvector` extension (`vector(1536)` embeddings, HNSW index)
- Prisma 6 (`postgresqlExtensions` preview feature)
- `mathjs` — FORMULA-type grading: proves algebraic equivalence by evaluating
  both expressions at randomized points rather than comparing text/ASTs
- `string-similarity` — SHORT-type grading (Dice's coefficient, pass > 0.85)
- `@google/genai` — Gemini `gemini-embedding-2` (1536-dim output) for domain
  routing, `gemini-3.5-flash-lite` for the Novelty-branch domain-naming call

## Database setup (Supabase)

This project runs against Supabase's managed Postgres.

1. Copy the env template and fill in your project's connection strings
   (Supabase dashboard: **Project Settings -> Database -> Connection
   string**):

   ```bash
   cp .env.example .env
   ```

   Two separate URLs, both pointed at the same database:
   - `DIRECT_URL` — the direct connection (port `5432`). Migrations and
     seeding need a real session, which pgbouncer's transaction-pooling mode
     doesn't give you (breaks prepared statements / DDL).
   - `DATABASE_URL` — what the app queries at runtime. Start it as a copy of
     `DIRECT_URL` for local dev; before deploying, swap in the **Transaction
     pooler** string (port `6543`, `?pgbouncer=true`) so concurrent Next.js
     server actions/route handlers don't exhaust Supabase's direct
     connection limit.

   Supabase's database is always named `postgres` (not something you name
   yourself at project creation) — the path segment in both URLs should be
   `/postgres`.

2. Enable pgvector. Supabase ships the extension but it's off by default:
   **Database -> Extensions -> search "vector" -> Enable**. (The migration
   below also runs `CREATE EXTENSION IF NOT EXISTS vector`, so this step is
   a belt-and-suspenders — either one is sufficient, and running both is a
   harmless no-op the second time.)

3. Apply the schema. The initial migration is hand-authored (see the comment
   at the top of `prisma/migrations/20260728000000_init_pgvector/migration.sql`
   for why) — it runs `CREATE EXTENSION IF NOT EXISTS vector`, creates every
   table from `schema.prisma`, and builds an HNSW cosine-distance index on
   `Idea.embedding`:

   ```bash
   npm run db:migrate     # prisma migrate dev — first run applies the migration above
   ```

   In CI/production, use `npx prisma migrate deploy` instead (non-interactive,
   no schema drift prompts).

4. Seed the six Fields / 28 Domains with lore-integrated Ideas:

   ```bash
   npm run db:seed
   ```

   Re-running the seed is safe for Fields (`upsert` on `name`), but Domains
   and Ideas are plain `create` calls — running it twice duplicates Domains.
   If you need a clean re-seed, wipe the tables first (`npx prisma migrate
   reset`, which re-applies migrations and re-seeds automatically).

5. Inspect the data:

   ```bash
   npm run db:studio
   ```

6. Backfill embeddings for the seeded Ideas (they're created with a `null`
   embedding — see below):

   ```bash
   npm run db:backfill-embeddings
   ```

## Phase 2 — ML domain-discovery routing

`src/lib/domain-discovery.ts` implements the routing rules from the spec
("ML-Driven Domain Discovery & Automated Taxonomy"):

- **Saturation** (similarity > 0.85): rejects the submission and returns the
  conflicting Idea so the caller can offer `linkIdea` instead of creating a
  near-duplicate.
- **Expansion** (0.40 ≤ similarity ≤ 0.85): assigns the new Idea to the
  matched Idea's Domain, and computes `N_similar` (Ideas in that Domain with
  similarity ≥ 0.70) for the XP decay formula.
- **Novelty** (similarity < 0.40, or the Field has no embedded Ideas yet):
  creates a new Domain under the Field, named via a one-line Gemini call
  (`gemini-3.5-flash-lite`).

`src/app/actions/ideas.ts` wires this into two Server Actions:
`submitIdea` (routes, creates the Idea, computes `yieldXp` via `src/lib/xp.ts`,
writes the embedding) and `linkIdea` (resolves a Saturation result by
creating the new Idea in the matched Domain with `linkedIdeaIds` set).

All cosine-similarity queries are raw SQL (`src/lib/vector.ts` +
`domain-discovery.ts`) using pgvector's `<=>` operator, bound as a
parameterized `::vector` cast — never string-interpolated — because Prisma
Client has no query-builder API for `Unsupported` columns.

### Why embeddings start out null

`Idea.embedding` is `Unsupported("vector(1536)")` in the Prisma schema —
Prisma Client has no typed API for writing to `Unsupported` columns, only
`$queryRaw`/`$executeRaw`. `submitIdea`/`linkIdea` write it with a raw
`UPDATE ... SET embedding = $1::vector` right after `prisma.idea.create()`.
Ideas that existed before Phase 2 (i.e. everything from the seed script)
don't get this for free — that's what `npm run db:backfill-embeddings`
(`scripts/backfill-embeddings.ts`) is for; it embeds every Idea still at
`embedding IS NULL`.

Note on dimensionality: Gemini's `gemini-embedding-2` natively outputs up
to 3072 dimensions but supports Matryoshka truncation via
`outputDimensionality`. This project requests `outputDimensionality: 1536`
everywhere (seed backfill, live submission) so every vector fits the column
declared in Phase 1's migration and stays comparable to every other vector
in the table — never mix in a differently-dimensioned or differently-modeled
embedding (e.g. `gemini-embedding-001`) without re-embedding everything.

## Phase 3 — verification, the SRS state machine, and the daily Cron

`src/lib/verification.ts` implements `VerificationService` for all four
`QuestionType`s exactly per spec: SHORT (Dice's-coefficient similarity via
`string-similarity`, pass > 0.85), MULTI (strict equality), FORMULA
(evaluates both the submitted and stored expressions at several randomized
points via `mathjs` and requires them to agree everywhere — proves
equivalence rather than string-comparing the expressions), DIAGRAM (strict
key-by-key hotspot label match, case/whitespace-insensitive).

`src/lib/srs.ts` implements the state machine: correct -> level advances
(capped at 12), +2 XP to the Domain, next `dueDate` from the interval
schedule below; incorrect -> `failedAttempts++` then either a Strike (24h
reschedule only) or a Degradation (`failedAttempts >= 2` OR past
`graceEndsAt`: level -1 floored at 1, `yieldPoints *= 0.9` propagated to the
Domain's `totalPoints`, 24h reschedule). `src/app/actions/review.ts` is the
`submitReview` Server Action wiring `VerificationService` + this state
machine together — the client only ever sends an answer and gets back
correct/incorrect plus the outcome, never grades anything itself.

**The 12-tier interval schedule is this project's own numbers, not the
spec's.** The spec names three regimes — "Levels 1-4 Linear, 5-8 Stochastic,
9-12 Staggered" — but gives no day counts for any of them, unlike every
other formula in the system (Grace Period, Degradation, XP decay are all
exact). `src/lib/srs.ts`'s `BASE_INTERVAL_DAYS` table + `nextIntervalDays()`
picks concrete values consistent with those three names (deterministic
fixed steps for 1-4, the same base ±25% jitter for 5-8, deterministic-but-
unevenly-spaced jumps for 9-12) and isolates them to one place so the
numbers are a one-function change if you have different values in mind.

`src/app/api/cron/degrade/route.ts` + `vercel.json` is the daily 00:00 UTC
unattended-downgrade job. It runs the *exact same* degradation as a failed
manual review (`degradeIdea` in `srs.ts` is shared by both call sites), but
triggered purely by `now > graceEndsAt` rather than by `failedAttempts` —
this is what catches Ideas nobody ever attempts. Protect it in production by
setting `CRON_SECRET`; Vercel sends that value back as
`Authorization: Bearer <CRON_SECRET>` automatically when the env var is set
and a `crons` entry exists in `vercel.json`.

**Something to know before you use this on real reviews:** a fresh Idea sits
at level 1, and `T_grace = max(0, level - 1)` is *zero* at level 1 — so a
level-1 Idea has no grace period at all. Combined with the seed script's
staggered due-offsets (`-3` to `+3` days from seed time), most seeded Ideas
are already past their (zero-length) grace period the moment they're
seeded, and the Cron will degrade nearly all of them the first time it runs
against fresh seed data, before anyone's had a chance to review them. This
was confirmed by actually running the Cron path against the seeded
database — not a hypothetical. It's a faithful implementation of the exact
formula, not a bug, but it's worth deciding whether that's the onboarding
experience you want (e.g. seeding Ideas with a small positive `dueOffsetDays`
floor, or giving level 1 a nonzero grace period) before Phase 5 puts a UI in
front of real usage.

## Phase 4 — leveling recalculation, skills, and the first page

`src/lib/leveling.ts`'s `recalculateLeveling(domainId)` is the sub-linear
Field/Domain leveling recalculator (spec section 6:
`Level_domain = floor(0.5 * sqrt(totalPoints))`,
`Level_field = floor(sum(Level_domain_i ^ 0.75))`). Level was never stored
authoritatively anywhere before this — it's derived from `totalPoints` on
demand — so this has to be called after anything changes a Domain's
`totalPoints`, and now is: `submitIdea`, `linkIdea`, the review-reward path,
and the degradation path all call it.

`src/lib/skills.ts` implements the two `SkillEvaluationService` interceptors
the spec names for Phase 4 (the other ~38 skills in the RPG asset-matrix
addendum need `currentStreak`-style state this schema doesn't have yet, so
they're out of scope until that's designed):
- **Memory Domain Lv 3 ("The Shield")** — once the "Memory & Cognition"
  Domain hits level 3, up to 3 times per ISO week it can abort a Degradation
  entirely (level/yieldPoints untouched, still reschedules +24h). Wired into
  `srs.ts` in front of *both* degradation call sites (manual-failure and the
  Cron) via a shared `attemptDegradation` gate — "Intercepts Degradation" in
  the spec isn't scoped to only one of those paths. Weekly-use count persists
  in `UnlockedSkill`, keyed by `(userId, skillCode)`.
- **Quantitative Domain Lv 5 ("The Optimizer")** — once "Quantitative System
  Dev" hits level 5, `yieldXp`'s decay constant drops from 0.15 to 0.10 for
  Ideas submitted into that Domain specifically (`decayLambdaFor` in
  `ideas.ts`'s `submitIdea`/`linkIdea`). Pure function, no persisted state
  needed — the trigger condition (that Domain's own level) is already
  derived data.

`src/app/page.tsx` is a plain Server Component: fetches every Field ->
Domain -> due, non-archived Idea (`dueDate <= now`) directly via Prisma, no
client JS, no route handler in between. Deliberately **read-only** — it
lists what's due but there's no way to submit an answer yet, matching the
spec's Phase 4 scope ("fetch and display") vs. Phase 5's interactive
components. One thing worth noting: the preview text for each queued Idea
reads only `Idea.question`, never `Idea.answer` — for MULTI that's the
option list without which one is correct, for DIAGRAM just a hotspot count.
Rendering `answer` here would leak the correct response before the review
happens.

This is a separate Next.js app from `XTNL_thesis`, so don't assume
`npm run dev`'s default port 3000 is free — that's very possibly the other
app. Pass `-p <port>` if it's occupied: `npm run dev -- -p 3001`.

## Phase 5 — interactive review and idea submission

Two new client-side surfaces, both thin wrappers around the Server Actions
that already existed:

- **Answering a review**: click any queued Idea on `/` to expand it
  in-place (`src/components/IdeaRow.tsx`, `src/components/ReviewForm.tsx`).
  Input shape follows `QuestionType` — free-text for SHORT/FORMULA, buttons
  for MULTI's options, one text field per hotspot ID for DIAGRAM (there's no
  image renderer yet, so hotspots are labeled blind by ID — the underlying
  `DIAGRAM` verification logic doesn't care, but authoring/reviewing a real
  diagram visually is still unbuilt). Submits via the Phase 3 `submitReview`
  action, shows the result, then calls `router.refresh()` so the Server
  Component re-fetches — a reviewed Idea's next `dueDate` is always in the
  future (advance, strike, or degrade all push it out at least 24h), so it
  naturally drops off the "due now" list on refresh.

  `ReviewForm` accepts only `Idea.question` as a prop, never `Idea.answer`.
  Next.js serializes every prop passed from a Server to a Client Component
  into the page's data payload, visible in the browser regardless of
  whether it's ever rendered — passing `answer` down would leak the correct
  response before the review happens, even if no JSX ever displayed it.

- **Adding an Idea**: `/add` (`src/components/AddIdeaForm.tsx`). Picks a
  Field + `CollectionLabel` + `QuestionType`, collects type-specific input,
  and calls the Phase 2 `submitIdea` action. A Saturation result renders the
  conflicting Idea's similarity and a "Link Idea" button that calls
  `linkIdea` instead of silently failing. DIAGRAM creation isn't offered —
  authoring hotspot coordinates over an image needs a real upload/placement
  editor, out of scope for a first form; DIAGRAM Ideas can still be
  reviewed, just not created here. Also worth knowing: the given schema has
  no separate prompt/stem field for MULTI — `question` *is* the JSON option
  array, nothing else — so a MULTI Idea here is just its options, with no
  accompanying question sentence to display. That's a limitation of the
  Phase 1 schema as specified, not something this form works around.

**Verified against the real Supabase database, both flows, not just
compiled:** a SHORT review answered correctly (level 1→2, removed from the
queue), a SHORT review answered incorrectly (degraded immediately — this is
the zero-grace-at-level-1 behavior flagged in the Phase 3 section, caught
live here too), a MULTI review answered correctly by clicking an option, an
Expansion-classified Idea submission, and a Saturation submission followed
by a successful Link Idea (`linkedIdeaIds` confirmed set on the new row).
The database was reseeded and re-backfilled afterward to undo the test
mutations — if you're inspecting the data expecting a pristine seed state,
it should be back to that.

## Design system — "Arcane Terminal"

The pasted UI/UX addendum's exact color spec (Zinc + Amber/Blue/Red/Emerald)
was explicitly set aside in favor of this project's own direction: a dark,
violet-tinted theme that reads as one cohesive "place" rather than a generic
admin panel, with each semantic color tied to a specific game-feel concept
rather than a generic palette slot.

`tailwind.config.mts` (loaded into the Tailwind v4 engine via `@config` in
`globals.css` — v4's idiomatic config is CSS-first `@theme`, but a
JS/TS config is still supported and is what a token file like this wants):

| Token | Hex | Used for |
|---|---|---|
| `ink` / `ink-raised` | `#0A0A12` / `#121220` | Page background / input backgrounds |
| `surface` / `surface-hover` / `surface-border` | `#15151F` / `#1B1B2A` / `#28283D` | Cards, borders |
| `gold` / `gold-dim` | `#F4C430` / `#8A6B1E` | Rank, XP, primary actions — the metal, not a status color |
| `arcane` / `arcane-bright` | `#9B6BFF` / `#C4A6FF` | Discovery & linking (Novelty/Expansion), Domain headers |
| `crimson` / `crimson-dim` | `#FB4570` / `#7A2438` | Failure, rejection, overdue |
| `emerald` / `emerald-dim` | `#33E2A0` / `#186B4C` | Success, correct answers, level-ups |

Five keyframe animations (`discovery-pulse`, `crit-shake`, `level-up`,
`rank-shockwave`, `idle-drift`) — CSS-only, no framer-motion dependency yet.
Interaction feedback stays under 300ms per the addendum's own
sub-300ms-feedback-loop rationale; only the ambient `idle-drift` is
deliberately slow. Currently used: `crit-shake`/`level-up` on
`ReviewForm`'s result banner, `discovery-pulse` on `AddIdeaForm`'s
Saturation banner.

The theme is a committed dark mode, not a light/dark toggle — `globals.css`
sets `color-scheme: dark` unconditionally rather than following
`prefers-color-scheme`, since a genre-coded RPG identity doesn't make sense
flipping to a plain white light mode.

`types/gamification.ts` types the 4-skill Skill Matrix from the addendum
(`SkillCode` enum, `SkillTrigger`, a discriminated `SkillEffect` union) —
types only, cross-referencing which 2 of the 4 are actually wired into
`src/lib/skills.ts` already (`implemented: true/false` on each
`SKILL_MATRIX` entry) versus which need state this schema doesn't have yet
(`currentStreak` for The 1% Cap; a "review reward" skill-lookup hook for
Abstract Compounder; an "archive an Idea" action for Garbage Collection).
This file has no runtime wiring — nothing imports it yet.

## Navigation, the Dashboard, and the rest of the visual pass

Three follow-up fixes after initial user feedback that the app "didn't look
like a game yet" and that `/add` had no way back to the queue:

- **`src/components/AppNav.tsx`** — a persistent top bar (Queue / Dashboard
  / + Add Idea) rendered once in `layout.tsx`, present on every route. This
  is what actually fixes the no-way-back problem; a "back" link on `/add`
  alone would have been a narrower fix for the same underlying gap (no
  shared shell tying the pages together).

- **`/dashboard`** (`src/app/dashboard/page.tsx` + `src/components/dashboard/*`)
  — Field levels (bar, colored per-Field), all 28 Domain levels in one
  sorted bar chart (colored by parent Field so the grouping reads at a
  glance), a "Closest to Leveling Up" progress-bar list (`domainLevelProgress`
  in `src/lib/xp.ts` — inverts the Domain leveling formula to compute
  percent-to-next-level), Ideas-by-QuestionType and Review-Queue-Status
  donuts, an Idea level-distribution histogram, and 4 stat tiles. Built with
  `recharts`; `src/lib/palette.ts` is the single source of Field/QuestionType/
  status colors so a Field reads as the same hue on the dashboard's charts
  and the queue page's Domain accents.

- **Deeper visual pass on the existing pages**: the queue page's Field
  headers are now color-tinted banners (not just text), each Domain shows a
  live XP progress bar toward its next level (same `domainLevelProgress`
  the dashboard uses), QuestionType badges got glyphs (◆ SHORT / ▣ MULTI /
  ∑ FORMULA / ◈ DIAGRAM) instead of being text-only, and the page background
  got a subtle ambient radial-gradient + noise texture so the dark theme
  reads as a surface rather than a flat CSS color.

`src/lib/palette.ts` used to live under `src/components/dashboard/` —
moved to `src/lib/` once the queue page needed the same Field-color mapping
the dashboard already had, rather than reaching into a sibling feature's
component folder for a plain data map.

## Site structure: Home, Workspace, Library

Restructured from a 3-route app (`/`, `/dashboard`, `/add`) into 5, after
feedback that `/` (the review queue) should be a lightweight character-sheet
landing page instead, and that `/add` had grown a UI with no way back:

- **`/`** (`src/app/page.tsx`) — just an Account Level number and a radar
  ("stat octagon") chart, one axis per Field. Account Level reuses
  `fieldLevel()` from `src/lib/xp.ts` applied one level up (over the 6 Field
  levels, the same way Field level applies it over a Field's Domain levels)
  rather than inventing a parallel formula for a "user level" the spec never
  defined.
- **`/workspace`** (`src/app/workspace/page.tsx`) — the review queue,
  unchanged in substance, just moved off `/` and relabeled ("Queue" →
  "Workspace" per request).
- **`/library`** (`src/app/library/page.tsx` + `src/components/library/LibrarySearch.tsx`)
  — every Idea (not just due ones), with client-side advanced search: free
  text over question+answer, Field/Domain cascading filters, QuestionType
  and CollectionLabel multi-select toggles, a level range, and an
  include-archived checkbox. This is the one place in the app that
  deliberately shows `Idea.answer` alongside `question` — it's a browse/
  reference view, not a review, so there's no "don't leak the answer"
  constraint here (`src/lib/idea-display.ts`'s `displayAnswer` docstring
  spells out why that function is unsafe to use anywhere else). Filtering
  is done in-memory client-side against the full fetched list rather than a
  server search endpoint — fine at 55 Ideas; would need to become a real
  query (and probably pagination) at a much larger scale.
- Navigation for all of this lives in one place, `AppNav`, updated to 4 tabs
  (Home / Workspace / Library / Dashboard) + the Add Idea action — this is
  also what actually fixes "no way back from /add" going forward for any
  future route, not just that one page.

## Logo

`src/components/Logo.tsx` (`XtnlMark`, `XtnlLogo`) and `src/app/icon.svg`
are a recolor of the real XTNL brand mark, not an invented one — verified
against `XTNL_thesis/components/ui/XtnlLogo.tsx` (the parent app: green
crossing-X over a diamond vessel, glowing signature nodes, blue accent
vertex) and `xtnl-budget/src/components/xtnl-logo.tsx` (a sibling app's
lavender/sage recolor of the same 0-80 coordinate geometry). This project's
version keeps the exact geometry and recolors it into "Arcane Terminal"'s
own palette: violet crossing bars, an emerald "reserve" vertex, and — the
one deliberate semantic choice, not just a color swap — the two glowing
signature nodes are gold, because gold is what this app itself calls XP/
rank everywhere else. The mark's own glow points now read as the same thing
the UI's stat tiles and level badges mean when they're gold.

## Making review/add-idea feel like a game, not a form

Three additions, all client-side feedback layered on top of the existing
Server Actions — none of them change what `submitReview`/`submitIdea`
persist:

- **Session streak** (`src/components/StreakProvider.tsx`, a React Context
  wrapped around the whole app in `layout.tsx`) — increments on a correct
  review, resets on a wrong one, shown as a 🔥 badge in `AppNav` once it
  passes 1. Deliberately *not* persisted (resets on reload) and *not* the
  same thing as the addendum's `currentStreak`-dependent skills like "The 1%
  Cap" — those need real schema state (see `types/gamification.ts`); this is
  purely an in-session hype meter.
- **Domain-level-up detection** — `applyReviewResult` in `src/lib/srs.ts`
  now captures the Domain's level before and after a correct review and
  returns `domainLeveledUp`/`newDomainLevel` alongside the existing outcome.
  `ReviewForm` uses that to show a distinct, bigger celebration (gold
  shockwave, "⬆ DOMAIN LEVEL UP") instead of the normal correct-answer
  banner when it fires — a real Domain level-up is a materially bigger deal
  than one more correct Idea and now looks like one.
- **Floating "+2 XP"** on a normal correct answer, and a ~1.1s delay before
  `router.refresh()` fires so the celebration/shake is actually visible
  before the just-reviewed Idea disappears from the due list (its next
  `dueDate` is always in the future after any outcome, so it drops off
  immediately on refresh — previously that could happen before the result
  banner had time to register). `AddIdeaForm` got the same idea in miniature:
  a per-session "🔥 N this session" counter on the creation-success banner.

## Workspace: field toggle, session progress, completion celebrations

`src/components/workspace/WorkspaceView.tsx` (Client Component) replaces
the plain server-rendered list. `workspace/page.tsx` still does all the
Prisma fetching and per-Idea `dueLabel`/`overdue` formatting server-side
(unchanged), then hands a fully-formed tree to this component instead of
rendering it directly:

- **Field toggle** — pill buttons (`All` + one per Field, colored via
  `fieldColor`), each showing its own due count, filtering which Fields
  render below. Counts come from a `useMemo` keyed on the fetched data, not
  a separate query.
- **Session progress bar** — `initialTotal` is captured via
  `useState(totalDue)`'s lazy initializer, which only runs on mount, so it
  stays fixed as a denominator while `totalDue` (a prop, refetched after
  every review) shrinks. `completed = initialTotal - totalDue`, clamped so
  a mid-session increase in due count (a new Idea becoming due while you're
  reviewing) can't push the bar negative or over 100%.
- **Completion celebrations, two tiers** — a `useEffect` diffing per-Field
  due counts against the previous render fires a transient "✨ {Field}
  cleared!" toast the instant any Field's count drops from >0 to 0 (not a
  static empty-state message shown next time you look — an actual
  celebration of that moment). Separately, when `totalDue` itself reaches 0
  the whole queue area is replaced with a full "🎉 All caught up" panel.

## Home: real daily streak, Level Breakdown

Two more additions to `/`, both intentionally *not* fabricated data:

- **`src/lib/streak.ts`** — there's no activity-log table, so rather than
  add one (or fake the number), this derives a real daily streak from
  `Idea.updatedAt`: `updatedAt` only changes via a genuine user action
  (review outcome, creation, linking), so "distinct calendar days with at
  least one updated Idea in the last 60 days" is an honest activity signal
  computed with one raw SQL query + a backward walk from today. A streak
  stays alive through the current day even before today's first review —
  it only breaks once a full day passes with zero activity. Rendered by
  `src/components/home/StreakDisplay.tsx` as a 🔥 count plus a 7-day strip.
- **`src/components/home/LevelBreakdown.tsx`** — every Field ranked by
  level, with real domain counts and summed XP. Deliberately does *not*
  show a "progress to next level" bar the way Domain rows do elsewhere
  (`domainLevelProgress` in `src/lib/xp.ts`) — Field level isn't cleanly
  invertible the way Domain level is (`Level_field` sums *all* sibling
  Domain levels raised to 0.75, so there's no single "points needed"
  threshold to show progress against). The bar shown is a relative
  rank-comparison (this Field's level ÷ the highest Field's level), which
  is honest; a fabricated progress-to-next-level fraction would not have
  been.

## Design-system consolidation: `.panel` / `.btn-gold`

Card and primary-button styling had drifted into N slightly-different
copies of the same `rounded-lg border border-surface-border bg-surface p-4`
/ gold-button className strings across `ChartCard`, `StreakDisplay`,
`LevelBreakdown`, the home radar wrapper, `LibrarySearch`'s filter panel and
result rows, `ReviewForm`, and `AddIdeaForm`. Consolidated into two
`@layer components` classes in `globals.css` (`.panel` — border + a faint
top-gloss gradient + a soft drop shadow for real depth instead of a flat
fill; `.btn-gold` — the one gold CTA button treatment) and applied
everywhere the ad-hoc versions used to be. Colors are hardcoded hex inside
these classes rather than referencing Tailwind's generated CSS variables —
this project's tokens are defined in `tailwind.config.mts` and loaded via
`@config` (v3-compat mode), and rather than assume how v4 names the
resulting variables for JS-config-sourced colors, the actual hex values
(already the single source of truth in the config) are just repeated here.

## Dashboard rework: progress ring, ghost radar, animated breakdown

A follow-up request pasted the same style of "elite persona" master-prompt
this project started from, this time targeting the Dashboard with explicit
behavioral-psychology framing (Goal-Gradient Effect, Reward Prediction
Error, "dopaminergic engine"). Most of it was legitimate, well-established
UX technique and got built as asked, with `framer-motion` added as a real
dependency for it. Three things were deliberately **not** built as
specified, on the judgment that they cross from gamification into
manipulation even for a single-user personal tool:

- **No slot-machine streak mechanic.** The spec wanted the daily streak's
  claim button to run a ~1.5s randomized icon-blur animation before
  resolving to either a checkmark or a 15%-probability "loot drop" — a
  variable-ratio reinforcement schedule, the specific mechanism slot
  machines and gacha games use because it's the most compulsive reward
  schedule known in operant conditioning research. The streak (`/`,
  `src/lib/streak.ts`) stays deterministic: same real daily-activity signal
  as before, no RNG bolted onto it.
- **No "Abstract R unit" loss-aversion copy.** That's the separate XTNL
  trading thesis's currency; this app doesn't track it. `ReviewQueueWidget`
  shows the real equivalent instead — a count of Ideas already past their
  grace period (`graceEndsAt <= now`, the same condition `degradeOverdueIdeas`
  in `src/lib/srs.ts` actually acts on) — informative, not manufactured fear.
- **6 real Fields, not a fabricated 8-axis chart.** The spec's radar
  included "Operations" and "System Dev" as if they were Fields; they're
  Domains nested under Business & Finance and Computer Science respectively.
  The radar keeps the real 6.

What got built:

- **`AccountLevelRing`** (`src/components/dashboard/AccountLevelRing.tsx`)
  — a `framer-motion`-animated SVG progress ring (`stroke-dashoffset`
  spring, matching the requested `ease: [0.16, 1, 0.3, 1]` / 1.2s timing).
  Its fill is deliberately **not** "XP to next Account Level" — Account
  Level (`fieldLevel()` applied one level up over the 6 Field levels) has
  the same non-invertible-threshold problem as Field level itself (see the
  Home section above), so a fake countdown would have been fabricated data.
  Instead it shows the average of every Domain's real, already-used
  `domainLevelProgress` — a genuinely meaningful "how close is your whole
  knowledge base to its next round of level-ups" number.
- **`ReviewQueueWidget`** — due-Idea breakdown by Field, an "Enter
  Workspace" CTA, and the at-risk count described above.
- **`GhostRadarChart`** + **`FieldSnapshot`** (new model, migration
  `20260729000000_add_field_snapshot` — hand-authored and applied via
  `prisma db execute` + `migrate resolve --applied` rather than
  `migrate dev`, for the same Supabase-default-extensions drift-detection
  false-positive reason as the Phase 1 vector migration; see that
  migration's comment and the Supabase section above) — `src/lib/snapshot.ts`
  upserts today's per-Field level/XP snapshot on every Dashboard view and
  looks back exactly 7 days for the "ghost" comparison polygon. Renders
  honestly empty (with a note, not a placeholder shape) until a real 7-day-
  old snapshot exists — verified live: the first render after adding this
  correctly showed "no snapshot yet" rather than a fabricated ghost.
- **`AnimatedLevelBreakdown`** — same data/rationale as the Home page's
  `LevelBreakdown` (relative-rank bars, not fake per-Field progress
  fractions), with `framer-motion`'s `useSpring`/`useTransform` driving a
  rolling XP-number ticker and spring-physics (`stiffness: 120, damping: 14`,
  as requested) bar fills instead of snapping in.

## Workspace rework: session runner (summary → randomized run → recap)

The Field-toggle Workspace from the section above still browsed every due
Idea as an always-expanded, click-to-answer list. A follow-up request asked
for the opposite interaction model — a stats-and-progression screen with a
Start button, then questions run one at a time in random order with a short
success animation and a live progress bar, "to maximise dopamine." Built as
asked, using the same line drawn in the Dashboard rework above: real
momentum and satisfying feedback are good game design; variable-ratio reward
mechanics are not, so nothing here uses randomness to decide what a correct
answer is worth — only to decide the *order* of real due Ideas and which of
several equally-true affirmation strings to show.

`WorkspaceView.tsx` is now a three-mode state machine instead of a static
list:

- **`summary`** (default) — `SessionSummary.tsx`: due count, domain count,
  and a rough time estimate for whatever the Field-toggle currently has
  selected (`All` or one Field), plus a "▶ Start Session" button. The old
  always-visible nested Field→Domain→Idea list is gone; Library already
  covers browse-everything, so Workspace's only job now is running reviews.
- **`running`** — clicking Start flattens the currently-selected Fields'
  due Ideas into one array, Fisher-Yates shuffles it client-side once, and
  renders `SessionCard.tsx` for `runQueue[runIndex]` at a time. Each card
  submits via the same `submitReview` Server Action as before, shows a
  brief result flash (✓/✗, a randomly-chosen short affirmation on correct —
  cosmetic variety only, never affects the real outcome — and the actual
  `ReviewOutcome` description), then calls `onComplete` which advances
  `runIndex` and updates a running-progress bar (`runIndex/runQueue.length`).
  Routine feedback holds ~650ms so the run stays brisk; a domain level-up
  (a rarer, genuinely special event) holds ~1300ms to give it more
  spotlight — pacing varies by significance, not the reward itself. A
  🔥-in-a-row combo badge reuses the existing session-only `StreakProvider`
  context. An "Exit session" link is always visible — bailing out early is a
  first-class action, not a trap.
- **`complete`** — `SessionComplete.tsx`: correct/incorrect tally, real
  accuracy percentage, and a list of any Domains that leveled up during the
  run. "Back to Workspace" (and "Exit session" mid-run) both call
  `router.refresh()` before returning to `summary` — the only refetch in the
  whole flow, since the run itself never leaves the page.
- `IdeaRow.tsx` and `ReviewForm.tsx` (the old embedded-list row and its
  inline answer form) became fully unused once the list view was removed,
  so they were deleted rather than left as dead code; `SessionCard.tsx`
  carries the same per-`QuestionType` input logic (SHORT/FORMULA text,
  MULTI option buttons, DIAGRAM hotspot labels) adapted for the sequential
  full-card layout.
- Verified live end-to-end: started an all-Fields session, answered one
  wrong (strike flash) and one right (level-up flash) then exited early —
  confirmed the summary screen's due count and per-Field pill counts
  refreshed correctly and "Today's progress" carried the two completions
  forward. Then ran a Mathematics & Statistics-scoped session to full
  completion (5/5, including one real domain level-up) — confirmed the
  recap screen, the "✨ Mathematics & Statistics cleared!" toast, and the
  Field pill dropping to 0 all fired correctly. DB reseeded afterward.

## Environment variables

See `.env.example`:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | App runtime connection — Supabase transaction pooler (port `6543`) in deployed environments |
| `DIRECT_URL` | Migrations/seeding — Supabase direct connection (port `5432`) |
| `GEMINI_API_KEY` | `gemini-embedding-2` / `gemini-3.5-flash-lite` calls (Phase 2+) |
| `DEFAULT_USER_ID` | This is a single-tenant personal instance — `UnlockedSkill` is still keyed by `userId` for forward-compatibility, but nothing else in the schema is user-scoped yet |
| `CRON_SECRET` | Optional. Gates `/api/cron/degrade` — required in production, unset is fine for local dev (Phase 3+) |

## Commands

```bash
npm run dev          # start the Next.js dev server
npm run build         # production build
npm run lint           # eslint

npm run db:generate            # regenerate Prisma Client after schema.prisma changes
npm run db:migrate             # apply/create migrations
npm run db:seed                # run prisma/seed.ts
npm run db:studio              # Prisma Studio GUI
npm run db:backfill-embeddings # embed any Idea still missing one
```
