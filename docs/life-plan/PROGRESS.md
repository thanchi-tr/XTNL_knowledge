# Life plan — progress log and resume protocol

This file is how work on the "gamify life" plan survives a session ending
(for example when usage credit runs out). Any session — an interactive one
or the scheduled `xtnl-life-resume` task — reads it first, and every session
that works on the plan keeps it current.

## Heartbeat (the lock)

    HEARTBEAT: 2026-10-01T10:31+1000 — interactive session: redesign-fix workflow (6 lanes) + capture-improve-design workflow running until 2026-10-01T12:31+1000

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
- [ ] Full UI/UX redesign — spec `redesign.md`, mockups `redesign/final-*.html`
  - [x] Design round (map → 3 directions → 3 judges → synthesis): "Sigil & Slate"
  - [x] Build: L0 foundation, L1 Today, L2 Review, L3 Celebrate (+ migration), L4 You, L5 Study/Settings (workflow redesign-build; the 3 reviewers were cut off by a usage limit and are being re-run)
  - [ ] Reviews fixed; gates (contrast, UI audit at 344/375/932/1440, motion, perf, layers) green
  - [x] Celebrations migration rehearsed locally, applied to Supabase (20261010000000_celebrations)
  - [ ] Browser-verified; committed and pushed
- [ ] Improve the capture feature
- [ ] M5
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
