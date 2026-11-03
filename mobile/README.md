# hidl mobile

The companion phone app. For now it has one job: an **Android home-screen widget** that shows one hidl countdown.
The website stays the main app. This app reads the website's existing token feed (`GET /api/widget/countdown?token=…`),
so it needs no sign-in and no backend changes.

Expo SDK 58 · React Native 0.88 · [`react-native-android-widget`](https://saleksovski.github.io/react-native-android-widget/)
· npm (this folder has its own `package-lock.json`; the website uses pnpm).

## How it works

1. **Get the link:** on the website, open **Countdown**, tap **Widget** on a countdown, and copy the link (it's shown once).
2. **Connect:** in the app, tap **Paste link**. The app checks that it really is a hidl widget link (`parseFeedUrl`),
   loads it once, and saves the link and the answer in AsyncStorage.
3. **The widget:** Android redraws it in the background every 30 minutes (`updatePeriodMillis`, Android's minimum),
   when it's added or resized, and whenever the app connects a new link. Each redraw runs `widgetTaskHandler`
   headless (the app doesn't need to be open), fetches the feed, and renders `CountdownWidget`.
4. **Offline and revoked links:** when offline, the widget shows the last saved answer, marked "Offline". A revoked link
   or a server error shows a message instead, never stale data.

```
index.ts                         Registers the app and the widget task handler
App.tsx                          The connect screen, widget preview, "Add to home screen"
src/feed.ts                      Feed URL parsing, fetching, AsyncStorage cache, text formatting
src/widget/CountdownWidget.tsx   The widget UI (react-native-android-widget primitives only)
src/widget/task-handler.tsx      Headless render: fetch → cache → draw
src/theme.ts                     The website's palette
app.json                         Expo config; the widget is declared in the plugin block
eas.json                         Cloud build profiles
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
```

`android/` and `ios/` are generated (`npx expo prebuild`) and gitignored. Change native behavior in `app.json`,
never by hand.

## Notes

- **Package id:** `app.hidl.mobile` (Android and iOS). Confirm it before the first Play Store upload. After that it
  can't change.
- **Widget layout:** the widget is native Android views, not React Native views. Only the library's primitives
  (`FlexWidget`, `TextWidget`, …) work inside it.
- **iPhone:** not built yet. It needs a SwiftUI WidgetKit extension (e.g. via `@bacons/apple-targets`) and an Apple
  Developer account.
