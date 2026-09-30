# User setup

1. Decide your time zone now; it takes 1 minute. Brisbane and Sydney are both UTC+10 today, but Sydney, Melbourne and Canberra move to UTC+11 on Sunday 4 Oct 2026.
   - Set NEXT_PUBLIC_USER_TIMEZONE to Australia/Brisbane (Queensland, no DST) or Australia/Sydney (NSW/ACT; Australia/Melbourne for VIC).
   - Add it to .env and to Vercel → Project → Settings → Environment Variables (Production and Preview). Redeploy afterwards: the value is inlined at build time.
2. Say yes or no before each migration. Dev and production share one database, so the lead asks before touching it. On your go-ahead the lead:
   - (a) checks that the Supabase project ref in DIRECT_URL is xtnl-idea, not XTNL_thesis;
   - (b) runs: npx prisma db execute --file prisma/migrations/<name>/migration.sql --schema prisma/schema.prisma
   - (c) runs: npx prisma migrate resolve --applied <name>
   - (d) runs: npx prisma generate
   - (e) deploys.
   Never run npm run db:migrate: it is prisma migrate dev and would try to reset the database.
3. Optional but recommended: a local rehearsal database (Docker is installed). In PowerShell:
   - docker run -d --name xtnl-rehearsal -e POSTGRES_PASSWORD=rehearsal -p 55432:5432 pgvector/pgvector:pg16
   - $env:DATABASE_URL='postgresql://postgres:rehearsal@localhost:55432/postgres'; $env:DIRECT_URL=$env:DATABASE_URL; npx prisma migrate deploy; npm run dev
   Process environment variables win over .env, so this session never touches Supabase. Remove it afterwards with: docker rm -f xtnl-rehearsal
4. M1 streak backfill. After M1's migration, run npx tsx scripts/backfill-activity.ts. It is a dry run that prints the old and new streak. If the numbers look right, run it again with --apply.
5. M2 decision. Should 'Accept the loss' appear on debt that is 14 or more days old? It removes the card and keeps the −XP. You said debt stays until done, so it ships OFF (LifeSettings.debtWriteOff = false) until you say otherwise.
6. M2 cron. vercel.json gains a second daily cron, /api/cron/life at 15 18 * * * UTC (04:15 Brisbane).
   - Confirm that Fluid compute is enabled in Vercel → Settings → Functions. Its default duration is 300 s. No route lowers it.
   - If the project is on the Hobby plan, 2 daily crons are allowed. Timing varies within the hour, which is harmless here.
7. M1 and M3 phone setup: rebuild the Android TWA so it picks up the new shortcuts and share target.
   - If you use Bubblewrap: bubblewrap update, then bubblewrap build, then install the new APK. The share target needs android-browser-helper 2.0.1 or later.
   - If the app is instead installed as a Chrome PWA: uninstall and reinstall it, or wait for Chrome to refresh the manifest.
   - Then long-press the icon and drag 'Quick task' to the home screen.
8. M3 tokens. Generate two secrets with:
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   Set CAPTURE_TOKEN (M3) and HEALTH_INGEST_TOKEN (M4) in .env and in Vercel, then redeploy.
9. M3 desktop hotkey:
   - Install AutoHotkey v2.
   - Put CAPTURE_TOKEN in %APPDATA%\xtnl\capture-token.txt.
   - Save the README's script as xtnl-capture.ahk, and put a shortcut to it in shell:startup.
   - Win+Shift+Q then opens a capture box from any app.
10. M4 automatic exercise sync (Android):
   - (a) In Samsung Health → Settings → Health Connect (or Settings → Health Connect → App permissions → Samsung Health), allow Samsung Health to write Exercise, Steps and Heart rate.
   - (b) Install 'Health Connect Webhook' (com.hcwebhook.app; open source: github.com/mcnaveen/health-connect-webhook), and grant it read access to Exercise, Steps and Heart rate. Resting heart rate is optional.
   - (c) In that app, add the URL https://<your-app>/api/ingest/health?dryRun=1 and the header Authorization: Bearer <HEALTH_INGEST_TOKEN>. Enable Exercise and Steps. Heart rate is optional; if you enable it, set 1-minute resolution.
   - (d) Press Test. You should get a 200 response with a plan. Then remove ?dryRun=1.
   - (e) Set the interval to 60 min (minimum 15), and exempt the app from battery optimisation.
   - Health Connect only lets a new app read 30 days back, so older history comes from step 11.
   - The alternative is Tasker + TaskerHealthConnect (from GitHub or Obtainium) posting the generic v1 JSON documented on /train/sync.
11. M4 history backfill:
   - In Samsung Health, go to Settings → Download personal data → Download. The files land in Internal storage/Download/Samsung Health/<dated folder>.
   - Open /train/import. On the phone, multi-select the CSVs com.samsung.shealth.exercise.*.csv and com.samsung.shealth.tracker.pedometer_day_summary.*.csv (or compress the folder to .zip in My Files and pick the zip). On a desktop, pick the folder.
   - Review the preview, then import. Anything older than 14 days is history only and pays no XP.
12. M4 optional settings: on /train/sync, enter your max heart rate (or your birth year for an estimate), and check your daily capacity (default 240 min).

# Risks

