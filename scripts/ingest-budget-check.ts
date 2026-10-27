/**
 * ingest-budget-check (blueprint 5.1, "sub-5-second ingestion"; plan P6, decision D33): logging a completed task never
 * costs more presses than the budget below. Pure: no database, no server, no browser, no device. ui:check runs it.
 *
 *   npx tsx scripts/ingest-budget-check.ts
 *
 *   1. A tick is 1 interaction. The board's tick calls the row's own tick (TaskRow's Tick → onTick → tickRow →
 *      complete, no sheet for an ordinary row); the board key x is one key on the task in focus (decideBoardKey) and
 *      reaches the same tickRow; the phone's Check row ticks in one tap (ProofLine.Tap.TICK for every row but a proof
 *      or reading one, which P23 and P24 ask for their minutes or pages on purpose). P7: a row of the phone's Yesterday
 *      section is one tap too, its tick for yesterday.
 *   2. A done-now line is open + one line + Enter. 'c' opens the sheet (isCaptureHotkey), the line reads as done-now
 *      and no gate stops its first Enter (mustGate), one press saves (enterAction, on a desktop and a phone), and the
 *      save is one tick of the row the line names with no template written (tickNamedRowCore through stubs), or the
 *      one-off as before when no row is named; the sheet's save path asks tickNamedRowCore first. On the phone the
 *      launcher's Quick task shortcut opens the line focused and the keyboard's send key is the press.
 *   3. The Android quick check is at most 2 taps from the launcher: the app opens on Check (Nav's first tab; the
 *      Quick check shortcut's xtnl://app/check lands there too), and a row's tap is its tick.
 *   4. P8 (D34): a widget tick is 1 tap. The cover-screen widget's row tick runs WidgetTick, which queues the tick on
 *      the phone and sends it (no dialog, no screen opened); every row but a proof or reading one ticks (Check's own
 *      rule). The quick-settings tile opens the quick line at its task section, as the Quick task shortcut does.
 *   5. The check-in on the web (health-2026-10-27.md D2, D3; brief §2.1, §4) is 1 tap to open plus 2: Today's strip and
 *      Body › Mind's Check in open the sheet in one tap; in it the grid tap picks, and a stress tap then saves (while
 *      no word or tag was added), or Save saves the grid alone. The phone's Check row, widget and tile join it in part 6.
 *   6. The check-in on the phone (health phase 2; D2; brief §2.4, §4) is 1 tap to open plus 2, the web's count: the
 *      cover widget's Check in button (48 dp) and the Check in tile (it asks to unlock first on the lock screen) open
 *      the sheet in one tap, and so do Check's Check in row and the launcher's Check in shortcut; in the sheet the grid
 *      tap picks and a stress tap saves, or Save saves the grid alone. Check's "2" (brief §4) is the sheet's two, as the
 *      web's is: the row opens the same sheet as the web's strip (D3) rather than holding the grid inline (§2.4).
 *   7. A set done as last time is 1 tap on the phone (health phase 2; brief §3.5): the open lift's card on Check has a
 *      56 dp ✓ that sends the next set as /check names it (the last lift's figures), or queues it (SET) with no answer.
 *
 * What is measured and what is wiring (P6 review): part 2's count is derived (the keys enterAction and the gates take,
 * and the writes tickNamedRowCore makes through its stubs), and so is part 1's key (one keydown through decideBoardKey,
 * whose run is the tick, and nothing left waiting after it). Part 6's and 7's totals are the length of a path whose
 * every tap is pinned (an unpinned tap fails it). The taps of parts 1, 3, 4, 5, 6 and 7 are wiring pins: they read
 * the source for a path with nothing between the tap and the tick or the save (no confirm, no sheet, no screen
 * opened), so they fail when one is added on that path, and their names say "wiring", never a measured count.
 */
import "./_no-model";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isCaptureHotkey, parseCapture, type TargetLike } from "../src/lib/capture-parse";
import { enterAction, mustGate, primaryAction } from "../src/components/capture/capture-ui";
import { SEQUENCE_IDLE, decideBoardKey, shortcutOf, type KeyEventLike } from "../src/lib/shortcuts";
import { doneNowAsksTick } from "../src/lib/done-now";
import { normTitleOf } from "../src/lib/life-lexicon";
import { activeTitlesOf, tickNamedRowCore, type Completion, type LifeResult, type NamedTickDeps } from "../src/lib/tasks";
import type { BoardTemplate } from "../src/lib/today-board";
import type { DayKey } from "../src/lib/life-day";

