# HTML -> Native Kotlin conversion map

The original `www/index.html` remains in the repository as the prototype/reference implementation. The native app does not depend on it at runtime.

Prototype concepts carried into native code include Library, Desk, Profile, Stories, Chapters, a writing editor, autosave, trash/delete behavior, profile data, and JSON backup.

The old browser/Capacitor storage detection is intentionally removed. Native Android persistence is handled by Room/SQLite, and backup/import can use Android's document picker.

The current first native pass uses a plain-text Compose editor. Rich-text/contenteditable behavior from the HTML prototype is the next major feature layer.
