# M2 (refitted): Duty — the compulsory contract, forgiveness and rituals

Replaces m2.md for the build. m2.md was written before the capture rebuild (capture.md), the redesign (redesign.md), M5 (m5-refit.md, m5-contracts.md, m5.md; LAUNCHED 2026-10-01), weight tracking (src/lib/weight*.ts), the keyboard shortcuts and the tour. M3 and M4 are dropped by the user: nothing here depends on workouts, sensors, heart rate or step data.

Root for every path: C:/Users/Thanc/OneDrive/Desktop/XTNL-idea. Paths below are relative to it.

Revision 2 applies the critique of revision 1. What changed, and every critique finding that was not taken as written, is listed under "Critique notes" at the end.

## Goal

Give compulsory tasks real, bounded stakes and make every slip recoverable, on top of what M1, the redesign, capture and M5 already built.

What M2 delivers:
- Lazy, idempotent daily settlement: day d is judged at 04:00 on d+2 (Australia/Sydney life days), after the user has had the whole next day to record it.
- XP debt for a missed must (DUTY track), shown as make-up cards inside the Must lane, never as a red wall.
- Make-ups (×0.85) and minimum make-ups (×0.3 × 0.85) that repay the debt in full and, inside a two-day window, restore the per-duty streak.
- Earned freezes, rest, sick and vacation days (vacation within a yearly budget), and a one-day repair through a Full day.
- The Full day goes live: settlement records it, and the M5 week judge pays its 0.5 MP after the kept tracks, inside the 8 MP weekly cap.
- An akrasia horizon: weakening a must takes 7 days; strengthening is immediate but never retroactive.
- Close the day (with a private note and mood) and a weekly review runner on /today/week.
- One migration (life_duty): the RestDay table.

Deferred to a follow-up (decision 33): the rested ×1.10 bonus, knee reconcile, velocity per category, 'stalled' goals, WelcomeBack, and standing rest weekdays (question 4).

Lead decisions taken here (each departs from m2.md or fills a gap in it, with its reason):

1. **Launch gate and cursor.** A code constant DUTY_LAUNCH_DAY (null until the lead sets it; a Monday on or after the production deploy, 2026-10-12 at the earliest), with the non-production override XTNL_DUTY_LAUNCH_DAY. scripts/duty-launch.ts sets LifeSettings.settledThroughDay to max(DUTY_LAUNCH_DAY, epochDay) − 1 with --apply (dry run first; --apply on firstDutyDay + 1 or later, F20). Settlement does nothing while the cursor is null. A LifeSettings row created after launch (the first capture after a 'life' reset, or a first capacity setting) is created with settledThroughDay = epochDay − 1 through one lane-0 helper, newLifeSettingsDays(today), so a reset never switches Duty off. *Reason:* m2.md's "null cursor → today − 2" judges the day before the deploy at the first run after it, a day lived under M1 with no stakes. A Monday keeps every life week wholly pre-M2 or wholly M2. The cursor row doubles as the launch-finished marker, like M5's DECAY_GRACE row. Without the create-time cursor, a reset leaves the cursor null for ever: the launch script's gate would also refuse, since epochDay would be after DUTY_LAUNCH_DAY.

2. **Shared database.** Every write on read (settlement, the week judge) needs lifeWritesEnabled() (NODE_ENV production or XTNL_LIFE_JUDGE=1) and the cursor set. The cron refuses to run unless CRON_SECRET is set and matches. User actions are gated by what they write:
   - declareRest, declareSick and setVacation write only RestDay. Once DUTY_LAUNCH_DAY is set they are allowed for days ≥ DUTY_LAUNCH_DAY, before launch too, so the user can prepare the launch week.
   - makeUp, doMinimum, undoMakeUp and acceptLoss are allowed whenever a debtOpen instance exists, launched or not (a rollback of the constant must not strand a debt card).
   - spendFreeze and 'Settle yesterday' refuse before isDutyLaunched(today).
   *Reason:* dev and prod share one Supabase database; a local `next dev` rendering /today must never settle the live account. The degrade cron's "skip the check when the secret is unset" is not safe for a writer. Rest rows touch no ledger, so preparing them early is harmless.

3. **Day keys, never hours.** "Judged at dayEnd(d) + 24 h" is implemented as d ≤ todayKey − 2. "Within 48 h of dayEnd(d)" is implemented as "the make-up's life day ≤ d + 2". "14 days old" is today ≥ d + 14. *Reason:* Sydney's DST switches (2026-10-04, 2027-04-04) make some life days 23 or 25 hours long; only key arithmetic agrees with the M5 judge's key-based lag.

4. **Settlement never runs in render.** It runs in after() on /today, /you and /today/week through one single-flight chain, settle first and judge second (maybeMaintainLife), and from a new daily cron /api/cron/life. *Reason:* about 816 ms per Supabase round trip; writes during render are forbidden; one chain guarantees the order.

5. **Settle before judge, for DUTY only.** BODY, CRAFT and CARE are judged on the normal Wednesday schedule, whatever settlement is doing. The DUTY WEEK row of a week whose Sunday ≥ DUTY_LAUNCH_DAY, and that week's full-day mints, are planned only once Sunday ≤ settledThroughDay. maybeJudgeWeeks's cheap check learns the gate: when the only track missing for the last judgeable week is DUTY and its Sunday > settledThroughDay, it returns without reading. When the cursor is more than DUTY_LAG_NOTICE_DAYS (3) behind todayKey − 2, settlement logs it and /today/rules shows 'Duty is settled through <day>'. *Reason:* WEEK rows are append-only and written per (track, week), and weeksToJudge already re-plans only the missing tracks, so only DUTY (whose occurrences settlement writes) has to wait. A stuck cron or a settlement bug must not stop the other three tracks or their MP. Trim order is unaffected: at most 2 Shorts a week, so 2 + 4 × 1.5 = 8 and a DUTY mint written after CRAFT and CARE is never trimmed (F17 asserts it). Normally Sunday settles Tuesday 04:00 and the judge runs Wednesday 04:00, so the gate costs nothing.

6. **Full-day MP is paid by the week judge, not by daily settlement.** Settlement writes only the FULL_DAY decision row ('fullday:<d>', sink NONE). planWeeks mints 'mp:LIFE_FULL_DAY:<d>' for each full day of the week after the kept tracks, in day order, in the same run as that week's DUTY WEEK row (so after the gate of decision 5), inside the same cap and the same life-mint-locked transaction. *Reason:* day d settles on d+2 but its week is judged on the following Wednesday. Daily mints would fill the cap before the kept tracks and invert the published trim order (Short goals, then kept tracks, then full days), which append-only rows could never undo. Copy changes from "+0.5 MP" to "up to +0.5 MP, paid when the week is judged (Wed)".

