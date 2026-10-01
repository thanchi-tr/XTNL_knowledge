/**
 * The quick-capture grammar on fixed lines (src/lib/capture-parse.ts).
 *
 * No database and no browser. Every fixture is also held to three standing
 * properties, because they are what make the chips trustworthy:
 *
 *   - parity: the server's parse — the client payload after a JSON round
 *     trip and sanitizeCaptureInput — equals the parse the chips came from;
 *   - idempotence: re-reading a parsed title in its own mode adds no token;
 *   - revert round trip: tapping any chip puts its words back in the title,
 *     takes nothing else away, and un-tapping restores the original parse.
 *
 * Dates are read against Thursday 1 October 2026 unless a case says otherwise.
 *
 *   npx tsx scripts/capture-parse-check.ts
 */
import {
  CAPTURE_TYPOS,
  COMPULSORY_WARNING,
  MAX_CAPTURE_CHARS,
  MAX_REVERTED_SPANS,
  cleanCaptureKey,
  describeCaptureRule,
  formatMinutes,
  formatXp,
  isCaptureHotkey,
  isTypingTarget,
  matchParentGoal,
  parseCapture,
  sanitizeCaptureInput,
  shiftReverted,
  splitIdeaLine,
  tidyTitle,
  type CaptureSpan,
  type KeyLike,
} from "../src/lib/capture-parse";
import { autocorrectAtCaret, isBoundaryKey, type AutocorrectProfile } from "../src/lib/autocorrect";
import type { ParsedCapture } from "../src/lib/life-types";

const THU = "2026-10-01";
const FRI = "2026-10-02";
const SAT = "2026-10-03";
const SUN = "2026-10-04";

