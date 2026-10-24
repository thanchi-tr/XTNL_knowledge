# XTNL for Android (native, v2)

A native Kotlin + Jetpack Compose app for the XTNL web app, built for the
Galaxy Z Fold 8: the front display (about 475 × 751 dp) and the main display
(704 × 932 dp upright, 932 × 704 dp sideways, book and tabletop postures).
It does three things fast, one-handed on the front display and in two panes on
the main one:

- **Check** (home): today's board with big ticks, the daily quests (the musts,
  "Daily quests 3 of 4" with a 1/0 strip), the review card with its "Fading"
  line (the ideas past their grace, which opens Review), the Week card (the
  weekly audit, once it is switched on: "86% · 26 of 30 kept", provisional,
  frozen or final, the 85% target, and "Decaying this week" with its first
  three lines), the Quest card (the main quest, its milestone, this week's
  sprint and Today's three, read only: a row whose task is open ticks it, and
  Start and plan edits stay on the web), the wallet chip (once the server's
  credits are switched on: "120 cr · +40 today", the server's own figures, set
  from each tick's answer and never added up here; a tick that finishes one of
  Today's three says "· +10 cr", unless another tick was out at the same time,
  when neither line claims the shared change and the chip reads `/check` again;
  no chip while they are off), the **Rest tokens** chip in the header ("Rest
  tokens 2": the momentum freezes under one name, 0 said as it is, the server's
  own number), the **Owed** card (once Duty is switched on: every open debt,
  oldest first, in the web make-up card's words: "−4.2 owed", when it was
  missed, its line and its window; **Make up · ≈ 1.9** repays the whole debt and
  pays ×0.85, **Do minimum** pays the minimum version's own, and **Accept the
  loss** only where the web offers it; a proof must's minute or page chips come
  first and Make up waits for them; a make-up's line has an **Undo** for its ten
  minutes, as the web card's; while Duty is off on the server the card shows
  without its actions: "Make it up on the web app"), and the work items that
  are due, with call and text buttons.
- **Log**: a quick line (Task · Weigh-in · Idea) with a live reading of the
  line, and the full **New idea** form in all seven formats.
- **Review**: a session runner for every card type, with feedback after each
  answer and a summary at the end.

**More** holds **Attributes** (the web's /you Status card, titled Attributes: the five attributes,
Vitality, Intellect, Craft, Duty and Care, each its Body, Knowledge or track
row's own level, pips, meter and line, each with its avatar targets under it
("Weight 82.4 → 75 kg · 38% of the way · on pace", set on the web) and its
skills counted, then Capital as a reading only, AUD won from won deals with no
level and no XP, then the Skills: named practices by hours, each its tier
(0–100, 100–500, 500–2,000, 2,000–10,000 h) and the web's own lines, named and
linked on the web, paying nothing; one column on the front display, two panes
on the main one; read only, also at `xtnl://app/status`). A tick on Check that
feeds a skill says so in its line ("· Reading ≈ 99.9 h", or "· Reading reached
Tier 2"). Then the **Mall** (the web's You › Mall: the rewards you list, each with
its price in credits and its hint, "≈ 2 good days" or "calibrating", by
category, under the credits once they count; it opens empty, with no starter
rewards, and #play, rest days and sleep are never priced, in the server's own
words; an Add form lists a reward, and editing and archiving stay on the web;
Buy, then Confirm, buys one for exactly its price, never more than the balance,
with a burn on the wallet's figure and its haptics; the purchases follow, each
undoable for 10 minutes; a balance below zero after an undone quest shows as
"−10 cr · earn it back" and buys nothing; one column on the front display, two
panes on the main one, also at `xtnl://app/mall`). Then Settings and
**Open full app**, which is the web app in a
WebView, for everything else.

The app talks to the server's mobile API, `<server>/api/mobile/v1` (see
`docs/mobile-api.md`). Package `com.xtnl.app`, version 2.11 (versionCode 23), so
it installs over the v1 WebView shell in place.

On **Check**, a long press on any open task opens its **minutes sheet** (blueprint
P7 and P23): the web drawer's chips (10, 20, 30, 45, 60, 90 min), Done with the
minutes picked (the server counts them with the drawer's clamp, half to twice the
estimate, and the sheet says when that moves them), and its minimum version. Once
the server switches proof of work on (`PROOF_LAUNCH_DAY`, until the user's go
nothing changes), a deep-work task marked proof says "log the minutes": its tap
ticks with its timer once that has run, else opens the sheet, where its timer
starts, stops and resumes ("Timer 12 min"; a Resume after a break adds to it).
Its chips span its estimate (45 to 180 min on a 90-minute task). A timer counts
what it ran (at most twice the estimate); picked minutes count instead of it. A
timer that ran across 04:00, or past twice the estimate, opens the sheet first
rather than counting in one tap. One timer runs at a time; it is a row on the
server, so it survives an app restart, and the row's figure moves while it runs.
Every other task, and every minimum, still ticks in one tap.

