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
  tidyTitle,
  type CaptureSpan,
  type KeyLike,
} from "../src/lib/capture-parse";
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
  play: "play", parent: "parent", mvv: "mvv", study: "study",
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
      if (!off.tokens.some((o) => o.start === other.start && o.end === other.end && o.field === other.field)) {
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
fx("gym legs 60m every mon,thu !", { title: "Gym legs", kind: "HABIT", recurrence: "DOW:1,4", estMinutes: 60, compulsory: true, compulsoryWarning: null, fields: ["duration", "recurrence", "compulsory"], labels: { recurrence: "Mon · Thu", duration: "~1h" } });
fx("pay rent every 1st !", { title: "Pay rent", recurrence: "MONTHLY:1", compulsory: true, labels: { recurrence: "Monthly · 1st" } });
fx("review 20 daily !", { title: "Review 20", recurrence: "DAILY", compulsory: true, autoMetric: "REVIEWS", autoTarget: 20, fields: ["study", "recurrence", "compulsory"] });
fx("call mum sun", { title: "Call mum sun", dueDay: null, fields: [] });
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
fx("idea: why do bonds fall :: rates rise, price falls", { mode: "IDEA", title: "Why do bonds fall :: rates rise, price falls" });
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
fx("marathon training 12h", { title: "Marathon training", estMinutes: 480 });
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
fx("long run weekends", { title: "Long run", recurrence: "DOW:6,7", labels: { recurrence: "Sat · Sun" } });
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
fx("birthday 5 sep", { dueDay: "2027-09-05", labels: { date: "Sun 5 Sep 2027" } });
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
fx("bbq sun", { title: "Bbq sun", dueDay: null });
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
fx("ring vet mar 3", { title: "Ring vet mar 3", dueDay: null });
fx("ring vet by mar 3", { title: "Ring vet", dueDay: "2027-03-03", dueKind: "DEADLINE" });
fx("tidy desk by tonight", { title: "Tidy desk", dueDay: THU, dueKind: "DEADLINE", labels: { deadline: "By today" } });
fx("eat 5 a day", { title: "Eat 5 a day", fields: [] });
fx("dentist (tmr)", { title: "Dentist", dueDay: FRI });
fx("move desk tue to fri", { title: "Move desk to fri", dueDay: "2026-10-06" });
fx("weekly shop next month", { recurrence: "EVERY:7", dueDay: "2026-11-01" });

console.log("\n── Compulsory");
fx("must call landlord by fri", { title: "Call landlord", compulsory: true, dueKind: "DEADLINE" });
fx("pay rent !", { title: "Pay rent", compulsory: false, compulsoryWarning: COMPULSORY_WARNING, labels: { compulsory: "Compulsory · needs a schedule" } });
fx("pay rent fri !", { compulsory: false, compulsoryWarning: COMPULSORY_WARNING, dueKind: "PLANNED" });
fx("meds daily !!", { title: "Meds", compulsory: true });
fx("water plants every! 3 days !", { recurrence: "AFTER:3", compulsory: false, compulsoryWarning: COMPULSORY_WARNING });
fx("gym 3x/week must", { recurrence: "TARGET:3/W", compulsory: false, compulsoryWarning: COMPULSORY_WARNING });
fx("file taxes by 31/10!", { title: "File taxes", compulsory: true, dueKind: "DEADLINE" });
fx("wow what a day!", { title: "Wow what a day", compulsory: false, compulsoryWarning: COMPULSORY_WARNING });
fx("mustard shopping", { title: "Mustard shopping", compulsory: false, fields: [] });
fx("MUST renew rego by 15/10", { title: "Renew rego", compulsory: true });
fx("meds daily !?", { title: "Meds", compulsory: true, inbox: true, fields: ["recurrence", "compulsory", "inbox"] });
fx("call bank tomorrow?!", { title: "Call bank", inbox: true, compulsoryWarning: COMPULSORY_WARNING, fields: ["date", "inbox", "compulsory"] });

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
fx('long run ^"run a marathon" sat', { title: "Long run sat", parentHint: "run a marathon", dueDay: null });
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
  h("Ctrl+K in an input is ignored", isCaptureHotkey(key("k", { ctrlKey: true }), input, false), false);
  h("'c' during a review session is ignored", isCaptureHotkey(key("c"), body, true), false);
  h("Ctrl+K during a review session is ignored", isCaptureHotkey(key("k", { ctrlKey: true }), body, true), false);
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

console.log(`\n${fixtures} fixtures; ${passed} passed, ${failed} failed`);
console.log(failed ? `\n${failed} failed` : "\nall pass");
process.exit(failed ? 1 : 0);