let failed = 0;
let passed = 0;
function report(name: string, ok: boolean, detail = ""): void {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The field of ParsedCapture each token kind fills; date and deadline share one. */
const SLOT: Record<ParsedCapture["tokens"][number]["field"], string> = {
  mode: "mode", done: "done", compulsory: "compulsory", inbox: "inbox", duration: "duration",
  recurrence: "recurrence", date: "date", deadline: "date", tag: "tag", horizon: "horizon",
  play: "play", parent: "parent", mvv: "mvv", study: "study", answer: "answer",
};
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const chips = (p: ParsedCapture, text: string) => p.tokens.map((t) => `${t.field}[${text.slice(t.start, t.end)}]`).join(" ");

type Want = Partial<Omit<ParsedCapture, "tokens">> & {
  /** Token fields in line order. */
  fields?: string[];
  /** Expected label for a field's (first) token. */
  labels?: Partial<Record<ParsedCapture["tokens"][number]["field"], string>>;
};

/** The three standing properties, on any parse. Returns the first problem, or null. */
function standing(text: string, today: string, reverted: CaptureSpan[] = []): string | null {
  const client = parseCapture(text, { today, reverted });

  // Tokens stay inside the line and never overlap each other or a revert.
  const spans = [...client.tokens].sort((a, b) => a.start - b.start);
  for (let i = 0; i < spans.length; i++) {
    const t = spans[i];
    if (t.start < 0 || t.end > text.length || t.start >= t.end) return `token ${t.id} out of bounds`;
    if (i > 0 && spans[i - 1].end > t.start) return `tokens ${spans[i - 1].id} and ${t.id} overlap`;
    // A study link is the one chip a revert cannot remove (in-app work is paid once, by reviews).
    if (t.field !== "study" && reverted.some((r) => r.start < t.end && t.start < r.end)) return `token ${t.id} overlaps a revert`;
  }

  // Parity: what the server reads is what the chips showed.
  const wire = JSON.parse(JSON.stringify({ text, reverted }));
  const input = sanitizeCaptureInput(wire.text, wire.reverted);
  const server = parseCapture(input.text, { today, reverted: input.reverted });
  if (!same(server, client)) return "server parse differs from the client parse";

  // Idempotence: the stored title read again in its own mode adds nothing
  // new. Two exemptions, both by design: a second token of a kind already
  // filled ('20m … 10m') stays as title text, so a re-read may find it; and
  // a reverted chip's words are title text on purpose, so lines with
  // reverts are not re-read at all.
  if (client.title && reverted.length === 0) {
    const again = parseCapture(client.title, { today, mode: client.mode });
    const filled = new Set(client.tokens.map((t) => SLOT[t.field]));
    const added = again.tokens.filter((t) => t.field !== "study" && !filled.has(SLOT[t.field]));
    if (added.length > 0) return `re-parsing '${client.title}' adds ${chips({ ...again, tokens: added }, client.title)}`;
    const extra = again.tokens.filter((t) => t.field !== "study");
    if (extra.length === 0 && again.title !== client.title) return `re-parsing changes the title to '${again.title}'`;
    if (!filled.has("study") && again.autoMetric !== null) return `re-parsing '${client.title}' adds a study link`;
  }

  // Revert round trip, one chip at a time. A study chip is not revertible:
  // tapping it must change nothing, so a link to in-app reviews can never
  // silently become a task that pays for the same work again.
  for (const t of client.tokens) {
    const words = text.slice(t.start, t.end);
    const off = parseCapture(text, { today, reverted: [...reverted, { start: t.start, end: t.end }] });
    if (t.field === "study") {
      if (!same(off, client)) return `reverting study link ${t.id} changed the parse (autoMetric ${off.autoMetric})`;
      continue;
    }
    if (off.tokens.some((o) => o.start < t.end && t.start < o.end)) return `reverting ${t.id} leaves a token on its span`;
    if (!norm(off.title).includes(norm(words))) return `reverting ${t.id} does not put '${words}' in the title ('${off.title}')`;
    for (const other of client.tokens) {
      if (other === t) continue;
      // Two exemptions, both by design: a date and a deadline are one slot
      // (R8: reverting the Must makes its day planned again), and a token
      // only one mode reads goes with that mode's prefix — an idea's answer,
      // a goal's 'this year' (R14).
      if (t.field === "mode" && (other.field === "answer" || /^this\s+year$/i.test(text.slice(other.start, other.end)))) continue;
      if (!off.tokens.some((o) => o.start === other.start && o.end === other.end && SLOT[o.field] === SLOT[other.field])) {
        return `reverting ${t.id} also loses ${other.id}`;
      }
    }
    const back = parseCapture(text, { today, reverted });
    if (!same(back, client)) return `restoring ${t.id} does not give the original parse`;
  }
  return null;
}

let fixtures = 0;
function fx(text: string, want: Want, today = THU, reverted: CaptureSpan[] = []): void {
  fixtures++;
  const p = parseCapture(text, { today, reverted });
  const problems: string[] = [];
  const { fields, labels, ...fieldsWanted } = want;
  for (const [k, v] of Object.entries(fieldsWanted)) {
    const got = (p as unknown as Record<string, unknown>)[k];
    if (!same(got, v)) problems.push(`${k}=${JSON.stringify(got)} (wanted ${JSON.stringify(v)})`);
  }
  if (fields && !same(p.tokens.map((t) => t.field), fields)) {
    problems.push(`tokens ${chips(p, text) || "none"} (wanted ${fields.join(",") || "none"})`);
  }
  if (labels) {
    for (const [field, label] of Object.entries(labels)) {
      const got = p.tokens.find((t) => t.field === field)?.label;
      if (got !== label) problems.push(`${field} label '${got}' (wanted '${label}')`);
    }
  }
  const prop = standing(text, today, reverted);
  if (prop) problems.push(prop);
  report(`'${text}'${today !== THU ? ` @${today}` : ""}${reverted.length ? ` reverting ${JSON.stringify(reverted)}` : ""}`, problems.length === 0, problems.join("; ") || `${p.title} · ${chips(p, text) || "no tokens"}`);
}

/** The span of the first occurrence of a substring, for revert fixtures. */
function spanOf(text: string, part: string): CaptureSpan {
  const start = text.indexOf(part);
  return { start, end: start + part.length };
}

console.log("── The spec's fixtures");
// capture.md R1: a named-day chip reads 'Every …' in the sheet (the board keeps 'Mon · Thu').
fx("gym legs 60m every mon,thu !", { title: "Gym legs", kind: "HABIT", recurrence: "DOW:1,4", estMinutes: 60, compulsory: true, compulsoryWarning: null, fields: ["duration", "recurrence", "compulsory"], labels: { recurrence: "Every Mon · Thu", duration: "~1h" } });
fx("pay rent every 1st !", { title: "Pay rent", recurrence: "MONTHLY:1", compulsory: true, labels: { recurrence: "Monthly · 1st" } });
fx("review 20 daily !", { title: "Review 20", recurrence: "DAILY", compulsory: true, autoMetric: "REVIEWS", autoTarget: 20, fields: ["study", "recurrence", "compulsory"] });
// capture.md R15: a weak day closing the line is a date ('enjoy the sun' is not).
fx("call mum sun", { title: "Call mum", dueDay: SUN, dueKind: "PLANNED", fields: ["date"] });
fx("goal: read 12 books by dec #long", { title: "Read 12 books", mode: "GOAL", kind: "GOAL", dueDay: "2026-12-31", dueKind: "DEADLINE", horizon: "LONG", fields: ["mode", "deadline", "horizon"] });
fx("submit report by fri", { title: "Submit report", dueDay: FRI, dueKind: "DEADLINE", labels: { deadline: "By today" } }, FRI);
fx("tmr 7pm dentist", { title: "7pm dentist", dueDay: FRI, dueKind: "PLANNED", fields: ["date"] });
fx("x run 30m", { title: "Run", doneNow: true, estMinutes: 30, fields: ["done", "duration"] });
fx("every! 3 days water plants", { title: "Water plants", recurrence: "AFTER:3", kind: "HABIT", labels: { recurrence: "3 days after done" } });
fx("meet may on sat", { title: "Meet may", dueDay: SAT, dueKind: "PLANNED", fields: ["date"] });
fx("run 5km", { title: "Run 5km", estMinutes: null, fields: [] });
fx("run 5k 28m", { title: "Run 5k", estMinutes: 28 });

console.log("\n── Modes");
fx("idea: base rates beat anecdotes", { title: "Base rates beat anecdotes", mode: "IDEA", kind: "IDEA_DRAFT", inbox: true, fields: ["mode"] });
fx("i: why is the sky blue? tomorrow 30m", { title: "Why is the sky blue? tomorrow 30m", mode: "IDEA", dueDay: null, estMinutes: null, inbox: true, fields: ["mode"] });
fx("Idea: spaced repetition beats cramming", { mode: "IDEA", title: "Spaced repetition beats cramming" });
// capture.md P2: the first '::' splits an idea; the answer is kept whole, out of the title.
fx("idea: why do bonds fall :: rates rise, price falls", { mode: "IDEA", title: "Why do bonds fall", answer: "rates rise, price falls", fields: ["mode", "answer"] });
fx("goal mid: learn guitar", { title: "Learn guitar", mode: "GOAL", horizon: "MID", labels: { mode: "Goal · Mid" } });
fx("goal: run a marathon", { title: "Run a marathon", mode: "GOAL", horizon: null });
fx("goal: ship thesis draft in 3 weeks", { title: "Ship thesis draft", dueDay: "2026-10-22", dueKind: "PLANNED", horizon: "SHORT" });
fx("goal: save 10k by 30/6/2027", { title: "Save 10k", dueDay: "2027-06-30", dueKind: "DEADLINE", horizon: "LONG" });
fx("goal: learn 500 words by 15 jan", { title: "Learn 500 words", dueDay: "2027-01-15", horizon: "MID" });
fx("goal long: become fluent in japanese", { title: "Become fluent in japanese", horizon: "LONG" });
fx("goal: run 5k in 25 min by dec", { title: "Run 5k in 25 min", estMinutes: null, dueDay: "2026-12-31", horizon: "MID" });
fx("goal: finish thesis !", { title: "Finish thesis !", compulsory: false, compulsoryWarning: null });
fx("learn spanish #mid", { title: "Learn spanish", mode: "GOAL", kind: "GOAL", horizon: "MID", fields: ["horizon"] });
fx("did laundry", { title: "Laundry", doneNow: true, kind: "TASK" });
fx("done 30 pushups", { title: "30 pushups", doneNow: true, estMinutes: null });
fx("X ran 5k 28m", { title: "Ran 5k", doneNow: true, estMinutes: 28 });
fx("xylophone practice", { title: "Xylophone practice", doneNow: false, fields: [] });
fx("x", { title: "X", doneNow: false, fields: [] });
fx("did stretch 10m daily", { title: "Stretch", doneNow: true, recurrence: "DAILY", kind: "HABIT" });

console.log("\n── Duration");
fx("read ~30m", { title: "Read", estMinutes: 30, labels: { duration: "~30m" } });
fx("meditate 10 min", { title: "Meditate", estMinutes: 10 });
fx("study 1h", { title: "Study", estMinutes: 60 });
fx("deep work 1h30", { title: "Deep work", estMinutes: 90, labels: { duration: "~1h30" } });
fx("deep work 1.5h", { estMinutes: 90 });
fx("walk 90min", { title: "Walk", estMinutes: 90 });
fx("essay 2 hours", { title: "Essay", estMinutes: 120 });
fx("essay 2hrs", { estMinutes: 120 });
fx("workout 1h 15m", { title: "Workout", estMinutes: 75 });
fx("workout 1h 15 min", { title: "Workout", estMinutes: 75 });
fx("swim 400 m", { title: "Swim 400 m", estMinutes: null });
fx("call 3 mins", { title: "Call", estMinutes: 3 });
// capture.md clock-time guard: '12h' can only be a time of day (an estimate stops at 8 h); '12 hours' still clamps.
fx("marathon training 12 hours", { title: "Marathon training", estMinutes: 480 });
fx("marathon training 12h", { title: "Marathon training 12h", estMinutes: null, fields: [] });
fx("sleep 0m", { title: "Sleep 0m", estMinutes: null });
fx("run for 30m", { title: "Run", estMinutes: 30 });
fx("dinner at 7pm", { title: "Dinner at 7pm", estMinutes: null, fields: [] });
fx("take 10mg meds", { title: "Take 10mg meds", estMinutes: null });
fx("nap half an hour", { title: "Nap", estMinutes: 30 });
fx("plank ~ 5m", { title: "Plank", estMinutes: 5 });
fx("read 20m then write 10m", { title: "Read then write 10m", estMinutes: 20 });

console.log("\n── Recurrence");
fx("floss daily", { title: "Floss", recurrence: "DAILY", kind: "HABIT" });
fx("floss every day", { recurrence: "DAILY" });
fx("floss everyday", { recurrence: "DAILY" });
fx("standup weekdays", { title: "Standup", recurrence: "WEEKDAYS" });
fx("standup every weekday", { recurrence: "WEEKDAYS" });
fx("long run weekends", { title: "Long run", recurrence: "DOW:6,7", labels: { recurrence: "Every Sat · Sun" } });
fx("yoga every tue", { title: "Yoga", recurrence: "DOW:2" });
fx("yoga every tue, thu", { recurrence: "DOW:2,4" });
fx("yoga every tue and thu", { recurrence: "DOW:2,4" });
fx("gym every monday & thursday", { recurrence: "DOW:1,4" });
fx("gym every mon wed fri", { title: "Gym", recurrence: "DOW:1,3,5" });
fx("gym every mon,tue,wed,thu,fri", { recurrence: "WEEKDAYS" });
fx("walk every sat", { recurrence: "DOW:6", dueDay: null });
fx("swim mondays and thursdays", { title: "Swim", recurrence: "DOW:1,4" });
fx("piano on mon & thu", { title: "Piano", recurrence: "DOW:1,4" });
fx("piano mon/thu", { title: "Piano", recurrence: "DOW:1,4" });
fx("brunch sat and sun", { title: "Brunch sat and sun", recurrence: null, dueDay: null, fields: [] });
fx("water plants every other day", { title: "Water plants", recurrence: "EVERY:2", labels: { recurrence: "Every other day" } });
fx("change sheets every 2 weeks", { title: "Change sheets", recurrence: "EVERY:14", labels: { recurrence: "Every 2 weeks" } });
fx("bins every 7 days", { recurrence: "EVERY:7" });
fx("check oil every 1 day", { recurrence: "DAILY" });
fx("cut hair every 6 weeks", { recurrence: "EVERY:42" });
fx("clean fridge fortnightly", { title: "Clean fridge", recurrence: "EVERY:14" });
fx("weekly review", { title: "Review", recurrence: "EVERY:7", labels: { recurrence: "Weekly" } });
fx("plan week weekly on sun", { title: "Plan week", recurrence: "DOW:7" });
fx("change sheets every 2 weeks on mon", { title: "Change sheets", recurrence: "EVERY:14", dueDay: "2026-10-05" });
// 'every other <weekday>' is fortnightly on that weekday, never a one-off
// ('Every other bins' due Monday was the old reading).
fx("every other mon bins", { title: "Bins", kind: "HABIT", recurrence: "EVERY:14", dueDay: "2026-10-05", dueKind: "PLANNED", fields: ["recurrence"], labels: { recurrence: "Every 2 weeks · Mon" } });
fx("bins every second thursday !", { title: "Bins", recurrence: "EVERY:14", dueDay: THU, compulsory: true });
fx("every alternate sat long run", { title: "Long run", recurrence: "EVERY:14", dueDay: SAT });
// A monthly 'second Tuesday' is not in the grammar: it stays text rather than becoming a wrong one-off date.
fx("every second tue of the month bills", { recurrence: null, dueDay: null, fields: [] });
fx("budget monthly", { title: "Budget", recurrence: "MONTHLY:1" });
fx("budget monthly", { recurrence: "MONTHLY:17", labels: { recurrence: "Monthly · 17th" } }, "2026-10-17");
fx("budget monthly from 22 oct", { recurrence: "MONTHLY:22", dueDay: "2026-10-22" });
fx("invoice monthly on 15", { title: "Invoice", recurrence: "MONTHLY:15" });
fx("invoice every 15th", { recurrence: "MONTHLY:15" });
fx("rent on the 1st of every month", { title: "Rent", recurrence: "MONTHLY:1" });
fx("credit card every 31st", { recurrence: "MONTHLY:31", labels: { recurrence: "Monthly · 31st" } });
fx("descale kettle 3 days after", { title: "Descale kettle", recurrence: "AFTER:3" });
fx("mow lawn 2 weeks after done", { title: "Mow lawn", recurrence: "AFTER:14" });
fx("every! week call grandma", { title: "Call grandma", recurrence: "AFTER:7" });
fx("gym 3x a week", { title: "Gym", recurrence: "TARGET:3/W", labels: { recurrence: "3× a week" } });
fx("gym 3 times a week", { recurrence: "TARGET:3/W" });
fx("run 3/wk", { title: "Run", recurrence: "TARGET:3/W" });
fx("gym 4x/week", { recurrence: "TARGET:4/W" });
fx("date night twice a month", { title: "Date night", recurrence: "TARGET:2/M", labels: { recurrence: "Twice a month" } });
fx("swim once a week", { recurrence: "TARGET:1/W", labels: { recurrence: "Once a week" } });
fx("stretch 9x/week", { recurrence: "TARGET:7/W" });
fx("meditate every morning", { title: "Meditate", recurrence: "DAILY" });
fx("5x5 squats", { title: "5x5 squats", recurrence: null, fields: [] });

console.log("\n── Dates");
fx("dentist today", { title: "Dentist", dueDay: THU, dueKind: "PLANNED", labels: { date: "Today" } });
fx("movie tonight", { title: "Movie", dueDay: THU });
fx("call bank tomorrow", { title: "Call bank", dueDay: FRI, labels: { date: "Tomorrow" } });
fx("call bank tmrw", { dueDay: FRI });
fx("dentist fri", { dueDay: FRI });
fx("dentist thu", { dueDay: THU });
fx("dentist wed", { dueDay: "2026-10-07", labels: { date: "Wed 7 Oct" } });
fx("dentist next fri", { title: "Dentist", dueDay: "2026-10-09" });
fx("dentist next week", { dueDay: "2026-10-05" });
fx("renew licence in 3 days", { title: "Renew licence", dueDay: SUN });
fx("renew licence in 2 weeks", { dueDay: "2026-10-15" });
fx("renew licence in a week", { dueDay: "2026-10-08" });
fx("renew passport in 2 months", { dueDay: "2026-12-01" });
fx("party 15 oct", { title: "Party", dueDay: "2026-10-15" });
fx("party oct 15", { dueDay: "2026-10-15" });
fx("party 15th october", { dueDay: "2026-10-15" });
fx("birthday 20/11", { title: "Birthday", dueDay: "2026-11-20" });
// capture.md R9: a yearless date 1–60 days ago is today, and says so; older ones are next year's.
fx("birthday 5 sep", { dueDay: THU, dueKind: "PLANNED", labels: { date: "Today · 5 Sep passed" } });
fx("birthday 5 jul", { dueDay: "2027-07-05", labels: { date: "Mon 5 Jul 2027" } });
fx("party 15/10/2027", { dueDay: "2027-10-15" });
fx("invalid 31/9", { title: "Invalid 31/9", dueDay: null });
fx("dentist on 29 feb", { dueDay: "2028-02-29" });
fx("report eom", { title: "Report", dueDay: "2026-10-31", dueKind: "PLANNED" });
fx("report by eom", { dueDay: "2026-10-31", dueKind: "DEADLINE" });
fx("tax by 31/10", { title: "Tax", dueDay: "2026-10-31", dueKind: "DEADLINE", labels: { deadline: "By Sat 31 Oct" } });
fx("tax due fri", { title: "Tax", dueDay: FRI, dueKind: "DEADLINE" });
fx("essay due 20 oct", { title: "Essay", dueDay: "2026-10-20", dueKind: "DEADLINE" });
fx("essay due by 20 oct", { title: "Essay", dueKind: "DEADLINE" });
fx("bbq on sun", { title: "Bbq", dueDay: SUN });
fx("bbq sun", { title: "Bbq", dueDay: SUN }); // R15
fx("call mum sunday", { title: "Call mum", dueDay: SUN });
fx("plan trip may", { title: "Plan trip may", dueDay: null });
fx("visa by may", { title: "Visa", dueDay: "2027-05-31", dueKind: "DEADLINE" });
fx("call on the 15th", { title: "Call", dueDay: "2026-10-15" });
fx("pay on the 3rd", { title: "Pay", dueDay: SAT });
fx("holiday in dec", { title: "Holiday", dueDay: "2026-12-01" });
fx("clean gutters this weekend", { title: "Clean gutters", dueDay: SAT });
fx("clean gutters this weekend", { dueDay: SUN }, SUN);
fx("report the day after tomorrow", { title: "Report", dueDay: SAT });
fx("submit by next week", { title: "Submit", dueDay: "2026-10-05", dueKind: "DEADLINE" });
fx("march in the parade", { title: "March in the parade", dueDay: null });
fx("ring vet 3 mar", { title: "Ring vet", dueDay: "2027-03-03" });
fx("ring vet mar 3", { title: "Ring vet", dueDay: "2027-03-03" }); // R15: a weak month before its day number
fx("ring vet by mar 3", { title: "Ring vet", dueDay: "2027-03-03", dueKind: "DEADLINE" });
fx("tidy desk by tonight", { title: "Tidy desk", dueDay: THU, dueKind: "DEADLINE", labels: { deadline: "By today" } });
fx("eat 5 a day", { title: "Eat 5", recurrence: "DAILY", fields: ["recurrence"] }); // R5: a count before 'a day'
fx("dentist (tmr)", { title: "Dentist", dueDay: FRI });
fx("move desk tue to fri", { title: "Move desk to fri", dueDay: "2026-10-06" });
fx("weekly shop next month", { recurrence: "EVERY:7", dueDay: "2026-11-01" });

console.log("\n── Compulsory");
fx("must call landlord by fri", { title: "Call landlord", compulsory: true, dueKind: "DEADLINE" });
fx("pay rent !", { title: "Pay rent", compulsory: false, compulsoryWarning: COMPULSORY_WARNING, labels: { compulsory: "Compulsory · needs a schedule" } });
// capture.md R8: a Must on a planned one-off makes its day the deadline.
fx("pay rent fri !", { compulsory: true, compulsoryWarning: null, dueDay: FRI, dueKind: "DEADLINE", fields: ["deadline", "compulsory"], labels: { deadline: "By tomorrow" } });
fx("meds daily !!", { title: "Meds", compulsory: true });
fx("water plants every! 3 days !", { recurrence: "AFTER:3", compulsory: false, compulsoryWarning: COMPULSORY_WARNING });
fx("gym 3x/week must", { recurrence: "TARGET:3/W", compulsory: false, compulsoryWarning: COMPULSORY_WARNING });
fx("file taxes by 31/10!", { title: "File taxes", compulsory: true, dueKind: "DEADLINE" });
fx("wow what a day!", { title: "Wow what a day", compulsory: false, compulsoryWarning: COMPULSORY_WARNING });
fx("mustard shopping", { title: "Mustard shopping", compulsory: false, fields: [] });
fx("MUST renew rego by 15/10", { title: "Renew rego", compulsory: true });
fx("meds daily !?", { title: "Meds", compulsory: true, inbox: true, fields: ["recurrence", "compulsory", "inbox"] });
fx("call bank tomorrow?!", { title: "Call bank", inbox: true, compulsory: true, compulsoryWarning: null, dueKind: "DEADLINE", fields: ["deadline", "inbox", "compulsory"] }); // R8

console.log("\n── A second schedule stays text, whole");
fx("stretch daily every mon,thu", { title: "Stretch daily", recurrence: "DOW:1,4", dueDay: null, fields: ["recurrence"] });
fx("stretch every 2 weeks every mon,thu", { title: "Stretch every 2 weeks", recurrence: "DOW:1,4", dueDay: null });
fx("stretch 3x/week every mon,thu", { title: "Stretch every mon,thu", recurrence: "TARGET:3/W", dueDay: null });
fx("gym 3x/week on mon & thu", { title: "Gym on mon & thu", recurrence: "TARGET:3/W", dueDay: null });
fx("goal: gym every mon,thu", { title: "Gym every mon,thu", mode: "GOAL", dueDay: null, fields: ["mode"] });
fx("dentist on sat, call mum", { title: "Dentist, call mum", dueDay: SAT });

console.log("\n── Tags, play, parent, minimum, inbox");
fx("walk 30m #body", { title: "Walk", track: "BODY", estMinutes: 30, labels: { tag: "Body" } });
fx("write #craft #duty", { title: "Write #duty", track: "CRAFT" });
fx("guitar #play daily", { title: "Guitar", intrinsic: true, recurrence: "DAILY" });
fx("train intervals ^marathon", { title: "Train intervals", parentHint: "marathon", labels: { parent: "^ marathon" } });
fx('long run ^"run a marathon" sat', { title: "Long run", parentHint: "run a marathon", dueDay: SAT }); // R15: the last word before a ^goal
fx("pushups daily (min: 10 pushups)", { title: "Pushups", mvv: "10 pushups", recurrence: "DAILY" });
fx("pushups daily (min 5)", { mvv: "5" });
fx("stretch 15m daily min: 2 min", { title: "Stretch", mvv: "2 min", estMinutes: 15, recurrence: "DAILY" });
fx("stretch daily min: 2 min !", { title: "Stretch", mvv: "2 min", compulsory: true });
fx("stretch daily min: 2 min #body ^mobility", { mvv: "2 min", track: "BODY", parentHint: "mobility" });
fx("should i buy a bike?", { title: "Should i buy a bike", inbox: true, labels: { inbox: "Inbox" } });
fx("call bank ?", { title: "Call bank", inbox: true });
fx("fix bike #unknown", { title: "Fix bike #unknown", track: null, fields: [] });

console.log("\n── Study links");
fx("review due", { title: "Review due", autoMetric: "REVIEW_DUE", autoTarget: null, fields: ["study"] });
fx("clear the queue daily", { title: "Clear the queue", autoMetric: "REVIEW_DUE", recurrence: "DAILY" });
fx("add 3 ideas by fri", { title: "Add 3 ideas", autoMetric: "IDEAS", autoTarget: 3, dueDay: FRI, dueKind: "DEADLINE" });
fx("do 20 reviews", { title: "Do 20 reviews", autoMetric: "REVIEWS", autoTarget: 20 });
fx("review 30 cards weekdays !", { title: "Review 30 cards", autoMetric: "REVIEWS", autoTarget: 30, recurrence: "WEEKDAYS", compulsory: true });
fx("review 3 chapters", { title: "Review 3 chapters", autoMetric: null, fields: [] });
fx("review 800 daily", { autoMetric: "REVIEWS", autoTarget: 500 });
fx("review 20", { title: "Review 20", autoMetric: "REVIEWS", autoTarget: 20 });

console.log("\n── Study links: the common phrasings of in-app work link (and pay 0)");
fx("do reviews daily !", { title: "Do reviews", autoMetric: "REVIEW_DUE", autoTarget: null, recurrence: "DAILY", compulsory: true, fields: ["study", "recurrence", "compulsory"] });
fx("reviews daily", { title: "Reviews", autoMetric: "REVIEW_DUE", recurrence: "DAILY", fields: ["study", "recurrence"] });
fx("review cards daily", { title: "Review cards", autoMetric: "REVIEW_DUE", recurrence: "DAILY" });
fx("add an idea daily", { title: "Add an idea", autoMetric: "IDEAS", autoTarget: 1, recurrence: "DAILY" });
fx("clear my reviews", { title: "Clear my reviews", autoMetric: "REVIEW_DUE", fields: ["study"] });
fx("do my reviews tonight", { title: "Do my reviews", autoMetric: "REVIEW_DUE", dueDay: THU });
fx("finish all my flashcards", { autoMetric: "REVIEW_DUE" });
fx("review my flashcards weekdays", { title: "Review my flashcards", autoMetric: "REVIEW_DUE", recurrence: "WEEKDAYS" });
fx("review 20 flashcards", { autoMetric: "REVIEWS", autoTarget: 20 });
fx("20 flashcards daily", { title: "20 flashcards", autoMetric: "REVIEWS", autoTarget: 20, recurrence: "DAILY" });
fx("add ideas", { autoMetric: "IDEAS", autoTarget: 1 });
fx("log two new ideas daily", { title: "Log two new ideas", autoMetric: "IDEAS", autoTarget: 2, recurrence: "DAILY" });
fx("new idea daily", { title: "New idea", autoMetric: "IDEAS", autoTarget: 1, recurrence: "DAILY" });
fx("flashcards 20m daily", { title: "Flashcards", autoMetric: "REVIEW_DUE", estMinutes: 20, recurrence: "DAILY" });
fx("x reviews", { title: "Reviews", doneNow: true, autoMetric: "REVIEW_DUE" });

console.log("\n── Study links: outside study and other people's reviews stay paying work");
fx("study chapter 5", { title: "Study chapter 5", autoMetric: null, fields: [] });
fx("revise for the exam", { title: "Revise for the exam", autoMetric: null, fields: [] });
fx("review chapter 5", { autoMetric: null, fields: [] });
fx("review lecture notes daily", { title: "Review lecture notes", autoMetric: null, recurrence: "DAILY" });
fx("weekly review", { title: "Review", autoMetric: null, recurrence: "EVERY:7" });
fx("write performance reviews by fri", { title: "Write performance reviews", autoMetric: null, dueDay: FRI });
fx("do the code reviews", { autoMetric: null, fields: [] });
fx("code reviews daily", { title: "Code reviews", autoMetric: null, recurrence: "DAILY" });
fx("do anki reviews daily", { title: "Do anki reviews", autoMetric: null, recurrence: "DAILY" });
fx("anki 20 cards", { autoMetric: null, fields: [] });
fx("read product reviews", { autoMetric: null, fields: [] });
fx("write 20 reviews", { autoMetric: null, fields: [] });
fx("add ideas to the wedding doc", { autoMetric: null, fields: [] });
fx("brainstorm ideas for the party", { autoMetric: null, fields: [] });
fx("review the contract", { autoMetric: null, fields: [] });
fx("idea: do reviews daily", { mode: "IDEA", autoMetric: null });

console.log("\n── Reverted chips");
{
  const t = "gym legs 60m every mon,thu !";
  fx(t, { title: "Gym legs every mon,thu", recurrence: null, compulsory: false, compulsoryWarning: COMPULSORY_WARNING }, THU, [spanOf(t, "every mon,thu")]);
  fx(t, { title: "Gym legs 60m", estMinutes: null, recurrence: "DOW:1,4" }, THU, [spanOf(t, "60m")]);
  const u = "call bank tomorrow";
  fx(u, { title: "Call bank tomorrow", dueDay: null, fields: [] }, THU, [spanOf(u, "tomorrow")]);
  const v = "x run 30m";
  fx(v, { title: "X run", doneNow: false, estMinutes: 30 }, THU, [spanOf(v, "x")]);
  const w = "idea: rest days count 30m";
  fx(w, { mode: "TASK", title: "Idea: rest days count", estMinutes: 30 }, THU, [spanOf(w, "idea:")]);
  // A study link survives a revert: tapping its chip cannot turn in-app
  // reviews into a task that pays life XP on top of their Domain points.
  const x = "review 20 daily";
  fx(x, { title: "Review 20", autoMetric: "REVIEWS", autoTarget: 20, recurrence: "DAILY", fields: ["study", "recurrence"] }, THU, [spanOf(x, "review 20")]);
  const x2 = "review 20 daily !";
  fx(x2, { autoMetric: "REVIEWS", autoTarget: 20, compulsory: true }, THU, [{ start: 0, end: 9 }]);
  const x3 = "do reviews daily";
  fx(x3, { autoMetric: "REVIEW_DUE", recurrence: "DAILY" }, THU, [spanOf(x3, "do reviews")]);
  // A title-only link holds whether its own noun or its schedule is reverted.
  const x4 = "reviews daily";
  fx(x4, { title: "Reviews", autoMetric: "REVIEW_DUE", recurrence: "DAILY" }, THU, [spanOf(x4, "reviews")]);
  fx(x4, { title: "Reviews daily", autoMetric: "REVIEW_DUE", recurrence: null }, THU, [spanOf(x4, "daily")]);
  const y = "goal: read 12 books by dec";
  fx(y, { mode: "TASK", kind: "TASK", title: "Goal: read 12 books", dueDay: "2026-12-31" }, THU, [spanOf(y, "goal:")]);

  // Edit after a revert: typing before the span shifts it and the decision holds.
  const before = "call bank tomorrow";
  const kept = [spanOf(before, "tomorrow")];
  const after = "please call bank tomorrow";
  const shifted = shiftReverted(before, after, kept);
  const p = parseCapture(after, { today: THU, reverted: shifted });
  report("a revert survives typing before it", p.dueDay === null && p.title === "Please call bank tomorrow", JSON.stringify(shifted));
  // Editing inside the reverted words drops the revert, so they parse afresh.
  const edited = "call bank tmrw";
  const dropped = shiftReverted(before, edited, kept);
  report("editing reverted words drops the revert", dropped.length === 0 && parseCapture(edited, { today: THU, reverted: dropped }).dueDay === FRI);
}

console.log("\n── shiftReverted");
{
  const s = (a: string, b: string, r: CaptureSpan[], want: CaptureSpan[]) =>
    report(`shift '${a}' → '${b}'`, same(shiftReverted(a, b, r), want), JSON.stringify(shiftReverted(a, b, r)));
  s("abc def", "abc def", [{ start: 4, end: 7 }], [{ start: 4, end: 7 }]);
  s("abc def", "xx abc def", [{ start: 4, end: 7 }], [{ start: 7, end: 10 }]);
  s("abc def", "abc def ghi", [{ start: 4, end: 7 }], [{ start: 4, end: 7 }]);
  s("abc def", "abc dxf", [{ start: 4, end: 7 }], []);
  s("abc def", "ab def", [{ start: 4, end: 7 }], [{ start: 3, end: 6 }]);
  s("abc def ghi", "abc ghi", [{ start: 0, end: 3 }, { start: 8, end: 11 }], [{ start: 0, end: 3 }, { start: 4, end: 7 }]);
}

console.log("\n── sanitizeCaptureInput");
{
  report("non-string text becomes empty", sanitizeCaptureInput(42, []).text === "");
  report(`text is capped at ${MAX_CAPTURE_CHARS}`, sanitizeCaptureInput("a".repeat(900), []).text.length === MAX_CAPTURE_CHARS);
  const junk = [{ start: 0, end: 3 }, { start: 5, end: 2 }, { start: -1, end: 2 }, { start: 1.5, end: 3 }, { start: 0, end: 99 }, null, "x", { start: "0", end: 2 }];
  report("invalid spans are dropped", same(sanitizeCaptureInput("abcdef", junk).reverted, [{ start: 0, end: 3 }]));
  const many = Array.from({ length: 40 }, (_, i) => ({ start: i, end: i + 1 }));
  report(`at most ${MAX_REVERTED_SPANS} spans`, sanitizeCaptureInput("x".repeat(60), many).reverted.length === MAX_REVERTED_SPANS);
  report("spans are sorted", same(sanitizeCaptureInput("abcdef", [{ start: 3, end: 4 }, { start: 0, end: 1 }]).reverted, [{ start: 0, end: 1 }, { start: 3, end: 4 }]));
  report("a non-array revert list is ignored", sanitizeCaptureInput("abc", { start: 0, end: 1 }).reverted.length === 0);
  // The retry key: the sheet's per-line nonce ('<ms base36>-<n>') passes;
  // anything else is dropped (the save still works, it just is not deduped).
  report(
    "capture key: the sheet's nonce passes, junk is dropped",
    cleanCaptureKey("mgb7x2k1-3") === "mgb7x2k1-3" && cleanCaptureKey("x") === null && cleanCaptureKey("a b c d") === null && cleanCaptureKey(42) === null && cleanCaptureKey("k".repeat(65)) === null
  );
}

console.log("\n── Parent goals");
{
  const goals = [
    { id: "g1", title: "Run a marathon" },
    { id: "g2", title: "Read 12 books" },
    { id: "g3", title: "Learn Japanese" },
  ];
  report("'^marathon' finds 'Run a marathon'", matchParentGoal("marathon", goals)?.id === "g1");
  report("'^books' finds 'Read 12 books'", matchParentGoal("books", goals)?.id === "g2");
  report("'^japanse' (typo) finds 'Learn Japanese'", matchParentGoal("japanse", goals)?.id === "g3");
  report("'^taxes' finds nothing", matchParentGoal("taxes", goals) === null);
  report("an empty hint finds nothing", matchParentGoal("  ", goals) === null);
  report("a one-letter hint names nothing (it is inside every title)", matchParentGoal("a", goals) === null && matchParentGoal("n", goals) === null);
  // The server links with this same function over the same list the chip
  // previews (tasks.ts loadOpenGoals), so the chip's pick is what lands.
  // The server's old matcher (startsWith, else Dice ≥ 0.35) linked nothing here.
  const fit = [{ id: "f1", title: "Get fit by summer" }, { id: "f2", title: "Run a marathon" }];
  const hint = parseCapture("pushups 10m ^fit", { today: THU }).parentHint ?? "";
  report("'^fit' picks 'Get fit by summer' — chip and server alike", hint === "fit" && matchParentGoal(hint, fit)?.id === "f1", `hint '${hint}'`);
}

console.log("\n── Hotkey");
{
  const key = (k: string, mods: Partial<KeyLike> = {}): KeyLike => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods });
  const body = { tagName: "BODY", closest: () => null };
  const input = { tagName: "INPUT" };
  const area = { tagName: "textarea" };
  const select = { tagName: "SELECT" };
  const editable = { tagName: "DIV", isContentEditable: true };
  const inSheet = { tagName: "BUTTON", closest: (s: string) => (s === "[data-capture-sheet]" ? {} : null) };
  const h = (name: string, got: boolean, want: boolean) => report(`hotkey: ${name}`, got === want, `got ${got}`);
  h("'c' on the page opens", isCaptureHotkey(key("c"), body, false), true);
  h("Ctrl+K opens", isCaptureHotkey(key("k", { ctrlKey: true }), body, false), true);
  h("Cmd+K opens", isCaptureHotkey(key("K", { metaKey: true }), body, false), true);
  h("'c' in an input is ignored", isCaptureHotkey(key("c"), input, false), false);
  h("'c' in a textarea is ignored", isCaptureHotkey(key("c"), area, false), false);
  h("'c' in a select is ignored", isCaptureHotkey(key("c"), select, false), false);
  h("'c' in contenteditable is ignored", isCaptureHotkey(key("c"), editable, false), false);
  // capture.md P2: Ctrl/Cmd+K works from any field and mid-review; 'c' keeps its guard.
  h("Ctrl+K in an input opens", isCaptureHotkey(key("k", { ctrlKey: true }), input, false), true);
  h("'c' during a review session is ignored", isCaptureHotkey(key("c"), body, true), false);
  h("Ctrl+K during a review session opens", isCaptureHotkey(key("k", { ctrlKey: true }), body, true), true);
  h("Shift+C is ignored", isCaptureHotkey(key("C", { shiftKey: true }), body, false), false);
  h("Ctrl+C is ignored (copy)", isCaptureHotkey(key("c", { ctrlKey: true }), body, false), false);
  h("Alt+C is ignored", isCaptureHotkey(key("c", { altKey: true }), body, false), false);
  h("Ctrl+Shift+K is ignored", isCaptureHotkey(key("k", { ctrlKey: true, shiftKey: true }), body, false), false);
  h("Ctrl+Cmd+K is ignored", isCaptureHotkey(key("k", { ctrlKey: true, metaKey: true }), body, false), false);
  h("bare 'k' is ignored", isCaptureHotkey(key("k"), body, false), false);
  h("Tab is never taken", isCaptureHotkey(key("Tab"), body, false), false);
  h("a held key does not repeat-open", isCaptureHotkey(key("c", { repeat: true }), body, false), false);
  h("an IME composition is ignored", isCaptureHotkey(key("c", { isComposing: true }), body, false), false);
  h("an already-handled key is ignored", isCaptureHotkey(key("c", { defaultPrevented: true }), body, false), false);
  h("typing target: inside the capture sheet", isTypingTarget(inSheet), true);
  h("typing target: a plain button", isTypingTarget({ tagName: "BUTTON", closest: () => null }), false);
  h("typing target: nothing", isTypingTarget(null), false);
}

