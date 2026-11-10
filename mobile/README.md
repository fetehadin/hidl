# hidl mobile

The hidl phone app (Expo SDK 58, React Native 0.88). It's a **native shell**: native sign-in, then the full hidl
website inside the app, plus an **Android home-screen widget**. The account and the content are the same as on the
website, because they come from the same place. Native screens can replace web ones one at a time later.

## How it works

1. **Sign in (native, `src/screens/SignInScreen.tsx`):** "Continue with Google" (only shown once the site says the
   provider is on), or an email address and the 6-digit code from the sign-in email. The code step reads the
   clipboard when it opens and whenever the app comes back to the foreground, and submits a copied code by itself
   (plus a "Paste code" button). If Android closes the app while the person fetches the code from their mail app, the
   code step comes back on reopening (the address is remembered for 30 minutes). The app never talks to Supabase itself. The website's `/api/app/*` routes do every
   check (allowlist, codes, Google) and return a session (`src/auth.ts`).
   - **Google** runs in a secure browser tab. The session comes back through the `hidl://auth` redirect sealed with
     a one-off secret only this app holds (`sealForApp` in the web app's `src/lib/app-auth.ts`), so another app
     catching the redirect gets nothing usable.
2. **The journal (`src/screens/WebShell.tsx`):** the session is handed to the web view once (`/auth/native`, in the
   URL fragment). From then on the web view keeps and refreshes it itself. The app doesn't keep a copy, so two
   places never fight over one refresh token.
   - **Navigation:** Android's back button goes back through pages. Links to other sites open outside the app,
     and photo uploads can use the camera.
   - **Offline:** the app shows its own offline screen.
   - **Signing out:** signing out on the site brings back the native sign-in screen and unhooks the widget.
3. **Widget (`src/widget/`):** three entries in the widget picker, all the same "chunky" widget (teal frame, white
   card on a darker edge, Nunito numbers): `CountdownSmall` (2×2), `Countdown` (4×2, the original name so placed
   widgets keep working) and `CountdownLarge` (4×4, with a list). What's drawn follows the real size
   (`layoutFor` in `CountdownWidget.tsx`), so any of them stays readable when resized. Countdowns come from the
   account feed's `countdowns` list, soonest first, then ones that passed (last 7 days); ‹ › and the dots flip
   between them, redrawn from the saved copy so it's instant. Hidi's mood and the speech line follow the date
   (`mood.ts`: calm, excited, nervous, party, sleepy; tested in the web app's `tests/unit/widget-mood.test.ts`);
   the art is SVG strings (`hidi.ts`). Each widget keeps its own settings (`settings.ts`, `hidl.widget.<id>`):
   which countdowns to leave out, Light / Dark / Follow phone, and which one it's showing (by id). The setup screen
   (`WidgetSetup.tsx`) opens when a widget is added and from the launcher's widget settings. Tapping the card opens
   that countdown (`hidl://open?path=/countdown#c-<id>`, checked by `src/deep-link.ts`). Fonts are bundled from
   `assets/fonts` (OFL) and the picker previews are `assets/widget/preview-*.png`. Nothing animates or ticks
   between redraws: the library draws the widget as a picture. The app redraws it when you leave the app or save a countdown,
   and tells the page how many widgets are really placed (`getWidgetInfo`), so it never claims one that was removed.
   Widgets are built from the library's primitives only: no React Native views and **no fragments (`<>…</>`)**, which
   the library can't convert (the widget fails to draw). Right after sign-in the app asks `/api/app/widget` for the account's countdown feed,
   so nobody copies links or answers questions; this phone's widget replaces an older link (e.g. KWGT). Android
   redraws the widget every 30 minutes, headless. The time left is worked out on the phone from the countdown's date
   (`src/countdown-units.ts`, a copy of the website's), so it stays right offline and between refreshes.
   - **One tap from a countdown:** the page learns the app can place widgets from `window.hidlApp` (set by
     `WebShell.tsx` before the page loads). Its **Add to home screen** button calls `prepareAppWidget` (issues a
     fresh account feed link) and posts `{ type: "pin-widget", feedUrl }`. The app saves the link
     (same site only), then calls `requestPinWidget`, and answers with a `hidl-app` event. Launchers that don't allow
     apps to place widgets get the manual steps instead.
   - **Sharing and saving pictures:** the memories "Share as a picture" sheet can't use Web Share or downloads in a
     web view, so the page posts `{ type: "share-image" | "save-image", name, data }` (a base64 JPEG). Share writes it
     to the app's cache and opens Android's share sheet (`expo-sharing`); save opens Android's folder picker and
     writes it there (`expo-file-system`, no storage permission needed). Both live in `src/share-image.ts`. The page
     only offers them when `window.hidlApp.shareImage` / `saveImage` is true, which needs an APK built with those
     modules (0.4.0 from Nov 10, 2026 on); an older APK that gets this code over the air just doesn't announce them.

```
App.tsx                          loading → sign-in → journal
src/auth.ts                      calls to the website's /api/app/* routes
src/config.ts                    SITE_URL (EXPO_PUBLIC_SITE_URL per build in eas.json)
src/screens/SignInScreen.tsx     Google + email code sign-in
src/screens/WebShell.tsx         the journal in a web view
src/share-image.ts               shares or saves a picture the page made (memories)
src/widget/                      widget UI, headless renderer, connect/disconnect
src/feed.ts                      widget feed fetch + cache
```

## Commands

```bash
cd mobile
npm install
npm run typecheck
npm run doctor                    # expo-doctor: dependency/config checks

# Install on a phone. Widgets need a real build; Expo Go can't run them.
npm run build:apk                 # EAS cloud build → a downloadable .apk (needs a free Expo account: npx eas-cli login)
npm run android                   # or build locally (needs the Android SDK, plus a phone or emulator)
npm run update                    # ship a JS-only fix to installed apps over the air (EAS Update, "preview" channel)
                                  # Killed while bundling (low memory)? Bundle with one worker, then upload it:
                                  #   npx expo export --platform android --max-workers 1 --dump-sourcemap --dump-assetmap
                                  #   npx eas-cli@latest update --channel preview --environment preview \
                                  #     --platform android --skip-bundler --input-dir dist --message "..."
```

**Publishing a build.** People download the app from the website (`/download/android`, linked from `/install` and the
countdown widget dialog). After `npm run build:apk`, download the .apk from the EAS build page and copy it to the
server as `/opt/hidl/downloads/hidl.apk` (e.g. `scp hidl.apk deploy@169.58.96.52:/opt/hidl/downloads/`). No
restart needed.

**Over-the-air updates.** `expo-updates` checks for an update each time the app starts. `npm run update` reaches
every installed build with the same app `version` (`runtimeVersion` policy `appVersion`). Anything native (a new
package with native code, `app.json` plugins or permissions, the widget's size) needs a new APK: bump `version` in
`app.json`, build, and publish it as above.

`android/` and `ios/` are generated (`npx expo prebuild`) and gitignored. Change native behavior in `app.json`,
never by hand.

## Notes

- **Package id:** `app.hidl.mobile` (Android and iOS). Confirm it before the first Play Store upload. After that it
  can't change.
- **Widget layout:** the widget is native Android views, not React Native views. Only the library's primitives
  (`FlexWidget`, `TextWidget`, …) work inside it.
- **Site address:** the app follows `EXPO_PUBLIC_SITE_URL` in `eas.json` (`https://hidl.fetehadin.com`). Change it
  there and rebuild if the site moves.
- **Email codes:** these need the sign-in email to include `{{ .Token }}`. `supabase/templates/magic_link.html`
  does, but the production Supabase project must use that template (Authentication → Email Templates).
- **iPhone:** not built yet. It needs a SwiftUI WidgetKit extension (e.g. via `@bacons/apple-targets`) and an Apple
  Developer account.
