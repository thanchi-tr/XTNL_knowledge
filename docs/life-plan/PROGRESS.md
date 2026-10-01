# Life plan — progress log and resume protocol

This file is how work on the "gamify life" plan survives a session ending
(for example when usage credit runs out). Any session — an interactive one
or the scheduled `xtnl-life-resume` task — reads it first, and every session
that works on the plan keeps it current.

## Heartbeat (the lock)

    HEARTBEAT: 2026-10-01T16:38+1000 — interactive session: capture pushed; next M5 phase A (rerun m5-phase-a) until 2026-10-01T19:38+1000

Rules:
- A session working on the plan rewrites the HEARTBEAT line at the start of
  every step and at least every 60 minutes while it works (a long workflow
  counts as work: write the heartbeat when launching it, with its expected
  finish time).
- A resuming session must NOT start work if the heartbeat is younger than
  4 hours, or if it says "until <time>" and that time (+60 min) has not passed, or if any file under `src/` was modified in the last 45 minutes
  (`git status` / mtimes). Another session is alive; exit quietly.
- When a step finishes, tick it below and add a line to the log.

## Order (set by the user; revised 2026-10-01)

1. **M1** — done.
2. **Full UI/UX redesign** — finish it (spec `redesign.md`, mockups `redesign/final-*.html`).
3. **Improve the capture feature** (user request, after the redesign).
4. **M5** — character: life tracks, attribute seam, goals, mastery. Spec: `m5.md`.
5. **M2** — compulsory duty, debt, forgiveness, close-the-day / weekly review. Spec: `m2.md`. Migration `life_duty`.
- **M3 and M4 are dropped** (user, 2026-10-01: "you don't need to do milestone 3 and 4"). Do not build /train ingest or the share-target/token capture API unless asked.

Shared specs: `vision.md`, `grading.md`, `data-model.md`, `setup-and-risks.md`, `dropped.md`, and the codebase map `codebase-map.json`.

## Status

- [x] M1
  - [x] Lane 0 (lead): schema models, migration `20261005000000_life_core` (rehearsed locally), `src/lib/life-day.ts`, `src/lib/life-types.ts`, cache tags
  - [x] Lanes A–D built (workflow `life-m1-build`), 3 reviews (46 findings)
  - [x] Review findings fixed; `tsc`, lint, `next build`, every `scripts/*-check.ts` green
  - [x] Browser-verified on the local rehearsal server (port 3100)
  - [x] `life_core` applied to Supabase (after the project-ref check), backfill dry-run then `--apply`
  - [x] Committed and pushed to `main`
- [x] Full UI/UX redesign — spec `redesign.md`, mockups `redesign/final-*.html`
  - [x] Design round (map → 3 directions → 3 judges → synthesis): "Sigil & Slate"
  - [x] Build: L0 foundation, L1 Today, L2 Review, L3 Celebrate (+ migration), L4 You, L5 Study/Settings (workflow redesign-build; the 3 reviewers were cut off by a usage limit and are being re-run)
  - [x] Reviews fixed; gates (contrast, UI audit at 344/375/932/1440, motion, perf, layers) green
  - [x] Celebrations migration rehearsed locally, applied to Supabase (20261010000000_celebrations)
  - [x] Browser-verified; committed and pushed
- [x] Improve the capture feature — spec `capture.md` (19 items, no migration)
  - [x] Build: step0 contracts, A parser, C server, D ideas, B sheet; 2 reviews (5 major, 13 minor)
  - [x] Fix round (parser, server, sheet lanes + verifier) and lead fixes; P2 one-box ideas left OFF (answer kept as the draft note)
  - [x] Gates: tsc, eslint, life:check (9 scripts), ui:check, novelty, skills:stats, next build, ui-audit 121/121; browser pass at 344 px on the rehearsal server
  - [x] Committed and pushed
- [ ] M5 — refitted spec `m5-refit.md` (no migration; inert until LIFE_LAUNCH_DAY is set)
  - [ ] Phase A (contract + 4 lanes on files the capture build does not own) + 2 reviewers
  - [ ] Phase B (Today integration: tasks.ts, today-board.ts, GoalsStrip, TodayBoard) after the capture build merges
  - [ ] Launch (LIFE_LAUNCH_DAY), rehearsal, browser pass, commit
