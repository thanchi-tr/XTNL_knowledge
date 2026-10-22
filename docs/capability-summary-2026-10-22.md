# XTNL: what it can do today (as of 22 Oct 2026)

XTNL is a single-user app that turns your life into a game. It is a Next.js app on Vercel with Postgres on Supabase. It joins five things into one character with levels, attributes and an emblem tree:

- a spaced-repetition knowledge engine, where you write ideas as questions and the app files them into Fields and Domains
- a task board that pays XP for each task by a published formula
- a work CRM
- body tracking
- AI-planned learning roadmaps

A native Android app for the Fold 8 handles quick checks, review and logging through a JSON API. There is no login. The app always acts as one fixed user.

## Ideas & review
- **Create ideas in 7 formats.** Base points: Short 10, Cloze 12, Numeric 15, Multiple choice 20, List 25, Order 28, Formula 30. Each idea can have up to 6 other wordings. Gemini can suggest wrong options for multiple choice. *Needs GEMINI_API_KEY: if the embedding call fails, nothing is filed and your text is kept.*
- **Duplicate check on every submit.** One embedding call plus a word-level comparison names 11 possible relations:
  - "Already known" merges into the existing card on its own.
  - 8 relations stop the submit and offer Link, Enrich or keep the existing card.
  - 3 create a new card.
- **Automatic filing.**
  - Field: the nearest similar idea decides, or else the best attribute match.
  - Domain: the nearest idea inside the Field decides. An open roadmap topic gets first claim. Otherwise Gemini names a new Domain.
  - At least one Field must exist, or the submit fails.
- **Points for a new idea.** Base × e^(−0.15 × similar cards in the Domain), × 1.32–1.6 when it is today's focus Field. Difficulty is scored 0–100 from the wording alone.
- **Quick capture.** A line `idea: Q :: A` files itself in the background. If it fails or is a duplicate, it stays as an Inbox draft.
- **Writing aids.** Word completion learned from your own writing, auto-correct (can be switched off), and a formula editor whose grading accepts equivalent forms.
- **Review.** Cards are due from 04:00 Sydney time. A session covers all Fields, one Field or one roadmap topic. The order stays the same if you reload. A missed card comes back up to 3 times in the session. The daily quest is min(15, cards due).
- **Grading happens on the server.** Short answers allow typos, key words and synonyms, plus a meaning check that uses no AI model. "I was right" works on Short and List misses for 10 minutes.
- **Spacing.**
  - 20 levels, with intervals from 1 day up to 2,850 days, multiplied by a per-idea ease of 0.6–1.8.
  - A card is mastered at L12. L13–20 is a ladder after mastery.
  - Two lapses in a row, or a miss after grace has run out, costs one level and takes back that level's points.
- **Payout.** A right answer pays 2 × (1 + 0.18 × (L−1)) × combo, with the combo capped at ×1.5. Reaching L12 adds +25 once. Every pass also earns mastery points (MP).
- **Forgetting.** A daily job lowers cards that are past their grace, following a forgetting curve. Domain and Field levels drop with neglect before any card does.
- **Library.** Search, filters kept in the URL, quick chips (Due, Fading, Mastered, Struggling), Field pages, and an idea page with what comes next and its history. Edit keeps the card's progress. Delete is permanent.
- **Fields & Domains.** Create them and edit a Field's 13-attribute mix. Settings › Data holds resets, each confirmed by typing a phrase.
- **Field pressure.**
  - Each Field has a weekly quota of new ideas. Missing it applies a Stagnation debuff.
  - Maintenance mode removes the quota and the Boss, but reviews and forgetting continue.
  - Boss fights unlock at Field level 5.
- *DIAGRAM cards can be reviewed on the web, but nothing can create or edit them.*

## Roadmap
- **Set an aim** at /you/roadmap/new:
  - the area: a Field, or a life track (Craft, Body, Care, Duty)
  - the depth: L8, L10 or L12
  - a date, or "when realistic"
  - hours a week, plus an optional exam and outline
