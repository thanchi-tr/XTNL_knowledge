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
    `409 recorded`), Done and Reopen are idempotent, and a repeated new idea is merged into the first by dedup.
  - Writes revalidate the same cache tags the web actions do (they run the same actions).
- **Errors:** the app keeps what the user typed on any failure.

## Endpoints

| Method | Path | Wraps |
| --- | --- | --- |
| GET | /check | the Today board's read, the Review hub's counts, the shell's level, the work tabs' due tasks |
| POST | /tasks/complete | `completeTask` (actions/tasks.ts) |
| POST | /tasks/undo | `undoCompletion` (actions/tasks.ts) |
| POST | /work/done | `doneScheduledTask` with no log (actions/scheduled-tasks.ts) |
| POST | /work/reopen | `reopenScheduledTask` (actions/scheduled-tasks.ts) |
| GET | /review/queue | the Review hub's due cards in the runner's order |
| POST | /review/answer | `submitReview` (actions/review.ts) |
| POST | /log | `createFromCapture` (actions/capture.ts) |
| POST | /log/undo | `undoCapture` (actions/tasks.ts), `undoWeightCapture` (actions/capture.ts) |
| GET | /ideas/meta | the New idea form's formats and collections |
| POST | /ideas | `submitIdea` (actions/ideas.ts) |

## GET /check: the quick check (the app's home)

```json
{ "ok": true, "data": {
  "now": "2026-10-21T00:12:00.000Z", "day": "2026-10-21", "dayLabel": "Wed 21 Oct",
  "tasks": [
    { "templateId": "…", "title": "Gym legs", "lane": "MUST" | "HABIT" | "TASK",
      "status": "OPEN" | "DONE" | "DONE_MVV" | "SKIPPED" | "HELD" | "LOCKED",
      "minutes": 60, "mvv": "10 squats" | null, "icon": "dumbbell" | null,
      "dueLabel": "by Fri" | "late 2d" | "from Tue" | null, "xpHint": 8.3 | null }
  ],
  "tasksSummary": { "open": 3, "done": 2, "allDone": false },
  "review": { "due": 12, "doneToday": 4, "target": 20, "nextDueAt": "…" | null },
  "work": [
    { "id": "…", "boardId": "…", "boardName": "Acme Sales", "title": "Call Jordan back",
      "dueAt": "…", "allDay": false, "channel": "CALL" | "VISIT" | "EMAIL" | "MESSAGE" | "OTHER",
      "overdue": true, "collection": "New NBN service" | null,
      "customer": { "id": "…", "name": "Jordan Lee", "number": "1042", "phone": "0412 345 678" | null } | null }
  ],
  "level": { "level": 1, "title": "Novice", "progress": 0.75 } | null,
  "streak": { "days": 12, "keptToday": true, "freezes": 2 } | null
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
- `tasksSummary`: the board's own counts: `open` the Must and Today rows still open or locked (a held row is not
  open), `done` the rows above done today, `allDone` the web's "Board clear" (nothing open, at least one done).
- `review`: the Review hub's figures: `due` every card due now (including any DIAGRAM card, which the app can't
  show), `doneToday` today's reviews, `target` today's review quest target (fixed by the day's first open, at most
  20), `nextDueAt` when the soonest card not yet due falls due.
- `work`: the open scheduled tasks across the open work tabs that are overdue or due today, in the Agenda's order
  (Overdue first, then Today; soonest first, an all-day task before the timed ones of its day), at most 30.
- `level` (the character level, as the top bar shows it) and `streak` (the daily streak; `freezes` banked) are null
  when they couldn't be read; so is `work` an empty list. The board, the Field tree or today's review count failing
  fails the whole check (500).
- Before it reads, the server runs momentum's lazy writes, as Today does (the day's quest set first, so `xpHint` and a
  tick made from this check price today's frog); they return at once when nothing is owed. After the reply it runs
  what opening Today and the Review hub owe: the day's first open fixes the review quest's target, study tasks the
  day's reviews have met are recorded, and life maintenance.

## POST /tasks/complete: check a due task

- Body: `{ "templateId": "…", "day"?: "today" | "yesterday" | "YYYY-MM-DD", "mvv"?: false, "clientId"?: "…" }`.
- It runs through the same core as the board's tick (`completeTask`: its lock, pricing, momentum and celebrations).
  The server books only today or yesterday by its own clock: another day is refused (409).
- Then it reads the board again, as the web's tick re-renders Today, for `allDone`, and the character's level (both
  reads also warm the next `/check`).

```json
{ "ok": true, "data": { "instanceId": "…", "xp": 8.3, "line": "+8.3 XP · Body", "allDone": false,
  "celebrations": [ { "tier": 1, "kind": "…", "title": "…" } ],
  "level": { "level": 7, "title": "Adept", "progress": 0.81 } | null } }
