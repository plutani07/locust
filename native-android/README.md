# Locust Native Android

This directory contains the native Kotlin/Jetpack Compose rebuild of Locust. It replaces the Capacitor/WebView runtime as the Android product foundation.

Source-of-truth storage uses Room/SQLite for stories, chapters, and profile data. Android's Storage Access Framework is used for user-selected backup files.

Build with Android Studio/Gradle, or use `.github/workflows/android.yml`.