- **Up to 3 goals at once.** Each can be paused, resumed, labelled, archived or marked done. A Domain belongs to only one goal, and the weekly hours are shared.
- **Level plans with no AI.** "Build from my numbers" makes up to 6 milestones dated from your measured pace. A date check gives a verdict and ways to fix it. You can also write the plan by hand.
- **Draft review and Accept.** Accept has a 10-second Undo, and every accepted change is kept as a version.
- **Safety card for Body and Care plans.** Activity kinds you block are never placed in the plan.
- **Topic maps (Field areas).** 1–6 layers from broad to deep. You can edit them freely. Accepting creates the Domains, and "Add an idea here" opens the New idea form in that Domain.
- **Gemini "Break it down".** It rates the aim, maps topics, links prerequisites and checks names against a web search. *Needs GEMINI_API_KEY. It runs on the free tier, so Google may use the data. Caps: 48 requests and 21 web checks a day.*
- **After accepting.** You can edit the plan (each edit can be undone), re-plan, lower the depth and log checkpoint scores.
- **Review hub focus card.** It shows the current topic of your first topic-map goal (the lowest goal slot), with one-tap Review or + Idea.
- *Partial:* the proficiency % and aim rank move only on the cards part, because no milestone can be started.
- *Behind switches:*
  - Starting a milestone, and everything that follows from it: the Today goal and tasks, the milestone's MP pay, week quests and re-plan triggers.
  - Gemini drafting of level plans.
  - Area suggestions.
- Roadmap changes are refused on any server other than production, unless XTNL_LIFE_JUDGE=1.

## Tasks
- **Today board.** Lanes: Must, Planned, Habits, Yesterday, Goals, Done, Inbox and Anytime. The day runs from 04:00 to 04:00 Sydney time. Each row shows the XP it will pay.
- **One-line capture** (`c`, Alt+N or `+`) reads:
  - musts (`!`), durations and dates, deadlines (`by fri`)
  - repeats, `#body`/`#duty`/`#craft`/`#care` tags, the Inbox (`?`)
  - a minimum version, `^goal` links, study links (`review 20`), "done now" (`x`)
  - Vietnamese
  
  A paste adds up to 20 lines. Undo or edit works for 10 minutes, and a resend never adds a line twice.
- **Repeats.** A fixed schedule, N days after the last completion, or a frequency target ("3x a week").
- **Graded XP.** Band × effort × timing × consistency × repeat decay × routine volume × kind. A daily curve softens pay above 100 and caps it at 300 XP a day. Receipts show every factor, and /today/rules publishes every constant.
- **AI sizing.** Gemini sizes each task once, at most 40 a day. Without the key, the word-based size stays.
- **Actions on a task.**
  - Tick, minimum version (×0.3), Again, record yesterday.
  - Skip (repeating non-musts only), reschedule, archive.
  - Defer or abort with a reason, undoable for 10 minutes.
- **Steps.** Up to 12 per task. Each tick pays its share. A must pays only when every step is done.
- **Also:** self-rated size, a daily capacity with a warning when you are over it, and one-tap sorting of the Inbox.
- **Goals (Short, Mid, Long).** Progress comes from linked tasks or from a number in the title. Closing a goal pays MP, never XP, with minimum ages and rate limits.
- **Habits.** A year grid per habit, habit strength and streaks.
- **How completing feels.** Animation, rising plucks, haptics and a "Board clear" card. Sound and haptics can be switched off.
- **Musts.** The Must lane, no skipping and the minimum version work today. The penalties for a missed must are off.
- *Partial:* the weekly review page shows the last judged week and this week's defers, but not the 5-step review. Close the day has no note, mood or "Rest tomorrow" switch.
- *Behind the Duty switch:* daily settlement, debt and make-ups, rest/sick/vacation days, Duty freezes, Full-day MP and the weekly review run.

## Work CRM
- **Work tabs.** Up to 3, each with its own data. Work pays no XP and has no game elements.
- **Agenda.** Overdue, Today, Upcoming, Later and Done. Each row has Done, Snooze, Call and Text.
- **Scheduled tasks.** Each has a channel, a customer, a collection and a reminder. Done can also write an entry to the customer's history.
- **Reminders.** The in-app banner (while a page is open) and the bell work with no setup. *Web push is built but needs setup.*
- **Live search** of customers and tasks runs in the browser as you type.
- **Customers.** ID, status (Lead, Prospect, Customer, Inactive), tags and contact details. Each customer page has Overview, Tasks, Check, Info, History, Orders and Deals.
- **Check tab.** A dated log of Rate, Home and Work notes per customer.
- **Task collections** group a customer's tasks, show progress, and can link to an order.
- **Follow-up alerts** per tab: off, or 7–90 days without contact.
- **Deals pipeline.** New, Quoted, Won, Lost, in AUD. A Won deal can create one order.
- **Order list** with an Ordered tick.
- **Work Tasks board.** The same board as the personal one, without the game parts.
- Old call backs and customer tasks were carried over, and old links still work.

