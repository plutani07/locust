# Locust

Personal offline writing app. Single HTML file wrapped with Capacitor.

## Storage

Three things, in order of how often they run:

1. **IndexedDB** — the live store inside the app. Every autosave lands here.
2. **`Android/data/com.plutani.locust/files/Locust/locust-vault.json`** — a full
   copy of the library, rewritten a few seconds after you stop typing. This is
   `Directory.External`, which has never required a permission on any Android
   version. It survives crashes, app updates, and a corrupted database.
3. **Back up** in Profile — writes a timestamped copy and hands it to the
   Android share sheet, so it can land in Drive, Files, or anywhere else that
   outlives this install.

The app declares **no storage permissions**. It doesn't need any: everything in
1 and 2 lives inside the app's own sandbox, and 3 goes out through the share
sheet, which is granted per-share by the user.

### Why not the shared Documents folder

`Directory.Documents` and `Directory.ExternalStorage` are documented by
Capacitor as inaccessible on Android 11+. Writing there requires
`MANAGE_EXTERNAL_STORAGE` (All files access), which Google restricts on Play,
which Android's "Manage app if unused" silently revokes, and which forces the
app to ship a settings-hunting screen. Earlier builds did this. It worked, and
it was the wrong trade.

The only sanctioned way to write outside the sandbox without that permission is
the Storage Access Framework with a persisted tree grant, which no Capacitor
filesystem plugin currently exposes. The share sheet covers the same need with
code that exists today.

## Building

Push to `main`, or run the workflow from the Actions tab. The APK lands as the
`locust-apk` artifact.