console.log("\n── Labels");
{
  const d = (rule: string, want: string) => report(`describe ${rule}`, describeCaptureRule(rule) === want, describeCaptureRule(rule));
  d("DAILY", "Daily");
  d("WEEKDAYS", "Weekdays");
  d("DOW:1,4", "Mon · Thu");
  d("EVERY:2", "Every other day");
  d("EVERY:3", "Every 3 days");
  d("EVERY:21", "Every 3 weeks");
  d("AFTER:1", "1 day after done");
  d("TARGET:3/W", "3× a week");
  d("MONTHLY:2", "Monthly · 2nd");
  d("MONTHLY:11", "Monthly · 11th");
  d("MONTHLY:23", "Monthly · 23rd");
  const m = (n: number, want: string) => report(`formatMinutes ${n}`, formatMinutes(n) === want, formatMinutes(n));
  m(5, "5m");
  m(60, "1h");
  m(90, "1h30");
  m(125, "2h05");
  const x = (n: number, want: string) => report(`formatXp ${n}`, formatXp(n) === want, formatXp(n));
  x(4.7, "4.7");
  x(2, "2");
  x(26.66, "27");
  x(0, "0");
  for (const raw of ["  gym ,  legs  ", "( ) call mum", "- tidy desk ·", "a: b"]) {
    const once = tidyTitle(raw);
    report(`tidyTitle is idempotent on '${raw}'`, tidyTitle(once) === once, `'${once}'`);
  }
}

