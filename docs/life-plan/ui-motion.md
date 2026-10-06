# UI motion: fewer words, animated glyphs, a small shader layer

Status: build spec, design only (2026-10-05), revision 2. Nothing in it is built yet. Revision 2 applies two critiques (accessibility and performance; honesty of the word cut). §14 lists every finding and what was done with it, and the two decisions left to the user.

Addition (2026-10-06): §15, the topic map and goals, is the UI half of roadmap revision 5 (docs/life-plan/roadmap-topic-map.md; roadmap-contracts.md §22, §23). Lane 0 of revision 5 wrote it. §1–§14 are unchanged by it.

It merges three designs:
- **A, "show, don't tell"**: copy budgets, motion licences, the InfoTip.
- **B, an animated glyph language**: the glyph catalogue, idle / active / done shapes, motion tokens, seen-once events.
- **C, shaders**: the WebGL runtime and the `horizon` and `weave` programs.

The build starts after the practice-progression workflow lands on `src/components/roadmap/**` (§10).

Read it with:
- redesign.md (Motion, AMBIENT, Pacing) and redesign-contracts.md §1–§3;
- roadmap.md and roadmap-contracts.md;
- the mockups docs/life-plan/redesign/final-*.html and docs/life-plan/roadmap/final-*.html.

Notation:
- `[name]` is a glyph from §4, for example `[quest.bring]`. `[rank.2 active]` names a glyph and its state.
- `«label»` is a HonestyChip (§4.6): a glyph plus a short visible label, with the full string one tap away.
- `(i: X)` is an InfoTip whose hidden panel holds X verbatim. At most 3 per card; the rest fold into the card Key (D13).
- `▸` is a native `<details>` disclosure (the house `.rm-how` pattern).
- "sr" is sr-only text. Revision 2 drops `title` everywhere (it does nothing on touch). Every sr string that carries honesty or row-specific meaning is also in a panel a touch user can open on the same card (D13).
- "App words" are words counted by §3.1.
- **278 px** is a card's content box at 344 (§7). Every composite is sized from it.
- Motion levels use the code's names: **full / calm / still**. The brief's "reduced" is calm. With the pref on "system", prefers-reduced-motion resolves to still (resolveMotion in celebration-types.ts), so still is what most reduced-motion users get. Calm only happens when the user picks it in Settings › Feedback.

---

## 1. Goal

The user, verbatim: **"The UI is too much word, add more animated icon. add animation, shader."**

That becomes three measurable outcomes:
1. **Fewer words.** Every roadmap surface meets an app-word budget at 344 px (§3.2), typically a 60–85% cut. Examples:
   - draft-v4's header section: 454 → ≤ 90;
   - the Now section: 621 → ≤ 120;
   - the Aim card: 49–101 → ≤ 14 in every state.
2. **More animated icons.** A closed glyph set (§4) replaces explanatory sentences: quest kind, evidence, provenance, stage, rank, pace, session kind, verdict, time. Each glyph has idle, active and done shapes. Each one-shot motion is licensed by the user's own act, by a measured change, or (for estimates) by a change marker only.
3. **Animation and shader.** A motion layer built on the frozen gateway (§5), plus two hand-written WebGL1 programs (§6):
   - `horizon`: a soft dawn-and-air field under the measured Proficiency band on the Aim card and the roadmap header. The measured marks themselves (path, front, hairline) are crisp server SVG; the shader draws no number (D15).
   - `weave`: shown while a draft is being written.
   Both have static SVG layers, which are the first paint, the calm and still state, and every state that does not loop. A WebGL context exists only while a slot loops (D17).

Fixed constraints from the brief. Each one has a check in §11.
- Honest numbers and provenance survive the cut. Every honesty element stays visible as a compact glyph plus chip, with its full text one tap away and present in the DOM. Nothing is deleted (§8). Provenance keeps its who-word: "Gemini" stays visible on every Gemini row, pick and lane (D25). Unverified, best-case and calibrating marks stay visible (D28).
- What a screen reader says carries the full meaning: every compact figure has a spoken twin (D26), and every honesty string is read exactly once.
- Animation never implies progress that isn't measured. Estimates and stated figures change by a marker crossfade only (CHANGED, §5.2).
- Gateway rules: calm means no loops and no parallax; still means nothing moves; prefers-reduced-motion is honoured.
- Moving content that starts by itself stops within 5 s (AMBIENT) or has an on-page pause (WAIT), per WCAG 2.2.2 (D16, D19).
- 344 px (Galaxy Fold cover screen) first, then 932 and 1440.
- Text is 12 px or more and never scaled down by a viewBox. Targets are 40 or 44 px measured on the element itself, and no two targets overlap (D31). Colours come from the contrast tokens only.
- The board never opens on red.
- Shaders are tiny hand-written WebGL (no three.js). They are DPR-capped, pause offscreen and when the tab is hidden, fall back to static SVG under calm, still, high contrast, forced colours or without WebGL, never block first paint, and start only after the page is quiet (§6.5).
- No new runtime dependency. None is added, and framer-motion is not used.

Non-goals:
- no new celebration tier or CelebrationKind;
- no change to any number, date, target or rule;
- no existing roadmap-copy string is reworded (new short labels are added beside them);
- no sound.

### 1.1 Starting point (audit, 2026-10-05)

Words were counted at 344 px with the method in §3.1, on the real fixtures (/dev/style/roadmap, /dev/style/today, /dev/style/art/you). The audit's reference counter was scratchpad `count.ts`; §3.1 is now authoritative.

| Surface | Words today |
|---|---|
| Intake form | blank 247 · Gemini 268 · empty library 451 · body 476 · depth 611 |
| Draft header, run facts, Depth and date (draft-v4) | 454 (count-gate 295, mixed 77); the whole draft-v4 page is 1,689 |
| Next milestone card + outline (draft-v4) | 418 + 817 (draft-mixed: Next card alone 738) |
| Living Aim header | active 85 · behind 204 · depth plan 226 |
| Now section | active 621 · behind ≈ 590 · depth 552 |
| Milestones, Toward the aim, footer | active 235 · depth ≈ 307 |
| Start sheet | start-refit 405 · exam-waypoint 205 · body active-confirm 369 |
| Activities to avoid card | draft-confirm 118 · asking again 165 · intake 158 · answered 33 |
| Aim card (/you) | 49–101 by state (ASK 58–89) |
| Today week quests | active 99 · behind 109 · body 42 |
| Today aim line | SET 20 · NEXT 23 · START 12–16 |
| Roadmap tab: empty / drafting / done | 52 / 26 / 194 |

Motion on roadmap surfaces today is almost none:
- the Proficiency LastSeenMeter (700 ms, from the last-seen value);
- the kit's meter transitions, disclosure chevrons and the Sheet slide.

There is no canvas, WebGL or shader anywhere in `src`.

Icons today:
- the kit sprite: 28 `i-` icons, 3 currency glyphs, 5 track sigils and 4 HeldGlyphs;
- RoadmapGlyph.tsx: 15 inline glyphs.

None of them animate. Only the coins, the rings and Tick move.

---

## 2. Decisions

Sources are A, B and C; "R2" marks a decision added or changed by revision 2 (§14). "Sign-off" means a frozen contract changes, so the lead decides.

