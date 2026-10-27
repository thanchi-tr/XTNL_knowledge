# XTNL mobile API (v1): the contract between the server and the Android app

The native Android app (`android/`, package `com.xtnl.app`) talks to the web app's server through these JSON routes.
Every route is a thin wrapper over a core the web app already uses (the same rules, XP, grading and caches), so a
tick, an answer or a log from the phone is exactly the same deed as one from the browser.

- Base: `<server>/api/mobile/v1`. The production server is `https://xtnl-knowledge-xpis.vercel.app`.
- **Auth:**
  - When the server has `MOBILE_API_TOKEN` set, every request must send `Authorization: Bearer <token>` (the scheme
    in any case). A missing or wrong token gets `401 {ok:false, code:"auth"}`. The comparison is constant-time.
  - With no token set (or a blank one), the routes are open, the same as the web app (single user, `DEFAULT_USER_ID`).
- **Responses:**
  - Always `application/json`, never cached (`Cache-Control: no-store`).
  - Success is `{ "ok": true, "data": … }`. Failure is `{ "ok": false, "error": "<a line the app can show as is>", "code": "auth" | "bad" | "gone" | "conflict" | "recorded" | "server" }`, with status 401 / 400 / 404 / 409 / 409 / 500.
  - `bad` (400): the request itself is wrong (a missing or mistyped field, an unknown field, a bad id). `gone` (404):
    the row no longer exists. `conflict` (409): a rule of the core refused it (too late to undo, not due, archived,
    a clientId reused for another body); the line is the core's own. `recorded` (409, `/review/answer` only): a
    repeat of an answer the server already recorded for that clientId; nothing was written or paid again, so the app
    counts it as answered and moves on (see `POST /review/answer`). `server` (500): it failed on the server (the
    line never carries an error message or a stack).
- **Inputs:**
  - A body is a JSON object of at most 256 KB. A field a route doesn't list is refused (`bad`), so a misspelt key never
    passes as "left out". An optional field may be left out or sent as `null`; both mean absent.
  - Ids are the server's row ids (1–64 of `A–Z a–z 0–9 _ -`). A GET refuses query parameters it doesn't list.
- **Times:**
  - Instants are ISO-8601 UTC strings.
  - Days are `YYYY-MM-DD` life days in Australia/Sydney. The life day turns at 04:00.
  - `now` in every response is the server's clock, and the app uses it for "overdue" and "in 20 min".
- **Writes:**
  - Every write takes an optional `clientId` (a UUID the app generates; send the same one on every retry of one
    request). For 10 minutes the server instance that answered keeps the first successful result for it, and a
    retry gets that result back without the write running again (a retry still running joins the first). The same
    clientId with a different body gets `409 conflict`. Failures are not kept: a retry after one runs again.
  - Across server instances, and after a failure that came after the write, the cores' own guards hold: a tick is
    paid once (a repeat answers "Already recorded"), a logged line is saved once per clientId (it is the line's
    capture key), a review answer lands once per clientId (its ledger row is keyed by it; a repeat answers
    `409 recorded`), a Mall purchase lands once per clientId (its ledger row is keyed by it: `POST /mall/buy`
    requires one) and an undo once per purchase, a make-up once per debt (`POST /tasks/makeup` requires a clientId; a
    repeat answers `duplicate`), Done and Reopen are idempotent, a repeated new idea is merged into the first by
    dedup, a check-in lands once per clientId (`POST /checkin` requires one: its row is keyed by it, and a resend with
    the same values answers the first row, `duplicate`), its undo is harmless twice (one already gone answers
    `deleted` 0), and a set lands once per clientId (`POST /lift/set` requires one: its row is keyed by it, and a resend
    answers the set it wrote, `duplicate`).
  - Writes revalidate the same cache tags the web actions do (they run the same actions).
  - The app's offline queue (blueprint P8, decision D34) leans on these rules. A tick, a quick line or a work item's
    Done that gets no answer at all, and every tick on the cover-screen widget, waits on the phone and is sent again
    with the same clientId and the same body as its first try, so it lands once. Only `POST /tasks/complete`, `POST
    /log`, `POST /work/done`, `POST /checkin` and `POST /lift/set` ever wait (the queue's kinds TICK, LOG, WORK_DONE,
    CHECKIN and SET); a review answer never does. A check-in carries its own instant `at` and a set its own `doneAt`,
    each fixed at the tap, so one sent late is booked when it was made (see `POST /checkin` and `POST /lift/set`). A
    tick carries its row's own life day as `day`
    (`"YYYY-MM-DD"`: the `day` of the `/check` the row was shown on, its `yesterday.day` for a Yesterday row, the
    widget's cached board's too) from its first try, so one made before 04:00 books on that day when it lands after,
    and a board read before 04:00 and tapped after it books its row on the row's day, as the web board's does (the
    server still books only today or yesterday, and refuses an older day). `POST /log` has no day: a line waits only
    while its day is the server's (`/check`'s `day`, read before the app sends one; fixed at the tap, before the
    send), and one from an earlier day is kept back on the phone for the user, never saved on the new day. A kept-back
    line got no answer, so its first try may have landed; a done-now line that ticked a row then wrote no row under its
    capture key, so sent again on the new day it would tick that day's row too, and the app says the line may already
    be saved before the user sends it. While `/check` gets no answer, the lines wait and the ticks and Dones behind
    them still go.
- **Errors:** the app keeps what the user typed on any failure.
- **Check-in values (health phase 2; decision D9):** a check-in's values (its valence, energy, stress, word and tags)
  travel only in `POST /checkin`'s body, and come back only in that answer's `words`. They are never in a URL or a
  query string, in `/check` (its `checkin` block is a switch and counts), on the cover widget, the tile, a notification
  or the lock screen, in a push payload or a log line, and never reach Gemini. Production has no login: set
  `MOBILE_API_TOKEN` so these routes are not open.

## Endpoints

