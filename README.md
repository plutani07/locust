# Locust — Android build

A real Capacitor app, so `@capacitor/filesystem` is compiled in and Android's
storage permission actually works. Your writing is saved to
`Documents/Locust/locust-vault.json`, which survives uninstalling the app.

## Route A — build in the cloud (no Android Studio)

1. Make a new GitHub repository and upload every file in this folder.
2. Open the **Actions** tab, pick **Build Locust APK**, press **Run workflow**.
3. Wait about 5 minutes. Download `locust-apk` from the finished run.
4. Unzip it and install `app-debug.apk` on your phone.

Everything is already configured. You need a GitHub account and nothing else.

## Route B — build on your own machine

Requires Node and Android Studio.

```bash
npm install
npx cap add android
npx cap sync android
npx cap open android      # then press Run in Android Studio
```

Or without opening the IDE:

```bash
cd android && ./gradlew assembleDebug
# APK lands in android/app/build/outputs/apk/debug/
```

## Updating the app later

Replace `www/index.html`, then re-run the workflow (Route A) or
`npx cap sync android && cd android && ./gradlew assembleDebug` (Route B).

## Changing the app identity

Edit `capacitor.config.json`. `appId` cannot change once you've published
to a store, so decide on it now if that matters.

## Icon

`resources/icon.png` is your logo at 512px. To generate every Android icon
size from it:

```bash
npm i -D @capacitor/assets
npx capacitor-assets generate --android
```