## Character & progression
- **Character sheet (/you).** Level, title and epithet, crest, MP balance, a 13-attribute radar with last week's outline, day cards, life tracks and a month calendar.
- **Character level** is depth-first: your best Field or track level counts in full, the next one half, and so on. Titles run in 12 bands from Novice to Archon. Owning Ultimate emblems replaces the title.
- **Life tracks (Body, Duty, Craft, Care).** Ticks pay track XP. A kept week needs 3 active days and 30 raw XP. Body also needs 150 effort minutes. A kept week mints 18 MP and raises the track's level cap.
- **Daily streak.** Any counted activity keeps it. Seals at 7, 30, 100 and 365 days.
- **Emblem tree.** 749 emblems across 13 attributes, unlocked with MP once attribute gates are met. A 10-slot loadout where set bonuses matter: one emblem alone gives only 15% of its effect.
- **MP.**
  - Earned from reviews, mastery, a written attestation graded by Gemini (*needs the key*), kept weeks, goals, chests and roadmap pay.
  - Spent only on emblems.
  - Decays after 10 idle days, but only while an emblem is affordable and not bought.
- **Debuffs and boons.** Shaken, Doubt and Stagnation, plus a boon you choose after each Boss win. They are never random and expire on their own.
- **Momentum** (live since 12 Oct):
  - Three quests a day and a daily chest (odds published, a guaranteed rare after 10 chests without one)
  - an 8% crit chance and chains on task ticks
  - a momentum run with freezes
  - a Life skill tree of 27 perks across Discipline, Pathfinder and Vitality, with a free respec every 30 days
  - 12 cosmetics
- **Evening nudge.** The bell warns from 18:00. *The push version needs setup.*
- **Celebrations** in four tiers, a Moments archive (Ascensions can be replayed) and a Stats page.
- *Partial:*
  - Capital builds up and can be claimed, but nothing spends it (augments cannot be bought).
  - The background sky appears only inside each /skills path header.
  - The FATIGUED debuff is never applied.

## Body
- **Weight.**
  - One reading per day, 20–400 kg, shown in kg or lb.
  - A smoothed trend, a weekly rate after 5 readings, a 90-day chart, and a target with a projected date.
  - You can log from the capture line: `weight 72.4`.
  - Weight never pays XP, by design.
- **Walks.** Incline, distance and duration, with live speed, pace and climb. There is no edit, only delete and log again.
- **Walk pay (BODY XP).**
  - Intensity comes from a standard walking energy formula. A day's walks pay at most about 34 raw XP.
  - Only walks dated today or yesterday pay.
  - Over 9 km/h or under 5 minutes pays nothing.
  - Slow flat walking counts as Light: half the pay weight and no effort minutes.
- **Also:** personal bests (+15 XP once you have 3 earlier walks), a walk can complete today's exercise habit, the Body quest in the three daily quests, and Vitality perks.
- *Gaps:*
  - Walking is the only exercise kind you can log.
  - There is no Health Connect import (you dropped it).
  - The Body pages don't show track level or effort minutes against the 150 needed.

## Platform & shell
- **Navigation.** Three sections (Ideas, Tasks, Body) plus a profile menu. The layout changes at 600 px and 1280 px.
- **Keyboard shortcuts.** `c`, Alt+N, `i`, `y`, `g`+key to jump, `r`, `?` and `/`. They are checked against about 170 browser shortcuts so none clash.
- **Capture sheet** on every page, in the mode of the current section. If the network fails, a line retries 4 times.
- **Asks bell.** It is worked out live from your data: due cards, fading ideas, level drops, musts, momentum at risk, a ready chest, work tasks due, quotas, Bosses, boons and debuffs.
- **Settings.** Theme (*Vellum is partial*), motion, sound, haptics, capacity, push, work tabs and resets.
- **Also:** a power saver and a first-run tour.
- **Installable as a web app (PWA)** with 4 long-press shortcuts. *There is no offline mode.*
- **Two daily jobs on Vercel.** One handles forgetting (00:00 UTC). The life job runs at 18:15 UTC and needs CRON_SECRET.
- Dev and production share one database, and migrations are applied by hand.

## Android app
- A native app (com.xtnl.app v2.0). It uses 11 routes under /api/mobile/v1 that run the web's own code, so XP and grading match. A resent write is never paid twice.
- **Check tab.**
  - The Must, Planned and Habits lanes. Tap to tick, long-press for the minimum version.
  - Undo works only for ticks made since the app was opened.
  - Due work items with Done, Call and Text, plus your level and streak.