| Method | Path | Wraps |
| --- | --- | --- |
| GET | /check | the Today board's read and its Yesterday lane, the Review hub's counts and its fatigue, the shell's level, the work tabs' due tasks, the week audit, the credits wallet, the owed cards, the idle skills and attributes, the check-in's counts (Mind's view, never a value) and the open lift (Train › Exercise's read) |
| POST | /tasks/complete | `completeTask` (actions/tasks.ts) |
| POST | /tasks/undo | `undoCompletion` (actions/tasks.ts) |
| POST | /tasks/start | `startTaskTimer` (actions/tasks.ts), a proof task's timer |
| POST | /tasks/stop | `stopTaskTimer` (actions/tasks.ts), its stop |
| POST | /tasks/makeup | `makeUp`, `doMinimum`, `acceptLoss` and `undoMakeUp` (actions/duty.ts), an owed card's actions |
| POST | /work/done | `doneScheduledTask` with no log (actions/scheduled-tasks.ts) |
| POST | /work/reopen | `reopenScheduledTask` (actions/scheduled-tasks.ts) |
| GET | /review/queue | the Review hub's due cards in the runner's order, and the fatigue in effect |
| POST | /review/answer | `submitReview` (actions/review.ts) |
| POST | /log | `createFromCapture` (actions/capture.ts) |
| POST | /log/undo | `undoCapture` (actions/tasks.ts), `undoWeightCapture` (actions/capture.ts) |
| GET | /ideas/meta | the New idea form's formats and collections |
| POST | /ideas | `submitIdea` (actions/ideas.ts) |
| GET | /quests | the main quest, this week's sprint and Today's three (Today's own reads: `loadMainQuestCard`, `loadMainQuestWeek`, `loadMomentum`); read only |
| GET | /status | the five attributes, Capital's reading, the avatar targets and the skills, the /you Status card's and You › Skills' (their own reads: `loadLifeTracks`, `loadKnowledgeRow`, `loadCapitalDeals`, `loadAvatar`, `loadSkills`); read only |
| GET | /mall | You › Mall's catalog, its purchases and the credits over it (its own read: `loadMall`); read only |
| POST | /mall/rewards | `addReward` (actions/mall.ts), the Add sheet's save |
| POST | /mall/buy | `buyReward` (actions/mall.ts), Buy's Confirm |
| POST | /mall/undo | `undoBuy` (actions/mall.ts), a purchase's Undo |
| POST | /exercise | `ingestHealthCore` (health-ingest-server.ts): Health Connect's walks, hikes and weigh-ins, through `logWalkCore` and `logWeightCore` |
| POST | /checkin | `logCheckCore` (mind-server.ts), the 5-second check-in (actions/mind.ts `logCheck`'s core) |
| POST | /checkin/undo | `deleteCheckCore` (mind-server.ts), the receipt's Undo (actions/mind.ts `deleteCheck`'s core) |
| POST | /lift/set | `logSetCore` (training-server.ts), the lift logger's "Set done" (actions/training.ts `logLiftSet`'s core) |

## GET /check: the quick check (the app's home)

```json
{ "ok": true, "data": {
  "now": "2026-10-21T00:12:00.000Z", "day": "2026-10-21", "dayLabel": "Wed 21 Oct",
  "tasks": [
    { "templateId": "…", "title": "Gym legs", "lane": "MUST" | "HABIT" | "TASK",
      "status": "OPEN" | "DONE" | "DONE_MVV" | "SKIPPED" | "HELD" | "LOCKED",
      "minutes": 60, "mvv": "10 squats" | null, "icon": "dumbbell" | null,
      "dueLabel": "by Fri" | "late 2d" | "from Tue" | null, "xpHint": 8.3 | null,
      "proof": false, "timer": { "sessionId": "…", "templateId": "…", "day": "2026-10-21", "startedAt": "…",
        "endedAt": "…" | null, "running": true, "priorMinutes": 0 } | null, "pages": { "target": 30 } | null,
      "side"?: true, "expiresDay"?: "2026-10-23" }
  ],
  "tasksSummary": { "open": 3, "done": 2, "allDone": false },
  "yesterday": { "day": "2026-10-20", "dayLabel": "Tue 20 Oct",
    "line": "Anything you tick pays at the full rate, record by 04:00 tomorrow.", "open": 2,
    "tasks": [ { "templateId": "…", "title": "Stretch", "lane": "HABIT", "status": "OPEN", … } ] },
  "daily": { "kept": 3, "total": 4, "full": false, "cap": 5, "minimum": 1, "over": 0,
    "quests": [ { "templateId": "…", "title": "Gym legs", "kept": true, "minimum": true } ] },
  "review": { "due": 12, "doneToday": 4, "target": 20, "nextDueAt": "…" | null, "fatigued"?: { "until": "…" } | null },
  "fading": { "ideas": 5, "forgetting": 1, "domains": [ { "id": "…", "name": "Probability", "ideas": 3 } ] },
  "auditOn": true,
  "week": { "weekKey": "2026-W43", "label": "Week of 19 Oct", "rate": 86, "kept": 26, "due": 30, "minimum": 3,
    "skipped": 2, "held": 0, "open": 0, "short": 0, "target": 85,
    "status": "provisional" | "frozen" | "final", "calibrating": false, "asOfDay": "2026-10-26" | null,
    "decaying": { "count": 4, "unread": 0, "top": [ { "kind": "domain", "title": "Probability fell to L3 (from L4)",
      "detail": "2 ideas fading in it. Reviewing them brings the level back." } ] } | null,
    "side"?: { "done": 1, "offered": 2 } } | null,
  "calibration"?: { "weekKey": "2026-W45", "label": "Week of 2 Nov",
    "sizes": { "move": 30, "any": 3, "line": "Move 30 min · Finish any 3 tasks", "basis": "Nearly every daily quest was kept last week: a little more." },
    "capacityNote": "…: your 240 min a day stands." | null,
    "changes": [ { "id": "capacity" | "ease:…" | "step:…", "kind": "capacity" | "ease" | "step-up", "title": "Plan 195 min a day",
      "basis": "A median of 230 tracked min a day over 4 weeks, …", "state": "open" | "accepted" | "gone", "line": "…" | null } ] },
  "credits": { "balance": 120, "today": 40 } | null,
  "dutyOn": false,
  "owed": [
    { "instanceId": "…", "templateId": "…", "title": "Stretch", "archived": false, "day": "2026-10-19",
      "dayLabel": "Mon 19 Oct", "debt": 4.2, "restoreBy": "2026-10-21", "restoresToday": true, "restoresStreak": 12 | null,
      "rate": 0.85, "makeUpXp": 3.5, "minimum": { "label": "10 pushups", "xp": 1.1 } | null, "studyLinked": false,
      "canAcceptLoss": false,
      "proof": { "minutes": [15, 30, 45] | null, "pages": { "target": 30 | null, "chips": [10, 20, 30] } | null } | null,
      "when": "Stretch · Monday", "text": "Monday's Stretch is still open. 10 min makes it right.",
      "window": "Within Thu 04:00 it brings back its streak of 12." }
  ],
  "skills"?: [ { "kind": "attribute" | "skill", "name": "Body", "condition": 0.818, "idleDays": 13 } ],
  "work": [
    { "id": "…", "boardId": "…", "boardName": "Acme Sales", "title": "Call Jordan back",
      "dueAt": "…", "allDay": false, "channel": "CALL" | "VISIT" | "EMAIL" | "MESSAGE" | "OTHER",
      "overdue": true, "collection": "New NBN service" | null,
      "customer": { "id": "…", "name": "Jordan Lee", "number": "1042", "phone": "0412 345 678" | null } | null }
  ],
  "level": { "level": 1, "title": "Novice", "progress": 0.75 } | null,
  "streak": { "days": 12, "keptToday": true, "freezes": 2, "restTokens": 2 | null,
    "multiplier"?: { "value": 1.16, "fullDays": 3, "floor": false, "line": "Streak ×1.16 · day 3" } } | null,
  "checkin": { "live": true, "lastAt": "2026-10-21T03:32:00.000Z" | null, "todayCount": 2, "paused": false },
  "lift"?: { "sessionId": "…", "label": "Push day" | null, "startedAt": "2026-10-21T07:58:00.000Z" | null,
    "next": { "entryId": "…", "movementKey": "bench_press", "name": "Bench press", "ord": 3,
      "kind": "WARMUP" | "WORKING" | "DROP" | "MINI", "weightKg": 60 | null, "reps": 8 | null, "durationSec": null,
      "distanceM": null, "amrap": false, "unit": "kg" | "lb", "fromLast": true, "setText": "60 kg × 8" | null,
      "ghostLine": "last 60 × 8" | null } | null }
} }
```

- `tasks`: today's personal board (never a work tab's), the web board's three lanes in its order: Must (`MUST`),
  Planned (`TASK`: the one-offs) and Habits (`HABIT`: anything with a repeat rule), each in the board's own order.
  Every row not done comes first, then the done ones (the web's Done today).
  - `status`: `DONE_MVV` is done at the minimum version; `HELD` is held by today's rest, sick or vacation day (it
    asks nothing today); `LOCKED` is a study task that completes itself from the day's reviews (no tick).
  - `minutes` is the row's estimate. `mvv` is the minimum version's text. `icon` is the chosen icon, null for the
    default. `dueLabel` is the board's own label (a deadline's "by Fri" or "late 2d", a carried task's "from Tue").
  - `xpHint`: a row not done, what a tick at the estimate pays now (the board's ≈ figure); a done row, what it paid
    (null when unknown). Life XP, to one decimal.
  - `proof` (blueprint 2.6, P23; decision D20): a full tick of this row needs its minutes or its timer (a deep-work
    task marked proof: `#proof`, or the deep-work set the user approved). The app's tick on such a row opens its
    minutes sheet instead (unless its timer has run), and `/tasks/complete` without `minutes` or a timer is refused
    with "Log the minutes: …" (409). The minimum version and every other row still tick in one tap. False on every
    row while proof of work is switched off (`PROOF_LAUNCH_DAY`, null until the user's go).
  - `timer`: the row's open timer (`POST /tasks/start`): `running` while it runs, else stopped (`endedAt`) and waiting
    for the tick that counts it. It is a row on the server, so it survives an app restart and another device. Its
    minutes are `priorMinutes` (the segments before a Stop and a later start, a Resume, the same day) plus its latest
    segment's `startedAt` to its `endedAt` (or now). `day` is the life day it started on: today's row carries today's
    timer, or one still running from yesterday (it ran across 04:00); such a timer, or one past twice the estimate,
    is not counted in one tap (the app opens the sheet first, where Done counts it). Null with none, and always
    while proof of work is switched off.
  - `pages` (blueprint 2.7, P24; decision D21): a reading task (captured with its pages, `read 30 pages` or `30pg`;
    `30p` is still 30 minutes). Its full tick reports the pages read (`proof` on `/tasks/complete`), at least `target`
    when it has one (null: the pages are optional), so the app's tick on such a row opens its pages sheet instead. The
    minimum version still ticks in one tap. Null on every other row, and on every row while proof of work is switched
    off (`PROOF_LAUNCH_DAY`).
  - `side` and `expiresDay` (blueprint 2.5, P31; decision D35): the row is a side quest, and `expiresDay` the life day
    it expires after. Its `dueLabel` says so ("Side quest · expires Fri", "· expires today"); the app draws it in ink
    with the side-quest glyph, never in a lane colour. A side quest is an ordinary one-off (lane `TASK`): it pays its
    normal price, is never a must and never carries debt, asks nothing of the day while open (it is never counted in
    `tasksSummary.open`), and once its day is over it is simply gone, at no cost: a tick after that is refused ("This
    side quest expired at the end of Fri. Letting it go costs nothing.", 409). At most 2 are open at a time. They
    come from a `#side` line (`POST /log` reads it as the web does: a third open one is saved as an ordinary task) and,
    once `SIDE_QUESTS_LAUNCH_DAY` is in force (null until the user's go), from the server's own detectors. Both keys are
    absent on every other row.
- `tasksSummary`: the board's own counts: `open` the Must and Today rows still open or locked (a held row and a side
  quest are not open), `done` the rows above done today, `allDone` the web's "Board clear" (nothing open, at least one
  done).
- `yesterday` (blueprint 5.1b, P7; decision D34): the web's Record yesterday sheet, its first list: what was due
  yesterday and is still recordable (a habit or must expected that day, a deadline due that day), and what was recorded
  for it this morning (so its tick can still be undone). Always sent.
  - `tasks`: each row in `tasks`' own shape, every row not done first. `lane` is the row's colour code (`MUST` a must,
    `HABIT` anything with a repeat rule, else `TASK`); `xpHint` is what a tick for yesterday pays now, priced against
    yesterday's own ledger at T 1.00: the record window's promise, so a deadline due yesterday is on time here and late
    on its today row. A row has no `timer` (a timer only times today); a `proof` row's tick for yesterday takes its
    `minutes` (the sheet's chips), a `pages` row its pages. Tick one with `/tasks/complete` and `day: "yesterday"`.
  - `open`: the rows still to record (the web's "Yesterday: 2 to record"). `line` is the sheet's own line: "Anything
    you tick pays at the full rate, record by 04:00 tomorrow." ("… this morning" after midnight; Duty's own words once
    it is live: "Tuesday is settled. …").
  - Empty `tasks` and `open` 0 when nothing is left to record, and once yesterday is settled or a rest token covers it.
    Settling yesterday, its rest token and the sheet's "Something else you did yesterday?" list stay on the web.
- `daily`: the daily quests (the user's musts, at most 5 due on a day; decisions D14 and D15), as the web's Must
  lane counts and draws them ("Daily quests · 3 of 4 kept" and its strip). Binary is a status only: XP stays graded.
  - `quests`: one cell per quest, in the lane's order: the musts that ask today (a held or skipped one asks nothing),
    then today's musts a defer or an abort hid (each not kept). `kept` is true once it is done, the minimum version
    included; `minimum` is true when it was kept at the minimum.
  - `kept` of `total` is the lane's count. `minimum` counts the quests kept at the minimum ("1 at minimum": each
    still counts as kept). `full`: every quest kept (false with none). `cap` is the cap (5). `over`: musts past the cap
    today, counted as the cap counts them (a must due today, a planned one-off on its day, a weekly or monthly target
    must; one carried from an earlier day is a quest here, never over the cap); a day already over it keeps its musts
    ("1 over the cap").
- `review`: the Review hub's figures: `due` every card due now (including any DIAGRAM card, which the app can't
  show), `doneToday` today's reviews, `target` today's review quest target (fixed by the day's first open, at most
  20), `nextDueAt` when the soonest card not yet due falls due.
  - `fatigued` (blueprint 3.3b, P30; decision D26): review fatigue, present only while it is in force
    (`FATIGUE_LAUNCH_DAY`, null until the user's go); absent otherwise, so the object reads exactly as before. Once a life
    day's answers reach 200 (its review rows, one per answer, right or wrong), the server applies Fatigued once that day:
    the combo ceiling × 0.5 (10 answers in a row become 5) for 18 hours. `until` is when the one in effect lifts; null
    with none in effect, and when it couldn't be read. It is never applied for a miss, a quiet day or a missed day, and
    there is no sleep rule. It changes only the combo multiplier an answer is paid at (each answer's own `multiplier`
    already carries it): never a card's level, life XP, MP or a streak.
- `fading`: the ideas past their grace (blueprint 3.1a; decision D23), as the web's bell line "5 ideas fading" counts
  them. Each card keeps its own forgetting curve: past its grace its recall falls a little every day, and it loses a
  level for every 7.5 points of recall lost. The grace is never under 3 days past due (the 72 h floor), so nothing
  fades within 72 hours of falling due. `ideas` counts the cards past grace, `forgetting` those of them already losing
  levels, `domains` the Domains they sit in, most first, each with its count. Reviewing a card brings it back (each is
  among `review.due`). With none past grace: 0, 0 and []. Read at the loadout's grace extension (none when it couldn't
  be read).
- `auditOn`: the weekly audit is switched on (`AUDIT_LAUNCH_DAY` in force: false until the user's go). It is the
  switch alone, never a read, so it is true from the launch day on, before the first audited week has a `week`, and
  stays true when the audit couldn't be read. The phone's Sunday reminder follows it.
- `week`: the weekly audit (blueprint 5.2a and 5.2b; decisions D12, D15, D16, D17 and D38), as the web's Week audit
  card on `/today/week` states it. Null while the audit is switched off (`AUDIT_LAUNCH_DAY`, null until the user's go)
  or before its first week (until that week's Sunday 18:00), and when it couldn't be read.
  - The week shown: this week from Sunday 18:00 (Sydney), before that the week just ended. `weekKey` is its ISO week,
    `label` its Monday ("Week of 19 Oct").
  - `kept` of `due` counts the daily quests (the musts) exactly as the web's week strip on Tasks › Habits does: the
    minimum version counts as kept (`minimum` of them), a skip and a held day (rest, sick, vacation, a freeze) are left
    out of `due` and shown (`skipped`, `held`), and `open` counts the ones still recordable (in `due`, not kept).
    `rate` is `kept` of `due` as a whole percent, rounded down (null with none due).
  - `target` is 85 (whole percent), and it is shown only on the audit, never on Today. `short` is how many more kept
    would reach it (0 once met). `calibrating` is true for the first two audited weeks: the target is shown, not
    applied.
  - `status`: `provisional` is read live (from Sunday 18:00, or any week with no frozen copy); `frozen` is the copy
    the server keeps as of Monday 04:00 (`asOfDay` is the day it was frozen: that Monday, or the Tuesday when
    Monday's run missed it; it counts what was recorded by that day's 04:00, though the run reads a little later),
    which a later tick or make-up never changes; `final` is the same copy from the week's Wednesday. The audit pays
    nothing and judges nothing.
  - `decaying`: "Decaying this week" (blueprint 5.2c; P12), as the web card lists it: what fell over the week, read
    from what the server already keeps and never applied. `count` is everything found, `top` its first three lines
    (`kind` is `streak` a life track's kept-week run ended, `field` or `domain` a level lost this week, `habit` a
    habit's strength fell or dropped a rung, `ideas` the ideas past grace now, `condition` (P28, only once
    `DECAY_LAUNCH_DAY` is in force) an attribute or a skill below 100% condition, `trait` a trait below its score a
    week ago, `mp` mastery points lost to idle decay), in that order; on the web each line links to its fix.
    `unread` counts the sources that couldn't be read (left out, never guessed). A frozen copy keeps the decay it was
    frozen with. Null when it wasn't read.
  - `side` (blueprint 2.5, P31): the week's side quests, `offered` (added on a day of the week) and `done`, shown
    beside the rate and never in it (the web's "Side quests · 1 of 2 done · not in the rate"). A frozen copy keeps the
    count it was frozen with. Absent when the week had none.
  - The Sunday reminder (decision D37) is the app's own: a local notification on Sunday at 19:00 Sydney time,
    whatever zone the phone is set to, that opens `xtnl://app/week` (the web's `/today/week`). It is armed while the
    server's last `/check` said `auditOn` and Settings › Notifications has it on, so it is armed in the launch week,
    before the first `week` is sent, and a failed audit read never turns it off. It is exact when Android lets the
    app set exact alarms (Alarms & reminders); otherwise Android sends it within the hour after 19:00. No push, no
    endpoint.
- `calibration` (blueprint 5.2d, P32; decision D36): next week's calibration, as the web's Next week card states it
  (the weekly review's step 5, and Today on Mondays). Present only while one is in force for this life week; absent
  otherwise, so the reply reads exactly as before. One is in force only once the weekly audit is switched on
  (`AUDIT_LAUNCH_DAY`) and two weeks are frozen: each Monday's frozen copy then sets the week that starts. It is read
  only on the phone: Accept and Keep stay on the web.
  - `sizes`: Today's three for the week, set by themselves: BODY's Move `move` min (10, 20 or 30; never over 10 once
    the week's 150 effort minutes are met) and TASK's Finish any `any` tasks (2 or 3), the fallbacks when no exercise or
    big task is due. `line` and `basis` are the card's words. A quest set picked that week is stored with them and
    never re-sized; prices never change.
  - `capacityNote`: the capacity suggestion's reading when it changes nothing ("…: your 240 min a day stands"), else
    null.
  - `changes`: each suggestion, one tap on the web (Accept) or Keep. `kind` `capacity` plans the suggested minutes a
    day (the median of the daily tracked minutes over up to 4 frozen weeks, scaled by the share kept against the
    audit's target, in 15-minute steps, at least 120 and never above the capacity the user set); `ease` makes a daily
    quest kept under the target two frozen weeks running not a must (once Duty is live it waits 7 days, as any change
    that eases a must); `step-up` makes one Established habit a must (from today, never past 5 daily quests a day).
    `state` is `open` (on offer), `accepted` (it stands now, `line` says how: "Not a must from Mon 9 Nov.") or `gone`
    (its task left the board). What an Accept would do is said before the tap: an open `ease`'s `title` names the day
    it would take effect once Duty is live ("Floss: not a must from Mon 9 Nov"), and an open `step-up`'s `basis` ends
    with what a must costs once Duty speaks about musts ("As a must, ≈ −4.2 if missed."). A calibration set from one of
    the audit's two calibrating weeks keeps the standard sizes and the capacity unscaled (the median alone) and lists no
    `ease` or `step-up`. A Keep is the web browser's own note (nothing is sent for it), so a kept change still reads
    `open` here: show where the choice is, never a prompt to answer it. No rate and no target are sent here: those are
    the audit's alone (D17).
- `credits` (blueprint 4.1 and 4.2; decisions D27 to D29): the credits wallet, as the purse on the web's Character
  page shows it. Null while credits are switched off (`CREDITS_LAUNCH_DAY`, null until the user's go: the server
  reads nothing for it then, and the app shows no wallet chip), and when it couldn't be read.
  - `balance`: whole credits, earned less bought plus refunded (a Mall purchase spends its price; its undo gives it
    back). It is below zero only when an undone quest took back credits a purchase had already spent: shown as it
    is, never charged, and the Mall refuses a purchase until it is back at 0. `today`: what today's life day earned.
  - Credits are counted from rows the server already keeps, on every read; none is stored. They start at 0 on the
    launch day and nothing before it counts. Each of Today's three done earns 10 (an undo takes it back), the day's
    chest 10 more, a kept week 15 per track, a kept plan week 25, and a checkpoint 25, a milestone 100 and a goal
    10 / 40 × g / 120 × g only when it pays MP. XP is never spent, and no penalty ever takes credits. The web's rules
    page (`/today/rules#credits`) publishes the table once credits count.
- `dutyOn` (blueprint 2.3 and 3.2b, P22; decision D18): Duty is switched on (`DUTY_LAUNCH_DAY` in force: false until the
  user's go). It is the switch alone, never a read, as `auditOn` is. While it is false, `POST /tasks/makeup` is refused,
  so the app shows an owed card without its actions ("make it up on the web app").
- `owed` (P22; decision D18): every open debt, as Today's MakeUpCards list them (oldest first), each in the web card's
  own words. A must missed on a settled day owes min(20, B × E): at most 20 for one miss, at most 3 open debts for one
  task and at most 100 in all; a miss past a cap owes nothing. Nothing is owed for a day before Duty's launch day. A debt
  is life XP on Duty, never credits: no penalty takes credits. Empty with none (always before the launch).
  - `debt` is what is owed (positive, one decimal; the card prints "−4.2 owed"). `day` is the missed day and `dayLabel`
    its words; `when` ("Stretch · Monday"), `text` (one plain sentence, never a reproach) and `window` (the restore
    window, true when read) are the web card's lines. `archived`: the task was archived since ("Stretch (archived)").
  - A make-up always repays the whole debt and pays `makeUpXp` now: the task's price at `rate` (×0.85, the make-up
    timing factor) with no consistency bonus (C 1.00). Within two days of the missed day (`restoresToday`, until the
    end of `restoreBy`, and at most one restore per task in 7 days) it also counts the day as kept and brings back the
    task's streak (`restoresStreak`, in the rule's own unit; null with none); later it clears the debt only.
  - `minimum`: the minimum version's words and what its make-up pays (×0.3 of a full one; it still repays the whole
    debt and holds the day), null without one. `studyLinked`: a study must, whose make-up pays 0 and clears the debt.
  - `canAcceptLoss`: Accept the loss is offered (Settings › Days › Accept a loss is on, on the web, and the debt is at
    least 14 days old). The miss stays on the ledger and nothing more is owed.
  - `proof`: once proof of work is in force (`PROOF_LAUNCH_DAY`), what a full make-up brings, as the task's own tick
    does: a deep-work must's minute chips (`minutes`), a reading must's page chips and its day target (`pages`); null
    while the make-up is one tap (always while proof of work is switched off). The minimum version never needs any.
- `skills` (blueprint 3.1b, P28; decisions D24 and D24b): condition decay, present only while it is in force; absent
  otherwise, so the reply reads exactly as before. Every attribute and live skill whose condition is under 0.9, the
  lowest first. `kind` is `attribute` (named as on the Status card: Body, Knowledge, Craft, Duty, Care) or `skill` (the
  skill's own name); `condition` is 0.5 to 1, to 3 decimals rounded down (so the app's whole percent, also rounded
  down, is the web's: 0.5599 is sent as 0.559, 55% on both); `idleDays` the idle life days behind it. A condition is
  max(0.5, e^(−λ × (idle days − 3))): λ 0.02 for Body (and an exercise skill), 0.01 for Knowledge and Craft, 0.005 for
  Duty and Care. It is in force from the later of `DECAY_LAUNCH_DAY` and `DUTY_LAUNCH_DAY` (both null until the user's
  go: nothing is read), since a rest, sick or vacation day is declared and held only once Duty is live. A day is idle
  only once it is over and only from then; a rest, sick or vacation day and a rest token's day never are, and one
  practice (a tick on the track, a review or a new idea for Knowledge, a linked task's tick or, for an exercise skill,
  a walk) brings it back to 1 at once. It never moves a level, XP, hours or a title: the traits it feeds read lower
  while it is under 1, and an emblem they then miss is frozen (still owned, paused, thawed by one practice on the idle
  attribute; an emblem that guards a card's level never freezes). `[]` with nothing under 0.9, and when the read
  failed. The app shows it as "Body 81% · 13 days idle".
- `work`: the open scheduled tasks across the open work tabs that are overdue or due today, in the Agenda's order
  (Overdue first, then Today; soonest first, an all-day task before the timed ones of its day), at most 30.
- `level` (the character level, as the top bar shows it) and `streak` (the daily streak) are null when they couldn't be
  read; so is `work` an empty list. The board, the Field tree or today's review count failing fails the whole check
  (500).
  - `restTokens` (blueprint 3.2c, P21; decision D19): the one Rest Token bank, the web's "Rest tokens 2" chip on Today's
    Daily quests and on Character. It is the momentum freezes, under one name: 1 to start, one more every 10 momentum
    days (a chest's rare freeze and a kept Body week with Recovery add one too), at most 2 banked (3 with the Spare flame
    perk). A day spends at most one: a past day with nothing that keeps the momentum run, while a run is alive, spends
    one by itself; once Duty is live (`DUTY_LAUNCH_DAY`, null until the user's go) a settled day with a must still open
    spends one too and it excuses that day's missed musts. A rest, sick or vacation day spends none. Null while the bank
    is not live (before momentum's launch, or when it couldn't be read); a whole number of tokens otherwise, 0 included.
  - `freezes`: the same number (0 while `restTokens` is null), kept for apps built before it. It used to read Duty's own
    freeze balance, which nothing ever earned, so it was always 0.
  - `multiplier` (blueprint 3.2a, P29; decision D25): the streak multiplier, present only while it is in force
    (`STREAK_LAUNCH_DAY`, null until the user's go, and Duty live); absent otherwise, so the object reads exactly as
    before. `fullDays` is d, the judged Full days in a row (all three rings), counted back through the latest judged day:
    settlement judges a day two days on, or sooner when yesterday is settled early from Today; today is never judged,
    so a tick today never moves it. While it is in force the server runs Duty's lazy settle before the board's read (as
    Today does), so each `xpHint` reads the d its tick pays. A rest, sick or vacation day and a rest token bridge it
    without adding a day, and any other day that is not Full starts it again. `floor` is true when the run reached the
    server's read window, so it is at least `fullDays`. `value` is m(d) = min(1.2, 1.05^d) to two places, the C every
    full tick pays (one-offs included; never the minimum version, #play, a study task, a walk's pay, a make-up, a review
    or MP), so each row's `xpHint` already carries it. `line` is Today's chip in its words: "Streak ×1.16 · day 3", or
    "Streak ×1.00" before the first Full day. It is a separate count from `days` (the daily streak, any activity).
- `checkin` (health phase 2; decisions D1, D2, D9): the 5-second check-in's switch and counts, always sent. **It
  carries no value**: never a valence, an energy, a stress level, a word or a tag, because a cached `/check` can move
  between phones (the app's backup and device-transfer rules) and the widget draws from it. The server reads Mind's own
  view (the one Body › Mind and Today read) and keeps only these four, key by key.
  - `live`: the check-in can be drawn: `MIND_LAUNCH_DAY` is in force and the view was read. False before the launch,
    before the mind_checks migration and when the read failed (as Today then draws no Check in row); with it false,
    `lastAt` is null, `todayCount` 0 and `paused` false. A check-in sent anyway is the server's to refuse
    (`POST /checkin`).
  - `paused`: the user paused check-ins on the web (Body › Mind, a week or a month). The app draws no check-in row and
    no prompt while it is true. The pause hides the asks; it is not a lock (a check-in sent is still kept).
  - `todayCount`: how many check-ins today's life day holds; `lastAt` the newest one's instant (null with none). Neither
    says what any of them was. Only Check's row says when the last one was ("Checked in 14:32"), and only for today's
    life day; the cover widget and the tile show no time, no count and no value, just "Check in", and a notification
    (the phase 6 prompt) is neutral text ("Check in?"). No surface makes the count a target (no "2 today", no colour,
    no ask).
- `lift` (health phase 2; decisions D12, D14 to D19): the open lift and the set to do next, present only while a lift
  is open (absent otherwise, before the strength_sets migration and when the read failed, so the reply reads as before).
  It is Train › Exercise's own read (`loadLiftView`), which closes a lift left open past its life day at its last set,
  as opening the page does (no lift is open then). It rides on `/check` rather than a route of its own because Check's
  lift card draws from the app's cached `/check`, so the next set is there without a second request (a cover-widget row
  and an ongoing notification are later readers of it, in a later phase); `POST /lift/set` answers the same block after
  each set.
  - `sessionId` is what `POST /lift/set` names; `label` the lift's name ("Push day"; null with none); `startedAt` when it
    started.
  - `next`: the set to do next, by the web logger's own prefill (the rows the page shows before a tap). Each movement's
    rows still to do are its last finished lift's sets past the ones logged today, kinds and chains as they were and no
    outcomes (no RIR, no Failure); a movement with no set yet and no last lift has one empty working row. The next is
    the movement being worked's (the one with the newest set) while it has a row left, else the first movement in the
    lift's order with one. Null when every movement's rows are done: another set ("+ Set") and Finish stay with the
    user.
  - `ord` is the place the set takes (the movement's next); `kind`, `weightKg` (kilograms as stored; a bodyweight
    movement's signed added load: −20 is 20 kg of assistance), `reps`, `durationSec` and `distanceM` (a hold, a carry)
    and `amrap` are the row's. `fromLast` true: the figures are the last lift's set, so one tap ("Next: Bench press
    60 kg × 8 ✓") sends them as they are; false: there is nothing to copy (the figures are null) and the app asks for
    them first. `setText` is the set in the logger's words ("60 kg × 8", "24 kg per dumbbell × 10", "hold 1:05") and
    `ghostLine` its grey line under the fields ("last 60 × 8"), both in `unit` (the unit Body shows; kilograms are
    stored), null with nothing to copy.
- Before it reads, the server runs momentum's lazy writes, as Today does (the day's quest set first, so `xpHint` and a
  tick made from this check price today's frog); they return at once when nothing is owed. While the streak
  multiplier is in force (P29) it then runs Duty's lazy settle too, as Today does, so the rows' `xpHint` read the d
  their ticks pay (at once when the cursor is not behind, and nothing at all while the multiplier is off). After the reply it runs
  what opening Today and the Review hub owe: the day's first open fixes the review quest's target, study tasks the
  day's reviews have met are recorded, and life maintenance.

## POST /tasks/complete: check a due task

- Body: `{ "templateId": "…", "day"?: "today" | "yesterday" | "YYYY-MM-DD", "mvv"?: false, "minutes"?: 45,
  "sessionId"?: "…", "proof"?: { "kind": "PAGES", "qty": 30 }, "clientId"?: "…" }`.
- It runs through the same core as the board's tick (`completeTask`: its lock, pricing, momentum and celebrations).
  The server books only today or yesterday by its own clock: another day is refused (409). The app (from 2.18, P8)
  sends its row's own day key on every tick, as the web board does (from 2.19, the day of the board the row was shown
  on, not the phone's clock), so a retry or a replay from its offline queue is the same request.
- `day: "yesterday"` (blueprint P7) records a row of `/check`'s `yesterday` lane: it books on yesterday's life day, at
  T 1.00 (on time) until today's life day ends, against yesterday's ledger and knee, as the web's Record yesterday
  does. Only what the server would book for yesterday is accepted ("Only what was due yesterday can be recorded for
  yesterday.", 409); a day already settled is refused too. Its `line` ends `· yesterday`.
- `minutes` (blueprint P7's phone minutes, decision D34): what it took, a whole number from 1 to 480 (anything else is
  refused, 400). It is counted with the drawer's own clamp: between half and twice the task's effective estimate, and
  never above 480, so an estimate of 30 reported as 90 counts 60. Left out, the tick counts the estimate, as before.
- `sessionId` (blueprint P23): the timer this tick counts (`/tasks/start`'s), every segment of it. Left out with no
  `minutes`, a proof task's tick counts its own timer of that day that no tick has counted yet, if there is one. A
  timer is counted once; a named timer that is gone or already counted is refused (404), and one that is not this
  row's (today's timer named for another day) is refused with "That timer isn't this day's …" (409). On a proof task
  (`proof` on `/check`'s row) the minutes counted are the plan's min(reported, clock, 480): the report inside the same
  clamp, then the clock. A timer's count is bounded by the minutes it ran (a 20-minute timer counts 20); a report by
  the time since the task's previous tick the same day, when ticked live (a record of yesterday and a first tick are
  never cut). `minutes` sent with a timer open counts the minutes, and the timer is closed counting nothing. A full
  tick with no minutes and no timer is refused with "Log the minutes: …" (409). Its `line` then names the minutes
  counted (`+26.7 XP · Craft · 90 min`). Nothing here changes while proof of work is switched off.
- `proof` (blueprint P24, decision D21): a reading task's pages, `{ "kind": "PAGES", "qty": 30 }`, `qty` a whole number
  of pages from 1 to 2000 (any other shape, kind or field is refused, 400). On a reading task (`pages` on `/check`'s
  row) with a day's target, a full tick with fewer pages, or none, is refused with "Log the pages: …" (409); without a
  target the pages are recorded when given. The pages are recorded with the tick (its receipt and its instance) and
  never change its price; its `line` names them (`+4.1 XP · Care · 30 pages`). The minimum version needs none. On any
  other task, and while proof of work is switched off, `proof` is accepted and changes nothing. `30p` is still 30
  minutes in a captured line, never pages.
- Then it reads the board again, as the web's tick re-renders Today, for `allDone`, and the character's level (both
  reads also warm the next `/check`), and the skill the task feeds (`competency`, blueprint P5).

```json
{ "ok": true, "data": { "instanceId": "…", "xp": 8.3, "line": "+8.3 XP · Body", "allDone": false,
  "celebrations": [ { "tier": 1, "kind": "…", "title": "…" } ],
  "level": { "level": 7, "title": "Adept", "progress": 0.81 } | null,
  "competency": { "id": "…", "name": "Writing", "hoursAfter": 100.25, "tier": 2, "tierUp": true,
    "line": "≈ 100 h (task estimates, not timed)" } | null,
  "credits": { "delta": 10, "balance": 130, "today": 30 } | null,
  "knee"?: { "day": "2026-10-21", "raw": 214.6, "rate": 0.46, "capped": false,
    "line": "Fatigue breaker: past 200 raw today, so a tick now pays ×0.46 or less. The day stops at 300 XP." } } }
```

- `xp`: the life XP paid, to one decimal. `line`: `+8.3 XP · <track>` (Body, Duty, Craft or Care), with
  `· minimum` for the minimum version and `· yesterday` for a forgotten tick; a repeat of a tick already recorded
  says `Already recorded. Nothing is paid twice.` (and pays nothing). Once the streak multiplier is in force (P29;
  `streak.multiplier` on `/check`), a full tick above ×1.00 adds its C: `+12.0 XP · Craft · streak ×1.16`.
- `knee` (blueprint 3.3a, P7; decision D26): the knee note, present only once the day this tick booked on is past 200
  raw (its receipt's day total before the tick plus its raw); absent below it and on a repeat, so every other tick reads
  as before. The daily knee is the fatigue breaker every life XP shares: full rate to 100 raw a day, half rate at 200,
  and the day stops at 300 XP. `day` is the life day (a tick for yesterday reads yesterday's), `raw` that day's raw total
  after the tick (one decimal), `rate` the knee's rate there (two decimals, rounded down: what one more raw point pays
  now; less as the day goes on), `capped` once the day's 300 XP is reached (`rate` 0). `line` says it: "Fatigue breaker:
  past 200 raw today, so a tick now pays ×0.46 or less. The day stops at 300 XP.", or once capped "Fatigue breaker:
  today reached the day's cap of 300 XP. Ticks still count; they add no more XP today." It changes no price (the `xp`
  already carries the knee), and it is never a penalty.
- `allDone`: the board is clear after this tick (false when the board couldn't be read again).
- `celebrations`: L3's moments for the tick (a streak milestone, a habit rung, a finished goal …), every tier.
- `level`: the character's level after this tick, as `/check`'s `level` (null when it couldn't be read). The app steps
  its level seal by the difference, and plays a level up on the tick that earns it; with no `level` it refreshes
  `/check` instead.
- `competency` (blueprint 1.5; decisions D7 to D9): the skill this task's ticks count toward, as it stands after the
  tick: its `name`, `hoursAfter` (2 decimals), `tier` (1–4) and its hours `line`. `tierUp` is true when this tick
  played the tier's Seal (a `competency-tier` moment among `celebrations`; a tier re-reached never plays twice). Null
  when the task feeds no skill, or when the skill couldn't be read (never a failed tick). A skill pays nothing: the
  tick's `xp` is the whole payment.
- `credits` (blueprint P16): the credits wallet after this tick, whole credits. `balance` and `today` are the wallet
  read fresh once the tick has committed (never a cached read that left before it), as `/check`'s: the app sets its
  wallet chip from them, and never adds deltas up. `delta` is what was earned across the tick: the wallet's earned
  after it less its earned before it (10 when the tick finishes one of Today's three, 0 when it finishes none; a Mall
  purchase or its undo never counts in it). The two reads sit either side of the tick, not inside its lock, so
  another write that lands between them (a second tick from the phone, a tick on the web) counts in `delta` too: it
  is the change across this tick, never its receipt. The app names it on the tick's line (" · +10 cr") only when no
  other write of its own overlapped the tick, and reads `/check` again after overlapping ones. Null while credits are
  switched off (`CREDITS_LAUNCH_DAY`), and when either read failed: never a guessed figure, never a failed tick.

### POST /tasks/undo
- Body: `{ "instanceId": "…", "clientId"?: "…" }`.
- It runs `undoCompletion` and returns `{ "xp": -8.3, "level": { … } | null }` (the life XP taken back, 0 when it
  was already undone; and the character's level after it, as `/tasks/complete`'s).
  Past the ten-minute window, or on a day already settled, it is refused (409).

### POST /tasks/start
- Proof of work (blueprint 2.6, P23; decision D20): a task's timer, as the web row's "Start timer" (`startTaskTimer`).
- Body: `{ "templateId": "…", "clientId": "…" }`. The `clientId` is required here (a UUID): it is the start's key, so a
  retry starts the timer once and answers the same one.
- One timer runs at a time: starting one stops any other that runs (so two tasks never count the same minutes). A
  task's timer already running (started today or yesterday) is answered as it is; one left running from before that
  is stopped and a fresh one starts. A start on a task whose timer is stopped is its Resume: a new segment, counted
  with the earlier ones (`priorMinutes`). Two devices starting at the same moment both get an answer. It runs on a
  task or a habit on the personal board (not a goal, a work tab's task or a study task), and only while proof of work
  is switched on (`PROOF_LAUNCH_DAY`; before the user's go it is refused, 409).

```json
{ "ok": true, "data": { "timer": { "sessionId": "…", "templateId": "…", "day": "2026-10-21", "startedAt": "…",
  "endedAt": null, "running": true, "priorMinutes": 0 }, "line": "Timer started. Tick the task when you stop: the time it ran counts." } }
```

### POST /tasks/stop
- Body: `{ "sessionId": "…", "clientId"?: "…" }`. It runs `stopTaskTimer`: the timer stops, and its minutes wait for
  the tick that counts them (`/tasks/complete`, which also stops a running one). A stopped timer is answered as it
  stands; one that is gone is refused (404). A stop works even after proof of work is switched off again, so a timer
  never stays running.
- Returns `{ "timer": { … }, "line": "Timer stopped at 34 min. Tick the task to count them." }`, `timer` as
  `/tasks/start`'s with `running` false and its `endedAt`.

### POST /tasks/makeup
- Duty (blueprint 2.3 and 3.2b, P22; decision D18): an owed card's action, as Today's MakeUpCard runs it.
- Body: `{ "instanceId": "…", "action"?: "makeup" | "minimum" | "accept" | "undo", "minutes"?: 45, "sessionId"?: "…",
  "proof"?: { "kind": "PAGES", "qty": 30 }, "clientId": "…" }`. `instanceId` is an `owed` row's (for `undo`, the
  make-up's own: the instance it answered). `action` is `makeup` when left out: a make-up in full (`makeUp`), its
  `minimum` version (`doMinimum`), `accept` the loss (`acceptLoss`), or `undo` a make-up or a minimum (`undoMakeUp`).
  `minutes`, `sessionId` and `proof` are a full make-up's proof of work, exactly as `/tasks/complete` takes them (with
  any other action they are refused, 400). The `clientId` is required (a UUID, `bad` without it): send the same one on
  every retry of one action.
- Refused (409) while Duty is switched off (`dutyOn` false: "Duty hasn't started yet. Until then, make it up on the web
  app."), before anything runs.
- A make-up repays the whole debt and pays the task's price at ×0.85 with C 1.00 (the `owed` row's `makeUpXp`), dated
  today; within the two-day window it also counts the missed day as kept (`restored`, status `DONE_LATE`, or
  `DONE_MVV` for the minimum), else it clears the debt only (`MADE_UP`). Once proof of work is in force, a deep-work
  must's full make-up without its minutes, or a reading must's without its pages, is refused with the tick's own line
  ("Log the minutes: …", "Log the pages: …", 409); a make-up counts a timer only when it names it (`sessionId`).
  Accept the loss writes the debt off (status `WRITTEN_OFF`): its DEBT row stays on the ledger, nothing is paid, and it
  is refused (409) unless `canAcceptLoss` was true.
- Once per debt, on any server instance: a repeat of a make-up already recorded answers it with `duplicate` true
  ("Already made up. Nothing is paid twice."), and a debt already written off answers as written off. A debt that is
  not there is `404 gone` ("That debt no longer exists."); one no longer owed is `409` ("Nothing is owed there any
  more.").
- Then, as a tick's: the board read again (`owed`, the cards left, null when that read failed; `allDone`), the level
  after, and the credits across it (a make-up is today's work, so it can finish one of Today's three; null while
  credits are off). No penalty and no make-up ever takes credits.
- `undo` takes a make-up (or its minimum) back, as the web card's Undo does: within ten minutes of it, on the same life
  day (until its `undoUntil`). The debt is open again (status `MISSED`), the make-up's life XP is taken back (`xp`,
  zero or less) and the day's repair with it; "Make-up undone. It is owed again; nothing else changed.". A repeat
  answers the same. Past its window it is refused (409, the web's words); a make-up that is not there is `404 gone`
  ("That make-up no longer exists."). Accept the loss has no undo.

```json
{ "ok": true, "data": { "instanceId": "…", "action": "makeup" | "minimum" | "accept" | "undo",
  "status": "DONE_LATE" | "DONE_MVV" | "MADE_UP" | "WRITTEN_OFF" | "MISSED", "restored": true, "xp": 3.5, "debt": 4.2,
  "owedLeft": 0 | null, "clearedLast": true | null, "undoUntil": "…" | null, "duplicate": false,
  "line": "Repaid 4.2 and paid 3.5 exactly; its streak is back. Nothing is owed.",
  "celebrations": [ { "tier": 2, "kind": "…", "title": "…" } ], "allDone": false, "owed": [ … ] | null,
  "level": { "level": 7, "title": "Adept", "progress": 0.81 } | null, "credits": { … } | null } }
```

- `credits`, `level` and `celebrations` are `/tasks/complete`'s, read the same way. `xp`: the life XP the make-up paid (one decimal; 0 for Accept the loss). `debt`: the debt repaid or written off.
  `owedLeft` and `clearedLast`: the open debts left, and whether this cleared the last (Accept the loss reads them from
  the board read after it: null when that failed; an undo reads `owedLeft` the same way and `clearedLast` false).
  `undoUntil`: when the make-up's Undo closes (null for Accept the loss and for an undo, which have none). `line`: the
  web card's resolved words, then what is still owed ("1 still owed.", "Nothing is owed."); Accept the loss says
  "Its −4.2 stays in Duty XP; nothing more is owed.".

## POST /work/done and POST /work/reopen: a scheduled task (work tab)
- Body: `{ "id": "…", "clientId"?: "…" }`. Done uses the core behind the agenda's Done, without a history log;
  Reopen is Done's Undo.
- Returns `{ "id", "doneAt" }`: Done's instant (an already done task answers its own), and `null` after Reopen.

## GET /review/queue: the cards due now

- Query: `?limit=20` (1–50; 20 when left out).
- It returns the same queue and order the web Review starts with over All fields (the hub can also start one Field,
  or a roadmap topic, alone): every card due now, in the runner's seeded order for the life day, the first `limit` of
  them, each in the wording the web would show (its original question, or one of its other wordings at random).

```json
{ "ok": true, "data": { "now": "…", "dueTotal": 12, "fatigued"?: { "until": "…" } | null, "cards": [
  { "ideaId": "…", "type": "SHORT" | "CLOZE" | "NUMERIC" | "MCQ" | "LIST" | "ORDER" | "FORMULA",
    "prompt": "What does …?", "promptHasMath": false,
    "options": ["…"] | null, "listCount": 4 | null, "orderItems": ["…"] | null, "blanks": 2 | null,
    "unit": "kg" | null, "level": 3, "field": "Chemistry" | null, "domain": "Science" | null } ] } }
```

- `dueTotal` counts every due card. A DIAGRAM card (an image to label; the web form can't make one) keeps its place
  in the order but is left out of `cards`: review it on the web.
- `fatigued` (P30): the same as `/check`'s `review.fatigued`, read as the queue is: present only while
  `FATIGUE_LAUNCH_DAY` is in force, `{until}` while Fatigued is in effect, else null. The app's review screen says it
  ("Fatigued until 10:30 pm"). The answer that reaches the day's 200th is applied after its reply, so the next queue
  read is the first to show it.
- `prompt`, as the runner shows it: an MCQ its question ("Choose the correct answer" when it has none); a CLOZE the
  sentence with each blank as a numbered marker, `[1]`, `[2]` …, in order (the runner puts an input in each); a LIST,
  an ORDER or a NUMERIC its prompt; a SHORT or a FORMULA its question.
- `options`: MCQ choices, in the order the runner shows them (as stored; it doesn't shuffle them).
- `listCount`: how many items a LIST wants. `orderItems`: ORDER steps, scrambled (stored scrambled; the runner shows
  them in that order). `blanks`: the number of cloze blanks. `unit`: a NUMERIC's unit.
- Math (LaTeX): the web renders math only in FORMULA prompts, from `$…$` and `$$…$$` spans; the server rewrites
  each span as `\( … \)` or `\[ … \]` and leaves the rest as is. `promptHasMath` (FORMULA only) tells the app to
  render it with KaTeX; any other prompt is plain text.

### POST /review/answer

- Body: `{ "ideaId": "…", "answer": "…" | ["…"], "combo"?: 3, "sessionMisses"?: 0, "clientId"?: "…" }`.
- `answer` takes the shape `submitReview` already accepts per type:
  - SHORT, NUMERIC, FORMULA and MCQ: a string (an MCQ's option exactly as given in `options`);
  - LIST and ORDER: a string array (ORDER: the `orderItems` in the order chosen);
  - CLOZE: an array of the blanks in order.
  - Like the runner, nothing empty: a blank string, or an empty item, is refused (400).
- `combo` (0 when left out): the session's combo so far, which the app keeps exactly as the web runner does: 0 at the
  start of a session, then `comboNext` from every answer.
- `sessionMisses` (0 when left out): how many times this card was already missed earlier in this session.
- Grading is entirely server side.

```json
{ "ok": true, "data": { "correct": true, "expected": "…", "explanation": "…" | null,
  "judged": { "correct": true, "reason": "…" } | null,
  "xp": 4.2, "comboNext": 4, "multiplier": 1.2,
  "levelFrom": 3, "levelTo": 4, "nextDueDay": "2026-10-29",
  "retry": false, "trueFact": "Recalled after 34 days",
  "quest": { "done": 5, "target": 20 | null }, "streakSecured": false,
  "celebrations": [ { "tier": 2, "kind": "…", "title": "…" } ],
  "credits": { "delta": 10, "balance": 130, "today": 30 } | null } }
```

- `judged`: set when a short answer's wording missed and the meaning check decided (its verdict and its one line).
- `xp`: the review points this answer paid (0 on a miss); review points, never life XP. `multiplier`: the combo
  multiplier it was paid at. `levelFrom` / `levelTo`: the card's level before and after (null only if it couldn't be
  read after a strike). `trueFact`: the result panel's line. `quest.target` is null before the day's first open has
  fixed it: keep the one from `/check`.
- `credits` (blueprint P16): as `/tasks/complete`'s, read before the answer and fresh after it (`delta` 10 when the
  answer completes the day's review quest among Today's three; `balance` and `today` the wallet after it); null while
  credits are switched off or when a read failed. A repeat answered `recorded` carries none.
- `retry` is the web runner's rule: true when this answer is a miss and this card's misses this session, this one
  included (`sessionMisses` + 1), are at most 3. Then the app asks the card again at the end of its session, at
  `levelTo`. So the app keeps, for one session: the queue, `combo`, and each card's miss count (sent as
  `sessionMisses`).
- An `ideaId` that doesn't exist is `404 gone`.
- `clientId`: send a new one for every answer, and the same one only when resending that answer (the same card and
  the same answer). It keys the answer's row on the server's ledger, so the answer lands once on any server instance,
  even when its reply was lost or the server failed after recording it. A resend of an answer already recorded gets
  `409 {code:"recorded"}` ("That answer is already recorded. Nothing is paid twice."): its result was the first
  send's, which is not sent again, so the app counts the card as answered and moves on. A card asked again at the
  end of the session is a new answer with a new clientId. (One exception: a miss resent after the life day has
  turned at 04:00 is taken as that new day's miss.)

## POST /log: quick log (a task, a weigh-in or an idea line)

- Body: `{ "text": "gym legs 60m every mon,thu !", "section": "task" | "weight" | "idea", "clientId"?: "…" }`.
- It runs through the capture sheet's core (`createFromCapture`), with the same parsing. The clientId is the line's
  capture key, so a retried line is found, never saved twice.
- `section` sets what the line is, as the capture sheet's section does: it starts the line with its words, `idea: `
  for an idea and `weight ` for a weigh-in (a task starts empty), unless the text already reads that way.
  - `idea`: an idea line becomes an idea draft in the Inbox for the full form (`idea: Q :: A`, as on the web);
    finish it with `POST /ideas` and its `draftId`.
  - `weight`: only a weigh-in (`72.4`, `160 lb`, `72.1 yesterday`; a bare number is in the user's unit); anything
    else is refused (400), never saved as a task. Logging the same value again writes nothing ("Already logged").
  - `task`: the line as typed (a `goal: …` line is a goal; a weigh-in-shaped line is still logged as a weigh-in).
  - An `aim: …` line is refused (400): an aim is set on the roadmap, on the web. At most 500 characters, start
    included.

```json
{ "ok": true, "data": { "kind": "task" | "goal" | "weight" | "idea-draft", "id": "…", "title": "Gym legs",
  "line": "Added. Gym legs → Today · ≈ 8.3", "undo": { "kind": "task" | "weight" | "draft", "id": "…" } | null,
  "credits": { "delta": 0, "balance": 120, "today": 20 } | null } }
```

- `line`: the capture sheet's toast as one line ("Added (not a Must)" for a must with no day; "Already saved" for a
  retried line; "Idea in Inbox" for an idea draft; "Weight logged. 72.4 kg → Body · was 73.0 kg" for a weigh-in).
  - Daily quests: a must that would be the sixth due on one of its days is saved as an ordinary task, never refused:
    "Added (not a Must). Pay the rent → Planned · ≈ 3 · Five daily quests is the cap. Soften one first." The 4th or
    5th adds the warning: "… · 4 of 5 daily quests" ("… on Mon 26 Oct" when that day is not today).
  - A done-now line that names a row on today's board (blueprint P6, decision D33: `x gym 45m` with a "Gym" habit due
    today) ticks that row with the line's minutes, as the web's capture sheet does, and saves nothing new: "Ticked. Gym
    (Habits) · +8.3". `id` and `title` are that row's. The row is a personal task or habit on today's Must, Planned,
    Habits or Anytime lane: never a work tab's, never one that completes itself or counts pages, never in the Inbox or
    deferred. A line with a schedule, an Inbox mark, `#side` or a study or pages link is saved as before. A row ticked
    today already answers "Already ticked. Gym → Done today · Nothing is paid twice." and nothing is written, so a
    retried line (the same clientId, or the same words again) writes once. When the row's tick is refused (a deep-work
    row with proof of work on and no minutes, say) the line is refused with the reason (409), and nothing is written:
    "Not ticked: Write the report (Planned) counts its time. Add its minutes to the line, like 45m, or tick it on
    Today." With no such row the line is saved as a new one-off and ticked, as before.
- `id`: the task, goal or draft's id (`weight:<day>` for a weigh-in). `undo.id` is opaque: send it back as is (for a
  weigh-in it carries the reading it replaced).
- `undo` is null for a weigh-in there is nothing to take back from: the same value again ("Already logged": nothing
  was written), or one that replaced a reading the server couldn't see. Offer no Undo then, as the capture sheet
  offers none. It is null too for a line that ticked the row it names ("Ticked. …", P6): no capture was saved, and a
  capture's Undo would take back the row itself. That tick is taken back on the web board inside its ten minutes, as a
  tick made elsewhere is (Check says "Kept earlier today. Undo it on the web app.").
- `credits` (blueprint P16): as `/tasks/complete`'s, read before the save and fresh after it (a done-now line that
  finishes one of Today's three earns its 10; a plain new task earns nothing until it is done); null while credits are
  switched off or when a read failed.

### POST /log/undo
- Body: the `undo` object above, `{ "kind": "task" | "weight" | "draft", "id": "…", "clientId"?: "…" }`.
- A task, a goal or a draft runs the sheet's `undoCapture`; a weigh-in runs `undoWeightCapture`. Returns `{}`.
  - A task, goal or draft is taken back within ten minutes of its save (an undone one again is `{}`); later it is
    refused (409), and a line that is gone, or that an edit replaced, is `404 gone`.
  - A weigh-in is taken back while the day still holds that reading (a fresh one is deleted, a replacing one gives
    the old reading back); a day changed since is `404 gone`. A weigh-in that can't be undone has no `undo` to send
    (`/log` answered null); a token for one is refused (409).

## GET /ideas/meta: what the New idea form needs

```json
{ "ok": true, "data": {
  "formats": [ { "type": "SHORT", "label": "Short", "points": 10, "help": "Free text, graded on similarity" } ],
  "collections": [ { "value": "BOOK", "label": "Book" }, { "value": "ACTIONABLE", "label": "Actionable" },
    { "value": "PROPOSAL", "label": "Proposal" } ] } }
```

- `formats` are the seven formats in the web form's order (Short, Cloze, Numeric, Multiple choice, List, Order,
  Formula), with the form card's label, its base review points and its help line.
- `collections` are the form's collections; the first, `BOOK`, is its default.

## POST /ideas: create a full idea

- Body: the fields of the web New idea form, which go to `submitIdea` exactly as the form sends them:
  `{ "type", "question"?, "answer"?, "options"?, "listItems"?, "orderItems"?, "unit"?, "tolerance"?, "caseSensitive"?, "variants"?, "collection"?, "draftId"?, "clientId"? }`.
  - SHORT: `question`, `answer`, `caseSensitive`? (capitals must match; false when left out).
  - CLOZE: `question`, the sentence with `{{…}}` around each part to blank.
  - NUMERIC: `question`, `answer` (the value), `tolerance`? (± absolute; 0 when left out), `unit`?. The value and the
    tolerance may be numbers or text as the form holds them ("9.81").
  - MCQ: `options` (at least two), `answer` (the right option's text, one of `options`).
  - LIST: `question`, `listItems` (at least two). ORDER: `question`, `orderItems` (at least two, in the true order;
    the server stores them scrambled).
  - FORMULA: `question`, `answer` (the formula, mathjs or LaTeX).
  - `variants`? (SHORT, FORMULA, LIST, ORDER and NUMERIC only): other wordings of the question, at most 6.
  - `collection`?: `BOOK` (when left out), `ACTIONABLE` or `PROPOSAL`. `draftId`?: the idea draft this finishes
    (from `/log`'s `id`); it leaves the Inbox.
  - `question` and `answer` may be sent with any format: where the format has no place for one it is ignored (CLOZE,
    LIST and ORDER ignore `answer`: the blanks and the items are the answer; MCQ ignores `question`). Any other field
    the format doesn't use (`options`, `listItems`, `orderItems`, `unit`, `tolerance`, `caseSensitive`, `variants`)
    is refused (400); so are incomplete fields, with the form's own reason. Each text is at most 4,000 characters,
    each list at most 50 rows.
- It runs through `submitIdea`, the same filing as the web form (the Field and the Domain are chosen automatically, as
  the form does by default). It may take a few seconds, because it embeds and files the idea.

```json
{ "ok": true, "data": { "status": "created" | "merged" | "duplicate", "ideaId": "…", "title": "…",
  "field": "Chemistry" | null, "domain": "Science" | null, "points": 10, "line": "Filed beside its neighbours in Science (Chemistry)." } }
```

- `created`: filed; `points` is the review points it credited, `line` where it went (the form's banner).
- `merged`: you already have it; it was folded into the existing idea `ideaId`. Nothing created, `points` 0.
- `duplicate`: something close is already here (`ideaId`), so nothing was written; the web form offers Link or
  Enrich. `points` 0.
- When the embedding service doesn't answer, nothing is written and the reply is `500` with the form's own line.

## GET /quests: the main quest, its sprint and Today's three

Read only (blueprint 2.1 and 2.2; decisions D11 and D12). One vocabulary: the roadmap goal is the **main quest**, its
stages are **milestones**, and its week quests are **this week's sprint**; the Short, Mid and Long goals stay the main
quest's key results, the daily quests stay the musts, and Today's three stay momentum's.

```json
{ "ok": true, "data": {
  "now": "2026-10-25T09:00:00.000Z", "day": "2026-10-25",
  "mainQuest": { "state": "NONE" | "DRAFT" | "PLANNED" | "ACTIVE" | "PAST_DUE" | "PAUSED" | "DONE" | "LEGACY",
    "title": "Trade for a living" | null, "line": "Milestone 1 is planned.",
    "milestone": { "ord": 2, "of": 6, "title": "Familiar with the basics",
      "titleNote": "Gemini suggestion · not checked" | null, "titleStruck": [[0, 2]],
      "status": "PLANNED" | "STARTED" | "REACHED" | "PENDING_REACH" | "PAST_DUE",
      "percent": 42 | null, "dueDay": "2026-11-08" | null } | null,
    "startOnWeb": false, "suggest": true,
    "study": { "name": "Markov chains", "domainId": "…", "cards": 3, "floor": 8, "due": 4, "layer": 1, "geminiNamed": true,
      "line": "Study Markov chains · 3 of 8 · 4 due", "webHref": "/review?view=run&domain=…" } | null } | null,
  "sprint": { "label": "This week's sprint", "milestoneOrd": 2, "weekStart": "2026-10-19", "weekEnd": "2026-10-25",
    "state": "OPEN" | "HELD" | "PAST_DUE", "done": 2, "total": 5,
    "status": "live" | "provisional" | "settling", "line": "provisional · final Wed 04:00" | null,
    "rows": [ { "kind": "PRACTICE", "label": "Backtest · 3 sessions × 30 min", "countLine": "1 of 3 sessions",
      "count": 3, "progress": 1, "unit": "session", "done": false, "templateId": "…" | null } ] } | null,
  "three": { "done": 1, "total": 3, "frozen": true, "chest": "locked" | "ready" | "opened",
    "quests": [ { "slot": "PLAN" | "BODY" | "TASK", "title": "Review 12 cards", "done": false, "templateId": "…" | null } ] } | null } }
```

- `mainQuest`: the open roadmap goal Today's Main quest card shows (the same model): the lowest seat whose milestone
  is under way, else the lowest open seat, so a draft or a planned goal on a lower seat never hides the sprint
  another goal is running. `title` is its own name, else its aim, in the user's words. `line` is the card's one line,
  in neutral words. `milestone` is the current one (`percent` is its headline share once started, null before). Its
  title keeps its provenance, as on the web: `titleNote` is Gemini's words for a title Gemini wrote ("Gemini
  suggestion · not checked", or "Gemini's words · kept by you · not checked"; null for the user's own or the app's),
  shown beside it, and `titleStruck` the `[start, end)` spans of its numbers to strike through (never rewritten; `[]`
  when none). `state` `NONE` is no main quest (its `line` is "No main quest yet."; `suggest` is false once the aim
  suggestions are turned off). Null when it couldn't be read.
- `startOnWeb`: a planned milestone can be started on the web. **Start and every plan edit stay on the web**: the app
  never starts a milestone. Start is offered only while `ROADMAP_GOALS_LIVE` is on, so `startOnWeb` is false while the
  switch is off (a planned milestone then reads "Milestone 1 is planned."), and false on a topic plan's layer whose
  prerequisites are still open (roadmap contracts ruling N28).
- `study` (roadmap contracts ruling N28): while the main quest's milestone is a planned layer of a topic plan (locked, or
  Start off), the one thing to do, as Today's Main quest card says it: the topic to study now (the first of the layer
  not done, else the next planned layer's), its `cards` at level 6 of the `floor` ("3 of 8": the gate's count, the same
  the roadmap page shows), its cards `due` today, its `layer`, whether Gemini named its Domain (`geminiNamed`: the
  web's mark), the web's `line` ("Study Markov chains · 3 of 8 · 4 due", or "Add an idea to Markov chains" with none
  due) and `webHref`, the web link the card goes to (that Domain's review run, `/review?view=run&domain=<id>`, never the
  bare review page; or the add flow placed in the Domain). The run itself stays on the web: the app says the line. On a
  locked layer (its prerequisites open, roadmap contracts ruling N27) it is the lock's first unmet parent, the roadmap
  hero's own primary: `line` "Add 3 cards to <parent>", `webHref` the add flow placed in that Domain, `layer` the layer
  before. `geminiNamed` is the web's mark on the name: the app says "named by Gemini" under the line. Null on a LEVELS
  plan, once the milestone has started, and with no topic left to do.
- `sprint`: this life week's sprint of the main quest's started milestone (frozen just after Monday 04:00), null with
  none (a planned milestone has none). `done` of `total` counts its rows done. `status` says when the numbers are from:
  `live` while the week runs; `provisional` on its Sunday, with `line` "provisional · final Wed 04:00"; `settling`
  past that before the server has written the week. It is never a verdict: a week's results are written once, from
  the Wednesday 04:00 after its Sunday, and nothing here writes one. A row's `done` is the server's: the week's count
  for it is met (a session ticked today is not a row done). `rows` come in Today's order, not the roadmap page's: open
  rows first, then by kind (Bring, Add, Step, Practice, Checkpoint), each kind in its own order. Each `countLine`
  carries its unit ("1 of 3 sessions", "not logged yet"); a practice or step row's `templateId` is its task on Today,
  ticked with `POST /tasks/complete` like any task. `state` `HELD` (a held week) and `PAST_DUE` (the milestone is past
  its day: Today's card shows no sprint line then) have no rows.
- `three`: Today's three (momentum's daily set), read only: each quest's `slot`, `title`, whether it is `done` (from
  the day's own rows, so an undone tick reopens it) and, for a task quest, its `templateId` (ticked with
  `POST /tasks/complete`). `frozen` is false while the day's set is still a preview; `chest` is today's chest. Null
  before momentum's launch, or when it couldn't be read.
- It writes nothing and owes nothing after the reply; each read is the web's own cached one.

## GET /status: the five attributes, Capital, the avatar targets and the skills

Read only (blueprint 1.1; decisions D1 and D2). The /you Status card's own panel (status-panel.ts `statusPanelOf`):
five **attributes**, each its source's own figures, never a second formula. **Vitality** is the Body track,
**Intellect** is Knowledge (the Fields' level), and **Craft**, **Duty** and **Care** are their tracks. The track names
stay (Body, Duty, Craft, Care), with the blueprint's word beside them. **Capital is a reading only**: AUD won per month
from Deals at stage WON, with no XP and no level. The **skills** (blueprint 1.5; decisions D7 to D9) are You › Skills'
own list: named competencies with hours and tiers, a record that pays nothing.

```json
{ "ok": true, "data": {
  "now": "2026-10-23T00:12:00.000Z", "day": "2026-10-23", "launched": true,
  "attributes": [
    { "key": "VITALITY" | "INTELLECT" | "CRAFT" | "DUTY" | "CARE", "attribute": "Vitality", "name": "Body",
      "level": 6, "progress": 0.31, "banked": 0.25, "cap": 9 | null, "atCap": false, "keptStreak": 4 | null,
      "weeks": ["kept", "missed", "held"], "line": "1,960 / 2,401 XP · depth cap 9 · 7 more kept weeks raise it",
      "unit": "xp" | "pts", "skills": 2 }
  ],
  "capital": { "month": "2026-10", "label": "October 2026", "wonCents": 1240000, "won": "$12,400", "deals": 1,
    "line": "1 deal won in October", "history": "September $8,200 · August $0",
    "months": [ { "month": "2026-10", "label": "October 2026", "wonCents": 1240000, "won": "$12,400", "deals": 1 } ] } | null,
  "targets": [
    { "id": "…" | "weight", "attribute": "VITALITY" | "INTELLECT" | "CRAFT" | "DUTY" | "CARE" | "CAPITAL",
      "label": "Weight", "metric": "WEIGHT" | "EFFORT_MINUTES" | "FIELD_LEVEL" | "TRACK_HOURS" | "REVENUE_MONTH" | "MANUAL",
      "unit": "kg", "direction": "UP" | "DOWN", "baseline": 85.2 | null, "baselineDay": "2026-10-01" | null,
      "target": 75, "targetDay": "2027-03-01" | null, "current": 82.4 | null, "currentDay": "2026-10-23" | null,
      "source": "COMPUTED" | "SELF" | "WEIGHT", "share": 0.274 | null,
      "pace": "REACHED" | "ON_PACE" | "BEHIND" | "PAST" | null,
      "line": "Weight 82.4 → 75 kg · 27% of the way · on pace" }
  ] | null,
  "skills": [
    { "id": "…", "name": "Writing", "attribute": "VITALITY" | "INTELLECT" | "CRAFT" | "DUTY" | "CARE",
      "kind": "PRACTICE" | "EXERCISE", "fieldName": "Economics" | null, "hours": 142.5, "tier": 2, "tierFrom": 100,
      "tierTo": 500, "progress": 0.106, "toNext": 357.5 | null, "line": "≈ 142 h (task estimates, not timed)",
      "tierLine": "Tier 2 · 100–500 h · 357 h to Tier 3", "ticks": 171, "estimated": 3, "walks": 0, "templates": 2 }
  ] | null
} }
```

- `attributes`: in this order: Vitality, Intellect, Craft, Duty, Care. `attribute` is the blueprint's word, `name` the
  source's own (Body, Knowledge, Craft, Duty, Care); show the two together where they differ ("Body · Vitality").
  - `level` is the track's level (capped by kept weeks and paid goals) or Knowledge's, the same number the web shows.
  - `progress` is the meter toward the next level now, 0 to 1 (1 while `atCap`), and `banked` the meter at the end of
    last life week (Knowledge: 7 days ago) when the level was the same then, else 0; both to 3 decimals.
  - `cap` is the track's depth cap and `keptStreak` its run of kept weeks. Both are null for Intellect, which has no
    cap. `atCap`: the XP is banked at the cap, and only a kept week (or a paid goal) raises the level.
  - `weeks`: the last judged weeks, at most 8, oldest first, never padded (`kept`, `held` or `missed`). Intellect has none.
  - `line` is the web row's own line. `unit` says what fills the meter: `xp` life XP for a track, `pts` review points
    for Intellect.
  - `skills` (P5) is how many live skills the attribute has (the web row's "2 skills", a link to You › Skills); 0 with
    none, or when the skills couldn't be read.
- `launched`: life counts. Until then (and the web shows the same) `attributes` holds Intellect alone, and no track
  level is claimed.
- `capital`: this month's reading (`wonCents` is AUD cents, a whole number; `won` the web's own figure), how many deals
  were won in it, its `line` ("No deal won in October yet" in a month with none so far), `history` (the two months
  before), and `months`, this month and the two before, newest first. A deal counts in the month of its close, read as a
  life day (Sydney, the day turns at 04:00). An archived, open or lost deal never counts. Null when no deal was won in
  those three months (the web shows no Capital row then), or when the deals couldn't be read. Capital has no level and
  pays nothing.
- `targets` (blueprint 1.2; decisions D3 and D4): the avatar's targets, the desired self in numbers, in the web card's
  order (Vitality, Intellect, Craft, Duty, Care, then Capital; within one, the user's order). Show each under its
  attribute's row (Capital's under the Capital card, even in a quarter with no deal won); a track's target before life
  counts has no row yet, so show it apart. The numbers are the user's own, entered on the web (/you › Edit avatar).
  - `metric`: `WEIGHT` is Body's weight card's own target and trend (`id` `weight`; set on Body › This week, never a
    second copy), `EFFORT_MINUTES` Body's effort minutes last life week (as the kept-week floor counts them),
    `FIELD_LEVEL` a Field's level now (0 to 100: a Field has no ceiling of its own), `TRACK_HOURS` hours of ticked tasks
    on Craft, Duty or Care last life week (task estimates, not timed: its line marks the value "≈"), `REVENUE_MONTH` AUD
    won this month from deals at stage Won, `MANUAL` a number the user logs (its `source` is `SELF`, and its line says
    "self-reported").
  - `unit` is the figures' unit (`kg` or `lb`, `min`, `h`, `level`, `AUD`, or the user's own word, which may be
    empty). `direction` `UP`: higher is closer. `baseline` is where the share is measured from (null until the user
    gives one), `current` the value now (null with no reading yet) and `currentDay` the day it is from (last week's
    Sunday for a weekly metric).
  - `share` is 0 to 1 of the way from the baseline (null without a baseline or a value). `pace`: `REACHED`, else with
    a target day `ON_PACE` (the share is at least the share of the days gone), `BEHIND`, or `PAST` after the day; null
    without a target day. `line` is the web's own words.
  - Null when the targets couldn't be read (show none, never a stale share); an empty list when there are none.
  - A target is a record: it pays no XP or MP and moves no level.
- `skills` (blueprint 1.5; decisions D7, D8 and D9): the named skills, most hours first, as You › Skills lists them. A
  skill is fed by the tasks linked to it (each task's own link, else its roadmap's) and, for an `EXERCISE` skill (Vitality
  only, at most one), every logged walk. A walk counts once: on an `EXERCISE` skill a tick the walk paid, or a habit tick
  it topped up ("Counts as" after the tick), is the walk's time, never counted beside it. Skills are named and linked on
  the web.
  - `hours` are derived on every read: the minutes of the linked tasks' ticks (an undo takes its tick back out), at the
    receipt's minutes, else the occurrence's, else the task's estimate; `estimated` says how many ticks fell back to the
    estimate. `line` is the web's words ("≈ 42 h (task estimates, not timed)"; "12.5 h of walks"; "No hours yet").
  - `tier` is 1 (0–100 h), 2 (100–500 h), 3 (500–2,000 h) or 4 (2,000–10,000 h); `tierFrom` and `tierTo` are its bounds,
    `progress` the share through it (0 to 1, 3 decimals) and `toNext` the hours to the next tier (null in Tier 4).
    `tierLine` is the web's ("Tier 2 · 100–500 h · 357 h to Tier 3").
  - `ticks`, `walks` and `templates` count what feeds it now. `fieldName` is an Intellect skill's Field, by its name now
    (null otherwise, or when that Field is gone).
  - Null when the skills couldn't be read (show none); an empty list with none.
  - A skill is a record: no hour or tier pays XP or MP or moves a level. A tier-up is a Seal only (`competency-tier`).
- Read only: it writes nothing, settles nothing and owes nothing after the reply, so two reads in a row answer the same.
  The life view and Knowledge are the panel itself, so if either can't be read the request fails (`server`) and the app
  keeps its last copy. Capital is read beside them, and a failure there reads as `capital: null`; the targets are read
  on the same deals, and a failure there reads as `targets: null`; the skills are read beside them, and a failure there
  reads as `skills: null` (and every attribute's `skills` 0).

## GET /mall: the Mall's rewards and the credits over them

Read only (blueprint 4.3 to 4.5; decisions D30 to D32). You › Mall's own read (mall-server `loadMall`): the rewards the
user lists, each with a price in credits and whether it can be bought now, by category, the archived ones, the latest
purchases, and the credits wallet over them. **Only what the user
lists is priced**: the Mall starts empty and the server never sends a starter reward. **#play, rest days and sleep are never priced**: the server refuses a reward named
for #play, sleep, a nap or a rest day, and one that is a #play task on the user's board. The app can't block leisure,
so the Mall is a commitment device that runs on honour. **A purchase is permission now** (blueprint P19): it burns
exactly its price, never more than the balance (no overdraft), and can be undone for 10 minutes (`POST /mall/buy`,
`POST /mall/undo`).

```json
{ "ok": true, "data": {
  "now": "2026-10-24T00:12:00.000Z", "day": "2026-10-24",
  "credits": { "balance": 1240, "today": 40 } | null,
  "creditsLine": "+40 cr today" | "Credits aren't counted yet: they start at none on the day they are switched on.",
  "goodDay": { "credits": 40, "days": 28, "earningDays": 22 } | null,
  "hintLine": "A good day is 40 cr: the middle of the 22 days that earned credits in the last 28." | null,
  "categories": [ { "key": "TREAT" | "SCREEN" | "OUTING" | "PURCHASE" | "OTHER", "label": "Treats",
    "examples": "a takeaway, a dessert, a coffee out" } ],
  "rewards": [ { "id": "…", "title": "Takeaway night", "category": "TREAT", "categoryLabel": "Treats", "price": 120,
    "priceLine": "120 cr", "hint": "≈ 3 good days" | "calibrating", "note": "From the Thai place" | null,
    "cooldownDays": 7 | null, "cooldownLine": "at most once every 7 days" | null,
    "buy": { "can": true, "why": null } | { "can": false, "why": "Takeaway night costs 120 cr; you have 80 cr (40 cr short)." } } ],
  "archived": [ { "id": "…", "title": "…", "category": "SCREEN", "categoryLabel": "Screen time", "price": 30,
    "priceLine": "30 cr", "hint": "calibrating", "note": null, "cooldownDays": null, "cooldownLine": null,
    "buy": { "can": false, "why": "That reward is gone." }, "archivedAt": "2026-10-20T03:00:00.000Z" } ],
  "purchases": [ { "id": "…", "rewardId": "…", "title": "Takeaway night", "price": 120, "priceLine": "120 cr",
    "day": "2026-10-24", "occurredAt": "2026-10-24T10:05:00.000Z", "at": "21:05", "refunded": false,
    "undoUntil": "2026-10-24T10:15:00.000Z" | null, "line": "Bought Sat 24 Oct at 21:05" } ],
  "limits": { "titleMax": 60, "noteMax": 200, "priceMin": 1, "priceMax": 100000, "cooldownMin": 1, "cooldownMax": 365,
    "rewardsMax": 60, "undoMinutes": 10 },
  "notes": { "honour": "The app can't block leisure, so the Mall is a commitment device: it runs on honour. …",
    "free": "#play, rest days and sleep are never priced: …", "onlyYours": "Only the rewards you list are priced. …",
    "buying": "A purchase is permission now: buy the reward, then take it. You can't spend more than you have, and a purchase can be undone for 10 minutes." },
  "writesOn": true, "ready": true
} }
```

- `credits`: the wallet, as `/check`'s `credits` (whole credits: the balance and what today earned). Null while
  credits are off (`CREDITS_LAUNCH_DAY`, null until the user's go: no balance is shown) and when it couldn't be read.
  `creditsLine` is the web header's line beside it, or why there is none.
- `goodDay`: what the price hints divide by. A good day is the middle (median) of the days that earned credits in the
  last 28 complete life days. Null while the hints calibrate: credits are off, they have counted for fewer than 14
  complete days, or no day in the window earned any. `hintLine` says which, in the web's words (null when the wallet
  couldn't be read). The hints are deterministic: the same rows give the same hint.
- `rewards`: the live rewards in the page's order: by category (`categories`' order), each category in the user's
  order. `price` is whole credits (1 to 100,000) and `priceLine` the web's figure. `hint` is "≈ 2 good days",
  "≈ 1 good day" or "under half a good day", or `calibrating` without a good day. `cooldownDays` is "at most once every
  n days" (null with none); a purchase keeps it (an undone purchase does not count).
- `buy` (P19): whether the reward can be bought now (`can`), else the line saying why (`why`, the server's own words):
  credits off ("Credits aren't counted yet, so nothing can be bought."), a server that records nothing, a balance below
  zero ("You're at −10 cr: earn it back before you buy."), too few credits ("… costs 120 cr; you have 80 cr (40 cr
  short)."), or a cooldown ("At most once every 7 days: next on Tue 27 Oct."). It is the page's own state; the server
  checks it all again at the buy.
- `purchases` (P19): the latest 20 purchases, newest first. `id` is what `POST /mall/undo` names; `title` and `price`
  are the receipt's (an edit of the reward never reprices a purchase). `undoUntil` is ten minutes after the purchase,
  while it can still be undone (null once undone or past it); `refunded` marks one undone. Empty while credits are off.
- `archived`: archived rewards, newest first, at most 50, with `archivedAt`. An archive keeps the row; nothing is
  deleted. Rewards are edited and archived on the web.
- `limits`: what the Add form keeps (the server checks them again). `notes`: the page's honour notes, shown as is.
- `writesOn`: the server records writes (only the live app does; a dev server sharing the database records nothing).
  `ready`: the Mall's table is there (false before its migration: no rewards, and an add is refused).
- A reward is a record of what the user will pay: listing one pays and costs nothing. Buying one costs its price in
  credits, and never XP, MP or a point.
- It writes nothing and owes nothing after the reply. The catalog is the page itself, so if it can't be read the
  request fails (`server`) and the app keeps its last copy; the wallet is read beside it, and a failure there reads
  as `credits: null`.

### POST /mall/rewards

Lists a reward, as the Add sheet on You › Mall does (`addReward`, actions/mall.ts).

```json
{ "title": "Takeaway night", "category": "TREAT", "price": 120, "note": "From the Thai place", "cooldownDays": 7,
  "clientId": "…" }
→ { "ok": true, "data": { "id": "…", "reward": { "id": "…", "title": "Takeaway night", "category": "TREAT", … } | null } }
```

- `title` (1–60 characters), `category` (a `categories` key) and `price` (a whole number of credits) are required;
  `note` (at most 200 characters) and `cooldownDays` (whole days) are optional. A mistyped or missing field is `bad`.
- The rules are the server's, refused as `conflict` with its own line: a price outside 1 to 100,000 ("A price is a
  whole number of credits from 1 to 100,000."), a cooldown outside 1 to 365, a title naming #play, sleep, a nap or a
  rest day ("Sleep, naps and rest days stay free: the Mall never prices them.") or a #play task on the board, a title
  already listed ("You already list “Takeaway night”."), the 60th live reward, and a server that records nothing
  ("Mall changes are recorded only on the live app.").
- `reward` is the new row as `GET /mall` lists it (null when that read fails: the reward is listed all the same).
- A resend with the same `clientId` replays on the instance that answered; on another instance the second add is
  refused as a title already listed, so a reward is listed once.

### POST /mall/buy

Buys a reward, as Buy then Confirm on You › Mall does (`buyReward`, actions/mall.ts; blueprint 4.4 and 4.5, decisions
D31 and D32). A purchase is permission now: the price is burnt exactly, never more than the balance.

```json
{ "rewardId": "…", "clientId": "…" }
→ { "ok": true, "data": {
  "purchase": { "id": "…", "rewardId": "…", "title": "Takeaway night", "price": 120, "priceLine": "120 cr", "day": "2026-10-24",
    "occurredAt": "2026-10-24T10:05:00.000Z", "at": "21:05", "refunded": false, "undoUntil": "2026-10-24T10:15:00.000Z",
    "line": "Bought Sat 24 Oct at 21:05" },
  "credits": { "delta": -120, "balance": 1120 }, "duplicate": false,
  "line": "Takeaway night bought for 120 cr · 1,120 cr left.",
  "celebrations": [ { "tier": 2, "kind": "mall-buy", "title": "Takeaway night bought" } ] } }
```

- `clientId` is **required** here (`bad` without it): it is the purchase's ledger key, so send the same one on every
  retry of one purchase, and a new one for every purchase meant as new. A resend with the same `clientId` replays the
  first reply on the instance that answered it (byte for byte: `duplicate: false`, `credits.delta` −price); on another
  instance the server answers the purchase already made with `duplicate: true` and `credits.delta` 0. Either way it is
  written once: nothing is spent twice. So the app keeps a purchase's `clientId` only while the same attempt is retried
  (its reply lost), and drops it once `GET /mall` lists that purchase.
- The server reads the reward, every Mall row and the credits fresh, then writes the purchase in one transaction behind
  the same lock as a tick, with a guard that no other purchase landed meanwhile. If one did (the phone and the web at
  once), it reads again once and checks again, so two purchases can never spend the same credits; if it changed a
  second time it says so ("Your credits changed meanwhile. Try again.", `conflict`).
- Refusals are `conflict` with the server's line: credits off ("Credits aren't counted yet, so nothing can be
  bought."), a server that records nothing, a balance below zero, too few credits (no overdraft and no credit line),
  and a cooldown not yet over. A reward that is archived or not there is `gone` ("That reward is gone.").
- `credits`: the purchase's own change (−price) and the balance it left, whole credits. No penalty ever takes credits,
  and a purchase never costs XP, MP or a point.
- `celebrations`: the purchase's Seal (`mall-buy`, tier 2), as the web's queue plays it; none on a repeat.
- No chance: the price is the price. The chest and crits stay the only rolls.

### POST /mall/undo

Undoes a purchase inside its ten minutes, as Undo in the web's purchases does (`undoBuy`, actions/mall.ts).

```json
{ "purchaseId": "…", "clientId"?: "…" }
→ { "ok": true, "data": { "purchaseId": "…", "credits": { "delta": 120, "balance": 1240 }, "duplicate": false,
  "line": "Takeaway night undone: 120 cr back." } }
```

- Ten minutes from the purchase, on the server's clock; after that it is `conflict` ("Too late to undo: a purchase can
  be undone for 10 minutes."). A purchase that isn't there is `gone` ("That purchase is gone.").
- Once: a resend with the same `clientId` replays the first reply on the instance that answered it (`duplicate:
  false`, `credits.delta` +price); any other repeat (another instance, a double tap with a new `clientId`, the other
  device) is answered by the server with `duplicate: true` and `credits.delta` 0. A purchase is given back once.
- The credits come back as they were spent; an undo plays no celebration.

## POST /exercise: Health Connect's walks, hikes and weigh-ins

Blueprint 5.1d (P27; decision D22): the app's Health Connect sync, a WorkManager job that is **off until the user turns
it on** in the app's Settings (Settings › Health Connect), after the permission rationale screen and Health Connect's
own permission dialog. It reads walking and hiking sessions (with their distance and, for a hike, the climb) and
weigh-ins, and posts them here 50 at a time. Walks and weight only: no steps, heart rate, sleep or other workouts, and
no new pay rule.

```json
{ "since": "2026-10-20T08:00:00.000Z",
  "walks": [ { "externalId": "a1b2c3d4-…", "kind": "WALK" | "HIKE", "start": "2026-10-21T06:40:00.000Z",
    "end": "2026-10-21T07:25:00.000Z", "distanceKm": 4.1, "climbM"?: 120, "origin"?: "com.sec.android.app.shealth" } ],
  "weights": [ { "externalId": "…", "at": "2026-10-21T20:05:00.000Z", "kg": 82.4 } ],
  "clientId"?: "…" }
→ { "ok": true, "data": {
    "walks": { "added": 2, "paid": 1, "recorded": 1, "matched": 1, "duplicate": 3, "xp": 18.4 },
    "weights": { "added": 1, "kept": 0 },
    "refused": [ { "kind": "walk" | "weight", "externalId": "…", "error": "A distance between 0.01 and 200 km, please." } ],
    "line": "Health Connect: 2 walks in (1 paid 18.4 XP, 1 recorded) · 1 already logged · 1 weigh-in" } }
```

- `since`: when the sync was switched on. **The backfill is record-only** (H17): a walk that started before `since`
  is saved as a record (Train › Exercise lists it, its minutes count toward an exercise skill's hours) and never paid,
  and it is never a personal best, whatever its day. Health Connect lets a new app read the 30 days before its first
  grant; those come in this way.
- A walk is `logWalkCore` (exercise-server.ts), exactly as Train › Exercise logs one: its life day is the day it
  started, its incline the climb over its distance, its note "Walk · Health Connect" or "Hike · Health Connect". A
  walk after `since` is priced by the walk's own rules: on a live day, dated today or yesterday, through the daily
  knee (`paid`, its `xp`); older or refused walks are records (`recorded`).
- **One walk lands once:** each carries its dedupe row `ingest:hc:<externalId>` (an `INGEST` ledger row, sink NONE, xp
  0, never a streak day), written in the session's own transaction. A resend, a retried job or a second phone is a
  `duplicate`, on any server instance. A walk deleted on Train › Exercise stays deleted (its key is still there).
- **One session, one payment:** a walk the user already logged by hand that day (its minutes and distance within 20 %,
  or 5 minutes and 0.3 km) is that walk: its key is recorded against that session and nothing else is written or paid
  (`matched`). A hand-logged walk absorbs one Health Connect walk at most, so a second walk that day still lands.
  Two apps' records of the same walk (half of the shorter one's minutes in common) are matched the same way. The
  other order holds too: a walk typed on Train › Exercise after Health Connect brought the same one in (that day,
  the same tolerances) is refused with "Already here from Health Connect: …", so it is never paid twice.
- A weigh-in is `logWeightCore` (weight-server.ts) with source `import`, on the life day it was measured: a record,
  never a reward. One reading a day: an import never replaces one typed on the phone or the web, and replaces an
  earlier import only with a later measurement (`kept` counts the ones left as they were).
- A value a core refuses (a walk with no distance, a weight outside 20–400 kg, a day over a year back) is listed in
  `refused` with the core's own line; the rest of the batch lands. A wrong shape (a missing `since`, an unknown key, an
  `end` before its `start`, a start in the future, more than 100 walks or weigh-ins) is `bad` (400).
- Writes only on the live app: a dev server answers `conflict` (409) "Health Connect imports are recorded by the live
  app only (this server writes nothing)." (dev and prod share one database).
- The app shows the reply's `line` under Settings › Health Connect ("Last synced 21 Oct, 18:05 · …"). A sync is never a
  moment: no celebration plays for it.

## POST /checkin: the 5-second check-in

Health phase 2 (docs/life-plan/health-2026-10-27.md D1, D2, D5, D9): one check-in from the phone, the same deed as one
from Body › Mind's sheet (`logCheckCore`, mind-server.ts). Tap 1 is the 9 × 9 grid (pleasantness across, energy up),
tap 2 the optional stress row; a feeling word and up to 8 tags are optional. It comes from the Check screen's row, the
cover widget's sheet, the "Check in" tile and launcher shortcut, or a prompt (phase 6).

```json
{ "at": "2026-10-28T03:12:05.000Z", "valence": 2, "energy": -1, "stress"?: 1 | null, "word"?: "Calm" | null,
  "tags"?: ["Work"] | null, "trigger": "self" | "prompted", "via": "check" | "widget" | "tile" | "notify",
  "promptedAt"?: "2026-10-28T03:00:00.000Z" | null, "tookMs"?: 4200 | null, "clientId": "…" }
→ { "ok": true, "data": { "id": "…", "day": "2026-10-28", "line": "Logged 14:12", "words": "Calm, content",
    "undoUntil": "2026-10-28T03:12:10.000Z", "duplicate": false } }
```

- The shape is checked here (a wrong one is `bad`, 400; no error line repeats a value):
  - `at` (required): the instant the user tapped, an ISO instant, fixed at the tap, so a check-in that waited in the
    queue is booked when it was felt. The core keeps it as it allows: a few minutes ahead of the server's clock is
    booked at the server's clock, further ahead is refused, and so is one more than 7 life days back ("That check-in is
    more than a week old.", 409). Its life day is the day of `at`.
  - `valence` and `energy` (required): whole steps from −4 to 4. `stress`: 0 (Not at all) to 4 (Very much), or left out
    (skipped). `word`: text, or left out; `tags`: at most 8 texts, or left out. The core cleans them as the web sheet's
    are (each cut to 24 characters, a known word in its own spelling, repeats kept once).
  - `trigger` (required): `self` (the user's own tap) or `prompted` (a prompt's; then `promptedAt`, when the prompt was
    shown, kept only within 24 hours before `at`). `via` (required): the phone's surface, `check`, `widget`, `tile` or
    `notify`. `tookMs`: opening the sheet to saving it, in milliseconds (the 5-second claim is measured; over ten
    minutes it is stored as none).
  - `clientId` is **required** here (a UUID): it keys the row (MoodCheck's unique user and clientId). Send the same one
    on every retry of one check-in, and a new one for every check-in. A resend with the same body replays the first
    reply on the instance that answered; on any other instance the core finds the row and answers it (`duplicate` true,
    nothing written). The queue never changes a body; were a resend's pick changed, the core updates that one row to
    the new values (the web sheet's rule), so a check-in is never two rows.
- Refusals are the core's, in its own words: `conflict` (409) while check-ins are not open ("Check-ins aren't open
  yet.", before `MIND_LAUNCH_DAY`), before the mind_checks migration ("Check-ins need a one-time database update
  first."), and for a value the core refuses; `server` (500) for "Couldn't save that. Try again.", which the queue tries
  again.
- The answer: `id` (what `POST /checkin/undo` names) and `day`, the life day it was booked on. `line` is the receipt's
  frame with the time alone ("Logged 14:12", as Today's strip says it), **safe on any surface**: the cover screen, a
  notification, the lock screen. `words` are the grid's words for the pick ("Calm, content"; on an axis line "Neutral,
  low energy"), for the main screen's sheet only, beside the line ("Logged 14:12 · Calm, content", the web sheet's
  receipt); never on the cover, the tile, a notification or the lock screen. `undoUntil` is when the receipt stops
  offering Undo (5 seconds from this answer, the web receipt's); `duplicate` marks a resend the core had already logged.
- A record, never a reward (D5): no ledger row, no XP, MP or credit, no streak, quest or celebration, whatever the
  values. The app plays the same neutral haptic (`Scores.checkIn`) for every value and shows no colour judgement and no
  praise or shame.
- Privacy (D9): the values travel only in this request's body (never in a URL or a query string) and come back only as
  `words`. They are never in `/check`, the widget, the tile, a notification, the lock screen, a push payload or a log
  line, and never reach Gemini. The check-in sheet on the phone always shows "Need to talk? Lifeline 13 11 14" as a
  tap-to-call that opens the dialer with the number filled in (the user presses call; the app asks for no permission).

### POST /checkin/undo

- Body: `{ "id": "…", "clientId"?: "…" }`, the `id` `POST /checkin` answered. It runs `deleteCheckCore`, the
  check-in's own Delete (the receipt's Undo and Body › Mind's Delete are one action), which never waits for the switch:
  what was recorded can always be removed.

```json
{ "ok": true, "data": { "id": "…", "deleted": 1 | 0, "line": "Check-in taken back." | "Already deleted." } }
```

- `deleted` 0 is one already gone ("Already deleted."): a repeat is harmless, so the server sets no window on it; the
  app offers Undo only until `undoUntil`. An id that isn't one is `bad`. No value is sent or answered. Every check-in
  stays deletable on the web (Body › Mind: each one's Delete, and "Delete all check-ins").
- An undo never waits in the queue: with no answer the app says so and leaves the check-in for Body › Mind.

## POST /lift/set: one set of the open lift

Health phase 2 (D12, D14 to D19): "Set done" from the phone (the Check screen's lift card; a cover-widget row and an
ongoing notification are a later phase), the same deed as the web row's ✓ (`logSetCore`, training-server.ts). Start, adding a movement,
Keep, Fix, Delete and Finish (with its "Counts as") stay on the web (Train › Exercise, `/train/exercise`).

```json
{ "sessionId": "…", "entryId": "…", "doneAt": "2026-10-21T08:14:30.000Z", "clientId": "…",
  "ord"?: 3, "kind"?: "WARMUP" | "WORKING" | "DROP" | "MINI", "weightKg"?: 60 | null, "reps"?: 8 | null,
  "rir"?: 2 | null, "toFailure"?: false, "amrap"?: false, "durationSec"?: 65 | null, "distanceM"?: 40 | null,
  "restSec"?: 150 | null }
→ { "ok": true, "data": {
    "set": { "id": "…", "entryId": "…", "ord": 3, "kind": "WORKING", "chainOf": null, "weightKg": 60, "reps": 8,
      "rir": 2, "toFailure": false, "amrap": false, "durationSec": null, "distanceM": null, "doneAt": "…" },
    "duplicate": false, "restSec": 180, "line": "Bench press: logged 60 kg × 8 · RIR 2.",
    "jump"?: { "line": "Big jump: 100 kg (best 80). Saved as a record. It counts as a new best only once kept on the web's Finish summary; if the number is wrong, fix it on the web.",
      "webHref": "/train/exercise" },
    "lift": { "sessionId": "…", "label": "Push day" | null, "startedAt": "…", "next": { … } | null } | null } }
```

- The shape is checked here (a wrong one is `bad`, 400): `sessionId` and `entryId` (`/check`'s `lift.sessionId` and
  `lift.next.entryId`), `doneAt` (required: the instant of the tap, ISO, fixed at the tap; the core keeps it inside the
  lift's start and the server's clock, and refuses one more than a minute ahead), and `clientId` (**required**, a UUID:
  the set's key). The set itself is the web row's, every field optional: `ord` (left out, the set takes the movement's
  next place, under the movement's lock, so two devices never share one: the app leaves it out), `kind` (WORKING when
  left out; a DROP or MINI left without a chain continues the set before it), `weightKg` (kilograms, as stored: never
  the unit shown; a bodyweight movement's signed added load), `reps`, `rir` (0 to 5, 5 is "4+"), `toFailure`,
  `amrap`, `durationSec` and `distanceM` (a hold, a carry) and `restSec` (the rest the timer gave before it, never
  typed). The bounds are the core's (training.ts `cleanSetInput`): a figure out of range is refused in its words
  ("Reps from 1 to 100, please.", 409).
- Once per clientId, on any instance: a resend with the same body replays the first reply on the instance that
  answered; on any other the core answers the set that clientId wrote, whatever happened to the lift since
  (`duplicate` true, nothing written). So a set that waited in the queue lands once.
- Refusals: `gone` (404) for a lift or a movement that isn't there ("That lift is no longer here.", "That movement is
  no longer in this lift."); `conflict` (409) for a finished lift ("That lift is finished. Start a new one to log
  more."), one left open past its day (closed at its last set first: "That lift was left open past its day, so it was
  closed at its last set."), the core's bounds and chain rules, and before the strength_sets migration ("The lift
  logger needs a one-time database update first."); `server` (500) for "Couldn't save that. Try again.", which the
  queue tries again.
- The answer: `set` as stored (kilograms; `chainOf` the head a drop continues), `duplicate`, `restSec` the rest timer
  after it, the web logger's (training.ts `restAfterOf`): 0, none, when the lift's next set is this set's own drop (the
  same movement, the very next place), 20 s before its rest-pause, else the movement's rest (60 s after a warm-up), and
  `line` in the web row's words ("Bench press: logged 60 kg × 8 · RIR 2.";
  "Bench press: already logged …" for a resend; "Set logged." when the lift couldn't be read after). `lift` is the lift
  after the set as `/check` reads it (its `next` the set after this one), null when it is no longer open or the read
  after failed: the app reads `/check` again then.
- `jump`, present only when a working set is more than 15 % over the movement's best of the 8 weeks before this lift
  (else all time): the big-jump question in plain words. The phone does not answer it. **The set is saved as logged,
  as a record**: no column holds an answer (the web page keeps one and Finish carries it), so a Keep on the phone would
  be lost. The web's Finish summary asks again (Keep, or Confirm for more than twice the best) before the set can count
  as a new best, and a wrong figure is fixed on the web (Fix). `line` is the core's question less "Keep it?", then that;
  `webHref` is the page. Unanswered, the set stays a record, never a PR moment: the safe side.
- A record (D12): a set writes no ledger row, no XP, MP or credit, no streak, quest or celebration; the lift's one
  effect, "Counts as" at Finish, is the web's. Nothing about a lift is a mood value: its words ("Next: Bench press 60 kg
  × 8") may show on a later cover-widget row and in a later ongoing notification; today they show on Check's lift card
  only.