```

- `xp`: the life XP paid, to one decimal. `line`: `+8.3 XP · <track>` (Body, Duty, Craft or Care), with
  `· minimum` for the minimum version and `· yesterday` for a forgotten tick; a repeat of a tick already recorded
  says `Already recorded. Nothing is paid twice.` (and pays nothing).
- `allDone`: the board is clear after this tick (false when the board couldn't be read again).
- `celebrations`: L3's moments for the tick (a streak milestone, a habit rung, a finished goal …), every tier.
- `level`: the character's level after this tick, as `/check`'s `level` (null when it couldn't be read). The app steps
  its level seal by the difference, and plays a level up on the tick that earns it; with no `level` it refreshes
  `/check` instead.

### POST /tasks/undo
- Body: `{ "instanceId": "…", "clientId"?: "…" }`.
- It runs `undoCompletion` and returns `{ "xp": -8.3, "level": { … } | null }` (the life XP taken back, 0 when it
  was already undone; and the character's level after it, as `/tasks/complete`'s).
  Past the ten-minute window, or on a day already settled, it is refused (409).

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
{ "ok": true, "data": { "now": "…", "dueTotal": 12, "cards": [
  { "ideaId": "…", "type": "SHORT" | "CLOZE" | "NUMERIC" | "MCQ" | "LIST" | "ORDER" | "FORMULA",
    "prompt": "What does …?", "promptHasMath": false,
    "options": ["…"] | null, "listCount": 4 | null, "orderItems": ["…"] | null, "blanks": 2 | null,
    "unit": "kg" | null, "level": 3, "field": "Chemistry" | null, "domain": "Science" | null } ] } }
```

- `dueTotal` counts every due card. A DIAGRAM card (an image to label; the web form can't make one) keeps its place
  in the order but is left out of `cards`: review it on the web.
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
  "celebrations": [ { "tier": 2, "kind": "…", "title": "…" } ] } }
```

- `judged`: set when a short answer's wording missed and the meaning check decided (its verdict and its one line).
- `xp`: the review points this answer paid (0 on a miss); review points, never life XP. `multiplier`: the combo
  multiplier it was paid at. `levelFrom` / `levelTo`: the card's level before and after (null only if it couldn't be
  read after a strike). `trueFact`: the result panel's line. `quest.target` is null before the day's first open has
  fixed it: keep the one from `/check`.
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
  "line": "Added. Gym legs → Today · ≈ 8.3", "undo": { "kind": "task" | "weight" | "draft", "id": "…" } | null } }
```

- `line`: the capture sheet's toast as one line ("Added (not a Must)" for a must with no day; "Already saved" for a
  retried line; "Idea in Inbox" for an idea draft; "Weight logged. 72.4 kg → Body · was 73.0 kg" for a weigh-in).
- `id`: the task, goal or draft's id (`weight:<day>` for a weigh-in). `undo.id` is opaque: send it back as is (for a
  weigh-in it carries the reading it replaced).
- `undo` is null for a weigh-in there is nothing to take back from: the same value again ("Already logged": nothing
  was written), or one that replaced a reading the server couldn't see. Offer no Undo then, as the capture sheet
  offers none.

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