A reading task (P24, captured with its pages: `read 30 pages`, `30pg`; `30p` is
still 30 minutes) says "log 30 pages" once proof of work is on: its tap opens the
same sheet at its **page chips** (30, 45, 60 pages, the day's target picked), and
Done reads "Done · 30 pages". The server refuses fewer than the target ("Log the
pages"); the pages are recorded, never priced, and its minimum needs none.

**Health Connect** (blueprint P27, decision D22: Settings › Health Connect ›
Walks, hikes and weight) reads walking and hiking sessions (their distance and,
for a hike, the climb) and weigh-ins from Health Connect, so they arrive without
being logged by hand. It is **off until you turn it on**: the switch first shows
the rationale (what is read and what the server does with it; Health Connect
opens the same screen from its own settings), then Health Connect's permission
dialog, and the sync starts only once walks, distance and weight are allowed.
Nothing else is read (no steps, heart rate, sleep or other workouts) and nothing
is written to Health Connect. Where Android allows reads while the app is
closed (Android 15+, asked separately) a WorkManager job syncs about every 6
hours; without that no job is armed and it syncs when the app opens, posting to
`POST /exercise` 50 at a time. Walks from before the switch-on (the first sync
reads Health Connect's 30 days of history) are recorded, never paid and never a
personal best; a newer walk is priced as one logged on Train › Exercise, once per
record. One you already logged by hand is matched, and the same walk typed on
Train › Exercise after it came in is refused there: never paid twice. A weigh-in
never replaces one you typed. The line under the switch says when it last synced
and what came in, and how many walks were skipped because their app recorded no
distance.

## Build

The build needs Android Studio's JDK (Java 21) and the Android SDK, both
already on this PC.

```powershell
cd android
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
.\gradlew.bat assembleDebug test
```

The APK is written to `app/build/outputs/apk/debug/app-debug.apk`.

| Part | Version |
| --- | --- |
| Gradle | 8.11.1 |
| Android Gradle Plugin | 8.7.2 (compileSdk and targetSdk 35, minSdk 26) |
| Kotlin | 2.0.21 (with the Compose compiler plugin) |
| Compose BOM | 2024.11.00 (Compose 1.7.5, Material 3 1.3.1) |
| Other libraries | androidx.window 1.3.0, androidx.webkit 1.12.1, core-splashscreen 1.0.1, OkHttp 4.12.0, kotlinx.serialization 1.7.3, Health Connect client 1.1.0-alpha10, WorkManager 2.9.1 |

To build for a different default server, pass it as a property:
`.\gradlew.bat assembleDebug -Pxtnl.server=https://example.com`. The default
is set in `gradle.properties` and is `https://xtnl-knowledge-xpis.vercel.app`.

### Tests

`.\gradlew.bat test` runs the unit tests for the logic that has no UI:

- the answer shape for each card type;
- the review queue and its retry rule;
- the layout choice from the window size and the hinge;
- the time words ("in 20 min", "Overdue since Mon", and the life day that
  turns at 04:00);
- the pentatonic tick ladder and the tone synthesis;
- the server address rules;
- the body sent with a new idea;
- the quick line's reading;
- the daily quests strip, the Fading line's and the Week card's words
  (its decay lines too);
- the Quest card's words (no Start while the server's switch is off, the
  sprint's Sunday "provisional · final Wed 04:00", no sprint line while the
  milestone is past its day, a Gemini title's note and struck numbers), a
  sprint row reading done only when the server says its week's count is met
  (a session ticked today reads "ticked today"), the card read again after a
  tick that moves it, and the demo's quest rows being the board's own tasks;
- the Sunday reminder's clock: 19:00 Sydney time whatever zone the phone is
  in, either side of DST, and its Settings line with and without exact
  alarms;
- the Attributes screen's words (its title, the track's name with the blueprint's word
  beside it, the meter's floored percentage and "capped at level n", one
  TalkBack line per row, Intellect alone before life counts, Capital a reading
  with no level), the demo's Vitality meter moving with the gym tick, each
  attribute's avatar targets (and a track's kept apart before life counts),
  and Back from More › Attributes;
- the Mall's words (the rewards in the server's category order, the Add
  form's live hint by the server's own rule, a price of whole credits from 1
  to 100,000, the form's checks before it sends), the demo's Mall opening
  empty and refusing a price of 0, a rest day, #play and a title already
  listed in the server's words, a clientId listed once, and Back from More ›
  Mall; and buying (P19): Buy only while credits count, Confirm naming the
  price, the server's refusals in its words, the demo burning exactly the
  price and never more than the balance, a cooldown held, a clientId bought
  once, an undo inside its ten minutes only, once, a lost purchase's clientId
  kept only until a read lists that purchase (a new Buy is then a new one),
  and an undone purchase's price struck through, never shown as "+";
- the minutes sheet and proof of work (P7, P23): the web drawer's chips and
  clamp (an estimate of 30 reported as 90 counts 60), what a tap does (a chore
  ticks in one tap; a proof row ticks with its timer once it has run, else
  opens the sheet), the timer's words as the web's ("Timer 34 min", "Timed
  1 h 05"), the demo refusing a proof row's full tick with no minutes ("Log the
  minutes"), one timer at a time, and a timer counted once by its tick;
- pages proof (P24): a reading task's tap opening the sheet, its page chips and
  words as the web's ("Done · 30 pages", "log 30 pages"), the demo refusing a
  full tick below the day's target ("Log the pages") and pricing the pages at
  nothing, and its minimum still one tap;
- Health Connect (P27): only walking and hiking sessions are sent, with their
  distance, climb and app, never one the server can't log (no distance, over a
  day, a bad id); weigh-ins of 20 to 400 kg; oldest first, 50 at a time with
  the switch-on instant; the first sync reads 30 days, each later one from the
  last less 48 hours; the app's own sync at most every 15 minutes; Settings'
  lines; the server's words for a batch; the demo recording the backfill,
  paying a newer walk and answering a resend as duplicates; and the manifest
  declaring exactly the permissions asked, the rationale activity and the
  Android 14+ alias (HealthManifestTest);
- the Rest tokens chip's words ("Rest tokens 2", none from an older server) and
  the Owed card's (the owed chip, ×0.85 and the whole debt, Make up waiting for
  Duty and for its proof, Undo only while the server sends `undoUntil`, which
  refusals take a card away), and the demo's owed cards: a make-up repaying at
  the card's price, a clientId answered once, Accept the loss only where
  offered, an undo inside its ten minutes bringing the card back, and a debt
  already gone as a 404;
