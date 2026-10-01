# Capture improvement

## Goal

Make capture close to zero-friction on the two devices the user has: the Galaxy Fold (mostly the cover screen) and the Windows desktop. Make every capture trustworthy, so the user never has to wonder whether a line was misread, where it went, or whether it was lost. The concrete targets:
- several tasks in one opening of the sheet;
- grammar you can tap instead of type;
- a parser that stops silently filing common English and Vietnamese-English phrasings as the wrong thing;
- a one-tap fix for a line you just saved;
- a visible destination for every capture, and visible failures;
- unsent lines that retry themselves;
- an idea path with no 6-tap round trip and no lost text.
House rules hold throughout:
- the client still sends only the line, and the server re-parses it as the authority;
- the same line on the same day always gives the same parse and the same price;
- a line is written before anything that could fail, so nothing is lost;
- every number shown is the server's own;
- every control is at least 40 px (buttons 44) with live-region feedback;
- the cover screen at 344 px is designed for first.
No database migration is needed. Everything uses existing columns: rawText, note, captureKey, archivedAt and the 10-minute capture undo window.

## P1 · Burst capture on the phone (the sheet stays open) (M)

**Why.** On a soft keyboard you can't type Shift+Enter, so every line costs a fresh opening. Today, 3 tasks = 3 × (+ tap, keyboard rises, text, done) = 6 overhead taps and 3 keyboard drop/rise cycles. After: + · text · Enter · text · Enter · text · Add = 4 overhead taps and one keyboard rise. For n lines that is n+1 taps instead of 2n. A single line still costs 2 overhead taps through the Add button. It also removes the risk that Samsung Keyboard or Vietnamese Telex swallow the first press of the action key during composition.

**Spec.** BEHAVIOUR
- capture-ui.ts gets a pure helper, enterAction({coarse, shift, composing, source}), which returns 'save-stay' | 'save-close' | 'wait-composition' | 'ignore'. `coarse` is matchMedia('(pointer: coarse)').matches, read on open.
- Fine pointer (desktop): unchanged. Enter saves and closes; Shift+Enter saves and stays.
- Coarse pointer:
  - the keyboard's action key saves and stays, and focus and the keyboard stay up;
  - the Add button (and To Inbox) saves and closes;
  - when the line is empty and at least one line was added in this opening, the primary button reads 'Done' and closes.
- enterKeyHint is 'send' on coarse pointers and 'done' on fine ones. Never use 'next': Chrome maps IME_ACTION_NEXT to a focus move, not Enter.

ENTER WIRING
- Wrap only the <input> in <form noValidate onSubmit>, with no submit button inside it. Add and To Inbox stay type=button outside the form. Implicit submission then fires 'submit' for any keyboard's action key.
- keydown Enter, not composing: preventDefault, then save per enterAction.
- 'submit' arrives only when keydown didn't take the key (key 'Unidentified'/229). It saves per enterAction.
- On coarse pointers, an Enter during composition sets submitAfterComposition; the next compositionend saves once.
- Desktop keeps today's composing guard: a Telex commit is not a submit.
- No double save: the existing empty-line guard plus a per-open 300 ms lastSubmitAt guard.

'ADDED HERE' LIST (new JustAdded.tsx)
- Newest first. 3 rows visible under 600 px, 5 from 600, then a '+N more' disclosure.
- Row: title · where-label (from feature 'Say where it went') · ≈ price, plus quiet 40 px buttons [Edit] [Undo].
- Undo turns the row into 'Removed · <title>' for 4 s.
- The list lives in memory for the page's life and is pruned at 10 min (CAPTURE_UNDO_MS). It survives close and reopen.
- The header's 'N captured' count stays.
- aria-live status: 'Added <title> → <where>. N added.'

DOCK TOAST ON CLOSE
- 1 line added: today's toast with Undo.
- 2 or more: title 'N added', body the titles joined with ' · ' and truncated, action 'Show', which reopens the sheet on the list.

POCKET TO CARET
- When the sheet opens from ?capture= on a coarse pointer and the keyboard inset is still 0 after 600 ms, the placeholder becomes 'Tap here to type'.

TOUCH FOOTER HINT
- Replaces the hidden key hints: 'Enter adds the next line · Add closes'.

**Files.** src/components/capture/QuickCapture.tsx; new src/components/capture/JustAdded.tsx; src/components/capture/capture-ui.ts; src/app/capture.css

**Tests.** scripts/today-ui-check.ts:
- an enterAction truth table (coarse × shift × composing × source key/submit/button);
- the JustAdded reducer: add, undo → removed → expires, prune at 10 min, cap;
- the dock-toast choice for 0, 1 and ≥2 lines added.
Manual on the Fold cover screen, with Samsung Keyboard, then Gboard, then Vietnamese Telex on:
- three lines in one opening;
- the first press of the action key always saves;
- Add closes;
- Done appears on an empty line.

## P1 · Edit a line you just saved (M)

**Why.** A misparse spotted in the toast today costs Undo, reopen, and retyping the whole line. For 'gym mon wed fri' on the phone that is 1 + 1 + 15 + 1 = 18 taps. With Edit: 1 tap + the fix (two commas ≈ 2–4 taps) + Enter ≈ 4–6.

**Spec.** CLIENT (Lane B)
- [Edit] sits on every 'Added here' row and in the single-capture dock toast, as a link-styled button after the title. The toast's one action stays Undo.
- Edit is offered only while the capture is under 10 min old.
- If the line is empty, Edit fills it with that capture's exact sent text and reverted spans, kept client-side in the recent item and never rebuilt from the title. The caret goes to the end, and a pill appears above the input: 'Editing “<title>” · Cancel'.
- If the line has text, the note reads 'Finish or clear the line first.' and nothing else changes.
- While editing, the primary button reads 'Save change'. Enter follows the normal stay/close rules.
- The pending-storage entry carries replaces:<oldId>, so a retry after a reload repeats the same recapture.
- Results:
  - success: head 'Updated', body '<new title> → <where>', action 'Edit' (no Undo on an update);
  - result oldKept: head 'Saved the new line', body 'The old one couldn't be removed. Archive it on Today.';
  - the server says too late: status 'Too late to edit (10 min). Save it as a new line?' with [Save as new], which is a normal create with a fresh nonce.

SERVER (Lane C)
- actions/capture.ts gets recaptureFromCapture(oldId, text, reverted?, opts?: {refresh?: boolean; captureKey?: string}): Promise<CaptureResult<CapturedItem>>. It sanitizes and re-parses exactly as createFromCapture does, then calls tasks.ts recaptureCore(userId, oldId, parsed, {rawText, captureKey}).
- recaptureCore:
  1. Read the old row's createdAt and archivedAt for this user. Not found → 'That capture is gone.' Older than CAPTURE_UNDO_MS → 'Too late to edit the line. Change it on Today.'
  2. createTemplateCore(parsed, {rawText, captureSource:'quick', captureKey}). The new row is written FIRST.
  3. undoCaptureCore(userId, oldId). It nets a done-now tick to zero, and an already-archived row returns ok, so a retry is idempotent. If it fails, return the new item with oldKept:true.
  4. after(): applySizing on the new id under createFromCapture's rules (not for GOAL, IDEA_DRAFT or duplicate).
  5. refresh() when asked.
- CapturedItem gains replacedId?: string and oldKept?: boolean.
- No schema change.

**Files.** Lane B: src/components/capture/QuickCapture.tsx, JustAdded.tsx, capture-ui.ts. Lane C: src/app/actions/capture.ts, src/lib/tasks.ts

**Tests.** New scripts/capture-server-check.ts (Lane C), built around a pure planner planRecapture({oldCreatedAt, oldArchived, now}) that returns the step list. Assert:
- the create step comes before the undo step;
- the 10-minute boundary: 599 999 ms is allowed, 600 001 ms is too late;
- a second call after success is a no-op undo;
- a missing old row fails.
scripts/today-ui-check.ts (Lane B):
- Edit only fills an empty line;
- reverted spans are restored verbatim;
- the pending entry carries replaces.
Manual, on the rehearsal server: an 'x run 30m' line edited to 'x run 45m' nets the first tick's XP to zero and pays the second.

