/* Locust — DB
   Sits on Disk. Callers hand it objects; it decides what to write and when.

   - Each story is its own file. Editing chapter three of one story rewrites
     one file, never the whole library.
   - Writes are debounced per file and run one at a time, so a burst of
     keystrokes becomes a single write and the filesystem is never hammered.
   - Images are never inside JSON. They're written once as files and
     referenced by key; the WebView loads them straight off disk. */

import { Disk, mimeOf } from './disk.js';
import { debounce, cancelDebounce } from './util.js';

const pending = new Map();      // path -> () => string
let chain = Promise.resolve();  // serialises every disk write
let lastError = null;
const errorListeners = [];

function run(fn){
  chain = chain.then(fn).catch(e => {
    lastError = String(e && e.message || e);
    errorListeners.forEach(l => { try { l(lastError); } catch {} });
  });
  return chain;
}

function schedule(path, produce, ms){
  pending.set(path, produce);
  debounce('w:' + path, () => flushPath(path), ms);
}
function flushPath(path){
  cancelDebounce('w:' + path);
  const produce = pending.get(path);
  if (!produce) return chain;
  pending.delete(path);
  let text;
  try { text = produce(); } catch (e) { lastError = String(e); return chain; }
  return run(() => Disk.writeText(path, text));
}
async function flushAll(){
  for (const path of [...pending.keys()]) flushPath(path);
  await chain;
}

async function readJSON(path){
  const t = await Disk.readText(path);
  if (!t) return null;
  try { return JSON.parse(t); } catch { return null; }
}

/* ---------- media ---------- */
const mediaUrl = new Map();   // key -> displayable URL
const mediaKey = new Map();   // URL -> key
const REF = /^media:([A-Za-z0-9._-]+)$/;

export const Media = {
  async index(){
    const names = await Disk.list('media');
    for (const n of names){
      const u = Disk.kind === 'fs' ? Disk.url('media/' + n) : await Disk.resolveUrl('media/' + n);
      if (u){ mediaUrl.set(n, u); mediaKey.set(u, n); }
    }
  },
  keys(){ return [...mediaUrl.keys()]; },
  url(ref){
    if (!ref) return '';
    if (ref.startsWith('data:')) return ref;          // transient, not yet stored
    const m = REF.exec(ref);
    return mediaUrl.get(m ? m[1] : ref) || '';
  },
  /* Turn whatever an <img src> holds back into a stored key, or null. */
  keyFor(src){
    if (!src) return null;
    const m = REF.exec(src);
    if (m) return m[1];
    if (mediaUrl.has(src)) return src;
    return mediaKey.get(src) || null;
  },
  /* Store a data: URL as a file. Returns the key. */
  async put(dataURL){
    const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(dataURL || '');
    if (!m) throw new Error('not an image');
    const ext = ({ 'image/jpeg':'jpg', 'image/png':'png', 'image/gif':'gif', 'image/webp':'webp', 'image/avif':'avif' })[m[1].toLowerCase()] || 'img';
    const key = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + '.' + ext;
    await run(() => Disk.writeBase64('media/' + key, m[2]));
    const u = Disk.kind === 'fs' ? Disk.url('media/' + key) : await Disk.resolveUrl('media/' + key);
    if (u){ mediaUrl.set(key, u); mediaKey.set(u, key); }
    return key;
  },
  async dataURL(key){
    const k = Media.keyFor(key) || key;
    const b64 = await Disk.readBase64('media/' + k);
    return b64 ? `data:${mimeOf(k)};base64,${b64}` : null;
  },
  async remove(key){
    const k = Media.keyFor(key) || key;
    if (!k) return;
    const u = mediaUrl.get(k);
    mediaUrl.delete(k); if (u) mediaKey.delete(u);
    await run(() => Disk.remove('media/' + k));
  }
};

/* ---------- the store ---------- */
export const DB = {
  get lastError(){ return lastError; },
  onError(fn){ errorListeners.push(fn); },

  async init(){
    await Disk.init();
    await Media.index();
  },

  async loadStories(){
    const names = (await Disk.list('stories')).filter(n => n.endsWith('.json'));
    const out = [];
    for (const n of names){
      const s = await readJSON('stories/' + n);
      if (s && s.id) out.push(s);
    }
    return out;
  },
  saveStory(s, ms){ schedule('stories/' + s.id + '.json', () => JSON.stringify(s), ms ?? 600); },
  flushStory(s){ return flushPath('stories/' + s.id + '.json'); },
  async deleteStory(id){
    pending.delete('stories/' + id + '.json');
    cancelDebounce('w:stories/' + id + '.json');
    await run(() => Disk.remove('stories/' + id + '.json'));
  },

  loadProfile(){ return readJSON('profile.json'); },
  saveProfile(p){ schedule('profile.json', () => JSON.stringify(p), 500); },
  loadStats(){ return readJSON('stats.json'); },
  saveStats(st){ schedule('stats.json', () => JSON.stringify(st), 800); },
  loadPrefs(){ return readJSON('prefs.json'); },
  savePrefs(p){ schedule('prefs.json', () => JSON.stringify(p), 300); },

  async loadSnaps(cid){ return (await readJSON('snaps/' + cid + '.json')) || []; },
  saveSnaps(cid, list){ schedule('snaps/' + cid + '.json', () => JSON.stringify(list), 1500); },
  async removeSnaps(cid){ await run(() => Disk.remove('snaps/' + cid + '.json')); },

  async writeBackup(name, text){
    await run(() => Disk.writeText('backups/' + name, text));
    return Disk.nativeUri('backups/' + name);
  },

  flushAll,
  /* Remove image files nothing references any more. Cheap: one string scan. */
  async collectGarbage(stories, profile){
    const seen = new Set();
    const scan = obj => {
      const t = JSON.stringify(obj);
      const rx = /m[a-z0-9]{6,}\.(?:jpg|png|gif|webp|avif|img)/g;
      let m; while ((m = rx.exec(t))) seen.add(m[0]);
    };
    stories.forEach(scan); scan(profile || {});
    const fresh = Date.now() - 600000;   // never touch anything under ten minutes old
    for (const k of Media.keys()){
      if (seen.has(k)) continue;
      const ts = parseInt(k.slice(1, 9), 36);
      if (ts > fresh) continue;
      await Media.remove(k);
    }
  }
};