- **Review tab.** Every format except Diagram. Formulas render offline. It always reviews all Fields, 20 cards at a time.
- **Log tab.** A quick line for a task, weigh-in or idea draft, with a live preview. A New idea form with all 7 formats, but no other wordings.
- **Feel.** Fold layouts (front screen, main screen, book, tabletop), motion Full/Calm/Still, sounds made in the app, and haptics.
- **Settings.** Server address, API token (sealed on the device), theme and a Demo mode. The last Check stays readable offline.
- **Everything else** opens in an embedded copy of the web app. Launcher shortcuts and deep links work.
- *Limits:*
  - no notifications and no offline write queue
  - debug APK only
  - no walk logging; the roadmap, CRM details, momentum and emblems are web-only
  - celebrations from ticks are not shown
  - downloads in the embedded web app do nothing

## Not live yet / gaps

| Switch | State |
|---|---|
| LIFE_LAUNCH_DAY | live since 2026-10-01 |
| MOMENTUM_LAUNCH_DAY | live since 2026-10-12 |
| DUTY_LAUNCH_DAY | null (off) |
| ROADMAP_GOALS_LIVE (Start) | false |
| ROADMAP_GEMINI_LIVE / ROADMAP_GAPS_LIVE | false |
| TOPIC_* (topic maps, Break it down) | true |

1. **Production is open.** There is no login, and anyone with the URL can read and write.
   - MOBILE_API_TOKEN is reportedly unset, so /api/mobile/v1 is open too.
   - /api/debug/queries is open.
   - /api/cron/degrade has no protection unless CRON_SECRET is set. Whether it is set can't be confirmed from the code.
2. **The Duty economy is off.** That covers debt, settlement, rest/sick/vacation days, Duty freezes, Full-day MP, the weekly review run, and Close the day's note and mood. Before launch:
   - Run the settlement guard SQL on Postgres for the first time.
   - Get scripts/duty-rehearse.ts to pass.
   - Re-pin duty-check, which currently requires the switch to be off.
   - Pick a launch day that is a Monday and apply it with scripts/duty-launch.ts.
3. **Roadmap Start is hidden**, so accepted plans produce no Today tasks, pay, week quests or progress readings. The surveys also infer that the Review focus card cannot move past layer 1 of a topic map.
4. **Web push is not set up.** It needs:
   - VAPID keys and REMINDER_DISPATCH_SECRET in Vercel, then a redeploy
   - something that calls the dispatcher every minute. The plan is Supabase pg_cron + pg_net (docs/life-plan/reminders.md); Vercel Hobby can't run a job every minute.
   
   Before the first run, mark old reminders as sent, or about 50 old ones will push at once. Until then, reminders and the evening nudge reach you only while the app is open. The Android app has no notifications at all.
5. **A lot depends on GEMINI_API_KEY:** filing ideas, task sizing, attestation, Break it down and multiple-choice suggestions. It runs on the free tier, so Google may use the data. Topic name quality is not fully proven: one test found 1 made-up name in 94.
6. **Gemini level-plan drafting and area suggestions** stay off until their quality checks pass.
7. **Migration records.**
   - As of 11 Oct, life_exercise_style may still need `prisma migrate resolve --applied`. Whether that has been done since can't be confirmed.
   - Whether the newer idea migrations are applied can't be confirmed either.
8. **Ideas:**
   - Diagram cards cannot be created.
   - Ideas cannot be archived; Delete is the only way to remove one.
   - Enrichments, endorsements and linked ideas are not shown anywhere.
   - Multiple-choice options are never shuffled, so the right one always sits in the same place.
   - An idea's collection cannot be changed.
   - Fields and Domains cannot be renamed, deleted or merged, so near-duplicate Domains can pile up.
9. **Goal metrics** for reviews, ideas, workouts and running km are "not measured". Only linked tasks, a number in the title and roadmap goals measure progress.
10. **CRM:**
    - There is no view for archived tasks, deals or orders; only the Undo toast brings them back.
    - Read limits are silent: 600 open tasks per tab, 200 rows of each kind per customer, 1,000 deals and 2,000 orders.
    - There is no CSV import or export.
    - Follow-up alerts appear in the app only.
11. **Android** has no release signing, no offline write queue, and its weigh-in preview is looser than the server, so a line it accepts can still be refused.
12. **Small integrity gaps.**
    - The review combo comes from the browser and is only clamped.
    - The Review page loads the whole library on every request.
    - MOMENTUM_SEED_SECRET is not documented in .env.example, and without it the chest and crit rolls may use a guessable salt.
13. **Docs are out of date.**
    - momentum.md still says "nothing built".
    - Roadmap comments still say only 1 goal is allowed.
    - Steps 7–11 of setup-and-risks.md describe features you dropped.
    - The PROGRESS.md heartbeat line is stale.

**Scale:** 46 pages, 25 route handlers and 28 server-action modules. 54 Prisma models and 37 migrations. 65 check scripts in the two gates (ui:check 24, life:check 41). 132 Android unit tests.