## P1 · Tap-to-add grammar row (replaces the mono legend) (M)

**Why.** On a phone keyboard each symbol costs a page switch. 'pay rent by fri !' = 8 + 7 (' by fri') + ~4 (' !') + done = 20 taps today. With the row: 8 + When + Fri + Must + Add = 12. A habit: 'meditate daily 10m' goes from 22 to 8 + Repeat·Daily + Time·10m + Add = 13. 'goal:' and 'idea:' each save the 3-tap ':' (from 38 to 35 for the goal example). The legend is unreadable 12 px mono that disappears once you type; the row stays.

**Spec.** THE ROW
- One row of 40 px quiet chips directly above the input. It scrolls horizontally and never wraps: role='group', aria-label 'Add to the line'.
- Chips: When ▾ · Repeat ▾ · Must · Time ▾ · Goal ▾ · Inbox · Idea.
- Under 600 px it replaces the legend. From 600 the legend stays as a one-line hint while the line is empty.
- A ▾ chip swaps the row in place for its options. The first option chip is '‹' (back), and the opener carries aria-expanded. That keeps it to one row of height on the cover screen.

OPTIONS AND THE TEXT EACH INSERTS
- When: Today → 'today'; Tmr → 'tmr'; the five weekday names after tomorrow → 'fri' (the weak days insert 'on sat' / 'on sun'); Next week → 'next week'.
- Repeat: Daily → 'daily'; Weekdays → 'weekdays'; Every <today's weekday> → 'every thu'; 3×/week → '3x/week'; Weekly → 'weekly'.
- Must:
  - inserts ' !' when the line already has a date or a fixed schedule (a planned date then becomes a deadline, per the parser rule);
  - otherwise the row swaps to: by today · by tmr · by fri · every <today's weekday>, each inserting '<that> !'.
- Time: 10m · 15m · 30m · 45m · 1h · 2h.
- Goal: the open goals from vocab.goals. Inserts ^"<title>" (quoted when the title has a space). Shows a disabled 'No open goals' when there are none.
- Inbox → appends ' ?'. Hidden when the line already ends in '?'.
- Idea → prefixes 'idea: '. Hidden when the line already has a mode prefix.

INSERTION (pure, applyInsert(text, reverted, insert, parsed) in capture-ui.ts)
- Append at the end with exactly one space, but keep a trailing ' ?' or '!' last.
- If the line already has a token of that field (date, deadline, duration, recurrence, parent), REPLACE that token's characters instead of appending.
- Shift the reverted spans with shiftReverted.
- The client still sends only the line, so the server's parse is unchanged in kind.

INTERACTION
- onMouseDown preventDefault, so focus and the keyboard stay up.
- The caret goes to the end after an insert.
- A polite live note: 'Added “tmr”'.
- Chip title / aria-label: 'Add “tmr” to the line'.

**Files.** New src/components/capture/InsertRow.tsx; src/components/capture/capture-ui.ts; QuickCapture.tsx; src/app/capture.css

**Tests.** scripts/today-ui-check.ts: a table of every option over at least 10 base lines (empty title, trailing '?', trailing '!', an existing date, an existing duration, a reverted span, idea and goal prefixes). For each, parseCapture(applyInsert(...)) must:
- contain the intended token with the expected label;
- leave the rest of the parse unchanged;
- never overlap a reverted span;
- replace rather than append when the field exists;
- keep '?' last.
Plus: 'pay rent' + When Fri + Must gives a DEADLINE on Fri 2 Oct, compulsory, title 'Pay rent' (today is Thu 1 Oct 2026).

## P1 · Parser: stop the silent misfiles (English) (L)

**Why.** About 55 of 162 realistic lines were misread. On the phone, each misfile costs a fix once noticed (Undo, +, retype, done ≈ 18 taps) or stays wrong unnoticed: a habit filed as a one-off never repeats, and 'swim 400m' adds 6 h 40 of fake planned time and inflates the ≈ price. Natural forms also get shorter: 'gym mon wed fri' (15 keys) works instead of 'gym every mon,wed,fri' (21), and 'pay rent 1/10 !' becomes a Must without retyping 'by'.

**Spec.** Rules in capture-parse.ts. All are pure and priority-ordered like today. Today is Thu 1 Oct 2026 in every example.

SCHEDULES
- R1 Space-separated day lists. Two or more day names separated by spaces or LIST_SEP, with at least two strong names (sat and sun are weak), make a DOW schedule.
  - 'gym mon wed fri' → DOW:1,3,5, title 'Gym'.
  - 'yoga tue thu 6pm' → DOW:2,4, title 'Yoga 6pm'.
  - A single day stays a date: 'meet tue' → Tue 6 Oct.
  - In the sheet, the token label for a DOW rule gains 'Every ' ('Every Mon · Wed · Fri'). describeCaptureRule and the board are unchanged.
- R2 Ranges: <day>-<day>, <day>–<day>, '<day> to <day>', inclusive and wrapping.
  - 'standup mon-fri' → WEEKDAYS.
  - 'sat-sun' → DOW:6,7.
  - 'fri-mon' → DOW:1,5,6,7.
- R3 Letter lists, slash form only, at least two items: M, T, W, Th|R, F, Sa, Su, case-insensitive. Plus the exact uppercase tokens MWF and TTh.
  - 'gym M/W/F' → DOW:1,3,5.
  - A bare 'S' never matches.
- R4 Frequency:
  - 'N times weekly', 'N times a week', 'twice weekly', 'once weekly', 'N days a/per/each week' → TARGET:N/W;
  - the monthly forms → TARGET:N/M;
  - 'yoga 3 times weekly' → TARGET:3/W, title 'Yoga'.
- R5 Per-day phrases: 'per day', '/day', 'each day', 'a night' anywhere, and 'a day' when a number (digits or one–ten) appears within the previous three words → DAILY.
  - 'duolingo 15m a day' → DAILY + 15m.
  - 'read 1 chapter a day' → DAILY, title 'Read 1 chapter'.
  - 'stretch 2x a day' → DAILY, title 'Stretch 2x'.
  - 'call it a day' is unchanged.
- R6 'every Nth day|week' → EVERY:N (or N×7). This runs before the monthly rules.
  - 'every 2nd day floss' → EVERY:2, title 'Floss'.
  - 'every 3rd day' → EVERY:3.
  - 'every 15th' stays MONTHLY:15.
- R7 An interval followed by a day phases on that day, and the day is consumed.
  - 'mow lawn every 2 weeks sat' → EVERY:14 starting Sat 3 Oct, title 'Mow lawn'.
  - 'fortnightly on fri' works the same way.

DATES AND MUSTS
- R8 '!' or 'must' on a one-off with a PLANNED date promotes it to a DEADLINE on that date, compulsory, with the chip label 'By Fri 2 Oct'. Reverting the Must chip makes it planned again.
  - 'pay rent 1/10 !' → by today, Must.
  - 'renew rego end of month !' → by Sat 31 Oct, Must.
- R9 Yearless dates in the recent past. A D/M, 'D month' or 'month D' with no year that fell 1–60 days ago resolves to TODAY, not next year.
  - Label 'Today · 30 Sep passed', or 'By today · 30 Sep passed' with by/due/until/'!'.
  - 'Q3 report due 30/9' → DEADLINE today.
  - 61 or more days ago keeps today's behaviour (next year).
- R14 Deadline words:
  - 'before <date>' → DEADLINE on the previous day: 'before 15 oct' → By Wed 14 Oct; 'before dec' → By Mon 30 Nov.
  - 'within N days|weeks' → DEADLINE today+N.
  - 'asap' → PLANNED today (never a deadline, so it never creates a Must by itself).
  - 'xmas' / 'christmas' only with a prefix: 'by xmas' → By 25 Dec.
  - 'eoy' / 'end of (the) year' → 31 Dec, deadline when prefixed.
  - 'this year' → 31 Dec in goal mode only.
