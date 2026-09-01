# Locust

Locust is being rebuilt as a native Android writing app.

## Current Android product

The new product lives in `native-android/` and uses Kotlin, Jetpack Compose, and Room/SQLite. It is **not** a Capacitor/WebView wrapper. Stories, chapters, and profile data are native app data. User-selected backups can use Android's document picker.

The existing `www/` HTML implementation and Capacitor files are retained as the original prototype/reference and are not used by the native Android build.

## Build an APK with GitHub

Every push that changes `native-android/` runs **Build Locust Native Android** in GitHub Actions. When it finishes, open the workflow run and download the `locust-native-debug-apk` artifact.

You can also run the workflow manually from the Actions tab.

## Development

Open `native-android/` as the Android Studio project. The app package is `com.locust.app`.

## Direction

The native rebuild is intended to make Locust feel like a real Android application: native persistence, native file picking, proper lifecycle behavior, and a foundation that can later support richer editing without browser-storage or Capacitor permission workarounds.
