/* Locust — importing data from anywhere else
   Three sources share one path:
     - the previous build's IndexedDB ('locust-local'), still in the WebView
       after an in-place update
     - the previous build's Locust/locust-vault.json in Android/data
     - a backup file the person picks
   Whatever arrives, images become files and stories become their own
   records. Nothing from the old locations is deleted. */

import { Disk } from './disk.js';
import { DB, Media } from './db.js';
import { S, normalise } from './model.js';
import { uid } from './util.js';

const DATA_IMG = /^data:image\//i;

/* One source image can appear as a cover, a banner and an avatar at once.
   Store it once per import and hand back the same key. */
let seen = new Map();

async function intoMedia(v, mediaMap){
  if (!v || typeof v !== 'string') return null;
  if (Media.keyFor(v)) return Media.keyFor(v);           // already one of ours
  if (seen.has(v)) return seen.get(v);
  const src = DATA_IMG.test(v) ? v : (mediaMap && mediaMap[v]) || null;
  if (!src) return null;
  if (src !== v && seen.has(src)) { seen.set(v, seen.get(src)); return seen.get(src); }
  let key = null;
  try { key = await Media.put(src); } catch { key = null; }
  if (key){ seen.set(v, key); if (src !== v) seen.set(src, key); }
  return key;
}