- the shapes of the API's responses (a row's proof, timer and pages, the timer
  routes' answer, a row from an older server reading as none of them, and
  `/exercise`'s counts and the body the sync sends).

The screen renders are a separate step, because they are slow. This command
draws every screen with demo data at the Fold's sizes (front display, main
display upright and sideways, tabletop), walks the three flows, and records
the animations frame by frame:

```powershell
.\gradlew.bat testDebugUnitTest "-Pxtnl.shots=true" --tests com.xtnl.app.ui.ScreensTest
```

The PNGs are written to `app/build/screens/`. The moments (a tick, board
clear, a review's card, a right answer and a miss, the two level ups, session
complete, a work item's Done, the new idea's filing and seal, a tab switch) are
filmed in Full motion at the front and main sizes, one PNG per key frame:
`<size>-m<moment>-<name>-<ms after the tap>ms.png`.

## Install on the phone over USB

1. Turn on USB debugging on the phone: Settings › About phone › Software
   information, tap Build number 7 times, then Settings › Developer options ›
   USB debugging.
2. Plug the phone in and accept the "Allow USB debugging" prompt on the phone.
3. Install the APK. The `-r` keeps the app's data, and the new app replaces
   the v1 shell because the package name is the same:

   ```powershell
   $adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
   & $adb devices
   & $adb install -r app\build\outputs\apk\debug\app-debug.apk
   ```

You can also copy the APK to the phone and open it there. Allow "Install
unknown apps" for your file manager once.

## Point it at a server

Go to **More › Settings › Server**.

- **Production** is `https://xtnl-knowledge-xpis.vercel.app`, and is the
  default.
- **Local dev (adb reverse)** is `http://localhost:3100`. Run the web app on
  this PC on port 3100, plug the phone in, and forward the port:

  ```powershell
  & $adb reverse tcp:3100 tcp:3100
  ```

- You can also type any `https://` address. Plain `http://` works only for
  `localhost`, `127.0.0.1` and `10.0.2.2` (the emulator), as
  `res/xml/network_security_config.xml` allows.

**Test** calls `GET /check` and shows "Connected" or the server's own error.

The v1 shell's pinned "Address" shortcut now opens Settings. The app also
carries over an `https://` address saved in the v1 shell.

## API token

If the server sets `MOBILE_API_TOKEN`, paste the same value into **More ›
Settings › API token**.

- The app sends it as `Authorization: Bearer <token>`.
- It is stored encrypted, with AES-256-GCM and a key in the Android Keystore
  that never leaves the phone.
- The app never shows it again: Settings only says whether a token is saved.
- A token belongs to the address it was saved for. Switching the address (Local
  dev, say) never sends it to the new one; each address keeps its own.
