# XTNL for Android (native, v2)

A native Kotlin + Jetpack Compose app for the XTNL web app, built for the
Galaxy Z Fold 8: the front display (about 475 × 751 dp) and the main display
(704 × 932 dp upright, 932 × 704 dp sideways, book and tabletop postures).
It does three things fast, one-handed on the front display and in two panes on
the main one:

- **Check** (home): today's board with big ticks, the review card, and the
  work items that are due, with call and text buttons.
- **Log**: a quick line (Task · Weigh-in · Idea) with a live reading of the
  line, and the full **New idea** form in all seven formats.
- **Review**: a session runner for every card type, with feedback after each
  answer and a summary at the end.

**More** holds Settings and **Open full app**, which is the web app in a
WebView, for everything else.

The app talks to the server's mobile API, `<server>/api/mobile/v1` (see
`docs/mobile-api.md`). Package `com.xtnl.app`, version 2.0 (versionCode 2), so
it installs over the v1 WebView shell in place.

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
| Other libraries | androidx.window 1.3.0, androidx.webkit 1.12.1, core-splashscreen 1.0.1, OkHttp 4.12.0, kotlinx.serialization 1.7.3 |

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
- the shapes of the API's responses.

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
    sends the same clientId, so the server records the action only once.
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