Verified before planning (repo at b4d2652 and the Next 16.2.12 docs):
- streak.ts derives the streak from DISTINCT date_trunc('day', Idea.updatedAt), cached under ['ideas'].
- due.ts uses server-local setHours.
- srs.ts has the after() at about line 177, and the passed-review ops are a $transaction array.
- The cron route exports no maxDuration. vercel.json has '0 0 * * *' in region icn1.
- CacheTag is exactly fields | ideas | progress. Notifications are cached on those three tags (line 181).
- manifest.ts has two shortcuts and no share_target. Next's Manifest type does support share_target.
- bottomSlot is outside Suspense.
- SessionCard advances on any window keydown.
- fieldLevel is called at dashboard:106, overview:47, skills:25 and NavTitleBadge:27.
- There are two currentWeekAnchor functions (field-quota:36 and skill-effects:296).
- format-date.ts is imported by the client components SkillHub and BossPanel.
- field-streaks.ts imports prisma, which is why streakBonusPercent moves to a pure module.
- The genai Schema.maxItems field is a string.
- The Server Action body limit is 1 MB. refresh() works only in Server Actions. after() runs even when the response errors.
- package.json's db:migrate script is 'prisma migrate dev'.
- balance-horizon runs purely: 61.96 MP/day, 13.7 years, 310,099.2 MP pool.
- The HC Webhook docs confirm the root {timestamp, app_version}, the 'exercise' key, a 48 h window, no ids in the JSON, and per-URL custom headers.
- Sydney life days 2026-10-03 and 2027-04-03 last 23 h and 25 h.

Main risks and mitigations:

1. Clock cut-over (M1). It touches 10 knowledge files in one commit.
   - Effects: ward charges refresh once, the quota week starts 6 h earlier, the daily focus re-picks, and due-queue edges move to 04:00 local.
   - Mitigations: every effect favours the user. The field-streak shim treats a gap of 2 as continuous across the cut-over, so no false breaks and no DOUBT. The pure life-day check covers DST.
   - A wrong time zone shifts every day silently. The Today header prints the zone and local time, and user_setup step 1 asks the Brisbane-vs-Sydney question before the 4 Oct DST switch.

2. Shared dev/prod database. Every migration is live the moment it is applied.
   - All three migrations only create tables, and nothing pre-existing is altered.
   - Rehearse on local pgvector first. Check the project ref. Never use migrate dev or db push.
   - Checks never write to the database. Settlement starts from today − 2, so there is no retroactive debt, and backfills are dry-run first.

3. Latency. Round trips cost 160-833 ms.
   - A completion is one read wave plus one batch $transaction.
   - Capture is one INSERT, with AI in after().
   - Settlement runs once a day, inline only when it is behind.
   - Recommend moving DATABASE_URL to the :5432 session pooler (a deploy-time change noted in prisma.ts).

4. Races.
   - Two simultaneous completions can both see the same knee base. Settlement's KNEE_RECONCILE fixes the day total.
   - after() failures lose at most a REVIEW streak row for strikes. Advanced reviews are written inside the points transaction, so they are never lost.

5. The model is not strictly deterministic, even at temperature 0 with a seed. This cannot affect pay:
   - the output is enums only;
   - the grade is copied per normTitle;
   - the grade freezes at the first completion or 24 h;
   - at most 40 calls a day;
   - the lexical fallback is always written first.

6. Grading gameability that remains.
   - A trivial-task skew remains (INTRO pays more per minute). It is bounded by the INTRO volume factor V, Dice-group decay D and the 300 XP daily knee.
   - Self-reported minutes are bounded by 2× the machine band.
   - Manual workouts are bounded to 180 min and 50 raw per day, and never set paying PRs.
   - Stated worst case: 300 life XP per day and 8 MP per week plus capped goal lumps.

7. Debt could feed avoidance.
   - Valves: a flat, capped debt, make-up and MVV that clear it in full, freezes, rest, sick and vacation days, repair, the akrasia horizon only for weakening a commitment, and non-blaming copy with the debt kept out of the top of the board.
   - The write-off switch is the user's call.

8. Third-party ingest drift. HC Webhook shipped 5 releases in September 2026.
   - The adapters parse leniently, and generic v1 is the stable contract.
   - IngestLog errors and unmapped codes are shown on /train/sync.
   - Partial batches return 200, so the bridge's watermark keeps moving.
   - OEM battery killers can delay syncs; the app is exempted in setup.
   - A leaked HEALTH_INGEST_TOKEN lets someone forge workouts, bounded by the clamps and caps. Rotate it through the environment.

9. Cross-source dedupe heuristics. Two genuine back-to-back sessions could merge.
   - The same family and a 60% overlap are required. Merges are visible on /train, and a split action can be added later if needed.

10. Samsung export layout changes between app versions.
   - Columns are matched by suffix, filenames by regex anywhere in the archive, with a preview before writing.
   - Large zips on phones are filtered before they are inflated.

11. The '/' redirect to /today reverses a documented decision. It is one line to revert, and the review quest sits first on the board.
   - Nav crowding at md width is handled by the More menu.

12. The TWA and share-target rebuild is a manual step outside the repository.

13. Economy.
   - Life MP worst case is 2.85% of knowledge income, asserted by balance-horizon.
   - Emblem gates will open faster for an active person. That is intended, and ultimate breadth gates such as MIND needing PHYSICAL become reachable through real exercise.

14. M1 size. It is the largest milestone.
   - Four disjoint lanes share a contract file (life-types.ts) written first by the lead.
   - Everything in M1 is additive and can be feature-flagged off by hiding the Today link and reverting the redirect.