7. **One Full-day rule, live and settled.** The quest ring is met when the DAY_OPEN target was 0, or reviews on d ≥ min(15, DAY_OPEN qty); with no DAY_OPEN row for d it needs 15 reviews. The live "queue clear" (dueNow === 0) clause is dropped. The Life ring is ≥ 1 life deed (lifeDeedsOf: a live TASK whose template is not study-linked, #play included); the `workouts` input goes. Musts are mustsDueOn(templates, d): fixed occurrences and deadline one-offs due on d, done (DONE, DONE_LATE, DONE_MVV) or EXCUSED. *Reason:* "queue clear" and a live dueNow cannot be rebuilt at d+2; a ring that closes on the board and is then refused by settlement breaks honest numbers. WORKOUT is M4.

8. **Make-up status.** A make-up inside the restore window (life day ≤ d + 2) with the template's restore budget unspent (no other repaired instance in the last 7 days) writes DONE_LATE (or DONE_MVV for a minimum) with repaired = true: kept (or held). Any other make-up writes a new TEXT status MADE_UP, which habit.ts puts in BREAKS. Pricing goes through planCompletion with the new PlanInput.makeUp flag (timing MAKE_UP, streakDays forced to 0 so C = 1.00); makeUpCore maps the status itself. *Reason:* instanceOutcome counts every DONE_LATE as kept, so as built a Saturday make-up of a Monday miss would restore the per-duty streak, its C factor and the Duty week, against grading E ("make-up at 49 h → streak stays broken"). A new status keeps instanceOutcome's signature (statuses only, a frozen M5 contract). No migration: status is TEXT. timingOf returns ON_TIME for every recurring template and planCompletion picks the status itself, so the flag is the only way to price a make-up through the shared, client-identical pricer.

9. **A minimum make-up pays K 0.3 and T 0.85.** Golden: 'stretch 15m' minimum make-up = 10 × 0.833 × 0.3 × 0.85 = 2.1. *Reason:* the formula is multiplicative and published; a minimum done late is both a minimum and a make-up. Grading E's "make-up (T 0.85) or its MVV (K 0.3)" is read as "either, and both when both apply".

10. **Make-ups can be undone within 10 minutes, the same life day.** The undo appends 'undo:<taskRowId>' (the usual exact negation of the TASK row) and reverses the repayment with a negative DEBT_REPAID row {xp −debtXp, rawXp NULL, compositionKey 'debt', countsForStreak false, key 'unrepaid:<repaidRowId>'}, never with an UNDO row. The instance goes back to MISSED, debtOpen = true, repaired = false. Repayment keys carry an attempt: 'repaid:<tpl>:<d>:<slot>:<n>', n = the number of 'unrepaid:' rows on that slot. *Reason:* the redesign rule "Undo nets to zero"; a mis-tap on a 344 px screen must be recoverable; a single 'repaid:' key would block a second make-up for ever. Every UNDO row counts −1 streak unit (streak.ts's CASE and streakUnitsOf), is counted by freshnessGuardOp and is read as a raw row by the M5 judge; an UNDO reversing a repayment would take a second unit off the day and could turn it inactive.

11. **Debt rows have a fixed composition key and no rawXp.** DEBT, DEBT_REPAID (positive and negative): compositionKey 'debt', rawXp NULL, countsForStreak false. *Reason:* rawXp NULL keeps them out of the knee base, kneeRowsOf and the judge's raw reads. readLifeLedger groups by compositionKey and takes MAX(composition) through a LEFT JOIN on templateId, so the 'debt' group does borrow some template's composition; it is harmless only because the group always nets ≤ 0 and life-tracks.ts skips groups whose sum is ≤ 0. Any future positive bookkeeping row (a knee ADJUST, decision 33) must carry templateId NULL so its composition is null and skipped.

12. **Freezes.** Balance = count(FREEZE_EARN) − count(FREEZE_USE), max 2, starting at 0 (no starter freeze). Earn on a settled active day when ≥ 7 active days lie in (max(lastEarnDay, firstDutyDay − 1), d] and the balance is < 2, where firstDutyDay = max(DUTY_LAUNCH_DAY, epochDay). An automatic spend happens only on a no-activity day that it protects: d − 1 active or held (a live streak), or a non-excused compulsory occurrence due on d. A manual spend ('Use a freeze for Wed') is offered only for an unsettled yesterday with no activity (net streak units ≤ 0, the automatic spend's own rule) and spendFreezeCore refuses it otherwise; it excuses all of that day's musts, compulsoryOnRest included. Both spends take the life-complete lock and a balance guard. *Reason:* a freeze covers a no-activity day. On an active day it would do nothing for the streak and act purely as a skip-a-must token, which would weaken the fixed contract (compulsory miss = XP debt + streak hit). "No activity" must be the streak's own definition; spending the last freeze on a dead streak wastes it; pre-M2 activity must not buy freezes after the fact; a manual and an automatic spend can race at balance 1.

13. **Rest, sick and vacation.** REST is declared before its day starts, ≤ 2 per life week. SICK may be declared the same day, 1 per 14 days. VACATION runs 3 to 30 consecutive days from tomorrow, within a rolling budget of VACATION_DAYS_PER_365 = 30 days (non-cancelled VACATION days with day in [from − 364, to], the new ones included; cancelled days are refunded). Future days may be cancelled before they start (cancelledAt). Every write upserts by (userId, day) and sets kind, declaredAt = now and cancelledAt = null, so a reused row is judged by its new declaration time. Settlement ignores a REST or VACATION row declared at or after dayStartOf(day), and a SICK row declared at or after dayEndOf(day). Every reader (settlement, streak.ts and snapshot.ts, the M5 judge, the board) gets held days from one pure heldDaysOf(restRows, from, to) in duty-rule.ts. *Reason:* m2.md's rules, plus defence in depth against a retroactive row. Without a budget, 2 REST + a 3-day vacation every week would hold 5 days a week, make every week 'Held' and make the compulsory contract optional. Three readers with their own validity rules would disagree about the same day.

14. **Standing rest weekdays are deferred** (question 4). REST (≤ 2 a week, declared ahead, one tap from Close the day) covers the need. If the user wants them in M2, they come back as revision 1 specified (LifeSettings.restWeekdaysFrom DATE and restWeekdaysPrev INTEGER[] in the same additive migration, a change effective from the next Monday, the 2-per-week count including them), read only through heldDaysOf(restRows, settings, from, to). *Reason:* every reader must agree on a held day, and the history columns exist only to stop a retroactive escape; fewer moving parts for the first stakes.

15. **Held days hold everything, and settlement writes EXCUSED for every expected recurring template on a held day.** On a REST, SICK, VACATION or freeze day, settlement writes EXCUSED for each expected occurrence of every recurring TASK or HABIT template, compulsory or not, except compulsory templates with compulsoryOnRest (which are judged as usual on REST, SICK and VACATION days; freeze days excuse them too, since a freeze is a no-activity day). Until settlement has written those rows, the board's habit reads take the cursor: an occurrence on a day > settledThroughDay reads 'pending' (never 'missed'), and one on a day in heldDaysOf reads 'held'. *Reason:* non-compulsory habit streaks then hold through habit.ts. habit.ts marks any expected day older than RECORD_WINDOW_DAYS with no instance as missed, so without the cursor the first open of d + 2 (before after() or the 05:15 cron has settled d) would show a rest day as a broken streak, and the board would open on red. Meds stay owed on a rest day by design.

16. **The rule on a day.** A pure ruleOn(template, d) applies `prior` (a list of earlier rule segments, each valid through its throughDay) and `next` (a pending weakening, from its effective day), stored in the existing TaskTemplate.pendingChange JSON. A strengthening appends a prior segment with the old values through today − 1. Applying a weakening appends a prior segment with the old values through effectiveDay − 1 (for 'Not a must': {compulsory: true}). A segment is dropped once the DUTY WEEK row of the week containing its throughDay exists. The board, the settlement plan and the M5 judge all call ruleOn; the judge reads compulsory templates and every template with a pendingChange. *Reason:* there is no rule history; without this, a strengthening reaches unsettled yesterday (retroactive debt), a pending weakening is invisible to the judge, and a weakening that takes effect mid-week (say Thursday) would drop the template from that week's judgement, so its Monday–Wednesday misses would stop breaking the Duty week. A list, because an applied weakening and a later strengthening can both be live. No migration: pendingChange is Json.

17. **Akrasia horizon, scoped to the edits that exist.** M2 ships no general template editor. The weakening edits that exist or that M2 adds — archive of a compulsory template, the drawer's 'Not a must', turning 'Even on rest days' off, inbox drop/idea/anytime/tomorrow on a compulsory item — are deferred to today + 7 when isDutyLaunched(today) and the template is more than 60 minutes old. Strengthening ('Even on rest days' on, cancelling a pending change) is immediate from today. Adding a minimum version (MissPrompt) is immediate. Capture's own edit and undo (10 minutes) fall inside the 60-minute typo grace. Before launch every edit is immediate, so the user can clean up. *Reason:* m2.md names a non-existent editTemplate; the classifier stays generic and tested so a future editor gets it for free.

18. **A late compulsory deadline one-off.** It is kept (by settlement and by the M5 judge alike) when it is done by dueDay + 2, the restore window, whichever path recorded it:
   - Done before its due day is settled (completeInstanceCore, DONE_LATE, T 0.85, stored on its completion day): settlement charges nothing. The M5 judge reads one-off instances through Sunday + MAKEUP_RESTORE_DAYS and counts a DONE_LATE instance kept when its day ≤ dueDay + 2.
   - Not done when its due day settles: a MISSED instance on dueDay and a DEBT. From then on the board shows only its MakeUpCard (no late row), and completeInstanceCore refuses that template with 'Make it up from its card.'. A make-up by dueDay + 2 repairs the instance (decision 8); later it is MADE_UP.
   *Reason:* acting sooner must never cost more than missing and making up later, and the two paths must not both be open (a tick on the late row would pay T 0.85 and leave the debt open). A one-off due Sunday and ticked Monday is stored on Monday, outside the week the judge read.

19. **Study-linked musts.** Before charging, settlement re-derives the day's auto-completion from the ledger (REVIEW and IDEA_CREATE counts on d through planAutoCompletions). If it was met, settlement writes the same 0-XP sink-NONE TASK row and DONE instance the auto-completer would have (same dedupe key, so a late auto-completer P2002s harmlessly), with countsForStreak false (decision 32). REVIEW_DUE is met when DAY_OPEN qty is 0 or reviews on d ≥ DAY_OPEN qty; with no DAY_OPEN row it is missed. A study must can be made up by hand: it pays 0 (K 0) and repays the debt. *Reason:* an auto-complete that never ran must not become debt; "clear the queue" cannot be rebuilt beyond the day-open target.

20. **The M5 week judge learns held days and held weeks** (a compatible change to the frozen M5 contract). WeekJudgeState gains restDays (heldDaysOf over RestDay rows) beside heldDays (restDays plus FREEZE_USE days), fullDays, and a key on each mint row. Floors pro-rate by f = (7 − rest days)/7: days ceil(3 × f), raw 30 × f, BODY effort 150 × f, DUTY's fallback completions ceil(5 × f). A week is Kept when its pro-rated floors are met; otherwise it is Held when rest days ≥ 5, else Not kept. A Held week is written WEEK qty 0 with receipt {mark: 'held', restDays} (structural) and the display line 'Held · 5 rest days': it bridges keptStreak, adds no kept week and mints nothing. One helper weekMarkOf(row) in life-tracks.ts reads the mark for life-tracks, snapshot and the week page; no reader parses the detail line. Freeze days never pro-rate. *Reason:* m5-refit deferred pro-rating and the 'held' WeekMark to M2; without them a vacation week ends every kept streak. A met week must never be downgraded to Held. A BACKFILL_PREFIX can precede the detail line, so parsing it is fragile. Held weeks add no depth or MP, so the economy is not loosened.

21. **TARGET units.** TARGET outcomes count units, not just distinct days: kept = min(n, distinct kept days + kept make-up slots), held likewise, short = n − kept − held. One shared pure helper in habit.ts serves habit.ts, life-weeks.ts and the plan. Settlement writes one MISSED slot per unit short on the period's last day at slots after the highest existing one. Monthly targets are settled here only. *Reason:* both readers count distinct days today, so a fully made-up TARGET miss would still break the Duty week.

22. **Debt lowers Duty XP and levels, silently.** DEBT is TRACK DUTY XP dated d; DEBT_REPAID is dated on the repayment day. trackXp is max(0, Σ). Level-downs play nothing; a re-reached level never replays its Seal (its key is persisted). The weekly review shows 'of which −12.5 debt'. *Reason:* grading E's monotone ledger; honest numbers say why a level fell.

23. **The global daily streak is about showing up.** A missed must hits the per-duty streak, the C factor and the Duty kept week (the user's "streak hit"), not the global daily streak on a day with other activity. *Reason:* m2.md's reading; breaking the global streak would say "you didn't show up" when you did. Question 1 for the user.

24. **Record yesterday keeps M1's lane and Ask.** No auto-opening modal and no Did/Didn't toggles: an unticked row is "didn't" once the day settles. The existing Sheet gains a 'Use a freeze for Wed' switch (only when Wednesday has no activity, decision 12), a sticky 'Settle Wednesday now' footer, an honesty line, a `y` shortcut and a /today?sheet=yesterday deep link. *Reason:* the user asked for minimum friction; a modal on arrival covers the board; the lane is in BOARD_SECTIONS, board-check, today-ui-check, the tour and capture flows.

25. **Early settle locks the day.** After 'Settle yesterday' (or any settlement) a tick, record or undo for a settled day is refused, through a separate settled-day guard statement in the completion array and through undoCompletionCore. A day is settled by one rule, duty-economy.ts settledFor(day, cursor, floor) = cursor ≠ null ∧ day ≤ cursor ∧ (floor = null ∨ day ≥ floor), floor = firstDutyDay(epochDay); every settled-day check uses it (the tick, record and undo refusals, the guard SQL, spendFreezeCore, the board's yesterday lane). A day before firstDutyDay is never settled: the launch cursor (firstDutyDay − 1) locks nothing, so on the launch Monday the last pre-Duty Sunday can still be recorded, as under M1. The guard raises SQLSTATE 22003 (a smallint cast overflow), not 22012, so isStaleRead does not retry it; it maps straight to 'Wednesday is settled. Make it up from its card.'. *Reason:* otherwise tick-settle-undo erases debt, or settle-then-tick pays twice. Folding the clause into freshnessGuardOp would turn the race into three retries and the wrong message ('Another tick was being recorded at the same moment').

26. **Weekly review: Saturday to Wednesday.** reviewedWeek(today) (pure, life-day keys, so the boundary is 04:00): on Saturday and Sunday the week containing today; on Monday to Wednesday the previous week; on Thursday and Friday none. The runner and its Ask are offered while reviewedWeek(today) is not null and the week has no 'week-review:<YYYY-Www>' marker for it. Step 1 shows the last judged week and reviewedWeek's facts as far as they are settled, saying so ('settled through Fri'); it never shows a provisional verdict. The run ends on the week card (Tier 2 Seal) only when reviewedWeek is judged; otherwise on "The week of 5 Oct is judged Wednesday; its card will show on Today". *Reason:* M5 judges on Wednesday 04:00 (WEEK_JUDGE_LAG_DAYS 3) and m5-refit U10 made /today/week honest about it; a Monday verdict would be a made-up number. The weekend review covers the week being finished; Monday to Wednesday catches up on the one just ended.

27. **Owed in the shell.** The bell gets 'Owed: 2 · −12.5 XP' (tone warn: counted, the only counted Duty notice) and, only when yesterday has open musts, 'Yesterday: 2 musts open' (tone info: listed, never counted toward the badge). shell-types toneOf maps notice id 'owed' to the owed diamond (a compatible extension of the frozen contract). ShellData.owed.count feeds the Sidebar's existing "n owed" pill (≥ 1280 px). TabBar and Rail stay ink-only. NavTodayLink no longer exists, so its red dot is dropped. todayAsksOf never turns either notice into a Today Ask. *Reason:* the board never opens on red; the redesign keeps phone navigation ink-only; a daily badge for non-musts would repeat the Today Ask and become noise on the phone.

28. **The life cron does not retry AI sizing or purge HR buckets.** *Reason:* HR buckets are M4; sizing retries are unrelated to duty and a failed sizing already leaves an honest lexical grade. Either can be its own change later.

29. **The capture Must chip states the stake, approximately and only when it applies.** When dutyLive, '!' (or 'must') with a schedule reads 'Must · ≈ −4.2 if missed' (debtFor on the lexical grade); before launch with DUTY_LAUNCH_DAY set, 'Must · stakes from Mon 12 Oct'; otherwise the current chip. The capture grammar is unchanged. *Reason:* informed consent and honest numbers once misses cost something. AI sizing can move the band within 24 hours (SIZING_WINDOW_HOURS), so the figure is marked approximate; before launch a number would state stakes that do not apply yet.

30. **Before launch, an honest notice.** When DUTY_LAUNCH_DAY is set and still ahead, the Must lane header and /today/rules say "Musts carry stakes from Mon 12 Oct", and rest and vacation for days from the launch day can already be declared (decision 2). *Reason:* the user sees the contract before it binds and can un-flag musts while that is still immediate.

31. **Inbox items are never expected.** expectedOn(template, d) is false for a template with inbox = true, for settlement, the M5 judge (a change: it counts them today) and the board alike. Capture warns on a line with both '?' and '!': 'A must once you clarify it'. Clarifying it into a schedule is a strengthening: expected from the clarify day, never before. *Reason:* an unclarified item cannot be owed; planAutoCompletions already skips inbox items while the judge counts them, and one rule must serve all three readers.

32. **Rows written after the fact never count for the streak.** Every row settlement writes (the study-must TASK row, FULL_DAY, REPAIR, FREEZE_*, DEBT) carries countsForStreak = false. NEVER_STREAK_SOURCES gains DEBT_REPAID, DEBT_WRITTEN_OFF, FULL_DAY and REPAIR (REPAIR still holds through HELD_SOURCES). *Reason:* a rebuilt row counting for d at d + 2 would make a past day active after the fact and change freeze and repair decisions; the auto-completer passes countsForStreak = p.state.worked, which settlement must not copy.

33. **Deferred to a follow-up, not cut from the plan.** The rested ×1.10 bonus (a new receipt factor in frozen pricing; grading.md C marks it 'not yet in force'), knee reconcile (drift needs > 100 raw on one day plus an out-of-order undo; the knee is linear below that; KNEE_RECONCILE_TOLERANCE stays as a documented hook), velocity per category, 'stalled 14 days' goals (GoalCard.lastProgressDay), WelcomeBack, and standing rest weekdays unless question 4 says otherwise. *Reason:* none is needed for the compulsory contract, forgiveness or the rituals; each widens frozen files or adds a second TRACK writer, and balance-horizon models neither the rested bonus nor its interaction with pro-rated floors.

## Constants

Pure, in a new src/lib/duty-economy.ts unless noted.

Launch and gates:
- DUTY_LAUNCH_DAY: DayKey | null = null (set by the lead; a Monday ≥ deploy day and ≥ LIFE_LAUNCH_DAY).
- DUTY_LAUNCH_DAY_ENV = 'XTNL_DUTY_LAUNCH_DAY' (honoured outside production only).
- dutyLaunchDay(env?), isDutyLaunched(today) = launch != null && today ≥ launch. Writes on read reuse life-economy lifeWritesEnabled() (XTNL_LIFE_JUDGE=1 on the rehearsal server); no new env flag.
- firstDutyDay(epochDay) = max(DUTY_LAUNCH_DAY, epochDay).
- newLifeSettingsDays(today) → {epochDay: today, settledThroughDay: isDutyLaunched(today) ? today − 1 : null}. Every LifeSettings create uses it (decision 1).

Settlement:
- SETTLE_LAG_DAYS = 2: d is judgeable when d ≤ todayKey − 2.
- SETTLE_MAX_DAYS_PER_RUN = 14, oldest first; SETTLE_CHUNK_DAYS = 7 days per transaction.
- First judged day = firstDutyDay(epochDay). No earlier day is ever judged.
- DUTY_LAG_NOTICE_DAYS = 3: log and show 'Duty is settled through <day>' when cursor < todayKey − 2 − 3.

Debt (existing, life-grade.ts): DEBT_CAP 20, DEBT_OPEN_PER_TEMPLATE 3, DEBT_OPEN_TOTAL_CAP 100. New: debtFor(t) = min(20, round1(BAND_BASE[effBand(band, bandOverride)] × E(estEff(estMinutes, machineMinutes)))): no C, D, V, T, K or knee.
- Goldens: dishes (INTRO, 15 min) 4.2; 'stretch 15m' (STANDARD, 15) 8.3; SEVERE 240 min 20 (48.6 uncapped: 35 × (0.5 + 240/270) = 48.61, capped at 20).

Make-up (existing in life-grade.ts): TIMING_FACTOR.MAKE_UP 0.85, PAY_MODE MVV 0.3. New:
- MAKEUP_RESTORE_DAYS = 2: restored iff makeUpDay ≤ d + 2.
- MAKEUP_RESTORE_EVERY_DAYS = 7: at most one repaired instance per template in (makeUpDay − 7, makeUpDay].
- Make-ups price with C = 1.00 (PlanInput.makeUp forces streakDays 0).
- Goldens: dishes make-up 5 × 0.833 × 0.85 = 3.5; its ledger nets −4.2 + 4.2 + 3.5 = +3.5 = 0.85 × P'. 'stretch 15m' minimum make-up 2.1. A make-up then its undo nets 0 XP and 0 streak units on the make-up day.
- WRITE_OFF_MIN_DAYS = 14 (today ≥ d + 14, only with LifeSettings.debtWriteOff on).
- A make-up's undo window is the tick's existing one: 10 minutes, the same life day.
- MISS_PROMPT_RUN = 3 consecutive misses.

Freezes and repair:
- FREEZE_MAX = 2; FREEZE_EARN_ACTIVE_DAYS = 7; starting balance 0.
- REPAIR_EVERY_DAYS = 7: no REPAIR row with day in (d − 8, d − 1).

Rest:
- REST_PER_WEEK = 2.
- SICK_EVERY_DAYS = 14 (1 per rolling 14 life days).
- VACATION_MIN_DAYS = 3, VACATION_MAX_DAYS = 30, starting tomorrow at the earliest; VACATION_DAYS_PER_365 = 30 (rolling, cancelled days refunded; question 3).

Knee reconcile: deferred (decision 33). KNEE_RECONCILE_TOLERANCE 0.05 stays in life-grade.ts, unused. Whoever builds it later: Σpaid filters source IN ('TASK', 'UNDO') AND rawXp IS NOT NULL (plus knee ADJUST); the ADJUST row carries templateId NULL and countsForStreak false.

Full day:
- FULL_DAY_MP = LIFE_MP.FULL_DAY = 0.5 (exists), minted by the week judge after kept tracks, in the DUTY run (decision 6).
- QUEST_CAP = REVIEW_QUEST_CARDS = 15 (exists).
- Perfect week, no Shorts: tracks 6.0 + 4 full days × 0.5 = 8.0; full days 5–7 write qty-0 decision rows 'trimmed by the weekly cap'. With 2 Shorts: 2 + 6 = 8, so every full day is trimmed.

Akrasia horizon:
- AKRASIA_DAYS = 7: effectiveDay = todayKey + 7; pendingChangeAt = dayStartOf(effectiveDay).
- TYPO_GRACE_MIN = 60 (since TaskTemplate.createdAt).

Held weeks (life-economy.ts, judged by life-weeks.ts):
- floor factor f = (7 − restDays)/7; DUTY fallback completions ceil(5 × f).
- HELD_WEEK_REST_DAYS = 5 (only when the pro-rated floors are not met).
- WEEK receipt mark 'held'; HELD_PREFIX = 'Held · ' is display only.

Weekly review: reviewedWeek(today) (decision 26), in src/lib/rituals.ts.

Cron: /api/cron/life at '15 18 * * *' UTC = 04:15 AEST / 05:15 AEDT (DST began 2026-10-04); after 04:00 either way.

Statuses (TaskInstance.status, TEXT): adds MADE_UP (debt cleared, occurrence still missed). habit.ts: KEEPS DONE, DONE_LATE; HOLDS DONE_MVV, SKIPPED, EXCUSED; BREAKS MISSED, WRITTEN_OFF, MADE_UP.

Dedupe keys (ActivityEvent):
- 'debt:<tpl>:<d>:<slot>'
- 'repaid:<tpl>:<d>:<slot>:<n>' (n = 'unrepaid:' rows on that slot)
- 'unrepaid:<repaidRowId>' (a negative DEBT_REPAID, the make-up undo's reversal of a repayment)
- 'undo:<taskRowId>' (TASK rows only, as today)
- 'writeoff:<tpl>:<d>:<slot>'
- 'freeze-earn:<d>', 'freeze-use:<d>' (one key for manual and automatic spends)
- 'repair:<d−1>' (dated d − 1)
- 'fullday:<d>'
- 'mp:LIFE_FULL_DAY:<d>' (qty 0 allowed)
- 'reflection:<d>:<nonce>' (a later save supersedes; append-only)
- 'week-review:<YYYY-Www>' (YYYY-Www = reviewedWeek(today); source REFLECTION, detail 'week review')
- 'task:<tpl>:<d>:<slot>:<attempt>' (existing; a make-up's TASK row keeps the instance's d in its key through taskEventInput's new keyDay while the row is dated today)

## Migration

prisma/migrations/20261021000000_life_duty/migration.sql. It sorts after every existing migration (the last is 20261020000000_answer_case_sensitive; m2.md's 20261019000000 would sort before an applied one). Additive only; pre-approved once local tests pass.

```sql
-- life_duty (M2): declared rest, sick and vacation days.
CREATE TABLE "public"."RestDay" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "declaredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    CONSTRAINT "RestDay_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RestDay_userId_day_key" ON "public"."RestDay"("userId", "day");
```

Only if question 4 is answered "in M2", the same file also carries:

```sql
ALTER TABLE "public"."LifeSettings"
    ADD COLUMN "restWeekdaysFrom" DATE,
    ADD COLUMN "restWeekdaysPrev" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
```

schema.prisma:
- model RestDay exactly as data-model.md MIGRATION 2 (kind REST | SICK | VACATION; @@unique([userId, day]), which also serves as the userId index; @@schema("public")).
- TaskInstance.status comment adds MADE_UP (no SQL).
- (Question 4 only) LifeSettings gains `restWeekdaysFrom DateTime? @db.Date` and `restWeekdaysPrev Int[] @default([])`.

Nothing else is needed. Every other M2 column shipped in life_core and is on Supabase (settledThroughDay, debtWriteOff, compulsoryOnRest, mvv/mvvMinutes, pendingChange/pendingChangeAt, debtXp, debtOpen, repaired, judgedAt, @@index(userId, debtOpen)). ActivitySource values are TS-only. The launch day is a code constant.

Procedure: data-model.md PROCEDURE (diff, trim to these statements, rehearse on xtnl-rehearsal, ref check, `prisma db execute`, `migrate resolve --applied 20261021000000_life_duty`, `prisma generate`). The lead only. The code that reads RestDay deploys after the migration is applied.

## Reused as is (do not rebuild)

- Ledger: ActivitySources DEBT, DEBT_REPAID, DEBT_WRITTEN_OFF, FREEZE_EARN, FREEZE_USE, REPAIR, FULL_DAY, REFLECTION and their default sinks (activity.ts activityOp); HELD_SOURCES (streak-curve.ts); computeStreak's bridging of held days; foldStreakDays. (NEVER_STREAK_SOURCES gains four sources, decision 32.)
- Price: life-grade.ts priceTask, TIMING_FACTOR.MAKE_UP, timingFor({makeUp}), PAY_MODE MVV, RECORD_WINDOW_DAYS, the debt caps; today-board.ts planCompletion (plus the makeUp flag), planAutoCompletions, yesterdayRecordable, ruleOf; recurrence.ts occurrencesBetween and periodOf.
- Concurrency: tasks.ts lifeLockOp ('life-complete:<user>') and freshnessGuardOp (22012 → retry); life-tracks-server.ts lifeMintLockOp and isStaleGuard; mastery.ts mintLifeMasteryOps (qty-0 decision rows); today-board.ts withMoments (the make-up action only).
- M5: life-weeks.ts planWeeks, lastJudgeableSunday, weeksToJudge (per-track `missing`), dutyOccurrences; life-weeks-server.ts judgeClosedWeeks and its launch marker; life-economy.ts cappedMp, CAPPED_REASONS (already lists LIFE_FULL_DAY), lifeWritesEnabled; habit.ts instanceOutcome, perDutyStreak.
- UI (presentational, M2-ready): components/today/m2/MakeUpCard.tsx (MakeUpCard, OwedSummary, OwedRow), Sheets.tsx (RecordYesterdaySheet footer and freeze switch, RestControls), Notices.tsx (YesterdaySettled), WeekRunner.tsx (runner, WeekTrack, WeekCard); today.css (.makeup, .owed-sum, .owed-stack, .today-notice, .wr-*, .y-row, .moods, .today-opt-card; free slot .o8); CloseDaySheet's `reflection` prop and 'Rest tomorrow' switch; DayLedger's `freezes`, `settles` and `broken` props; settings/DaysControls.tsx (AcceptLossRow). WelcomeBack and RestWeekdaysPicker stay unused (decision 33).
- Celebration kinds (no new kind, no contract change): makeup-paid (T0) and nothing-owed (T1) from the make-up action's result; day-repaired and yesterday-settled (T1) rendered in place from read-derived notices (F12); full-day (T1); week-kept (T2).
- Shell: ShellData.owed and the Sidebar's owed pill; the bell feed (notifications.ts buildFeed); the shortcut registry and its BROWSER_RESERVED check.

## F1. Contract (lane 0, first)

**Spec.** The lead writes these before any lane starts.

- prisma/schema.prisma and the life_duty migration (above).
- NEW src/lib/duty-economy.ts (pure; imports only types and life-day helpers): every constant above that is not in life-grade.ts or life-economy.ts; dutyLaunchDay(env?), isDutyLaunched(today), firstDutyDay(epochDay), newLifeSettingsDays(today); the dedupe-key builders (debtKey, repaidKey, unrepaidKey, writeOffKey, freezeEarnKey, freezeUseKey, repairKey, fullDayKey, fullDayMintKey, reflectionKey, weekReviewKey).
- src/lib/life-types.ts: InstanceStatus += 'MADE_UP'.
- src/lib/life-grade.ts: debtFor(t). Nothing else (no rested factor).
- src/lib/today-board.ts, contract lines only (lane D owns the rest of the file):
  - DONE_STATUSES += 'MADE_UP';
  - PlanInput gains `makeUp?: boolean`: planCompletion then uses timing MAKE_UP (timingFor({makeUp: true})) and streakDays 0; status and source stay planCompletion's, and the make-up caller maps them;
  - taskEventInput's `at` gains `keyDay?: DayKey`: the dedupe key uses keyDay ?? day, while `day` stays the row's date;
  - BoardTemplate gains `pendingChange: PendingChange | null` (type only; lane D fills it).
- src/lib/streak-curve.ts, one line: NEVER_STREAK_SOURCES += DEBT_REPAID, DEBT_WRITTEN_OFF, FULL_DAY, REPAIR (decision 32).
- src/lib/tasks.ts, two lines: TodayCounts gains `yesterdayMusts: number` (lane C fills it; 0 until then); both LifeSettings creates (the capture path and setDailyCapacityCore) spread newLifeSettingsDays(today).
- src/lib/habit.ts (frozen M5 contract, lead only): BREAKS += MADE_UP; export targetUnits(rule, period, instances, heldDays) → {kept, held, short}, counting make-up slots as units (decision 21); perDutyStreak and periodsOf use it; the habit reads take an optional `{settledThroughDay, heldDays}` so an unsettled day reads pending and a held day reads held (decision 15).
- NEW src/lib/duty-rule.ts (pure, complete): the PendingChange JSON (v1: `next?: {effectiveDay, compulsory?: false, compulsoryOnRest?: false, archive?: true}`, `prior?: Array<{throughDay, compulsory?, compulsoryOnRest?}>` ordered by throughDay), parsePendingChange, ruleOn(template, d) → {compulsory, compulsoryOnRest, archivedDay, recurrence}, applyNext(template) (the columns and the prior segment written when `next` takes effect), classifyChange(before, after, {createdAt, now, launched}) → 'immediate' | 'deferred', expectedOn(template, d) (no launch floor; false for inbox templates, decision 31), mustsDueOn(templates, d), heldDaysOf(restRows, from, to) (decision 13; a `settings` parameter joins it only under question 4).
- Type shells, so lanes compile in parallel:
  - src/lib/settlement-plan.ts: SettlementState, SettlementOp (instanceCreate, instanceUpdate, event, templateHousekeeping, cursor), DayPlan, planSettlement(state) returning [].
  - src/lib/settlement.ts: settleLifeDays(userId, now, {through?, early?, dryRun?, force?}) and maybeMaintainLife(userId, now) as no-ops.
  - NEW src/lib/duty-view.ts: OwedCard, RestState, FreezeState, DutyBoard, SettledNotice (the board-facing types) and pure helper signatures (owedViewOf, makeUpCopy, restBannerOf, settledNoticeOf).
  - NEW src/lib/duty-plan.ts: MakeUpPlan, planMakeUp, planUndoMakeUp, makeUpStatusOf signatures (lane C implements them).
  - src/app/actions/duty.ts and src/app/actions/rituals.ts: exported action signatures returning "not yet".
- package.json: settle:check, duty:check, duty-actions:check and rituals:check scripts; the lead appends them to life:check at integration.

**Files.** prisma/schema.prisma; prisma/migrations/20261021000000_life_duty/migration.sql; new src/lib/duty-economy.ts, src/lib/duty-rule.ts, src/lib/duty-view.ts (types), src/lib/duty-plan.ts (shell), src/lib/settlement-plan.ts (shell), src/lib/settlement.ts (shell), src/app/actions/duty.ts (shell), src/app/actions/rituals.ts (shell); src/lib/life-types.ts; src/lib/life-grade.ts; src/lib/habit.ts; src/lib/today-board.ts (contract lines); src/lib/streak-curve.ts (one line); src/lib/tasks.ts (two lines); package.json; scripts/duty-check.ts.

**Tests.** New scripts/duty-check.ts (lane 0 owns the whole file; pure):
- §1 debtFor goldens 4.2 / 8.3 / 20. planCompletion({makeUp: true}) goldens: dishes 3.5 with C = 1.00 whatever streakDays; 'stretch 15m' minimum 2.1. taskEventInput with keyDay: key 'task:<tpl>:<d>:…', row dated today.
- ruleOn: a pending archive is invisible before effectiveDay and archives from it; a prior segment reaches no day after its throughDay; two segments (an applied un-flag, then a re-flag) each govern their own days; applyNext writes the prior segment {throughDay: effectiveDay − 1, compulsory: true}.
- classifyChange: un-flag at 59 min immediate, at 61 min deferred; before launch always immediate; 'Even on rest days' on immediate, off deferred.
- expectedOn: an inbox template is never expected; no launch floor (a day before DUTY_LAUNCH_DAY is expected if the rule says so).
- heldDaysOf: a REST declared after its day started is ignored; a cancelled row is ignored; a row cancelled then re-declared after the day started is ignored (its declaredAt is the new one); a SICK declared during its day counts.
- instanceOutcome(['MADE_UP']) = 'missed'; targetUnits counts two made-up Sunday slots as two units; habit reads with the cursor: a day > settledThroughDay reads pending, a held day reads held.
- NEVER_STREAK_SOURCES contains DEBT_REPAID, DEBT_WRITTEN_OFF, FULL_DAY and REPAIR; countsForStreakOf('REPAIR', true) is false.
- newLifeSettingsDays: null cursor before launch, epochDay − 1 after.
- §2 dutyLaunchDay ignores the env in production; the launch validator (pure) reports a non-Monday, a day before LIFE_LAUNCH_DAY, or a DUTY_LAUNCH_DAY before the deploy-day argument as invalid (F20: the launch day is on or after the production deploy).
- The existing life:check chain passes unchanged.

## F2. Launch gate and the M2 UI switch

**Spec.**
- dutyLive(today) = isDutyLaunched(today). Before it, Today, the shell, /today/week, /today/rules and the tour render the current pre-M2 UI: no freeze switch, no Settle button, DayLedger settles=false, the old rules copy.
- When DUTY_LAUNCH_DAY is set and ahead: a quiet held-toned chip on the Must lane header and a line on /today/rules, "Musts carry stakes from Mon 12 Oct" (decision 30). RestControls offer days ≥ DUTY_LAUNCH_DAY (decision 2).
- Open debt rows (debtOpen) render whenever they exist, launched or not, and their actions work (decision 2).
- spendFreeze and early settle refuse before launch ("Duty starts Mon 12 Oct"). Rest actions before DUTY_LAUNCH_DAY is set, or for a day before it, refuse the same way.
- Settlement and the judge's DUTY gate follow decisions 2 and 5.

**Files.** src/lib/duty-economy.ts (F1); consumers in later features.

**Tests.** duty-check §2 (F1). duty-actions-check: the pre-launch gate per action (rest for the launch Monday allowed a week ahead; rest for a pre-launch day refused; freeze refused; make-up allowed when a debtOpen instance exists).

## F3. Akrasia horizon and the drawer toggles

**Spec.** Server (lane C): every weakening goes through duty-rule.ts classifyChange.
- archiveTask / archiveCore on a compulsory template: deferred → pendingChange.next {archive, effectiveDay}; archivedAt is NOT set early. Non-compulsory archives keep the immediate archive with its 10 s undo.
- clarifyInbox 'drop' / 'idea' / 'anytime' / 'tomorrow' on a compulsory item: the same classifier ('tomorrow' on a deadline one-off already hits moveBlockOf; keep it). Clarifying an inbox must into a schedule is immediate from today (decision 31).
- New setCompulsory(templateId, false) (drawer pill 'Not a must'): deferred.
- New setCompulsoryOnRest(templateId, on) (drawer pill 'Even on rest days', compulsory rows only): on is immediate from today, appending the prior segment {throughDay: today − 1, compulsoryOnRest: false}; off is deferred.
- New cancelPendingChange(templateId): immediate (a strengthening).
- One pending `next` per template: a second weakening while one pends is refused with 'A change is already pending (Thu 8 Oct). Keep it or cancel it.'
- Settlement step 11 (lane A) is bookkeeping: after settling effectiveDay − 1 it writes applyNext's columns (compulsory, compulsoryOnRest, archivedAt = dayStartOf(effectiveDay)) and prior segment, and clears `next`; it drops a prior segment once the DUTY WEEK row of the week containing its throughDay exists (decision 16).
- The weakening kinds 'fewer days / longer EVERY / lower TARGET / later deadline' get no UI (no editor exists); the classifier covers them for a future editor.

UI (lane D, against lane C's action signatures from lane 0): the row stays with meta 'must · ends Thu 8 Oct'; the drawer shows 'Pending: archived on Thu 8 Oct · [Keep it]' and the two pills; the board treats a template whose next.archive has effectiveDay ≤ today as archived (through ruleOn), so it leaves Today on its effective day even though the column is written two days later.

**Files.** Lane C: src/lib/tasks.ts (archiveCore, clarify paths, setCompulsoryCore, setCompulsoryOnRestCore, cancelPendingChangeCore); src/app/actions/tasks.ts. Lane D: src/components/today/TaskDrawer.tsx, TaskRow.tsx; src/lib/today-board.ts (BoardTemplate.pendingChange filled, ruleOn in expectations). Lane A: settlement-plan.ts step 11.

**Tests.**
- settle-check (A): an un-flag on day 0 still judges days 1–6 as compulsory and stops at day 7; 'Even on rest days' turned on today does not make yesterday's (rest-day) must owed; a pending archive yields no occurrence from its effective day; applying `next` writes the prior segment and a later run drops it only once the DUTY WEEK row exists.
- character-check (B): an un-flag that takes effect on a Thursday: the Monday–Wednesday misses still break that Duty week; a pending archive's template counts no occurrence from its effective day.
- board-check (D): the pending meta line; a pending archive leaves the board on its effective day. today-ui-check (D): a compulsory archive keeps the row.
- duty-actions-check (C): the second-weakening refusal; un-flag before launch is immediate.

## F4. Settlement plan (pure)

**Spec.** src/lib/settlement-plan.ts planSettlement(state) → DayPlan[] for days settledThroughDay < d ≤ min(through, todayKey − 2), at most 14, oldest first. Pure, client-importable, no clock: `today` is in the state. Days are planned sequentially; each day's plan feeds the next (freeze balance, open-debt counts, repair window).

SettlementState (one fresh read): today, dutyLaunchDay, epochDay, cursor; templates (every recurring TASK/HABIT template and every compulsory one-off, archived included, with pendingChange, startDay, dueDay, archivedAt, createdAt, inbox, band fields, estimate, mvv, autoMetric/autoTarget, track); instances in the range plus the open TARGET periods, plus every done instance (any day ≤ today) of a compulsory deadline one-off due in the range; per-day ledger facts for [from − 8, to] (streak units, TASK/UNDO rows with xp, rawXp, track, templateId, receipt; REVIEW and IDEA_CREATE counts; DAY_OPEN qty; FREEZE_*, REPAIR, FULL_DAY rows); the all-history freeze counts and last earn day; open debts (debtOpen instances: templateId, debtXp); RestDay rows for [from − 1, to]; the DUTY WEEK row keys for weeks holding a prior segment's throughDay.

Per day d (first judged day = max(cursor + 1, firstDutyDay(epochDay))):
1. **Expected occurrences.** expectedOn(ruleOn(template, d), d) for every template, on days ≥ max(startDay, firstDutyDay(epochDay)) and before the archived day. The launch floor lives here, not in expectedOn.
2. **Held day.** d is held if d ∈ heldDaysOf(restRows, d, d). Every expected recurring occurrence with no done instance → EXCUSED, except compulsoryOnRest musts. A compulsory deadline one-off due on a held day → EXCUSED for d (no debt; it stays open and late on the board).
3. **Freeze.** If d has no activity (net streak units ≤ 0, foldStreakDays), is not already held, the balance (EARN − USE with day < d, plus any manual use dated d) ≥ 1, and the spend protects something (decision 12) → FREEZE_USE 'freeze-use:<d>' (sink NONE) and every remaining expected occurrence → EXCUSED, compulsoryOnRest included. A manual FREEZE_USE already dated d excuses the same way.
4. **Study musts.** For each study-linked compulsory occurrence with no instance, rebuild its auto-completion (decision 19), countsForStreak false.
5. **Misses.** Each remaining compulsory occurrence with no done instance: if it is a deadline one-off with a done instance on any day ≥ dueDay (decision 18) → nothing. Otherwise create instance slot 0 (or move an UNDONE slot 0) to MISSED with judgedAt = now and, within the caps (open per template ≤ 3, total ≤ 100, applied cumulatively in templateId, day, slot order), debtXp = debtFor(t), debtOpen = true, plus DEBT {sink TRACK, track DUTY, xp −debt, rawXp NULL, compositionKey 'debt', countsForStreak false, day d, templateId, sourceId = instance, key 'debt:<tpl>:<d>:<slot>'}. A capped miss is MISSED with debtXp 0 and detail 'debt capped'.
6. **TARGET period close.** If d ends a compulsory TARGET period that started on or after max(startDay, firstDutyDay): short = targetUnits(...).short; one MISSED slot (with debt, within the caps) per unit short, on d, at slots after the highest existing slot, keys 'debt:<tpl>:<d>:<slot>'.
7. **Freeze earn.** d active, ≥ 7 active days in (max(lastEarnDay, firstDutyDay − 1), d], balance < 2 → FREEZE_EARN 'freeze-earn:<d>' (sink NONE).
8. **Full day.** fullDayOf over d's settled facts (decision 7) → FULL_DAY {sink NONE, qty 1, countsForStreak false, detail = the rings' line, key 'fullday:<d>'} only when full.
9. **Repair.** d is a Full day, d − 1 is neither active nor held, d − 2 is active or held, d − 1 ≥ firstDutyDay, and no REPAIR row lies in (d − 8, d − 1) → REPAIR dated d − 1, countsForStreak false, key 'repair:<d−1>'. It is already a HELD_SOURCE, so streak.ts bridges it unchanged.
10. (Knee reconcile: deferred, decision 33. The step number is kept free.)
11. **Pending changes.** Housekeeping as in F3.
12. **Cursor** → d.

Every event planned here carries countsForStreak = false (decision 32).

The ops for a chunk (≤ 7 days) are grouped for statement count: instance creates (createMany), instance updates (one UPDATE … FROM (VALUES …)), events (createMany), template housekeeping (one UPDATE … FROM (VALUES …)), cursor.

**Files.** src/lib/settlement-plan.ts.

**Tests.** New scripts/settle-check.ts (lane A owns it; pure, injected clock, 50+ scenarios). m2.md's list minus FULL_DAY via WORKOUT, plus:
- a miss creates exactly 1 DEBT; a second plan over the result makes 0 ops; before d + 2 makes 0 ops;
- the first plan after launch judges nothing before firstDutyDay; no freeze earn, repair or full day is planned for a pre-launch day;
- reset after launch, then the first capture (cursor = epochDay − 1 from newLifeSettingsDays): settlement starts at the epoch;
- a 4th open miss on one template is 'debt capped'; total open debt above 100 is capped in templateId order;
- no-activity day with a freeze → FREEZE_USE and EXCUSED; without → debt; a dead streak with no musts due keeps its freeze;
- freeze earned on the 7th active day, max 2; pre-launch active days earn nothing;
- compulsoryOnRest is owed on a rest day and excused on a freeze day;
- a rest row declared after the day started is ignored;
- TARGET:3/W compulsory with 1 done → 2 MISSED slots; with 1 done and 1 rest day → 1;
- a study must met by reviews writes the auto row (countsForStreak false), not debt; REVIEW_DUE without DAY_OPEN is missed;
- a late deadline one-off done on d + 1 owes nothing; done on d + 3 before settlement ran owes nothing (and the judge will not count it kept);
- an inbox must is never owed;
- a day with a make-up, its undo and one other tick: the make-up day stays active, the debt is open, nothing extra is planned;
- every planned event has countsForStreak false;
- FULL_DAY: quest met by DAY_OPEN 0, by min(15, qty) reviews, refused with no DAY_OPEN and 14 reviews; a weigh-in alone is not a life deed;
- REPAIR rule, second repair inside 7 days refused, no repair of a pre-launch break;
- a pending change applies at +7 days, not before;
- day keys across the 2026-10-04 and 2027-04-04 DST switches.

## F5. Settlement executor, the maintenance chain and the life cron

**Spec.** src/lib/settlement.ts.

settleLifeDays(userId, now, opts):
- Writes only when isDutyLaunched(today), the cursor is not null, and (lifeWritesEnabled() || opts.force). dryRun returns the plans and writes nothing.
- Read 1: LifeSettings (cursor, epochDay). Read 2: one Promise.all of everything in SettlementState. Two round trips.
- Per chunk, one $transaction array (no interactive transactions):
  1. lifeLockOp (life-complete). Settlement never mints, so it never takes life-mint; no lock nesting with goal closes or the judge.
  2. One guard statement (22012 → re-read and replan, up to 3 tries): settledThroughDay IS NOT DISTINCT FROM chunkStart − 1; the FREEZE_* row count equals what was read; for an early settle, yesterday's TASK/UNDO row count equals what was read (freshnessGuardOp's count).
  3. taskInstance.createMany (no skipDuplicates, so a conflict rolls back), the instance UPDATE … FROM (VALUES), activityEvent.createMany, the template UPDATE, lifeSettings.update of the cursor.
  About 4–8 statements per chunk (≈ 3–7 s); a quiet chunk is 3. P2002 or the guard means another run won: re-read.
- No withMoments: settlement runs where nobody watches and can raise no level (its only TRACK rows are negative DEBT rows and 0-XP rebuilds). What it did is shown on read (F12).
- After commit: invalidate('life', 'activity', 'progress'). When the cursor ends more than DUTY_LAG_NOTICE_DAYS behind, console.warn.
- Early settle (opts.early, through = yesterday): first settles any backlog, then yesterday, with the same plan function; refused before launch. The 04:15 cron then finds the cursor past it and writes nothing.

maybeMaintainLife(userId, now): the after() entry for /today, /you and /today/week, replacing their maybeJudgeWeeks calls. Single flight per user. Settles when the cursor is behind (cheap check on cached LifeSettings), then calls maybeJudgeWeeks. Never throws.

NEW src/app/api/cron/life/route.ts (GET): refuses with 401 unless CRON_SECRET is set and the Authorization header matches (it never skips the check). For the single user: settleLifeDays, then judgeClosedWeeks. No maxDuration (Fluid's 300 s default covers a 14-day catch-up). vercel.json adds { "path": "/api/cron/life", "schedule": "15 18 * * *" } beside degrade. On a Hobby plan the cron may fire anywhere in its hour; day keys are computed at run time, so it stays correct.

**Files.** src/lib/settlement.ts; new src/app/api/cron/life/route.ts; vercel.json.

**Tests.** settle-check §executor (fixture ops, no database): chunk grouping and statement count; a duplicate run is a no-op even on a day with no keyed rows (cursor guard); with an injected env {NODE_ENV: 'development'} and no XTNL_LIFE_JUDGE, settleLifeDays and maybeMaintainLife plan but issue no write (the prisma client is a recording stub); the cron GET with no CRON_SECRET, and with a wrong header, returns 401 (route handler called directly with an injected env). duty-rehearse (F20, lead): two concurrent settles leave one row per key; settling twice writes 0 rows.

## F6. Debt actions: make up, do the minimum, undo, accept the loss, add a minimum

**Spec.** Pure planning in src/lib/duty-plan.ts, cores in new src/lib/duty.ts, actions in src/app/actions/duty.ts (all lane C). Every core reads fresh (never from cache), takes lifeLockOp, and guards.

makeUpCore(userId, instanceId, {minimum, minutes?}, now):
- The instance must be MISSED with debtOpen = true (archived templates included: queried by debtOpen, never through the board's live template list).
- planMakeUp prices through planCompletion({makeUp: true, mvv: minimum, day: today, …}): timing MAKE_UP, C = 1.00, K 0.3 when minimum (needs t.mvv), D and V from today's ledger; K 0 for study-linked. makeUpStatusOf(d, today, repairedInLast7) gives DONE_LATE / DONE_MVV with repaired = true inside the window and budget (decision 8), else MADE_UP. Source 'make-up'.
- One array: lifeLockOp; freshnessGuardOp(today) extended with "instance still MISSED and debtOpen"; the TASK row via taskEventInput({day: today, keyDay: d, slot, attempt}) (sink and track by template, rawXp, receipt with 'make-up' and the restored flag, countsForStreak true: it is today's activity); DEBT_REPAID {dated today, xp +debtXp, rawXp NULL, compositionKey 'debt', countsForStreak false, key 'repaid:<tpl>:<d>:<slot>:<n>'}; the instance update (status, repaired, debtOpen = false, source, xpPaid, completedAt); a one-off's template completedAt.
- Returns the receipt, the restored flag and whether this cleared the last debt (for makeup-paid and nothing-owed, played in place by the client).

undoMakeUpCore: within 10 minutes and the same life day: 'undo:<taskRowId>' (the usual UNDO) and the negative DEBT_REPAID 'unrepaid:<repaidRowId>' (decision 10); the instance back to MISSED, debtOpen = true, repaired = false, xpPaid 0; a one-off's completedAt back to null.

A debited one-off (decision 18): completeInstanceCore and recordYesterday refuse a template that has a debtOpen instance ('Make it up from its card.'); the board shows only its MakeUpCard.

acceptLossCore: only with LifeSettings.debtWriteOff on and today ≥ d + 14 → WRITTEN_OFF, debtOpen = false, DEBT_WRITTEN_OFF {sink NONE, qty = debtXp, countsForStreak false, key 'writeoff:<tpl>:<d>:<slot>'}. The DEBT row stays. For a one-off it also sets archivedAt = now (it has no further occurrence, so this is not a weakening and skips the classifier), so it leaves the board.

setMinimumCore(templateId, text, minutes?): sets mvv/mvvMinutes only when none exists; immediate (decision 17).

The miss prompt (MISS_PROMPT_RUN 3 consecutive missed occurrences of one template): [Add a minimum version] (inline one-line input → setMinimum), [Stop it being a must · from Thu 8 Oct] (setCompulsory false, deferred) and a quiet [Not now], which hides the prompt for that template until its next miss (per device: localStorage key by template and latest missed day, every access in try/catch). At most one prompt on the board.

**Files.** new src/lib/duty-plan.ts, src/lib/duty.ts; src/app/actions/duty.ts (makeUp, doMinimum, undoMakeUp, acceptLoss, setMinimum); src/lib/tasks.ts (the debited one-off refusal).

**Tests.**
- duty-actions-check (C, pure over duty-plan.ts): make-up on d + 2 → DEBT_REPAID equals the debt, TASK at 0.85 dated today with the key on d, DONE_LATE repaired; on d + 3 → MADE_UP; a second restore inside 7 days for one template → MADE_UP; minimum make-up repays in full and pays 2.1 on the golden; planUndoMakeUp writes 'undo:<task>' and 'unrepaid:<repaid>' (source DEBT_REPAID, never UNDO), and the next repaid key is ':1'; ledger invariant: on time +P; missed then made up +0.85·P'; missed −debt; made up then undone −debt.
- streak-check (B): make-up, its undo and one other tick on the same day: the day stays active.
- character-check (B): a late make-up (MADE_UP) breaks the Duty week, a repaired one keeps it.
- duty-rehearse (lead): the make-up, undo and second make-up on the database; acceptLoss refused when the setting is off or the debt is 13 days old; a tick on a debited one-off refused.

## F7. Completion seams in tasks.ts

**Spec.**
- A separate settled-day guard statement in the completion array, after the lock: `SELECT (CASE WHEN EXISTS (SELECT 1 FROM "LifeSettings" WHERE "userId" = … AND "settledThroughDay" >= day [AND day >= GREATEST(launch, "epochDay"), when a launch day is set]) THEN 40000 ELSE 1 END)::smallint`, which raises 22003 (settledFor in SQL, decision 25). isSettledDay(err) maps it to 'Wednesday is settled. Make it up from its card.' without a retry; isStaleRead keeps 22012 only. completeInstanceCore and recordYesterday also refuse a settled day up front from their read.
- undoCompletionCore refuses an instance whose day is settled (settledFor) ('Wednesday is settled; this tick stands.').
- completionBlockOf keeps its per-instance check.
- The DONE lists (today-board DONE_STATUSES, tasks.ts:2205 query) add MADE_UP, so a made-up row reads done on the board while its streak reads missed.
- loadTodayCounts fills TodayCounts.yesterdayMusts (open compulsory occurrences on yesterday, 0 once yesterday is settled), in its existing read.

**Files.** src/lib/tasks.ts (lane C). The today-board.ts contract lines are lane 0's.

**Tests.** duty-actions-check (C): isSettledDay and isStaleRead classify 22003 and 22012 apart. board-check (D): MADE_UP reads done. duty-rehearse (lead): settle early then tick yesterday → refused with the settled message; tick, settle, undo → refused.

## F8. Freezes and the streak's held days

**Spec.**
- streak.ts getDailyStreak: the same raw query adds FREEZE_EARN and FREEZE_USE counts over all history; RestDay rows ≤ today in the window are read beside it and turned into held days by heldDaysOf; bankedFreezes = min(2, EARN − USE).
- snapshot.ts readStreak shares one helper with streak.ts (no second copy of the SQL).
- DailyStreak gains endedOn (the day a judged break ended it) and freezeWillCover (an unsettled yesterday with no activity and a freeze banked; display only, never stored). "Best" is not computed: it would need a full-history scan.
- DayLedger: the freeze crystals show the real balance ('2 banked'); a held chip 'A freeze will cover Wed' when freezeWillCover; without a freeze, 'Wednesday had nothing yet; record it by Fri 04:00 or the streak ends'; once judged and broken, the hollow flame with 'Ended Tuesday at 23 days', never a red 0. The repair hint folds into the Full-day note: 'A Full day today repairs Wednesday · once a week'.
- spendFreezeCore(day = yesterday, unsettled): refuses when yesterday has activity (net streak units > 0) or before launch; lifeLockOp; a balance guard (22012 when EARN − USE < 1); FREEZE_USE 'freeze-use:<yesterday>', countsForStreak false. The same key as settlement's automatic spend, so both can never land for one day.

**Files.** Lane B: src/lib/streak.ts, src/lib/snapshot.ts. Lane C: src/lib/duty.ts (spendFreezeCore), src/app/actions/duty.ts (spendFreeze).

**Tests.** streak-check (B): rest, sick, vacation, freeze and repair days bridge; future rest days do not; a rest row declared late does not; the freeze balance counts all history; freezeWillCover only for an unsettled yesterday with no activity; the make-up/undo case of F6. duty-actions-check (C): spendFreeze refused for an active yesterday. duty-rehearse (lead): a manual and an automatic spend at balance 1 → exactly one FREEZE_USE.

## F9. Rest, sick and vacation

**Spec.** Pure validation in new src/lib/rest-rules.ts (life-day keys), cores in src/lib/duty.ts, actions in actions/duty.ts (lane C):
- declareRest(day): day > today; day ≥ DUTY_LAUNCH_DAY; REST count in the life week < 2.
- declareSick(): today only; no SICK in the last 14 life days.
- setVacation(from, to): from ≥ tomorrow; from ≥ DUTY_LAUNCH_DAY; 3 ≤ length ≤ 30; VACATION days in [from − 364, to], the new ones included, ≤ 30; one RestDay row per day.
- cancelRest(day | range): only days > today; sets cancelledAt (the days return to the vacation budget).
- A rejection states why and when: 'Sick used on 22 Sep; next from 6 Oct'; 'Vacation left this year: 4 days (more from 3 Mar)'.
- Every write upserts by (userId, day), setting kind, declaredAt = now and cancelledAt = null, and invalidates 'life', 'activity'.

**Files.** new src/lib/rest-rules.ts; src/lib/duty.ts; src/app/actions/duty.ts.

**Tests.** duty-actions-check (C): rest the same day rejected; sick the same day allowed and a second within 14 days rejected; 31-day and 2-day vacations rejected; a vacation past the 30-day yearly budget rejected and allowed again once a cancelled one is refunded; rest in the past rejected; cancelling a started day rejected; the upsert data resets declaredAt and cancelledAt.

## F10. Full day: one rule, settled, and paid by the week judge

**Spec.**
- full-day.ts (lane A): questRingOf drops the dueNow clause and takes dayOpenQty | null (decision 7); lifeRingOf drops `workouts`; fullDayInputOf counts musts through duty-rule.ts mustsDueOn (TARGET musts excluded) with DONE_MVV and EXCUSED as met. One fullDayOf serves the board and settlement.
- The board's strip (lane D): settles = dutyLive; copy 'Full day · up to +0.5 MP, paid when the week is judged (Wed)'.
- Payment: F11.

**Files.** src/lib/full-day.ts (lane A); DayLedger copy (lane D).

**Tests.** settle-check (A): fullDayOf over 8 fixture days (queue-clear-but-short, no DAY_OPEN, rest day, MVV must, #play deed, study-only day, weigh-in only, TARGET must present). board-check (D): the board's live ring calls the same fullDayOf and agrees on those 8 days.

## F11. M5 judge seams (a compatible change to the frozen contract)

**Spec.** life-weeks.ts and life-weeks-server.ts (lane B):
- DUTY gate (decision 5): when isDutyLaunched(today), for a week whose Sunday ≥ DUTY_LAUNCH_DAY and Sunday > settledThroughDay, planWeeks plans no DUTY WEEK row and no full-day mint; BODY, CRAFT and CARE are planned as now. Weeks before DUTY_LAUNCH_DAY are judged exactly as now. maybeJudgeWeeks's cheap check returns early when the only track the last judgeable week misses is DUTY and the gate holds (it reads settledThroughDay from the cached LifeSettings).
- WeekJudgeState gains restDays, fullDays, settledThroughDay, and `key` on WeekMintRow; heldDays = restDays ∪ FREEZE_USE days; restDays come from heldDaysOf over RestDay rows.
- Template read: compulsory templates plus every template with a pendingChange (decision 16), each evaluated per day through ruleOn. Inbox templates are not expected (decision 31).
- DUTY occurrences use ruleOn and expectedOn with the judge's own floor max(startDay, epochDay) (no launch floor, so weeks already judged under M5 rules keep their meaning). For settled days every expected occurrence has an instance, so "no instance → missed" only applies to unsettled days (never judged for DUTY once the gate holds). TARGET via habit.ts targetUnits.
- Deadline one-offs (decision 18): the one-off instance read extends to day ≤ to + MAKEUP_RESTORE_DAYS; dutyOccurrences counts a one-off kept when it has a DONE or DONE_MVV instance by dueDay, or a DONE_LATE instance with day ≤ dueDay + 2, or a repaired instance on dueDay.
- Held weeks and pro-rated floors (decision 20). LedgerWeek gains `held` from weekMarkOf (receipt mark); life-tracks trackStateAt bridges keptStreak over held weeks and never counts them kept; pips render 'held'.
- Full-day mints: in the run that writes the DUTY WEEK row, after the kept-track mints, one per FULL_DAY row of a non-backfill week with day ≥ max(DUTY_LAUNCH_DAY, LIFE_LAUNCH_DAY), in day order, skipping keys already written: delta = cappedMp(0.5, used); mintLifeMasteryOps with 'mp:LIFE_FULL_DAY:<d>', day d, why 'full day <d>' (+ ' · trimmed by the weekly cap'); qty-0 decision rows allowed. Same array, same life-mint lock.
- The week Seal adds a line: '+1.0 MP from 2 full days'.

**Files.** src/lib/life-weeks.ts; src/lib/life-weeks-server.ts; src/lib/life-tracks.ts (weekMarkOf); src/lib/life-tracks-server.ts (WEEK receipt read); src/lib/life-economy.ts (HELD_WEEK_REST_DAYS, the mark, doc); src/lib/celebration-detect.ts (Seal line).

**Tests.** character-check §5 additions (B):
- BODY, CRAFT and CARE are judged on Wednesday while the cursor is behind; DUTY and the full days wait for settledThroughDay ≥ Sunday and then mint without trimming any track;
- the cheap check returns without reading while only DUTY is missing and gated;
- a reset after launch (cursor = epochDay − 1): the judge still judges and DUTY follows settlement from the epoch;
- a perfect week mints tracks 6.0 then 4 full days, 3 trimmed; two Shorts trim every full day and no kept track;
- a 5-rest-day week whose pro-rated floors are met is Kept; one whose floors are not met is 'Held', bridges the streak and adds no kept week; 4 rest days with floors unmet is Not kept;
- 2 rest days pro-rate BODY effort to 107.1 min and DUTY's fallback completions to 4;
- a made-up TARGET counts; a late make-up (MADE_UP) breaks the Duty week, a repaired one keeps it;
- a deadline due Sunday, ticked Monday or Tuesday (either path): the Duty week is kept; ticked Wednesday: not kept;
- an inbox must is not an occurrence;
- the un-flag mid-week case of F3.

## F12. Today: the Must lane, the Owed row, rest banners, record yesterday, the drawer

**Spec.** today-board.ts BoardData gains `duty: DutyBoard` (read in the existing board-core Promise.all, one round trip): owed cards (debtOpen instances with template title, archived flag, debt, day, restore deadline d + 2, the streak it restores, mvv, projected make-up and minimum prices), RestDay rows for yesterday, today and tomorrow (through heldDaysOf), the freeze balance and freezeWillCover, the settlement cursor, pending changes, and the settled-day facts for the notice (DEBT, FREEZE_*, FULL_DAY and REPAIR rows dated within the last 2 settled days). The board's habit reads pass the cursor and the held days (decision 15), so no row shows a break that settlement has not judged or will hold. Placement at 344 px (Fold cover screen first):
- **.o1 notice slot, one card at most:** the rest banner ('Rest day. Nothing is owed today.' / 'Paused until 12 Oct', held glyph plus words, quiet [Cancel] for a future day) or YesterdaySettled. YesterdaySettled is derived on read by settledNoticeOf(rows, cursor, today): for the latest settled day d with today ≤ d + 2 and something to say (debt created, freeze used or earned, Full day recorded, a REPAIR dated d − 1 shown as day-repaired), chips in kept, held or quiet tones, never owed. It plays as a T1 render in place and is dismissed per device (localStorage keyed 'settled:<d>', every access in try/catch); nothing is stored in CelebrationEvent. It never hides the Record-yesterday Ask.
- **.o4 Asks, two visible at most then 'n more':** 'Yesterday: n to record' (existing), 'Weekly review' (F14). todayAsksOf never shows an owed or record-yesterday feed notice, and NextUp never selects a make-up.
- **.o5 Must lane:** renders when must.length + owed.length > 0. Today's musts first, then the debts: one MakeUpCard when one debt, one collapsed OwedSummary when two or more (owedViewOf). A one-off with a debtOpen instance shows only its card, never a late row (decision 18). The count line is 'n of m kept' for today's musts only. A rest day adds a held chip 'Rest · nothing owed' to the header; compulsoryOnRest rows keep 'must'. Cards: 'Make up · ≈ 3.5' and 'Do minimum · 10 pushups · ≈ 2.1', the window line 'within Tue 04:00 it brings back 12 days', '(archived)' for a retired template, and a quiet third action 'Accept the loss' only when the setting is on and the debt is ≥ 14 days old. Copy never blames (makeUpCopy: 'Tuesday's stretch is still open. 10 min makes it right.'); the true minus '−4.2 owed', a sign only on credits.
- **.o8 Owed row** after Habits: 'Owed: 2 · −12.5'; a tap scrolls to the Must lane and opens the summary; renders nothing at 0.
- **Card actions:** optimistic resolve in place ('Made up. Nothing owed.' until the next refresh), Tier 0 makeup-paid token flight from the button to the life-XP cell, Tier 1 nothing-owed sweep on the Must lane when the last debt clears, Undo through the existing UndoToast (F6 undo).
- **The miss prompt** (new MissPrompt.tsx, an AskCard variant, with 'Not now', F6) under that template's card.
- **Row meta:** '12 days · repaired' after a restoring make-up, '12 days · held' after DONE_MVV or an excused day.
- **Record yesterday:** the existing Sheet gains the title 'Record Wednesday', the honesty line 'Tick only what you did on Wednesday. Doing it now? Settle Wednesday first: its make-up pays ×0.85 and brings its streak back.', the freeze switch 'Use a freeze for Wed' (shown only when Wednesday has no activity and a freeze is banked; 'covers all of Wednesday's musts · 1 left after'), and a sticky footer [Settle Wednesday now] / 'it settles on its own at Fri 04:00' with 'Settling locks Wednesday'. The result shows as YesterdaySettled in place. /today?sheet=yesterday opens it.
- **The drawer:** F3's pills and pending line.
- **DayLedger:** F8's freeze and streak states; F10's copy.
- **Close-the-day end-cap (.o11):** a quiet 'Time off' button beside 'Close the day' opens RestControls (the always-present same-day path for Sick).
- app/today/page.tsx: after(() => maybeMaintainLife(userId)) replaces after(() => maybeJudgeWeeks(userId)).

**Files.** src/lib/today-board.ts; src/components/today/** (TodayBoard, TaskRow, TaskDrawer, Lane, DayLedger, CloseDaySheet, board-ui.ts, NextUp, m2/MakeUpCard, m2/Notices, m2/Sheets, new MissPrompt.tsx, today.css) except m2/WeekRunner.tsx; src/lib/duty-view.ts (implementation); src/app/today/page.tsx.

**Tests.** today-ui-check (D): owedViewOf (0 → none, 1 → inline, 2+ → summary); todayAsksOf ignores owed and record notices; nextUpOf never returns a make-up; the board opens with no owed-toned element above the Must lane; one .o1 card; rest banner copy has glyph and word; rest day d, opened at d + 2 before settlement: no row shows a broken streak; settledNoticeOf shows once per d, only while today ≤ d + 2, never with an owed chip; the freeze switch is hidden for an active yesterday; MissPrompt 'Not now' hides it until the next miss. board-check (D): DutyBoard from fixtures; the Must lane renders with debts only; a debited one-off shows its card and no late row. ui-audit at 344, 375, 932, 1440 on /today with debts, a rest day and the yesterday sheet open; contrast-check for the held banner and excused rows in Night and Vellum (lead, at integration).

## F13. Close the day and the reflection

**Spec.**
- CloseDaySheet (lane D): non-compulsory open one-offs get [Tomorrow] [Anytime] [Drop] plus 'Roll all' (PLANNED only, never late; existing). Drop uses the archive with its 10 s undo; Anytime uses the clarify 'anytime' path. Open musts are all listed: with an MVV, 'Do the minimum'; without, the honest line 'Left open, Wednesday is judged Fri 04:00: −4.2 owed, made up at ×0.85'. Non-compulsory habits get 'Skip today'. closeItemsOf is a pure helper in board-ui.ts.
- Note and mood (lane E): saveReflection(day, note, mood) → REFLECTION {sink NONE, qty mood or null, detail note, key 'reflection:<d>:<nonce>'} built by a pure reflectionEventInput in rituals.ts; a later save supersedes; never graded; never counts for the streak (already in NEVER_STREAK_SOURCES).
- 'Rest <weekday>' switch (named, because between 00:00 and 04:00 'tomorrow' is ambiguous) → declareRest; disabled with its reason at the cap.

**Files.** src/components/today/CloseDaySheet.tsx, TodayBoard.tsx, board-ui.ts (lane D); src/lib/rituals.ts, src/app/actions/rituals.ts saveReflection (lane E).

**Tests.** board-check (D): closeItemsOf; 'Roll all' never makes an item late. rituals-check (E): reflectionEventInput has sink NONE, xp 0 and countsForStreak false.

## F14. Weekly review on /today/week

**Spec.** /today/week?view=run opens WeekRunner (focus mode, ≤ 560 wide, thumb-zone nav), offered while reviewedWeek(today) is not null and unmarked (decision 26). Every step is skippable; progress survives an exit (per-viewer localStorage, wrapped in try/catch).
1. The week: the last judged week (M5's LastWeekCard, reused) plus reviewedWeek's facts as far as they are settled ('settled through Fri'): days shown up, musts kept % (made up counts as kept late, excused as held), each duty's streak and habit rung, freezes used, Duty XP 'of which −12.5 debt'. Never a verdict for an unjudged week.
2. Inbox to zero: InboxSheet rows and clarifyInbox.
3. Goals: GoalsStrip cards with GoalCloseSheet and GoalRescheduleSheet (no 'stalled' flag, decision 33).
4. Owed: the MakeUpCard list; acceptLoss when enabled.
5. Next week: RestControls rows for specific days and CapacityPanel.
- Ends on the WeekCard Seal only when reviewedWeek is judged; otherwise on 'The week of 5 Oct is judged Wednesday; its card will show on Today'.
- Done marker: REFLECTION 'week-review:<YYYY-Www of reviewedWeek>' (sink NONE). The Today Ask 'Weekly review' (.o4, Monday badge) shows while the window is open and the marker is missing; the bell gets the same notice (tone info).
- The page's after() uses maybeMaintainLife. The placeholder 'arrives with daily settlement' eyebrow and sheet-math weekReviewPromise are rewritten behind dutyLive.

**Files.** src/app/today/week/page.tsx; src/components/today/m2/WeekRunner.tsx; new src/lib/rituals.ts (pure: reviewedWeek, week summary, reflectionEventInput); src/app/actions/rituals.ts (markWeekReviewed); src/components/home/sheet-math.ts.

**Tests.** New scripts/rituals-check.ts (E): reviewedWeek on each weekday, at 03:59 and 04:00 on Saturday, Monday and Thursday (03:59 on a Monday is still Sunday), and across the 2026-10-04 DST switch; the marker key uses reviewedWeek; 'settled through' labelling; a run never shows a verdict for an unjudged week.

## F15. Shell, bell, shortcuts, tour, rules, settings and capture

**Spec.**
- notifications.ts buildFeed: 'Owed: 2 · −12.5 XP' (id 'owed', tone warn) and, only when TodayCounts.yesterdayMusts > 0, 'Yesterday: 2 musts open' (tone info: listed, not counted). The evening 'musts' notice adds 'left open, it is owed from Fri 04:00'.
- shell-types.ts toneOf: id 'owed' → the owed diamond (decision 27).
- shell-data.ts: owed.count = open debts (badges.train stays 0; M4 is dropped).
- Shortcut `y`: open Record yesterday (the sheet on /today; elsewhere /today?sheet=yesterday). A single unmodified letter, bound by neither Chrome nor Edge (not in BROWSER_RESERVED); 'g y' stays You because the sequence handler owns a key after 'g'. Scope global (not while typing or with a dialog open). A 'Today' group in the help sheet; the id joins the ShortcutId union and shortcut-check. No other new keys.
- Tour (7 steps unchanged): when dutyLive, the Today step adds 'A must you miss is owed; make it up within two days and its streak comes back.'
- /today/rules: the M2 rules move from 'Not yet in force' to in force behind dutyLive, with every constant from duty-economy.ts; the Full-day row reads 'up to +0.5 MP, paid when the week is judged'; the vacation budget; 'Duty is settled through <day>' when the cursor lags (decision 5).
- Settings › Days: AcceptLossRow replaces its 'arrives with M2' row; the rest-weekdays row keeps its 'not yet' copy (decision 14).
- Capture: the Must chip per decision 29; '?' with '!' warns 'A must once you clarify it' (decision 31); the 'needs a schedule' path is unchanged; no new grammar ('Even on rest days' lives in the drawer).

**Files.** src/lib/notifications.ts; src/components/shell/shell-types.ts; src/lib/shell-data.ts; src/lib/shortcuts.ts; src/components/shell/Shortcuts.tsx; src/components/tour/tour-steps.ts; src/app/today/rules/page.tsx; src/components/settings/SettingsView.tsx, DaysControls.tsx; src/components/capture/CaptureChips.tsx, capture-ui.ts; src/app/you/page.tsx (after() → maybeMaintainLife). loadTodayCounts is lane C's (F7).

**Tests.** shortcut-check (E): 'y' is not reserved and does not collide with any registered key or sequence. shell-check (E): toneOf('owed') is owed; owed.count from fixtures; the yesterday notice is info and absent at 0 musts; the bell's counted total ignores it. rituals-check §capture (E): the stake chip equals '≈ −' + debtFor when live, reads 'stakes from Mon 12 Oct' before launch, and the '?'+'!' warning. ui-audit (lead): the chip does not wrap at 344 px.

## F16. Celebrations

**Spec.** No new kind and no change to the celebrations contract (T0 and T1 render in place and are never stored). makeup-paid (T0) and nothing-owed (T1) play from the make-up action's result on the client. yesterday-settled and day-repaired (T1) play in place from settledNoticeOf (F12), dismissed per device. Settlement writes no moment (F5). A level-down plays nothing; a level re-reached after debt replays no Seal (the Seal key is persisted, as now).

**Files.** src/lib/celebration-detect.ts (the Seal line of F11 only); scripts/celebration-check.ts.

**Tests.** celebration-check (B): a debt that lowers a Duty level plays nothing; re-reaching the level replays no Seal; a settle-cause snapshot pair with only DEBT rows yields no stored event.

## F17. Economy guard

**Spec.** balance-horizon assertions 1 and 2 stand (the worst case already prices the full cap, so Full days inside the cap change nothing). Add 3b: M2's capped reasons at their most (4 × 1.5 + 2 × 1 + 7 × 0.5 = 11.5) exceed the cap, so a planWeeks fixture proves kept-track mints are never trimmed by full days and Shorts trim full days first. Add 3c: with BODY, CRAFT and CARE minted in one run and DUTY plus the full days in a later run (decision 5), the totals and the trimmed set equal a single run's. Held weeks mint nothing, so pro-rated floors add no MP beyond kept weeks.

**Files.** scripts/balance-horizon.ts.

**Tests.** `npm run balance:horizon` exits 0; temporarily minting full days before tracks exits 1 (verified, reverted).

## F18. Reset scope

**Spec.** The 'life' scope deletes RestDay before LifeSettings (FK order: TaskInstance, TaskTemplate, RestDay, ActivityEvent, LifeSettings); getResetPreview counts it. Workout, HrBucket, StepInterval and IngestLog are dropped from the plan (M4). After a reset, the next LifeSettings create goes through newLifeSettingsDays (decision 1): after launch the cursor starts at epochDay − 1, so settlement resumes from the new epoch with no launch script run, and the M5 judge (whose launch marker lives in MasteryLedgerEntry, untouched by the life scope) keeps judging.

**Files.** src/lib/reset-scopes.ts; src/app/actions/reset.ts (lane C).

**Tests.** duty-actions-check (C): the reset plan lists RestDay before LifeSettings. settle-check and character-check: the reset cases of F4 and F11.

## F19. Docs

**Spec.** m2.md becomes a pointer to this file. grading.md: C (the rested bonus marked 'not yet in force', decision 33), E (day keys, MADE_UP, minimum make-up 2.1, attempt keys, the undo and its 'unrepaid:' row, freezes on no-activity days only, study musts, late one-offs, inbox musts), F (held weeks, pro-rating, the DUTY gate), G (full days minted by the judge with DUTY, trimmed last). data-model.md: MIGRATION 2 renamed 20261021000000_life_duty (RestDay only unless question 4); the dedupe-key list from Constants; the PendingChange JSON with its prior list; settlement as a second ledger writer under life-complete; NEVER_STREAK_SOURCES. PROGRESS.md: the lead.

**Files.** docs/life-plan/m2.md, grading.md, data-model.md (lane E).

**Tests.** A reviewer reads the docs against the code: every constant and golden matches duty-economy.ts, life-grade.ts and the checks.

## F20. Launch and rehearsal (lead only)

**Spec.** NEW scripts/duty-launch.ts. Run by the lead only; never by a subagent.

The gate: DUTY_LAUNCH_DAY must be set, a Monday, ≥ LIFE_LAUNCH_DAY (2026-10-01), and on or after the production deploy of this milestone. The first judged day is firstDutyDay(epochDay) = max(DUTY_LAUNCH_DAY, epochDay); the cursor starts at that day − 1, so the first judged day is settled at 04:00 two days after it.

Dry run (default, read-only), for the lead to review with the user:
- the launch day, today, the cursor (null, or already set by newLifeSettingsDays after a reset), epochDay, firstDutyDay;
- every compulsory template with its rule (ruleOn), compulsoryOnRest, MVV, and its first expected occurrences from firstDutyDay with the debt each would carry (debtFor), so the user can un-flag or archive while that is still immediate; inbox musts listed as 'not expected until clarified';
- RestDay rows and the vacation budget used;
- the freeze balance (0);
- the M5 state: the last judged week, and that every week before the launch day is judged or will be judged without the DUTY gate;
- planSettlement(dryRun) from firstDutyDay onward (empty until firstDutyDay + 2).

--apply, only with the user's go-ahead: a conditional update `settledThroughDay = firstDutyDay − 1 WHERE settledThroughDay IS NULL`. Idempotent: a second run writes nothing and says so. It refuses when the gate fails, and it refuses while today < firstDutyDay + 1 ('run --apply on <firstDutyDay + 1> or later; settlement catches up from <firstDutyDay>'). It runs on firstDutyDay + 1 or later, ideally before firstDutyDay + 2 at 04:00; if it runs later, settlement catches up from firstDutyDay, which was already lived with the M2 UI. *Reason:* by firstDutyDay + 1 every LifeSettings create (a 'life' reset in between) already falls after the launch and gets its cursor from newLifeSettingsDays, so no reset can leave the cursor null for ever; and the settled-day rule settledFor (decision 25) never locks a day before firstDutyDay, so the cursor at firstDutyDay − 1 locks no pre-launch tick, record or undo whenever it is written.

Rehearsal: NEW scripts/duty-rehearse.ts (written by the lead at integration) drives the cores with an explicit `now` and XTNL_DUTY_LAUNCH_DAY set per step (capture, completeInstanceCore and its undo, recordDayOpen, makeUpCore, undoMakeUpCore, acceptLossCore, spendFreezeCore, settleYesterdayCore, declareRest and cancelRest, the rule cores, settleLifeDays, maybeMaintainLife, runLifeCron, judgeClosedWeeks, the life reset followed by a capture, the board read) over 12 life days, Sat 3 to Wed 14 Oct 2026 with a rehearsal launch on Mon 5 Oct: the 23-hour life day and the 2026-10-04 DST start before the launch, then the first Duty week through its judge's Wednesday. One tagged user per scenario ('rehearse-duty:<run>:<scenario>'), deleted at the end (--keep keeps them, --clean removes leftovers). On xtnl-rehearsal only: it refuses any DATABASE_URL or DIRECT_URL that is not localhost:55432 before Prisma loads, and again through the launch script's own launchTargetOf. It replicates duty-launch --apply's one conditional update (that script reads the real clock). dev-rehearsal.mjs sets XTNL_DUTY_LAUNCH_DAY for the visual pass on seeded state.

Order (production deploys by pushing main):
1. Lane 0 migration rehearsed locally; build; every gate in Acceptance; duty-rehearse; the browser pass at 344 px first on the rehearsal server.
2. Check the Supabase project ref is xtnl-idea; apply life_duty (pre-approved once local tests pass).
3. Commit and push to main with DUTY_LAUNCH_DAY = null: the deploy is inert (pre-M2 UI, no settlement, rest actions refused).
4. Confirm CRON_SECRET is set in Vercel Production; call /api/cron/life once without auth and expect 401; confirm vercel.json's new cron is listed in the dashboard.
5. Set DUTY_LAUNCH_DAY (a Monday ≥ the deploy day), commit and push (the UI shows 'Musts carry stakes from Mon …' and rest can be declared for the launch week).
6. Dry run; review with the user.
7. --apply on the go-ahead, on firstDutyDay + 1 or later (the script refuses earlier), ideally before firstDutyDay + 2 at 04:00; a later run settles from firstDutyDay.

**Files.** new scripts/duty-launch.ts (lane A); new scripts/duty-rehearse.ts (lead); docs/life-plan/dev-rehearsal.mjs (lead); src/lib/duty-economy.ts (DUTY_LAUNCH_DAY, set by the lead).

**Tests.** The dry run on rehearsal matches what --apply and the next settlement then write; a second --apply writes 0 rows; after a rehearsal reset and capture, the dry run reports the cursor already set and --apply writes nothing.

## Lanes

Lane 0, contract (the lead, first): F1 in full, including scripts/duty-check.ts. Lanes A–E start when it lands.

Then five lanes in parallel on DISJOINT files. Each lane owns its own check file; no two lanes write one file.
- **Lane A (settlement core):** src/lib/settlement-plan.ts (implementation), src/lib/settlement.ts, src/app/api/cron/life/route.ts, vercel.json, src/lib/full-day.ts, scripts/settle-check.ts, scripts/duty-launch.ts. (F3 step 11, F4, F5, F10 rule, F20 launch script.)
- **Lane B (judge, streak, celebrations):** src/lib/life-weeks.ts, life-weeks-server.ts, life-tracks.ts, life-tracks-server.ts, life-economy.ts, streak.ts, snapshot.ts, celebration-detect.ts, scripts/character-check.ts, scripts/streak-check.ts, scripts/celebration-check.ts, scripts/balance-horizon.ts. (F8 streak, F11, F16, F17.) streak-curve.ts's only change is lane 0's.
- **Lane C (duty actions and completion seams):** new src/lib/duty-plan.ts (implementation), new src/lib/duty.ts, new src/lib/rest-rules.ts, src/app/actions/duty.ts, src/lib/tasks.ts, src/app/actions/tasks.ts, src/lib/reset-scopes.ts, src/app/actions/reset.ts, new scripts/duty-actions-check.ts. (F2 action gates, F3 server, F6, F7, F8 spend, F9, F18.)
- **Lane D (Today):** src/lib/today-board.ts (beyond lane 0's lines), src/lib/duty-view.ts (implementation), src/components/today/** except m2/WeekRunner.tsx, new src/components/today/MissPrompt.tsx, src/app/today/page.tsx, scripts/board-check.ts, scripts/today-ui-check.ts. (F3 UI, F10 strip, F12, F13 sheet.)
- **Lane E (rituals, shell, copy, docs):** src/app/today/week/page.tsx, src/components/today/m2/WeekRunner.tsx, new src/lib/rituals.ts, src/app/actions/rituals.ts, src/app/you/page.tsx, src/components/home/**, src/app/today/rules/page.tsx, src/lib/notifications.ts, src/lib/shell-data.ts, src/components/shell/shell-types.ts, src/components/shell/Shortcuts.tsx, src/lib/shortcuts.ts, scripts/shortcut-check.ts, scripts/shell-check.ts, new scripts/rituals-check.ts, src/components/tour/tour-steps.ts, src/components/settings/**, src/components/capture/CaptureChips.tsx, src/components/capture/capture-ui.ts, docs/life-plan/m2.md, grading.md, data-model.md. (F13 reflection, F14, F15, F19.)

Lead at integration: scripts/duty-rehearse.ts, docs/life-plan/dev-rehearsal.mjs, package.json's life:check, ui-audit and contrast-check runs.

Cross-lane needs go through lane 0's types and shells: lane D calls actions from lanes C and E by their lane 0 signatures and fullDayOf from lane A; lane E reads TodayCounts.yesterdayMusts from lane C by its lane 0 type; lane C's cores call settleLifeDays by its lane 0 signature; the week page imports MakeUpCard read-only. A check may import another lane's module read-only. A lane that needs a change in another lane's file reports it instead of editing.

Then three independent reviewers, read-only, findings fixed:
1. Ledger, settlement, economy and idempotency (dedupe keys, guards, lock order, statement counts, trim order, the DUTY gate, the ledger invariant, streak units of every new row).
2. UI, honesty and copy at 344 px first (never opens on red, no break before settlement, one card at .o1, two Asks, stake copy, contrast, the record-yesterday honesty line, shortcut collisions, the bell count).
3. Launch and shared-database safety (every write gated, the cursor and the first judged day, the reset path, no pre-launch rows, the cron secret, the rehearsal script's localhost refusal).

No subagent ever touches a database, runs a dev server or commits.

## Acceptance

Checks that must pass:
- npx tsc --noEmit, npm run lint and next build.
- npm run life:check with settle-check, duty-check, duty-actions-check and rituals-check appended; streak-check, board-check, today-ui-check and character-check with their additions; every M1 and M5 check unchanged otherwise.
- npm run ui:check (shell, contrast, review, celebration, you, study-side, shortcut, tour).
- npm run balance:horizon exits 0 with 3b and 3c.
- npm run skills:stats is byte-identical.
- ui-audit on /today, /today/week, /today/rules, /settings and /you at 344, 375, 932 and 1440 with no console errors.

life_duty is rehearsed locally, then applied (pre-approved once local tests pass; ref checked).

On the rehearsal database only, over duty-rehearse's 10-day clock:
- A missed must shows a make-up card only from 04:00 on d + 2 (or after 'Settle yesterday'); before that no row shows a break.
- A make-up on d + 2 clears the debt and restores the per-duty streak; on d + 3 it clears the debt and the streak stays broken; its undo reopens the debt and leaves the day's streak as it was before the make-up.
- A no-activity day with a live streak consumes a freeze; a rest day consumes none and holds the streak; a manual freeze is refused for an active yesterday.
- A Full day is recorded on settlement and paid 0.5 MP on the Wednesday judge, after the kept tracks.
- Running settlement twice, or two settles at once, writes nothing new; settling early then running the cron writes nothing new.
- An early settle followed by a yesterday tick or undo is refused with the settled message.
- BODY, CRAFT and CARE are judged on Wednesday while settlement is held back; DUTY waits for its Sunday to settle.
- A life reset followed by a capture keeps settlement and the judge running from the new epoch.

Shared database safety (pure, no dev server): settle-check proves settleLifeDays and maybeMaintainLife write nothing with NODE_ENV development and no XTNL_LIFE_JUDGE, and that the cron route returns 401 without CRON_SECRET or with a wrong header.

Production, run by the lead:
- Verify the project ref is xtnl-idea; review the duty-launch dry run with the user; --apply only on the go-ahead.
- Read-only queries after the first settlement: no TaskInstance with judgedAt and day < firstDutyDay; no DEBT, FREEZE_*, REPAIR, FULL_DAY or LIFE_FULL_DAY row dated before DUTY_LAUNCH_DAY; no settlement row with countsForStreak true; no instance written into the M5 week 28 Sep–4 Oct or any week before DUTY_LAUNCH_DAY; the audit SQL still returns 0 TRACK rows sharing a sourceId with REVIEW or IDEA_CREATE.

The board never opens on red: debt appears only inside the Must lane (one card or one collapsed summary) and in the bottom Owed row; the bell and the ≥ 1280 px Sidebar pill are the only other places.

## Questions for the user (product only, before the build)

**Answered 2026-10-04 (all as recommended):** 1 yes — a missed must never breaks the daily streak on a day with other activity; 2 DUTY_LAUNCH_DAY = 2026-10-12 if the build and rehearsal land by Thu 8 Oct, otherwise the next Monday after they do (the constant stays null until the lead sets it at launch); 3 VACATION_DAYS_PER_365 = 30, 3 to 30 days at a time; 4 standing rest weekdays later (decision 14 stands; the migration is the RestDay table only).

1. Streak hit: a missed must breaks its own streak, its pay bonus and the Duty week, but not the daily streak on a day you did other things (decision 23). Agree? Recommended: yes.
2. Launch Monday: 2026-10-12, or a later Monday? Recommended: 2026-10-12 if the build and rehearsal land by Thu 8 Oct; otherwise the next Monday after they do.
3. Vacation budget: up to 30 vacation days in any 365 days, 3 to 30 at a time (decision 13). Recommended: 30.
4. Standing rest weekdays ('every Sunday is rest'): in M2, or later, with rest declared one day at a time (≤ 2 a week, one tap from Close the day) until then (decision 14)? Recommended: later.

## Critique notes

How each finding of the revision-1 critique was handled.

Blockers, both fixed:
- Undo of a make-up via an UNDO row: replaced by a negative DEBT_REPAID 'unrepaid:<repaidRowId>' (decision 10, F6); the Σpaid filter is recorded for the deferred knee reconcile (Constants); streak-check and settle-check cases added.
- Reset switching Duty off: newLifeSettingsDays sets the cursor at create time after launch (decision 1, F1, F18); the launch script and planSettlement use firstDutyDay = max(DUTY_LAUNCH_DAY, epochDay); reset cases in settle-check, character-check and duty-rehearse. Checked: the M5 launch marker is a MasteryLedgerEntry row, which the life reset does not delete, so M5 itself keeps judging.

Majors, all fixed:
- Settle gate on every track → DUTY only, plus the cheap-check gate and the lag notice (decision 5, F11). The cheap check needed its own rule because judgedWeekKeys requires all four tracks, so a DUTY-only gap would otherwise re-read on every render. F17 3c proves split runs trim identically.
- Late one-off outside the judge's read → read extended to Sunday + 2, DONE_LATE by dueDay + 2 kept (decision 18, F11), with both completion paths tested.
- Debited one-off double path → only the MakeUpCard; completeInstanceCore refuses (decision 18, F6, F12).
- Weakening applied mid-week → prior segment written on apply, kept until the DUTY WEEK row exists; the judge reads templates with a pendingChange; prior became a list so an applied weakening and a later strengthening can coexist (decision 16, F3, F11).
- planCompletion cannot price a make-up → lane 0 adds PlanInput.makeUp and taskEventInput.keyDay (F1); `rested` is gone with the deferral.
- Unbounded vacations → 30 days per rolling 365 (decision 13, F9), now question 3.
- Manual freeze as a skip token → offered and allowed only for a no-activity yesterday (decision 12, F8, F12). Not made a user question: excusing musts on an active day would contradict the fixed contract.
- Standing rest weekdays read by one reader only → heldDaysOf is the single reader for every held day; standing weekdays themselves are deferred (decision 14) and offered as question 4, which would add them back through the same helper.
- T1 notices persisted through CelebrationEvent → derived on read, dismissed per device (F12, F16); settlement no longer runs withMoments.
- Board opening on red before settlement → habit reads take the cursor and held days (decision 15, F1, F12).
- Pre-launch actions → rest and vacation for days ≥ DUTY_LAUNCH_DAY allowed once it is set; debt actions whenever a debt exists; freeze and early settle refused (decision 2, F2).
- Lanes not disjoint → one check file per lane (duty-check lane 0, settle-check A, character/streak/celebration/balance B, duty-actions-check C, board/today-ui D, rituals/shell/shortcut E), duty-rehearse moved to the lead, F3's UI moved to lane D, TodayCounts.yesterdayMusts and BoardTemplate.pendingChange declared by lane 0; GoalCard.lastProgressDay is deferred.
- Launch order and CRON_SECRET → push inert first, then verify the secret and the 401, then set the day (F20).

Minors:
- Knee reconcile: deferred as suggested (decision 33).
- Held weeks: Kept beats Held, completions pro-rated, structural mark with weekMarkOf (decision 20).
- expectedOn's launch floor: moved into planSettlement; the judge keeps max(startDay, epochDay) (F1, F4, F11).
- Weekly review week: reviewedWeek defined and tested at each boundary and across 04:00 (decision 26, F14).
- Streak flags of settlement rows: countsForStreak false and four sources added to NEVER_STREAK_SOURCES (decision 32). This touches streak-curve.ts, so it is a lane 0 line rather than lane B's.
- RestDay reuse: every upsert resets kind, declaredAt and cancelledAt; tested in duty-check (heldDaysOf) and duty-actions-check (upsert data).
- Settled-day guard: a separate 22003 guard, not retried (decision 25, F7).
- Bell noise: only yesterday's open musts, tone info, uncounted (decision 27, F15).
- Capture chip: approximate, live only, pre-launch wording, 344 px audit (decision 29).
- MissPrompt: 'Not now' added (F6, F12).
- Scope: the rested bonus, velocity, stalled goals and WelcomeBack are deferred (decision 33). The rested bonus is published in grading.md C; it is marked 'not yet in force' rather than removed, so it stays a plan, not a promise.
- Shared-database acceptance: now a pure check with injected env and a stubbed client (F5, Acceptance).
- Decision 11 rationale: rewritten; future positive bookkeeping rows must carry templateId NULL.
- Inbox musts: never expected, with a capture warning (decision 31).
- Not taken as written: the vacation finding says each vacation day excuses compulsoryOnRest musts. Decision 15 judges compulsoryOnRest musts on REST, SICK and VACATION days alike (only a freeze excuses them), and that stays: 'Even on rest days' is the user's own strengthening, for meds and the like.
- Not taken as written: questions 3 (starter freeze), 4 (judge timing), 6 (chip frequency) and 7 ('Time off' placement) of revision 1 are now lead decisions (12, 26, 29 and F12), to keep the user's questions to the four that set the contract's shape.
