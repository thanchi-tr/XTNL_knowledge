# XTNL for Android (WebView shell)

A thin Android app that shows the XTNL web app full screen. All features live
in the web app; the shell adds an app icon, launcher shortcuts, Back that
closes sheets, and a screen for when the server can't be reached.

## Build

Needs Android Studio's JDK and SDK (already on this PC):

```powershell
cd android
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
.\gradlew.bat assembleDebug
```

The APK is `app/build/outputs/apk/debug/app-debug.apk`.

The address the app opens first comes from `gradle.properties` (`xtnl.url`,
default `http://10.0.2.2:3000`, which is this PC's dev server as seen from the
Android emulator). Build for another address without editing the file:

```powershell
.\gradlew.bat assembleDebug -Pxtnl.url=https://your-app.vercel.app
```

## Install

- **Phone on USB** (USB debugging on):
  `adb install -r app/build/outputs/apk/debug/app-debug.apk`
- **Or** copy the APK to the phone and open it (allow "Install unknown apps"
  for your file manager once).

## Point it at a server

- **Emulator + `npm run dev` on this PC**: the default `http://10.0.2.2:3000`.
- **Phone on USB + `npm run dev`**: run `adb reverse tcp:3000 tcp:3000`, then
  set the address to `http://localhost:3000`.
- **The deployed app**: set the address to its `https://` URL.

To change the address: long-press the app icon → **Address**, or tap
**Change address** on the "Can't reach XTNL" screen. **Default** goes back to
the address the APK was built with. Plain `http://` is allowed only for
`10.0.2.2`, `localhost` and `127.0.0.1`.

## Launcher shortcuts

Long-press the icon: **Quick task** (opens Today with the capture sheet up),
**Review**, **New idea**, **Address**.

## Notes

- Folding, unfolding, rotating or plugging in a keyboard never reloads the
  page. Keyboard shortcuts work with a hardware keyboard (press `?` in the app).
- Links to other sites open in your browser.
- The debug APK is signed with this PC's debug key. A Play Store release needs
  its own signing key (`assembleRelease` with a `signingConfig`).