- [ ] M2
- [~] M3 — dropped by the user
- [~] M4 — dropped by the user

## Standing rules for any session

- Ultracode: the user opted into multi-agent workflows; use the Workflow tool for substantive steps (build lanes on disjoint files, then independent reviewers).
- Never run a DB command from a subagent. The lead does all DB work.
- Test against the **local rehearsal database** only: Docker container `xtnl-rehearsal` (pgvector/pgvector:pg16, port 55432, password `rehearsal`), started with
  `docker start xtnl-rehearsal` (Docker Desktop must be running). Prisma commands against it:
  `DATABASE_URL=postgresql://postgres:rehearsal@localhost:55432/postgres DIRECT_URL=<same> npx prisma …` — always confirm the "Datasource … at localhost:55432" line first.
  The rehearsal dev server: preview config `xtnl-rehearsal` / `node docs/life-plan/dev-rehearsal.mjs` (port 3100; blank GEMINI_API_KEY). Seed it with `npx tsx prisma/seed.ts` under the local DATABASE_URL.
- Applying a migration to Supabase: the user pre-approved additive migrations once a milestone passes locally. First check the project ref in `DIRECT_URL` is the xtnl-idea project, NOT XTNL_thesis. Then `npx prisma db execute --file prisma/migrations/<name>/migration.sql --schema prisma/schema.prisma`, `npx prisma migrate resolve --applied <name>`, `npx prisma generate`. Never `prisma migrate dev`, `db push` or `migrate reset`.
- Never test by answering the user's real review cards or writing test rows into production.
- Browser checks: open your own tab; never act on the user's real data.
- Commit each finished milestone to `main` and push (the user commits and pushes main themselves too; the old town game lives on the `game` branch). End commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `.claude/launch.json` has an `xtnl-rehearsal` config that runs `docs/life-plan/dev-rehearsal.mjs` (repo-relative; safe to commit).

## Log