// ── capture.md: stop the silent misfiles (English) ────────────────────────
const englishStart = fixtures;

console.log("\n── R1 day lists, R2 ranges, R3 letters");
fx("gym mon wed fri", { title: "Gym", kind: "HABIT", recurrence: "DOW:1,3,5", dueDay: null, fields: ["recurrence"], labels: { recurrence: "Every Mon · Wed · Fri" } });
fx("yoga tue thu 6pm", { title: "Yoga 6pm", recurrence: "DOW:2,4" });
fx("gym monday wednesday friday 7am", { title: "Gym 7am", recurrence: "DOW:1,3,5" });
fx("gym mon, wed, sat", { title: "Gym", recurrence: "DOW:1,3,6" });
fx("meet tue", { title: "Meet", recurrence: null, dueDay: "2026-10-06", labels: { date: "Tue 6 Oct" } });
fx("brunch sat sun", { title: "Brunch sat sun", recurrence: null, dueDay: null, fields: [] });
fx("piano on sat & sun", { title: "Piano", recurrence: "DOW:6,7" });
// A list that loses to an earlier schedule stays text, whole; one that wins leaves the other as text.
fx("gym 3x/week mon thu", { title: "Gym mon thu", recurrence: "TARGET:3/W", dueDay: null, fields: ["recurrence"] });
fx("stretch daily mon wed", { title: "Stretch daily", recurrence: "DOW:1,3", dueDay: null });
fx("standup mon-fri", { title: "Standup", recurrence: "WEEKDAYS", labels: { recurrence: "Weekdays" } });
fx("standup every mon-fri", { title: "Standup", recurrence: "WEEKDAYS", fields: ["recurrence"] });
fx("standup mon – fri", { title: "Standup", recurrence: "WEEKDAYS" });
fx("standup mon to fri", { title: "Standup", recurrence: "WEEKDAYS" });
fx("long run sat-sun", { title: "Long run", recurrence: "DOW:6,7" });
fx("fri-mon retreat", { title: "Retreat", recurrence: "DOW:1,5,6,7" });
fx("swim tue-thu 7am", { title: "Swim 7am", recurrence: "DOW:2,3,4" });
fx("move meeting mon to wed", { title: "Move meeting to wed", recurrence: null, dueDay: "2026-10-05" });
fx("gym M/W/F", { title: "Gym", recurrence: "DOW:1,3,5", labels: { recurrence: "Every Mon · Wed · Fri" } });
fx("gym MWF", { title: "Gym", recurrence: "DOW:1,3,5" });
fx("yoga TTh", { title: "Yoga", recurrence: "DOW:2,4" });
fx("yoga T/Th", { recurrence: "DOW:2,4" });
fx("swim Sa/Su", { recurrence: "DOW:6,7" });
fx("gym mwf", { title: "Gym mwf", recurrence: null, fields: [] });
fx("S", { title: "S", fields: [] });
fx("lunch w/ Sam", { title: "Lunch w/ Sam", fields: [] });

console.log("\n── R4 frequencies, R5 per-day, R6 Nth intervals, R7 phased intervals");
fx("yoga 3 times weekly", { title: "Yoga", recurrence: "TARGET:3/W", labels: { recurrence: "3× a week" } });
fx("swim twice weekly", { title: "Swim", recurrence: "TARGET:2/W", labels: { recurrence: "Twice a week" } });
fx("call grandma once weekly", { title: "Call grandma", recurrence: "TARGET:1/W" });
fx("gym 4 days a week", { title: "Gym", recurrence: "TARGET:4/W" });
fx("run 3 days per week", { title: "Run", recurrence: "TARGET:3/W" });
fx("gym three times a week", { title: "Gym", recurrence: "TARGET:3/W" });
fx("date night twice monthly", { title: "Date night", recurrence: "TARGET:2/M" });
fx("massage 2 times monthly", { recurrence: "TARGET:2/M" });
fx("deep clean 2 days a month", { recurrence: "TARGET:2/M" });
fx("duolingo 15m a day", { title: "Duolingo", recurrence: "DAILY", estMinutes: 15, fields: ["duration", "recurrence"] });
fx("read 1 chapter a day", { title: "Read 1 chapter", recurrence: "DAILY" });
fx("stretch 2x a day", { title: "Stretch 2x", recurrence: "DAILY" });
fx("brush teeth twice a day", { title: "Brush teeth twice", recurrence: "DAILY" });
fx("read 2 pages tmr a day", { title: "Read 2 pages", recurrence: "DAILY", dueDay: FRI });
fx("eat 3 meals per day", { title: "Eat 3 meals", recurrence: "DAILY" });
fx("drink 8 glasses/day", { title: "Drink 8 glasses", recurrence: "DAILY" });
fx("read 10 pages a night", { title: "Read 10 pages", recurrence: "DAILY" });
fx("call it a day", { title: "Call it a day", recurrence: null, fields: [] });
fx("book a night at the hotel", { title: "Book a night at the hotel", recurrence: null, fields: [] });
fx("every 2nd day floss", { title: "Floss", recurrence: "EVERY:2", labels: { recurrence: "Every other day" } });
fx("water plants every 3rd day", { title: "Water plants", recurrence: "EVERY:3", labels: { recurrence: "Every 3 days" } });
fx("bins every 2nd week", { title: "Bins", recurrence: "EVERY:14" });
fx("every 2nd thu bins", { title: "Bins", recurrence: "EVERY:14", dueDay: THU });
// R7: the day after an interval is its start (a date chip of its own, as 'every 2 weeks on mon' always was).
fx("mow lawn every 2 weeks sat", { title: "Mow lawn", recurrence: "EVERY:14", dueDay: SAT, dueKind: "PLANNED", fields: ["recurrence", "date"], labels: { recurrence: "Every 2 weeks", date: "Sat 3 Oct" } });
fx("pay rent fortnightly on fri", { title: "Pay rent", recurrence: "EVERY:14", dueDay: FRI, fields: ["recurrence", "date"] });
fx("every 2nd week sun call grandma", { title: "Call grandma", recurrence: "EVERY:14", dueDay: SUN });
fx("pay rent fortnightly fri", { title: "Pay rent", recurrence: "EVERY:14", dueDay: FRI });
fx("haircut every 6 weeks tue", { title: "Haircut", recurrence: "EVERY:42", dueDay: "2026-10-06" });

console.log("\n── R8 musts, R9 the recent past, R14 deadline words, R15 weak words");
fx("pay rent 1/10 !", { title: "Pay rent", dueDay: THU, dueKind: "DEADLINE", compulsory: true, compulsoryWarning: null, labels: { deadline: "By today" } });
fx("renew rego end of month !", { title: "Renew rego", dueDay: "2026-10-31", dueKind: "DEADLINE", compulsory: true, labels: { deadline: "By Sat 31 Oct" } });
fx("must call landlord sat", { title: "Call landlord", dueDay: SAT, dueKind: "DEADLINE", compulsory: true });
fx("x pay rent fri !", { title: "Pay rent", doneNow: true, dueKind: "DEADLINE", compulsory: true });
fx("goal: finish thesis fri !", { mode: "GOAL", dueKind: "PLANNED", compulsory: false, compulsoryWarning: null });
fx("gym every mon !", { recurrence: "DOW:1", dueDay: null, compulsory: true });
{
  // Turning the Must back into text makes the day planned again.
  const t = "pay rent fri !";
  fx(t, { dueDay: FRI, dueKind: "PLANNED", compulsory: false, compulsoryWarning: null, fields: ["date"] }, THU, [spanOf(t, "!")]);
}
fx("Q3 report due 30/9", { title: "Q3 report", dueDay: THU, dueKind: "DEADLINE", labels: { deadline: "By today · 30 Sep passed" } });
fx("pay invoice by 29 sep", { title: "Pay invoice", dueDay: THU, dueKind: "DEADLINE", labels: { deadline: "By today · 29 Sep passed" } });
fx("party sep 20", { title: "Party", dueDay: THU, dueKind: "PLANNED", labels: { date: "Today · 20 Sep passed" } });
fx("pay rent 30/9 !", { dueDay: THU, dueKind: "DEADLINE", compulsory: true, labels: { deadline: "By today · 30 Sep passed" } });
fx("dentist 2/8", { dueDay: THU, labels: { date: "Today · 2 Aug passed" } }); // 60 days ago: still this year's
fx("dentist 1/8", { dueDay: "2027-08-01" }); // 61 days ago: next year's
fx("report due 20/12", { dueDay: "2027-01-10", dueKind: "DEADLINE", labels: { deadline: "By today · 20 Dec passed" } }, "2027-01-10");
fx("pay fine before 15 oct", { title: "Pay fine", dueDay: "2026-10-14", dueKind: "DEADLINE", labels: { deadline: "By Wed 14 Oct" } });
fx("renew passport before dec", { title: "Renew passport", dueDay: "2026-11-30", dueKind: "DEADLINE", labels: { deadline: "By Mon 30 Nov" } });
fx("call bank before fri", { title: "Call bank", dueDay: THU, dueKind: "DEADLINE" });
fx("submit claim within 7 days", { title: "Submit claim", dueDay: "2026-10-08", dueKind: "DEADLINE", labels: { deadline: "By Thu 8 Oct" } });
fx("reply within 2 weeks", { dueDay: "2026-10-15", dueKind: "DEADLINE" });
fx("reply to Marc asap", { title: "Reply to Marc", dueDay: THU, dueKind: "PLANNED", compulsory: false, compulsoryWarning: null });
fx("ring plumber asap!", { title: "Ring plumber", dueDay: THU, dueKind: "DEADLINE", compulsory: true });
fx("xmas shopping", { title: "Xmas shopping", dueDay: null, fields: [] });
fx("buy gifts by xmas", { title: "Buy gifts", dueDay: "2026-12-25", dueKind: "DEADLINE", labels: { deadline: "By Fri 25 Dec" } });
fx("goal: lose 5kg by christmas", { title: "Lose 5kg", mode: "GOAL", dueDay: "2026-12-25", dueKind: "DEADLINE" });
fx("wrap gifts by xmas eve", { title: "Wrap gifts", dueDay: "2026-12-24" });
fx("report eoy", { title: "Report", dueDay: "2026-12-31", dueKind: "PLANNED" });
fx("report by end of the year", { title: "Report", dueDay: "2026-12-31", dueKind: "DEADLINE" });
fx("goal: read 12 books this year", { title: "Read 12 books", mode: "GOAL", dueDay: "2026-12-31", horizon: "MID" });
fx("read 12 books this year", { title: "Read 12 books this year", dueDay: null, fields: [] });
fx("march 5 dentist", { title: "Dentist", dueDay: "2027-03-05", labels: { date: "Fri 5 Mar 2027" } });
fx("enjoy the sun", { title: "Enjoy the sun", dueDay: null, fields: [] });
fx("stay out of the sun", { dueDay: null, fields: [] });
fx("sat: market", { title: "Market", dueDay: SAT, fields: ["date"] });
fx("sun: brunch", { title: "Brunch", dueDay: SUN });
fx("bbq sun !", { title: "Bbq", dueDay: SUN, dueKind: "DEADLINE", compulsory: true });
fx("call mum sun #care", { title: "Call mum", dueDay: SUN, track: "CARE" });
fx("call mum sun 30m", { title: "Call mum", dueDay: SUN, estMinutes: 30 });
fx("lunch with may sat", { title: "Lunch with may", dueDay: SAT });
fx("2 hours gardening sat", { title: "Gardening", estMinutes: 120, dueDay: SAT });
fx("dentist fri next week", { title: "Dentist", dueDay: "2026-10-09" });