- R15 Weak words:
  - a weak month followed by a day number 1–31 needs no prefix: 'march 5 dentist' → Thu 5 Mar 2027;
  - a weak day as the last word of the line (before any trailing ! ? #tag ^goal), not preceded by the/a/in/of/this: 'call mum sun' → Sun 4 Oct, while 'enjoy the sun' is unchanged;
  - 'sat:' or 'sun:' at the start of the line: 'sat: market' → Sat 3 Oct, title 'Market'.

TYPOS
- R10 Typo tolerance on a closed list, matched lowercase-only (a capitalised variant is probably a name).
  - Variants generated at module load for monday…sunday and tomorrow: one deletion, one adjacent transposition, or one doubled letter (tomrrow, tmorrow, wednsday, thurday, firday).
  - Explicit lists for: every (evry, evrey, evey, eveyr), daily (dialy, dailly), weekly (weely, wekly, weekyl), wensday, wendsday, tonite, 2day, 2moro.
  - An EXCLUDE set (frida, very, ever, eery, toady, …).
  - Chips show the canonical meaning, so every read is visible.
  - 'gym evry mon' → DOW:1, title 'Gym'.

DURATIONS, PREFIXES AND TITLES
- R11 A bare 'Nm' counts as minutes only when 1 ≤ N ≤ 240, the previous word is not a distance verb (swim, run, jog, walk, row, hike, cycle, ride, sprint, paddle), and the next word is not a length word (rope, cable, wire, fabric, tape, hose, long, wide, tall, deep, high).
  - 'swim 400m', 'buy 2m rope' and 'run 800m' stay text.
  - 'min', 'mins', 'minutes', '~Nm' and 'for Nm' are unchanged.
- R12 The did/done prefix does not apply when the line ends in '?' or the next word is with, i, we, you, they, he, she, u, anyone or someone.
  - 'did i lock the door?' → Inbox, not done.
  - 'done with the essay, send it to prof' → an ordinary task.
  - 'done the dishes' stays done-now.
- R13 tidyTitle removes a stranded final '.' (whitespace before it). It stays idempotent.
  - 'call Dr. Nguyen re: results by Mon.' → title 'Call Dr. Nguyen re: results'.

Compatibility: update only the existing fixtures that pinned the old behaviour (a planned date + '!' warning, past D/M → next year, 'every 2nd day' monthly, bare Nm above 240). All other ~300 fixtures must pass unchanged.

**Files.** src/lib/capture-parse.ts; scripts/capture-parse-check.ts

**Tests.** scripts/capture-parse-check.ts gets at least 100 new fixtures, every one held to the three standing properties (client/server parity after the JSON round trip, idempotence, revert round trip).
Positive fixtures for every example above.
Negative fixtures:
- 'meet may on sat' is unchanged;
- 'enjoy the sun', 'call it a day', 'very good talk', 'ever after', 'Frida birthday', 'review 3 chapters';
- 'run 800m', 'sleep 8h' (stays 8 h);
- 'xmas shopping' gets no date;
- 'did it rain?' is Inbox, not done.
A collision check: no generated typo variant appears in a stoplist of ~300 common English words, and no variant collides with another canonical word.

## P1 · Vietnamese-English lines (M)

**Why.** The user writes Vietnamese-English, and those lines are actively misread. Today 'họp team 3h chiều thứ 2' is filed as a 3-hour undated one-off: an inflated ≈ price and 3 h of fake planned time. 'meeting 15h tmr' becomes 8 h. Fixing one means tapping the 3h chip, then appending an English day (≈ 1 + 4 taps after noticing), or about 18 taps to redo it. After: 0, because the line reads as typed. 'nộp báo cáo trước thứ 6 !' becomes a real Must instead of a silently dropped one.

**Spec.** New rules in capture-parse.ts. Each Vietnamese word is matched in both accented and unaccented forms via explicit alternations; the text is never rewritten, so spans stay exact. Lane B normalises the line to NFC on input, so the regexes see one form and the server gets the same text.

DATES
- 'mai' → tomorrow, but only when typed lowercase and not after anh, chị, em, cô, chú, bạn, với, gặp or cho, and never in 'mai mốt'. 'Gặp Mai ở quán' gets no date.
- 'ngày mai' / 'ngay mai' / 'sáng mai' / 'chiều mai' / 'tối mai' → tomorrow.
- 'hôm nay' / 'hom nay', and 'sáng|trưa|chiều|tối|đêm nay' (and their unaccented forms) → today.
- 'ngày mốt' / 'mốt' (accented only) → the day after tomorrow.
- 'tuần sau' / 'tuần tới' (and unaccented) → next week.
- 'tháng sau' → next month.

DAYS (strong words)
- 'thứ 2' … 'thứ 7' and 'thứ hai|ba|tư|năm|sáu|bảy' → Mon…Sat. 'cn', 'chủ nhật' and 'chu nhat' → Sun. 't2' … 't7' work as tokens.
- Unaccented 'thu 2' is NOT read; it collides with English 'thu'.
- Day lists and ranges reuse R1/R2: 'tập gym t2 t4 t6' → DOW:1,3,5; 't2-t6' → WEEKDAYS; 'mỗi thứ 2' → DOW:1.

PREFIXES
- 'trước' / 'truoc' and 'hạn chót' are deadline prefixes (by).
- 'vào' / 'vao' is a planned prefix (on).

SCHEDULES
- 'mỗi ngày', 'hằng ngày', 'hàng ngày' (and unaccented) → DAILY.
- 'mỗi tuần' / 'hằng tuần' → EVERY:7.
- 'mỗi tháng' / 'hằng tháng' → MONTHLY.
- 'N lần/tuần', 'N lần một tuần', 'N buổi/tuần' → TARGET:N/W.

DURATIONS
- 'Np', 'N phút' / 'N phut' → minutes.
- 'N tiếng' / 'N tieng' → hours; 'N tiếng rưỡi' → N h 30.
- 'N giờ' is hours only when it isn't a clock time (below).

CLOCK-TIME GUARD (English too)
- 'Nh', 'NhMM' and 'N giờ' are a time of day, left in the title and never an estimate, when any of these hold:
  - preceded by lúc / luc / at / @;
  - followed by sáng, chiều, tối, trưa, đêm, am or pm (accented or not);
  - N ≥ 9 (an estimate is clamped at 8 h, so 9h and up can only be a clock time).
- 'study 2h', 'sleep 8h' and '1h30' stay durations.

FIXTURES (Thu 1 Oct 2026)
- 'họp team 3h chiều thứ 2' → title 'Họp team 3h chiều', Mon 5 Oct, no estimate.
- 'meeting 15h tmr' → 'Meeting 15h', Tomorrow.
- 'email thầy tmr 9h' → 'Email thầy 9h', Tomorrow.
- 'Gọi anh Minh lúc 3h' → no estimate.
- 'đi gym tối nay' → Today, title 'Đi gym'.
- 'gọi mẹ mai' → Tomorrow.
- 'học tiếng anh 30p mỗi ngày' → DAILY, 30 m.
- 'đi chợ cn' → Sun 4 Oct.
- 'ôn bài 2 tiếng tối nay' → 120 m, Today.
- 'chạy bộ 5km sáng mai' → Tomorrow, title 'Chạy bộ 5km'.
- 'lunch w/ Anh thứ 7' → Sat 3 Oct.
- 'nộp báo cáo trước thứ 6 !' → By Fri 2 Oct, Must.
- 'đọc sách 3 lần/tuần' → TARGET:3/W.
- 'hom nay goi dien ngan hang' → Today.
- 'mai mốt đi du lịch' → no date.

**Files.** src/lib/capture-parse.ts; scripts/capture-parse-check.ts (a Vietnamese section)

**Tests.** At least 40 Vietnamese fixtures in scripts/capture-parse-check.ts: every example above, accented and unaccented, mixed case ('Thứ 2'). All are held to parity, idempotence and the revert round trip.
Negative fixtures:
- 'Gặp Mai', 'mai mốt', 'thu 2' unaccented (no Monday);
- 'study 2h' and 'sleep 8h' stay durations;
- 'phải không' gets no Must.
An NFD copy of each accented fixture gives the same parse after .normalize('NFC').

## P1 · Say where it went, show it on the board, and stop silent failures (M)

**Why.** A capture can vanish from view today:
- Anytime is collapsed (1 tap + scanning);
- 'planned later' is only a count, so there is no way to see the item;
- the Inbox is a separate sheet;
- the board never highlights the new row.
After: the toast names the place and the board opens and flashes the row, so confirming takes 0 taps. Failures stop hiding behind 'Added':
- a done-now tick that failed;
- a '!' that was dropped (today it is saved non-compulsory on Enter with only a dashed chip);
- an unpriced ≈ shown before the day's ledger loaded.

**Spec.** SERVER (Lane C)
- Extract the per-template branch of buildBoard into placeOf(template, today, instances) → {lane: 'must'|'planned'|'habits'|'upcoming'|'later'|'anytime'|'inbox'|'goals'|'done', label}. buildBoard calls it, so the two cannot drift.
- Labels use the board's own lane names:
  - 'Must';
  - 'Planned';
  - 'Habits';
  - 'Habits · next Thu' (from nextDue);
  - 'Planned later · Fri 2 Oct';
  - 'Anytime', or 'Anytime · by 30 Nov' for a distant deadline;
  - 'Inbox';
  - 'Goals';
  - 'Done today'.
- CapturedItem gains where: {lane, label}, computed by createTemplateCore from the inserted row.
- today-board.ts returns laterRows: {templateId, title, label}[], sorted by day, alongside the `later` count.

BOARD (Lane C)
- TaskRow renders data-template-id.
- TodayBoard listens for CAPTURED_EVENT. It also handles a '#t-<id>' hash on mount, then strips it with replaceState.
  - lane anytime / later / upcoming → setAnytimeOpen(true);
  - lane inbox → flash the Inbox row and its count; the sheet is not opened.
  - Once a row with that data-template-id is in the DOM (an effect on board data, giving up after 5 s): scrollIntoView({block:'nearest'}) — smooth only in Full motion — and set data-just-added for 1600 ms.
  - Visual: a 2 px var(--focus) outline that fades. In Still it is a static outline for 1.6 s. It is never colour alone: an sr-only 'Just added' joins the row's label while flagged.
- Anytime, when expanded, lists laterRows under the eyebrow 'Planned later' (same markup as 'Coming up').

SHEET AND TOAST (Lane B)
Toast and row copy by case:

| Case | Head | Body |
|---|---|---|
| Normal | 'Added' | '<title> → <where.label> · ≈ 8.3' |
| Done-now ticked | 'Done' | '<title> · +8.3', the exact figure with no ≈ |
| Done-now not ticked | 'Saved, not ticked' | '<title> → <where> · <doneNowError>' |
| Retry found the row | 'Already saved' | '<title> → <where>' |
| Idea draft | 'Idea in Inbox' | '<question> → Inbox' with a 'Finish' link |
| Goal | 'Goal added' | '<title> → Goals' |

- Off /today, the toast body adds a 'View' link to /today#t-<id>.
- Use where.label in place of the client's nextOccurrenceNote. Keep the function, which its tests still cover.

BLOCK-ONCE FOR A MUST WITH NO DAY
- When parsed.compulsoryWarning is set, the first Enter or Add tap does NOT save.
- The warning line reads: 'A Must needs a day to be judged on. Tap one, or press Enter again to add it as a normal task.'
- Under it: fix chips [by today] [by tmr] [by fri] [every <today's weekday>], via applyInsert, placed before the trailing '!'. The line is announced through aria-live.
- A second Enter on the unchanged text saves. The toast head is 'Added (not a Must)', the body adds '· needs a day or a schedule to be a Must'.

HONEST ≈
- CaptureChips shows a price only when vocab for today's life day has loaded. Before that the grade chip reads 'Standard · ~30m · priced on save'.

**Files.** Lane C: src/lib/today-board.ts, src/lib/tasks.ts (where), src/app/actions/capture.ts (CapturedItem.where), src/components/today/TodayBoard.tsx, TaskRow.tsx, today.css. Lane B: src/components/capture/QuickCapture.tsx, CaptureChips.tsx, capture-ui.ts, src/app/capture.css

**Tests.** scripts/board-check.ts:
- for every existing board fixture template, placeOf agrees with the lane buildBoard put it in;
- where labels for: an undated todo, a planned later one-off, a habit not due today, a deadline in 10 days, a put-off deadline (planDay), inbox, goal, done-now;
- laterRows sort.
scripts/today-ui-check.ts:
- toast copy by case (a pure toastCopy(item));
- the block-once state machine: the first submit with a warning blocks, the second on the same text saves, an edited text blocks again.
Manual: 'x gym every mon' on Thursday shows 'Saved, not ticked · It isn't due today.'

## P1 · Cover-screen layout: the input never moves (M)

**Why.** On the Fold cover screen with the keyboard up, the input moves while you type. New chips, the Feeds line and the word-hint strip's 12↔60 px padding toggle all push it up, which causes mis-taps on chips and Add. On the unfolded inner screen, the centred panel can sit under the keyboard. After: the line and the buttons stay pinned just above the keys, and nothing below the input changes height.

**Spec.** COMPACT (under 600 px) AND ANY COARSE-POINTER SHEET
The sheet becomes a flex column with its bottom pinned at var(--kb), in this order:
1. Header: h2 'Capture', the count and the close button. The subtitle is hidden under 600 px.
2. A scroll region (flex 1 1 auto; min-height 0; overflow-y auto) holding the Added-here list, status, failed lines, parse chips, the warning and Feeds.
3. A fixed region (flex none) holding the insert row (or the suggestion row), the 52 px input, the 44 px actions and the one-line touch hint.
Results:
- Growth happens above the input; the sheet grows upward to max-height and then the top region scrolls.
- The fixed region is about 190 px at 344 px wide.
- Fine pointers from 600 px keep the mockup order: input, chips, buttons.

WORD HINTS
- WordHintBar is not rendered for task lines; the insert/suggestion row takes its place.
- It stays for 'idea:' lines, in-flow above the input with its height reserved.
- Delete the data-hints 12↔60 px padding switch.

GRADE AND FEEDS
- One quiet chip: 'Standard · ~30m · ≈ 10'.
- The Feeds line shows from 600 px only, or on compact when the grade chip is tapped (aria-expanded on the chip).

UNFOLDED FOLD (600 px and up with a coarse pointer)
- Still the centred 560 panel.
- While --kb > 0: top auto; bottom calc(var(--kb) + 12px); max-height calc(100dvh - var(--kb) - 24px).

UNCHANGED
- Calm and Still motion, the Escape stack, the focus trap, the 40/44 px targets, and the 16 px input text (no zoom).

**Files.** src/components/capture/QuickCapture.tsx; src/components/capture/CaptureChips.tsx; src/app/capture.css

**Tests.** - ui-audit (scripts/ui-audit.mjs) also opens /today?capture=task at 344, 375, 932 and 1440. It checks: no horizontal overflow, targets ≥ 40 (primary ≥ 44), text ≥ 12 px, and no console errors.
- A layout probe at 344×512 with --kb forced to 300px: the input's getBoundingClientRect().top is unchanged before and after typing 'gym legs 60m every mon,thu ! ^marathon #body'.
- Manual on the Fold: cover screen and inner screen, keyboard up.

## P1 · Unsent lines retry themselves (S)

**Why.** Today a line lost in flight or saved offline waits until the user reopens the sheet and taps Retry (2 taps per line, if they remember), and offline it says 'Didn't save'. After: 0 taps. It saves when the network returns, and an unsent count marks the + button. It is safe: the per-line captureKey makes a retry find the row it already wrote.

**Spec.** THE PURE PART (new src/components/capture/capture-queue.ts)
- nextRetryDelay(attempts): 2 s, 10 s, 60 s, 300 s, then stop.
- isNetworkFailure(error): a thrown action or a fetch failure counts; a server {ok:false} does not.
- The queue state: the pending lines plus attempts and nextAt.

TRIGGERS
- QuickCapture is in the root layout. Retry the pending lines:
  - on mount: stale pending lines older than 15 s retry automatically instead of going straight to the failed list;
  - on window 'online';
  - on visibilitychange to visible;
  - on sheet open.
- An in-flight Set keyed by nonce prevents double sends. A manual Retry cancels the timer and sends now.
- After 4 automatic attempts, or any non-network error, the line joins the failed list as today.

FEEDBACK
- Auto-retries are silent: no toast, no mark. When at least one auto-retried line was actually new (duplicate:false), show one summary toast: 'N unsent lines saved'.
- Offline at save time (navigator.onLine === false): toast head 'Queued', body 'Saves when you're back online.' Never 'Didn't save' for a network failure.

UNSENT COUNT
- n = stale pending + failed.
- Set document.documentElement.dataset.captureUnsent = String(n), or remove it when n is 0.
- capture.css: html[data-capture-unsent] :is(.tab-plus, .r-plus, .sb-capture) gets an 8 px ink-0 dot (::after with a 2 px --bar ring; static, no animation).
- QuickCapture always renders a portalled <span id='capture-unsent' class='sr-only'>, reading 'N line(s) waiting to save' or empty.
- Chrome.tsx: the three capture buttons get aria-describedby='capture-unsent'. That is the only shell edit.

**Files.** New src/components/capture/capture-queue.ts; src/components/capture/QuickCapture.tsx; src/app/capture.css; src/components/shell/Chrome.tsx (3 attributes)

**Tests.** scripts/today-ui-check.ts:
- the retry schedule;
- network vs server classification;
- the queue merge: the same nonce is never sent twice, and a manual retry pre-empts the timer;
- the summary-toast rule (only when something new was written).
Manual on the rehearsal server: turn on airplane mode, capture 2 lines (each shows 'Queued' and the + gets a dot), turn the network back on, and the lines save with no taps. Exactly 2 rows exist (check on the local DB).

## P1 · Idea capture without the round trip (handoff, auto-clear, resilient filing, /add keyboard) (M)

**Why.** Phone, from the sheet: 'idea: Q :: A' → Inbox → Idea → Create → back → Inbox → Drop = 6 taps and 2 page loads. After the auto-clear: Inbox → Finish → Create = 3 taps and 1 load (and 0 with one-box filing).
The sheet's 'Idea (full form)' link drops the typed line, so you retype it all; after: carried over, 0.
Desktop /add:
- Create needs a click or about 4 Tabs; after: Ctrl+Enter, one chord;
- Question needs a click; after: autofocused (−1).
Phone /add: the hide-keyboard tap before Create goes (6 → 5 taps).
A Gemini hiccup today shows a generic error; after: the idea is still filed, or the error is honest and the text stays.

**Spec.** 1. DRAFT AUTO-CLEAR
- add/page.tsx passes draftId (validated, ≤ 64 chars, only when loadIdeaDraft returned a row) to AddIdeaForm.
- Card copy: Chip 'From quick capture', the text, then 'Creating this idea clears it from your Inbox.'
- submitIdea, linkIdea and enrichIdea accept draftId?: string.
- On created, merged, linked or enriched, the server runs updateMany({where:{id:draftId, userId, kind:'IDEA_DRAFT', archivedAt:null}, data:{archivedAt: now}}) then invalidate('life','activity'). A missing draft is ignored. Saturated keeps the draft.
- After a create from a draft, the client calls router.replace('/add').
- InboxSheet (Lane C) shows IDEA_DRAFT rows with chips [Finish] (→ /add?draft=<id>) and [Drop], meta 'Idea draft · Finish files it'.

2. SHEET → FORM HANDOFF
New src/lib/idea-handoff.ts (Lane D), all calls guarded:
- writeIdeaHandoff({question, answer, sheetText}) writes sessionStorage 'xtnl:add:handoff' = {question, answer, sheetText, at};
- takeIdeaHandoff() reads and deletes it, and rejects anything older than 10 min or malformed.
Lane B: the sheet's 'Idea (full form)' link, when the line has text, writes the handoff from Lane A's splitIdeaLine(text) (strips 'idea:'/'i:', splits on the first '::'). It does NOT clear the sheet's own draft.
Lane D:
- AddIdeaForm takes the handoff on mount when there is no draft and fills the SHORT question and answer;
- on created, if localStorage 'xtnl:capture:draft'.text === sheetText, it removes it.
The text never goes in a URL.

3. AUTOSAVE
- The content state (format and fields, not Field or Domain) goes to localStorage 'xtnl:add:autosave', debounced 400 ms, capped at 20 KB.
- Restore precedence on load: draft param > handoff > autosave.
- The restore line: 'Restored your unsaved idea · Discard'.
- Cleared on created, linked, enriched and Discard.

4. KEYBOARD
- Ctrl/Cmd+Enter anywhere in the form calls requestSubmit() when ready.
- The Create button shows a 'Ctrl+Enter' keycap on fine pointers, with aria-keyshortcuts='Control+Enter Meta+Enter'.
- The question field (data-first-field) autofocuses on load.
- In LIST, ORDER and MULTI row inputs:
  - Enter appends a row after the current one and focuses it, within today's limits, and never submits;
  - Backspace in an empty row, when there are more than 2 rows, removes it and focuses the previous one.

5. PHONE STICKY BAR
- AddIdeaForm sets --kb on the form root from visualViewport (copy QuickCapture's useKeyboardInset).
- study.css: .add-sticky {bottom: var(--kb, 0px)}, with safe-area padding only when --kb is 0.

6. RESILIENT SUBMIT (ideas.ts, dedup.ts, domain-discovery.ts)
- embedText via withModelTimeout(…, 10 000). On failure, return the new union member {status:'error', message:"Couldn't reach the embedding service. Your idea is still here. Try again in a minute."}.
- synthesizeNodeData via withModelTimeout(…, 12 000). On failure, node_data is null (Idea.title, corePremise and atomicPrompt are nullable).
- nameNewDomain via withModelTimeout(…, 8 000). On failure, use fallbackDomainName(fieldName, tags, contentText):
  - the first tag in Title Case;
  - else the first three content words, stop-words removed, in Title Case;
  - capped at 40 chars;
  - else '<Field> notes';
  - it still goes through the case-insensitive existing-domain match.
- Known failures return the error status instead of throwing, because production hides thrown messages.
- AddIdeaForm shows status 'error' as formError and keeps every field.

**Files.** Lane D: src/app/add/page.tsx, src/components/AddIdeaForm.tsx, src/app/actions/ideas.ts, src/lib/dedup.ts, src/lib/domain-discovery.ts, new src/lib/idea-handoff.ts, src/components/library/study.css. Lane C: src/components/today/InboxSheet.tsx. Lane B: the link in QuickCapture.tsx. Lane A: splitIdeaLine export in capture-parse.ts

**Tests.** New scripts/idea-capture-check.ts:
- fallbackDomainName: tags first, then words; stop-words removed; ≤ 40 chars; the empty-input fallback;
- the handoff: round trip, TTL expiry, malformed JSON, storage that throws;
- restore precedence: draft > handoff > autosave;
- the list-row Enter/Backspace reducer;
- the timeout wrapper with a stubbed rejected promise and a never-resolving one, giving null node data or the error status (never a live failed submission);
- splitIdeaLine fixtures (in capture-parse-check.ts).
Manual on the rehearsal server with GEMINI_API_KEY blank: an /add submit either files with fallbacks or shows the honest error with the fields intact. From the sheet: link → fields filled → Create → the draft is gone from the Inbox and the sheet's line is cleared.

## P1 · Task-safe autocorrect (S)

**Why.** The capture line runs the study-notes autocorrect, which silently rewrites names and everyday words: 'email Val about the contract' → 'Email Value…', 'temp job application' → 'Temperature…'. If noticed, the fix is Ctrl+Z (1 key, and only while the note shows) or a rename later (≈ 4 taps plus retyping). Unnoticed, the title is wrong. After: unchanged, 0.

**Spec.** - src/lib/autocorrect.ts: autocorrectAtCaret(text, caret, opts?: {profile?: 'prose' | 'task'}).
- The 'task' profile uses TYPOS only: no EXPANSIONS, no SYMBOLS. It never changes a word that contains an uppercase letter or a digit.
- src/components/useAutocorrect.ts: useAutocorrect(onChange, enabled = true, profile = 'prose'). The default keeps /add exactly as it is.
- QuickCapture passes 'task' in every mode. The 'Corrected a → b · Ctrl+Z undoes it' note stays.

**Files.** Lane A: src/lib/autocorrect.ts, src/components/useAutocorrect.ts. Lane B: the one-argument change in QuickCapture.tsx

**Tests.** A section in capture-parse-check.ts (or a new autocorrect block in it). Under 'task':
- 'email Val about the contract', 'text ex about the keys', 'temp job application', 'diff report', 'Q3 info pack' are unchanged;
- 'teh' → 'the' still corrects;
- '->' stays '->'.
The 'prose' profile's outputs are identical to today's for 20 existing samples.

## P2 · One-box ideas: 'idea: Q :: A' files itself (M)

**Why.** Even after the auto-clear, a finished idea from the sheet costs Inbox → Finish → Create (3 taps and a page load). Today it costs 6 taps and 2 loads. After: 0 taps beyond the line and Enter. On the phone, 'idea:' + ' :: ' can come from the Idea insert chip plus typing. Answers longer than 200 characters stop being cut, because the answer goes to note, not the title.

**Spec.** This is M3's one-box design. The user dropped M3 as a milestone, so confirm this one feature with a one-line question before building it.

LANE A
- In IDEA mode, the first '::' (any spaces around it) splits the line: the part after it is ParsedCapture.answer.
- The token field is 'answer', labelled 'Answer: <first 24 chars>…'.
- It is revertible: tapping it keeps '::' as text, with no answer.
- The title is the question part. splitIdeaLine shares the rule.

LANE C
- createTemplateCore writes note = answer for IDEA_DRAFT (≤ 500 chars, the line cap). The title is the question, ≤ 200.
- createFromCapture: for an IDEA_DRAFT with an answer that is not a duplicate, run after(() => fileIdeaDraftCore(userId, id)), reading userId before after().
- CapturedItem.filing = true. where = {lane:'inbox', label:'Inbox · filing'}.

LANE D (new src/lib/idea-filing.ts)
- fileIdeaDraftCore(userId, draftId): Promise<'created'|'merged'|'saturated'|'failed'>. It never throws, and logs.
- It loads the IDEA_DRAFT (not archived) and builds SHORT {question: title, answer: note}.
- It calls submitIdeaCore(userId, {content, collectionLabel:'BOOK', draftId}), extracted from submitIdea; the action becomes a thin wrapper.
- created or merged archives the draft (via the draftId rule), and the existing IDEA_CREATE hook pays as it does today.
- saturated or failed leaves the draft in the Inbox. Finish opens /add?draft, which re-runs the check and offers Link or Enrich.
- Saturation never auto-merges.

COPY (Lane B)
- Idea chip with an answer: 'Files itself as an Idea'.
- Without an answer: 'Inbox draft · finish it in the full form'.
- Toast: head 'Idea saved', body '<question> → filing now. If it looks like one you have, it waits in your Inbox.' No points are shown, because they land when it is filed.
- The legend and the Idea insert chip mention 'idea: Q :: A'.

**Files.** Lane A: src/lib/capture-parse.ts, src/lib/life-types.ts (the 'answer' token field, ParsedCapture.answer?). Lane C: src/app/actions/capture.ts, src/lib/tasks.ts. Lane D: new src/lib/idea-filing.ts, src/app/actions/ideas.ts (submitIdeaCore). Lane B: CaptureChips.tsx, QuickCapture.tsx

**Tests.** capture-parse-check.ts:
- 'idea: Q :: A', 'i: Q::A', '::' reverted, an answer with '::' inside (only the first one splits), an answer over 200 chars kept whole;
- parity holds.
idea-capture-check.ts:
- a pure planner proves the draft is written before any model call;
- the outcome → archive table (created / merged archive; saturated / failed keep).
Manual on the rehearsal server with GEMINI_API_KEY blank: the line survives as an Inbox draft.

## P2 · Paste a list: one task per line (M)

**Why.** Pasting 6 lines from Samsung Notes, Keep or an email today makes one garbled task ('Buy milk eggs bread', due tomorrow because of line 2's 'tmr'). Fixing it costs Undo plus 6 × (+, retype, done). After: paste + 'Add 6' = 1 tap.

**Spec.** CLIENT (Lane B)
- onPaste on the line reads clipboardData 'text/plain'.
- splitPastedLines (pure, in capture-ui.ts):
  - split on CR/LF and trim;
  - strip the prefixes '- ', '* ', '•', '–', '[ ]', '[x]' and '1.'/'1)';
  - drop empty lines;
  - cap at 20; past 20, the note 'Only the first 20 lines are added.'
- 0 or 1 lines: a normal paste at the caret.
- 2 or more: preventDefault and show a preview panel in place of the scroll region, headed 'Add N lines'. Each row shows the parsed title, its where-guess and a dashed 'Must · needs a day' when relevant, with a 40 px × to remove it.
- Buttons: [Add N] [Cancel].
- On Add, each line is stamped with its own nonce and stored in pending before sending.

SERVER (Lane C)
- createManyFromCapture(lines: {text, reverted?, captureKey}[], opts?: {refresh?}) → {results: ({ok:true, item: CapturedItem} | {ok:false, captureKey, error})[]}.
- The server enforces at most 20 lines.
- Each line is sanitized and re-parsed, then created sequentially with createTemplateCore. done-now lines tick; Must warnings save as non-Must.
- One after() sizes the new task and habit rows sequentially.
- refresh() once.

AFTER SAVING
- Successes join the Added-here list; failures join the failed list.
- Toast: 'N added', action 'Show'.
- Undo stays per row in the list (no 'Undo all').

**Files.** Lane B: src/components/capture/QuickCapture.tsx, capture-ui.ts, capture.css. Lane C: src/app/actions/capture.ts

**Tests.** today-ui-check.ts, splitPastedLines:
- bullets and checkboxes;
- CRLF;
- blank lines;
- the cap at 20;
- a single line;
- '1)' numbering;
- the 'buy milk\neggs tmr\nbread' fixture gives 3 lines, with only line 2 dated.
capture-server-check.ts: the 20-line cap, and per-line result mapping through a stubbed core.

## P2 · Suggestions from your own tasks, and a first save that never waits (M)

**Why.** - '^marathon' is about 11 taps on the phone; with suggestions it is '^' + tap a goal ≈ 4.
- Re-capturing a recent line ('gym legs 60m every mon,thu', 26 chars) becomes 1 tap + Enter.
- Suggestions today come from the idea vocabulary, which is useless for tasks.
- The vocabulary load is a Server Action fired on open. Next dispatches actions one at a time per client, so a quick first save queues behind it (~1–2 s of 'Saving…').

**Spec.** LANE C
- loadCaptureVocabulary(opts?: {words?: boolean}). The ~1,200 idea words are loaded only when words is true.
- It adds recent: string[]: the distinct rawText of the user's last 8 quick captures of kind TASK|HABIT in the last 30 days, newest first. The read is cached under the 'life' tag.

LANE B
- Keep the last vocab in localStorage 'xtnl:capture:vocab' {day, goals, recent, rawBefore}, guarded, and use it instantly.
- Refresh it in the background after the first save of the opening resolves, or 1.5 s after open if no save is in flight. A save never waits behind it.
- Load the words only in idea mode.

THE SUGGESTION ROW (the insert row's slot)
- When the caret word starts with '^': open goals filtered by the typed prefix. Tapping one replaces the word with ^"<title>".
- When it starts with '#': the chips body · duty · craft · care · play · short · mid · long.
- On an empty line with nothing added in this opening: 'Recent' chips, at most 6. Tapping one fills the line, puts the caret at the end, and its chips appear.
- Everything inserted is text, so the server re-parse is unchanged.
- At most 6 chips, one row.

**Files.** Lane C: src/app/actions/capture.ts, src/lib/tasks.ts (recent query). Lane B: src/components/capture/QuickCapture.tsx, InsertRow.tsx, capture-ui.ts

**Tests.** today-ui-check.ts:
- caretContext(text, caret) → 'goal' | 'tag' | 'empty' | null;
- goal prefix filtering and quoting;
- vocab cache freshness (a different life day means stale);
- the refresh scheduler never starts while a save is in flight (pure scheduler).
capture-server-check.ts: the recent-lines distinct/limit rule on fixture rows.

## P2 · Ctrl/Cmd+K from anywhere on the desktop (S)

**Why.** Today both c and Ctrl+K are refused inside any text field: you first press Esc or click out (+1–2). During a review, capture is impossible, and that is exactly when ideas come up. After: Ctrl+K works in every field and mid-review (0 extra). The bare 'c' keeps its guard.

**Spec.** - capture-parse.ts isCaptureHotkey: Ctrl/Cmd+K returns true even when the target is a text field or a review session is active.
- It stays false inside [data-capture-sheet], with Alt or Shift, on repeat, while composing, or when defaultPrevented.
- 'c' is unchanged.
- The review runner already ignores Ctrl/Meta keys and any key while the sheet is open, and returnFocus puts the caret back in the field on close.

**Files.** src/lib/capture-parse.ts; scripts/capture-parse-check.ts (the hotkey table)

**Tests.** Hotkey table:
- Ctrl+K in an INPUT or TEXTAREA → true;
- Meta+K during review → true;
- 'c' in an INPUT → false;
- Ctrl+K inside [data-capture-sheet] → false;
- Ctrl+Shift+K → false;
- composing → false.
Manual: Ctrl+K inside a /add textarea and inside a review typed answer opens the sheet, and Esc returns the caret there.

## P2 · Back closes the sheet on the phone (S)

**Why.** Today the Back gesture with the sheet open hides the keyboard, then leaves the page. In the TWA opened from the shortcut, it exits the app. After: Back is the one gesture that closes the sheet, which also makes 'Enter adds the next line' cheap to finish.

**Spec.** Coarse pointers only:
- Opening pushes history.pushState(null, '', '#capture-open'). It is hash-only, so there is no Next navigation or fetch.
- popstate while open, with the hash no longer #capture-open → closeSheet('back').
- Closing any other way while the hash is #capture-open → history.back().
- Following the Idea link closes without back().
- Ref-guarded against Strict Mode double effects.
- Never on fine pointers.

**Files.** src/components/capture/QuickCapture.tsx; capture-ui.ts (a pure history-decision helper)

**Tests.** today-ui-check.ts: the decision table (close reason × hash state × coarse) → back() or nothing.
Manual on the Fold: Back closes the sheet and stays on Today, then a second Back behaves as before.

## P2 · Prefill from a link: system-wide capture on Windows with no backend (S)

**Why.** From another Windows app today: Alt+Tab, hunt for the app tab, c, text, Enter. After: Win+Alt+Space (PowerToys Command Palette) or Ctrl+L in any Chrome or Edge tab, then 't', text, Enter, Enter. Similar key count, but no tab hunting and no context switch. No server API, token or third-party account.

**Spec.** - QuickCapture reads '#capture=<encoded>' on mount and on hashchange, on any route.
- readCaptureFragment(hash) (pure): decode, NFC, cap at 500 chars, and reject anything else.
- openSheet({text}). It fills only an empty line; otherwise the note reads "You have an unsent line, so the link's text wasn't used."
- Strip the fragment with replaceState.
- It NEVER auto-saves, so a link elsewhere cannot create tasks.
- It uses the fragment so the text never reaches server logs.
- README gets two recipes:
  - a PowerToys Command Palette bookmark 't' → https://<host>/today#capture={query};
  - a Chrome/Edge site-search keyword 't' → https://<host>/today#capture=%s.

**Files.** src/components/capture/QuickCapture.tsx; capture-ui.ts; README.md

**Tests.** today-ui-check.ts, readCaptureFragment:
- encoded spaces and %23;
- Vietnamese text;
- more than 500 chars is truncated;
- '#t-abc' is ignored;
- an empty value is null.
Manual: the Chrome keyword opens the sheet with the chips drawn, and Enter saves.

## P3 · Quiet duplicate notice (S)

**Why.** Someone unsure a capture landed types it again, and the board silently gets a second copy. Finding and archiving it later costs about 3 taps. After: a quiet note before saving, and nothing is blocked.

**Spec.** - Lane C: vocab gains active: {normTitle, title, where}[] — open templates, not archived or completed, capped at 300.
- Lane B: compute normTitleOf(parsed.title) client-side (pure). On a match, show a note under the chips: 'Already on your board: <title> · <where>'.
- Informational only, because a habit and a one-off may share a title.

**Files.** Lane C: src/app/actions/capture.ts. Lane B: CaptureChips.tsx, QuickCapture.tsx

**Tests.** today-ui-check.ts: the match on normTitle equality only, the cap, and the note copy.

## P3 · Speakable grammar for keyboard dictation (S)

**Why.** With Samsung or Gboard dictation, 'stretch 15 minutes daily hashtag body' becomes the title 'Stretch hashtag body', and 'read two hours on Saturday' gets no estimate. Fixing it costs about 10 taps. After: 0. There is no in-app mic and no LLM, per dropped.md.

**Spec.** Number-word durations:
- 'an hour', 'one…ten hours';
- 'ten / fifteen / twenty / thirty / forty-five / ninety minutes';
- 'an hour and a half'.
Line-edge tags and routing:
- 'hashtag X' or 'tag X' at the end of the line → #X, for the 8 tags only;
- 'for later' / 'to inbox' at the end of the line → inbox.
All gated like weak words.

**Files.** src/lib/capture-parse.ts; scripts/capture-parse-check.ts

**Tests.** Positive fixtures for each form.
Negatives:
- 'tag Sam in the photo' (not at the end of the line);
- 'ten minutes late' context;
- 'hashtag campaign plan'.
Parity, idempotence and the revert round trip on every fixture.

## P3 · Blank it: one-tap cloze in /add (S)

**Why.** Wrapping a phrase in {{ }} on the phone takes about 8 taps across two symbol-page trips. After: select the phrase, then 1 tap. On desktop, Ctrl+Shift+C.

**Spec.** - A 'Blank it' pill appears while the cloze textarea has a non-empty selection (selectionchange). On desktop the shortcut is Ctrl+Shift+C.
- It wraps the selection in {{ }}, and the 'Reviewer sees' preview updates.
- Never in FORMULA.

**Files.** src/components/AddIdeaForm.tsx

**Tests.** idea-capture-check.ts: the wrapSelection reducer — mid-word, a whole line, and an already-wrapped selection is not double-wrapped.

## Lanes

START CONDITION
Start only after the running redesign-fix workflow is merged and committed. The L1 and L5 redesign lanes own these files until then.

STEP 0 (lead, about 30 min): freeze the contracts so the four lanes compile independently.
- life-types.ts: CaptureToken.field adds 'answer'; ParsedCapture gains answer?: string | null.
- CapturedItem adds:
  - where: {lane: 'must'|'planned'|'habits'|'upcoming'|'later'|'anytime'|'inbox'|'goals'|'done'; label: string}
  - replacedId?
  - oldKept?
  - filing?
- New action signatures, each with a stub:
  - recaptureFromCapture
  - createManyFromCapture
  - loadCaptureVocabulary(opts) → {…, recent}
- splitIdeaLine(text) → {question, answer|null}
- idea-handoff.ts: writeIdeaHandoff / takeIdeaHandoff, key 'xtnl:add:handoff'
- fileIdeaDraftCore(userId, draftId)
- draftId?: string on SubmitIdeaInput, LinkIdeaInput and EnrichIdeaInput
- {status:'error'; message} on SubmitIdeaResult

LANE A, parser and keys (pure, no React)
- Owns:
  - src/lib/capture-parse.ts
  - src/lib/life-types.ts
  - src/lib/autocorrect.ts
  - src/components/useAutocorrect.ts
  - scripts/capture-parse-check.ts
  - package.json (it registers the new check scripts in life:check)
- Features: the English misfiles, Vietnamese-English, task-safe autocorrect, Ctrl/Cmd+K, the '::' answer split, speakable grammar.

LANE B, the capture sheet (client)
- Owns:
  - src/components/capture/** (QuickCapture, CaptureChips, capture-ui.ts, events.ts, layers.ts; new InsertRow.tsx, JustAdded.tsx, capture-queue.ts)
  - src/app/capture.css
  - src/components/shell/Chrome.tsx (3 aria-describedby attributes only)
  - scripts/today-ui-check.ts (its capture sections)
  - README.md (the prefill recipes)
- Features: burst capture, the Edit UI, the insert row, the cover layout, auto-retry, the sheet half of where-it-went and failures, paste preview, suggestions and vocab cache, Back closes, fragment prefill, the duplicate note.

LANE C, capture server and the Today board
- Owns:
  - src/app/actions/capture.ts
  - src/lib/tasks.ts
  - src/lib/today-board.ts
  - src/components/today/** (TodayBoard, TaskRow, InboxSheet, today.css)
  - scripts/board-check.ts
  - new scripts/capture-server-check.ts
- Features: recapture, placeOf/where and laterRows, the board flash, IDEA_DRAFT inbox chips, createManyFromCapture, the recent/active vocab, the answer→note write, and the after() call to fileIdeaDraftCore.

LANE D, idea capture
- Owns:
  - src/app/add/page.tsx
  - src/components/AddIdeaForm.tsx
  - src/app/actions/ideas.ts (with submitIdeaCore extracted)
  - src/lib/dedup.ts
  - src/lib/domain-discovery.ts
  - new src/lib/idea-handoff.ts and src/lib/idea-filing.ts
  - src/components/library/study.css (.add-sticky only)
  - new scripts/idea-capture-check.ts
- Features: the draft auto-clear, the handoff reader, autosave, the /add keyboard and sticky bar, the resilient submit, one-box filing core, Blank it.

ORDER
- A lands first, because B's applyInsert tests and C's re-parse depend on its rules.
- C and D next, in parallel.
- B last, because it consumes every contract.
- Each lane runs its own check script, tsc and lint before handing off.

LEAD AFTER MERGE
1. npm run life:check (with idea-capture-check and capture-server-check added)
2. tsc, lint, next build
3. scripts/ui-audit.mjs at 344, 375, 932 and 1440, including /today?capture=task
4. Rehearsal-server browser pass on the local Docker DB only
5. Fold device checks (cover and inner screens, Samsung Keyboard, Gboard, Telex)
6. Commit and push

Never write test rows to production. Subagents run no DB commands.

## Out of scope

- The Android share target, the token capture API and the Win+Shift+Q AutoHotkey recipe. They belong to M3, which the user dropped; ask the user before building any of them.
- A service worker or offline app shell. Serwist needs webpack config; revisit separately. Auto-retry covers lost and offline lines while the app is open.
- An in-app microphone, the Web Speech API, or any LLM or AI parsing of the capture line. dropped.md says the deterministic parser with visible chips is the only path.
- Re-parsing an older task after the 10-minute capture window to change its schedule, Must, deadline, estimate or goal link. That belongs to M2's pendingChange / weakening-change rules; the drawer's rename stays as it is.
- A statement-only idea box that invents the question from the model's atomicPrompt.
- Fetching page titles for pasted URLs (an SSRF surface) and URL-to-note parsing.
- Manifest shortcut changes, launch_handler, or a lightweight /capture route. They need a TWA APK rebuild and a measured cold start on the Fold first.
- Notices when the AI re-sizes a task, and any change to pricing, bands, repeat decay or the economy.
- Reading the clipboard on open (Chrome's permission prompt is worse friction).
- Board lane '+' seed buttons and 'leftover words look like a date' hint chips. Revisit if misfiles persist after the parser work.
- Any database migration or new column. None is needed: rawText, note, captureKey, archivedAt and CAPTURE_UNDO_MS cover everything.
- Native apps, home-screen widgets, Tasker or HTTP Shortcuts, or anything that needs a third-party account.

## Acceptance

1. CHECKS. These all pass:
- npm run life:check, including the 100+ new English fixtures and 40+ Vietnamese ones, each held to parity, idempotence and the revert round trip; the capture-ui tables; capture-server-check; idea-capture-check;
- tsc, lint and next build;
- scripts/ui-audit.mjs at 344, 375, 932 and 1440 with /today?capture=task open: no horizontal overflow, targets ≥ 40 (primary ≥ 44), text ≥ 12 px, no console errors.

2. FOLD COVER SCREEN. Run with Samsung Keyboard, then Gboard, then Vietnamese Telex.
- + opens the sheet. Three lines go in with the keyboard's action key, and the first press always saves.
- Add closes the sheet.
- The input does not move while chips appear.
- 'Added here' shows the rows with Edit and Undo.
- 'pay rent' + When·Fri + Must saves as By Fri 2 Oct, Must, in 12 taps.
- Back closes the sheet (P2).

3. INNER SCREEN. With the keyboard up, the 560 panel sits above the keyboard.

4. DESKTOP.
- c or Ctrl+K, a line, Enter saves and closes.
- Shift+Enter saves and stays.
- Ctrl+K works inside a text field and during a review (P2).

5. PARSER. Each line saves exactly as stated, matching its chips:
- 'gym mon wed fri' → Mon/Wed/Fri habit;
- 'standup mon-fri' → Weekdays;
- 'swim 400m' → no estimate;
- 'Q3 report due 30/9' → By today;
- 'họp team 3h chiều thứ 2' → Mon 5 Oct, no estimate;
- 'nộp báo cáo trước thứ 6 !' → By Fri, Must;
- 'did i lock the door?' → Inbox;
- 'email Val about the contract' keeps 'Val'.

6. EDIT. Saving 'gym mon wed' and then using Edit to add commas leaves exactly one active template; the old one is archived. A done-now line that is edited nets its first tick's XP to zero.

7. WHERE IT WENT. For an undated todo, a planned-later one-off, a habit not due today, an inbox line and a 10-day deadline: the toast names the place, and on /today the row flashes (Anytime opens; 'Planned later' lists the item).

8. FAILURES.
- 'x gym every mon' on a Thursday shows 'Saved, not ticked · It isn't due today.'
- A '!' with no day blocks the first Enter and offers the fix chips. A second Enter saves as 'Added (not a Must)'.

9. OFFLINE. In airplane mode, each capture shows 'Queued' and the + gets a dot with the sr text. When the network returns, the lines save with no taps, and no duplicate rows appear (checked on the local rehearsal DB).

10. IDEAS.
- The sheet's 'Idea (full form)' carries the question and answer.
- Create removes the Inbox draft and clears the sheet's line.
- Ctrl+Enter creates.
- Create sits above the phone keyboard.
- With GEMINI_API_KEY blank on the rehearsal server, a submit either files with the fallbacks or shows the honest error with every field intact. It never shows a generic error with the text gone.
- (P2) 'idea: Q :: A' files itself and leaves the Inbox empty. A saturated one stays as a draft with Finish.

11. HOUSE RULES.
- No database migration.
- The same line on the same day gives the same parse and price on the client and the server.
- No test rows are written to production.