/** The budget, in presses (a key or a tap; typing the line is one interaction). */
const TICK_BUDGET = 1;
const DONE_NOW_BUDGET = 3;
const QUICK_CHECK_TAPS = 2;
/** The check-in: one tap opens the sheet, then two (the grid, and a stress level or Save). */
const CHECK_IN_OPEN_TAPS = 1;
const CHECK_IN_TAPS = 2;
/** A set done as last time: the lift card's ✓ (brief §3.5). */
const SET_TAPS = 1;

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
}

const TODAY: DayKey = "2026-10-01";
const ev = (key: string, mods: Partial<KeyEventLike> = {}): KeyEventLike => ({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods });
const body: TargetLike = { tagName: "BODY", closest: () => null };
const button: TargetLike = { tagName: "BUTTON", closest: () => null };

// ── 1. A tick is 1 interaction ──────────────────────────────────────────────
console.log("── 1. A tick is 1 interaction");
{
  const row = read("src/components/today/TaskRow.tsx");
  const board = read("src/components/today/TodayBoard.tsx");
  check(
    "web (wiring): the row's Tick calls its tick in the one tap (no confirm, no sheet)",
    /onClick=\{done \? props\.onUndo : \(\) => props\.onTick\(pillRef\.current\)\}/.test(row)
  );
  check(
    "web (wiring): an ordinary row's tick is the tick itself (tickRow → complete); only a proof or reading row asks for its minutes or pages",
    /onTick=\{\(from\) => \(viaSteps\(row\) \? tickSteps\(row, null, true, from\) : tickRow\(row, minutes, from\)\)\}/.test(board) &&
      /toChips\(ask \?\? "pick the minutes it took, or start its timer\."\);\s*return;\s*\}\s*complete\(row, \{ minutes, pages \}, from\);/.test(board)
  );
  // Measured: one keydown of x on the task in focus runs the tick, and leaves no sequence waiting for a second key.
  const x = decideBoardKey(ev("x", { code: "KeyX" }), SEQUENCE_IDLE, { target: button, modalOpen: false, onRow: true, now: 1_000 });
  const keys = x.run === "board-tick" && x.seq.prefix === null ? 1 : Infinity;
  check(`web: the board key x ticks the task in focus in ${keys} keydown (the budget is ${TICK_BUDGET})`, keys <= TICK_BUDGET && shortcutOf("board-tick").keys.join(" ") === "x", JSON.stringify(x));
  check("web (wiring): x reaches the same tick as the row's tap (tickRow with the row's minutes, or its steps)", /if \(viaSteps\(row\)\) tickSteps\(row, null, true, rowEl\);\s*else tickRow\(row, minutes, rowEl\);/.test(board));

  const screen = read("android/app/src/main/java/com/xtnl/app/ui/check/CheckScreen.kt");
  const proof = read("android/app/src/main/java/com/xtnl/app/core/ProofLine.kt");
  check("phone (wiring): a Check row's tap is its tick (onClick = onTick)", /onLongClick = if \(t\.open\) onSheet else null,\s*onClick = onTick,/.test(screen));
  check("phone (wiring): an open row's tap ticks at once (Tap.TICK → tick → vm.complete), with no dialog in between", /ProofLine\.Tap\.TICK -> tick\(t, mvv = false\)/.test(screen) && /fun tick\(t: TaskItem, mvv: Boolean[^)]*\) \{[\s\S]{0,700}?vm\.complete\(t, mvv = mvv/.test(screen));
  check("phone (wiring): every row but a proof or reading one is Tap.TICK", /t\.pages\?\.target != null -> Tap\.SHEET\s*!t\.proof -> Tap\.TICK/.test(proof));
  check("phone (wiring): the minimum is one tap too (onMvv ticks at the minimum)", /val onMvv: \(TaskItem\) -> Unit = \{ t -> tick\(t, mvv = true\) \}/.test(screen));
  // Blueprint P7: a Yesterday row (the web's Record yesterday) is one tap too: its tap ticks it for yesterday at once.
  check(
    "phone (P7, wiring): a Yesterday row's tap ticks it for yesterday at once (Tap.TICK → tick(…, yesterday = true)), its row's onClick its tick",
    /t\.open -> if \(ProofLine\.tapOf\(t, Instant\.now\(\), null\) == ProofLine\.Tap\.TICK\) tick\(t, mvv = false, yesterday = true\)/.test(screen) &&
      /val yRows = Rows\(spots, onYesterday, /.test(screen) &&
      /items\(list, key = \{ rows\.keyOf\(it\) \}[\s\S]{0,200}?onTick = \{ rows\.onTick\(t\) \}/.test(screen)
  );
}

// ── 2. A done-now line is open + one line + Enter ───────────────────────────
async function doneNowLine(): Promise<void> {
  console.log("\n── 2. A done-now line: open + one line + Enter");
  const line = "x gym 45m";
  const parsed = parseCapture(line, { today: TODAY });
  const open = isCaptureHotkey(ev("c", { code: "KeyC" }), body, false, false) ? 1 : 0;
  const gate = mustGate(null, line, !!parsed.compulsoryWarning);
  const desk = enterAction({ coarse: false, shift: false, composing: false, source: "key" });
  const phone = enterAction({ coarse: true, shift: false, composing: false, source: "key" });
  const presses = open + 1 /* the line */ + (desk === "save-close" ? 1 : 2);
  check("open: 'c' opens the sheet from the page (1 key)", open === 1);
  check("the line: 'x gym 45m' reads as done-now with its 45 minutes, and asks to tick the row it names", parsed.doneNow && parsed.estMinutes === 45 && parsed.title === "Gym" && doneNowAsksTick(parsed), JSON.stringify([parsed.doneNow, parsed.estMinutes, parsed.title]));
  check("Enter: no gate stops the first press (no Must without a day)", gate.action === "save", gate.action);
  check(`Enter: one press saves, on a desktop (save-close) and on a phone (save-stay): ${presses} interactions in all, the budget is ${DONE_NOW_BUDGET}`, desk === "save-close" && phone === "save-stay" && presses <= DONE_NOW_BUDGET, `${desk} / ${phone} / ${presses}`);
  check("the sheet says what Enter does: 'Tick it' when the line ticks the row it names", primaryAction({ editing: false, coarse: false, empty: false, sentThisOpening: 0, parsed, ticks: true }).label === "Tick it");

  // The save: one tick of the named row and no template, through tickNamedRowCore's own seams.
  const gym = { id: "gym", title: "Gym", normTitle: normTitleOf("Gym"), kind: "HABIT", recurrence: "DAILY", startDay: "2026-09-01", inbox: false, autoMetric: null, completedAt: null, createdAt: "2026-09-01T00:00:00.000Z", compulsory: false, dueDay: null, dueKind: null, planDay: null } as unknown as BoardTemplate;
  const core = { today: TODAY, yesterday: "2026-09-30", templates: [gym], instances: [], stats: {} };
  const writes: string[] = [];
  const deps: NamedTickDeps = {
    keyTaken: async () => false,
    board: async () => ({ core, active: activeTitlesOf(core) }),
    complete: async (id, minutes): Promise<LifeResult<Completion>> => {
      writes.push(`tick ${id} ${minutes}`);
      return { ok: true, value: { instanceId: "i1", templateId: id, eventId: "e1", day: TODAY, slot: 0, receipt: { xp: 8.3 } as Completion["receipt"], status: "DONE", source: "manual", occurredAt: "2026-10-01T08:00:00.000Z", duplicate: false } };
    },
  };
  const done = await tickNamedRowCore("u", parsed, { captureKey: "k1" }, deps);
  check("save: the line ticks the Gym habit with its 45 minutes, one write, no template", !!done && done.ok && done.value.id === "gym" && !!done.value.ticked && JSON.stringify(writes) === JSON.stringify(["tick gym 45"]), JSON.stringify([done, writes]));
  const none = await tickNamedRowCore("u", parseCapture("x swim 30m", { today: TODAY }), { captureKey: "k2" }, deps);
  check("save: a line naming no row is left to the one-off insert, as before (null)", none === null && writes.length === 1);
  const capture = read("src/app/actions/capture.ts");
  check(
    "save path: the sheet's and the phone's save ask tickNamedRowCore first, and write a template only when it answers null",
    /const ticked = await tickNamedRowCore\(userId, line\.parsed, \{ captureKey: opts\.captureKey, boardId: opts\.boardId, asNew: opts\.asNew, around: momentsAround\(userId\) \}\);\s*if \(ticked\) return ticked;\s*const created = await createTemplateCore\(/.test(capture) &&
      (capture.match(/await saveLine\(userId, /g) ?? []).length === 2
  );
  const log = read("android/app/src/main/java/com/xtnl/app/ui/log/LogScreen.kt");
  const xml = read("android/app/src/main/res/xml/shortcuts.xml");
  check("phone: the launcher's Quick task opens the line focused, and its send key saves", /android:shortcutId="quick_task"[\s\S]*?android:data="xtnl:\/\/app\/log\?section=task"/.test(xml) && /imeAction = ImeAction\.Send,/.test(log) && /keyboardActions = KeyboardActions\(onSend = \{ vm\.send\(\) \}\)/.test(log) && /if \(!nav\.takeFocusLog\(\)\) return@LaunchedEffect/.test(log));
}

// ── 3. The Android quick check: ≤ 2 taps from the launcher ──────────────────
function quickCheck(): void {
  console.log("\n── 3. The Android quick check: at most 2 taps from the launcher");
  const xml = read("android/app/src/main/res/xml/shortcuts.xml");
  const nav = read("android/app/src/main/java/com/xtnl/app/ui/Nav.kt");
  const manifest = read("android/app/src/main/AndroidManifest.xml");
  // Wiring: the icon (MAIN/LAUNCHER) opens on Check, its first tab, with nothing in between; the row's tap is its tick
  // (part 1's onClick = onTick). So the quick check is the icon and the row: QUICK_CHECK_TAPS.
  const opensOnCheck = /<action android:name="android\.intent\.action\.MAIN" \/>\s*<category android:name="android\.intent\.category\.LAUNCHER" \/>/.test(manifest) && /class Nav\(tab: Tab = Tab\.CHECK,/.test(nav);
  const rowTicks = /onClick = onTick,/.test(read("android/app/src/main/java/com/xtnl/app/ui/check/CheckScreen.kt"));
  check(`phone (wiring): the icon opens on Check and a row's tap is its tick, so the quick check fits its ${QUICK_CHECK_TAPS} taps`, opensOnCheck && rowTicks, JSON.stringify([opensOnCheck, rowTicks]));
  check(
    "phone: the Quick check launcher shortcut opens xtnl://app/check, which Nav lands on Check",
    /android:shortcutId="quick_check"[\s\S]*?android:data="xtnl:\/\/app\/check"/.test(xml) && /path == "\/" \|\| path == "\/check"[^\n]*-> \{\s*tab = Tab\.CHECK/.test(nav) && /android:name="android\.app\.shortcuts"/.test(manifest)
  );
  const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
  check("package.json: ui:check runs ingest-budget-check", pkg.scripts["ui:check"].includes("tsx scripts/ingest-budget-check.ts") && pkg.scripts["ingest-budget:check"] === "tsx scripts/ingest-budget-check.ts");
}

// ── 4. A widget tick is 1 tap (P8) ──────────────────────────────────────────
function widgetTick(): void {
  console.log("\n── 4. A widget tick: 1 tap (P8)");
  const widget = read("android/app/src/main/java/com/xtnl/app/widget/TodayWidget.kt");
  const tick = read("android/app/src/main/java/com/xtnl/app/widget/WidgetTick.kt");
  const rows = read("android/app/src/main/java/com/xtnl/app/core/WidgetRows.kt");
  const tile = read("android/app/src/main/java/com/xtnl/app/tile/LogTileService.kt");
  const manifest = read("android/app/src/main/AndroidManifest.xml");
  const info = read("android/app/src/main/res/xml/today_widget_info.xml");
  const xml = read("android/app/src/main/res/xml/shortcuts.xml");
  // Wiring: the row's tick (its 48 dp circle) runs WidgetTick, which is the whole tick.
  const tickRuns =
    /WidgetRows\.Tap\.TICK -> actionRunCallback<WidgetTick>\(WidgetTick\.parametersOf\(r\)\)/.test(widget) &&
    /Box\(if \(tick != null\) circle\.clickable\(tick\) else circle, contentAlignment = Alignment\.Center\)/.test(widget) &&
    /val circle = GlanceModifier\.size\(WidgetRows\.ROW_DP\.dp\)/.test(widget) && /const val ROW_DP = 48/.test(rows);
  check(`phone (P8, wiring): a widget row's tick runs WidgetTick, the whole tick, so it fits its ${TICK_BUDGET} tap`, tickRuns);
  // WidgetTick's own body: it queues and sends, and nothing in it opens a screen or asks anything (no activity, intent,
  // dialog, notification or pending intent), so a helper that opens one fails here whatever it is called.
  const onAction = /override suspend fun onAction\([\s\S]*?\n    \}\n/.exec(tick)?.[0] ?? "";
  check(
    "phone (P8, wiring): WidgetTick queues the tick on the phone with its row's own day and sends it at once; nothing in it opens a screen or asks",
    onAction.length > 0 &&
      /val day = parameters\[DAY\]\?\.takeIf \{ TimeLabels\.parseDay\(it\) != null \} \?: queue\.today\(\)/.test(onAction) &&
      /queue\.enqueue\(QueuedWrite\.tick\(UUID\.randomUUID\(\)\.toString\(\), source, day, title, templateId\)\)/.test(onAction) &&
      /queue\.kick\(\)/.test(onAction) &&
      !/startActivity|actionStart|Intent|Dialog|Notification|PendingIntent|Toast/.test(tick.replace(/\/\*\*[\s\S]*?\*\//g, "")),
    onAction.slice(0, 200)
  );
  check(
    "phone (P8): every widget row but a proof or reading one ticks in that tap (Check's own ProofLine.tapOf); a waiting one has no second tick",
    /if \(ProofLine\.tapOf\(t, now, today\) == ProofLine\.Tap\.TICK\) Tap\.TICK else Tap\.OPEN_APP/.test(rows) &&
      /waiting != null -> Row\(t\.templateId, t\.title, t\.lane, metaOf\(t, waiting = true\), waiting = true, tap = Tap\.NONE, day = data\.day\)/.test(rows)
  );
  check(
    "phone (P8): the widget is declared and sized for the cover screen (4 × 2 cells, resizable)",
    /android:name="\.widget\.TodayWidgetReceiver"[\s\S]*?android:resource="@xml\/today_widget_info"/.test(manifest) &&
      /android:targetCellWidth="4"/.test(info) && /android:targetCellHeight="2"/.test(info) && /android:resizeMode="horizontal\|vertical"/.test(info)
  );
  check(
    "phone (P8): the quick-settings tile opens the quick line at its task section (Quick task's own link), bound only by the system",
    /const val LOG_URI = "xtnl:\/\/app\/log\?section=task"/.test(tile) && /android:data="xtnl:\/\/app\/log\?section=task"/.test(xml) &&
      /android:name="\.tile\.LogTileService"[\s\S]*?android:permission="android\.permission\.BIND_QUICK_SETTINGS_TILE"[\s\S]*?android\.service\.quicksettings\.action\.QS_TILE/.test(manifest)
  );
}

// ── 5. The check-in on the web: 1 tap to open + 2 ───────────────────────────
function checkIn(): void {
  console.log(`\n── 5. The check-in on the web: ${CHECK_IN_OPEN_TAPS} tap to open + ${CHECK_IN_TAPS}`);
  const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
  const strip = code(read("src/components/mind/CheckInStrip.tsx"));
  const card = code(read("src/components/mind/MindCard.tsx"));
  const sheet = code(read("src/components/mind/CheckInSheet.tsx"));
  const grid = code(read("src/components/mind/MindGrid.tsx"));
  check(
    `web (wiring): Today's strip and Body › Mind's Check in open the sheet in ${CHECK_IN_OPEN_TAPS} tap (no confirm, no screen between)`,
    /<button ref=\{btnRef\} type="button" className="mind-strip-btn" aria-haspopup="dialog" onClick=\{\(\) => setOpen\(true\)\}>/.test(strip) &&
      /<Button variant="primary" size="lg" icon="grid" block aria-haspopup="dialog" onClick=\{\(\) => setOpen\(true\)\}>/.test(card) &&
      /<CheckInSheet\s+open=\{open\}/.test(strip) && /<CheckInSheet\s+open=\{open\}/.test(card)
  );
  check(
    "web (wiring): tap 1, the grid: one click picks the cell (cellAt), nothing to confirm",
    /function onClick\(e: MouseEvent<HTMLDivElement>\) \{\s*const box = e\.currentTarget\.getBoundingClientRect\(\);\s*const cell = cellAt\([^)]*\);\s*if \(cell\) onChange\(cell\);\s*\}/.test(grid) && /onChange=\{pick\}/.test(sheet)
  );
  check(
    `web (wiring): tap 2, a stress level, saves while nothing else was added (grid + stress = ${CHECK_IN_TAPS}); else Save saves (grid + Save = ${CHECK_IN_TAPS})`,
    /const stressSaves = cell !== null && !extras;/.test(sheet) && /if \(stressSaves\) \{\s*setStress\(value\);\s*save\(value\);\s*return;\s*\}/.test(sheet) && /onClick=\{\(\) => tapStress\(s\.value\)\}/.test(sheet) &&
      /<Button variant="primary" size="lg" onClick=\{\(\) => save\(\)\} disabled=\{!cell \|\| pending\}>/.test(sheet)
  );
  check(
    "web (wiring): the save is the save: logCheck in the same tap (no timer, no second sheet), and the opener shows the receipt",
    /startTransition\(async \(\) => \{\s*try \{\s*const res = await logCheck\(/.test(sheet) && !/setTimeout|setInterval/.test(/export function CheckInForm[\s\S]*$/.exec(sheet)?.[0] ?? "x setTimeout")
  );
}

// ── 6. The check-in on the phone: 1 tap to open + 2 (health phase 2) ────────
function checkInPhone(): void {
  console.log(`\n── 6. The check-in on the phone: ${CHECK_IN_OPEN_TAPS} tap to open + ${CHECK_IN_TAPS}`);
  const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
  const sheet = code(read("android/app/src/main/java/com/xtnl/app/ui/check/CheckinSheet.kt"));
  const screen = code(read("android/app/src/main/java/com/xtnl/app/ui/check/CheckScreen.kt"));
  const root = code(read("android/app/src/main/java/com/xtnl/app/ui/AppRoot.kt"));
  const nav = code(read("android/app/src/main/java/com/xtnl/app/ui/Nav.kt"));
  const activity = code(read("android/app/src/main/java/com/xtnl/app/MainActivity.kt"));
  const tile = code(read("android/app/src/main/java/com/xtnl/app/tile/CheckinTileService.kt"));
  const widget = code(read("android/app/src/main/java/com/xtnl/app/widget/TodayWidget.kt"));
  const rows = code(read("android/app/src/main/java/com/xtnl/app/core/WidgetRows.kt"));
  const manifest = read("android/app/src/main/AndroidManifest.xml");
  const xml = read("android/app/src/main/res/xml/shortcuts.xml");

  // The one sheet every surface opens: AppRoot holds it over any screen and opens it on Nav's tick, nothing between.
  const host =
    /LaunchedEffect\(nav\.checkin\) \{\s*if \(!nav\.takeCheckin\(\)\) return@LaunchedEffect\s*if \(CheckinLine\.canOpen\(checkVm\.ui\.value\.data\?\.checkin\)\) checkinVia = nav\.checkinVia else snacks\.show\(CheckinLine\.NOT_OPEN\)\s*\}/.test(root) &&
    /checkinVia\?\.let \{ via ->\s*CheckinSheet\(/.test(root);
  // A deep link (the widget, the tile, the shortcut): the app takes it as it opens (MainActivity → Nav.open), lands on
  // Check and ticks the sheet open with its surface.
  const link =
    /if \(data\.scheme == "xtnl"\) deepLinks\.value = data/.test(activity) && /link\?\.let \{ nav\.open\(it\); onDeepLinkHandled\(\) \}/.test(root) &&
    /path == "\/checkin" -> \{\s*tab = Tab\.CHECK\s*checkinVia = CheckinLine\.viaOf\(uri\.getQueryParameter\("via"\)\)\s*checkin\+\+/.test(nav);
  check("phone (wiring): every surface opens the one sheet AppRoot holds, on Nav's tick, with nothing between (a check-in that isn't live gets a line)", host);
  check("phone (wiring): xtnl://app/checkin, the deep link, lands on Check with the sheet ticked open (MainActivity → Nav.open)", link);

  // Each surface's opening tap.
  const widgetOpens =
    link && /if \(view\.checkin\) CheckinButton\(context\)/.test(widget) &&
    /GlanceModifier\.height\(WidgetRows\.ROW_DP\.dp\)\.padding\(start = 4\.dp\)\.clickable\(openApp\(context, WidgetRows\.CHECKIN_PATH\)\)/.test(widget) &&
    // Narrower than 400 dp (the 3 × 2 cover widget) it is the glyph alone, the same 48 dp target and the same one tap.
    /if \(compact\) GlanceModifier\.size\(WidgetRows\.ROW_DP\.dp\)\.clickable\(openApp\(context, WidgetRows\.CHECKIN_PATH\)\)/.test(widget) &&
    /const val CHECKIN_PATH = "\/checkin\?via=widget"/.test(rows) && /const val ROW_DP = 48/.test(rows) &&
    /private fun openApp\(context: Context, path: String\) = actionStartActivity\(\s*Intent\(Intent\.ACTION_VIEW, Uri\.parse\("xtnl:\/\/app\$path"\)\)\.setComponent\(ComponentName\(context, MainActivity::class\.java\)\),\s*\)/.test(widget);
  const tileOpens =
    link && /const val CHECKIN_URI = "xtnl:\/\/app\/checkin\?via=tile"/.test(tile) &&
    /override fun onClick\(\) \{\s*super\.onClick\(\)\s*if \(isLocked\) unlockAndRun \{ open\(\) \} else open\(\)\s*\}/.test(tile) &&
    /Intent\(Intent\.ACTION_VIEW, Uri\.parse\(CHECKIN_URI\), this, MainActivity::class\.java\)/.test(tile) &&
    /android:name="\.tile\.CheckinTileService"[\s\S]*?android:permission="android\.permission\.BIND_QUICK_SETTINGS_TILE"[\s\S]*?android\.service\.quicksettings\.action\.QS_TILE/.test(manifest);
  const rowOpens =
    /\.clickable\(role = Role\.Button, onClickLabel = "Open the check-in", onClick = onOpen\)/.test(sheet) &&
    /CheckinRow\(state, ui\.data\?\.day, onOpen = onCheckin,/.test(screen) && (screen.match(/checkin\(ui, onCheckin\)/g) ?? []).length === 2 &&
    /onCheckin = \{ nav\.checkinVia = "check"; nav\.checkin\+\+ \}/.test(root);
  const shortcutOpens = link && /android:shortcutId="check_in"[\s\S]*?android:data="xtnl:\/\/app\/checkin"/.test(xml);

  // The sheet's two: tap 1 the grid picks (one tap, nothing to confirm); tap 2 a stress level saves once the grid is
  // picked, or Save saves the grid alone; the save is the view model's send in that tap (no timer saves on its own).
  const grid = /detectTapGestures \{ p -> CheckinLine\.cellAt\(p\.x, p\.y, size\.width\.toFloat\(\), size\.height\.toFloat\(\)\)\?\.let\(pick\) \}/.test(sheet);
  const stressOrSave = /if \(CheckinLine\.stressSaves\(cell\)\) \{\s*stress = i\s*save\(i\)/.test(sheet) && /XButton\(CheckinLine\.SAVE, \{ save\(stress\) \}/.test(sheet);
  const saves =
    /onSave\(pick, level, CheckinLine\.tookMs\(openedAt, SystemClock\.elapsedRealtime\(\)\)\)/.test(sheet) &&
    /onSave = \{ cell, stress, tookMs ->\s*checkinVia = null\s*checkVm\.checkin\(cell, stress, via, tookMs\)/.test(root) &&
    !/delay\(|LaunchedEffect|postDelayed/.test(sheet);
  check("phone (wiring): tap 1, the grid: one tap picks the cell (CheckinLine.cellAt), nothing to confirm", grid);
  check(`phone (wiring): tap 2, a stress level, saves once the grid is picked (grid + stress = ${CHECK_IN_TAPS}); else Save saves (grid + Save = ${CHECK_IN_TAPS})`, stressOrSave);
  check("phone (wiring): the save is the save: the view model sends it in the same tap (no timer saves on its own), the sheet closing", saves);

  // A path is its taps; a tap not pinned above fails the path (Infinity), whatever else holds.
  const taps = (...steps: boolean[]) => (steps.every(Boolean) ? steps.length : Infinity);
  const budget = CHECK_IN_OPEN_TAPS + CHECK_IN_TAPS;
  const paths: [string, number][] = [
    ["the cover widget's Check in button (48 dp)", taps(widgetOpens && host, grid, stressOrSave && saves)],
    ["the Check in tile (on the lock screen it asks to unlock first, so the sheet never shows over it)", taps(tileOpens && host, grid, stressOrSave && saves)],
    ["Check's Check in row, on both displays (the web strip's way, D3: its 2 are the sheet's)", taps(rowOpens && host, grid, stressOrSave && saves)],
    ["the launcher's Check in shortcut", taps(shortcutOpens && host, grid, stressOrSave && saves)],
  ];
  for (const [name, n] of paths) {
    check(`phone (wiring): ${name}: ${CHECK_IN_OPEN_TAPS} tap opens the sheet, then ${CHECK_IN_TAPS}: ${n} in all, the budget is ${budget}`, n <= budget, String(n));
  }
}

// ── 7. A set done as last time: 1 tap on the phone (health phase 2) ─────────
function setPhone(): void {
  console.log(`\n── 7. A set done as last time on the phone: ${SET_TAPS} tap`);
  const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
  const card = code(read("android/app/src/main/java/com/xtnl/app/ui/check/LiftCard.kt"));
  const screen = code(read("android/app/src/main/java/com/xtnl/app/ui/check/CheckScreen.kt"));
  const vm = code(read("android/app/src/main/java/com/xtnl/app/ui/check/CheckViewModel.kt"));
  const line = code(read("android/app/src/main/java/com/xtnl/app/core/SetLine.kt"));
  // The ✓: a 56 dp button on the open lift's card, its click the card's onSet, on both displays (Check's card).
  const tick =
    /if \(next != null && SetLine\.canTick\(next\)\) \{[\s\S]{0,120}?XIconButton\(\s*Glyphs\.Tick, SetLine\.doneLabel\(next\), onSet, size = 56\.dp,/.test(card) &&
    /val onSet: \(\) -> Unit = \{ feel\?\.press\(\); vm\.logSet\(\) \}/.test(screen) && (screen.match(/lift\(ui, onSet, onOpenWeb\)/g) ?? []).length === 2;
  // logSet: the next set as /check named it (no field to fill: SetLine.bodyOf copies the last lift's figures, and only
  // a next with figures to copy has a ✓), sent in the tap, or queued (SET) when it gets no answer at all.
  const logSet = /fun logSet\(.*\) \{[\s\S]*?\n    \}\n/.exec(vm)?.[0] ?? "";
  const sendSet = /private fun sendSet\(.*\) \{[\s\S]*?\n    \}\n/.exec(vm)?.[0] ?? "";
  const sends =
    /val body = SetLine\.bodyOf\(lift, next, doneAt\) \?: return\s*sendSet\(body, SetLine\.label\(next\), clientId, tapMs\)/.test(logSet) &&
    /val r = graph\.api\.liftSet\(body, clientId\)/.test(sendSet) &&
    /if \(r\.offline && graph\.sendQueue\.enqueue\(QueuedWrite\.liftSet\(clientId, source, label, body\)\)\)/.test(sendSet) &&
    /fun bodyOf\(lift: OpenLift, n: LiftNext, doneAt: String\): LiftSetBody\? \{\s*if \(!canTick\(n\)\) return null/.test(line) &&
    /fun canTick\(n: LiftNext\?\): Boolean =\s*n != null && n\.fromLast && /.test(line);
  // Nothing on that path opens a screen or asks: no dialog, sheet, picker or screen between the ✓ and the send.
  const asks = /Dialog|Sheet|sheetFor|startActivity|Intent|nav\.|onOpenWeb|Picker|Toast/;
  const quiet = logSet.length > 0 && sendSet.length > 0 && !asks.test(logSet) && !asks.test(sendSet);
  check("phone (wiring): the lift card's ✓ is a 56 dp button whose tap is the set (onSet → vm.logSet), on the cover screen and the main display", tick);
  check("phone (wiring): the ✓ sends the next set as /check named it (SetLine.bodyOf, the last lift's figures), or queues it (SET) with no answer", sends);
  check("phone (wiring): nothing between the ✓ and the send (no dialog, sheet, picker or screen opened)", quiet, `${logSet.length} / ${sendSet.length}`);
  const n = (tick && sends && quiet ? 1 : Infinity);
  check(`phone (wiring): a set done as last time is ${n} tap on the lift card, the budget is ${SET_TAPS}`, n <= SET_TAPS, String(n));
}

void doneNowLine().then(() => {
  quickCheck();
  widgetTick();
  checkIn();
  checkInPhone();
  setPhone();
  console.log(`\ningest-budget-check: ${failed ? `${failed} failed` : "all passed"}`);
  process.exit(failed ? 1 : 0);
});