console.log("\n── R10 typos (lowercase only)");
fx("gym evry mon", { title: "Gym", recurrence: "DOW:1", labels: { recurrence: "Every Mon" } });
fx("gym evry mon wednsday", { title: "Gym", recurrence: "DOW:1,3" });
fx("call jon tomrrow", { title: "Call jon", dueDay: FRI, labels: { date: "Tomorrow" } });
fx("call jon tmorrow", { title: "Call jon", dueDay: FRI });
fx("gym wednsday", { title: "Gym", dueDay: "2026-10-07" });
fx("gym thurday", { title: "Gym", dueDay: THU });
fx("yoga firday", { title: "Yoga", dueDay: FRI });
fx("wensday standup", { title: "Standup", dueDay: "2026-10-07" });
fx("stretch dialy", { title: "Stretch", recurrence: "DAILY" });
fx("plan week weely", { title: "Plan week", recurrence: "EVERY:7" });
fx("2moro dentist", { title: "Dentist", dueDay: FRI });
fx("pay bills 2day", { title: "Pay bills", dueDay: THU });
fx("movie tonite", { title: "Movie", dueDay: THU });
fx("party with Firday", { title: "Party with Firday", dueDay: null, fields: [] });
fx("call Tomrrow", { title: "Call Tomrrow", dueDay: null, fields: [] });
// A capital that only opens the line is the keyboard's (or the title's), not a name.
fx("Tomrrow call mum", { title: "Call mum", dueDay: FRI });
fx("Firday party", { title: "Party", dueDay: FRI });
fx("very good talk", { title: "Very good talk", fields: [] });
fx("ever after", { title: "Ever after", fields: [] });
fx("Frida birthday", { title: "Frida birthday", fields: [] });
fx("toady sighting", { fields: [] });

console.log("\n── R11 bare minutes, R12 did/done, R13 a stranded full stop");
fx("swim 400m", { title: "Swim 400m", estMinutes: null, fields: [] });
fx("buy 2m rope", { title: "Buy 2m rope", estMinutes: null, fields: [] });
fx("run 800m", { title: "Run 800m", estMinutes: null, fields: [] });
fx("sprint 100m", { title: "Sprint 100m", estMinutes: null, fields: [] });
fx("walk 300m", { estMinutes: null, fields: [] });
fx("tape 5m long", { estMinutes: null, fields: [] });
fx("swim 50m", { title: "Swim", estMinutes: 50 });
fx("swim 400 min", { title: "Swim", estMinutes: 400 });
fx("swim ~300m", { title: "Swim", estMinutes: 300 });
fx("read for 250m", { title: "Read", estMinutes: 250 });
fx("did i lock the door?", { title: "Did i lock the door", doneNow: false, inbox: true, fields: ["inbox"] });
fx("done with the essay, send it to prof", { title: "Done with the essay, send it to prof", doneNow: false, fields: [] });
fx("done the dishes", { title: "The dishes", doneNow: true, fields: ["done"] });
fx("did it rain?", { title: "Did it rain", doneNow: false, inbox: true });
fx("did you call mum", { doneNow: false, fields: [] });
fx("x call bank?", { title: "Call bank", doneNow: true, inbox: true });
fx("call Dr. Nguyen re: results by Mon.", { title: "Call Dr. Nguyen re: results", dueDay: "2026-10-05", dueKind: "DEADLINE" });
fx("buy milk etc.", { title: "Buy milk etc.", fields: [] });

console.log("\n── Clock times are not estimates");
fx("meeting 15h tmr", { title: "Meeting 15h", dueDay: FRI, estMinutes: null, fields: ["date"] });
fx("call at 3h", { title: "Call at 3h", estMinutes: null, fields: [] });
fx("standup 9h30", { title: "Standup 9h30", estMinutes: null, fields: [] });
fx("drive for 10h", { title: "Drive", estMinutes: 480 });
fx("sleep 8h", { title: "Sleep", estMinutes: 480 });
fx("study 2h", { title: "Study", estMinutes: 120 });

console.log("\n── Speakable grammar for keyboard dictation (P3)");
fx("stretch 15 minutes daily hashtag body", { title: "Stretch", estMinutes: 15, recurrence: "DAILY", track: "BODY", labels: { tag: "Body" } });
fx("read two hours on Saturday", { title: "Read", estMinutes: 120, dueDay: SAT });
fx("piano an hour", { title: "Piano", estMinutes: 60 });
fx("piano an hour and a half", { title: "Piano", estMinutes: 90 });
fx("piano one and a half hours", { title: "Piano", estMinutes: 90 });
fx("meditate twenty minutes", { title: "Meditate", estMinutes: 20 });
fx("plank for forty-five minutes", { title: "Plank", estMinutes: 45 });
fx("call dad in an hour", { title: "Call dad in an hour", estMinutes: null, fields: [] });
fx("ten minutes late", { title: "Ten minutes late", estMinutes: null, fields: [] });
fx("drive 50 km an hour", { estMinutes: null, fields: [] });
fx("journal tag care", { title: "Journal", track: "CARE" });
fx("guitar hashtag play", { title: "Guitar", intrinsic: true });
fx("stretch tag body 30m", { title: "Stretch", track: "BODY", estMinutes: 30 });
fx("learn guitar hashtag long", { title: "Learn guitar", mode: "GOAL", kind: "GOAL", horizon: "LONG" });
fx("tag Sam in the photo", { title: "Tag Sam in the photo", track: null, fields: [] });
fx("hashtag campaign plan", { title: "Hashtag campaign plan", fields: [] });
fx("read article for later", { title: "Read article", inbox: true, fields: ["inbox"] });
fx("ask about leave to inbox", { title: "Ask about leave", inbox: true });
fx("save for later reading", { inbox: false, fields: [] });

console.log("\n── Idea answers: the first '::' (P2)");
fx("idea: Q :: A", { mode: "IDEA", kind: "IDEA_DRAFT", title: "Q", answer: "A", fields: ["mode", "answer"], labels: { answer: "Answer: A" } });
fx("i: Q::A", { mode: "IDEA", title: "Q", answer: "A" });
fx("idea: Q :: A :: B", { title: "Q", answer: "A :: B" });
fx("idea: Q ::", { title: "Q ::", answer: null, fields: ["mode"] });
fx("idea: is caffeine a diuretic? :: mildly, not at normal doses", { title: "Is caffeine a diuretic?", answer: "mildly, not at normal doses", labels: { answer: "Answer: mildly, not at normal do…" } });
fx("call bank :: tmr", { mode: "TASK", answer: null, dueDay: FRI });
{
  const t = "idea: Q :: A";
  fx(t, { title: "Q :: A", answer: null, fields: ["mode"] }, THU, [spanOf(t, ":: A")]);
  // An answer longer than the 200-character title is kept whole.
  const long = `idea: why do bonds fall when rates rise :: ${"because the fixed coupons are discounted at the new, higher rate ".repeat(4).trim()}`;
  const p = parseCapture(long, { today: THU });
  fx(long, { title: "Why do bonds fall when rates rise" });
  report("an answer over 200 characters is kept whole", (p.answer?.length ?? 0) > 200 && long.endsWith(p.answer ?? "\u0000"), `${p.answer?.length} chars`);
  // splitIdeaLine reads '::' with parseCapture's rule: the same answer, the question the title came from.
  const sp = (line: string, question: string, answer: string | null) =>
    report(`splitIdeaLine '${line}'`, same(splitIdeaLine(line), { question, answer }), JSON.stringify(splitIdeaLine(line)));
  sp("idea: Q :: A", "Q", "A");
  sp("i: Q::A", "Q", "A");
  sp("idea: only q", "only q", null);
  sp("idea: Q :: A :: B", "Q", "A :: B");
  sp("Idea:Q::A", "Q", "A");
  sp("Q :: A", "Q", "A");
  sp("idea: Q ::", "Q", null);
  sp("", "", null);
  for (const line of ["idea: Q :: A", "i: Q::A", "idea: Q :: A :: B", "idea: only q", "idea: Q ::", long]) {
    const parsed = parseCapture(line, { today: THU });
    const split = splitIdeaLine(line);
    report(`splitIdeaLine and parseCapture read '${line.slice(0, 30)}' alike`, (parsed.answer ?? null) === split.answer && (split.answer === null || parsed.title.toLowerCase() === split.question.toLowerCase()));
  }
}

console.log("\n── Reverts on the new rules");
{
  const a = "mow lawn every 2 weeks sat";
  fx(a, { title: "Mow lawn every 2 weeks sat", recurrence: null, dueDay: null, fields: [] }, THU, [spanOf(a, "every 2 weeks sat")]);
  // Reverting the schedule keeps its day: a one-off on Saturday.
  fx(a, { title: "Mow lawn every 2 weeks", recurrence: null, dueDay: SAT, fields: ["date"] }, THU, [spanOf(a, "every 2 weeks")]);
  // A goal reads no schedule, so a range's days stay text; reverting 'goal:' lets the range read them.
  const g = "goal: email team mon to fri";
  fx(g, { mode: "GOAL", dueDay: null, recurrence: null, fields: ["mode"] });
  fx(g, { mode: "TASK", recurrence: "WEEKDAYS", dueDay: null }, THU, [spanOf(g, "goal:")]);
  const b = "gym mon wed fri";
  fx(b, { title: "Gym mon wed fri", recurrence: null, dueDay: null, fields: [] }, THU, [spanOf(b, "mon wed fri")]);
  const c = "call mum sun";
  fx(c, { title: "Call mum sun", dueDay: null, fields: [] }, THU, [spanOf(c, "sun")]);
  const d = "Q3 report due 30/9";
  fx(d, { title: "Q3 report due 30/9", dueDay: null }, THU, [spanOf(d, "due 30/9")]);
  const e = "gym evry mon";
  fx(e, { title: "Gym evry mon", recurrence: null, dueDay: null, fields: [] }, THU, [spanOf(e, "evry mon")]);
}