/* Inline images in a chapter body: data URLs out, media refs in. */
async function liftBody(body, mediaMap){
  if (!body || !/src="/.test(body)) return body || '';
  const srcs = [...new Set((body.match(/src="([^"]+)"/g) || []).map(m => m.slice(5, -1)))];
  let out = body;
  for (const src of srcs){
    if (Media.keyFor(src)) { out = out.split('src="' + src + '"').join('src="media:' + Media.keyFor(src) + '"'); continue; }
    const key = await intoMedia(src, mediaMap);
    out = out.split('src="' + src + '"').join(key ? 'src="media:' + key + '"' : 'src=""');
  }
  return out.replace(/<img src="">/g, '');
}

/* Returns how many stories landed. `data` is a vault/backup object or the
   old store's contents; `mediaMap` is the old store's key -> dataURL map. */
export async function absorb(data, mediaMap){
  if (!data || !Array.isArray(data.stories)) return 0;
  seen = new Map();
  let n = 0;
  for (const raw of data.stories){
    if (!raw || typeof raw !== 'object') continue;
    const s = normalise(raw);
    const covers = [];
    for (const c of s.covers){ const k = await intoMedia(c, mediaMap); if (k) covers.push(k); }
    s.covers = covers;
    for (const c of s.chapters){
      c.banner = c.banner ? await intoMedia(c.banner, mediaMap) : null;
      c.body = await liftBody(c.body, mediaMap);
    }
    for (const nt of s.notes) nt.body = await liftBody(nt.body, mediaMap);
    const list = s.deletedAt ? S.trash : S.stories;
    const other = s.deletedAt ? S.stories : S.trash;
    const oi = other.findIndex(x => x.id === s.id);
    if (oi >= 0) other.splice(oi, 1);
    const i = list.findIndex(x => x.id === s.id);
    if (i >= 0) list[i] = s; else list.push(s);
    DB.saveStory(s, 0);
    n++;
  }
  if (data.profile && typeof data.profile === 'object'){
    const p = data.profile;
    for (const k of ['name', 'handle', 'line', 'author', 'accent', 'since']) if (p[k] != null) S.profile[k] = p[k];
    if (p.avatar) S.profile.avatar = await intoMedia(p.avatar, mediaMap);
    if (p.banner) S.profile.banner = await intoMedia(p.banner, mediaMap);
    DB.saveProfile(S.profile);
  }
  if (data.stats && typeof data.stats === 'object'){
    for (const k in data.stats) S.stats[k] = Math.max(S.stats[k] || 0, data.stats[k] || 0);
    DB.saveStats(S.stats);
  }
  if (data.snaps && typeof data.snaps === 'object'){
    for (const cid in data.snaps) if (Array.isArray(data.snaps[cid]) && data.snaps[cid].length) DB.saveSnaps(cid, data.snaps[cid]);
  }
  if (data.prefs && typeof data.prefs === 'object'){
    const p = data.prefs;
    if (p.sort) S.prefs.sort = p.sort;
    if (p.swap === false) S.prefs.swap = false;
    if (p.rSize) S.prefs.rSize = p.rSize;
    if (p.rLH) S.prefs.rLH = p.rLH;
    if (p.lastBackup) S.prefs.lastBackup = Math.max(S.prefs.lastBackup || 0, p.lastBackup);
    DB.savePrefs(S.prefs);
  }
  await DB.flushAll();
  return n;
}

/* ---------- the previous build's IndexedDB ---------- */
async function hasOldDB(){
  try {
    if (indexedDB.databases){
      const list = await indexedDB.databases();
      return list.some(d => d.name === 'locust-local');
    }
  } catch {}
  return true;   // can't tell; opening will find out
}
async function readOldDB(){
  if (!(await hasOldDB())) return null;
  const db = await new Promise(res => {
    let created = false;
    const rq = indexedDB.open('locust-local');
    rq.onupgradeneeded = () => { created = true; };
    rq.onsuccess = e => res(created ? null : e.target.result);
    rq.onerror = () => res(null);
    rq.onblocked = () => res(null);
  });
  if (!db) { try { indexedDB.deleteDatabase('locust-local'); } catch {} return null; }
  if (!db.objectStoreNames.contains('stories')){ db.close(); return null; }
  const wrap = rq => new Promise((res, rej) => { rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
  try {
    const stories = (await wrap(db.transaction('stories', 'readonly').objectStore('stories').getAll())) || [];
    let prefs = {};
    if (db.objectStoreNames.contains('prefs')){
      const st = db.transaction('prefs', 'readonly').objectStore('prefs');
      const keys = await wrap(st.getAllKeys());
      const vals = await wrap(st.getAll());
      keys.forEach((k, i) => { prefs[k] = vals[i]; });
    }
    db.close();
    if (!stories.length) return null;
    const snaps = {};
    for (const k in prefs) if (k.startsWith('snap:')) snaps[k.slice(5)] = prefs[k];
    const rp = prefs.reader || {};
    return {
      data: {
        stories, profile: prefs.profile || null, stats: prefs.stats || null, snaps,
        prefs: { sort: prefs.sort, swap: prefs.swap, rSize: rp.size, rLH: rp.lh, lastBackup: prefs.lastBackup }
      },
      media: prefs.media || {}
    };
  } catch { try { db.close(); } catch {} return null; }
}

/* ---------- the previous build's vault file ---------- */
async function readOldVault(){
  const t = await Disk.readLegacyText('Locust/locust-vault.json');
  if (!t) return null;
  try {
    const d = JSON.parse(t);
    return d && Array.isArray(d.stories) && d.stories.length ? d : null;
  } catch { return null; }
}

/* Run once on a fresh install. Returns a short message, or ''. */
export async function migrateIfNeeded(){
  if (S.prefs.migrated) return '';
  let n = 0;
  const old = await readOldDB();
  if (old) n = await absorb(old.data, old.media);
  if (!n){
    const v = await readOldVault();
    if (v) n = await absorb(v, null);
  }
  S.prefs.migrated = true;
  DB.savePrefs(S.prefs);
  await DB.flushAll();
  return n ? `Brought over ${n} stor${n === 1 ? 'y' : 'ies'} from the previous version` : '';
}

/* Read a picked backup file. */
export function parseBackup(text){
  let d;
  try { d = JSON.parse(text); } catch { return null; }
  if (!d || !Array.isArray(d.stories)) return null;
  d.stories.forEach(s => { if (s && !s.id) s.id = uid(); });
  return d;
}