- Backups and a move to a new phone leave the sealed tokens behind (their key
  can't move): paste the token again on the new phone.
- When the server answers 401, the app says to set the token in Settings (on
  Check too, over the last board it read, with a Settings button).

The token is never part of the build and never part of the source.

## The Sunday reminder

Once the server's weekly audit is switched on (its `/check` says `auditOn`,
from the launch day, before the first week is shown), the app reminds you on
**Sunday at 19:00 Sydney time** that the week's audit is ready. Tapping it
opens the audit (`xtnl://app/week`, the web's `/today/week`).

- It is the phone's own notification: an alarm set by the app, with no server
  push. The time is always Sydney's, even when the phone is set to another
  zone, and daylight saving never moves it.
- **More › Settings › Notifications › Week audit** turns it on or off (on by
  default). On Android 13 and later the app asks once for permission to show
  notifications, when the audit first goes live; Settings can ask again, or
  opens Android's notification settings for the app once it was refused.
- It is armed again after a reboot or an update. Demo data never arms it, and
  switching to another server or to demo data disarms it until that source's
  first check. A failed audit read on the server never turns it off.
- It comes at 19:00 exactly when Android lets the app set exact alarms
  (**Alarms & reminders**; on Android 14 and later you allow it yourself:
  Settings › Notifications offers the page). Otherwise Android delivers it
  within the hour after 19:00, and Settings says so.

## Demo data

Go to **More › Settings › Data › Demo data**, or tap **Try demo data** on the
"Can't reach XTNL" screen.

- It shows a believable day: tasks in every lane and state (open, done, held,
  and a locked study task), work items with customers and phone numbers, ten
  review cards covering all seven types (including LaTeX formula cards), and a
  quick log and New idea that work.
- The demo follows the contract's rules: a clientId answers only once, a field
  the format doesn't use is refused, and a missed card comes back at most 3
  times.
- Nothing is sent to a server, and the demo data is lost when the app is
  closed.
- It is off by default. Switch it back to **Server** in the same place.

## How it behaves

- **Fold and unfold**: nothing reloads. The activity handles size changes
  itself, and the state lives in ViewModels: the scroll position, what you
  typed and a review session all survive, and the layout animates to its new
  shape.
- **Layouts**:
  - Front display: a bottom bar (Check · Log · Review · More) with the main
    actions at the bottom, and 56 dp targets.
  - Main display: a navigation rail and two panes.
  - Half-open like a book: the two panes split at the hinge.
  - Half-open like a laptop (tabletop): content on the top half and controls
    on the bottom half.
- **Offline**: the last `/check` is cached and shown with "Offline · updated
  10:42".
  - A write that fails shows the server's error line with **Retry**. A retry
    sends the same clientId, so the server records the action only once. A
    purchase whose reply was lost keeps its clientId only until a read of the
    Mall lists it; after that a new Buy is a new purchase.
  - What you typed is never cleared on a failure.
- **Motion**: Settings › Motion offers **Full**, **Calm** or **Still**.
  - Full: each deed stamps (a 56 ms up-stroke, a few frames of hold, a spring
    settle), and rewards travel from where they show to where they are kept.
    Calm: short fades and settles only. Still: every state at rest at once.
  - The phone's "Remove animations" setting always means Still.
  - Sound is off in Still. Every tone is in E major; each moment has at most
    four haptic beats, merged into one composition when moments overlap.
  - Sound and haptics are soft, are on by default, and each has its own
    switch.
- **Math**: the app renders LaTeX in FORMULA prompts with KaTeX 0.18.4 (MIT).
  KaTeX is bundled in `app/src/main/assets/katex`, copied from the web app's
  `node_modules/katex`, so it works offline and never loads from a CDN. The
  app serves it to a small WebView on a private `https://appassets…` origin
  (WebViewAssetLoader) and refuses every other request. Before KaTeX has
  drawn, or if it fails, the TeX source shows in monospace.
- **Launcher shortcuts**: Quick check, Log a task, New idea and Review. Each
  opens `xtnl://app/check`, `/log?section=task`, `/idea` or `/review`.
- **Full app**: the web app in a WebView.
  - Links on the server's own origin stay in the app; other links open in the
    browser.
  - Back closes the web app's sheets.
  - File uploads work.
  - When the server can't be reached, it shows a "Can't reach XTNL" screen.

## Icon

The source art and its renders are in `art/`:

- `xtnl-icon.svg` is the source art.
- `xtnl-icon-1024.png` and `xtnl-icon-512.png` are renders of the icon.
- `xtnl-icon-adaptive-preview.png` shows the icon in a launcher mask, with the
  safe zone marked.
- `xtnl-icon-monochrome-preview.png` shows the themed (monochrome) icon.

The adaptive icon has a vector foreground, a gradient background and a
monochrome layer. The same art is used for the round icon and the splash
screen.

## Release

The debug APK is signed with this PC's debug key. A Play Store release needs
its own signing key: run `assembleRelease` with a `signingConfig`.