console.log("\n── Review C4: a weak day closing the line after a noun's words is the noun");
// The finding's lines: each gave a Sunday or Saturday and cut the word out of the title.
fx("plants need sun", { title: "Plants need sun", dueDay: null, fields: [] });
fx("garden gets no sun", { title: "Garden gets no sun", dueDay: null, fields: [] });
fx("need more sun", { title: "Need more sun", dueDay: null, fields: [] });
// One line per word the sweep added to WEAK_DAY_NOT_AFTER.
for (const line of [
  "needs sun", "get sun", "garden gets sun", "getting sun", "get some sun", "too much sun", "not enough sun",
  "the garden gets less sun", "kids need a little sun", "basil needs full sun", "plant needs partial sun",
  "herbs do well in part sun", "lemon tree needs direct sun", "succulents need bright sun", "orchid prefers filtered sun",
  "fruit needs warm sun", "chillies love hot sun", "desk gets harsh sun", "balcony gets morning sun",
  "back yard gets afternoon sun", "front porch gets evening sun", "patio gets midday sun", "basil wants summer sun",
  "pots need winter sun", "sea and sun", "hat against sun", "plants like sun", "lavender likes sun", "cats love sun",
  "cat loves sun", "fern hates sun", "ferns hate sun", "succulents prefer sun", "aloe prefers sun", "tomatoes want sun", "dog wants sun",
  "where we sat", "the exam i sat", "seat where he sat", "chair she sat", "the test they sat", "the one who sat",
  "has sat", "have sat", "had sat", "was sat", "were sat", "been sat",
]) {
  fx(line, { title: tidyTitle(line), dueDay: null, dueKind: null, fields: [] });
}
// The trailing tokens a weak day may sit before change nothing.
fx("any sun?", { title: "Any sun", dueDay: null, inbox: true, fields: ["inbox"] });
fx("need more sun?", { title: "Need more sun", dueDay: null, inbox: true, fields: ["inbox"] });
fx("plants need sun !", { title: "Plants need sun", dueDay: null, compulsory: false, compulsoryWarning: COMPULSORY_WARNING, fields: ["compulsory"] });
fx("aloe gets too much sun #care", { title: "Aloe gets too much sun", dueDay: null, track: "CARE", fields: ["tag"] });
fx("tomatoes need more sun ^garden", { title: "Tomatoes need more sun", dueDay: null, parentHint: "garden", fields: ["parent"] });
// The stop words hold back only the day right after them.
fx("see you sat", { title: "See you", dueDay: SAT, fields: ["date"] });
fx("need more milk sat", { title: "Need more milk", dueDay: SAT, fields: ["date"] });
fx("get some bread sun", { title: "Get some bread", dueDay: SUN, fields: ["date"] });
fx("hot yoga sun", { title: "Hot yoga", dueDay: SUN, fields: ["date"] });
fx("brunch with Jo and Sam sun", { title: "Brunch with Jo and Sam", dueDay: SUN });
// Sunlight's words hold back only 'sun', the verb's subjects only 'sat': a Saturday after a time of day is still a date.
fx("drinks evening sat", { title: "Drinks evening", dueDay: SAT, fields: ["date"] });
fx("run morning sat", { title: "Run morning", dueDay: SAT, fields: ["date"] });
fx("pub quiz evening sat", { title: "Pub quiz evening", dueDay: SAT, fields: ["date"] });
fx("hike early morning sat", { title: "Hike early morning", dueDay: SAT, fields: ["date"] });
fx("need more sat", { title: "Need more", dueDay: SAT, fields: ["date"] });
fx("plants need more sun", { title: "Plants need more sun", dueDay: null, fields: [] });
{
  // A stop word a chip took is no neighbour in the title: 'every morning' is
  // the schedule, so 'sun' is the date — and stays it when the schedule is
  // turned back into text.
  const t = "walk dog every morning sun";
  fx(t, { title: "Walk dog", recurrence: "DAILY", dueDay: SUN, fields: ["recurrence", "date"] });
  fx(t, { title: "Walk dog every morning", recurrence: null, dueDay: SUN, fields: ["date"] }, THU, [spanOf(t, "every morning")]);
}

console.log("\n── Review C5: a holiday is a deadline after a deadline prefix, and only then");
// The finding's lines: a planned prefix made each one a PLANNED holiday date.
fx("shopping for xmas", { title: "Shopping for xmas", dueDay: null, dueKind: null, fields: [] });
fx("presents for christmas", { title: "Presents for christmas", dueDay: null, fields: [] });
fx("save for xmas", { title: "Save for xmas", dueDay: null, fields: [] });
fx("budget for christmas", { title: "Budget for christmas", dueDay: null, fields: [] });
fx("what to get mum for xmas?", { title: "What to get mum for xmas", dueDay: null, inbox: true, fields: ["inbox"] });
fx("plan for eoy", { title: "Plan for eoy", dueDay: null, fields: [] });
// R14 reads 'xmas' only with a prefix, and 'xmas shopping' as words: in
// 'due xmas cards' it describes the cards, so nothing is a date and the
// title keeps every word (it was 'Cards', by 25 Dec).
fx("due xmas cards", { title: "Due xmas cards", dueDay: null, dueKind: null, fields: [] });
// Siblings: the other planned prefixes, 'end of the year', and other holiday nouns.
fx("plan for end of the year", { title: "Plan for end of the year", dueDay: null, fields: [] });
fx("party on eoy", { title: "Party on eoy", dueDay: null, fields: [] });
fx("call grandma on christmas day", { title: "Call grandma on christmas day", dueDay: null, fields: [] });
fx("gifts for xmas eve", { title: "Gifts for xmas eve", dueDay: null, fields: [] });
fx("before xmas party buy dress", { title: "Before xmas party buy dress", dueDay: null, fields: [] });
fx("until xmas break", { title: "Until xmas break", dueDay: null, fields: [] });
fx("due christmas lunch menu", { title: "Due christmas lunch menu", dueDay: null, fields: [] });
// A deadline prefix still reads it, as a deadline; 'christmas day' is one date ('Buy tree day' before).
fx("buy tree before christmas day", { title: "Buy tree", dueDay: "2026-12-24", dueKind: "DEADLINE", fields: ["deadline"], labels: { deadline: "By Thu 24 Dec" } });
fx("send cards by christmas day", { title: "Send cards", dueDay: "2026-12-25", dueKind: "DEADLINE" });
fx("due on xmas eve", { dueDay: "2026-12-24", dueKind: "DEADLINE", fields: ["deadline"] });
fx("by xmas: cards", { title: "Cards", dueDay: "2026-12-25", dueKind: "DEADLINE" });
fx("send cards by xmas ^family", { title: "Send cards", dueDay: "2026-12-25", dueKind: "DEADLINE", parentHint: "family" });
fx("report by eoy", { title: "Report", dueDay: "2026-12-31", dueKind: "DEADLINE" });
fx("goal: save 2k by eoy", { title: "Save 2k", mode: "GOAL", dueDay: "2026-12-31", dueKind: "DEADLINE" });

const englishCount = fixtures - englishStart;

// ── capture.md: Vietnamese-English lines ──────────────────────────────────
console.log("\n── Vietnamese-English");
let vnFixtures = 0;
/** A Vietnamese fixture, also held to NFC: the line is written in NFC, and an NFD copy normalised to NFC parses the same. */
function vx(text: string, want: Want, today = THU, reverted: CaptureSpan[] = []): void {
  vnFixtures++;
  fx(text, want, today, reverted);
  if (text !== text.normalize("NFC")) report(`'${text}' is written in NFC`, false);
  const nfd = text.normalize("NFD");
  if (nfd !== text) {
    const back = parseCapture(nfd.normalize("NFC"), { today, reverted });
    report(`'${text}': its NFD copy, normalised to NFC, parses the same`, same(back, parseCapture(text, { today, reverted })));
  }
}
vx("họp team 3h chiều thứ 2", { title: "Họp team 3h chiều", dueDay: "2026-10-05", estMinutes: null, fields: ["date"], labels: { date: "Mon 5 Oct" } });
vx("hop team 3h chieu t2", { title: "Hop team 3h chieu", dueDay: "2026-10-05", estMinutes: null });
vx("email thầy tmr 9h", { title: "Email thầy 9h", dueDay: FRI, estMinutes: null });
vx("email thay tmr 9h", { title: "Email thay 9h", dueDay: FRI, estMinutes: null });
vx("Gọi anh Minh lúc 3h", { title: "Gọi anh Minh lúc 3h", estMinutes: null, fields: [] });
vx("goi anh Minh luc 3h", { estMinutes: null, fields: [] });
vx("đi gym tối nay", { title: "Đi gym", dueDay: THU, labels: { date: "Today" } });
vx("di gym toi nay", { title: "Di gym", dueDay: THU });
vx("gọi mẹ mai", { title: "Gọi mẹ", dueDay: FRI });
vx("goi me mai", { title: "Goi me", dueDay: FRI });
vx("học tiếng anh 30p mỗi ngày", { title: "Học tiếng anh", kind: "HABIT", recurrence: "DAILY", estMinutes: 30 });
vx("hoc tieng anh 30p moi ngay", { title: "Hoc tieng anh", recurrence: "DAILY", estMinutes: 30 });
vx("đi chợ cn", { title: "Đi chợ", dueDay: SUN, labels: { date: "Sun 4 Oct" } });
vx("di cho CN", { title: "Di cho", dueDay: SUN });
vx("ôn bài 2 tiếng tối nay", { title: "Ôn bài", estMinutes: 120, dueDay: THU });
vx("on bai 2 tieng toi nay", { title: "On bai", estMinutes: 120, dueDay: THU });
vx("chạy bộ 5km sáng mai", { title: "Chạy bộ 5km", dueDay: FRI, estMinutes: null });
vx("chay bo 5km sang mai", { title: "Chay bo 5km", dueDay: FRI });
vx("lunch w/ Anh thứ 7", { title: "Lunch w/ Anh", dueDay: SAT });
vx("nộp báo cáo trước thứ 6 !", { title: "Nộp báo cáo", dueDay: FRI, dueKind: "DEADLINE", compulsory: true, compulsoryWarning: null });
vx("nop bao cao truoc t6 !", { title: "Nop bao cao", dueDay: FRI, dueKind: "DEADLINE", compulsory: true });
vx("đọc sách 3 lần/tuần", { title: "Đọc sách", recurrence: "TARGET:3/W" });
vx("doc sach 3 lan/tuan", { title: "Doc sach", recurrence: "TARGET:3/W" });
vx("đọc sách 2 buổi/tuần", { recurrence: "TARGET:2/W" });
vx("chạy 3 lần một tuần", { title: "Chạy", recurrence: "TARGET:3/W" });
vx("hom nay goi dien ngan hang", { title: "Goi dien ngan hang", dueDay: THU });
vx("Hôm nay gọi điện ngân hàng", { title: "Gọi điện ngân hàng", dueDay: THU });
vx("ngày mai đi khám", { title: "Đi khám", dueDay: FRI });
vx("Ngày mai đi khám", { title: "Đi khám", dueDay: FRI });
vx("đi khám ngày mốt", { title: "Đi khám", dueDay: SAT });
vx("đi khám mốt", { title: "Đi khám", dueDay: SAT });
vx("đi chơi tuần sau", { title: "Đi chơi", dueDay: "2026-10-05" });
vx("đi chơi tuan toi", { dueDay: "2026-10-05" });
vx("trả nợ tháng sau", { title: "Trả nợ", dueDay: "2026-11-01" });
vx("họp Thứ 2", { title: "Họp", dueDay: "2026-10-05" });
vx("họp THỨ 2", { title: "Họp", dueDay: "2026-10-05" });
vx("đi bơi thứ hai", { title: "Đi bơi", dueDay: "2026-10-05" });
vx("đi bơi chủ nhật", { title: "Đi bơi", dueDay: SUN });
vx("đi bơi chu nhat", { title: "Đi bơi", dueDay: SUN });
vx("đi bơi T2", { title: "Đi bơi", dueDay: "2026-10-05" });
vx("họp vào thứ 5", { title: "Họp", dueDay: THU, dueKind: "PLANNED" });
vx("họp thứ 6 tuần sau", { title: "Họp", dueDay: "2026-10-09" });
vx("nộp bài hạn chót 20/10", { title: "Nộp bài", dueDay: "2026-10-20", dueKind: "DEADLINE" });
vx("nộp bài han chot thứ 6", { title: "Nộp bài", dueDay: FRI, dueKind: "DEADLINE" });
vx("tập gym t2 t4 t6", { title: "Tập gym", recurrence: "DOW:1,3,5", labels: { recurrence: "Every Mon · Wed · Fri" } });
vx("tập gym thứ 2 thứ 4 thứ 6", { title: "Tập gym", recurrence: "DOW:1,3,5" });
vx("t2-t6 đi làm", { title: "Đi làm", recurrence: "WEEKDAYS" });
vx("mỗi thứ 2 họp", { title: "Họp", recurrence: "DOW:1" });
vx("tập yoga mỗi tuần", { title: "Tập yoga", recurrence: "EVERY:7" });
vx("tap yoga hang tuan", { title: "Tap yoga", recurrence: "EVERY:7" });
vx("trả tiền nhà mỗi tháng", { title: "Trả tiền nhà", recurrence: "MONTHLY:1" });
vx("uống thuốc hằng ngày", { title: "Uống thuốc", recurrence: "DAILY" });
vx("họp 1 tiếng rưỡi", { title: "Họp", estMinutes: 90 });
vx("học 45 phút", { title: "Học", estMinutes: 45 });
vx("hoc 45 phut", { title: "Hoc", estMinutes: 45 });
vx("họp 2 giờ", { title: "Họp", estMinutes: 120 });
vx("họp 3 giờ chiều", { title: "Họp 3 giờ chiều", estMinutes: null, fields: [] });
vx("họp lúc 2 giờ", { title: "Họp lúc 2 giờ", estMinutes: null, fields: [] });
// A clock time keeps its part of the day; only 'nay' / 'mai' is the date.
vx("họp 3h chiều nay", { title: "Họp 3h chiều", dueDay: THU, estMinutes: null, fields: ["date"] });
vx("họp 9h sáng mai", { title: "Họp 9h sáng", dueDay: FRI, estMinutes: null });
vx("xem phim tối nay 8h", { title: "Xem phim tối 8h", dueDay: THU, estMinutes: null });
// Negatives: names, 'some day', flat 'thu 2', and 'phải' (must) is not a Must.
vx("mai mốt đi du lịch", { title: "Mai mốt đi du lịch", dueDay: null, fields: [] });
vx("mai mot di du lich", { dueDay: null, fields: [] });
vx("Gặp Mai ở quán", { title: "Gặp Mai ở quán", dueDay: null, fields: [] });
vx("gặp mai ở quán", { dueDay: null, fields: [] });
vx("gọi chị mai", { dueDay: null, fields: [] });
vx("cafe với Mai thứ 7", { title: "Cafe với Mai", dueDay: SAT });
vx("thu 2", { title: "Thu 2", dueDay: null, fields: [] });
vx("lunch w/ Anh thu 7", { title: "Lunch w/ Anh thu 7", dueDay: null, fields: [] });
vx("phải không", { title: "Phải không", compulsory: false, compulsoryWarning: null, fields: [] });
vx("học tiếng anh", { title: "Học tiếng anh", estMinutes: null, fields: [] });
{
  const t = "họp team 3h chiều thứ 2";
  vx(t, { title: "Họp team 3h chiều thứ 2", dueDay: null, estMinutes: null, fields: [] }, THU, [spanOf(t, "thứ 2")]);
  const u = "họp 3h chiều nay";
  vx(u, { title: "Họp 3h chiều nay", dueDay: null, estMinutes: null, fields: [] }, THU, [spanOf(u, "nay")]);
}