- 2026-10-01 — Game moved to branch `game`; removed from `main` (b4d2652). Life plan designed (understand → 3 proposals → 3 judges → synthesis).
- 2026-10-01 — User decisions: Samsung Health + Health Connect; AI sizes once / formula scores; compulsory miss = XP debt + streak hit; capture on phone + desktop; Australia/Sydney; additive migrations pre-approved after local tests; order M1 → redesign → M2–M5; auto-resume after credit resets.
- 2026-10-01 — M1 lane 0 done; M1 build workflow launched.
- 2026-10-01 — M1 lanes A–D built; reviews found 46 issues (≈15 major); fix workflow `life-m1-fix` launched (core / UI / glue lanes).
- 2026-10-01 — M1 fixed (49 review findings, 3 fixer lanes), verified: life:check 110 PASS, tsc, lint, next build, novelty-check, skills:stats; browser on the rehearsal server (capture → chips → toast, tick pays the projection with receipt, undo nets zero, review writes REVIEW/DOMAIN, 375/768/932/1024 px no overflow). life_core applied to Supabase (ref xvlkujmtdcpaoxdftgpl checked); the already-applied idea_difficulty migration was also marked applied; streak backfill applied (1 LEGACY_DAY, rerun inserts 0).
- 2026-10-01 — Note: the user committed a mid-build snapshot as `a` (2f72f0d) at 02:15, before life_core existed in production; the fix commit follows.
- 2026-10-01 — Redesign: design workflow `redesign-design` launched. Its spec and mockups will be copied to docs/life-plan/redesign.md and docs/life-plan/redesign/.
- RESUME NOTE (redesign): the design workflow's results land in C:/Users/Thanc/.claude/projects/C--Users-Thanc-OneDrive-Desktop-XTNL-idea/dd3bd260-2baf-4833-82dd-c7e980a42ad3/subagents/workflows/wf_62a96a5f-71d/journal.jsonl (one "result" line per agent; the last is the synthesised spec) and its HTML mockups in C:/Users/Thanc/AppData/Local/Temp/claude/C--Users-Thanc-OneDrive-Desktop-XTNL-idea/dd3bd260-2baf-4833-82dd-c7e980a42ad3/scratchpad/redesign/. If the journal has the synthesis result, copy the spec to docs/life-plan/redesign.md and the final-*.html mockups to docs/life-plan/redesign/, then build it in lanes (foundation lane first). If not, rerun the workflow from its script: C:/Users/Thanc/.claude/projects/C--Users-Thanc-OneDrive-Desktop-XTNL-idea/dd3bd260-2baf-4833-82dd-c7e980a42ad3/workflows/scripts/redesign-design-wf_62a96a5f-71d.js (change its OUTDIR to docs/life-plan/redesign).
- 2026-10-01 — Redesign design round done: "Sigil & Slate" (A base + B instruments + C daily hooks). Spec docs/life-plan/redesign.md, mockups docs/life-plan/redesign/. Build workflow launched.
- RESUME NOTE (redesign build): workflow `redesign-build` (run wf_2085416b-229). Per-agent results: C:/Users/Thanc/.claude/projects/C--Users-Thanc-OneDrive-Desktop-XTNL-idea/dd3bd260-2baf-4833-82dd-c7e980a42ad3/subagents/workflows/wf_2085416b-229/journal.jsonl. Script: C:/Users/Thanc/.claude/projects/C--Users-Thanc-OneDrive-Desktop-XTNL-idea/dd3bd260-2baf-4833-82dd-c7e980a42ad3/workflows/scripts/redesign-build-wf_2085416b-229.js. If it was cut off, check which lanes have a "result" line, inspect git status for partial edits, and rerun only the missing lanes (a new session cannot resume another session's run; re-invoke the script as a new workflow and skip finished lanes). After it: fix review findings, rehearse the celebrations migration locally, run the gates (contrast-check, ui-audit at 344/375/932/1440 on the rehearsal server, next build), apply the migration to Supabase, commit and push.
- 2026-10-01 — Redesign build lanes L0–L5 done. User revised the order: finish the redesign → improve capture → M5 → M2; M3 and M4 dropped.
- 2026-10-01 — Redesign reviews: 0 blocker, 14 major, 21 minor (Tailwind class-name collisions block/ring/inline, unwired Seal ack and Today celebrations, unlock ceremony art, DangerZone phrase, loadout slot, radar labels, global CSS imports, redirects, unwired check scripts). The user had committed the unreviewed build as `a` (e8562bf); the celebrations migration was applied to Supabase right away. Fix workflow `redesign-fix` (run wf_45b3cf28-5f8) running; capture design workflow `capture-improve-design` (run wf_13df9456-534) running in parallel (read-only).
- RESUME NOTE: review findings are in the scratchpad file redesign_build.json (also in the redesign-build journal: C:/Users/Thanc/.claude/projects/C--Users-Thanc-OneDrive-Desktop-XTNL-idea/dd3bd260-2baf-4833-82dd-c7e980a42ad3/subagents/workflows/wf_2085416b-229/journal.jsonl). After the fixes: tsc, lint, life:check + ui checks, next build, the ui-audit (node scripts/ui-audit.mjs against the rehearsal server) at 344/375/932/1440, browser pass, commit, push.
- 2026-10-01 — Redesign finished: 6 fix lanes (85 items) + lead cleanup (retired AppNav/Logo/aliases, dead files, footer key warning). Gates: life:check, ui:check (shell 169, contrast 204/204, review, celebration, you, study-side), tsc, lint, next build, ui-audit 121/121 at 344/375/932/1440 on the rehearsal server.
- 2026-10-01 — Capture design done (workflow capture-improve-design, run wf_13df9456-534; journal under subagents/workflows/wf_13df9456-534). Next: build it.
- 2026-10-01 — Capture spec saved to docs/life-plan/capture.md; build workflow `capture-build` launched.
- 2026-10-01 — M5 refitted for "no M2/M3/M4" (docs/life-plan/m5-refit.md). Phase A launched in parallel with the capture build on disjoint files (workflow m5-phase-a).
- RESUME NOTE (capture + M5 phase A, running in parallel): capture-build = run wf_9b001cf4-d7c (journal: C:/Users/Thanc/.claude/projects/C--Users-Thanc-OneDrive-Desktop-XTNL-idea/dd3bd260-2baf-4833-82dd-c7e980a42ad3/subagents/workflows/wf_9b001cf4-d7c/journal.jsonl); m5-phase-a = run wf_c899e331-f74 (journal: .../subagents/workflows/wf_c899e331-f74/journal.jsonl). Scripts in .../workflows/scripts/. If cut off: read the journals, inspect git status, rerun only missing lanes. Then: fix reviews, tsc/lint/life:check/ui:check/balance:horizon/next build, ui-audit (MSYS_NO_PATHCONV=1 node scripts/ui-audit.mjs --base http://localhost:3100), browser pass on the rehearsal server, commit capture; then M5 phase B (Today integration), launch (LIFE_LAUNCH_DAY via scripts/life-launch.ts, dry-run first), commit; then M2.
- 2026-10-01 — User: "push the change before proceed to milestone 5". M5 phase A workflow stopped before it wrote any file (lane 0 had just started). Order now strictly: finish + verify + push capture, THEN resume M5 (rerun m5-phase-a from its script).
- 2026-10-01 — Capture build complete (step0, A parser, C server, D ideas, B sheet). Reviews: 0 blocker, 5 major, 13 minor (recapture after an archived row, stale-day retries, empty-line insert fusing, focus loss on the cover screen, footer column; weak-word dates, xmas prefix, etc.). life:check now also runs capture-server-check and idea-capture-check. P2 one-box ideas left OFF (answer is kept as the draft note). Fix workflow `capture-fix` (run wf_74abc97e-98a; findings in the scratchpad fix-*.json) running: parser, server, sheet lanes + 1 verifier.
- RESUME NOTE (capture-fix): journal C:/Users/Thanc/.claude/projects/C--Users-Thanc-OneDrive-Desktop-XTNL-idea/dd3bd260-2baf-4833-82dd-c7e980a42ad3/subagents/workflows/wf_74abc97e-98a/journal.jsonl. After it: fix verifier leftovers, switch capture-ui wherePreviewOf to src/lib/capture-shape.ts if the server lane made it, then tsc/lint/life:check/ui:check/novelty/skills:stats/next build, ui-audit, rehearsal browser pass (344 px first), commit + push capture, then M5 phase A.
- 2026-10-01 — Capture done. Fix round (run wf_74abc97e-98a): parser (weak-word nouns, holiday prefixes), server (edit after an archived row → 'gone', never a second row; cross-day resends never tick; an edit keeps a board tick), sheet (C1/C2 client, U1–U13). Verifier: 1 major (a closing save waited behind the vocabulary refresh) + 6 minor, fixed by the lead along with: 'N added' counts rows (an edit of the same opening's line no longer adds one), undo 'gone' copy from the server, typed undoCapture code, wherePreviewOf on the shared capture-shape module, sat/sun stop-lists split by day. Gates: tsc, eslint, life:check (capture-parse 814, today-ui 466, capture-server, idea-capture 127, …), ui:check (953), novelty, skills:stats, next build, ui-audit 121/121; browser at 344 px on the rehearsal DB (12-tap Must, empty-line insert, Escape closes the menu first, burst + Done on Enter, edit replaces the row — DB shows the old archived and one live row — dock summary). Next: M5 phase A.
- 2026-10-01 — Capture pushed (1e94796). M5 phase A launched (run wf_7fdac94e-7d1, script workflows/scripts/m5-phase-a-wf_c899e331-f74.js): lane 0 contract, then lanes A core / B seam / C You UI / D guards, then 2 reviewers.
- RESUME NOTE (M5 phase A): journal C:/Users/Thanc/.claude/projects/C--Users-Thanc-OneDrive-Desktop-XTNL-idea/dd3bd260-2baf-4833-82dd-c7e980a42ad3/subagents/workflows/wf_7fdac94e-7d1/journal.jsonl. If cut off: read the journal, inspect git status, rerun only missing lanes. After it: fix reviews, then phase B (Today integration in tasks.ts / today-board.ts / src/components/today/**), gates (tsc, eslint, life:check, ui:check, balance:horizon, novelty, skills:stats, next build, ui-audit), rehearsal browser pass, commit + push; launch (scripts/life-launch.ts, dry run first) only after that; then M2.