| ID | Decision | Why | From | Sign-off |
|---|---|---|---|---|
| D1 | A sentence that carries a number becomes glyph + figure + unit, with a spoken twin (D26). A sentence that only explains moves behind an (i), the card Key or a row's ▸. Full strings stay in the DOM. | roadmap-ui-check pins about 64 rendered strings; they keep passing. | A, B | – |
| D2 | One counting method (§3.1) and hard budgets (§3.2), enforced by roadmap-ui-check and ui-audit. Exempt text is marked in markup with `data-wc`. | A budget can never be met by cutting a number or an honesty mark. | A | – |
| D3 | Glyphs are SVG rendered on the server from one path table, split by family. Glyphs that can animate are inline: stage, rank, quest, verdict (`verdict-change`), the Gemini provenance glyphs (`pv-confirm`), misc and flame. Static families (evidence, safety, session, time, and the ProvMark glyphs pv.app / pv.you / pv.checked / pv.syllabus) are `<symbol>`s in a per-route `GlyphDefs` block and drawn with `<use href>`. Ids carry a route prefix (`gd-rm-`, `gd-you-`, `gd-today-`). The kit sprite stays the home of `i-`, `c-`, `s-` and `h-`; the frozen root layout is not touched. (R2) | Inline markup is sent twice, in the HTML and in the RSC payload. A page-level server component can emit the defs without editing layout.tsx. | B, critique 1 | – |
| D4 | The Gemini mark is a speech balloon with a dashed rim (`pv.suggest`). It always sits beside the visible word "Gemini" (D25). The balloon shape carries "not checked"; a dash on its own does not (D29). (R2) | The four-point spark is c-xp and close to an AI brand mark; an asterisk reads as a footnote. | B | – |
| D5 | The Aim rank is a notched medallion (`RankSeal`, glyph `rank.0`…`rank.6`): 6 radial notches at 60°, one for each rank above Initiate, so Paragon closes the ring. Ink only. The rank name always sits beside it. "Kept for good" is words (sr text and the (i)), never a padlock: `m.lock` means only "needs your check". (R2) | One shape works at every size from 16 to 72 px. One padlock was carrying three opposite meanings. | B geometry, A labelling, critique 2 | – |
| D6 | A stage is a cairn glyph (stones = level). Depth is shown by StageLadder, an aria-hidden visual twin of the Depth radio group, built as an HTML grid so its 12 px numerals never scale. The radio group stays the control. (R2) | Twelve 44 px rungs do not fit 344 px, and the form is a task surface. | B, critique 1 | – |
| D7 | Six motion licences: ACT, SEEN, CHANGED, WAIT, AMBIENT, STATIC (§5.2). No licence means no motion. CHANGED is a marker crossfade for an estimate or a stated figure: no draw, no roll, no direction. (R2) | It makes "animation never implies unmeasured progress" checkable, and keeps estimates from drawing toward their dates. | A + B + C, critique 2 | – |
| D8 | One-shot events use a new `useSeenEvent`, which stores the value only after the element was at least 50% on screen. Meters keep the frozen useLastSeen semantics through `useSeenValue`. Every seen key carries the plan basis. For anything driven by Proficiency (the headline Meter, the Aim card meter, horizon-front, a MeasureRow whose target changed) the basis is `${basisVersion}:${hashSeed(basisSignature(detail.basis))}`; for the rest it is acceptedDay plus plan version. A rebase therefore never animates, even when acceptedDay and basisVersion stay the same. (R2) | basisVersion alone does not change on a switch-off at Start or a lowered depth within a version (rebaseCauseOf), so a viewer who last looked before such a rebase would see 41 → 52% as a rise. | B, C, critique 2 | – |
| D9 | Falls move like rises: a meter or the horizon front goes from the last-seen value to the current one in either direction, in ink, with no flourish. The static words "↓ 1 since Sun" carry the meaning. Never red. | Motion that only shows gains would be one-sided, and the frozen Meter already animates both ways. | B, C (A's "a fall never animates" rejected) | – |
| D10 | Today stays calm: no arrival draw, no shader, no loop and no burst. Only SEEN meter fills and check draws. The Today aim line is static. | It is the most visited route; ui-audit checks it at rest; aim line ≤ 72 px. | A, B, C | – |
| D11 | Safety surfaces are static at every level: the Activities card, the body and care pending line, and every "Not medical advice" chip. Only the kit checkbox transition runs; InfoTips there open instantly; `data-fx="none"` blocks shaders. | A safety surface is calm even under full. | A, B, C | – |
| D12 | HEALTH_LINE becomes one chip per card instead of one line per row. The chip's visible label keeps the instruction: "Not medical advice · ask a professional"; the full HEALTH_LINE opens from it. A blocking flag's reason stays visible beside it (the FlagChips contract is unchanged). A card whose HEALTH flag already shows HEALTH_LINE drops its card-level chip. (R2) | The draft-confirm page renders HEALTH_LINE 7 times (63 words). The one actionable safety instruction costs nothing against the budget, so it stays on screen. | A, B, critique 2 | yes |
| D13 | Card-level honesty chips are buttons that open their full text (§4.6). Repeated row marks are static: their glyph and short label are aria-hidden and the full words are sr-only, read exactly once, with no `title`. Every sr-only honesty or row-specific string is also in a panel a touch user can open on the same card: the row's ▸, or the card Key, which lists per-row text. InfoTips are capped at 3 per card (the Key counts as one); other explanations fold into the Key or the row's ▸. (R2) | Twenty-five 40 px buttons would bury the actions; `title` gives nothing on a phone; duplicated accessible text would make screen-reader users hear more words than today. | A + B, both critiques | – |
| D14 | Shader scope is two programs, `horizon` (a soft dawn and air field, no measured mark) and `weave`. `slate`, the aura, the stage halo, `press` and `bloom` are deferred (§13). The rank rise is SVG plus the gateway's burst(), not a shader. | The most visible effect for the fewest contexts, bytes and risks. | C (scope cut) | – |
| D15 | Measured marks are SVG, never shader. The horizon's hairline, contours, walked and unwalked path and front dot are server-rendered SVG at native DPR, always on top of the soft layer and DOM-testable. The shader draws only the dawn and the air beneath them; the dawn's strength is constant, so the field encodes no number. Every fact is also text beside the band. No text sits on a band. (R2) | The data line stays crisp on a DPR 2.6 screen; the honesty rule holds by construction (the shader has no path code to move); the shader drops to about a third of the fragments. | C, critique 1 + 2 | – |
| D16 | Horizon air is AMBIENT: zero-mean, no net direction, carrying no data (D15), full only, /you and /you/roadmap only, and only with prefers-reduced-motion: no-preference (even under an explicit full pref). It runs for at most 5 s of visible time per program per browser session (sessionStorage, not per mount), ramps in and out over 400 ms, and then the slot returns to its SVG and releases its context. One constant, `HORIZON_AIR` in params.ts, turns it off. (R2; see U1 in §14) | WCAG 2.2.2: content that starts by itself, runs alongside other content and lasts over 5 s needs a pause; a 5 s settle needs none. A per-mount cap restarted on every /you ↔ /you/roadmap trip. | C, bounded by A, critique 1 | yes |
| D17 | Runtime: a WebGL1 context exists only while a slot loops, and at most 1 is live per document (one loop per page: while a WAIT loop runs, AMBIENT slots stay on SVG). Static states (calm, DONE, ARCHIVED, unmeasured, mediump-only, degraded) are SVG with no context. A context is released when its loop ends, after 10 s offscreen, on unmount, or when its route is hidden. (R2) | Context creation and compile are the most expensive path on Android (a synchronous GPU-channel setup, often 10–30 ms) and bought nothing for a static frame the SVG already draws. A hub blitting to 2D canvases adds a readback risk; a fixed full-viewport canvas lags on scroll and breaks Sheet clipping. | A, critique 1 (C's hub rejected) | – |
| D18 | The roadmap gets its first motion events: a stage reached and an Aim-rank rise. They are separate SEEN one-shots in place, queued one after the other: no server row, no curtain, no sound, plus one polite announce() for a rank rise. Both fire on a counted reach only, never on a pending reach ("counts from Thu") and never on a milestone or aim closed without being reached. Proficiency is never celebrated. (R2) | Rank rises today get only a static "new 3 Nov" chip; a pending reach moves no rank until it counts. | A, B, C, critique 2 | yes |
| D19 | AMBIENT amendment: redesign.md's "exactly two loops" gains a WAIT/AMBIENT class: the `route.weave` glyph's opacity breathe (drafting, CSS, only while the weave shader is not live), the shader `weave` (drafting, ≤ 90 s, with an on-page pause button) and the horizon air (≤ 5 s per session). One loop per page. Each runs on --ambient-play or the shader gate, and never on /today or /review. shell-check's kit-loop count (styles/*.css only) is unchanged. (R2) | The house rule must name every loop. | A, B, C, both critiques | yes |
| D20 | No new runtime dependency. WAAPI through play() covers every one-shot. framer-motion stays off; no three, ogl, regl, twgl or pixi. | Brief. | all | – |
| D21 | No existing roadmap-copy string changes. New `SHORT_*` labels are added in one contract step (R0; list in §9.3). A visible label that moves (for example the aim question into the (i) panel) is re-pinned, named, in the PR that moves it. Where an existing string is already short enough (integrityLine, RUN_STARTER_LINE, LEGACY_GEMINI_HIDDEN, activitySaveLine), it stays visible verbatim instead of getting a short label. (R2) | Goldens and pinned text stay stable. | A, critique 2 | – |
| D22 | Ink only on every roadmap glyph and shader: no gold, no --mp hue, no --owed, no --light. Over and Impossible are ink, told apart by shape and word; pace glyphs are ink. | roadmap.css reserves gold for spending MP; the board never opens on red. | A, B (C's --light aura deferred) | – |
| D23 | The shared contract (M0) touches no roadmap file and may start before the progression workflow lands, with the lead's OK. Everything that touches `src/components/roadmap/**`, roadmap-ui-check or roadmap-contracts waits for it (§10). | Another workflow owns those files now. | all | – |
| D24 | View transitions (experimental `viewTransition` in Next 16.2.12) are deferred. | Experimental flag; not needed for the goal. | B | – |
| D25 | Provenance keeps its who-word. Every Gemini chip, pick and lane shows "Gemini" visibly: «Gemini · not checked», «Gemini · kept · not checked», «Gemini's choice · not checked» (the brief's own example; "· not checked" while the row is a DRAFT), «Shown to Gemini · not checked» for constraints, and the integrity chip is integrityLine verbatim. A bare "not checked" never appears on a provenance mark. (R2) | The brief names "Gemini's choice · not checked" as a label that must survive; roadmap.md:601 says DRAFT and KEPT_SUGGESTION always carry their words; "not checked" alone is ambiguous next to "Aim not checked" and "library not checked". Honesty labels are exempt from the budget, so the word costs nothing. | critique 2 | – |
| D26 | Spoken twins. Every compact figure (GlyphStat, StatRow, chips, pips, TimeBar labels, glyph counts) renders its compact text aria-hidden plus an sr-only long form: "about 110 days", "level 6 or higher", "10 hours a week", "from 46 to 38", "down 1 since Sunday", "2 practices, 2 steps, 1 checkpoint". The long form comes from `figureSpeech()` over one figure-and-unit table that word-count.mjs also reads, so the two cannot drift. (R2) | TalkBack reads "110 d" as "one hundred ten d" and "↓" as "downwards arrow"; several of these are honesty figures. | critique 1 | – |
| D27 | Glyph classes are honest. A glyph names the number's real class: `ev.measured` only beside a measured time; `ev.estimate` on estimated hours; `pv.you` on the user's own declared hours; verdict glyphs only inside a verdict chip; a neutral `m.queue` for the cleared share; `m.seal` for milestones reached; `m.lock` only for "needs your check". Two figures side by side each carry a unit word ("≈ 9 h seen · 10 h/wk yours"). (R2) | A clock on an estimate, a Fits glyph beside a "Tight" verdict or a blocking flag on "1 of 6 milestones" gives a number a false class. | critique 2 | – |
| D28 | Unverified, best-case and calibrating marks stay visible: the verdict chip reads verdictWord(v, unverified) ("Unverified · Fits", with `v.unv`); «best case» sits beside a pace or reach that rests on a calibrating pass rate; while the pass rate calibrates the pass figure reads "pass rate calibrating 12/30" instead of a %; «n% sized by Gemini» sits beside task-time estimates. (R2) | They are visible today and the brief says an unverified or estimate mark must stay visible. | critique 2 | – |
| D29 | Line styles follow the house (redesign.md: PromiseRing "dashed track = calibrating", DaySeal and "Not counted yet" dashed rings, EmblemCoin locked dashed rim): **dashed = calibrating or not yet counted**; **dotted = from your ticks** (self-reported); **≈ = estimate** (never a dashed rim); **not checked = the balloon shapes** (`pv.suggest` family) and `v.unv`; **held = the kit HeldGlyph**; **struck = avoided, dropped, closed or pays nothing**. (R2; see U2 in §14) | Revision 1's "dashed = not checked only" contradicted five house components and the doc's own estimate chips, earliest tick and self-reported path. | critique 2 | yes |
| D30 | SEEN motion never regresses what is already on screen. An element is armed at its from-state only while it is offscreen; it plays when it reaches 50% in view. An element already ≥ 50% visible at hydration gets a non-regressive accent over its final state (a stamp, a glint, the burst and announce), never a redraw from zero. Meters keep the frozen house behaviour (from last seen). A chain's parts are created up front with delays, never awaited one by one. (R2) | SSR paints the end state; seen-ness is known only on the client 0.5–2 s later, so a replay from the start key would "un-reach" a stage or rank for a moment. | critique 1 | – |
| D31 | Targets are real. Chip and InfoTip buttons have a real 40 px box (the house `.rm-ilink` pattern: min-height and min-width 40 px with negative block margins, so the 24 px visual keeps its line height). Chip rows keep column gap ≥ 8 px and row gap ≥ 16 px, so no two 40 px boxes intersect. (R2) | A `::before` hit area fails ui-audit's own-rect probe and lets a tap open the neighbouring chip. | critique 1 | – |

---

## 3. Copy budget

### 3.1 How words are counted

`countAppWords(markup, { width: 344 })` lives in `scripts/word-count.mjs`. The static checks and ui-audit both use it.

1. **Render** the fixture as roadmap-ui-check does: renderToStaticMarkup under FixtureRoadmapProvider. In the browser, ui-audit walks the live DOM instead.
2. **Drop**:
   - the content of a closed `<details>` (its `<summary>` is kept);
   - `[hidden]` and `.sr-only`;
   - attribute text (aria-label, title, placeholder);
   - `<svg>`, `<canvas>` and `.shd`;
   - the reference column that collapses under 760 px of main;
   - `.rm-acts-w`.
3. **Exempt** (visible, but not counted):
   - `[data-wc="own"]`: the user's own words, such as the aim, typed titles, quotes and syllabus lines.
   - `[data-wc="name"]`: names, such as Area, Field, Domain, exam, milestone and stage titles, rank names, session and catalog practice names.
   - `[data-wc="honest"]`: HonestyChip labels and the other honesty marks listed in §8, including the GlyphLane who-words and the pay phrase "pays … × progress «from 70%»".
   - Figure tokens: `/^[≈~↓↑+−-]?\d[\d.,:/–-]*(%|h|m|d|wk|mo|min|×|\+)?$/`, plus the unit word, day or month directly after a figure (UNIT_WORDS: card(s), session(s), step(s), day(s), week(s), wk, h, min, `L\d+\+?`, Mon…Sun, Jan…Dec).
   - Separators: `·`, `→`, `—`, `/`, `|`.
4. **Count** what is left, split on whitespace. A compact figure rendered aria-hidden is still visible, so it is counted like any visible text (its figure tokens are exempt); its sr-only spoken twin (D26) is dropped with the other `.sr-only` text. TimeBar, StageLadder and PipStrip labels are HTML now, so they are counted too.
5. **Fold** means the first 600 px of `main` below the top bar at 344 × 882. ui-audit measures it in the DOM; the static check uses the blocks this section marks as the fold.

Each lane adds the `data-wc` attributes for the surfaces it builds. A `data-wc` on an element that holds app words is a test failure (§11.3).

### 3.2 Budgets (hard gates)

| # | Screen and state (fixture) | Today | Budget | Fold at 344 |
|---|---|---|---|---|
| 1 | Intake: blank | 247 | ≤ 90 | ≤ 25 |
| | Intake: Gemini path on | 268 | ≤ 105 | ≤ 25 |
| | Intake: empty library | 451 | ≤ 110 | ≤ 25 |
| | Intake: Area picked, nothing chosen (intake-left-out; rev 5 lane 1) | 77 | ≤ 90 | ≤ 25 |
| | Intake: body (intake-confirm) | 476 | ≤ 130 | ≤ 25 |
| | Intake: depth | 611 | ≤ 150 | ≤ 25 |
| 2 | Draft header + run facts + Depth and date: draft-v4 | 454 | ≤ 90 | ≤ 25 |
| | … count-gate | 295 | ≤ 70 | ≤ 25 |
| | … draft-mixed | 77 | ≤ 40 | ≤ 25 |
| 3 | Next milestone card: draft-v4 | 418 | ≤ 120 | – |
| | … draft-mixed | 738 | ≤ 160 | – |
| | Each collapsed outline node | 817 for 5 | ≤ 12 each | – |
| 4 | Living Aim header: active | 85 | ≤ 25 | – |
| | … behind (header to the Now card) | 204 | ≤ 45 | – |
| | … depth plan | 226 | ≤ 35 | – |
| 5 | Now section: active | 621 | ≤ 120 | – |
| | … behind | ≈ 590 | ≤ 135 | – |
| | … depth plan | 552 | ≤ 115 | – |
| 6 | Milestones + Toward the aim + footer: active | 235 | ≤ 60 | – |
| | … depth plan | ≈ 307 | ≤ 75 | – |
| 7 | Start sheet: start-refit | 405 | ≤ 70 | – |
| | … exam-waypoint | 205 | ≤ 50 | – |
| | … body active-confirm | 369 | ≤ 70 | – |
| 8 | Activity card: draft-confirm (asking) | 118 | ≤ 45 | – |
| | … active, asking again | 165 | ≤ 55 | – |
| | … intake | 158 | ≤ 50 | – |
| | … answered | 33 | ≤ 25 | – |
| 9 | Aim card: every state (active, accepted, fallen, re-plan, ASK, done, draft, running) | 5–101 | ≤ 14 each | – |
| 10 | Today week quests: active | 99 | ≤ 30 per card, ≤ 8 per line | – |
| | … behind | 109 | ≤ 34 | – |
| | … body plan | 42 | ≤ 30 | – |
| 11 | Today aim line: every state | 8–23 | ≤ 8 | – |
| 12 | Roadmap tab: empty | 52 | ≤ 8 | – |
| | … drafting | 26 | ≤ 12 | – |
| | … done: header / whole page | 194 page | ≤ 25 / ≤ 90 | – |
| | … legacy | 52 | ≤ 20 | – |

For information, not gated: the draft-v4 page total goes from 1,689 to about 400 or fewer.

Revision 2 puts some words back on screen (§14). The honesty labels it restores are exempt (the "Gemini" who-word, "ask a professional", "Unverified ·", «best case», "review gap", «at acceptance»). The ones that count were re-estimated against these budgets, which do not change:
- the Activities card keeps activitySaveLine and "The plan can include: …" verbatim: draft-confirm ≈ 40 (≤ 45), answered ≈ 12 (≤ 25);
- the Aim card adds "Proficiency", "by" and "yours": ACTIVE ≈ 11 (≤ 14);
- Today's START keeps its verb, "Gives … Aim rank": 7 (≤ 8);
- the Start sheet's rank line gains "gives": start-refit stays ≤ 70.

### 3.3 Every rewritten block

Each row gives the block as it is today (with its word count), what stays visible, and where the full text goes.
- "sr" is sr-only text, with no `title`. Every sr string in these tables is also in a tap panel on the same card: the row's ▸ or the card Key (D13).
- Compact figures carry spoken twins (D26); they are not repeated here.
- "(i)" panels beyond 3 per card fold into the card Key (D13). Each table marks which (i)s a card keeps.
- `[rank.N active]` is the next-rank state (the open slot), never the held state.

#### Screen 1: Intake form (RoadmapForm, IntakeActivities)

The form keeps three InfoTips: the form lead, the Depth group, the card Key.

| Block today (words) | New visible form | Full text, one tap away |
|---|---|---|
| Form lead (23) | Nothing under the title | (i) beside "Set an aim": the form lead |
| Aim label "What do you want to be able to do?", AIM_LONG_HINT (15), "Shown exactly as you wrote it, everywhere. Never rewritten." (9) | Label "Your aim" (SHORT_AIM_LABEL). The placeholder is AIM_CALL_PLACEHOLDER. The textarea's `aria-describedby` points at the hidden Key panel that holds the question and AIM_LONG_HINT, so the question stays part of the field's description after the first keystroke. `[m.verbatim]` + "n/140" | The card Key: the question, AIM_LONG_HINT and the shown-exactly line. Re-pin the label if a check pins it (D21). |
| Area picker sub-line and Area hint (18) | "[sigil] Pick an Area", then "[s-know] Statistics · L9" | The card Key: the Area hint |
| depthHint (33), realisticHint (30), EXAM_WAYPOINT_HINT twice | StageLadder (visual) over the Depth radios "Retained 8 · Fluent 10 · Mastered 12"; «[t.span] review gap ≈ 110 d» | (i) on the Depth group: depthHint + realisticHint + EXAM_WAYPOINT_HINT, said once |
| By-when chips with sub-lines ("before level 12 is possible") | Each chip (a verdict chip): "[t.cal] 12 mo" over "[v.fits] possible" or "[v.imp] too soon for L12" | sr: chipVerdict verbatim; the card Key lists it per chip |
| "Mon 4 Oct · 365 days from today" | "[t.cal] Mon 4 Oct" | sr and the card Key: the day count |
| Hours: 'What the app has seen' (18) | The stepper plus GlyphStat "[ev.estimate] ≈ 9 h seen · [pv.you] 10 h/wk yours «not timed»" | The card Key: the sentence |
| Syllabus and Exam sections | ▸ "[pv.syllabus] Syllabus · optional" · ▸ "[quest.checkpoint] Exam · optional" | Inside the disclosures |
| intensityHint (19), paceShareHint | Segmented "[intensity.light] Light 50% · [intensity.steady] Steady 70% · [intensity.push] Push 90%" | The card Key: intensityHint + paceShareHint |
| Constraints hint (20) | "Anything to avoid? · 0/280". No glyph: a struck pill reads as medication advice on a body plan. | The card Key: the constraints hint |
| NO_KEY_LINE (15) | «[pv.app] from your numbers» | Chip button → NO_KEY_LINE |
| FREE_TIER_LINE + privacyLine (Gemini path) | «[i-share] Google may use this», always visible while the Gemini path is on | Chip button → both lines |
| Depth intake: "Your cards, from the app" (25) and "What the app has seen" (18) | One StatRow: "[ev.estimate] ≈ 9 h seen · [pv.you] 10 h/wk yours · [s-know] 96 cards · [stage.familiar] 29 at L6+" | The card Key: both sentences |
| Outline rows and the outline-to-Domain note | "S1"–"S6" badges, with the Domain selects kept | The card Key: the note |
| Body intake: the user's quote under 5 pre-ticked rows (50) | The quote once, in activityLeadLine; `[m.quote]` beside the session name on each pre-ticked row | Each row's quote as sr and in the activity card's Key |
| ACTIVITY_INTAKE_HOW_LINE (31) | – | (i) on the activity block, opens instantly (safety surface) |
| The pending line | Verbatim, led by [s-body] | – |
| HEALTH_LINE | «[safe.health] Not medical advice · ask a professional», once per card | Chip button → HEALTH_LINE |
| Path buttons, Confirm these / Nothing to avoid, field errors | Unchanged words | – |

#### Screen 2: Draft header, RunFacts, DateBlock, depth lines

The header card keeps the lanes (i); the Depth and date card keeps the realism (i), the NEVER_LOWERED (i) and its Key.

| Block today (words) | New visible form | Full text |
|---|---|---|
| Eyebrow "Draft · not accepted yet", the aim | Verbatim (honest, own) | – |
| Settings line | Chips: "[s-know] Statistics · L9", "[stage.mastered] Mastered · L12", "[quest.checkpoint] Exam P", "[pv.you] 6 h/wk yours · Steady" | – |
| Free tier (Gemini path) | «[i-share] Google may use this» in the chip row | Chip button → FREE_TIER_LINE + privacyLine |
| GEMINI_V4_LEAD_LINE (63), GEMINI_V3_LEAD_LINE (18), the run line | Two GlyphLanes, each with a visible who-word: "[pv.suggest] Gemini: Domains · order · picks" and "[pv.app] App: practices · words · numbers". The Gemini lane lists only what geminiV4PartsOf says Gemini did on this draft (needs / order / picks). Then the integrity chip, which is integrityLine verbatim: «[pv.integrity] Gemini's reply: keys only · 0 words of its own», or its "2 area names picked from your words (not checked)" and "n not shown" variants. Or the rejected / refused banner unchanged, or RUN_STARTER_LINE verbatim when Gemini didn't answer. | Integrity chip button → integrityLine + the run line; (i) on the lanes → the lead line or GEMINI_V3_LEAD_LINE |
| depthLine (59) | StageLadder to 12; Domain chips "[s-know] Probability 34" and "[s-know] Inference 25"; «[t.span] review gap ≈ 110 d»; «[m.policy] App policy» | Policy chip button → depthLine |
| coverageJudgeLine (38, repeats the aim) | «[m.judge] yours to judge» | Chip button → coverageJudgeLine |
| The realism sentence (56) | TimeBar (§4.5), then StatRow "[quest.add] 3 new/wk · [ev.tested] 80% pass «reads high» · [m.queue] 92% cleared", and the verdict chip "[v.tight] Tight". While capacity is unverified the chip reads "[v.unv] Unverified · Tight" (verdictWord). While the pass rate calibrates, the pass item reads "[ev.tested] pass rate calibrating 12/30" and the TimeBar's realistic marker carries «best case». | (i: the realism sentence, which also holds "Unverified: your tracked time or your recurring tasks are still calibrating" when it applies); the TimeBar's group label is the same sentence |
| Task-time estimates (ChecksPanel, ThroughputPanel "n% sized by Gemini") | «[pv.suggest] 40% sized by Gemini» beside the median | Chip button → the throughput sentence |
| The exam waypoint (17, said twice) | Once, as the TimeBar's flag marker "4 May 27 · Retained" | The TimeBar's marker list (sr, and visible on its Dates toggle): examWaypointLine |
| scheduleBoundLine (30) | «[t.hourglass] set by reviews» | Chip button → scheduleBoundLine |
| NEVER_LOWERED_LINE (20) | – | (i) beside the choices |
| Choices | Words: "Use 12 Mar 2028", KEEP_MY_DATE, LOWER_DEPTH_WORD | – |
| paragonDepthLine (43) | RankSeal 34 with rank.6 idle (ink-mute, no padlock), plus 4 condition pips: L12 · final stage · practice kept · standard logged | The card Key: paragonDepthLine |
| ARRANGEMENT_V4_LINE (29) | «[pv.suggest] Gemini's order» | Chip button → the arrangement line |
| v3 / mixed: CONSTRAINTS_LINE, "n dropped · n matched", What was dropped | «[pv.suggest] Shown to Gemini · not checked», "3 dropped · 5 matched", and the link kept | Chip button → CONSTRAINTS_LINE |
| LEGACY_GEMINI_HIDDEN | Verbatim (8 words, honest) | – |

#### Screen 3: Next milestone card and outline (MilestoneCard, ItemRow, PracticeRow, TopicRow, DomainRow, ChecksPanel)

The card keeps three InfoTips: the card Key (in the heading), the capacity (i), the stage-why (i). Section subtitles and measure captions move to the Key or the row's ▸.

| Block today (words) | New visible form | Full text |
|---|---|---|
| Header: stage line, dates, the 'Milestone title' label | "[1] [stage.part] Familiar, part 1 · Probability, Inference → L6+"; "gives Aim rank [rank.2 active] Journeyman" (or "[rank.N done] keeps your rank"); "[t.cal] 5 Oct → 22 Nov · 7 wk [pv.app]". The title label is dropped; the title carries its own mark. | sr and the card Key: "dates set by the app"; the Key: givesRankLine |
| stageWhyLine | "[m.builds] Recall first" | (i: stageWhyLine) |
| 'Is this realistic?' (13 + 24) and TIME_FIXED_LINE (21) | CapacityGauge "need ≈ 3 h 20 · have ≈ 4 h 30 /wk" + the verdict chip "[v.fits] Fits", or "[v.unv] Unverified · Fits" while capacity calibrates | (i: the capacity lines + TIME_FIXED_LINE) |
| Aim check | «[v.unv] Aim not checked» + Add a figure | Chip button → AIM_UNCHECKED_LINE |
| Section heads and subtitles ('facts from your library…', 'what progress is judged by', 'sessions and minutes set by the app', 'you tick these once started') | "[s-know] Learn", "[track sigil] Practise", "[quest.step] Steps", "[quest.checkpoint] Checkpoint «context only»" | The card Key: one line per head |
| Kind labels ('Practice · Deliberate practice', 'Topic · Probability', 'Domain · created by you') | KindGlyph + the label | sr: the kind words |
| Provenance chips in draft-v4: 'added by the app' 17×, 'You wrote this' 12×, 'Written by the app' 6×, 'Your syllabus line' 6× (≈ 180) | Glyph-only ProvMark: [pv.app], [pv.you], [pv.syllabus], [pv.checked] | sr: the exact current words; the card Key lists all 8 classes |
| Gemini rows: 'Gemini suggestion · not checked' 25× (mixed), 'Gemini's choice among the app's options' 6× | Static chips that stay visible, each with its who-word: «[pv.suggest] Gemini · not checked», «[pv.kept] Gemini · kept · not checked», «[pv.pick] Gemini's choice · not checked» on a DRAFT row («Gemini's choice» once the row is kept) | sr: PROVENANCE_WORDS.DRAFT / .KEPT_SUGGESTION / GEMINI_CHOICE_WORDS (the visible label is aria-hidden); geminiChoiceLine in the row's ▸ |
| A plan-only edit of Gemini's words (EDIT_NUMBERS_NOTE) | «[pv.you] your numbers · Gemini's words» on the edited row | Chip button → EDIT_NUMBERS_NOTE |
| Choice lines ('2 options for this stage…') | – | The row's ▸ |
| Measure captions ('each recalled after a gap of about 12 days · tested by your reviews…') | A target meter "18 → 34 · L8+" with an [ev.tested] badge | The row's ▸: the gap and basis caption |
| 'Hold 34 cards at level N+ in Probability (now 18)' on every stage | The same target meter (figures are exempt) | sr and the row's ▸: the sentence |
| Blocking flags | "[i-flag] Health" (or another flag word) + the reason, visible, with Keep / Edit | Contract unchanged (D12) |
| HEALTH_LINE on body rows | One card chip «Not medical advice · ask a professional», unless a HEALTH flag on the card already shows it | Chip button |
| The add cluster on all 6 milestones (≈ 100) | One 44 px "+ Add" per milestone, which opens AddItemSheet; "it reads You wrote this" moves inside the sheet | Inside the sheet |
| Outline milestones (817) | Collapsed RouteRail nodes: "[3] [stage.retained] Retained · part 1 «[pv.suggest] Gemini · not checked» [quest.practice]2 [quest.step]2 [quest.checkpoint]1 ▸" | The items sit behind ▸, in the same row grammar |
| Footer | "[n] to decide" and Accept plan | – |

#### Screen 4: Living Aim header (AimHeader, ProficiencyBlock, PlanRanks)

The header keeps one (i) (next rank, parts, caption, plan line, change cause) and the chips' own panels.

| Block today (words) | New visible form | Full text |
|---|---|---|
| Aim, Area, date | The aim verbatim; "[s-craft] Trading · L6"; the date chip "[t.cal] L12 by ≈ Dec 2027" for the app's estimate (every estimate at month precision) or "[t.pin] 31 Dec 2027 · yours" for the user's own date; "[v.over] Over" when kept over | sr on ≈: "about"; the (i): "Mastered (level 12) by about … · estimate" |
| 'Next rank: Journeyman at milestone 2 · rank is kept for good' (11) | RankSeal 48 (aria-hidden) with "Aspirant" over "Aim rank"; the label carries sr ", 2 of 7, kept for good". "Next · [rank.2 active] Journeyman · milestone 2" | (i: nextRankLine) |
| Caption 'tested by your reviews and your ticks · measured 09:12' | "41% [ev.tested][ev.tick] · [ev.measured] 09:12" over "Proficiency → L12". A SELF_REPORTED reading adds the visible words "from your ticks" beside the %. | sr and the (i): the caption |
| Parts line (15) | Three mini-meters: "[s-know] 55% · [ev.tick] 23% · [m.seal] 1/6" | (i: proficiencyPartsLine) |
| 'Plan v1 · accepted 5 Oct 2026 · the date the app set on 5 Oct 2026' | – | (i) |
| Depth plan: depthLine (59), coverageJudgeLine (38), exam waypoint (17) | «[m.policy] App policy», «[m.judge] yours to judge», "[quest.checkpoint] Exam 4 May 27" | Chip buttons; the exam sentence in sr and the (i) |
| Change: "↓ 1 since Sun", Target lowered twice, the Changed line (16) | "↓ 1 since Sun" kept; «[m.down] Target lowered 46 → 38» once | (i: proficiencyChangeLine and the Changed line) |
| AIM_UNCHECKED_LINE (12) | «[v.unv] Aim not checked» + Add a figure | Chip button |
| WRITES_OFF_BANNER (live server) | «[m.info] writes off» | Chip button → WRITES_OFF_BANNER |
| More than 6 SEEN events pending (H13) | "Since you last looked: milestone 2 reached · date moved to 7 Mar" (SINCE_LINE, ≤ 3 items, then "+ n more") | (i): the rest of the list |
| Aim ranks on this plan | ▸ unchanged | – |

#### Screen 5: the Now section

| Block today (words) | New visible form | Full text |
|---|---|---|
| Heading, window ('day 39 of 77') | "Now · milestone 2 of 6" and a static elapsed bar "day 39/77" | – |
| Headline %, evidence, pay, pace | "23% [ev.tested] · [ev.measured] 09:12"; Meter with a floor tick at 70%; "pays [c-mp] 6 × progress «from 70%»"; "[pace.on] On pace · 7 Mar" in ink, plus «best case» when the pace rests on a calibrating pass rate | (i: the PaysLine sentence) |
| A milestone that pays nothing (statedLine with a zero reason) | «[m.nopay] pays nothing» | Chip button → statedLine with its reason ("knowledge is paid by reviews") |
| Week-quest footer (25) and legend | "Week quests · until Sun «[m.nopay] pays nothing»" | The card Key: weekQuestsFooter + weekQuestsLegend |
| RAISE row and its due line | "[quest.bring + ev.tested] Bring 3 cards … to level 6+ · 1 of 3 cards" + PipStrip "Tue 1 · Wed 2 · Sat 1" | sr and the row's ▸: the due sentence |
| ADD row and its quota line (14) | "[quest.add + ev.counted] Add 5 cards … · 2 of 5 cards [m.link]" | sr and the row's ▸: the quota line |
| PRACTICE rows and 'the milestone counts 80% of these' | "[quest.practice (plan's track) + ev.tick] Backtest · 3 × 45 min · 1 of 3 sessions" | The card Key: PRACTICE_KEEP_SHARE_LINE |
| STEP row | "[quest.step + ev.tick] Set a maximum daily loss · 0 of 1 step" | – |
| Past week quests (5 rows) | One five-week SegmentStrip, with HeldGlyph on held days | ▸ the list |
| Measures: '+5 of 21 since start · holding 26 of 42 · 21 already counted' (15), the gap caption (15), the pipeline line (21) | "[s-know + ev.tested] Position Sizing, Risk Management · L6+ · 23%", a meter from last seen (same basis), "+5/21 since start" | The row's ▸: holding, already counted, gap, pipeline |
| Practice kept | Meter 50% "22/44" | – |
| Domains | "[s-know] Risk Management 47 · 24 at L6+" with an L5 badge, actions kept | – |
| Practices: practicePlanLine (22) | PromiseRing "10/16 kept" (its dashed track keeps the house meaning, calibrating), "3× · 45 min ≈ 2 h 15/wk" | The card Key: "worked out from your hours" |
| Checkpoint: 'no score logged yet · your bar 8 of 10 · doesn't move your progress' | "[quest.checkpoint] bar 8/10 «context only»" + Log a score | The card Key |
| Behind: banner (34) and 'What acts on Milestone 2' (44) | «[pace.behind] Behind on new cards · 4 of 9»; the levers stay as action buttons | Chip button → the banner sentence; (i) → the levers' explanation |
| Body rows, Gemini titles, the paused-by-your-answer line | One health chip per card; Gemini chips kept with their who-word; the paused line verbatim | – |

#### Screen 6: Milestones list, Toward the aim, footer

| Block today (words) | New visible form | Full text |
|---|---|---|
| Rows such as 'Reached 18 Dec 2026 · 4 Oct 2026 – 20 Dec 2026 · 100% → Aspirant' | RouteRail nodes, one per MilestoneRowState (§4.5): reached "[disc + rank.1] 1 Foundation 100%"; pending "2 · Reached · counts from Thu" on a dashed node (not yet counted); current "2 Risk and position sizing 23%" with its measured arc; closed unreached "Closed at 82% · not reached" on a struck node; past due "Past due" with [i-flag]; outline: a thin ring with a [pv.suggest] badge and «Gemini · not checked»; planned / later: a thin ink-mute ring; held: a ring with its HeldGlyph; dropped: struck; slipped: the word "Slipped" | ▸ on each row: the date span, "gives Aim rank Aspirant", the reached date, pendingReachLine, closedUnreachedLine or pastDueLine |
| Toward: '+6 of 40 since you began · holding 12 of 46', the gap / test / measured caption, '39 sessions · from your ticks · context, not part of progress', the rebase note (11) | Meter "12% [ev.tested]", the milestone SegmentStrip, "+6/40", "[ev.tick] 39 sessions «context only»" (no ≈: a tick count is exact) | (i: holding, gap, measured time, rebase note) |
| The honesty note (33–39, repeats the aim) | «[m.judge] yours to judge» | Chip button → the full note |
| Actions | Re-plan, Archive, Mark done; Set a new aim once closed | – |

#### Screen 7: Start sheet (StartSheet)

The sheet keeps three InfoTips: its Key (target reason, TIME_FIXED_LINE, pay details, preview footer), the NEEDS (i) on the Today section, and the gate (i).

| Block today (words) | New visible form | Full text |
|---|---|---|
| Target choice and today's check reason (20) | "Use 42" / "Keep 46 — Over" with its switch; "[v.over] Over" | The sheet's Key: the reason |
| TIME_FIXED_LINE (21) | CapacityGauge + verdict chip ("Unverified ·" while calibrating) | The sheet's Key |
| 'What goes to Today' rows with why lines | KindGlyph + label + provenance chip or ProvMark. A row that needs a check shows [m.lock] and "I checked this". | (i) on the section: the NEEDS why lines |
| Practices | Switch + XP price (existing) | – |
| Pay paragraph (25) and limit line (18) | "pays [c-mp] 6 × progress «from 70%»" with a floor tick; «[pv.app] rests on an added practice» when restsOnAddedLine applies | The sheet's Key: due date, "once 21 days old", the limit line; chip button → restsOnAddedLine |
| Week-quest preview footer (20) | "[quest.bring]3 [quest.add]5 [quest.practice]3 [quest.step]1 «pays nothing»" | The sheet's Key: the preview footer |
| Rank line | "gives Aim rank [rank.2 active] Journeyman", or "[rank.N done] keeps your rank" | – |
| The duplicated activity card (156) | "[s-body] Waiting on your answer about activities →", a jump link to the page's card | The page's card |
| 'Start is offered when every row going to Today is yours or written by the app · n rows left' | "2 rows left", then Next row to check / Start milestone 2 | (i: the gate sentence) |
| HEALTH_LINE, held practices | One health chip; "Not added to Today" kept as words | – |

#### Screen 8: Activities to avoid (ActivityConfirmCard, IntakeActivities). Safety surface, static.

The consent text stays word for word. Only repetition and the how-to paragraph move.

| Block today (words) | New visible form | Full text |
|---|---|---|
| Lead line and question | activityLeadLine kept (quotes once) + ACTIVITY_QUESTION verbatim | – |
| Rows with the quote repeated under each (3 × 8) | [sess.*] + session name + checkbox. A pre-ticked row adds [m.quote]. A ticked row shows its session glyph struck and the word "avoid". | sr and the card Key per row: "From your words: “…”" |
| ACTIVITY_HOW_LINE (31) | – (its decisive clause is on screen in the save line) | (i), opens instantly |
| The pending line | Verbatim, led by [s-body] | – |
| HEALTH_LINE | «[safe.health] Not medical advice · ask a professional», one per card | Chip button |
| The save line | activitySaveLine verbatim beside the Save button: "The plan leaves out 3 and can include the other 2." | – |
| Buttons | Words: Save my answers / Nothing to avoid / Confirm these / Change | – |
| The aim-conflict line (26) | «[m.clash] May clash with your aim» | Chip button → aimConflictLine |
| The answered summary | activitySummaryLines verbatim: "You said to avoid: Longer session (2 Jan)." and "The plan can include: Harder session and Easy session.", each session name beside its glyph (struck for avoided, i-check for can include); Change; the health chip | – |
| The stale line | Verbatim | – |

#### Screen 9: Aim card on /you (AimCard)

| State | New visible form | Behind (i) or sr |
|---|---|---|
| ACTIVE | The aim, clamped to 2 lines; "[s-craft] Trading · L6"; "[t.cal] L12 by ≈ Dec 2027" (or "[t.pin] … · yours"); «Aim not checked» when it applies; RankSeal 40 with "Aspirant / Aim rank"; "41% / Proficiency → L12" with [ev.tested] [ev.measured] 09:12 and its Meter ("from your ticks" when self-reported); a RouteRail strip "Milestone 2 of 6 · 23% · [pace.on] On pace" whose current node is the measured arc; a Gemini chip with its who-word when the title is DRAFT or KEPT; «[m.info] not recorded here» on a writes-off server; PromiseRing "2/5 Week quests →"; Open roadmap | (i: parts, next rank, "rank is kept for good", the caption) |
| ACCEPTED | "[1] Start milestone 1 →"; "pays [c-mp] 6 × progress «from 70%»"; «[ev.measured] at acceptance» beside the % | Chip button → acceptanceCaption; (i: the parts) |
| PENDING_REACH | "Milestone 2 reached · counts from Thu" visible; the strip's node is dashed (not yet counted); no seal, no rank motion | (i: rankPendingLine in full) |
| PAST_DUE | pastDueLine verbatim | – |
| Fallen | "↓ 1 since Sun" | (i: the cause) |
| Re-plan | «[m.down] Target lowered 46 → 38» | (i: the Changed line) |
| ASK | Heading "Set an aim"; the textarea (placeholder AIM_CALL_PLACEHOLDER, aria-describedby → the (i) panel); an unlit RankSeal 34; [route], static; the button; last aim "[rank.6 done] Aim rank Paragon · reached 6 Aug 2026"; the seed line kept. Stays ≤ 410 px. | (i: AIM_CALL_BODY + AIM_CALL_RANK_LINE) |
| DONE, reached | The full RankSeal of the rank held + [m.seal]; "Aim reached 18 Dec 2026"; the last %; Set your next aim | – |
| DONE, closed unreached | The RankSeal of the rank actually held, no [m.seal]; "Closed 18 Dec 2026 · the aim wasn't reached" verbatim; the last %; Set your next aim | – |
| RUNNING | "[route.weave] Drafting · started 09:12" over the weave band, with the 40 px pause button in the row | – |
| DRAFT | "Draft waiting →" | – |

The Aim card's (i) count is 1, plus its chips.

#### Screen 10: Today week quests (WeekQuests, variant 'today')

| Block today (words) | New visible form | Full text |
|---|---|---|
| Heading | "Week quests · Milestone 2", "until Sun", «[m.nopay] pays nothing» | – |
| Legend (15) and footer (25) | – | The card Key: legend + footer |
| Rows | KindGlyph with its evidence badge, the code-owned label (≤ 8 app words), "n of N unit", a thin meter; PipStrip on RAISE; [m.link] on quota rows | sr and the card Key, per row: the quota line, placeSuffix ("· in Must"), the due sentence |
| Row overflow | At most WEEK_QUEST_ROWS_TODAY (3) rows, then "n more" | – |
| Body plan: HEALTH_LINE under every practice row | One «Not medical advice · ask a professional» in the heading | Chip button |
| Slip explanation | "↓3" kept | The card Key |

#### Screen 11: Today aim line (AimLine)

| State | Today | New (≤ 8 app words, ≤ 2 lines) |
|---|---|---|
| SET | "A new week. Set an aim: what do you want to be able to do in a year or three?" | "**A new week.** Set an aim." (likewise A new month / Welcome back) |
| NEXT | "Your last aim is done. Set the next one: what do you want …" | "**Last aim done.** Set the next." |
| DRAFT | 8 words | "**Draft waiting** for your check." |
| START | "Milestone 5 · Mastered, part 1 is ready to start. Reaching it gives the Aim rank Expert." | "**Milestone 5 · Mastered, part 1 is ready.** Gives [rank.4 active] Aim rank Expert." (7 app words; the verb stays, so a rank not yet held never reads as held) |
| START, keeps rank | – | "[rank.N done] Keeps your rank." |

The year-or-three question moves to the ASK card's (i) and the intake Key. The 40 px × and its "Not now…" label are unchanged. The line stays static: no draw, no chime.

#### Screen 12: Roadmap tab (EmptyRoadmap, DraftRunning, the closed footer)

| State | New visible form | Full text |
|---|---|---|
| Empty (52) | An unlit RankSeal 72, [route], the heading "Set an aim" and its button, over the unlit horizon SVG | (i: AIM_CALL_BODY + AIM_CALL_RANK_LINE) |
| Drafting (26) | Verbatim in aria-live: "Drafting · 1 draft · started 09:12:04 · usually about 18 s"; [route.weave] (32 px) above; the weave band; a 40 px pause button (icon only, aria-label "Pause animation", aria-pressed) in the card's heading row, never on the band. No bar, no % and no 'spin'. | – |
| Done, reached (194) | Full RankSeal + an [m.seal] stamp; "Reached 18 Dec 2026 · Aim rank Paragon · 96%"; the milestones as a read-only RouteRail; eyebrow "History" | (i: AIM_HISTORY_LINE); ▸ on each node |
| Done, closed unreached | The RankSeal of the rank held, no [m.seal]; "Closed … · the aim wasn't reached"; the read-only RouteRail | (i: AIM_HISTORY_LINE) |
| Legacy (52) | The banner, kept as a chip | Chip button → the legacy banner |

---

## 4. Animated glyph catalogue

### 4.1 Grammar (glyph-check enforces all of it)

- **Box and stroke.** 24 × 24 viewBox. Stroke 1.75 (1.5 when idle; 2 inside 12 px chips and badges). Round caps and joins.
- **Fill and colour.** Fill none except in a solid state. currentColor only.
- **Parts.** At most 6 paths. No filters, gradients, masks, or SVG text inside a glyph. Every stroked path has `pathLength="100"` and a `data-part` (rim | mark | solid | badge | ring | ping).
- **Delivery (D3).** Glyphs that can animate are inline (stage, rank, quest, verdict, the Gemini provenance glyphs, misc, flame). Static families (evidence, safety, session, time, and the ProvMark glyphs) are `<symbol>`s in the route's `GlyphDefs` block, drawn with `<use href="#gd-{route}-{name}-{state}">`. A crossfade (CHANGED) animates the `<svg>` box's opacity, so it works on a `<use>` glyph too.
- **States** differ in shape or fill, never in colour alone:

  | State | Look |
  |---|---|
  | idle | outline in ink-2; ink-mute for locked or beyond-plan non-text marks (≥ 3:1) |
  | active | outline in ink-0, plus a shape cue: the here-ring when the glyph stands alone, or the family's "started" mark (quest glyphs: a solid started pip) |
  | done | solid ink-0, or a check badge |

- **Reserved meanings (D29).**
  - dashed = calibrating or not yet counted (the house meaning: PromiseRing, DaySeal, EmblemCoin locked);
  - dotted = from your ticks (self-reported);
  - ≈ = estimate (an estimate never gets a dashed rim);
  - the balloon shapes (`pv.suggest` family) and `v.unv` = not checked;
  - the kit HeldGlyph = held;
  - struck = avoided, dropped, closed or pays nothing.
- **Sizes.** 12 in chips; 16 in row leads and Domain rows; 20 for KindGlyph, Today rows and the aim line; 24–28 for route nodes; 32 for drafting. RankSeal comes in 34, 40, 48 and 72.
- **Badges.** 12 px on a --card disc with a 2 px ring. Evidence goes bottom-right; the done check goes top-right. A badge path has at most 2 subpaths (3 for the tally in `ev.counted`) and no feature under 3 units, so it reads at 12 px on the Fold cover at 100% and 200% zoom.
- **A11y.**
  - A glyph next to a word is `aria-hidden`.
  - A static chip or mark: its glyph and short visible label are aria-hidden; the full string is sr-only and read exactly once. No `title`.
  - A compact figure: aria-hidden, with its spoken twin sr-only (D26).
  - A glyph standing alone gets role="img" and the full words as aria-label.
  - A focusable glyph is always a real button with a 40 or 44 px box measured on the button itself (D31).
- **Colour.** Ink only: no gold, --mp, --xp, --owed or --light (D22).
- **SSR.** The server renders the end state for the given state. Motion only shows the way there, and never hides a part of an element that is already on screen (D30).

### 4.2 Reused unchanged (kit sprite, drawn with `<Icon>` / `<Sigil>`)

- Icons: i-gear, i-lock, i-check, i-clock, i-flag, i-share, i-plus, i-chev, i-x, i-dot3.
- Track sigils: s-body, s-duty, s-craft, s-care, s-know.
- Currency: c-mp, c-xp.
- HeldGlyph: freeze, rest, sick, away.

glyph-check asserts that no glyph path duplicates a kit path.

### 4.3 Absorbed from RoadmapGlyph.tsx (it becomes an alias in R0)

| Old | New | | Old | New |
|---|---|---|---|---|
| minus | m.minus | | v-fits | v.fits |
| down | m.down | | v-tight | v.tight |
| info | m.info | | v-over | v.over |
| cal | t.cal | | v-imp | v.imp |
| route | route | | v-fitted | v.fitted |
| step | quest.step | | v-unv | v.unv |
| target | quest.checkpoint | | edit | pv.you |
| tick | pv.checked | | GlyphButton | glyph/GlyphButton |

### 4.4 Glyph families

Path data is given where the design fixed it. Everything else is drawn to the grammar, and its shape is pinned by glyph-check once drawn.

**Stage: the cairn** (`paths/stage.ts`)
- One stone is `stone(w, y) = M(12−w/2) y q(w/2) −3 w 0 q−(w/2) 2.2 −w 0 z`. Stones are laid bottom-up at (16, 19.5), (13, 15.5), (10, 11.5) and (7, 7.5). The orb is a circle at (12, 3.6), r 1.6.

| Glyph | Means | Shape |
|---|---|---|
| stage.foundation | Foundation, L4 | 1 stone |
| stage.familiar | L6 | 2 stones |
| stage.retained | L8 | 3 stones |
| stage.fluent | L10 | 4 stones |
| stage.mastered | L12 | 4 stones + orb |
| stage.toward(gate) | "Toward X" (keeps the rank) | the gate's cairn; its top stone is only its top arc |
| stage.part(gate) | "X, part n" | the gate's cairn; the right half of its top stone is left off |
| stage.track(n) | track plans STAGE_1…5 | n stones; the 5th is the orb |

- States: idle (future) is an ink-2 outline at 1.5. Active (current) is an ink-0 outline scaled .8 inside the static here-ring (circle r 11, stroke 1.25). Done (held, counted) fills the stones and orb in ink-0.
- Motion `build` (SEEN): see §4.7.

**Rank** (`paths/rank.ts`, drawn by RankSeal)
- Rim: circle r 10.
- Notch i, for i < index: a radial tick from r 6.2 to r 8.2 at −90° + 60°·i.
- Centre: a filled dot (r 1.3) for Initiate; a hex outline (r 2.6) for Aspirant to Virtuoso. Paragon has all 6 notches, a filled hex and a rim of 2.25.
- States:
  - idle (not reached, beyond the plan's top rank, or Paragon on a draft): ink-mute rim at 1.5, notch slots as dots, no centre;
  - active (the next rank, "gives"): ink-2 rim, the held ticks in ink-0, the new slot as an open dot;
  - done (held for good): rim and ticks in ink-0, solid centre.
- No padlock badge (D5). "Kept for good" is in the label's sr text and the (i).
- At 48 px, a 7-pip ladder sits underneath: held pips solid, the next one a ring, beyond-plan pips ink-mute.

**Quest kinds** (`paths/quest.ts`, drawn by KindGlyph)

The active state adds the started pip: a solid dot r 1.6 at (4.5, 19.5), `data-part="solid"`. The adjacent "n of N" text says the same in words.

| Glyph | Kind · evidence | Idle / active / done |
|---|---|---|
| quest.bring | RAISE · tested by your reviews | The s-know book with an up-chevron on its right page. Outline ink-2 (0 of N) / ink-0 + started pip (1+) / pages filled plus a check badge |
| quest.add | ADD · counted | A card outline (rect 6,4 12×16 rx 2) with a plus / + started pip / card filled plus a check badge |
| quest.practice | PRACTICE · your ticks | The PLAN'S OWN track sigil; today every Practice row shows craft / + started pip / sigil filled plus a check badge |
| quest.step | STEP · you tick it | The stair, with a 2.5 dot on the bottom tread / the dot on the middle tread / the dot on the top tread plus a check badge |
| quest.checkpoint | CHECKPOINT · you log it; also the exam marker | The target / + started pip / inner disc filled |

**Evidence badges** (`paths/evidence.ts`; static at every level; ≤ 2 subpaths, the tally 3)

| Glyph | Means | Path |
|---|---|---|
| ev.tested | tested by your reviews | one arc and one arrowhead: `M18.5 12a6.5 6.5 0 1 1-1.9-4.6M17 3.8v3.8h-3.8` |
| ev.counted | counted by the app | three tally strokes: `M8 6v12M12 6v12M16 6v12` |
| ev.tick | from your ticks | rect 4.5,4.5 15×15 rx 3 + `M8.5 12.3l2.5 2.5 4.5-5` |
| ev.log | you log it | a clipboard (board + clip, 2 subpaths) |
| ev.estimate | estimate (≈) | `M5 9.5c2.3-2 4.7 2 7 0s4.7-2 7 0M5 15c2.3-2 4.7 2 7 0s4.7-2 7 0` |
| ev.measured | measured at (time) | i-clock, reused. Only ever beside a measured time (D27). |

**Provenance** (`paths/provenance.ts`)

| Glyph | Words (sr, exact) | Shape | Visible chip (D25) |
|---|---|---|---|
| pv.suggest | PROVENANCE_WORDS.DRAFT | A speech balloon with a dashed rim (2.4 / 2.2): `M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-8l-4 3.5v-3.5H5a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 5 5.5z` | "Gemini · not checked" |
| pv.kept | PROVENANCE_WORDS.KEPT_SUGGESTION | The balloon with a solid pin inside | "Gemini · kept · not checked" |
| pv.pick | GEMINI_CHOICE_WORDS | Three option dots, the middle one inside a small balloon outline | "Gemini's choice · not checked" on a DRAFT row; "Gemini's choice" once kept |
| pv.integrity | integrityLine | A solid-rim balloon with a check inside | integrityLine verbatim |
| pv.app | "Written by the app" / "added by the app" / "worked out by the app" | i-gear | none (glyph only) |
| pv.you | "You wrote this"; also the user's own declared figures ("yours") | the edit pen | none, or "yours" beside a figure |
| pv.checked | "You checked this" | a circle with a check | none |
| pv.syllabus | "Your syllabus line" | a scroll | none |

**Honesty and safety** (`paths/safety.ts`; static at every level)

| Glyph | Means | Shape |
|---|---|---|
| safe.health | Not medical advice | A bandage (a rounded rect at 45° with 4 dots). Distinct from h-sick and s-duty. |
| safe.strike | avoid (an overlay, never alone) | One diagonal stroke drawn over the row's own `sess.*` glyph (`data-part="mark"`). There is no pill shape anywhere: a pill reads as medication advice on a body plan. |
| safe.in | can include | the kit i-check, beside the session glyph and its name |
| safe.ask | waiting on your answer | A circle with "?" |
| m.quote | from your words | A double quote mark |
| m.verbatim | shown exactly as written | Quote marks with a small lock |
| m.policy | the app's policy, not facts | A ruler |
| m.judge | yours to judge | A balance scale |
| m.nopay | pays nothing | The hex-nut outline struck through (ink, not --mp) |
| m.clash | may clash with your aim | Two arrows meeting head-on |

**Session kinds** (`paths/session.ts`; static; the session name always sits beside, including in the answered summary)

| Glyph | Catalog key | Shape |
|---|---|---|
| sess.easy | EASY_SESSION | a gentle wave |
| sess.mobility | MOBILITY_SESSION | an arc arrow round a joint dot |
| sess.technique | TECHNIQUE_SESSION | a plumb line and bob |
| sess.harder | HARDER_SESSION | two steep chevrons |
| sess.longer | LONGER_SESSION | a double arrow between end ticks |
| sess.strength | STRENGTH_SESSION | a dumbbell |
| sess.full | FULL_ATTEMPT | a peak with a summit pennant |
| sess.perf | PERFORMANCE_CHECK | a stopwatch |

Each has a struck variant (`+ safe.strike`) for an avoided session.

**Verdicts** (`paths/verdict.ts`, the existing shapes)
- The glyphs: v.fits (circle-check), v.tight (half-filled circle), v.over (triangle with !), v.imp (slashed circle), v.fitted (sliders), v.unv (dashed circle-check).
- Idle means an option not chosen (ink-2). Active means the chosen option (ink-0, pressed). There is no done state.
- A verdict is always shown with its word, and only inside a verdict chip (D27). When verdictWord adds "Unverified ·", the chip shows `v.unv` before the verdict's own glyph.

**Time and pace** (`paths/time.ts`; ink, static)

| Glyph | Means | Shape |
|---|---|---|
| t.cal | a date set by the app | the calendar (existing) |
| t.cal-moved | the app's date moved | the calendar plus an arrow (→ later, ← earlier) |
| t.pin | your own date | a map pin outline; always with the word "yours" |
| t.earliest | earliest if every review passes | a thin tick with an open ring head (a ghost marker; not dashed) |
| t.span | the review gap | an arc jumping between two short ticks (distinct from sess.longer); always with the words "review gap" |
| t.hourglass | set by reviews (schedule-bound) | an hourglass |
| pace.on | on pace | a straight arrow |
| pace.behind | behind | an arrow with a broken shaft |

**Misc** (`paths/misc.ts`)

| Glyph | Means | Shape |
|---|---|---|
| m.link | counts toward another quota | a chain link |
| m.builds | builds on the previous stage | two nodes joined by a link |
| m.lock | still needs your check (its only meaning, D5) | a padlock whose shackle is a separate part (for `unlock`) |
| m.seal | reached (counted) | a notched circle with a check |
| m.queue | the share of the queue cleared | a tray with two stacked cards (neutral; no verdict meaning) |
| m.pause | pause an animation | two bars; drawn only on the WAIT pause button |
| intensity.light / .steady / .push | Light / Steady / Push | three bars of rising height with 1, 2 or 3 of them solid; the % stays beside |
| route | the aim route (existing) | – |
| route.weave | drafting | the route path in ink-2 with two strands crossing it (a static shape, no dash; it breathes in opacity only, §5.7) |
| m.minus, m.down, m.info | existing | – |

**Flame** (`paths/flame.ts`; phase 3, for streak surfaces; not the review combo)
- flame.unlit: the i-flame path as an outline, ink-mute at 1.5.
- flame.lit: filled currentColor.
- flame.kept: filled, with its core `M12 18.5a2.2 2.2 0 0 1-2.2-2.2c0-1.4 1.1-2.3 2.2-3.6 1.1 1.3 2.2 2.2 2.2 3.6a2.2 2.2 0 0 1-2.2 2.2z` cut out in --card.

### 4.5 Composite components

All of these live in `src/components/glyph/`. They are server-safe unless marked "client". Every one is sized from the 278 px content box at 344 (§7); none carries SVG `<text>` (all text is HTML, so no viewBox can shrink it below 12 px).

| Component | Props | What it draws | Motion |
|---|---|---|---|
| `GlyphDefs` | `route, families` | One hidden `<svg width="0" height="0" style="position:absolute">` holding the `<symbol>`s of the static families the route uses, ids `gd-{route}-{name}-{state}`. Emitted once by the page (a server component), never by layout.tsx. Glyphs carry no gradients, so a copy inside a route hidden by Activity still resolves. | none |
| `Glyph` | `name, state?='idle'\|'active'\|'done', size?, label?, badge?, track?, n?, className?` | `<svg class="mg" data-g data-s viewBox="0 0 24 24">`: inline paths for animatable families, `<use>` for static ones | none on its own; `usePlayOnSeen` / ACT handlers drive it |
| `KindGlyph` | `kind: 'raise'\|'add'\|'practice'\|'step'\|'checkpoint', track?, evidence, state, size=20` | the quest glyph (with the started pip when active) plus an evidence badge; sr = WEEK_QUEST_CAPTIONS[kind] | `quest-done` |
| `ProvMark` | `cls` | a glyph-only provenance mark; aria-hidden glyph plus the exact current words sr-only | `pv-confirm` |
| `HonestyChip` (client only when `full` is set) | `kind, full?, id?` | The kit `.chip` look, 24 px visual, 12/600. No dashed rim (estimates use ≈; "not checked" is the balloon glyph). With `full`: a `<button>` whose own box is at least 40 × 40 (min-height and min-width 40 px, negative block margins of 8 px: the `.rm-ilink` pattern), with aria-expanded and aria-controls pointing to the panel that holds the full text, placed right after the button in DOM order. Without `full`: a static chip whose glyph and label are aria-hidden and whose full string is sr-only, once; no `title`. Chip rows: column gap ≥ 8 px, row gap ≥ 16 px. | `tip-open` (ACT) |
| `InfoTip` (client) | `topic, variant='info'\|'key', id, describes?, children` (`describes`: the id of the control it explains) | A 40 × 40 button with the m.info glyph, aria-label "About {topic}", aria-expanded, and aria-controls = `id`. The panel is in server markup with `hidden`, right after the button in DOM order, and opens full width under the button's row, 13/18, ink-1. The control it explains carries `aria-describedby={id}` (a description works while the panel is hidden). Escape closes it and returns focus. At most 3 per card, the Key included (D13). `variant="key"` lists each glyph used in the card with its words, and every per-row sr string of the card. | `tip-open` |
| `GlyphStat`, `StatRow` | `glyph, value, unit, label, estimate?, evidence?, unverified?, bestCase?, calibrating?: {n, need}` | Glyph + figure + unit word in tabular numerals; the compact text is aria-hidden and `figureSpeech(value, unit, flags)` renders the sr twin (D26). `estimate`: an ≈ (spoken "about"). `unverified`: the verdict reads "Unverified · …". `bestCase`: a visible «best case» chip. `calibrating`: the figure is replaced by "pass rate calibrating n/need". A figure with any of these flags never animates. | none |
| `GlyphLane` | `who: 'gemini'\|'app', items, full` | The glyph, the visible who-word ("Gemini:" / "App:") and 1–2-word items. Gemini's items come from geminiV4PartsOf (needs, order, picks); an item Gemini did not touch on this draft is not listed. The full lead is in the lanes' (i). | none |
| `RankSeal` | `index, top, size: 34\|40\|48\|72, state, seenKey?, label` | The rank geometry above. aria-hidden whenever its label is rendered beside it; the label then carries sr ", 2 of 7, kept for good". Standing alone, it is role="img" with aria-label "Aim rank Aspirant, 2 of 7, kept for good". No padlock. No numeral below 12 px. | `rank-rise` (SEEN) |
| `StageLadder` | `depth, chosen, exam?, gapDays?` | An HTML/CSS grid, `grid-template-columns: repeat(12, 1fr)`, 100% of the content box (≈ 23 px per rung at 278; 32 px from 600 px of container), 56 px tall. Gate rungs 4, 6, 8, 10 and 12 carry a 12 px cairn glyph above and a 12 px HTML numeral below. Ink-0 up to the chosen depth, ink-mute above; a ⚑ at the exam level; the gap bar is a %-positioned SVG with no viewBox and no text. aria-hidden. Hidden on track plans. | `ladder` (ACT) |
| `TimeBar` | `today, realistic: {day, estimate, bestCase}, earliest?, exam?, mine?, verdict, seenKey` | Root `role="group"` with aria-labelledby → the realism sentence. The line and markers are an aria-hidden SVG positioned in % (no viewBox scaling): a line from today to the realistic date; a t.earliest ghost tick; a quest.checkpoint flag for the exam; a t.pin for your date; a ◆ with ≈ (and «best case» when bestCase) for the realistic date. Labels are 12 px HTML spans placed by the server from estimated text width (a character-width table for the UI font) plus an 8 px gap: row 1, else row 2, else row 3; a label that still collides is not drawn and stays in the list. Height 52, 68 or 84 px by row count, decided on the server (no layout shift). A sibling `<ul class="rm-tb-list sr-only">` holds one item per marker with its full sentence (examWaypointLine; "earliest if every review passes: …"; "your date: …"; the realistic date "about …, an estimate"); a 40 px "Dates" toggle makes that same list visible for touch users. | `date-moved` (CHANGED) |
| `RouteRail` | `nodes: [{n, stage, state, pct?, rankIndex?, gives?, titleClass?, label, countsFrom?, closedPct?}], orientation: 'vertical'\|'strip', seenKey` | One state per MilestoneRowState: **reached**: a solid ink-0 disc with the rank or cairn cut out in --card; **pending** (PENDING_REACH): a dashed ring (not yet counted) and the visible words "counts from Thu"; **current**: a here-ring with an arc at the measured % (PromiseRing geometry); **closed** (CLOSED_UNREACHED): a struck ring and "Closed at 82% · not reached"; **past due**: a ring with i-flag and "Past due"; **outline**: a thin ring with a [pv.suggest] badge; **planned / later**: a thin ink-mute ring; **held**: a ring with its HeldGlyph; **dropped**: struck; **slipped**: a ring and the word "Slipped". Segments: 2 px ink-0 up to the last counted reach, 1 px ink-mute after it, never dashed. Vertical rows are 44 px `<details>`. The strip is a `repeat(n, 1fr)` grid of 16 px nodes inside 278 px; its current node is the measured arc, never a half disc. role=list, one label per node. | `reach` (SEEN, counted reach only), `start` (ACT). Never pulses. |
| `PipStrip` | `days: [{key, n, today?, past?}], label` | Seven 12 px HTML day letters with counts; today outlined, past days ink-2. role=img with the full label. | static |
| `CapacityGauge` | `need, have, unit, verdict, unverified?, label` | Two 6 px bars on one scale, 12 px HTML figures with ≈, and a verdict chip with verdictWord(verdict, unverified) | static |
| `GlyphButton` | moved from RoadmapGlyph | a 44 px icon button | – |

### 4.6 HonestyChip kinds

Every kind keeps a visible word. The full string is the exact current constant. Visible labels are new `SHORT_*` constants (R0, §9.3) unless marked "verbatim". "Button" means the chip opens a panel; a static chip is read once through its sr text and is listed in the card Key.

| Kind | Glyph | Visible label | Full string | Button? |
|---|---|---|---|---|
| gemini | pv.suggest | Gemini · not checked | PROVENANCE_WORDS.DRAFT | no (row mark; card Key) |
| gemini-kept | pv.kept | Gemini · kept · not checked | PROVENANCE_WORDS.KEPT_SUGGESTION | no |
| gemini-pick | pv.pick | Gemini's choice · not checked (a DRAFT row) / Gemini's choice | GEMINI_CHOICE_WORDS (+ geminiChoiceLine in the row's ▸) | no |
| integrity | pv.integrity | integrityLine, verbatim | integrityLine + the run line | yes |
| constraints | pv.suggest | Shown to Gemini · not checked | CONSTRAINTS_LINE | yes |
| credential | pv.suggest | Gemini's guess | CREDENTIAL_LINE | yes |
| arrangement | pv.suggest | Gemini's order | ARRANGEMENT_V4_LINE / ARRANGEMENT_LINE | yes |
| sized-by-gemini | pv.suggest | n% sized by Gemini | the throughput sentence | yes |
| edit-numbers | pv.you | your numbers · Gemini's words | EDIT_NUMBERS_NOTE | yes |
| health | safe.health | Not medical advice · ask a professional | HEALTH_LINE | yes |
| data | i-share | Google may use this | FREE_TIER_LINE + privacyLine | yes |
| no-key | pv.app | from your numbers | NO_KEY_LINE | yes |
| policy | m.policy | App policy | depthLine | yes |
| judge | m.judge | yours to judge | coverageJudgeLine / the Toward honesty note | yes |
| schedule | t.hourglass | set by reviews | scheduleBoundLine | yes |
| aim-unchecked | v.unv | Aim not checked | AIM_UNCHECKED_LINE | yes |
| unverified | v.unv | Unverified · {verdict} (verdictWord, verbatim) | the realism or capacity sentence | no (it is the verdict chip; the card's (i) holds the sentence) |
| best-case | ev.estimate | best case | the pace or realism sentence ("best case — your pass rate is still calibrating") | no |
| calibrating | ev.tested | pass rate calibrating n/30 | the realism pass line | no |
| estimate | – | ≈ (prefixes the figure) | "about …" (the spoken twin) | no |
| review-gap | t.span | review gap ≈ 110 d | depthLine (in the policy chip) on a draft; depthHint (in the Depth (i)) on the intake | no |
| not-timed | ev.estimate | not timed | the tracked-time sentence | no |
| reads-high | ev.estimate | reads high | the calibration sentence | no |
| pays-nothing | m.nopay | pays nothing | weekQuestsFooter | no (card Key) |
| pays-nothing-ms | m.nopay | pays nothing | statedLine with its reason ("knowledge is paid by reviews") | yes |
| from-70 | c-mp | from 70% (inside "pays ⬡ 6 × progress …") | the PaysLine sentence | no (the (i) holds it) |
| at-acceptance | ev.measured | at acceptance | acceptanceCaption | yes |
| context-only | quest.checkpoint | context only | WEEK_QUEST_CAPTIONS.CHECKPOINT | no |
| over | v.over | Over | overKeptLine | no |
| lowered | m.down | Target lowered A → B | the Changed line | no (the header (i) holds it) |
| behind | pace.behind | Behind on new cards · n of N | the behind banner | yes |
| rests-on-added | pv.app | rests on an added practice | restsOnAddedLine | yes |
| clash | m.clash | May clash with your aim | aimConflictLine | yes |
| live | m.info | writes off | WRITES_OFF_BANNER | yes |
| not-recorded | m.info | not recorded here | NOT_RECORDED_HERE + WRITES_OFF_BANNER | yes |
| library-unchecked | v.unv | library not checked | LIBRARY_UNCHECKED_LINE | yes |
| legacy | m.info | older plan | LEGACY_DRAFT_BANNER / LEGACY_ACTIVE_BANNER | yes |

### 4.7 Motion catalogue

Every named motion has a licence (§5.2), goes through the gateway, and ends on the element's resting CSS. A chain's parts are created at once with delays and `fill: 'backwards'`, never awaited one by one (H12). "In view at hydration" means the element was ≥ 50% visible when the hook first ran (D30): it never replays from the start, it gets the accent in the last column instead.

| Motion | Licence | Full | Calm | Still | Max | In view at hydration |
|---|---|---|---|---|---|---|
| `build` (cairn) | SEEN: the stage became current or held (counted) | Stones draw bottom-up (dashoffset 100→0, opacity .35→1, 240 ms each, 60 ms stagger); on done the solid layer fades in (160 ms) | Opacity ≤ 200 ms | End state | 480 ms (Mastered) | the top stone stamps (scale 1.15→1, 240) |
| `reach` | SEEN: the counted reached count rose (a pending reach never plays) | Segment draw 420 → node stamp 380 (starts at 300) → `build` (starts at 560) | Opacity only | End state | ≤ 1.04 s | the node stamps |
| `start` | ACT: Start milestone | The here-ring stamps in (opacity 0→1 and scale .8→1, 240, stamp ease), then one `ping` (a ring copy scales .7→1.5, opacity .5→0, 900 ms, flourish). No stroke sweep on any ring part. The arc stays at the measured 0%. | Opacity; ping skipped | End state | 1.14 s | (ACT) |
| `rank-rise` | SEEN, its own event, queued after `reach` by sequence(): the held rank index is above the last-seen index (counted reach only) | Rim draw 360 (flourish) → notches pop 200 each at 24 ms stagger (starts at 300, flourish) → centre stamp 320 (starts at 560) → burst(8, seed `aimrank:${roadmapId}:${index}`, ink-1) → one announce("Aim rank X reached") | Medallion opacity .4→1 in 200 ms; announce still fires | End state; announce still fires | ≤ 1.0 s | centre stamp + burst + announce; nothing redraws from zero |
| `quest-done` | SEEN: the measured count reached N | Solid layer opacity 160 + badge check draw 220 (+40 delay); the step's dot hops to the top tread (320, stamp ease). Particles: none. When the whole week's set is done, the week PromiseRing closes with the kit's glint 900 + overshoot 520 (the one H2 exception). | Opacity | End state | 1.4 s | the badge check stamps |
| `step-done` | ACT: Mark done on a roadmap step or practice | The Tick check draws (220). No burst: a self-tick is never louder than a tested quest (Tier 0, 0 particles). | Opacity | End state | 0.22 s | (ACT) |
| `pv-confirm` | ACT: I checked this / Keep | The balloon rim fades out (160) while a solid rim draws (240); the check draws (220); the chip word swaps (160). Nothing else ever animates a provenance glyph. | Opacity swap | Instant | 0.5 s | (ACT) |
| `verdict-change` | ACT: a By-when, depth or intensity pick changed the chosen verdict | fits: the check redraws (220); tight: the half fill grows scaleX 0→1 from the centre (240); over: the outline draws (240), then "!" stamps (160); imp: the slash draws (160); fitted: the knobs slide ±3 units (240, in-out); unv: no motion. The word swaps (160). | Opacity | Instant | 0.4 s | (ACT) |
| `ladder` | ACT: a depth pick | The rungs light up to the chosen one (opacity, 20 ms per rung, 420 total); the gap bar draws (240) | Opacity | End state | 0.7 s | (ACT) |
| `bars` | ACT: an intensity pick | The bars grow scaleY 0→1 (160, 40 ms stagger) | Opacity | End state | 0.3 s | (ACT) |
| `date-moved` | CHANGED: the realistic (estimated) day differs from last seen | The ◆ marker and the date chip crossfade (opacity out 160, in 160); the text swaps in place; the static "moved from 7 Mar" stays. No line draw, no leaf flip, no roll. | Opacity ≤ 260 | Instant | 0.32 s | the same crossfade (it never hides a measured part) |
| `pay-swap` | ACT: a Start-sheet switch changes the stated pay figure | A plain crossfade of the figure (160). A stated rate is not money earned, so no roll. | Opacity | Instant | 0.16 s | (ACT) |
| `unlock` | ACT: I checked this on a Start-sheet row | The shackle lifts −2.5 units and rotates −12° about its left leg (240, stamp ease) | Opacity | End state | 0.24 s | (ACT) |
| `meter-fill` | SEEN: useSeenValue returned a value under the same basis (D8) | The kit Meter animates from → to (700, out), either direction (D9). Never from 0, no overshoot. | None (the CSS final state) | End state | 0.7 s | the frozen house behaviour (from last seen) |
| `horizon-front` | SEEN: the stored Proficiency differs from last seen, same basis signature | On the SVG marks: the walked path's stroke-dasharray goes `${from} 100` → `${to} 100` and the front dot follows 8 keyframes sampled along the curve (700, out), through play() | No transition | Final | 0.7 s | as meter-fill |
| `seal-reached` | SEEN: a counted done reach is new since last seen (never on a closed-unreached aim) | The kit `.stamp.landing` on [m.seal] (380) | Opacity | End state | 0.38 s | the stamp (it is already an accent) |
| `tip-open` | ACT: opening an InfoTip or a chip | The panel goes opacity 0→1 (160); no height animation; the chevron rotates as today. Instant on safety surfaces. | 160 opacity | Instant | 0.16 s | (ACT) |
| `weave` (glyph and band) | WAIT | Glyph: opacity breathe on the outer `<svg>` only while no weave shader is live (§5.7). Band: §6.3. | One static frame | The SVG | ≤ 90 s per run; pausable | – |
| horizon air | AMBIENT | §6.3, ramped in and out | The SVG | The SVG | ≤ 5 s visible per session | – |
| `kindle` (phase 3) | SEEN: the streak count rose | scaleY .55→1 from the bottom centre (420, stamp), then the core's opacity goes 1→.6→1 twice (2 × 260) | Opacity | End state | 0.94 s | the core flicker only |

Removed in revision 2: `timebar-draw` (an estimate never draws toward its date), `pay-roll` (now `pay-swap`), `route-invite` (an invitation id is not a measured value; [route] on the ASK card is static).

---

## 5. Motion tokens and gateway rules

### 5.1 Levels

html[data-motion] is full, calm or still. It is set before paint from 'xtnl:prefs'. The default pref, 'system', maps prefers-reduced-motion: reduce to still.

| Level | What happens |
|---|---|
| still | The gateway returns at once and the tokens.css rule kills every CSS animation and transition. The shader module is never imported. A still user sees the finished tableau with identical words. |
| calm | --ambient-play is paused. The gateway strips transform and dashes, caps durations at 260 ms and delays at 200 ms, and skips flourishes. The shader module is never imported either: every slot is its SVG (R2). |
| full | As designed. AMBIENT also needs prefers-reduced-motion: no-preference (D16). |

html[data-power="save"] (PowerSaver: a hidden tab, or battery ≤ 20% and not charging) pauses --ambient-play and every shader loop.
- The battery signal comes from navigator.getBattery, which only Chromium has. iOS Safari and Firefox never report it.
- The cross-browser power signal is the runtime's own throttle detector (§6.5 step 10): a sustained rAF-interval median over 22 ms (iOS Low Power Mode, a thermal limit, a slow GPU) sets `degraded` for the session, and every slot returns to its SVG. PowerSaver.tsx is frozen and is not changed.

### 5.2 Licences

| Licence | Trigger | Full | Calm | Still | Allowed on |
|---|---|---|---|---|---|
| **ACT** | The user's own tap or keypress; its result animates at once. | As designed. | Opacity ≤ 260 ms; flourishes skipped. | Nothing. | Everywhere except safety surfaces, which keep only the kit checkbox. |
| **SEEN** | A measured or confirmed value differs from the one this viewer last saw, under the same basis (D8). Armed at its from-state only while offscreen; plays when ≥ 50% on screen; the value is stored only then. An element in view at hydration gets its accent only (D30). A first-ever view never plays. | Once, as designed. | Opacity ≤ 260 ms. | Nothing. | Everywhere except safety surfaces. On /today only `meter-fill` and the check draw. |
| **CHANGED** | An estimate (≈) or a stated, not earned, figure differs from the one this viewer last saw. | A crossfade of the changed marker or text, ≤ 320 ms. No draw, no roll, no direction. The static "moved from …" words sit beside it. | Opacity ≤ 260 ms. | Nothing. | Date chips, the TimeBar's ◆, stated pay. Never on /today. |
| **WAIT** | Nothing measured is on screen inside the waiting card (a draft is running). | Loop for ≤ 90 s per run, with a 40 px pause button in the card that stops it for the session (sessionStorage); it stops at once when the run goes stale. | One static frame (the SVG). | The SVG. | DraftRunning, the Aim card RUNNING row, and the re-plan draft card on the living page. Never beside the living Proficiency. |
| **AMBIENT** | None. A zero-mean texture carrying no data (D15). | ≤ 5 s of visible time per program per browser session, ramped in and out over 400 ms, at ≤ 12 fps; then the SVG. Needs prefers-reduced-motion: no-preference. | The SVG. | The SVG. | The horizon band on /you and /you/roadmap only (D16). |
| **STATIC** | None. | One frame. | One frame. | The SVG. | Any art slot. |

One loop per page: while a WAIT loop runs, every AMBIENT slot on the page stays on its SVG, and the CSS weave glyph is still while the weave shader is live.

### 5.3 Honesty rules for motion (each one is a check in §11)

- **H1.** Only the six licences. A component that animates declares its licence in code (`playGlyph(el, motion, { licence })`); glyph-check fails a call without one.
- **H2.** Value motion runs from the last-seen MEASURED value, under the same basis, to the current one. It never starts from 0, never overshoots on a meter or arc (stamp overshoot is for glyph scale only), and never loops. One named exception: the kit's PromiseRing close (glint + 4.5% overshoot, redesign.md T1) when a week's quest set is done.
- **H3.** Estimates (≈), Gemini-sourced, unverified, best-case and stated (not earned) figures never animate as values: no countTo, roll, draw or directional move. They change only by the CHANGED crossfade. Nothing draws a dashed or balloon mark, and v.unv never moves.
- **H4.** The current stage never pulses. It is marked by shape (the here-ring) and pings once, only on `start` (ACT).
- **H5.** No loop on a surface that shows a number, except AMBIENT horizon air under D16 (≤ 5 s, no data). A WAIT loop runs only inside the waiting card, which shows no measured number.
- **H6.** The elapsed-window bar ("day 39/77") is static. Elapsed time is a fact, but motion on it would read as progress.
- **H7.** No directional fill, sweep or shimmer over a meter, and no loop with a direction (the weave glyph breathes in opacity; the weave shader is a standing wave). No class or keyframe name contains 'spin' or 'shimmer'.
- **H8.** Safety surfaces are static (D11).
- **H9.** Today stays calm (D10).
- **H10.** Loudness follows rarity and evidence:

  | Event | Motion |
  |---|---|
  | week quest done | check draw |
  | step marked done | check draw |
  | stage reached (counted) | segment + stamp + cairn |
  | Aim rank reached (counted) | the only "rise": burst of 8 + announce |

  Proficiency is never celebrated. A pending reach plays nothing until it counts; a milestone or aim closed unreached plays nothing.
- **H11.** Ink only (D22).
- **H12.** Every chain is created up front (all parts at once, with delays) and ends on the element's resting CSS. Calls pass `fill: 'backwards'` (play() spreads opts after its default `fill: 'both'`), so a cancelled, skipped or still animation leaves the true state, and no fill overrides a later state change.
- **H13.** One flourish chain per page at a time; each event takes ≤ 1.6 s (`reach` and `rank-rise` are separate events in sequence()). If more than 6 SEEN events are pending at mount (after a long absence), all of them jump to their end state, and one static line names them: "Since you last looked: milestone 2 reached · date moved to 7 Mar" (SINCE_LINE: ≤ 3 items, then "+ n more", with the rest in the (i)).
- **H14.** No parallax and no scroll-, pointer- or tilt-linked motion anywhere.
- **H15.** No SEEN motion on an element in view at hydration uses a keyframe that hides, zeroes or un-draws a part (D30).
- **H16.** One loop per page, and no CSS loop inside a card that has a live `.shd`.
- **H17.** Moving content that starts by itself stops within 5 s (AMBIENT) or has an on-page pause (WAIT). WCAG 2.2.2.

### 5.4 Tokens

The values live in TypeScript as `GLYPH_DUR` in `src/lib/glyph-motion.ts`, built from the frozen `DUR` / `EASE`. CSS needs only the existing `--t-*` and `--ease-*` tokens; tokens.css is not touched.

| Token | Value | Ease | Use |
|---|---|---|---|
| draw | 420 (DUR.slow) | out | route segment, ladder |
| drawStep / stoneStep | 20 / 60 | – | per-rung and per-stone stagger |
| ringIn | 240 | stamp | the here-ring stamp on `start` |
| check / checkDelay | 220 / 40 | out | check draws |
| stamp | 380 | stamp | node stamp, seal |
| centre | 320 | stamp | rank centre stamp |
| rim | 360 | out | rank rim draw (flourish) |
| notch / notchStep | 200 / 24 | stamp | rank notch pop (flourish) |
| fill | 700 | out | meters, arcs, horizon front |
| ping | 900 | out | here-ring ping (flourish) |
| swap | 160 (DUR.quick) | out | chip word / state swap, tip open, CHANGED crossfade (each half) |
| kindle / flicker | 420 / 260 | stamp / out | flame (phase 3) |
| breathe | 1200, alternate, ≤ 74 iterations | in-out | the CSS route.weave opacity breathe |
| ramp | 400 | linear | shader air ramp in and out |
| chainMax | 1600 | – | longest single event chain |
| waitMax | 90 000 | – | longest WAIT run |
| ambientMax | 5 000 | – | AMBIENT visible time per program per session |

Bursts: burst(x, y, n, seed, { color: 'var(--ink-1)', spread }). Full only, by the gateway.

| Event | Motes | Spread | Seed |
|---|---|---|---|
| rank rise | 8 | 40 | `aimrank:${roadmapId}:${index}` |

### 5.5 Gateway use

- Every one-shot goes through play(), burst(), roll(), bump() or countTo() (countTo only for exact measured figures) in the frozen `src/lib/motion.ts`. No `element.animate(` outside motion.ts; glyph-check greps for it.
- Draws set `strokeDasharray: '100 100'` only inside keyframes (every path has pathLength=100). Calm strips dashes, so a draw becomes a fade without special code. stroke-dasharray is in the gateway's ALLOWED set, which is what `horizon-front` uses.
- Flourishes (rim, notch pop, ping, burst) pass `flourish: true`, so calm skips them.
- A chain is created in one call: every part's play() is issued at once with its own `delay` and `fill: 'backwards'` (H12). Nothing awaits a previous part, so no later part sits at its end state and then resets.
- `src/lib/glyph-motion.ts` (≈ 1 KB gz, imports only motion.ts and celebrate's announce) provides:
  - `playGlyph(svg, motion, { licence, seed?, text?, accent? }) → Promise<void>`;
  - the helpers drawIn, stampIn, checkDraw, ping, rankRise, questDone, verdictChange, crossfade, unlock and kindle, each with an `accent` variant for elements in view at hydration;
  - `sequence()`, the per-page chain (H13), which also builds SINCE_LINE when it skips.

### 5.6 Hooks (`src/components/glyph/useSeen.ts`, client)

```ts
// One-shot events. Stores only after the element was >= threshold on screen; a first-ever view stores and returns changed=false.
// inViewAtHydration: the element was >= 50% visible when the hook first measured it (a layout effect), so only the accent may play.
useSeenEvent(key: SeenKey, value: number | string, ref: RefObject<Element | null>, opts?: { threshold?: number }):
  { changed: boolean; from: number | string | null; inViewAtHydration: boolean }
// Meters. The frozen useLastSeen semantics (null on first render, null when equal), stored in the same index.
useSeenValue(key: SeenKey, value: number): number | null
// Convenience: useSeenEvent + playGlyph once (the motion when armed offscreen, its accent when in view at hydration).
usePlayOnSeen(ref: RefObject<SVGElement | null>, key: SeenKey, value: number | string, motion: GlyphMotion): void
type SeenKey = { roadmapId: string; basis: string; what: string }
```

- **Storage.** One localStorage entry per roadmap and basis, under the useLastSeen prefix with an `ev:` namespace: `xtnl:seen:ev:${roadmapId}:${basis}` → `{ at, e: { [what]: value } }`. String values are stored as hashSeed(value).
  - A surface reads its entry once (one getItem, parsed into a module cache) and writes in one batch per animation frame.
  - When an entry with a newer basis is written, the roadmap's older-basis entries are deleted.
  - All `ev:` entries together are capped at 300 `what` values; the least recently written roadmap entry goes first.
- **Basis** (D8): `${basisVersion}:${hashSeed(basisSignature(detail.basis))}` for Proficiency-driven keys (`meter:proficiency`, `horizon`, `measure:${measureKey}` when its target changed); acceptedDay plus plan version for the rest. roadmap-ui-model computes both (R0).
- **`what`** never contains the surface when the same fact shows on two surfaces: `rank`, `seal`, `reach`, `horizon`, `meter:proficiency`. A rank rise plays once per viewer, on whichever surface sees it first.
- **Arming** (D30). On mount the hook measures the element once in a layout effect.
  - If it is ≥ 50% visible, `inViewAtHydration` is true and only the accent may play.
  - Otherwise the shared IntersectionObserver (rootMargin 25% below the viewport) arms the from-state as the element approaches, and the motion plays at 50% in view.
- One shared IntersectionObserver per page.
- An event never seen during a mount is not consumed: it plays the next time it is seen.

### 5.7 CSS rules

- `src/components/glyph/glyph.css` and `src/components/fx/fx.css` start with the layer-order line.
- `.mg-*` rules go in `@layer components`.
- `@layer effects` holds only:
  ```css
  @keyframes mg-breathe { to { opacity: .45; } }
  [data-wait]:not([data-weave-live]):not([data-paused]) svg.mg-weave {
    animation: mg-breathe 1200ms ease-in-out 74 alternate;
    animation-play-state: var(--ambient-play);
  }
  ```
  - 74 half-periods are about 89 s, so the CSS loop stops by itself under 90 s. It is not `infinite`. With `alternate` and an even count it ends on the rest frame (opacity 1).
  - It animates opacity on the outer `<svg>` box, never on a path, so it runs on the compositor and costs no main-thread paint per frame.
  - It has no direction: nothing travels along the route (H7).
  - ShaderSlot sets `data-weave-live` on its `[data-wait]` card while the weave shader is live, so one meaning never runs as two loops (H16). WeavePause sets `data-paused`.
- fx.css has no @keyframes. An SVG layer never moves on its own.
- Keyframes animate only transform, opacity, stroke-dashoffset and stroke-dasharray. No transition moves layout. roadmap.css keeps no @keyframes (its existing check stays).
- Class names: `mg-*` and `shd-*` only. None contains 'spin' or 'shimmer', and none collides with a Tailwind utility (shell-check compiles them).
- Glyph CSS is imported by Glyph.tsx, and shader CSS by ShaderSlot.tsx. The App Router allows a global CSS import from a component, and roadmap.css already works this way.

---

## 6. Shader layer

### 6.1 Placement

Every slot has two SVG layers in server markup: the soft layer (`.shd-fb`: the dawn or the strands) and, for the horizon, the measured marks (`.shd-marks`: hairline, contours, path, front dot), which are always on top. A canvas replaces the soft layer only while the slot loops.

| Surface | Slot | Program | Loops when | Size at 344 (≥ 600 container) |
|---|---|---|---|---|
| Aim card ACTIVE / ACCEPTED (/you), measured | HorizonField card | horizon | AMBIENT: full + D16, ≤ 5 s visible per session, no WAIT loop on the page | 312 × 56 band, card edge to edge at the top (× 64) |
| Aim card DONE / ARCHIVED, or unmeasured | HorizonField card | – (SVG only, no context) | never | same; dim .6 when archived; unlit when unmeasured |
| Aim card RUNNING | DraftWeave | weave | WAIT: full, run not stale, not paused, ≤ 90 s | 48 px band |
| Aim card ASK / LATER / HIDDEN / DRAFT | none | – | – | (the ASK ≤ 410 px gate is untouched) |
| /you/roadmap living header (AimHeader) | HorizonField page | horizon | as the card; SVG while a re-plan's weave runs on the page | 64 band (× 72) |
| DraftRunning (DraftReview.tsx), including the re-plan draft card on the living page | DraftWeave | weave | WAIT, as above | 48 band at the top of the draft card |
| Done / archived roadmap | HorizonField page | – (SVG only) | never | 64 (× 72) |
| Empty roadmap; draft review header | unlit horizon SVG (marks only) | – | never | 56 / 64 |
| Intake, Start sheet, Activities card, Today (aim line, week quests), /review | none; `data-fx="none"` on the intake, Start sheet and Activities card | – | – | – |

- At most 1 live context per document, and one loop per page (D17). On the living roadmap during a re-plan, the weave runs inside the re-plan draft card and the header horizon stays SVG.
- No text and no control sits on any slot. The WAIT pause button sits in the card's heading row.

### 6.2 Components and APIs

`src/components/fx/ShaderSlot.tsx` ("use client") is the only component that touches the runtime.
```ts
export type ShaderProgram = "horizon" | "weave";
export type SlotKind = "ambient" | "wait" | "static";
interface ShaderSlotProps<P extends ShaderProgram> {
  program: P;
  params: ParamsOf<P>;      // plain numbers from src/lib/shader/params.ts mappers (serialisable)
  kind: SlotKind;           // 'static' never loads the runtime
  fallback: ReactNode;      // the soft SVG layer the canvas replaces while live (dawn / strands)
  marks?: ReactNode;        // horizon only: the measured SVG marks, always on top, never replaced
  className?: string;
}
```
- It renders `<div class="shd shd-{program}" aria-hidden="true" data-shd={program} data-shd-state="fallback">` holding `.shd-fb` (the soft layer), the canvas while live, and `.shd-marks`.
- `useShaderMode()` returns 'css' on the server and on the first client render, so hydration matches.
- After mount it consults the gate (§6.4). Only for 'loop' does it wait for a quiet page (§6.5), load `src/lib/shader/runtime.ts` with `import()`, and append its canvas.
- It disposes (§6.5 step 12) when the gate turns 'css' (still, calm, contrast, a WAIT starting elsewhere on the page, the AMBIENT budget spent), on unmount, and when its route is hidden by Activity.

Runtime API (`src/lib/shader/runtime.ts`, client, reached only through `import()`):
```ts
mount(el: HTMLElement, spec: { program: ShaderProgram; params: number[]; kind: "ambient" | "wait" }): SlotHandle | null
  // null → unsupported, degraded, or another slot is live (the 1-context cap)
interface SlotHandle { update(params: number[]): void; hold(): void; resume(): void; dispose(): void }
status(): { supported: boolean | null; live: number; running: string[]; degraded: boolean; countedLosses: number }
```

The wrappers are thin, call the pure mappers, and are all client components:

**`<HorizonField proficiency roadmapId basisKey depth status variant="card"|"page"/>`**
- kind is 'ambient' for ACTIVE and ACCEPTED with a measured value, and 'static' for DONE, ARCHIVED and unmeasured.
- `marks` = `<HorizonMarks>` (§6.6) from `proficiency.percent` (already floor(100 × value)). A null or NaN proficiency gives the unlit marks, no dawn, and kind 'static'.
- `horizon-front` uses useSeenValue({ what: 'horizon', basis: basisKey }) and plays on the SVG marks through play() (stroke-dasharray plus the front dot's sampled keyframes). A different basis, or a `change.kind === 'rebased'`, gives no transition.
- SELF_REPORTED draws the walked path dotted, and the words "from your ticks" sit beside the % outside the band.

**`<DraftWeave stale/>`** with **`<WeavePause/>`**
- kind is 'wait' while !stale and not paused, and 'static' once stale or paused; stale = run.stale || timedOut.
- WeavePause is a 40 px GlyphButton ([m.pause], aria-label "Pause animation", aria-pressed) in the card heading. It sets `xtnl:fx:wait-paused` in sessionStorage and `data-paused` on the `[data-wait]` card, which stops both the CSS breathe and the shader.
- No class name, attribute or label contains "spin".

`src/components/fx/fallbacks.tsx` (server-safe) builds the SVG layers from the same geometry as the shader (`horizonGeometry`, `weaveGeometry`): `HorizonMarks`, `HorizonDawn`, `WeaveStrands`. Gradient ids come from useId in the client wrapper that renders them, so a route kept alive by Activity never duplicates an id.

### 6.3 Programs (GLSL ES 1.00, WebGL1)

These are the reference sources. shader-check lints them (§11.2). Neither program draws a measured mark (D15).

Shared prelude, prepended to every fragment shader:
```glsl
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v_uv;
uniform vec4 u_view; // res.xy device px · dpr · time s (wrapped at 600, period-locked)
uniform vec4 u_ink;  // rgb ink (--ink-0 horizon, --ink-2 weave) · a = alpha cap
uniform vec4 u_seed; // x = seed 0..1 (hashSeed(roadmapId) / 2^32) · yzw unused
#define RES u_view.xy
#define DPR u_view.z
#define TIME u_view.w
#define CAP u_ink.a
#define SEED u_seed.x
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.0-2.0*f);vec2 a=mod(i,32.0),b=mod(i+1.0,32.0);
 return mix(mix(h21(a),h21(vec2(b.x,a.y)),u.x),mix(h21(vec2(a.x,b.y)),h21(b),u.x),u.y);} // 32-cell periodic: seamless 600 s wrap
float band(float d,float hw){return clamp(hw-abs(d)+0.5,0.0,1.0);}  // 1 px anti-aliased line, device px
float dither(vec2 px){return (h21(mod(px,256.0)+SEED)-0.5)/255.0;} // no 8-bit banding in soft light
vec4 premul(vec3 c,float a){a=clamp(a,0.0,1.0);return vec4(c*a,a);}
```
Vertex shader: `attribute vec2 a_pos; varying vec2 v_uv; void main(){ v_uv=a_pos*0.5+0.5; gl_Position=vec4(a_pos,0.0,1.0); }`. The buffer is one full-screen triangle, `[-1,-1, 3,-1, -1,3]`.

**horizon** (the dawn and its air; no path, front, contour or hairline)

Uniforms, from `horizonParams()` / `horizonGeometry()` in params.ts:
- `u_dawn = (aimX, horizonY, air, dim)`
  - aimX = .93w and horizonY = .62h in device px (GL y up): the aim point on the hairline, the same point the SVG marks use;
  - air = the CPU ramp 0 → 1 → 0 (400 ms each way); 0 when HORIZON_AIR is false;
  - dim = 1 (only static slots are dimmed, and they have no canvas).
- No uniform carries Proficiency. The dawn's strength is the constant cap.

```glsl
uniform vec4 u_dawn;
void main(){
 vec2 px=v_uv*RES; float H=u_dawn.y;
 vec2 e=(px-vec2(u_dawn.x,H))/vec2(0.62*RES.x,1.15*(RES.y-H)+1.0);
 float dawn=exp(-dot(e,e)*2.2)*smoothstep(H-1.0,H+1.0,px.y);    // above the hairline only; constant strength (D15)
 vec2 g=px/(38.0*DPR); float drift=TIME*0.0533;                     // 32 cells per 600 s: seamless
 float n=0.5*(vnoise(g+SEED*97.0+vec2(drift,0.0))+vnoise(g*1.7-SEED*53.0-vec2(drift,0.0)))-0.5; // opposite drifts, zero-mean
 dawn*=1.0+u_dawn.z*n*0.4;                                          // air: at most ±20%, 0 when ramped out
 gl_FragColor=premul(u_ink.rgb,dawn*CAP*u_dawn.w+dither(px));
}
```

What this guarantees:
- The shader cannot move a measured mark, because it draws none. The path, front dot, hairline and contours are the SVG marks above it, crisp at native DPR.
- At air = 0 the canvas equals `HorizonDawn` within 1/255 per channel, so the swap in and out is invisible.
- The air is zero-mean, has no net direction, and runs only inside the ≤ 5 s AMBIENT budget.
- Done, archived and unmeasured plans have no canvas: history does not breathe.

**weave** (drafting; a standing wave, so nothing travels and there is no fill direction)

`u_ink = (--ink-2 rgb, alpha cap .7)`. Loops only under the WAIT licence.
```glsl
void main(){ vec2 px=v_uv*RES; float cy=RES.y*0.5,a=0.0, br=6.2831853*TIME/12.0; // 12 s period; 600 = 50 periods
 for(int i=0;i<4;i++){ float fi=float(i), k=6.2831853/(RES.x*(0.55+0.15*fi));
  float amp=RES.y*(0.16+0.05*fi)*cos(br+fi*1.5708);            // the shape is fixed; only the amplitude breathes
  float ph=px.x*k+fi*1.7, sl=amp*k*cos(ph);
  float d=(px.y-cy-amp*sin(ph))/sqrt(1.0+sl*sl);
  float lift=step(0.5,fract(px.x/(RES.x*0.25)+fi*0.5));        // over/under, static
  a=max(a,band(d,0.7*DPR)*mix(0.5,0.85,lift)); }
 float edge=smoothstep(0.0,0.08,v_uv.x)*(1.0-smoothstep(0.92,1.0,v_uv.x)); // no entry or exit edge, so no direction
 gl_FragColor=premul(u_ink.rgb,a*edge*CAP); }
```
At TIME = 0 the weave equals `WeaveStrands`, so its swap is invisible too.

Palette:
- Colours are read with getComputedStyle(slot) from a whitelist only: `SHADER_VARS = ['--ink-0', '--ink-2', '--ink-mute', '--card']`.
- The cap is chosen by luminance(--card) < .5: .20 for Night, .14 for Vellum (the horizon); .7 for the weave.
- --owed, --gold-*, --mp, --xp, --pts and --light can never be read.

### 6.4 The gate (pure, `src/lib/shader/gate.ts`)

`shaderMode(input) → 'css' | 'loop' | 'hold'`. 'hold' applies only to a slot that is already live: it keeps the context, draws nothing and runs no rAF.

The input is:
- level, osReducedMotion, contrastMore, forcedColors (from matchMedia, re-read on each `change` event);
- supported (true / false / null when not probed), highp, degraded, noFx (inside `[data-fx="none"]`), saveData, deviceMemory;
- program, kind, route, power, hidden, inView, offscreenMs, live (this slot has a context), otherLoopLive (another slot on the page loops);
- measured (horizon), ambientLeftMs (this program's session budget), stale and paused and runAgeMs (weave), HORIZON_AIR.

| Input | Result |
|---|---|
| level still or calm | css (the runtime is never imported) |
| contrastMore or forcedColors | css |
| kind static | css |
| supported false, !highp, degraded, noFx, saveData, deviceMemory ≤ 2 | css |
| otherLoopLive (a WAIT loop wins over AMBIENT; a second slot of the same licence waits) | css |
| AMBIENT and any of: route outside AMBIENT_ROUTES, osReducedMotion reduce, !HORIZON_AIR, unmeasured, ambientLeftMs ≤ 0 | css (a live slot ramps its air out first) |
| WAIT and any of: stale, paused, runAgeMs ≥ 90 000 | css |
| power save | css (a live slot ramps out and disposes) |
| live, and hidden or not in view | hold; after offscreenMs ≥ 10 000, css |
| not live, and hidden or not in view | css for now (re-gated when it comes into view) |
| full, all of the above clear | loop |

`AMBIENT_ROUTES = ['/you', '/you/roadmap', '/dev/style/art/you', '/dev/style/roadmap', '/dev/style/fx']`. It is imported by shell-check and must exclude /today and /review.

### 6.5 Lifecycle

1. **SSR and first client render.** The slot div, `.shd-fb` and `.shd-marks`; no `<canvas>`; data-shd-state="fallback".
2. **After mount.**
   - If the gate says css, stop there; the runtime is never fetched.
   - Otherwise observe the slot (IntersectionObserver, threshold .5).
3. **Quiet start.**
   - Start only when all hold: the window 'load' event has fired; the slot is ≥ 50% in view; and 400 ms have passed with no scroll, pointer or key event.
   - Then `requestIdleCallback(load, { timeout: 1500 })`; where rIC is missing (Safari), `setTimeout(load, 0)` inside the quiet window.
   - If input resumes before getContext, wait for the next quiet window.
   - `load = import('@/lib/shader/runtime')`. This is the Next 16 "Loading External Libraries" pattern (node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md): Turbopack splits the chunk, so it is in no route's first-load JS.
4. **Context** (only for 'loop').
   - getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'low-power', failIfMajorPerformanceCaveat: true }).
   - null means supported = false for the session, and every slot keeps its SVG.
   - highp is probed with getShaderPrecisionFormat. Without it, the session is css (fp16 breaks h21 and device-px coordinates over about 1024).
5. **Compile.**
   - Per program, lazily. With KHR_parallel_shader_compile, poll COMPLETION_STATUS_KHR across frames before reading LINK_STATUS. Without it, compile one program per idle slice.
   - Never call getError inside frames.
   - A compile or link failure switches that program off silently. There is no console.error, because ui-audit fails on console errors.
6. **First draw and swap.**
   - Draw the rest frame: air 0 for the horizon, TIME 0 for the weave. It equals the SVG soft layer.
   - One rAF after that frame was presented, set `data-live` and data-shd-state="live" (the SVG soft layer hides). Nothing pops, because both layers show the same image.
   - Then ramp the air 0 → 1 over 400 ms (horizon).
7. **Frames.**
   - One shared ticker for all slots: one rAF, running only while a slot is in 'loop'.
   - Per-program frame rate: horizon air ≤ 12 fps, weave ≤ 20 fps. The ticker skips a frame when less than 1000 / fps ms have passed.
   - TIME wraps at 600 s (period-locked, seamless).
   - AMBIENT visible time counts only while drawing in view. It is stored per program in sessionStorage (`xtnl:fx:ambient:${program}`), so a /you ↔ /you/roadmap trip does not restart it. At 5 000 − 400 ms the ramp-out starts; at 0 air the slot swaps back to SVG (step 12).
8. **Pauses.**
   - IntersectionObserver per slot → hold; 10 s offscreen → dispose.
   - visibilitychange: hold (the ticker stops) when hidden.
   - pagehide / pageshow for the bfcache.
   - One MutationObserver on `<html>` for data-motion, data-power and data-theme, plus matchMedia `change` on prefers-contrast, forced-colors and prefers-reduced-motion: each re-gates. css → the air ramps out if visible, then dispose.
   - A theme change on a live slot re-reads the palette at its next drawn frame. A held slot draws nothing, even on a theme change, until it is visible again.
9. **Resize.**
   - ResizeObserver, debounced 150 ms.
   - Canvas size = css size × min(devicePixelRatio, cap), where cap is 1 for the horizon (a soft field) and 1.5 for the weave; clamped to the program's pixel cap (horizon 1024 × 160, weave 1024 × 96 device px). CSS stretches the canvas, which a soft field tolerates.
10. **Throttle governor.**
    - It starts after the window 'load' event and the first idle callback, so hydration and font swap don't count.
    - It keeps a rolling 2 s window of rAF intervals (the ticker records them while it runs).
    - If the median is over 22 ms for two windows in a row (iOS Low Power Mode, a thermal limit, a slow GPU), it sets degraded for the session. The live loop ramps out and disposes, and every later gate says css.
    - CPU timing of draw calls is not used: they are asynchronous and cost about 0.05 ms whatever the GPU does.
11. **Context loss.**
    - On webglcontextlost: preventDefault, drop data-live (the SVG shows) and hold.
    - On webglcontextrestored: rebuild and redraw the rest frame, then resume.
    - A loss is counted only when all hold: it was not self-initiated (dispose removes the listeners first); document.visibilityState was 'visible'; and the context had been live for more than 1 s. Two counted losses within 60 s set supported = false for the session.
12. **Dispose** (loop end, css, 10 s offscreen, unmount, Activity hide).
    - Set `disposing`, then remove the webglcontextlost / restored listeners.
    - Cancel the slot's ticker entry and remove the canvas.
    - Clear data-live and `data-weave-live`; set data-shd-state="fallback".
    - Call WEBGL_lose_context.loseContext(), drop references, and decrement the live count.
    - A remount always shows the SVG first, then re-gates. The freed context budget goes to the visible slot that has waited longest.

### 6.6 SVG layers (server markup; final under calm and still)

**HorizonMarks** (`.shd-marks`, always present, always on top): an inline SVG with viewBox equal to the CSS size, `preserveAspectRatio="none"` and `vector-effect: non-scaling-stroke`, drawn at native DPR. Y is flipped from GL coordinates (y' = h − y). It holds no text.
- the horizon hairline (ink-mute at .55);
- the contours, one per level of the target depth (ink-mute, stroke-opacity fading to the bottom; class `shd-contour`);
- the unwalked path: a thin solid ink-mute line (1 px);
- the walked path: ink-0, 1.5 px, pathLength=100, `stroke-dasharray="${front*100} 100"`. SELF_REPORTED draws it dotted (round caps, a computed dot list over the walked length), and "from your ticks" sits beside the % outside the band;
- the front dot at frontPoint(front).

Unmeasured gives the unlit marks: hairline, unwalked path, contours, no dot.

**HorizonDawn** (`.shd-fb`): a radialGradient centred on the aim point, its 5 stops sampled from exp(−2.2 r²) × cap (constant), clipped above the hairline. Gradient ids from useId.

**WeaveStrands** (`.shd-fb`): the four strands at t = 0, ink-2.

CSS (fx.css, `@layer art`):
```css
.shd { position: relative; overflow: hidden; contain: content; }
.shd > .shd-fb, .shd > canvas, .shd > .shd-marks { position: absolute; inset: 0; width: 100%; height: 100%; }
.shd canvas { pointer-events: none; }
.shd > .shd-marks { z-index: 1; }                       /* measured marks above the soft layer */
.shd[data-live] > .shd-fb { visibility: hidden; }
/* Backstops: the gate already says css under both queries, so no canvas exists. */
@media (prefers-contrast: more) {
  .shd canvas, .shd > .shd-fb, .shd-marks .shd-contour { display: none; }   /* hairline, path and dot stay */
}
@media (forced-colors: active) {
  .shd canvas, .shd > .shd-fb, .shd-marks .shd-contour { display: none; }
  .shd-marks { forced-color-adjust: auto; }             /* path and dot in CanvasText */
}
```

Bands have fixed CSS heights, so the canvas causes no layout shift. Under high contrast or forced colours the band is never empty: the hairline, the path and the dot stay.

### 6.7 Performance budget (phone first: Fold cover 344 css px, DPR ≈ 2.6)

| Item | Budget |
|---|---|
| First paint | Unchanged. The SVG layers are the first paint. Shader code is in no first-load chunk. LCP stays a text element. CLS from slots is 0. |
| First-load JS added (ShaderSlot, wrappers, SVG layers, params, gate) | ≤ 2 KB gz |
| Lazy chunk (runtime + programs) | ≤ 5 KB gz; each program source ≤ 2 KB including the prelude |
| Glyph code on /today (quest, evidence, time, rank and misc families + glyph-motion) | ≤ 3 KB gz |
| Glyph markup on the largest fixture (draft-mixed) | ≤ 32 KB raw and ≤ 8 KB gz, counting the HTML and the RSC flight payload together; ≤ 1,200 added DOM nodes |
| Context start | Only for a loop, only after a quiet window. ≤ 8 ms main thread at idle. The long task from getContext to the first presented frame is ≤ 50 ms on the Fold cover from a cold load (§11.8), and none is over 50 ms at 4× CPU throttle on desktop. |
| INP | ≤ 200 ms at 4× CPU throttle on /you and /you/roadmap while a loop runs |
| Main thread per frame | ≤ 0.5 ms (uniforms + draw call issue) |
| GPU per frame | ≤ 1 ms on Adreno 6xx / Mali-G68 class: horizon 312 × 56 ≈ 17.5 k fragments at DPR 1 (one noise pair each); weave 468 × 72 ≈ 34 k |
| Fragment program | No textures; constant loop bounds ≤ 4; ≤ 4 vec4 uniforms |
| Frame rate | Horizon air ≤ 12 fps; weave ≤ 20 fps; hold and css cost 0 |
| Loop duration | AMBIENT ≤ 5 s visible per program per session; WAIT ≤ 90 s per run, pausable |
| Live contexts | ≤ 1 per document; none for a static state; none on /today or /review |
| Memory | Per canvas, 2–3 × w × h × 4 B for the back and front buffers (horizon 312 × 56: ≈ 0.2 MB; weave 468 × 72: ≈ 0.4 MB), plus the context's own overhead (command buffer, program cache). That overhead is measured on the Fold with chrome://tracing memory-infra in M0b; the budget is ≤ 8 MB per context until measured. All of it is released when the loop ends. |
| Battery | data-power=save, or sustained throttling (the governor), turns every loop into SVG |
| Devices | saveData, deviceMemory ≤ 2 or no highp: SVG only. Software GL is refused (failIfMajorPerformanceCaveat) and gets the SVG. |

### 6.8 Debug hooks (dev, /dev/style, or when ui-audit sets `window.__XTNL_SHD_FORCE`)

- `window.__xtnlShader = { status(), running(), frames, probe(slot, points), lose({ counted }), restore(), clock(ms) }`
- `html[data-shader-running]` is set while any loop runs.
- The force flag drops failIfMajorPerformanceCaveat, so headless SwiftShader compiles the real GLSL. It does not skip the quiet window; `clock(ms)` advances the test clock for the budgets.

### 6.9 Contract for a future program (the shared system)

A program is `{ id, frag, uniforms(params, palette, clock), licence: 'ambient' | 'wait', fps, dprCap, maxDevicePx }`. It also needs:
- a pure params mapper in params.ts, with tests;
- an SVG soft layer in fallbacks.tsx, built from the same geometry and equal to the program's rest frame within 1/255 per channel;
- no measured mark in the shader: every number stays in SVG or text next to the slot;
- a route decision: AMBIENT loops only in AMBIENT_ROUTES, added by the lead;
- the shared rules: the quiet start; the shared ticker; ≤ 1 live context per document and one loop per page; release when the loop ends, after 10 s offscreen, on unmount or Activity hide, with the freed budget going to the visible slot that has waited longest; AMBIENT ≤ 5 s visible per session; WAIT ≤ 90 s with a pause control.

---

## 7. Per-screen redesign (344 first, then 932 and 1440)

Widths:
- **344 / 375**: one column, the tab bar, page gutters of 16 px. A card's content box at 344 is **278 px**: 344 − 2 × 16 gutter − 2 × 16 padding (`.rm-aim`) − 2 px of border; 282 px inside `.rm-ms-sec` (14 px padding). Every composite is laid out from that width, and the fixtures assert it at 344 (§11.3). No SVG that carries text is viewBox-scaled; text is HTML.
- **932** (Fold inner screen; rail 84 → main ≈ 848): `.rm-cols` becomes two columns at ≥ 760 px of main, and the reference column un-collapses.
- **1440** (sidebar 232 → main ≈ 1208): the same two columns at the existing page widths.

At every width:
- InfoTip panels open inline, right after their button in DOM order (no popovers);
- there are no `title` tooltips;
- glyph sizes do not change.

### 7.1 Intake form (/you/roadmap/new)

- **344, top to bottom:**
  1. "Set an aim" (i);
  2. the Your aim textarea (aria-describedby → the Key panel with the question), [m.verbatim], n/140;
  3. the Area row;
  4. Depth: StageLadder (a 12-column grid, ≈ 23 px per rung at 278) over the radios, with «review gap ≈ 110 d» and the Depth (i);
  5. By when: four verdict chips, each glyph + verdict word;
  6. Hours stepper + GlyphStat "≈ 9 h seen · 10 h/wk yours «not timed»";
  7. ▸ Syllabus, ▸ Exam;
  8. How hard: the segmented control with intensity bars;
  9. Anything to avoid? (no glyph);
  10. path chips («from your numbers» / «Google may use this»);
  11. the buttons;
  12. the card Key.
  The fold (600 px) ends around Depth, with ≤ 25 app words.
- **Body intake:** the Activities block (§7.8) sits after the aim, with one health chip.
- **Depth intake:** the StatRow under Hours; S1–S6 badges.
- **Motion:** `ladder`, `verdict-change` and `bars` (all ACT). No shader (`data-fx="none"`).
- **932 / 1440:** the form stays one column (task surface, max 640 px). The StageLadder grid gives 32 px per rung. The By-when chips sit on one row.

### 7.2 Draft review header, run facts, Depth and date

- **344:**
  1. the eyebrow "Draft · not accepted yet";
  2. the aim;
  3. the chip row, with «Google may use this» on the Gemini path;
  4. the integrity chip (integrityLine verbatim), or RUN_STARTER_LINE, or the rejected / refused banner;
  5. the two GlyphLanes, "Gemini: …" and "App: …";
  6. the Depth and date card: StageLadder, Domain chips, «App policy» «yours to judge», «review gap ≈ 110 d», TimeBar with its Dates toggle, StatRow with «reads high» (or "pass rate calibrating 12/30" and «best case»), the verdict chip ("Unverified · …" while calibrating), «set by reviews», the choices as words;
  7. the Paragon RankSeal, idle, with its pips.
  The unlit horizon marks (contours = the chosen depth, static) sit at the top of the header card. Fold ≤ 25 app words.
- **Motion:** `date-moved` (CHANGED). The Paragon pips never light on a draft. Nothing draws toward a date.
- **932 / 1440:** `.rm-grid` two columns: header and Depth and date on the left, the Next card on the right. TimeBar labels usually fit one row.

### 7.3 Next milestone card and outline

- **344:**
  1. the header (number, cairn, stage, Domains, → L6+, "gives Aim rank [rank.2 active] Journeyman", dates [pv.app]);
  2. [m.builds] why (i);
  3. CapacityGauge + verdict chip (i);
  4. «Aim not checked»;
  5. sections Learn / Practise / Steps / Checkpoint, each with its glyph head (subtitles in the Key);
  6. rows (KindGlyph · label · target meter · provenance chip with its who-word or mark · Keep / Edit, with ▸ for captions);
  7. one "+ Add";
  8. then the outline: collapsed RouteRail nodes, 44 px each;
  9. the footer "[n] to decide" + Accept plan.
  The card Key (i) sits in the card heading. The card has 3 InfoTips in all.
- **Motion:** `pv-confirm` (ACT); `step-done` is not available on a draft. Nothing loops.
- **932 / 1440:** the right column of `.rm-grid`. Outline nodes may open two at a time. Row chips stay on one line.

### 7.4 Living Aim header

- **344:**
  1. the horizon band (64 px; SVG marks on top; no text on it);
  2. the aim;
  3. the chips (Area · L, "L12 by ≈ Dec 2027" or "… · yours", Over, «writes off»);
  4. a row with RankSeal 48 + "Aspirant / Aim rank" on the left and "41% [ev] · [ev.measured] 09:12 / Proficiency → L12" on the right ("from your ticks" when self-reported);
  5. the Meter;
  6. the mini-meters;
  7. "Next · [rank.2 active] Journeyman · milestone 2";
  8. "↓ 1 since Sun" or «Target lowered»;
  9. «Aim not checked»;
  10. "Since you last looked: …" when H13 applies;
  11. ▸ Aim ranks on this plan;
  12. (i).
- **Motion:**
  - `horizon-front` and `meter-fill` (SEEN, either direction, keyed on the basis signature);
  - `rank-rise` (SEEN, its own event);
  - horizon air (AMBIENT, full only, ≤ 5 s visible per session).
- **Shader:** horizon page. A context exists only during those ≤ 5 s, and never while a re-plan's weave runs on the page.
- **932 / 1440:** top of the left column. The band is 72 px (container ≥ 600). The 7-pip ladder shows under the seal.

### 7.5 Now section

- **344:**
  1. "Now · milestone 2 of 6" and the static elapsed bar;
  2. the headline row: %, evidence, [ev.measured] time, the Meter with its 70% floor tick, "pays [c-mp] 6 × progress «from 70%»", the pace in ink (with «best case» when it applies);
  3. week quests: heading «pays nothing» + Key, then rows (KindGlyph, label, n of N, PipStrip / [m.link], ▸);
  4. ▸ Past weeks behind the SegmentStrip;
  5. Measures;
  6. Practice kept;
  7. Domains;
  8. Practices (PromiseRing);
  9. Steps;
  10. Checkpoint «context only»;
  11. the behind chip (when behind) with the lever buttons.
- **Motion:** `meter-fill` (SEEN, same basis) on the headline, MeasureRow and Practice kept, which today pass no `from`; `quest-done` (SEEN); `step-done` (ACT). Nothing loops.
- **932 / 1440:** the left column under the header. The week-quest rows show their PipStrip inline.

### 7.6 Milestones, Toward the aim, footer

- **344:**
  1. the RouteRail (vertical, a 44 px row per node with ▸ for date spans), every MilestoneRowState drawn as in §4.5;
  2. Toward the aim: Meter, SegmentStrip, "+6/40", "[ev.tick] 39 sessions «context only»", (i);
  3. «yours to judge»;
  4. the actions.
- **Motion:** `reach` (SEEN, counted reach only), with `rank-rise` queued after it as its own event; `start` (ACT, from the Now card). The current node never pulses; a pending node never moves.
- **932 / 1440:** the right column. The rail and Toward sit side by side above 1200 px of main only if the column has ≥ 560 px; otherwise they stack.

### 7.7 Start sheet

- **344 (Sheet):**
  1. the title "Start milestone 2";
  2. the target choice + "[v.over] Over";
  3. CapacityGauge;
  4. the Today-bound rows (KindGlyph · label · provenance · [m.lock] + "I checked this");
  5. practices (switch + XP price);
  6. the pay line "pays [c-mp] 6 × progress «from 70%»" with its floor tick, and «rests on an added practice»;
  7. the preview glyph counts «pays nothing»;
  8. "gives Aim rank [rank.2 active] Journeyman";
  9. "[s-body] Waiting on your answer about activities →" when that applies;
  10. one health chip;
  11. "2 rows left", then the primary action.
- **Motion:** `unlock` and `pay-swap` (ACT). No shader (`data-fx="none"`).
- **932 / 1440:** the kit's centred sheet (≤ 600 wide); same content.

### 7.8 Activities to avoid card (safety surface)

- **344:**
  1. activityLeadLine (the quote once);
  2. ACTIVITY_QUESTION;
  3. rows: [sess.*] + session name + checkbox, [m.quote] on pre-ticked rows, the struck session glyph + "avoid" when ticked;
  4. the pending line, verbatim, led by [s-body];
  5. the health chip «Not medical advice · ask a professional»;
  6. activitySaveLine verbatim beside the Save button;
  7. the buttons as words;
  8. «May clash with your aim»;
  9. (i: ACTIVITY_HOW_LINE) and the card Key (per-row quotes).
  Answered: activitySummaryLines verbatim ("You said to avoid: …", "The plan can include: …"), each name beside its glyph, + Change. Stale: the line verbatim.
- **Motion:** none beyond the kit checkbox. InfoTips open instantly. `data-fx="none"`.
- **932 / 1440:** unchanged layout. The rows may sit in two columns from 600 px of the card.

### 7.9 Aim card (/you)

- **344:** the horizon band (56 px) at the top for ACTIVE, ACCEPTED, DONE and ARCHIVED; then the content of §3.3 screen 9.
  - DONE and ARCHIVED are SVG only, with no context.
  - ASK has no band: unlit RankSeal 34 and a static [route]. It stays ≤ 410 px.
  - RUNNING has the weave band, "[route.weave] Drafting · started 09:12" and the pause button.
- **Motion:**
  - `meter-fill`, `horizon-front` and `rank-rise` (SEEN; the rank key has no surface in it, so a rise plays once per counted reach per viewer, on /you or /you/roadmap, whichever sees it first);
  - horizon air (AMBIENT, ≤ 5 s visible per session, shared with the header's budget);
  - the weave (WAIT).
- **932 / 1440:** /you's card width; the band is 64 px (container ≥ 600).

### 7.10 Today week quests

- **344:**
  1. the heading "Week quests · Milestone 2 · until Sun «pays nothing»" + Key;
  2. ≤ 3 rows (20 px KindGlyph with badge, label, "n of N unit", thin meter, PipStrip or [m.link]);
  3. "n more";
  4. for a body plan, one health chip in the heading.
  Never red, never counted in Today's counts. The Key lists each row's quota line, place and due sentence.
- **Motion:** `meter-fill` and the check draw of `quest-done`, SEEN only. No loop, no burst, no shader.
- **932 / 1440:** the board's column. Rows keep one line each.

### 7.11 Today aim line

- **344:** a 20 px [route] glyph (static), the bold lead plus ≤ 8 app words, and the 40 px ×. ≤ 2 lines, so ≤ 72 px. START keeps the verb: "Gives [rank.4 active] Aim rank Expert."
- **Motion:** none (D10). No chime.
- **932 / 1440:** in the board's c3 column under Goals (the existing ui-audit check).

### 7.12 Roadmap tab: empty, drafting, done

- **Empty:** unlit horizon marks, unlit RankSeal 72, [route], "Set an aim" with its (i) and button. Static.
- **Drafting:**
  - the weave band (WAIT shader);
  - [route.weave] (WAIT CSS breathe, only while the shader is not live);
  - the pause button in the card heading;
  - the aria-live text verbatim.
  No bar, no %.
- **Done, reached:**
  - the horizon as SVG (dim .6 when archived);
  - the full RankSeal;
  - [m.seal] with `seal-reached` (SEEN, once);
  - the read-only RouteRail.
- **Done, closed unreached:** the SVG horizon, the RankSeal of the rank held, "Closed … · the aim wasn't reached", the read-only RouteRail. No seal, no motion.
- **932 / 1440:** the same cards in the left column; the reference column shows the read-only rail.

---

## 8. Honesty preserved

Every honesty element, where it appears, its compact visible form, and where the full text is. Rows marked ✓ are asserted in visible text by §11.3. "Key" is the card Key (a tap panel); every sr-only string is also in the Key or the row's ▸ (D13).

| Honesty element | Where | Compact form (always visible) | Full text (one tap; always in the DOM) |
|---|---|---|---|
| Gemini suggestion · not checked ✓ | DRAFT rows and titles everywhere | «[pv.suggest] Gemini · not checked» | sr PROVENANCE_WORDS.DRAFT; Key |
| Gemini's words · kept by you · not checked ✓ | KEPT rows and titles | «[pv.kept] Gemini · kept · not checked» | sr PROVENANCE_WORDS.KEPT_SUGGESTION; Key |
| Gemini's choice among the app's options ✓ | v4 picks | «[pv.pick] Gemini's choice · not checked» (DRAFT) / «Gemini's choice» | sr GEMINI_CHOICE_WORDS; geminiChoiceLine in the row's ▸ |
| Who did what on a Gemini draft ✓ | draft header | GlyphLanes with the visible who-words "Gemini:" and "App:" | (i) the lead line |
| Integrity: keys only · 0 words of its own (or n area names from your words, not checked; n not shown) ✓ | draft header | integrityLine verbatim in «[pv.integrity] …» | chip → integrityLine + the run line |
| Rejected / refused run banner ✓ | draft header | unchanged banner | – |
| Gemini didn't answer (RUN_STARTER_LINE) ✓ | draft header | verbatim | – |
| Draft · not accepted yet ✓ | draft eyebrow | verbatim | – |
| Numbers yours, words still Gemini's (EDIT_NUMBERS_NOTE) ✓ | an edited Gemini row | «[pv.you] your numbers · Gemini's words» | chip → EDIT_NUMBERS_NOTE |
| Wording from an earlier Gemini draft is hidden (LEGACY_GEMINI_HIDDEN) ✓ | legacy drafts | verbatim | – |
| Not medical advice, ask a professional ✓ | every body or care card, and any craft card that asks; never on Field cards | «[safe.health] Not medical advice · ask a professional», one per card | chip → HEALTH_LINE |
| HEALTH flag reason ✓ | blocking flag rows | "[i-flag] Health" + reason, visible | – (contract unchanged) |
| Easy, mobility and technique practice only until you confirm ✓ | body plans, pending | verbatim, led by [s-body] | – |
| Free tier: Google may use what drafting sends ✓ | intake (Gemini path), draft header (Gemini path) | «[i-share] Google may use this» | chip → FREE_TIER_LINE + privacyLine |
| Built from your numbers (no key) | intake | «[pv.app] from your numbers» | chip → NO_KEY_LINE |
| Constraints are shown to Gemini, not checked ✓ | v3 / mixed drafts | «[pv.suggest] Shown to Gemini · not checked» | chip → CONSTRAINTS_LINE |
| Topics are Gemini's guess, not the official syllabus | credential aims | «[pv.suggest] Gemini's guess» | chip → CREDENTIAL_LINE |
| Task-time estimates n% sized by Gemini ✓ | draft checks | «[pv.suggest] n% sized by Gemini» | chip → the throughput sentence |
| Estimated date ✓ | header, Aim card, TimeBar | ≈ before the date, month precision ("L12 by ≈ Dec 2027"); sr "about … , an estimate" | (i) the realism sentence; the TimeBar list |
| Whose date ✓ | header, Aim card | "[t.pin] … · yours" for the user's date; [t.cal] for the app's | (i) |
| Unverified verdict ✓ | Depth and date, Next card, Start sheet (while capacity calibrates) | the verdict chip "[v.unv] Unverified · Fits" (verdictWord) | (i) the realism or capacity sentence ("Unverified: your tracked time or your recurring tasks are still calibrating") |
| Best case: pass rate still calibrating ✓ | pace line, realism StatRow, TimeBar ◆ | «best case» | (i) paceLine / the realism sentence |
| Pass rate calibrating ✓ | realism StatRow | "pass rate calibrating 12/30" in place of a % | (i) the realism pass line |
| Tracked time is an estimate, not timed ✓ | intake, run facts | «[ev.estimate] not timed», with "≈ 9 h seen · 10 h/wk yours" | Key: the sentence |
| Pass rate reads high ✓ | Depth and date | «reads high» | (i) the realism sentence |
| Review gap (not time to the aim) ✓ | intake Depth, Depth and date | «[t.span] review gap ≈ 110 d» | chip → depthLine (the policy chip) |
| App policy, not facts ✓ | depth lines | «[m.policy] App policy» | chip → depthLine |
| Yours to judge ✓ | coverage, Toward the aim | «[m.judge] yours to judge» | chip → coverageJudgeLine / the honesty note |
| Set by reviews (schedule-bound) | Depth and date | «[t.hourglass] set by reviews» | chip → scheduleBoundLine |
| Never lowered | the choices | (i) beside the choices | NEVER_LOWERED_LINE |
| Earliest if every review passes ✓ | TimeBar | a ghost tick labelled "earliest" | the TimeBar list (sr, and its Dates toggle) |
| Exam waypoint ✓ | TimeBar, header | a flag marker with date + stage, once | the TimeBar list: examWaypointLine |
| Aim not checked ✓ | header, Aim card, Next card | «[v.unv] Aim not checked» + Add a figure | chip → AIM_UNCHECKED_LINE |
| Pays nothing (week quests) ✓ | week quests (Today, Now, Start preview) | «[m.nopay] pays nothing» | Key → weekQuestsFooter |
| Pays nothing (a milestone), with its reason ✓ | Now, Start sheet | «[m.nopay] pays nothing» | chip → statedLine ("pays nothing · knowledge is paid by reviews") |
| Context only, doesn't move your progress ✓ | checkpoints, Toward sessions | «context only» | Key |
| MP pay × progress from 70% ✓ | Now, Start sheet, Aim card | "pays [c-mp] 6 × progress «from 70%»" + a floor tick | (i) the PaysLine sentence |
| Measured at acceptance ✓ | Aim card ACCEPTED | «[ev.measured] at acceptance» beside the % | chip → acceptanceCaption |
| Rests on a practice the app added | Start sheet | «[pv.app] rests on an added practice» | chip → restsOnAddedLine |
| Over ✓ | header, Start sheet | "[v.over] Over" | overKeptLine in the (i) |
| Target lowered A → B ✓ | header, Aim card | «[m.down] Target lowered 46 → 38», once | (i) the Changed line |
| ↓ n since <day> ✓ | header, Aim card | verbatim figure; sr "down 1 since Sunday" | (i) the cause |
| Behind (numbers) ✓ | Now | «[pace.behind] Behind on new cards · 4 of 9» | chip → the banner sentence |
| Pace phrase in ink ✓ | Now, Aim card | "[pace.on] On pace · 7 Mar" / "[pace.behind] About 3 weeks behind" | – |
| Proficiency basis and measured time ✓ | header, Aim card | "41% [ev] · [ev.measured] 09:12" over "Proficiency → L12" on both | sr and (i): the caption |
| Self-reported progress ✓ | header, Aim card, horizon | "from your ticks" beside the %; the walked path dotted | (i) the caption |
| Evidence class per row | quests, measures | KindGlyph evidence badge | sr WEEK_QUEST_CAPTIONS / PROVENANCE_WORDS; Key |
| Provenance app / you / checked / syllabus | rows | ProvMark glyph | sr, exact words; Key |
| Dates set by the app ✓ | Next card header | [pv.app] beside the dates | sr and Key: "dates set by the app" |
| A rank not yet held ✓ | Next card, Start sheet, Today START, header "Next" | "gives Aim rank [rank.N active] X" / "Next · [rank.N active] X"; never the done state | Key: givesRankLine |
| Rank kept for good | RankSeal | words, never a padlock | the label's sr; (i) |
| Reached, counts from <day> (pending) ✓ | rail, Aim card | "Reached · counts from Thu" on a dashed node; no seal, no rank motion | ▸ / (i): pendingReachLine, rankPendingLine |
| Closed, not reached ✓ | rail, Aim card DONE, Roadmap tab done | "Closed at 82% · not reached" / "Closed … · the aim wasn't reached"; struck node; no seal | ▸: closedUnreachedLine |
| Past due ✓ | rail, Aim card | "Past due" / pastDueLine | ▸: pastDueLine |
| Since you last looked ✓ | header (H13) | SINCE_LINE, ≤ 3 items + "+ n more" | (i): the rest |
| From your words (quote) ✓ | activity rows | the quote once in the lead + [m.quote] per row | sr and Key per row |
| What Save does (save line) ✓ | activity card | activitySaveLine verbatim beside Save | – |
| What the plan can include ✓ | activity card, answered | "The plan can include: …" verbatim, each name beside its glyph | – |
| Answered summary with its day ✓ | activity card | verbatim | – |
| Stale answer line ✓ | activity card | verbatim | – |
| May clash with your aim | under the activity card | «[m.clash] May clash with your aim» | chip → aimConflictLine |
| Paused by your answer | practice rows | verbatim line | – |
| Not added to Today ✓ | Start sheet held practices | verbatim | – |
| Rows left (the gate) ✓ | Start sheet | "2 rows left" | (i) the gate sentence |
| Drafting: honest elapsed time ✓ | RUNNING | verbatim in aria-live, never a % | – |
| Writes off (live server) ✓ | header | «[m.info] writes off» | chip → WRITES_OFF_BANNER |
| Not recorded on this server ✓ | Aim card (writes-off) | «[m.info] not recorded here» | chip → NOT_RECORDED_HERE + WRITES_OFF_BANNER |
| Library not checked | intake, draft | «[v.unv] library not checked» | chip → LIBRARY_UNCHECKED_LINE |

Motion honesty, as rules H1–H17 (§5.3):
- no motion without a licence;
- values move only between two measured values this viewer saw, under the same basis signature;
- ≈, Gemini, unverified, best-case and stated figures never animate as values; an estimate changes by a crossfade only;
- nothing on screen at hydration is un-drawn and redrawn;
- the current node never pulses; a pending reach never moves;
- the elapsed bar is static;
- the weave is a standing wave and an opacity breathe with no direction, inside the waiting card only, pausable, stopping when the run goes stale;
- the shader draws no measured mark; horizon air is zero-mean and stops within 5 s;
- a rebase never animates;
- falls move in ink with no flourish;
- Proficiency is never celebrated.

---

## 9. Files

### 9.1 New: the shared system (M0; outside every file the progression workflow edits)

- `src/components/glyph/paths/{stage,rank,quest,evidence,provenance,safety,session,verdict,time,misc,flame}.ts`, plus `paths/index.ts` (the `GlyphName` union, the family registry glyph-check reads, and which families are static)
- `src/components/glyph/Glyph.tsx` (Glyph, KindGlyph, ProvMark, GlyphButton)
- `src/components/glyph/GlyphDefs.tsx` (server: the per-route `<symbol>` block, D3)
- `src/components/glyph/HonestyChip.tsx`
- `src/components/glyph/InfoTip.tsx` (InfoTip, CardKey)
- `src/components/glyph/GlyphStat.tsx` (GlyphStat, StatRow)
- `src/components/glyph/GlyphLane.tsx`
- `src/components/glyph/RankSeal.tsx`
- `src/components/glyph/StageLadder.tsx`
- `src/components/glyph/TimeBar.tsx` (and its label placer with the character-width table)
- `src/components/glyph/RouteRail.tsx`
- `src/components/glyph/PipStrip.tsx`
- `src/components/glyph/CapacityGauge.tsx`
- `src/components/glyph/useSeen.ts`
- `src/components/glyph/glyph.css`
- `src/lib/glyph-motion.ts`
- `src/lib/figure-speech.ts` (pure: `figureSpeech()`, the spoken twins, D26) and `src/lib/figure-units.json` (the figure and unit table it shares with word-count.mjs)
- `src/lib/shader/params.ts` (pure, server-safe): horizonParams, horizonGeometry, frontPoint, horizonDawnStops, weaveParams, weaveGeometry, paletteFromVars, parseCssColor, SHADER_VARS, AMBIENT_ROUTES, HORIZON_AIR, dprOf, slotPixels, throttleVerdict
- `src/lib/shader/gate.ts` (pure): shaderMode
- `src/lib/shader/programs.ts`: VERT, PRELUDE, HORIZON, WEAVE, uniform binders, device-px and DPR caps, fps per program
- `src/lib/shader/runtime.ts` (client, reached only by `import()`): the shared ticker, the quiet start, the budgets, the governor, dispose
- `src/components/fx/ShaderSlot.tsx`, `HorizonField.tsx`, `DraftWeave.tsx`, `WeavePause.tsx`, `fallbacks.tsx` (HorizonMarks, HorizonDawn, WeaveStrands), `fx.css`
- `scripts/word-count.mjs` (§3.1; imported by roadmap-ui-check and ui-audit; reads figure-units.json)
- `scripts/glyph-check.ts`
- `scripts/shader-check.ts`
- `src/app/dev/style/glyphs/page.tsx` + `fixtures.ts`: every glyph × state × motion level at 344, with `?motion=full|calm|still` and `?theme=night|vellum`, plus the composites at 278 px content width
- `src/app/dev/style/fx/page.tsx`: the shader slots with `?shd=off|loop|hold|lost` and `?contrast=more` (honoured only under the /dev/style gate)

### 9.2 Changed shared files (M0c; frozen or L0-owned, so each needs the lead's sign-off)

- `package.json`: `ui:glyph`, `ui:shader`, and both appended to `ui:check`
- `src/components/shell/nav.ts`: DEV_STYLE_PAGES gains "Glyphs" and "Shader"
- `scripts/shell-check.ts`: glyph.css / fx.css layer and keyframe rules; no static import of `@/lib/shader/runtime`; no 3D-library imports; AMBIENT_ROUTES excludes /today and /review; the SHADER_VARS whitelist; the contrast and forced-colours backstops
- `scripts/contrast-check.ts`: §11.6 pairs
- `scripts/ui-audit.mjs`: §11.7 probes
- `docs/life-plan/redesign.md`:
  - Motion: the licence table (with CHANGED), the AMBIENT amendment (D19), shader rules, WCAG 2.2.2;
  - Components: the glyph set; the line-style meanings (D29, as the lead decides U2);
  - Acceptance: the new gates
- `docs/life-plan/redesign-contracts.md`:
  - §1 motion rule (WAIT / AMBIENT / CHANGED, the shader class, one loop per page);
  - §2 rows for `@/lib/glyph-motion`, `@/lib/figure-speech` and `@/lib/shader/params`;
  - §3 the glyph and fx components

### 9.3 Roadmap adoption (after the progression workflow lands)

R0, the roadmap contract:
- `src/components/roadmap/roadmap-copy.ts`: `SHORT_*` labels only, none rewording an existing string:
  - SHORT_AIM_LABEL ("Your aim");
  - SHORT_GEMINI ("Gemini · not checked"), SHORT_GEMINI_KEPT ("Gemini · kept · not checked"), SHORT_GEMINI_CHOICE ("Gemini's choice") + SHORT_NOT_CHECKED_SUFFIX (" · not checked"), SHORT_GEMINI_ORDER, SHORT_GEMINI_GUESS, SHORT_SHOWN_TO_GEMINI ("Shown to Gemini · not checked"), shortSizedByGemini(n), SHORT_EDIT_NUMBERS ("your numbers · Gemini's words"), GEMINI_LANE_WORD / APP_LANE_WORD;
  - SHORT_HEALTH ("Not medical advice · ask a professional");
  - SHORT_GIVES_RANK ("gives Aim rank"), SHORT_KEEPS_RANK;
  - SHORT_REVIEW_GAP ("review gap"), SHORT_BEST_CASE ("best case"), shortCalibrating(n, need), SHORT_YOURS ("yours"), SHORT_SEEN ("seen"), shortDateBy(level, month);
  - SHORT_AT_ACCEPTANCE ("at acceptance"), SHORT_NOT_RECORDED ("not recorded here"), SHORT_PAYS ("pays"), SHORT_X_PROGRESS ("× progress");
  - sinceLine(items) (SINCE_LINE), SHORT_DATES_TOGGLE ("Dates"), SHORT_PAUSE_LABEL ("Pause animation");
  - shortTooSoon(level) ("too soon for L12", the By-when verdict word beside chipVerdict);
  - the other chip labels of §4.6.
- `src/components/roadmap/roadmap-ui-model.ts`: rank index and top; rail nodes for every MilestoneRowState (counted vs pending reach, closedPct, countsFrom); due-day pips; the seen keys with their basis (the Proficiency basis signature key, D8); horizon inputs; whose date (app or yours); the unverified / bestCase / calibrating flags for StatRow, CapacityGauge and the pace phrase.
- `src/components/roadmap/RoadmapGlyph.tsx`: becomes an alias of glyph/Glyph
- `src/components/roadmap/roadmap.css`: per-lane sections with marker comments, layout hooks only; no keyframes, no gold, no --owed
- `src/app/dev/style/roadmap/fixtures.ts`, `src/app/dev/style/art/you/aim-fixtures.ts`, `src/app/dev/style/today/fixtures.ts`: the new states rank-new, reach-new, reach-pending, closed-unreached (milestone and aim), past-due, quest-done-new, date-moved, horizon-unmeasured, horizon-self-reported, rebase-switched-off-seen-before, depth-calibrating, capacity-calibrating, since-line (7 pending), run-stale, archived, writes-off
- `scripts/roadmap-ui-check.ts`: the word-count harness, the visible-honesty harness, the tap-reachability harness, the full-text survival list
- `docs/life-plan/roadmap-contracts.md`: D12, D13, D18, D25, D28, the InfoTip disclosure rule, the horizon and weave slots

Lanes R1–R7 (§10) own:
- AimLine, WeekQuests;
- ProficiencyBlock, PlanRanks, AimCard, AimFigure;
- AimHeader, MeasureRow, PastWeekQuests, PaysLine, TowardAim, RoadmapView;
- MilestoneCard, ItemRow, PracticeRow, TopicRow, DomainRow, ProvenanceChip, FlagChips (glyph only, reasons unchanged), AddItemSheet;
- DraftReview (incl. DraftRunning), RunFacts, DateBlock, ChecksPanel, ThroughputPanel;
- StartSheet;
- RoadmapForm, ActivityConfirm.

Also their blocks in `scripts/you-check.ts` and `scripts/today-ui-check.ts`.

### 9.4 Frozen and untouched

- `src/lib/motion.ts`, `src/lib/celebration-types.ts`, `src/lib/celebrate.ts`
- `src/app/styles/{tokens,base,components,effects}.css`
- `src/app/layout.tsx`, `src/components/PowerSaver.tsx`
- `src/components/ui/**` (Icon, Meter, PromiseRing, Crest/Medallion, Tick, useLastSeen, MotionPrefs)
- `src/components/home/LastSeenMeter.tsx`

---

## 10. Lanes

**Precondition P.** The practice-progression workflow has landed:
- its commits are on main;
- `npm run ui:check` and the roadmap checks pass;
- `git status` shows no modified file under `src/components/roadmap/**`, `src/lib/roadmap-*`, `scripts/roadmap-*`, `scripts/fixtures/roadmap-*` or `docs/life-plan/roadmap-contracts.md`.

At P, re-read the roadmap-copy names, the fixture keys and the audit counts used here. They may have moved, and §3.2's "today" column is re-measured if so (the budgets do not change).

Every lane reads AGENTS.md and the relevant page under `node_modules/next/dist/docs/` before relying on a Next API. M0b reads 01-app/02-guides/lazy-loading.md › Loading External Libraries, and 01-app/02-guides/preserving-ui-state.md (Activity) for dispose on hide.

### Contract first

**M0a: glyph core.**
- Owns: §9.1's glyph files, GlyphDefs, glyph-motion, useSeen, figure-speech and figure-units.json, word-count.mjs, glyph-check, the /dev/style/glyphs gallery.
- Done when glyph-check passes and the gallery renders every glyph × state × level at 344 (278 px content) without overflow.

**M0b: shader core.**
- Owns: `src/lib/shader/**`, `src/components/fx/**`, shader-check, the /dev/style/fx page.
- Disjoint from M0a, so it can run in parallel.
- Done when shader-check passes; the fx page shows fallback / loop / hold / lost and the contrast backstop; a local forced-SwiftShader probe compiles both programs; and the per-context memory overhead is measured on the Fold (§6.7).

**M0c: checks and docs (serial, after M0a and M0b; sign-off).**
- Owns: package.json, nav.ts, shell-check, contrast-check, the ui-audit probes, redesign.md, redesign-contracts.md.
- Lands the line-style meanings as the lead decides U2 (D29), and the AMBIENT and WAIT rules as the lead decides U1 (D16).
- Done when `npm run ui:check` is green, and ui-audit's new probes pass on the two dev pages.

M0 touches nothing the progression workflow edits. With the lead's OK it may start before P; otherwise it starts at P.

**R0: roadmap contract (serial, after P and M0).**
- Owns: §9.3's R0 files.
- The word-count, honesty and tap-reachability harnesses land reporting only. Each lane flips its screens to hard gates as it lands.
- Done when roadmap-ui-check is green and its fixtures render the new states.

### Parallel lanes (after R0)

The lanes have disjoint component files. Each lane edits only its own marked section of roadmap.css and its own block of roadmap-ui-check, you-check and today-ui-check.

| Lane | Files | Screens | Depends on |
|---|---|---|---|
| R1 Today | AimLine.tsx, WeekQuests.tsx (all variants: today, aim, Now) | 10, 11, the Now week quests | R0 |
| R2 Rank & Aim card | ProficiencyBlock.tsx, PlanRanks.tsx, AimCard.tsx, AimFigure.tsx | 9, rank parts of 4 | R0 |
| R3 Living page | AimHeader.tsx, MeasureRow.tsx, PastWeekQuests.tsx, PaysLine.tsx, TowardAim.tsx, RoadmapView.tsx (MilestonesList, EmptyRoadmap, the closed footer) | 4, 5, 6, 12 (empty, done) | R0; renders R1's WeekQuests, R2's ProficiencyBlock, R4's rows (props unchanged) |
| R4 Rows | MilestoneCard.tsx, ItemRow.tsx, PracticeRow.tsx, TopicRow.tsx, DomainRow.tsx, ProvenanceChip.tsx, FlagChips.tsx, AddItemSheet.tsx | 3, row parts of 5 | R0 |
| R5 Draft review | DraftReview.tsx (incl. DraftRunning and the re-plan draft card), RunFacts.tsx, DateBlock.tsx, ChecksPanel.tsx, ThroughputPanel.tsx | 2, 12 (drafting) | R0; renders R4's rows |
| R6 Start sheet | StartSheet.tsx | 7 | R0 |
| R7 Intake & safety | RoadmapForm.tsx, ActivityConfirm.tsx (ActivityConfirmCard, IntakeActivities) | 1, 8 | R0 |

- The lanes keep component props stable, so they run in parallel.
- Merge order when two touch the same rendered page: R4 → R2 → R1 → R3 → R5 → R6 → R7. Each lane rebases on the previous one and re-runs the checks.

**RZ: final pass (serial).**
- All screens on hard budgets.
- Full ui-audit at 344 / 375 / 932 / 1440 in Night and Vellum, under full, calm and still, plus emulated prefers-contrast: more and forced-colors.
- The manual device pass (§11.8).
- Lead review of the D-items marked sign-off.

### Phase 3 (after RZ; the shared system on other screens)

| Lane | Scope |
|---|---|
| S1 | /today cards and /you adopt HonestyChip, InfoTip, GlyphStat, figureSpeech and KindGlyph (no shader on Today) |
| S2 | Streak flame (flame.*, `kindle`) on GoalLadder and the day-streak surfaces |
| S3 | The review recap adopts the glyph set |

A new shader program on another route follows §6.9 and needs its route added to AMBIENT_ROUTES by the lead.

---

## 11. Tests

All pure checks run with tsx: no DB, network, model, dev server or browser. ui-audit runs against a server the user starts. The implementing lanes run `next build` for the bundle checks.

### 11.1 scripts/glyph-check.ts (new; `npm run ui:glyph`; part of ui:check)

**Grammar**
- Every GlyphName renders in idle, active and done.
- States differ in path d, fill or dasharray, never in colour alone (quest glyphs: the started pip).
- viewBox is `0 0 24 24`; stroke widths are in {1.25, 1.5, 1.75, 2, 2.25}; caps and joins are round; colour is currentColor only.
- ≤ 6 paths; no filter, gradient, mask or `<text>`.
- Every stroked path has pathLength=100 and a data-part.
- Badge paths have ≤ 2 subpaths (ev.counted ≤ 3) and no feature under 3 units.
- No hex colour, and no gold, --mp, --xp, --owed or --light, in glyph files or glyph.css.
- Static families render as `<use>` into GlyphDefs; animatable families render inline.

**Distinctness and classes**
- pv.suggest is not c-xp and is not filled.
- safe.health is distinct from h-sick and s-duty; no `safe.*` path is a pill.
- rank.0…rank.6 are pairwise distinct; RankSeal has no lock part.
- No glyph duplicates a kit path.
- m.lock renders only in needs-check contexts (Start-sheet rows): the composites never pass it a rank or a draft Paragon.
- t.earliest and every HonestyChip rim carry no dasharray; only pv.suggest's family, v.unv and the pending rail node are dashed.
- Verdict glyphs render only inside a verdict chip; ev.measured only with a measuredAt; GlyphStat with `estimate` never uses ev.measured.

**SSR, still and calm**
- renderToStaticMarkup of every glyph and composite has no inline `opacity:0`, except `data-part="ping"`, and no data-playing attribute. The resting markup equals the declared end state.
- With a stubbed DOM:
  - under `data-motion="still"`, playGlyph calls `element.animate` 0 times;
  - under calm, every motion passes only opacity keyframes, duration ≤ 260 and delay ≤ 200; `ping`, `rim` and `notch` make 0 calls; burst creates 0 motes.
- A chain issues every part's animate call synchronously in one tick, each with `fill: 'backwards'` (no await between parts).
- With a stubbed rect reporting the element ≥ 50% in view at hydration, no SEEN motion uses a keyframe that hides, zeroes or un-draws a part (opacity 0, dashoffset 100, scale 0); only the accent variant plays (H15).

**Licence and triggers** (stubbed localStorage and IntersectionObserver)
- useSeenEvent:
  - a first-ever view does not play (and stores);
  - the same value does not play;
  - a changed value offscreen does not play and is not stored;
  - a changed value on screen plays exactly once and then stores;
  - an element in view at hydration plays its accent, not the motion.
- useSeenValue returns the last-seen measured value, never 0, and null when the value is equal.
- A key with a different basis does not play; a SWITCHED_OFF rebase with the same basisVersion and acceptedDay gives a different basis key.
- Storage: one getItem per surface; writes batched per frame; a newer basis deletes the roadmap's older entries; the 301st `what` evicts the least recently written roadmap.
- The rank and seal keys contain no surface.
- playGlyph without a `licence` throws in dev and fails the check.
- No `element.animate(` outside src/lib/motion.ts.
- RankSeal plays `rank-rise` only when the counted index rises, never on a pending reach, and announce() is called exactly once per event.
- `reach` and `rank-rise` are separate events in sequence(), each ≤ 1.6 s.
- No countTo, roll or draw on a value formatted with ≈, marked stated, unverified or bestCase. The check scans the call sites' arguments in glyph and roadmap files.
- sequence(): more than 6 pending events means 0 plays and a SINCE_LINE with ≤ 3 items.

**No pulse, no spin, one loop**
- RouteRail's current and pending nodes and RankSeal's next rank carry no animation class.
- No ring part of RouteRail is drawn by dashoffset outside `reach`; `start` uses only opacity and scale on the here-ring.
- glyph.css's only animation is `mg-breathe`: opacity only, on `svg.mg-weave`, iteration count ≤ 74 and even, `alternate`, scoped under `[data-wait]:not([data-weave-live]):not([data-paused])`, with `animation-play-state: var(--ambient-play)`.
- No identifier contains 'spin' or 'shimmer'.

**CSS**
- glyph.css starts with the layer order.
- Keyframes use only transform, opacity, stroke-dashoffset and stroke-dasharray.
- No transition on a layout property.
- No class collides with a Tailwind utility (it reuses shell-check's compiler).

**HonestyChip**
- For every kind, the accessible tree holds the full string exactly once: the glyph and the visible label are aria-hidden, the full string is sr-only (static) or in the panel (button). No `title` anywhere in glyph components.
- A `full` chip is a `<button>` with min-height and min-width 40 px, aria-expanded="false", and an aria-controls matching a `hidden` panel that holds the full text and follows the button in DOM order.
- A non-`full` chip is not focusable.
- The Gemini kinds' visible labels contain "Gemini".

**ProvMark**
- Its sr text equals the current words: "Written by the app", "added by the app", "worked out by the app", "You wrote this", "You checked this", "Your syllabus line".

**InfoTip**
- A closed tip renders its panel with `hidden` and an id, right after the button, containing its children verbatim.
- The button's aria-controls matches the panel id, and its CSS size is ≥ 40 × 40.
- `describes` wires aria-describedby on the target control.
- A composite never renders more than 3 InfoTips per card (Key included).

**Spoken twins (D26)**
- figureSpeech covers every unit in figure-units.json, and word-count.mjs exempts exactly those units.
- GlyphStat, StatRow, PipStrip, chip figures and RouteRail glyph counts render the compact text aria-hidden plus one sr-only twin. Cases: "≈ 110 d" → "about 110 days"; "L6+" → "level 6 or higher"; "10 h/wk" → "10 hours a week"; "46 → 38" → "from 46 to 38"; "↓ 1 since Sun" → "down 1 since Sunday".

**Composites at 344**
- StageLadder is a 12-column grid with HTML numerals; no composite has a `<text>`.
- TimeBar: root role="group" with aria-labelledby; the SVG is aria-hidden; the list has one `<li>` per marker; the label placer puts three marks 40 px apart on 3 rows with no overlap by the width table, and drops a fourth into the list only.
- RouteRail renders every MilestoneRowState; the strip's current node is an arc, never a half disc.

**Safety**
- Glyph-motion is never called with a `safe.*` or `sess.*` glyph.
- The Activities components contain no `data-play`, `.mg-weave` or `.shd`.

### 11.2 scripts/shader-check.ts (new; `npm run ui:shader`; part of ui:check)

**horizonParams and the marks**
- percent 41 (value .4199) gives front .41; 100 gives 1; values above 1 clamp; null or NaN gives −1 and kind 'static'.
- SELF_REPORTED gives the dotted walked path; MEASURED and live give solid.
- Depth 12 / 10 / 8 / null gives contours 12 / 10 / 8 / 0.
- ARCHIVED and DONE give kind 'static'.
- The seed is deterministic per roadmapId and differs across ids.
- The HORIZON uniforms carry no Proficiency value; the HORIZON source contains no `bez`, `front`, `walked` or `path` identifier.

**Transitions (SVG marks)**
- lastSeen null gives from == front.
- .50 → .41 and .30 → .41 give from = lastSeen (both directions, D9).
- A different basis key, or 'rebased', gives from == front.
- HorizonField's key includes the basis signature.

**Geometry**
- p1.x is the midpoint.
- frontPoint(f).x is linear and strictly increasing; frontPoint(0) = p0 and frontPoint(1) = p2.
- The walked width equals f × (p2.x − p0.x) within 1e-9.
- horizonDawnStops evaluated against the HORIZON maths (ported to TS) at air 0 differ by ≤ 1/255 per channel at 9 sample points.

**weave**
- The period is 12 s and 600/12 is an integer.
- stale or paused gives kind 'static'.

**gate**
- The full truth table of §6.4: still and calm → css; contrastMore and forcedColors → css; static → css; !highp, degraded, saveData, deviceMemory ≤ 2 → css; otherLoopLive → css; AMBIENT with osReducedMotion, a spent budget, an outside route or !HORIZON_AIR → css; WAIT stale, paused or ≥ 90 s → css; live + hidden or offscreen → hold, then css after 10 s; full + all clear → loop.
- AMBIENT_ROUTES excludes /today and /review.

**dprOf and slotPixels**
- dprOf for the horizon: 3 → 1, 1 → 1, NaN or 0 → 1; for the weave: 3 → 1.5.
- slotPixels(312, 56, 1) → [312, 56]; slotPixels(312, 48, 1.5) → [468, 72]; per-program caps are honoured.

**Palette and governor**
- parseCssColor handles '#f1f3f8', '#abc' and 'rgba(…, .34)', and returns null for garbage.
- The cap is .20 for Night and .14 for Vellum.
- SHADER_VARS contains none of --owed, --gold-*, --mp, --xp, --pts or --light.
- throttleVerdict: before load + idle → not sampled; fewer than 2 windows → measuring; two 2 s windows with median > 22 ms → degrade; one slow window then a fast one → ok.

**GLSL lint (programs.ts)**
- The precision guard comes first.
- No `#version 300`, no in/out qualifiers, no texture or texture2D, no dynamic vector indexing.
- Every loop has a literal int bound ≤ 4.
- No smoothstep with reversed literal edges.
- Declared uniforms match each binder's keys exactly, in both directions, ≤ 4 vec4.
- Each source is ≤ 2 KB and contains no 'spin'.

**Runtime static rules**
- It imports none of three, ogl, regl, twgl or pixi.
- It passes failIfMajorPerformanceCaveat and powerPreference 'low-power', caps DPR per program (1 / 1.5) and has pixel caps.
- dispose() removes the lost / restored listeners before loseContext(), removes the canvas and sets data-shd-state="fallback".
- It never calls console.error.

**Runtime with a fake canvas** (getContext returns a recording mock)
- still, calm, contrast and static: getContext is never called.
- full horizon: frames at ≤ 12 fps; the air ramps in over 400 ms and out at 4.6 s; frames stop and the canvas is removed by 5 s of visible time; three mounts in one session use one shared 5 s budget.
- full weave: frames at ≤ 20 fps, stopping by 90 s; WeavePause stops it at once.
- The first canvas frame is drawn before data-live is set, and data-live comes one rAF later.
- A WAIT mount on the page disposes a live AMBIENT slot; a second mount while one slot is live returns null.
- Three mount / dispose cycles within 60 s leave supported === true.
- Two counted losses within 60 s set supported to false; a loss while hidden, a loss within 1 s of creation, or a self-initiated loss is not counted.
- A theme mutation while held draws nothing until the slot is visible.
- Dispose followed by remount shows the fallback first (data-shd-state="fallback", no canvas).
- A matchMedia change to prefers-contrast: more disposes a live slot.

### 11.3 scripts/roadmap-ui-check.ts (R0 adds the harness; each lane flips its gates)

**Word budgets**
- Every fixture in §3.2 is asserted with `countAppWords` (scripts/word-count.mjs), including the fold blocks and ≤ 8 app words per Today line.
- A `data-wc` element whose text is in a SHORT_* or other app-copy list fails, except the honesty labels listed in §8 (exemptions cannot hide app words).

**Honesty survival, in VISIBLE text** (the §3.1 visibility rules, without the exemptions)
- Each ✓ row in §8, on every fixture where it applies:
  - "Gemini" on every DRAFT, KEPT and pick chip, on the Gemini lane, and in the constraints chip; integrityLine verbatim on v4 drafts;
  - "Unverified ·" on the verdict chip of the capacity-calibrating fixture; "best case" and "pass rate calibrating" on the depth-calibrating fixture; "sized by Gemini" where geminiShare is set;
  - exactly one "Not medical advice · ask a professional" per body or care card, with HEALTH_LINE present in its markup, and none on Field cards;
  - ≈ on estimated dates, at month precision; "yours" beside every t.pin;
  - "review gap" beside every ≈ day figure taken from depthGapDays;
  - "not timed"; "reads high";
  - "Draft · not accepted yet", plus the integrity chip, RUN_STARTER_LINE or the banner;
  - "Google may use this" on the intake and the draft header on the Gemini path;
  - "App policy"; "yours to judge"; "pays nothing"; "context only"; "Aim not checked";
  - "pays", "× progress" and "from 70%" on every pay line; "at acceptance" in ACCEPTED;
  - "Proficiency" with "→ L" on the Aim card and the header; "from your ticks" beside a SELF_REPORTED %;
  - "gives" (or "Next ·" / "Reaching it") beside every rank name not yet held, and no not-held rank in the done state;
  - "counts from" on pending fixtures; "not reached" on closed-unreached fixtures; "Past due" on past-due fixtures;
  - "Easy, mobility and technique practice only until you confirm.";
  - activitySaveLine verbatim and "The plan can include:" verbatim; the Save / Nothing to avoid / Confirm these buttons;
  - "Over"; "Target lowered"; "↓ 1 since Sun";
  - the rows-left count;
  - blocking-flag reasons;
  - RUN_STARTER_LINE, the EDIT_NUMBERS chip, LEGACY_GEMINI_HIDDEN, the milestone pays-nothing chip, and «not recorded here» on the Aim card writes-off fixture;
  - SINCE_LINE on the since-line fixture.
- RUNNING: "Drafting · … started … usually about 18 s" stays static text in aria-live; no ladder, bar or %; no 'spin'; the pause button is present.

**Tap reachability and the accessibility tree**
- Every sr-only string in the survival list also appears inside a `hidden` panel controlled by a button in the same card (a chip, an InfoTip, the Key, a row's ▸), or in the TimeBar list behind its Dates toggle.
- examWaypointLine and the earliest text are in the accessibility tree: not under aria-hidden, not inside role="img".
- Each card renders ≤ 3 InfoTips.

**Full-text survival**
- Every currently pinned string (about 64 checks) is still in static markup. They are expected to pass unchanged.

**Deliberate re-pins** (each named in its PR)
- HEALTH_LINE per row becomes per card (the checks that count it on body rows and drafts);
- the answered activity card's flat exact text (now two summary lines with glyphs beside the names);
- the aim label moving to the Key panel;
- the CSS checks extended to glyph.css and fx.css.

**Glyph use**
- Practice rows use the plan's track sigil.
- Every KindGlyph has an evidence badge.
- MeasureRow and the headline Meter pass `from` under the same basis.
- The current RouteRail node has no animation class.

**Shader slots (SSR)**
- Aim card ACTIVE, ACCEPTED, fallen and re-plan render `.shd.shd-horizon[aria-hidden="true"]` with `.shd-marks`, no `<canvas>`, and a walked dasharray of `${percent} 100`.
- DONE and ARCHIVED render kind static; unmeasured renders the unlit marks; SELF_REPORTED is dotted.
- ASK, LATER, HIDDEN and DRAFT render no `.shd`.
- RUNNING renders `.shd-weave` and the pause button.
- Intake, Start sheet and the Activities card carry `data-fx="none"` and no `.shd`.

**At 344**
- StageLadder, the RouteRail strip and the TimeBar fit the 278 px content box with no overflow; their text is HTML at ≥ 12 px.

**Never red**
- No --owed, gold or --light in glyph.css, fx.css or roadmap.css; pace glyphs are ink.

### 11.4 scripts/today-ui-check.ts and scripts/you-check.ts (lane blocks)

**Today**
- No `/dev/style/today` fixture renders `.shd`, `[data-wait]`, `data-play` or burst hooks.
- The aim line contains no animated glyph (no usePlayOnSeen); START keeps "Gives … Aim rank".
- Week quests: ≤ 3 rows plus "n more"; «pays nothing» visible; one health chip on body plans; the Key lists each row's place and due sentence.

**/you**
- The ASK card has no band and no route-invite motion.
- The Aim card's rank seen key equals AimHeader's (no surface in it).
- DONE closed-unreached shows no [m.seal].

### 11.5 scripts/shell-check.ts additions (M0c)

- glyph.css and fx.css: layer order first; fx.css has no @keyframes; glyph.css keyframes are transform, opacity, stroke-dashoffset and stroke-dasharray only.
- `.shd canvas` has pointer-events: none; `.shd-marks` sits above `.shd-fb`; the prefers-contrast and forced-colors backstops exist.
- Nothing imports `@/lib/shader/runtime` statically (only `import(`), and nothing under the /today tree imports `@/components/fx`.
- No three, ogl, regl, twgl or pixi in package.json or src.
- AMBIENT_ROUTES (imported from params.ts) excludes /today and /review.
- The existing rules still hold: "exactly two loops in the kit" (styles/*.css only), and "every infinite loop pauses on --ambient-play".

### 11.6 scripts/contrast-check.ts additions (M0c)

Night and Vellum, WCAG 2.x:

| Pair | Minimum |
|---|---|
| ink-0, ink-1, ink-2 chip text on --card, --raised, --sunken, --overlay | ≥ 4.5 |
| ink-mute as a non-text glyph on card, raised, sunken, overlay | ≥ 3 |
| ink-1 glyph strokes and the badge ring (--card disc on --card / --raised) | ≥ 3 against the surface beside them |
| the horizon's walked path (ink-0) on card mixed with ink-0 at the dawn cap (Night .20, Vellum .14) | ≥ 3 |
| the unwalked path and hairline (ink-mute) on the same mix | ≥ 3 |
| the pv.suggest balloon rim (ink-2) | ≥ 3 |

### 11.7 scripts/ui-audit.mjs additions (M0c, run at 344, 375, 932 and 1440; Night and Vellum)

**Layout, text and targets**
- At 344 and 375:
  - DOM word budgets (§3.2) via word-count.mjs on the live DOM, including the fold;
  - no horizontal overflow;
  - every visible text ≥ 12 px, measured on HTML; no SVG `<text>` in a composite;
  - every interactive element ≥ 40 px measured on its own rect, with no `::before` allowance (44 for "+ Add", RouteRail rows, GlyphButton);
  - no two interactive rects intersect;
  - the ASK card ≤ 410 px; every Today aim line ≤ 72 px with no clamped text.
- At 932 and 1440: no overflow; two-column `.rm-cols`; chips one line.

**At rest** (/today, /review)
- No running infinite animation (existing).
- No `html[data-shader-running]`; `__xtnlShader` absent or `running()` empty; `frames` unchanged over 1 s; no `<canvas>`.

**Still and calm** (still: emulated prefers-reduced-motion with the pref on system; calm: the pref set to calm)
- On every roadmap and /you fixture:
  - no `<canvas>`, and no runtime chunk in performance resource entries;
  - every `.shd` has data-shd-state="fallback";
  - under still, `document.getAnimations()` is empty after 2 s; under calm, no animation with an iteration count above 1.

**High contrast and forced colours** (emulated prefers-contrast: more, then forced-colors: active)
- No `<canvas>` and no runtime chunk; frames do not rise.
- Every `.shd` is non-empty: `.shd-marks` is visible with its hairline and path.

**Full, on the active fixtures**
- `frames` rises after a quiet window, for ≤ 5 s of visible time, then stops; the canvas is removed and data-shd-state returns to "fallback".
- Navigating /you → /you/roadmap → /you in the same session plays no more air (the budget is spent).
- Scrolling the slot offscreen stops frames within 200 ms; after 10 s offscreen the canvas is gone.
- A hidden page (CDP lifecycle) stops frames; data-power=save stops the loop.
- Scrolling or tapping during the quiet window delays getContext.
- At emulated DPR 3: the horizon canvas.width ≤ clientWidth; the weave canvas.width ≤ ceil(clientWidth × 1.5).

**Full, on the drafting fixtures**
- The weave frames rise at ≤ 20 fps and stop by 90 s (test clock); the pause button stops them at once.
- One loop per page: on the living page with a re-plan running, the header horizon has no canvas.
- With the weave shader live, `svg.mg-weave` has no running animation; with WebGL disabled, the breathe runs as a compositor animation (a 3 s trace shows no main-thread Paint at display rate for it).

**Fallback paths**
- With WebGL disabled (getContext patched to return null for 'webgl'): SVG layers visible, no canvas, no console errors.
- With `__XTNL_SHD_FORCE` (SwiftShader): both programs status 'ok'.
- The walked path's DOM geometry (getTotalLength × its dasharray share) matches front × (p2.x − p0.x) within 0.5% for fixtures at 0, 23, 41 and 100%; unmeasured has no front dot.
- At air 0, the canvas pixels and the SVG dawn differ by ≤ 2/255 at 9 probe points (the swap is invisible).
- `lose({ counted: true })` keeps the SVG with no errors; `restore()` goes live again; three mount / dispose round trips leave supported true.

**No text over a field**
- No text node's client rect intersects any `.shd` rect.

**Performance** (4× CPU throttle at 344)
- No long task over 50 ms from getContext to the first presented frame.
- INP ≤ 200 ms on /you and /you/roadmap with a loop live (scripted taps on the chips).
- The LCP element is text.
- CLS from slots is 0.
- The next build output shows:
  - the shader chunk ≤ 5 KB gz and in no route's first-load JS;
  - framer-motion absent from /today and /review chunks;
  - glyph code on /today ≤ 3 KB gz;
  - glyph markup on draft-mixed ≤ 8 KB gz across HTML and the RSC payload, and ≤ 1,200 added DOM nodes.

**Gateway compliance** (instrumented play() in a dev build)
- On /dev/style/glyphs at each level, every recorded call matches §4.7's calm and still columns, and its in-view-at-hydration column.

### 11.8 Manual pass (release gate)

Run it on the Galaxy Fold cover (344) and inner (932) screens, a mid Android phone, an iPhone, and desktop 1440, in Night and Vellum, under full, calm and still.
- Before and after screenshots of each of the 12 surfaces.
- TalkBack (and VoiceOver on the iPhone) over the Aim card, week quests, Activities card, the Depth and date card and the Start sheet:
  - every glyph-only mark and chip is read once, with its full words;
  - the spoken twins are read as words: "about 110 days", "level 6 or higher", "10 hours a week", "from 46 to 38", "down 1 since Sunday";
  - the TimeBar's marker list is reachable, including the exam waypoint and earliest;
  - every chip button and InfoTip opens, reads and closes, and focus returns.
- Badges read at 12 px on the Fold cover at 100% and 200% zoom.
- A remote DevTools trace on /you/roadmap in full:
  - a cold load: the long task from getContext to the first presented frame ≤ 50 ms;
  - per-frame main-thread work ≤ 0.5 ms; a steady 12 fps air that stops by 5 s;
  - LCP within ±50 ms of `?shd=off`.
- Battery: on Android Chrome or the TWA, a 60 s drafting run at battery ≤ 20% stops the weave. (navigator.getBattery is Chromium-only.)
- iOS Low Power Mode: on the iPhone, the throttle governor turns a live loop into SVG within two 2 s windows (≤ 4 s).
- WCAG 2.2.2: the horizon air stops within 5 s and does not restart on a /you ↔ /you/roadmap trip; the weave's pause button stops it.
- Rank-new and reach-new fixtures play once, then never again on reload or on the other surface. They never play in calm or still, never on a pending reach, and an in-view-at-hydration seal shows only its accent (no flash back to an earlier rank).
- The Activities card does not move at any level.

---

## 12. Acceptance

The work is done when all of these hold:
1. Every budget in §3.2 passes as a hard gate in roadmap-ui-check and in ui-audit's DOM count at 344.
2. Every ✓ honesty element in §8 is visible on every fixture where it applies, its full text is one tap away, and every previously pinned string is still in static markup. "Gemini" is visible on every Gemini mark; unverified, best-case and calibrating marks are visible; a rank not yet held always carries its verb. The only re-pins are the named ones (§11.3).
3. Screen readers hear each honesty string once and every compact figure in words (D13, D26).
4. The glyph catalogue (§4) is complete in /dev/style/glyphs. glyph-check passes. Every roadmap surface uses KindGlyph, ProvMark, HonestyChip, InfoTip and the composites as in §3.3, and Practice rows show the plan's track sigil.
5. The roadmap has its first motion:
   - rank rise, stage reached, quest done, start, unlock, pay swap, depth / intensity / verdict picks, date crossfades, and meters from last seen;
   - each with a licence, each through the gateway;
   - each SEEN event played once per viewer, only on screen, never on a first visit, never on a pending reach, and never by un-drawing something already on screen.
6. Under still, nothing moves anywhere (no WAAPI call, no CSS animation, no canvas), and the words are identical. Under calm, nothing loops, nothing uses transform or dashes, and no canvas exists.
7. The horizon band shows on the Aim card and the roadmap header:
   - its measured marks are SVG and match the printed % within 0.5% of the path width;
   - its air runs only in full on /you and /you/roadmap, for ≤ 5 s of visible time per session, and pauses offscreen, hidden and on power-save;
   - under high contrast or forced colours the band shows its hairline and path, with no canvas.
8. The weave runs only while a draft runs, inside the draft card, and stops when stale, when paused, or after 90 s.
9. Shaders:
   - fall back cleanly with no WebGL, under saveData, on low-memory or mediump-only devices, when throttled, and after context loss;
   - are in no first-load chunk (≤ 5 KB gz lazily);
   - cap DPR at 1 (horizon) and 1.5 (weave);
   - hold ≤ 1 live context, only while looping;
   - create no context on /today or /review.
10. /today and /review stay at rest:
    - no loop, no shader, no burst;
    - Today's aim line ≤ 72 px and static;
    - the ASK card ≤ 410 px;
    - never red.
11. The Activities card and every health chip are static at every level, and the consent text (the save line and "The plan can include") is visible word for word.
12. ui:check, ui-audit (344 / 375 / 932 / 1440, both themes, three levels, high contrast and forced colours) and contrast-check pass. The manual device pass in §11.8 is signed off.
13. No new runtime dependency, and no edit to a frozen file without its sign-off (§9.2, §9.4).

---

## 13. Deferred

- **More shader programs.**
  - `slate`: a seeded grain and contour texture for empty, ASK and done backdrops.
  - The rank aura corona with a --light "new" window. This needs D22 relaxed.
  - The stage halo behind the current node.
  - `press` / `bloom`: a one-shot shader ring and sparks for a rank rise.
  - `CeremonyBloom` for SealCard (T2) and AscensionCurtain (T3), with `if (!play()) burst()`.
- **A single shader hub** blitting to 2D canvases (C). Revisit if a page ever needs more than one live slot.
- **A longer horizon air with an on-page pause** (U1 option b), if the user wants the shader alive beyond 5 s.
- **View transitions:** the Aim card medallion morphing into the header medallion, and typed route crossfades. This needs `experimental.viewTransition` and a still rule for the `::view-transition-*` pseudo-elements.
- **Re-plan reorder animation** (a WAAPI FLIP through play()).
- **The "Accepted" stamp** on Accept plan, while the route still re-renders to the living page.
- **A T1 `aim-rank` CelebrationKind**, so the rise plays once across devices (server-persisted shownAt). Sound and haptics for roadmap events.
- **An interactive StageLadder** as the Depth control.
- **InfoTip as an anchored popover** on desktop, once anchor positioning is baseline. `hidden="until-found"`, once React types support it.
- **A draw on Today's aim line.** Declined for now (D10). Revisit only with a ui-audit at-rest exemption the lead signs.
- **LastSeenMeter's own seen key**, which has no basis, so it animates across a rebase for its other callers. This is a fix for the meter's owner. The roadmap stops using it here (useSeenValue with a basis).
- **Moving the kit sprite** (`i-`, `s-`, `c-`, `h-`) into the glyph path table, so there is one source.
- **Word budgets for non-roadmap screens** (Today cards, /you, Review). Phase 3 adoption sets them.
- **Removed motions** `timebar-draw`, `pay-roll` and `route-invite` (revision 2). They return only if a measured trigger exists for them.

---

## 14. Critique notes (revision 2)

Two critiques reviewed revision 1: **C1**, accessibility and performance (24 findings: 12 major, 12 minor), and **C2**, honesty of the word cut (26 findings: 4 blockers, 15 major, 7 minor). Every blocker and major is applied. Every minor is applied, two of them in part. Nothing is declined.

### 14.1 C2: honesty (blockers and majors)

| # | Finding | Disposition | Where |
|---|---|---|---|
| C2-B1 | "Gemini" was cut from every provenance label; a bare "not checked" is ambiguous | Applied. Every Gemini chip, pick and lane shows "Gemini"; the integrity chip is integrityLine verbatim (with its gapsKept and not-shown variants); lanes have who-words and list only what geminiV4PartsOf says Gemini did. | D25, §3.3 s2–3, §4.4, §4.5 GlyphLane, §4.6, §8, §11.1, §11.3 |
| C2-B2 | Unverified, best-case, calibrating and sized-by-Gemini marks had no compact form | Applied: the unverified verdict chip (verdictWord), «best case», "pass rate calibrating n/30", «n% sized by Gemini»; `unverified`, `bestCase`, `calibrating` props; new fixtures. | D28, §3.3 s2–3, s5, s7, §4.5, §4.6, §8, §11.3 |
| C2-B3 | "Aim rank X" without its verb read as a rank already held | Applied: "gives Aim rank X" with the active (next) glyph everywhere, Today START included (7 app words); a check that every not-held rank has its verb. | §3.3 s3, s7, s11, §8, §11.3, §11.4 |
| C2-B4 | Consent text on the Activities card was cut; pill glyphs read as medication | Applied: activitySaveLine and "The plan can include: …" stay visible verbatim; names beside every session glyph; the pills are gone (a strike over the session glyph; i-check for can include). Draft-confirm stays near 40 app words against ≤ 45. | §3.3 s1, s8, §4.4, §7.8, §8, §12 |
| C2-M1 | Seen keys on acceptedDay let a rebase animate as a rise | Applied with a refinement: basisVersion alone does not change on SWITCHED_OFF or a lowered depth within a version (rebaseCauseOf), so the key uses basisVersion plus a hash of basisSignature(detail.basis). New fixture "rebase SWITCHED_OFF, last seen before". | D8, §5.6, §6.2, §11.1–§11.3 |
| C2-M2 | The Aim card lost "toward L12"; the date was day-precise and whose it was relied on a glyph | Applied: "Proficiency → L12" on the Aim card; "L12 by ≈ Dec 2027" (month precision for every estimate); "yours" beside t.pin. | §3.3 s4, s9, §8 |
| C2-M3 | Closed-unreached, pending-reach and past-due states were never drawn | Applied: RouteRail states for every MilestoneRowState; DONE split into reached and closed unreached; SEEN events fire on the counted reach only. | D18, §3.3 s6, s9, s12, §4.5, §4.7, §8 |
| C2-M4 | The constraints chip dropped "shown to Gemini"; no free-tier row on the draft | Applied: «Shown to Gemini · not checked»; «Google may use this» on the draft header. | §3.3 s2, §8, §11.3 |
| C2-M5 | The health chip dropped "check with a professional" | Applied: «Not medical advice · ask a professional». | D12, §4.6, §8 |
| C2-M6 | sr-only full text and `title` were unreachable on touch | Applied: no `title`; every sr string is also in the Key or the row's ▸; the TimeBar list has a Dates toggle; a tap-reachability check. | D13, §3.3, §11.3 |
| C2-M7 | Glyphs gave numbers a false class (a clock on estimates, Fits on a Tight card, a flag on 1/6) | Applied: ev.estimate / pv.you / m.queue / m.seal; unit words; glyph-check class rules. | D27, §3.3 s1–2, s4, §11.1 |
| C2-M8 | "≈ 110 d" read as time to the aim | Applied: "review gap ≈ 110 d". | §3.3 s1–2, §4.4 t.span, §8 |
| C2-M9 | One padlock meant three opposite things | Applied: m.lock means only "needs your check"; no padlock on RankSeal; a draft's Paragon is an idle seal; "keeps your rank" uses the held rank glyph. | D5, §4.4, §11.1 |
| C2-M10 | "Dashed = not checked" contradicted the house | Applied as the house reading (dashed = calibrating or not yet counted; not checked = the balloon shapes; estimates ≈ only; self-reported dotted; held = HeldGlyph). Needs the lead's sign-off: **U2**. | D29, §4.1, §4.4, §6.6 |
| C2-M11 | The weave glyph marched dashes toward the aim; the weave ran beside Proficiency | Applied: an opacity breathe with no direction; the re-plan weave runs only inside the draft card; one loop per page. | D19, §5.7, §6.1, H5, H7 |
| C2-M12 | `start` swept a ring like a Promise-ring close at 0% | Applied: an opacity and scale stamp, then the ping; no dashoffset on rail rings outside `reach`. | §4.7, §11.1 |
| C2-M13 | SEEN was used for estimates and an invitation id | Applied: a CHANGED licence (crossfade only); `timebar-draw` and `route-invite` removed. | D7, §4.7, §5.2 |
| C2-M14 | The dawn encoded the % and the air made it breathe ±25% | Applied, more strongly than asked: the dawn is constant and the shader carries no number. | D15, §6.3 |
| C2-M15 | The pay line lost "× progress" and "pays"; ACCEPTED read as live | Applied: "pays [c-mp] 6 × progress «from 70%»" everywhere; «at acceptance» in ACCEPTED; a floor tick, not a cap tick. | §3.3 s5, s7, s9, §8 |

### 14.2 C1: accessibility and performance (majors)

| # | Finding | Disposition | Where |
|---|---|---|---|
| C1-M1 | High contrast blanked the band while the loop kept running | Applied: contrast and forced colours are gate inputs (css, re-gated on media change); CSS kept as a backstop; the measured marks stay visible, so the band is never empty; a ui-audit probe. | §6.4, §6.6, §11.7 |
| C1-M2 | dispose()'s own loseContext counted as a loss, a silent kill switch | Applied: listeners removed first; only visible, non-self-initiated losses of contexts live > 1 s count; a 3-cycle test. | §6.5 steps 11–12, §11.2 |
| C1-M3 | 'frame' created a context for a static picture | Applied: the gate returns css / loop / hold; static states are SVG; calm, DONE, ARCHIVED, !highp and degraded never create a context. | D17, §6.1, §6.4 |
| C1-M4 | The shader drew the data line soft at DPR 1.5; the swap popped | Applied: every measured mark is server SVG on top; the canvas draws only the dawn and air at DPR ≤ 1; data-live one rAF after the first presented frame; a 400 ms air ramp. | D15, §6.3, §6.5 step 6, §6.6 |
| C1-M5 | Auto-moving air for 90 s per mount fails WCAG 2.2.2 | Applied: AMBIENT ≤ 5 s visible per program per session; needs no-preference; one loop per page (so one live context); WAIT keeps 90 s and gains a pause button. | D16, D17, D19, §5.2, H17 |
| C1-M6 | mg-weave ran stroke-dashoffset on the main thread beside the weave shader | Applied: the glyph breathes in opacity on the outer svg (compositor); it is still while the weave shader is live; a trace probe. | §5.7, §11.7 |
| C1-M7 | SSR end state jumped back to the start key after hydration | Applied: arm only offscreen; accents for in-view-at-hydration; chains created up front. | D30, §4.7, §5.5, §5.6, H15 |
| C1-M8 | 288 / 312 px composites at a 278 px content box | Applied: 278 px stated; StageLadder and the strip are grids; all composite text is HTML. | D6, §4.5, §7, §11.3 |
| C1-M9 | Static chips were read two or three times | Applied: one accessible occurrence; RankSeal aria-hidden beside its label. | D13, §4.1, §4.5, §11.1 |
| C1-M10 | TimeBar's role=img hid the per-marker text | Applied: role=group, an aria-hidden SVG, a marker list. | §4.5, §11.3 |
| C1-M11 | Compact figures were read as symbols | Applied: spoken twins from one shared unit table. | D26, §11.1, §11.8 |
| C1-M12 | 40 px via ::before failed the audit and overlapped | Applied: the `.rm-ilink` pattern; chip-row gaps; a no-intersection probe. | D31, §4.5, §11.7 |

### 14.3 Minors (both critiques)

| # | Finding | Disposition |
|---|---|---|
| C1-m1 | Too many InfoTip stops | Applied: ≤ 3 per card, the rest in the Key or ▸; panels follow their button; aria-describedby. |
| C1-m2 | The question moved to a placeholder | Applied: the placeholder stays and aria-describedby carries the question. |
| C1-m3 | The governor timed async calls and sampled only the first 60 frames | Applied: a shared ticker, fps per program (12 / 20), rolling 2 s windows after load and idle, degrade at any time; INP budget. |
| C1-m4 | The runtime started mid-scroll | Applied: a 400 ms quiet window after load; the cold-load long task is a manual item. |
| C1-m5 | Memory left out buffers and overhead; contexts never released | Applied: 2–3 × buffer + measured overhead; release on loop end and after 10 s offscreen; written into §6.9. |
| C1-m6 | Battery signal is Chromium-only | Applied: documented; throttling is the cross-browser signal; Android and iOS manual items. |
| C1-m7 / C2-m4 | Quest idle vs active differed by colour only | Applied: the started pip (a shape cue). |
| C1-m8 | TimeBar labels overlapped; badges too detailed | Applied: width-based placement with 3 rows; badges ≤ 2 subpaths. **Partly**: `ev.counted` keeps 3 tally strokes, because a tally needs 3 to read as a count; it is checked at 200% zoom instead. |
| C1-m9 | Seen keys grew without limit | Applied: one entry per roadmap and basis, old bases deleted, a 300 cap, batched reads and writes. |
| C1-m10 | Inline static glyphs doubled markup | Applied: `<use>` into a per-route GlyphDefs; HTML + RSC budget and a DOM-node budget. **Partly**: symbol ids use a route prefix rather than useId (GlyphDefs is a server component); gradients, which do break in a hidden subtree, use useId. |
| C1-m11 | The reach chain was 2.4 s | Applied: rank-rise is its own queued event; both ≤ 1.04 s. |
| C1-m12 | Activity (cacheComponents) could leave a dead canvas | Applied: dispose on hide removes the canvas and resets the state; gradient ids from useId; a remount test. |
| C2-m1 | step-done had a burst | Applied: check only. |
| C2-m2 | H2 vs the PromiseRing overshoot; pay-roll | Applied: the exception is named; `pay-swap` is a crossfade. |
| C2-m3 | The rank key included the surface | Applied: no surface in shared keys. |
| C2-m5 | ≈ on a tick count; a half-disc node; measured time unlabelled | Applied. |
| C2-m6 | After an absence, changes happened silently | Applied: SINCE_LINE. |
| C2-m7 | Missing §8 rows | Applied: RUN_STARTER_LINE, EDIT_NUMBERS_NOTE, NOT_RECORDED_HERE, LEGACY_GEMINI_HIDDEN, the milestone pays-nothing reason. |

### 14.4 Decisions for the user

- **U1. How long the shader may visibly move.** Revision 2 caps the horizon air at 5 s of visible time per browser session (WCAG 2.2.2 needs no pause control then). After that the band is still SVG, and the visible motion left on these screens is the one-shots and the weave while drafting. Options:
  - (a) keep the 5 s settle (recommended);
  - (b) let the air run up to 90 s, which needs a 40 px pause button beside every horizon band.
- **U2. What a dashed line means** (D29, a house rule, so sign-off). Options:
  - (a) keep the house meaning (dashed = calibrating or not yet counted) and let "not checked" be the balloon shapes (recommended: no other component changes);
  - (b) amend redesign.md so dashed means "not checked" everywhere, which forces new treatments for the calibrating PromiseRing, the DaySeal, "Not counted yet" and locked EmblemCoins.

---

## 15. Topic map and goals (roadmap revision 5)

Status: design only (2026-10-06, roadmap revision 5, lane 0). Nothing here is built. It is the UI half of docs/life-plan/roadmap-topic-map.md ("UI at 344 px"), and it holds the marks of roadmap-contracts.md §22.11 and the goals UI of §23.7.
- **Who builds it.** Lane 4 builds the goals UI (§15.7). Lane 9 builds the topic map UI (§15.4–§15.6) and the new glyphs. Both work on fixtures only, never on the user's own goal.
- **What stays off.** Every switch is false: TOPIC_PLANS_LIVE, the five TOPIC_*_LIVE phase switches, and `GOALS_MAX` 1. So nothing in this section renders for a user until the lane named turns its switch on, on the user's go.
- **What still holds.** Everything in §1–§14 holds unchanged: the grammar (§4.1), the licences (§5.2), H1–H17, D1–D31 and the counting method (§3.1). This section only adds.
- **Names.** Topic, layer, builds on, specialisation, seat and share mean what the spec's Names table says. "The map card" is the topic map on a TOPICS draft or plan. The class names (LINKED, PICKED, KEPT …) are `TopicClass` (contracts §22.2, §22.11).

### 15.0 Decisions (R5)

"Sign-off" means the lead decides, because a shipped meaning or a spec line is read in a stated way.

| ID | Decision | Why | Sign-off |
|---|---|---|---|
| D32 | The glyph for «Gemini picked your Domain · not checked» is **`pv.libpick`**, not the spec's `pv.pick`. | `pv.pick` is shipped: "Gemini's choice among the app's options" (HonestyKind `gemini-pick`). Contracts §22.1 ruling 1. | – (ruled) |
| D33 | **`pv.named` is a glyph-only who-mark**, like the ProvMark glyphs. It sits after a Gemini-named Domain's name wherever that name renders, until the user renames it. Its words, "named by Gemini", are sr-only, and in the card Key where the card has one. The visible word "Gemini" for that name shows on the topic map and in the Domain's own sheet («Gemini · kept by you»). | A 12 px mark inside titles, quest rows and Today rows has no room for a chip. D13 already makes static row marks glyph plus sr plus Key. D25 covers chips, picks and lanes, and those keep their who-word. | decided (contracts ruling 68; the user may reverse it) |
| D34 | **Line styles.** `pv.libpick` has a dashed balloon rim, because it is not checked (D29). `pv.web` has a solid rim, as the spec draws it, and so does `pv.named`: they claim no check, and their words say what they are. Layer and goal glyphs are never dashed. A locked layer is ink-mute with `m.builds`: never `m.lock`, never dashed, never struck (decision 76). | Dashed means calibrating or not yet counted; the balloon means not checked. A locked layer is neither. | – |
| D35 | **Text never dims below ink-2.** Where the spec says "goes ink-mute" (trace, locked milestones), glyphs, rails, rings and checks go ink-mute. Names and words stay at ink-2 or darker. | ink-mute is a non-text token (≥ 3:1 in contrast-check). Text needs ≥ 4.5:1. | – |
| D36 | **[Keep these] is a glyph-only button.** It is the 40 px GlyphButton with `pv.kept`, aria-label "Keep layer {k}". Its words ("Keep these: keeps this layer's names, placements and drawn links. Keeping never marks them checked.") are in the card Key. A tap plays `pv-confirm` in its swap form (§15.9). | It is the spec's "[Keep these] folded into the header glyph" (critique C2.18), and the layer's budget is 6 words. Decision 76: never "Looks right". H3: nothing draws a balloon. | – |
| D37 | **One who-word chip per layer header; row marks are static.** A layer that holds Gemini names shows one HonestyChip in its header (§15.5 picks which). Each topic row carries only its 16 px class mark, read once through sr. The row's own chip, with its full words, sits in its TopicSheet. | The name box is 138 px at 344. A chip per row would need a 4th line, past the spec's 60 px cap. D13 is the house rule for repeated row marks. | decided (contracts ruling 68; the user may reverse it) |
| D38 | **Delivery.** The `layer` family is inline (it animates `layer-open`). `pv.web` and `pv.libpick` are inline Gemini provenance glyphs. `pv.library` and `pv.named` are static ProvMark glyphs (the `provmark` defs family). `goal.*` is static, in a new defs family, `goal`. | D3: what animates is inline; what repeats down a page (seat glyphs on Today, the mark beside every kept name) is a `<symbol>` sent once. | – |
| D39 | **One goal stays byte-identical.** Seat glyphs, per-goal "n more" rows and the goal labels render only while 2 or more goals are open. The switcher never renders at `GOALS_MAX` 1. At 3 it renders with 2 or more open goals, or with one open goal and a free seat ("1 pill and +", so a second goal can be added from the roadmap page; contracts ruling 63). | Spec: "1 goal is byte-identical" (Today rows, the aim line, the Aim card). | – |
| D40 | **The estimate never moves as a value.** The 6 pips never fill, draw or count up. A re-rate changes the chip only by `estimate-swap`, a CHANGED crossfade. | H3: Gemini-sourced and estimated figures change by crossfade only. | – |
| D41 | **One horizon air per page with several Aim cards.** On /you with 2 or 3 Aim cards, only the lowest-seat ACTIVE card's band may run the AMBIENT air. The others are SVG. | D17: at most one live context per document. D16: one 5 s budget per session. | – |

### 15.1 New glyphs (drawn to §4.1; pinned by glyph-check once drawn)

Path data is given where this section fixes it. Everything else is drawn to the grammar. Each glyph's words go into `GLYPH_MEANS` (paths/means.ts) exactly as the "Means" column reads.

| Glyph | Means (GLYPH_MEANS) | Shape | States | Delivery |
|---|---|---|---|---|
| `layer.1` … `layer.6` | "Layer k of the topic map" | A funnel of 6 stacked bars narrowing downward, bar k filled (below) | idle, active and done as the cairn (below) | inline; `paths/layer.ts`, family `layer` |
| `pv.web` | "Gemini's name · Google linked sources to it" | A solid-rim balloon (the `BALLOON` path) with a meridian globe inside | idle ink-2; active ink-0 + here-ring when standing alone; done ink-0 at 1.75 | inline; provenance.ts (a Gemini glyph) |
| `pv.library` | "Your Domain" | Two book spines on a shelf line | static (ProvMark) | static, `provmark` |
| `pv.libpick` | "Gemini picked one of your Domains · not checked" | The two spines inside a dashed balloon rim (`BALLOON`, `BALLOON_DASH`) | as pv.suggest | inline; provenance.ts (a Gemini glyph) |
| `pv.named` | "named by Gemini" | The `BALLOON` rim alone, solid, drawn at 12 px (stroke 2) | static (ProvMark) | static, `provmark` |
| `goal.1` … `goal.3` | "Goal k" (seat k) | Three small rounded seats in a row, seat k filled | idle, active, done (below) | static; `paths/goal.ts`, family `goal` |
| `goal.paused` | "A paused goal" | The three seats hollow, with a short rest line under them | idle, active, done (below) | static; `paths/goal.ts` |

**Layer** (`paths/layer.ts`):
- **The bars.** Centres at y = 3.5, 6.9, 10.3, 13.7, 17.1 and 20.5. Half-widths are 9, 7.6, 6.2, 4.8, 3.4 and 2, centred on x 12, so layer 1 at the top is the widest.
  - The five bars other than k are single strokes with round caps: one `rim` path of five subpaths (`M3 3.5h18M4.4 6.9h15.2…`, bar k left out).
  - Bar k is a capsule 2.6 units high over its bar's width. Its outline is the `mark` path and its fill the `solid` path, in every state, so "which layer" never depends on state.
- **States**, as the cairn:
  - **idle** (a future layer, "after k", or held): ink-2 at 1.5; ink-mute when locked (non-text, ≥ 3:1).
  - **active** (the open layer: the layer header's glyph and the RouteRail's current node): ink-0, the bars at .8 inside the static here-ring (`HERE_RING`, stroke 1.25). This is the cairn's active cue, used here too, beside words as well as alone.
  - **done** (the layer's milestone reached, counted): ink-0 at 1.75, plus the 12 px check badge top-right.
- **Parts:** at most 4 (rim, mark, solid, ring or badge).
- **Distinct** from `intensity.*` (vertical bars), `ev.counted` (a vertical tally) and `m.queue`. glyph-check asserts that layer.1…layer.6 are pairwise distinct and that bar k's `solid` is present in every state.
- **Sizes:** 16 in layer headers and the Aim card strip; 24–28 on RouteRail nodes.

**Provenance additions** (provenance.ts; `GEMINI_PV_NAMES` gains `pv.web` and `pv.libpick`, and `PROVMARK_NAMES` gains `pv.library` and `pv.named`):
- **`pv.web`.** The rim is `BALLOON`, solid. The `mark` is one path of three subpaths: a circle r 3.4 at (12, 11), a meridian ellipse (rx 1.5, ry 3.4) and an equator `M8.6 11h6.8`.
  - It renders only where its words are reachable on the same card: the layer chip «Gemini · Google linked n sources» in the header, and the same chip in the row's TopicSheet.
  - It is never alone, and never on a Domain after accept: a kept name's mark is `pv.kept` on the map and `pv.named` everywhere else.
- **`pv.library`.**
  - The `rim` is two upright spines: `M6 5.5h3.6v13H6zM11 7.5h3.6v11H11z`, of two heights so they read as books, not as a pause.
  - The `mark` is the shelf `M4 20h16`.
  - It is distinct from `s-know` and `quest.bring` (both are open books).
- **`pv.libpick`.**
  - The `rim` is `BALLOON` with `BALLOON_DASH`.
  - The `mark` is two small spines inside it: `M9 8.5h2.2v5.5H9zM12.6 8.5h2.2v5.5h-2.2z`.
  - It is distinct from `pv.pick` (three option dots with a small balloon) and from `pv.suggest` (an empty balloon).
- **`pv.named`.**
  - The `rim` is `BALLOON`, solid, with no inner mark.
  - It is drawn only at 12 px, at stroke 2, after the name, inside the name's own `data-wc="name"` span, and aria-hidden. One sr-only "named by Gemini" follows it, read once per occurrence.
  - It is distinct from `pv.integrity` (the same rim with a check) and from `pv.suggest` (dashed).
  - Every route that can render a kept Gemini name emits the `provmark` defs: the roadmap pages, /you, /today and the library.

**Goal** (`paths/goal.ts`; the static `goal` defs family, ids `gd-{route}-goal.k-{state}`):
- **The seats.** Three rounded squares, 5 × 5 with rx 1.2, centred at x 5.5, 12 and 18.5 on y 11.5.
  - **goal.k:** the two other seats and seat k's outline are the `rim` (three subpaths). Seat k's fill is the `solid`.
  - **goal.paused:** all three seats are hollow (`rim`), with a rest line `M8 17.5h8` (`mark`). It is distinct from `m.pause` (two vertical bars, the WAIT pause button only) and from the kit HeldGlyph rest.
- **States:**
  - **idle** (another goal): ink-2.
  - **active** (the goal on screen): ink-0, plus a short under-bar beneath seat k (`M{cx−2} 17h4`, `mark`), the family's "current" cue. For `goal.paused`: the glyph at .8 inside the here-ring.
  - **done** (a DONE goal, in "Other goals"): ink-0 plus the check badge. `goal.paused` in done is drawn only in the gallery: a paused goal is never done.
- **Sizes:** 12 beside Today rows, the Today goal chip and pill labels; 16 in Aim card headers; 28 on the GoalsFullCard.
- **Default label.** `defaultGoalLabelOf` is the Area name; the seat glyph sits beside it, as a glyph, never as text.

### 15.2 Reused glyphs (no new meaning)

- `m.builds`: "builds on" (a topic's parents, and locked layer milestones).
- `t.hourglass`: depth milestones, «set by reviews».
- `m.quote`: your aim's own words (AIM spans and the last-layer clause seeds).
- `pv.syllabus`, `pv.you`, `pv.suggest`, `pv.kept`.
- RankSeal (the switcher's pills); the cairn (a topic's level); `i-plus` (the "+" seat and [Write a topic]); `i-flag` ("needs a parent").
- `pv.checked` keeps its rev-4 meaning: it is never drawn on Gemini output (contracts §22.11).

### 15.3 New HonestyChip kinds (contracts §22.11; lane 9)

Every kind keeps a visible word. A kind whose name starts "gemini", "estimate-gemini" or "estimate-unsure" contains "Gemini" (HonestyChip's development throw). All six go into `GEMINI_KINDS`.
- Lane 9 writes the full strings in roadmap-copy. Where the spec gives the words, they are quoted. Otherwise the column says what the string must carry.
- "Button" follows D37: the chip is a button in a layer header, a card heading or a sheet. As a row mark it is static.

| Kind | Glyph | Visible label | Full string | Button? |
|---|---|---|---|---|
| `gemini-linked` | pv.web | Gemini · Google linked {n} sources ({n} from the row's `sources`; a layer chip shows the layer's smallest n) | "Google linked pages to Gemini's description of this term. It doesn't show the pages use the term, or that it fits you." Then the sources, "<title> (from Google)" (§15.5) | yes (header, sheet) |
| `gemini-placed` | pv.suggest | Gemini placed it · not checked | carries: Gemini chose the layer of your line or Domain; keeping the layer makes the placement yours | yes (header, sheet) |
| `gemini-picked-domain` | pv.libpick | Gemini picked your Domain · not checked | carries: Gemini's name matched one of your Domains exactly; it stays out of the plan until you tick it | yes (header, sheet) |
| `gemini-kept-by-you` | pv.kept | Gemini · kept by you | carries: Gemini named it, you kept it, and keeping never marks it checked; Google's sources stay in its sheet | yes (header, sheet) |
| `estimate-gemini` | pv.suggest | {K} layers · Gemini's estimate (question 18's order; contracts ruling 63) | the EstimateChip panel (§15.4) | yes |
| `estimate-unsure` | pv.suggest | Gemini unsure · {low}–{high} layers | the EstimateChip panel, with the one-tap pick | yes |
| `estimate-app` | pv.app | App's rough estimate · no Gemini | the EstimateChip panel: code's rule (3 for a Field, +1 at 20 outline lines), advice only | yes |
| `caution-financial` | m.info | Not financial advice | carries: the plan names study topics, not choices about your money; ask a qualified adviser | yes |
| `caution-medical` | safe.health | Not medical advice | carries: as above, for health; ask a professional | yes |
| `caution-legal` | m.info | Not legal advice | carries: as above, for law; ask a qualified adviser | yes |

- **The existing kinds** are reused unchanged: `gemini` («Gemini · not checked», for NOT_CHECKED names and the hidden fold) and `gemini-kept` («Gemini · kept · not checked», for KEPT_NOT_CHECKED).
- **The caution chips are static at every level** (D11: safety surfaces): `tip-open` is instant, and the card or sheet carries `data-fx="none"`.
- **A card never shows two medical chips.** A body or care card keeps `health` («Not medical advice · ask a professional»), and `caution-medical` is not added beside it (D12, one per card).
- **Banned on Gemini output** (roadmap-ui-check): "verified", "found on the web", "found", "exists", "prerequisite", "required" and "You checked this". The copy says "builds on" and "opens after".

### 15.4 The estimate chip (EstimateChip.tsx; lane 9)

It renders `RatingView` (contracts §22.3), wherever the layer count shows: the map card's heading, the chain's heading and the draft's Depth and date card.
- **The chip.** A HonestyChip button: `estimate-gemini`, `estimate-unsure` (when `unsure`) or `estimate-app` (origin CODE).
  - When the plan's layers are yours (`changes` holds a SET or FEWER), a "[pv.you] {K} layers · yours" figure comes first, and the Gemini chip stays beside it with Gemini's own number. The who-word never goes away.
  - When `mapFilled` < `geminiLayers`, the static honesty words "· its map filled {n}" follow the chip (`data-wc="honest"`).
- **The pips.** 6 pips follow the chip: K solid, the rest hollow; for `unsure`, a bracket under pips low…high.
  - The pips are aria-hidden, with the spoken twin "4 layers of 6" (or "3 to 5 layers of 6").
  - They are HTML, 12 px, never an SVG with text.
- **Its panel (the (i)),** in this order:
  1. "Gemini's difficulty estimate: how many build-on layers lie between a newcomer and this aim" (decision 76: "difficulty" appears only here);
  2. the reason labels (`RATING_REASON_LABEL`), and "3 replies: 4, 4, 5" (`replies`; "no reply" for a null);
  3. the breadth word and its room ("Wide · 3–5 topics a layer"; `BREADTH_WORD`, `room`);
  4. "its map filled 4";
  5. each change with its day ("4 by you · 6 Oct", "1 merged by you", "+1 layer by you");
  6. for `oneReply`, "1 reply said 5 layers" as a one-tap choice; for `unsure`, the low…high choices, the preselected one pressed;
  7. [Change…] (setLayers; bounds 1–6).

  The words "Difficulty", "hard" and "level" never appear on the chip.
- **The no-Gemini path.** It shows `estimate-app` with "≈ {appEstimate} layers" (a GlyphStat with `estimate`), then "· your map fills {n}". The estimate is advice only.
- **Motion.** `estimate-swap` (CHANGED) when the stored layers or origin differ from what this viewer last saw. Nothing else moves (D40).
- **At 344 and above:** chip, pips and the static words on one row when they fit the 278 px box, otherwise two rows (row gap ≥ 16 px, D31).

### 15.5 The map card (TopicMap.tsx, LayerBand.tsx, TopicMapRow.tsx, TopicSheet.tsx, SourcesSheet.tsx, ParentsSheet.tsx; lane 9)

It renders `TopicMapView` on a TOPICS draft (`DraftView.topicMap`) and plan (`RoadmapView.topicMap`).
- **Quarantine.** A DRAFT's milestone titles read "Layer {k} of {n}" (the CodeText template, contracts §22.1 ruling 22). Gemini names appear only inside the map card's rows and sheets until accept (contracts §22.11, TOPIC_NAME_LINKED).

**344, top to bottom:**
1. **The heading.** The EstimateChip (§15.4), the caution chips (one per `cautions` entry) and the card Key (i). The heading has no app words of its own.
2. **The layers,** stacked from broad (layer 1) to deep (layer K). Each is a LayerBand:
   - **The header's first row is 44 px:**
     - `layer.k` (16; active on the open layer, done when reached, ink-mute when locked);
     - "Layer {k}";
     - the state word: "open", "after {k−1}", "held" or "done" (`TopicLayerView.state`);
     - the figure (the layer's chosen count);
     - flush right, the 40 px keep button (D36). Once the layer is kept, the button becomes a static `pv.kept` mark in ink-0, with sr "Layer {k} kept".
   - **The header's second row,** only when `geminiNames`, holds the one who-word chip (D37). It is a 24 px visual in a 40 px box, so a header with names is 84 px. The chip is the first that applies, in this order:
     1. `gemini-linked` (while a LINKED row is unkept);
     2. `gemini-picked-domain`;
     3. `gemini-placed`;
     4. `gemini-kept-by-you`;
     5. `gemini-kept`.

     The card Key lists every class mark the card uses, with its words.
   - **"needs a parent".** When `needsParent` > 0, the header's second row also shows "[i-flag] {n} need a parent". It is visible, because it blocks the keep.
   - **The rows** (TopicMapRow; at least 44 px, growing to 3 lines and at most 60 px):
     - the class mark (16 px: pv.syllabus, pv.you, pv.library, m.quote, pv.libpick, pv.web, pv.kept or pv.suggest, per contracts §22.11's class table);
     - the name, `data-wc="name"` (or `"own"` for SYLLABUS, YOURS and AIM);
     - a 16 px cairn of the stage its Domain holds now, measured and in done state. It is empty before a Domain exists or below level 4. A topic held when you began shows its cairn done, with sr "Held when you began". A topic you skipped shows `pv.you` in the cairn slot, with sr "You said you know this". Neither is struck.
     - from layer 2 on, and on layer-1 rows that start unchosen (seeds, PICKED names, revealed NOT_CHECKED names; contracts ruling 62), the 44 px "in plan" checkbox (`chosen`; disabled when `canChoose` is false). Its accessible name is "In the plan: {name}". Ticking a topic ticks its parents (the closure that `chooseTopicCore` returns);
     - the 40 px ▸ button, aria-label "More about {name}", which opens TopicSheet.

     A topic row holds no app word: its name is exempt and its marks are glyphs.
   - **The folds,** after the rows:
     - unchosen topics fold into one "+{n}" row (a glyph and a figure, never struck), sr "{n} more topics, not in the plan";
     - hidden Gemini names fold into one row: [pv.suggest] "{n}" with the `gemini` chip «Gemini · not checked», sr "{n} not checked". A tap reveals them as NOT_CHECKED rows.
   - **An empty layer** (`emptyOffers` set) shows the state word "empty" and a ▸ that opens the empty-layer sheet: [Merge with the layer above], [Write one], [Show the not-checked ones], in that order. A merge then reads "1 merged by you" in the EstimateChip's static words, and the dropped links show as a count.
   - **[Write a topic].** In any layer on a draft, a 40 px [i-plus] GlyphButton at the header's right, aria-label "Write a topic in layer {k}", opens the add-topic sheet.
3. **The foot.** [Accept all] (2 app words). Its confirm sheet lists, layer by layer and by name, every Gemini name and every not-checked link it would keep (`AcceptTopicChoices.keepAll`).
   - `acceptRefusal` and Accept plan stay in the draft footer (§7.3), not on this card.
   - The Domain confirm ("Creates 9 Domains in Business & Finance", listing the Gemini names by name) is the accept sheet's.

**Row arithmetic at 344.** The content box is 278 px, with 8 px gaps between the mark, the name, the cairn and the action group. The checkbox and the ▸ sit flush: their boxes touch and never overlap (D31).
- From layer 2: the name gets 278 − 16 − 16 − 44 − 40 − 24 = **138 px**, about 19 characters a line at 13 px, so a 40-character name takes 3 lines.
- Layer 1's rows that start chosen have no checkbox: the name gets **182 px**. Its rows that start unchosen (seeds, PICKED, revealed NOT_CHECKED) carry it, at **138 px**, so you can tick them (contracts ruling 62).
- The parent count is not on the row. It is in the sheet and the trace.

**The last-layer and layer-1 seeds** (the no-Gemini path, [Write the topics]):
- Layer 1 lists `layerOneSeeds` as unticked `pv.library` rows, each with its checkbox (and `pv.named` after a Gemini-named one). Under the last band shown, the map lists `lastLayerSeeds`, the aim's clauses verbatim with `m.quote` and `data-wc="own"`, never spell-corrected; a ticked one joins that band. The map's K is the bands you fill: trailing empty bands trim at accept (contracts ruling 58).
- A clause row may carry a 40 px [goal glyph + i-plus] button, aria-label "Track '{clause}' as its own goal". The tap opens a confirm sheet with that question. Once tracked, the row's mark is `goal.k` with sr "tracked in goal {k}".
- The page-level offers ([Write the topics], [Add your outline], [Track the routine as its own goal], [Keep the level plan]) sit in the draft header's action row, under row 2's budget (§3.2), never on this card.

**Tracing (`trace`, ACT).** Each row's mark and name form one `<button aria-pressed>`. Its accessible name is the topic name, and its aria-describedby points at the sr line "builds on: A, B" or "after layer {k}".
- Tapping it traces the row:
  - its parents and children (from `parents` and `children`; "after layer {k}" means the whole layer above) get ink-0 marks and a 2 px ink-0 rail on their inline-start edge;
  - every other row's marks, rails and checkboxes go ink-mute, and their names stay at ink-2 (D35).
- A second tap, Escape, or tracing another row ends it. One trace at a time. Nothing is hidden, and nothing moves layout.

**TopicSheet (the ▸; a kit Sheet).** It is the row's tap panel (D13). It holds:
- the name and its class chip as a button with its full words (§15.3);
- "builds on: A, B" (each with its mark) or "after layer {k}", and "3 of 3 replies" for a drawn link. This is never shown as a check;
- the votes for a Gemini name ("2 of 3 replies");
- the sources "(from Google)", which open SourcesSheet;
- the caution chips (every Gemini topic's sheet);
- the notes in words: "near-duplicate of X", "unsure where it goes", "needs a parent", "feeds nothing kept", "differs from your order", "matches your order", "not used", "Held when you began", "you said you know this", "tracked in goal 2", "builds on · goal 1";
- the actions: Rename, Use my Domain…, Merge into…, Move to layer…, Builds on… (ParentsSheet), Remove, I know this, Keep (a NOT_CHECKED name: «Gemini · kept · not checked»), and Go deeper.
- **Go deeper** shows its cost first ("uses 5 of today's 48 requests") and the date effect when it would add a layer. Then [Ask]. While the run is out, the sheet's waiting row plays the weave WAIT (§5.2; ≤ 90 s, pausable). "Gemini named nothing narrower." is `NOTHING_DEEPER`, verbatim (contracts ruling 63: "found" stays banned on Gemini output).

**SourcesSheet.** At most `GROUND_SOURCES_SHOWN` (5) rows.
- Each row is "<title> (from Google)", a link to the chunk uri with rel "noopener noreferrer nofollow" and target "_blank". The sheet claims no host.
- It holds the `gemini-linked` full string.
- If Google's display terms require Search Suggestions (spec question 16), they go here, in a sandboxed iframe. Lane 13 decides.

**ParentsSheet.** The first option is "After layer {k}", the default. Then a checkbox per kept topic of the layer above (at most `EDGE_PARENTS_MAX`, 3), then other goals' Domains, read-only ("builds on · goal 1", with `goal.k`). Your picks are yours (`pv.you`).

**At 932 and 1440** (the card spans the main column; a container query at ≥ 640 px of card):
- The layers become columns, left to right, joined by %-positioned, aria-hidden SVG connectors with no viewBox and no SVG text.
  - Drawn or picked links are 1.5 px ink-2; a traced link is 2 px ink-0. An unkept Gemini link is 1 px ink-mute: its "not checked" is in the child's sheet, because a line is never a balloon and never dashed.
  - "After layer {k}" draws one bracket, never n lines.
- Rows keep their 44 px minimum. Names wrap at the column's width.

### 15.6 The chain (RouteRail, the Aim card strip; lane 9)

- **Nodes.** A TOPICS plan's RouteRail nodes take `layer.k` in place of the cairn (`MilestoneRowView.layer`, `chainRole` LAYER), with the F-R5-9 titles.
  - A DRAFT reads "Layer {k} of {n}".
  - After accept, `titleParts` (NamedPart[]) gives the short form ("Cash flow, Debt and interest +2 · layer 1 of 4"), truncated to the 278 px box. `pv.named` sits inside the title after each Gemini-named Domain.
- **Depth milestones** (`chainRole` DEPTH) take `t.hourglass` and «set by reviews» (kind `schedule`), with the title "{stage}: {domains} to level {L}+". Their line is gated at ≤ 6 app words (§15.10).
- **Locked nodes** (PLANNED with `opensAfter` set; contracts §22.1 ruling 5) have:
  - a thin ink-mute ring with `layer.k` idle in ink-mute;
  - an `m.builds` badge;
  - the title, and "after {k}" in ink-2.

  They have no `m.lock`, no dash and no strike (D34). Their sr reads "builds on layer {k}; opens when milestone {k} is reached".
- **Held milestones** (every topic held or skipped; `known` when skipped by you) have:
  - a thin ink-2 ring with `layer.k` idle, and the word "held";
  - no rank and no motion;
  - `pv.you` as a badge when `known`, with sr "you said you know these".

  The kit HeldGlyphs are not used here: they mean held days.
- **Measures.** MeasureRows of earlier layers read "climbing to 8" (`climbing`) as CONTEXT, with their `labelParts`.
- **The heading.** The EstimateChip, then, when T > 0, "· +{T} to reach {stage}". For example, «4 layers · Gemini's estimate» · +1 to reach Fluent.
- **The Aim card strip** shows K_final + T nodes (at most `MAX_MILESTONES_TOPICS`, 8, so at least 34 px a node at 278).
- **Motion.** `reach` (SEEN, unchanged) on the reached node, then `layer-open` queued after it on the opened node (§15.9). `start` is unchanged. Nothing pulses (H4).
- **[Break into topics]** joins a LEVELS plan's footer actions (row 6's budget holds), only while TOPIC_PLANS_LIVE.
- **Copy** (lane 9; roadmap-copy.ts, the line at ~1741):
  - OUTLINE_EMPTY_GEMINI_TAIL ("Gemini doesn't write topics: it would be guessing.") shows on LEVELS plans only.
  - On a TOPICS plan it is dropped while Gemini names are off, and reads "Gemini's names stay marked as Gemini's." while they are on. ui-check pins both.

### 15.7 Goals (GoalSwitcher.tsx, GoalsFullCard.tsx, PauseSheet.tsx; lane 4)

Nothing here renders while `GOALS_MAX` is 1 (D39). Lane 4's last commit sets it to 3, on the user's go.

**The switcher** (`GoalSwitcherView`), on /you/roadmap, **above the aim header card at the 312 px page width** (344 − 2 × 16 gutter):
- **Pills.** Each is 100 px wide, with 6 px gaps (3 pills = 312 px), and 44 px tall. Each is a link to `goalHrefOf("/you/roadmap", id)`, with aria-current="page" on the current one. A pill holds:
  - RankSeal 20 (the goal's own rank; idle on a draft);
  - `goal.k` (12) and the label, 12 px, up to 2 lines and then clamped (the full label is in the link's accessible name), `data-wc="name"`, or `"own"` when `labelIsYours`;
  - a thin 2 px Proficiency arc along the pill's bottom edge, measured only. It is absent on a draft or an unmeasured goal, never dashed, and plays `meter-fill` (SEEN) under that goal's own basis key.
- **The "+" seat.** While `canAdd` (open goals < `GOALS_MAX`), a 44 × 44 [i-plus] link to /you/roadmap/new, aria-label "Add a goal". 2 pills and "+" take 256 px; 1 pill and "+" take 150 px (D39: at `GOALS_MAX` 3 the switcher shows with one open goal while a seat is free).
- **Labels are distinct** (`labelClashOf`). The intake asks for one when the default would clash (`LABEL_CLASH`).
- **"Other goals".** Paused and done goals fold into a `<details>` row under the pills: "Other goals" (2 app words) and the count, led by `goal.paused` when one is paused. Inside, each goal is a link row: `goal.paused` with "paused since {day}", or its RankSeal with "done".
- **At 932 and 1440:** pills of 160 px with one-line labels. The same order and the same rules.

**GoalsFullCard** (/you/roadmap/new at 3 open, from `IntakeView.seats` and `goalsMax`):
- three seat glyphs lit (`goal.1`–`goal.3`, 28 px, active), each with its goal's label as a link (`data-wc="name"`);
- "3 goals open." and [Pause or archive one], which goes to the lowest seat's roadmap page, where Pause and Archive live;
- `GOALS_FULL` verbatim in its (i). At most 8 app words (§15.10). Static.
- The capture chip reads `AIM_CHIP_FULL` ("Aim · 3 goals open") and links here. The capture "aim:" handoff and the /you ASK card wait here and keep the aim in sessionStorage (contracts §23.5).

**/you.** One compact AimCard per open goal, in seat order (`loadAimCards`), each at most 14 app words.
- Each card's header carries `goal.k` (16, aria-hidden; sr "Goal {k}") and the goal's label.
- The ASK card follows only while fewer than `GOALS_MAX` goals are open (contracts ruling 53; with `GOALS_MAX` 1 that is today's rule).
- There is no blended %, and no headline across goals.
- Only the lowest-seat ACTIVE card's horizon may run the air (D41).

**Today:**
- **Week-quest rows** are round robin by seat (`todayRowsOf`), within WEEK_QUEST_ROWS_TODAY (3).
  - Each row leads with its 12 px seat glyph, before the KindGlyph.
  - Each goal with rows left out gets one "[goal.k] {n} more" link to its roadmap page.
  - With 2 or more goals, the heading drops the milestone ("Week quests · until Sun «pays nothing»"), and the Key names each goal's milestone.
  - The basis line names the share ("Capacity 2 h 10 · goal 2's 3 of 7 h").
- **The aim line** stays one line (`aimLinePickOf`), with the seat glyph when 2 or more goals are open.
- **The ROADMAP goal chip** reads "[goal.2] 2 of 5".
- **The rest** of Today stays calm (D10): no new motion.

**The pause sheet** (PauseSheet; a kit Sheet laid out as the Aftercare section of RoadmapView):
- title "Pause {label}";
- when a milestone is live, the line "Milestone 2 stops; it leaves Today", verbatim;
- the live milestone's practice rows as Aftercare draws them ([Icon today], title, "on Today · from milestone 2"), with one choice for all of them, [Keep on Today] / [Archive] (`PauseChoices.aftercare`);
- an optional reason (at most `GOAL_PAUSE_REASON_MAX`, 120 characters, yours);
- the other goals' verdict changes (`GoalVerdictChange`: "Goal 1 becomes tight · [Re-date goal 1]");
- "Nothing is archived silently: each waits for your choice." (the Aftercare line), verbatim;
- the primary [Pause].

It is static: `tip-open` only, with `data-fx="none"`. The same file exports **ResumeSheet**:
- "Move the date by 23 days?" with [Move it] / [Keep the date] (`ResumeChoices.redate`);
- `GOALS_FULL` or the hours line (`hoursOverLineOf`) when resume is refused;
- the verdict-change list.

**A paused goal's page.** The header reads "paused since 6 Oct", never "behind". The Proficiency is frozen, with no meter motion, and the first reading after resume rebases with "since you resumed" (no animation, D8). Its actions are [Resume] and [Archive] (contracts ruling 56), its label, and its activity card, where its own AVOIDs can still be lifted; every other plan action is hidden while `paused` is set. Its "Other goals" row offers the same two.

**The activity card** (§7.8):
- Another goal's AVOIDs show ticked and locked with "from goal {n}". A closed goal's suggestions show "from an earlier goal".
- Quotes read "From goal 1: '…'".
- It stays a static safety surface (D11).

### 15.8 Intake (§7.1)

With TOPIC_PLANS_LIVE false, the intake renders nothing new. Lane 1's prefill fix ("Left out · n", and "Name the areas this needs" with any library) is held to the existing row-1 budgets.
- **When it is on,** the Area row is followed by the three paths ([Break it down], only while `topicSwitchesOf().rate`; [Write the topics]; [Build from my numbers]). They are a segmented control of 2–4 words each.
- **Depth 6** (contracts §22.1 ruling 14) appears on the StageLadder only on the two topic paths.
- **A TOPICS intake fixture** is gated at row 1's Gemini-path budget (≤ 105, fold ≤ 25).

### 15.9 Motion (§4.7 and §5.3 additions)

| Motion | Licence | Full | Calm | Still | Max | In view at hydration |
|---|---|---|---|---|---|---|
| `trace` | ACT: tapping a topic row | The related rows' rails go opacity 0→1 (160, `swap`). The other rows' marks switch to ink-mute in the same frame, with no colour animation. Names never change colour (D35). | The same (opacity ≤ 160) | Instant, no transition | 0.16 s | (ACT) |
| `layer-open` | SEEN: the counted reached count rose, and that reach opened layer k+1. Never on a skip, a hold, a closed-unreached milestone, or an opening through held or skipped parents | On the opened layer's RouteRail node and map header: the `m.builds` badge goes opacity 1→0 (160); the layer glyph goes opacity .4→1 (240); the state word crossfades "after k" → "open" (160 + 160). No draw, no ping, no burst. Queued after `reach` by sequence() | Opacity ≤ 260 | End state | 0.4 s | the layer glyph stamps (scale 1.15→1, 240); nothing is hidden |
| `pv-confirm`, swap form | ACT: [Keep these], or Keep on a NOT_CHECKED row | The old mark fades out (160) and the new mark and chip word fade in (160). No rim or mark draws, because the new mark (`pv.kept`) is a balloon (H3). The keep button's own glyph then shows its kept look | Opacity swap | Instant | 0.32 s | (ACT) |
| `estimate-swap` | CHANGED: the stored layers or the origin differ from what this viewer last saw (seen `what` "estimate"; basis: the plan version, or "draft:{version}") | The chip label and the pips crossfade (out 160, in 160). The static change words sit beside them. No fill, draw or count | Opacity ≤ 260 | Instant | 0.32 s | the same crossfade |

- **No loops.** The weave WAIT plays only inside a waiting card or sheet: DraftRunning for a breakdown (≤ 90 s of motion, though the chain's steps may take about 4 minutes, one step per invocation, contracts ruling 47; the static frame follows), and the Go deeper sheet's waiting row.
- **Calm** is opacity only. **Still** is the end state.
- `GlyphMotion` gains `trace`, `layer-open` and `estimate-swap`, with these licences in `MOTION_LICENCE`. `pv-confirm` gains its swap form: the helper reads the target's `data-g` and never draws a balloon.

**H18–H20** (§5.3 additions; each is a check in §15.12):
- **H18.** A trace never hides a row or a name, and never changes text colour below ink-2. Nothing moves layout.
- **H19.** The estimate's pips never fill, draw or count up. Only `estimate-swap` changes them.
- **H20.** `layer-open` plays only on a counted reach. A held or skipped layer, a PREREQS_MET opening and a closed-unreached milestone play nothing.

### 15.10 Word budgets (hard gates; §3.2 additions)

Counted by §3.1, in roadmap-ui-check and in ui-audit's DOM count at 344. The ids are WORD_BUDGET_ROWS ids (src/app/dev/style/roadmap/fixtures.ts, and the Today and /you fixtures).
- Honesty labels are exempt: every chip of §15.3, the who-words, «set by reviews», "· its map filled n".
- Topic names, Domain names, goal labels and titles are exempt as names, and the user's own lines and clauses as own words.

| # | Screen and state (fixture) | Budget |
|---|---|---|
| 13 | Topic map card, per layer: the header and its fold rows, numerals as figures (`topic-map-draft`, Gemini names shown) | ≤ 6 app words per layer, plus ≤ 2 for the card ([Accept all]) |
| | … no Gemini, "Write the topics" with clause and Domain seeds (`topic-map-write`) | the same |
| | … accepted plan (`topic-map-plan`) | the same |
| 14 | GoalsFullCard (`goals-full`) | ≤ 8 |
| 9 | Aim card, each card with 2 and 3 goals open (`goals-2`, `goals-3` on /you) | ≤ 14 each |
| 11 | Today aim line with 2 and 3 goals open (`goals-2`, `goals-3`) | ≤ 8 |
| 10 | Today week quests with 2 and 3 goals open, round robin (`goals-2`, `goals-3`) | ≤ 30 per card, ≤ 8 per line |
| 15 | The depth milestone line, each depth node (`topic-chain`) | ≤ 6 each |

- **Row 13 adds a rule.** A topic row with any app word fails: its words are names, marks and chips.
- **For information, not gated:** the switcher's own words ("Other goals"), the sheets and the pause sheet. Lane 4 records their counts in its PR.

### 15.11 Honesty preserved (§8 additions)

Rows marked ✓ are asserted in visible text by §15.12.

| Honesty element | Where | Compact form (always visible) | Full text (one tap; always in the DOM) |
|---|---|---|---|
| Gemini · Google linked n sources ✓ | LINKED rows; the layer chip | «[pv.web] Gemini · Google linked 2 sources» (header); [pv.web] on the row | chip → the gemini-linked line + the sources; the row's sheet |
| Gemini picked your Domain · not checked ✓ | PICKED rows (outside the plan) | [pv.libpick] on the row, unticked; the layer chip when it is first | sr and the sheet; Key |
| Gemini placed it · not checked ✓ | outline lines and your Domains, placed by Gemini, layer unkept | [pv.syllabus] / [pv.library] on the row; «[pv.suggest] Gemini placed it · not checked» (header) | the sheet; Key |
| Gemini · kept by you ✓ | kept LINKED names and links | «[pv.kept] Gemini · kept by you» | chip; the sheet keeps the sources |
| Gemini · not checked, n hidden ✓ | the hidden fold | [pv.suggest] "n" + «Gemini · not checked» | the revealed rows, each with its sheet |
| Named by Gemini (the Gemini mark) ✓ | every view that renders a `geminiNamed` Domain name: titles, measures, quest rows, Today, the library's Domain list, practice rows | [pv.named] after the name, until you rename it | sr "named by Gemini"; Key; the Domain's sheet |
| Gemini's estimate / unsure / the app's rough estimate ✓ | the map card, the chain heading, Depth and date | the EstimateChip | its panel (§15.4) |
| Your layer changes ✓ | beside the estimate | "[pv.you] 4 layers · yours", "· 1 merged by you", "· its map filled 4" | the panel, with days |
| Not financial / medical / legal advice ✓ | the map card, every Gemini topic's sheet, the plan header | the caution chips | chip → the caution line |
| Held when you began | topic rows, milestone rows | the cairn done; "held" on a milestone | sr; the sheet; Key |
| You said you know this | topic rows, milestone rows | [pv.you] in the cairn slot / badge | sr; the sheet (for good) |
| Builds on / after layer k ✓ | locked nodes; the sheet | [m.builds] + "after 1" | the sheet: "builds on: A, B" or "after layer 1", "3 of 3 replies" |
| Set by reviews (depth milestones) ✓ | rail | «[t.hourglass] set by reviews» | chip → scheduleBoundLine |
| Sources from Google ✓ | SourcesSheet | "<title> (from Google)" | – |
| Paused since a day ✓ | header, Other goals | "paused since 6 Oct"; never "behind" | – |
| From goal n ✓ | activity card (quotes, locked AVOIDs) | "From goal 1: '…'", "from goal 1" | Key |
| Goals full ✓ | GoalsFullCard, capture chip | "3 goals open." / "Aim · 3 goals open" | (i): GOALS_FULL |
| Capacity share ✓ | week quests basis | "goal 2's 3 of 7 h" | the basis sheet |

### 15.12 Checks (lanes 4 and 9; §11 additions)

**glyph-check:**
- The new glyphs render in idle, active and done, and follow the grammar (§4.1): ≤ 6 paths, `pathLength` and `data-part`, currentColor, no text.
- layer.1…layer.6 are pairwise distinct, and bar k's `solid` is present in every state. goal.1…goal.3 are pairwise distinct, and `goal.paused` is distinct from `m.pause`.
- No new glyph duplicates a kit path.
- **The dash rule** reads: only pv.suggest's family (`pv.suggest`, `pv.kept`, `pv.pick`, `pv.libpick`), `v.unv` and the pending rail node are dashed. `pv.web`, `pv.named`, `layer.*` and `goal.*` carry no dasharray.
- `pv.named` renders only at 12 px and only as a `<use>` into the provmark defs.
- **Means:** `GLYPH_MEANS` holds every new name with the words of §15.1.
- **HonestyChip:** every new kind of §15.3 is listed. `GEMINI_KINDS` holds the six Gemini kinds. The caution kinds are buttons and never animate beyond an instant `tip-open`.
- **Motion:** `trace`, `layer-open` and `estimate-swap` carry their licences. Under still they make 0 animate calls. Under calm they are opacity only. `layer-open` in view at hydration uses no hiding keyframe (H15). `pv-confirm` toward a balloon draws nothing (H3).

**roadmap-ui-check** (344 first):
- **Budgets:** every row of §15.10, and the topic-row rule.
- **Who-words:** every Gemini chip contains "Gemini". A `pv.web` mark renders only in a layer whose header holds `gemini-linked`, or in a sheet beside it. Every `geminiNamed` Domain name renders `pv.named`, in every payload with `NamedPart` (titles, measures, quests, Today rows) and on every surface outside the roadmap (the library's Domain lists, capture's Domain chips, review): the case is named "pv.named: every geminiNamed Domain name renders the mark" (contracts ruling 67). The mark is gone after a rename.
- **Banned words** (§15.3) never appear on Gemini output.
- **States:**
  - locked layer nodes have no `m.lock` and no dash;
  - unchosen topics are not struck;
  - held layers give no rank;
  - the trace leaves every name at ink-2 or darker;
  - the estimate pips carry no animation class.
- **Layout:**
  - the row arithmetic holds (138 / 182 px) and a 40-character name wraps to 3 lines within 60 px;
  - the switcher fits 312 px (3 pills; 2 pills and "+"), and its labels are distinct;
  - the layer header's first row is 44 px.
- **Links:** source links come only from chunk uris, with rel "noopener noreferrer nofollow". Every roadmap href carries `?goal=` once lane 4 lands. "Archive it to start another" is gone.
- **Intake and copy:** a fresh intake preselects 0 Domains, or only exact aim-word matches (lane 1). OUTLINE_EMPTY_GEMINI_TAIL appears only on LEVELS, and the TOPICS line follows the switches.
- **One goal:** with one open goal, every pre-revision-5 fixture's markup is byte-identical (D39).

**today-ui-check and you-check:**
- rows 9, 10 and 11 with 2 and 3 goals;
- 1 goal byte-identical;
- seat glyphs only with 2+ goals;
- no `.shd` or motion added on /today;
- only one horizon slot may loop on /you (D41).

**ui-audit:** the §15.10 rows at 344, 375, 932 and 1440, in both themes and at the three motion levels. Targets measured on the element: the keep button, ▸, the checkbox, the pills and "+".

**Snapshots.** After each UI lane, the lane screenshots every changed surface at 344 px first, then 932 and 1440, from fixtures only (never the user's own goal), and sends them to the user.

### 15.13 Files

**Glyph system:**
- `src/components/glyph/paths/layer.ts` and `paths/goal.ts` (new);
- provenance.ts (pv.web, pv.library, pv.libpick, pv.named);
- index.ts (the `layer` and `goal` families; `DefsFamily` gains `goal`);
- means.ts;
- RouteRail.tsx (layer and depth nodes, `opensAfter`, the held word);
- HonestyChip.tsx (the kinds of §15.3);
- src/lib/glyph-motion.ts (`trace`, `layer-open`, `estimate-swap`, the swap form of `pv-confirm`).

**Topic map (lane 9).** In src/components/roadmap:
- TopicMap.tsx, LayerBand.tsx and TopicMapRow.tsx (§15.14 item 1);
- TopicSheet.tsx, EstimateChip.tsx, SourcesSheet.tsx and ParentsSheet.tsx;
- roadmap-copy.ts (the chip strings, the TOPICS outline line);
- roadmap.css (layout hooks only).

**Goals (lane 4).** In src/components/roadmap: GoalSwitcher.tsx, GoalsFullCard.tsx, PauseSheet.tsx (with ResumeSheet) and roadmap-copy.ts (§23.7's copy).

**Fixtures:**
- src/app/dev/style/roadmap/fixtures.ts: `topic-map-draft`, `topic-map-write`, `topic-map-plan`, `topic-chain`, `goals-full`, the pause and resume sheets, the switcher at 1, 2 and 3 goals;
- the Today and /you fixtures: `goals-2`, `goals-3`;
- src/app/dev/style/glyphs: the new glyphs × states × levels.

Fixture names are neutral (the spec's A1…D2 shape). Fixtures never use the user's aim, figures or Domains.

**Checks:** scripts/glyph-check.ts, roadmap-ui-check.ts, today-ui-check.ts, you-check.ts and ui-audit.mjs.

### 15.14 Open points for the lead (closed by contracts rulings 63 and 68)

1. **TopicRow.tsx already exists** (the rev-3 outline row that MilestoneCard and DraftReview render). Closed: the map's row is **TopicMapRow.tsx**, and contracts §22.18's lane-9 HANDOFF line is re-pinned to it (ruling 63).
2. **The estimate chip's word order.** Closed: question 18's order, «4 layers · Gemini's estimate» (ruling 63), as §15.3, §15.4 and §15.6 now read.
3. **The 44 px layer header.** Closed: the who-word chip takes a second header row (84 px in all), as §15.5 says (ruling 68). The alternative (the chip in the first row, the keep button at the layer's foot) stays open for the user.
4. **A chip per topic row.** Closed as D37: the layer chip plus the row's sheet (ruling 68).
5. **`pv.named` without a visible "Gemini"** (D33). Closed as D33 (ruling 68); the alternative, a «Gemini» micro-chip after every kept name, stays open for the user.