console.log("\n── Review C4: 'mai' the noun is not tomorrow");
// The finding's lines: each was Tomorrow, with 'mai' cut out of the title.
vx("mua hoa mai", { title: "Mua hoa mai", dueDay: null, fields: [] });
vx("tưới cây mai", { title: "Tưới cây mai", dueDay: null, fields: [] });
vx("chậu mai vàng", { title: "Chậu mai vàng", dueDay: null, fields: [] });
vx("đi đám mai táng", { title: "Đi đám mai táng", dueDay: null, fields: [] });
// One line per word added before 'mai' (MAI_NOT_AFTER) and after it (MAI_NOT_BEFORE), accented and flat.
for (const line of [
  "tuoi cay mai", "chau mai", "cắt cành mai", "cat canh mai", "bán mai tết", "lặt lá mai", "mua cái mai", "mua cai mai",
  "tưới gốc mai", "tuoi goc mai", "dạo vườn mai", "dao vuon mai", "ngắm nụ mai", "ngam nu mai", "gọi bác mai", "goi bac mai",
  "mai vàng nở", "mai vang no", "mai táng ông", "mai tang ong", "mai mối cho bạn", "mai moi cho ban", "mai rùa", "mai rua",
  "mai mực", "mai muc", "lột mai cua", "mai kia", "mai này lớn lên", "mai nay lon len", "mai đây",
]) {
  vx(line, { title: tidyTitle(line), dueDay: null, dueKind: null, fields: [] });
}
// Tomorrow is still tomorrow around the same words.
vx("mai mua hoa", { title: "Mua hoa", dueDay: FRI, fields: ["date"] });
vx("mai tưới cây", { title: "Tưới cây", dueDay: FRI, fields: ["date"] });
vx("đi đám tang mai", { title: "Đi đám tang", dueDay: FRI, fields: ["date"] });
vx("mua hoa mai tối nay", { title: "Mua hoa mai", dueDay: THU, fields: ["date"] });
// The word after 'mai' is read with the schedule cut out, as the title holds it:
// flat 'moi ngay' is the schedule, not 'mai mối', so 'mai' stays tomorrow.
vx("hoc mai moi ngay", { title: "Hoc", dueDay: FRI, recurrence: "DAILY", fields: ["date", "recurrence"] });
vx("học mai mỗi ngày", { title: "Học", dueDay: FRI, recurrence: "DAILY", fields: ["date", "recurrence"] });
{
  const h = "hoc mai moi ngay";
  vx(h, { title: "Hoc moi ngay", dueDay: FRI, recurrence: null, fields: ["date"] }, THU, [spanOf(h, "moi ngay")]);
}
vx("trước xmas mua quà", { title: "Mua quà", dueDay: "2026-12-25", dueKind: "DEADLINE", fields: ["deadline"] });
vx("vào xmas đi chơi", { title: "Vào xmas đi chơi", dueDay: null, fields: [] });

console.log("\n── Review C4/C5: the sibling sweep");
{
  // Everyday lines that end in a weak day or hold 'mai' the noun (and holiday
  // lines), read against Thu 1 Oct. Left out on purpose, as ambiguous:
  // 'protect from sun' ('holiday from sat' is a date), 'sunscreen for sun'
  // ('for' is a planned prefix), 'beach, sea, sun', a verb before 'mai'
  // ('mua mai' is also 'buy tomorrow') and 'mai sau' ('mai sau giờ làm'
  // is tomorrow after work).
  const NOT_DATES = [
    "plants need sun", "garden gets no sun", "need more sun", "basil needs full sun", "tomatoes need full sun",
    "get some sun", "catch some sun", "too much sun", "avoid too much sun", "lavender likes full sun",
    "move pots into the sun", "herbs want lots of sun", "balcony gets morning sun", "back yard gets afternoon sun",
    "bedroom gets no sun", "lawn needs more sun", "does the fern need sun?", "any sun?", "hope for some sun",
    "hang washing in the sun", "dry clothes in sun", "enjoy the sun", "soak up some sun", "succulents need bright sun",
    "not enough sun", "the garden gets less sun", "pick a spot with full sun", "plant needs partial sun",
    "roses need 6 hours of sun", "get more sun", "need some sun", "gets full sun", "no sun", "there's no sun",
    "walk in the morning sun", "kids need a little sun", "cat loves the sun", "lemon tree needs direct sun",
    "herbs like full sun!", "seedlings need less sun", "veg patch gets plenty of sun", "front porch gets evening sun",
    "chillies love hot sun", "patio gets midday sun", "pots need winter sun", "ferns hate direct sun", "dog sleeps in sun",
    "too hot in the sun", "sit out in sun", "need sun", "needs sun", "getting some sun", "no more sun", "any more sun?",
    "fruit needs warm sun", "desk gets harsh sun", "monstera wants bright sun", "keep out of direct sun",
    "orchid prefers filtered sun", "aloe gets too much sun #care", "plants need sun !", "need more sun?", "where we sat",
    "the exam i sat", "notes from the test I sat", "seat where he sat", "chair she sat", "bench they sat",
    "the one who sat", "has sat", "had sat", "was sat", "i sat", "mua hoa mai", "tưới cây mai", "chậu mai vàng",
    "đi đám mai táng", "cắt cành mai", "bán mai vàng", "lặt lá mai", "tỉa lá mai", "mua cây mai", "chưng hoa mai",
    "mua chậu mai", "trồng mai vàng", "tưới mai vàng", "mai vàng nở", "mai táng ông", "lễ mai táng", "mai mối cho bạn",
    "mai rùa", "mai mực", "lột mai cua", "mua cái mai", "gốc mai bị sâu", "vườn mai", "hoa mai nở", "tuoi cay mai",
    "chau mai vang", "mua hoa mai tết", "cành mai đẹp", "canh mai", "buổi ban mai", "sáng ban mai", "mai kia",
    "mai này lớn lên", "mai đây", "mai mốt", "nụ mai", "lá mai vàng", "mai tang", "cay mai", "hoa mai", "gặp chị mai",
    "bác mai", "gọi cô mai", "mai vang", "mai moi", "mai rua", "cây mai nhà nội", "mua mai vàng tết", "tưới gốc mai",
    "tưới cây mai sáng", "have sat", "were sat", "been sat", "chairs we have sat", "summer sun", "holiday for winter sun",
    "basil wants summer sun", "lounge gets afternoon sun!", "need some more sun?", "no sun #care",
    "tomatoes need more sun ^garden", "the test they sat", "desk where she sat", "sea and sun", "fun and sun",
    "sand and sun", "plants like sun", "cat loves sun", "dog wants sun", "garden gets sun", "room has sun", "morning sun",
    "evening sun", "winter sun", "low winter sun", "blinds for afternoon sun", "hat against sun", "stay out of sun",
    "shopping for xmas", "presents for christmas", "save for xmas", "budget for christmas",
    "what to get mum for xmas?", "plan for eoy", "due xmas cards", "on xmas", "call grandma on christmas day",
    "gifts for xmas eve", "before xmas party buy dress", "xmas shopping", "christmas cards", "send xmas cards",
    "order christmas tree", "by xmas party", "due christmas lunch menu", "save for end of year", "party on eoy",
    "vào xmas đi chơi", "bonus for eoy", "saving for christmas presents", "ideas for xmas gifts", "money for xmas",
    "book flights for christmas", "until xmas break", "before christmas holidays", "by xmas market", "due xmas list",
    "on christmas eve", "for end of the year",
  ];
  const DATES = [
    "call mum sun", "bbq sun", "brunch with Tom sun", "groceries sun", "mow lawn sun", "laundry sun", "call grandma sun !",
    "meal prep sun #body", "church sun", "football sun", "clean car sun", "dinner at mum's sun", "run 10k sun",
    "see you sun", "park run sun", "swim sun", "get groceries sun", "need to call mum sun", "pick up kids sun",
    "drop off car sun", "wash the dog sun", "repot plants sun", "plant tomatoes sun", "garden sun", "picnic sun",
    "beach sun", "get haircut sun", "need groceries sun", "gym more weights sun", "market sat", "brunch sat",
    "dinner with Sam sat", "clean house sat", "see you sat", "party at Jo's sat", "long run sat", "haircut sat !",
    "soccer sat", "get tyres fixed sat", "need new shoes sat", "movie sat", "mow lawn sat", "study sat", "wedding sat",
    "kids party sat", "buy more paint sat", "pay some bills sat", "bake full batch sat", "clean any mess sat",
    "gọi mẹ mai", "goi me mai", "mai đi chợ", "mai họp", "nộp bài mai", "mai gọi anh Nam", "đi khám mai", "mai 9h họp",
    "học bài mai", "mai mua hoa", "mai mua cây", "mai tưới cây", "mai cắt tóc", "mai đi đám cưới", "mai đi đám tang",
    "đi đám tang mai", "trả sách cho Lan mai", "trả sách mai", "bán xe mai", "mai cho con đi học", "họp team mai",
    "email thầy mai", "mai nộp báo cáo !", "mua quà mai", "mai đi siêu thị", "dọn nhà mai", "mai gặp anh Minh",
    "mai học tiếng anh 30p", "chạy bộ mai #body", "get it done sun", "need it done sat", "brunch with Jo and Sam sun",
    "dinner at 7 sat", "tennis 9am sun", "get haircut sat", "walk dog every morning sun", "meditate this morning sun",
    "yoga daily sun", "gym more often sun", "call mum this evening sun", "meet Ann sun", "swim lessons sun",
    "kids party sun !", "sun: brunch", "sat: market", "bbq on sun", "pay rent by sun", "gym full body sat",
    "post more photos sun", "need more milk sat", "get some bread sun", "buy any gift sat", "order no-sugar cake sat",
    "hot yoga sun", "buy gifts by xmas", "wrap gifts by xmas eve", "buy tree before christmas day",
    "send cards by christmas", "finish quilt before xmas", "pay off card by xmas !", "trước xmas mua quà", "hạn chót xmas",
    "report by eoy", "report eoy", "due eoy", "until xmas", "till christmas", "due by xmas", "by xmas, send cards",
    "by xmas: cards", "lose 5kg by christmas #body", "book flights by xmas 30m", "send cards by xmas ^family",
    "goal: save 2k by eoy", "report by end of the year", "due on xmas eve",
    // Sunlight's amounts hold back only 'sun': before 'sat' they are the title's words.
    "too much sat", "full sat", "drinks evening sat", "run morning sat",
  ];
  const wrong: string[] = [];
  const broken: string[] = [];
  for (const [lines, wantDate] of [[NOT_DATES, false], [DATES, true]] as const) {
    for (const line of lines) {
      const p = parseCapture(line, { today: THU });
      if (p.tokens.some((t) => t.field === "date" || t.field === "deadline") !== wantDate) wrong.push(`'${line}' → '${p.title}' ${chips(p, line)}`);
      const problem = standing(line, THU);
      if (problem) broken.push(`'${line}': ${problem}`);
    }
  }
  report(`${NOT_DATES.length} sweep lines read no date, ${DATES.length} still read one`, wrong.length === 0, wrong.slice(0, 5).join("; "));
  report(`the ${NOT_DATES.length + DATES.length} sweep lines keep parity, idempotence and revert round trips`, broken.length === 0, broken.slice(0, 5).join("; "));
}

report(`capture.md English fixtures: ${englishCount} (at least 100)`, englishCount >= 100);
report(`capture.md Vietnamese fixtures: ${vnFixtures} (at least 40)`, vnFixtures >= 40);

