# Locust

A local writing desk. Your stories live on your phone and nowhere else.

## Where your work is kept

Everything Locust knows sits in one folder:

```
Android/data/com.plutani.locust/files/locust/
  stories/<id>.json      one file per story
  media/                 covers, chapter headers, avatars, inline pictures
  snaps/<chapterId>.json chapter version history
  profile.json
  stats.json             words written per day
  prefs.json
  backups/               copies made by "Export backup"
```

That folder **is** the database. There is no sync step, no toggle, no
"turn on device storage" screen — a few seconds after you stop typing, the
chapter you changed is on disk. Nothing else is rewritten.

`Directory.External` is the app's own space on shared storage. It has never
required a permission on any Android version, so there is nothing to grant
and nothing the system can revoke later. The app declares **no storage
permissions at all.**

The one thing this folder does not survive is uninstalling the app — Android
removes it along with everything else. That is what **Export backup** is for:
it writes a single timestamped file and hands it to the share sheet, so a copy
can land in Drive, Files, or anywhere that outlives this install.

### Why it's laid out this way

Two decisions do most of the work:

- **One file per story.** Editing chapter three rewrites one story file, not
  the whole library. Writes are debounced and run one at a time, so a burst of
  typing becomes a single write.
- **Pictures are files, not text.** Images are stored under `media/` and
  referenced by a short key. They are never base64'd inside a story, so an
  autosave never copies megabytes of image data to change one word.

## Coming from the previous version

The first launch looks for the old build's data by itself — first its
IndexedDB store, then `Locust/locust-vault.json` — and brings across stories,
chapters, notes, tags, placeholders, covers, chapter headers, inline images,
version history, your profile, accent, stats, and the trash. Embedded images
become files on the way in. Nothing in the old locations is deleted, and the
import runs once.

## Building

Push to `main`, or run the workflow from the Actions tab. The APK arrives as
the `locust-apk` artifact.

Set the `LOCUST_KEYSTORE` secret (a base64 debug keystore) so every build is
signed with the same key and installs over the previous one. Without it each
build gets a throwaway key and Android will refuse to update in place.

## Working on it

The app is plain ES modules — no build step, no bundler.

```
python3 -m http.server 8000    # from www/, then open localhost:8000
```

In a browser the storage layer is backed by IndexedDB behind the same
interface, so every screen works for development. Inside the APK the same
interface writes real files. Only `www/js/disk.js` knows the difference.

```
www/
  index.html      the shell: four views plus the editor and reader overlays
  app.css
  js/
    disk.js       the only place bytes are read or written
    db.js         per-file writes, debounced; media as files
    text.js       the chapter HTML dialect: sanitising, plain text, markdown
    model.js      state and the rules about stories
    migrate.js    importing from the old build and from backups
    main.js       boot
    views/        library, story, editor, reader, desk, profile, exports, nav
```

Typography loads from Google Fonts but never blocks: with no network the app
falls back to Georgia and the system sans and works exactly the same. To make
it fully self-contained, drop the three families into `www/fonts/` and swap the
`<link>` in `index.html` for local `@font-face` rules.

## The opening

There are two splashes, and they're meant to look like one.

1. **Native**, before the WebView exists. Android paints the activity's window
   background on the very first frame, so the build points that at the splash
   drawable — otherwise you get a white flash. It's a still image of the mark
   on `#08090F`, from `resources/splash.png`. Android only accepts a still
   here; a GIF or video can't run at this layer.
2. **Web**, once `index.html` paints: the mark settles, a light sweeps through
   it, the wordmark opens beneath. `main.js` hides the native one on the first
   painted frame, so there's no gap and no overlap.

The light sweep uses `logo.png` as a CSS mask, so it follows the mark's real
edges — redraw the logo and the animation restyles itself.

### Using your own animation

Replace the contents of `#splash` in `index.html` with your file and set
`data-hold` to its length in milliseconds:

```html
<div id="splash" data-hold="2000">
  <video src="splash.webm" autoplay muted playsinline></video>
</div>
```

GIF, MP4, WebM, Lottie — anything the WebView can play. Make
`resources/splash.png` the first frame of that animation and the handoff from
the native splash is invisible.

## Artwork

- `resources/icon.png` — the launcher icon. The build turns this into every
  Android density, so the mark is kept inside the middle 60% to survive the
  adaptive-icon mask.
- `www/logo.png` — the mark used inside the app: the header, the empty shelf,
  and the splash. Transparent, so it sits on any surface. It also doubles as
  the mask for the splash's light sweep, so replacing this one file restyles
  the opening animation with it.

Both are baked into the APK, so changing either means a rebuild — which is
just a push.