console.log("\n── Typo variants collide with no common word (R10)");
{
  // ~300 of the most common English words, plus the grammar's own vocabulary.
  const STOPLIST = `the of and to a in is it you that he was for on are with as i his they be at one have this from or had by
not word but what some we can out other were all there when up use your how said an each she which do their time if will way about
many then them write would like so these her long make thing see him two has look more day could go come did number sound no most
people my over know water than call first who may down side been now find any new work part take get place made live where after back
little only round man year came show every good me give our under name very through just form sentence great think say help low line
differ turn cause much mean before move right boy old too same tell does set three want air well also play small end put home read hand
port large spell add even land here must big high such follow act why ask men change went light kind off need house picture try us
again animal point mother world near build self earth father head stand own page should country found answer school grow study still
learn plant cover food sun four between state keep eye never last let thought city tree cross farm hard start might story saw far sea
draw left late run while press close night real life few north open seem together next white children begin got walk example ease paper
group always music those both mark often letter until mile river car feet care second book carry took science eat room friend began
idea fish mountain stop once base hear horse cut sure watch color face wood main enough plain girl usual young ready above ever red list
though feel talk bird soon body dog family direct pose leave song measure door product black short numeral class wind question happen
complete ship area half rock order fire south problem piece told knew pass since top whole king space heard best hour better true during
hundred five remember step early hold west ground interest reach fast verb sing listen six table travel less morning ten simple several
vowel toward war lay against pattern slow center love person money serve appear road map rain rule govern pull cold notice voice unit
power town fine certain fly fall lead cry dark machine note wait plan figure star box noun field rest correct able pound done beauty
drive stood contain front teach week final gave green oh quick develop ocean warm free minute strong special mind behind clear tail
produce fact street inch multiply nothing course stay wheel full force blue object decide surface deep moon island foot system busy
test record boat common gold possible plane stead dry wonder laugh thousand ago ran check game shape equate hot miss brought heat snow
tire bring yes distant fill east paint language among today tonight tomorrow monday friday sunday toady eery frida`.split(/\s+/);
  const stop = new Set(STOPLIST);
  const variants = Object.keys(CAPTURE_TYPOS);
  const inStop = variants.filter((v) => stop.has(v));
  report(`no typo variant is a common English word (${variants.length} variants, ${stop.size} words)`, inStop.length === 0, inStop.join(", "));
  const CANONICAL = new Set([
    "mon", "monday", "tue", "tues", "tuesday", "wed", "weds", "wednesday", "thu", "thur", "thurs", "thursday", "fri", "friday",
    "sat", "saturday", "sun", "sunday", "mondays", "tuesdays", "wednesdays", "thursdays", "fridays", "saturdays", "sundays",
    "jan", "january", "feb", "february", "mar", "march", "apr", "april", "may", "jun", "june", "jul", "july", "aug", "august",
    "sep", "sept", "september", "oct", "october", "nov", "november", "dec", "december",
    "today", "tonight", "tomorrow", "tmr", "tmrw", "tdy", "every", "each", "daily", "weekly", "monthly", "nightly", "day", "days", "week", "weeks",
  ]);
  const clash = variants.filter((v) => CANONICAL.has(v));
  report("no typo variant is another canonical grammar word", clash.length === 0, clash.join(", "));
  report("every typo variant is lowercase", variants.every((v) => v === v.toLowerCase()));
  const fromDays = ["tomrrow", "tmorrow", "wednsday", "thurday", "firday", "evry", "evrey", "evey", "eveyr", "dialy", "dailly", "weely", "wekly", "weekyl", "wensday", "wendsday", "tonite", "2day", "2moro"];
  const missing = fromDays.filter((v) => !(v in CAPTURE_TYPOS));
  report("the spec's named misspellings are all read", missing.length === 0, missing.join(", "));
  const excluded = ["frida", "very", "ever", "eery", "toady"].filter((v) => v in CAPTURE_TYPOS);
  report("the exclude list is never read as a typo", excluded.length === 0, excluded.join(", "));
}

console.log("\n── Hotkey: Ctrl/Cmd+K from anywhere (P2)");
{
  const key = (k: string, mods: Partial<KeyLike> = {}): KeyLike => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods });
  const body = { tagName: "BODY", closest: () => null };
  const input = { tagName: "INPUT", closest: () => null };
  const area = { tagName: "TEXTAREA", closest: () => null };
  const inSheet = { tagName: "INPUT", closest: (s: string) => (s === "[data-capture-sheet]" ? {} : null) };
  const h = (name: string, got: boolean, want: boolean) => report(`hotkey: ${name}`, got === want, `got ${got}`);
  h("Ctrl+K in an INPUT opens", isCaptureHotkey(key("k", { ctrlKey: true }), input, false), true);
  h("Ctrl+K in a TEXTAREA opens", isCaptureHotkey(key("k", { ctrlKey: true }), area, false), true);
  h("Meta+K during review opens", isCaptureHotkey(key("k", { metaKey: true }), body, true), true);
  h("Meta+K in a textarea during review opens", isCaptureHotkey(key("K", { metaKey: true }), area, true), true);
  h("'c' in an INPUT stays closed", isCaptureHotkey(key("c"), input, false), false);
  h("'c' during review stays closed", isCaptureHotkey(key("c"), body, true), false);
  h("Ctrl+K inside the capture sheet does nothing", isCaptureHotkey(key("k", { ctrlKey: true }), inSheet, false), false);
  h("'c' inside the capture sheet does nothing", isCaptureHotkey(key("c"), inSheet, false), false);
  h("Ctrl+Shift+K is ignored", isCaptureHotkey(key("k", { ctrlKey: true, shiftKey: true }), input, false), false);
  h("Ctrl+Alt+K is ignored", isCaptureHotkey(key("k", { ctrlKey: true, altKey: true }), input, false), false);
  h("Ctrl+K while composing is ignored", isCaptureHotkey(key("k", { ctrlKey: true, isComposing: true }), input, false), false);
  h("Ctrl+K held down does not repeat-open", isCaptureHotkey(key("k", { ctrlKey: true, repeat: true }), input, false), false);
  h("Ctrl+K already handled is ignored", isCaptureHotkey(key("k", { ctrlKey: true, defaultPrevented: true }), area, false), false);
}

console.log("\n── Autocorrect: the task profile");
{
  /** Types a line key by key, correcting on each word boundary as the field does. */
  const typed = (line: string, profile?: AutocorrectProfile): string => {
    let t = "";
    for (const ch of line) {
      t += ch;
      if (isBoundaryKey(ch)) t = autocorrectAtCaret(t, t.length, profile ? { profile } : undefined).text;
    }
    return t;
  };
  for (const line of ["email Val about the contract ", "text ex about the keys ", "temp job application ", "diff report ", "Q3 info pack ", "a -> b ", "x <= y ", "wait... ", "Teh plan ", "TEH ", "call ref re: bc "]) {
    report(`task: '${line.trim()}' is left as typed`, typed(line, "task") === line, `'${typed(line, "task")}'`);
  }
  report("task: 'teh' still becomes 'the'", typed("call teh bank ", "task") === "call the bank ", `'${typed("call teh bank ", "task")}'`);
  report("task: 'recieve' still becomes 'receive'", typed("recieve parcel ", "task") === "receive parcel ");
  report("prose: 'email Val' still expands (the Add form is unchanged)", typed("email Val ") === "email Value ");
  // Today's prose outputs, recorded before the profile existed: the default and 'prose' must give exactly these.
  const PROSE: [string, string, number][] = [
    ["teh ", "the ", 4], ["hte cat ", "hte cat ", 8], ["email Val ", "email Value ", 12], ["text ex ", "text example ", 13],
    ["temp job ", "temp job ", 9], ["diff report ", "diff report ", 12], ["Q3 info ", "Q3 information ", 15], ["a -> b ", "a → b ", 6],
    ["x <= y ", "x ≤ y ", 6], ["wait... ", "wait… ", 6], ["TEH ", "TEH ", 4], ["Teh ", "The ", 4], ["recieve, ", "recieve, ", 9],
    ["w/ friends ", "w/ friends ", 11], ["w/o sugar ", "w/o sugar ", 10], ["VAR model ", "VAR model ", 10], ["getUserId ", "getUserId ", 10],
    ["x_0 ", "x_0 ", 4], ["bc it ", "bc it ", 6], ["val.", "val.", 4], ["the fn ", "the function ", 13], ["a -- b ", "a — b ", 6],
    ["seperate! ", "seperate! ", 10], ["approx 5 ", "approx 5 ", 9],
  ];
  const drift = PROSE.filter(([s, text, caret]) => {
    const a = autocorrectAtCaret(s, s.length);
    const b = autocorrectAtCaret(s, s.length, { profile: "prose" });
    return a.text !== text || a.caret !== caret || b.text !== text || b.caret !== caret;
  });
  report(`prose: ${PROSE.length} recorded outputs are unchanged`, drift.length === 0, drift.map(([s]) => s).join(" | "));
}

console.log("\n── Every line the grammar can build (seeded)");
{
  // A fixed seed: this is a reproducible sweep over combinations, not chance.
  let seed = 7;
  const next = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)];
  const TITLES = ["gym legs", "call mum", "pay rent", "read chapter", "water plants", "write report", "dentist", "clean kitchen", "review notes", "stretch"];
  const BITS = [
    "30m", "~45m", "1h30", "2 hours", "daily", "weekdays", "every mon,thu", "every other day", "every 2 weeks", "3x/week",
    "every! 3 days", "monthly on 15", "every 1st", "tmr", "today", "on sat", "by fri", "15 oct", "15/10", "in 3 days",
    "next week", "eom", "!", "must", "#body", "#craft", "#play", "^marathon", "(min: 5 pushups)", "review 20", "add 2 ideas",
  ];
  const HEADS = ["", "", "", "x ", "did ", "goal: ", "idea: "];
  let problems = 0;
  let first = "";
  const lines = 2000;
  for (let i = 0; i < lines; i++) {
    const parts = [pick(TITLES)];
    const n = Math.floor(next() * 4);
    for (let j = 0; j < n; j++) parts.push(pick(BITS));
    // Shuffle the tail so tokens appear in every order around the title.
    for (let j = parts.length - 1; j > 0; j--) {
      const k = Math.floor(next() * (j + 1));
      [parts[j], parts[k]] = [parts[k], parts[j]];
    }
    const line = pick(HEADS) + parts.join(" ") + (next() < 0.1 ? "?" : "");
    const problem = standing(line, pick([THU, FRI, SAT, SUN, "2026-12-31", "2027-02-28"]));
    if (problem) {
      problems++;
      if (!first) first = `'${line}': ${problem}`;
      if (process.env.CAPTURE_FUZZ_VERBOSE) console.log(`      ${line}: ${problem}`);
    }
  }
  report(`${lines} generated lines keep parity, idempotence and revert round trips`, problems === 0, problems ? `${problems} failed; first ${first}` : "");
}

console.log("\n── Every line capture.md's grammar can build (seeded, English and Vietnamese)");
{
  let seed = 1001;
  const next = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)];
  const TITLES = ["gym", "call mum", "pay rent", "read 2 pages", "swim", "enjoy the", "họp team", "đi chợ", "email thầy", "gặp Mai", "học tiếng anh"];
  const BITS = [
    "mon wed fri", "tue thu", "mon-fri", "sat-sun", "mon to fri", "M/W/F", "MWF", "3 times weekly", "twice weekly", "4 days a week",
    "a day", "2x a day", "per day", "every 2nd day", "every 3rd week", "every 2 weeks sat", "fortnightly fri", "before 15 oct", "before dec",
    "within 3 days", "asap", "by xmas", "eoy", "this year", "30/9", "march 5", "sat", "sun", "evry mon", "tomrrow", "firday", "2day",
    "400m", "2m rope", "50m", "9h", "15h", "lúc 3h", "3h chiều", "thứ 2", "t2 t4", "t2-t6", "tối nay", "sáng mai", "mai", "mốt", "30p",
    "2 tiếng", "1 tiếng rưỡi", "3 giờ", "mỗi ngày", "mỗi tuần", "trước thứ 6", "vào thứ 7", "3 lần/tuần", "hashtag body", "tag care",
    "for later", "an hour", "twenty minutes", "in an hour", ":: because rates", "!", "must", "#body", "^marathon", "tmr", "by fri", "30m",
    "daily", "every mon,thu", "on sat", "15 oct",
  ];
  const HEADS = ["", "", "", "x ", "did ", "done ", "goal: ", "idea: ", "sat: "];
  let problems = 0;
  let first = "";
  const lines = 2000;
  for (let i = 0; i < lines; i++) {
    const parts = [pick(TITLES)];
    const n = 1 + Math.floor(next() * 3);
    for (let j = 0; j < n; j++) parts.push(pick(BITS));
    for (let j = parts.length - 1; j > 0; j--) {
      const k = Math.floor(next() * (j + 1));
      [parts[j], parts[k]] = [parts[k], parts[j]];
    }
    const line = pick(HEADS) + parts.join(" ") + (next() < 0.1 ? "?" : next() < 0.1 ? " !" : "");
    const problem = standing(line, pick([THU, FRI, SAT, SUN, "2026-12-31", "2027-01-10", "2027-02-28"]));
    if (problem) {
      problems++;
      if (!first) first = `'${line}': ${problem}`;
      if (process.env.CAPTURE_FUZZ_VERBOSE) console.log(`      ${line}: ${problem}`);
    }
  }
  report(`${lines} generated lines of the new grammar keep parity, idempotence and revert round trips`, problems === 0, problems ? `${problems} failed; first ${first}` : "");
}

console.log(`\n${fixtures} fixtures; ${passed} passed, ${failed} failed`);
console.log(failed ? `\n${failed} failed` : "\nall pass");
process.exit(failed ? 1 : 0);
