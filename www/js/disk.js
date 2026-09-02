/* Locust — Disk
   Everything Locust keeps lives in one folder tree:

     Android/data/com.plutani.locust/files/locust/
       stories/<id>.json      one file per story, no image bytes inside
       media/<key>            covers, banners, avatar, inline images
       snaps/<chapterId>.json chapter version history, loaded on demand
       profile.json
       stats.json             words written per day
       prefs.json             sort order, reader size, small switches
       backups/               timestamped copies made by "Export backup"

   Directory.External is the app's own space on shared storage. It needs no
   permission on any Android version, so there is nothing to grant and
   nothing the system can revoke. Uninstalling the app removes it, which is
   what the backup export is for.

   Outside the APK (a browser tab), the same interface is backed by
   IndexedDB so the app runs identically for development. */

const ROOT = 'locust';
const DIR  = 'EXTERNAL';

function capFS(){
  const C = window.Capacitor;
  return (C && C.Plugins && C.Plugins.Filesystem) || null;
}
export function capPlugin(name){
  const C = window.Capacitor;
  return (C && C.Plugins && C.Plugins[name]) || null;
}

/* ------------------------------------------------------------------ */
/* Capacitor Filesystem backend                                        */
/* ------------------------------------------------------------------ */
function fsBackend(fs){
  let baseUri = null;          // file:///storage/emulated/0/Android/data/.../files/locust
  const full = p => ROOT + '/' + p;

  async function ensureDir(p){
    try { await fs.mkdir({ path: full(p), directory: DIR, recursive: true }); } catch {}
  }
  function toSrc(uri){
    const C = window.Capacitor;
    return C && typeof C.convertFileSrc === 'function' ? C.convertFileSrc(uri) : uri;
  }

  return {
    kind: 'fs',
    async init(){
      await ensureDir('stories'); await ensureDir('media'); await ensureDir('snaps');
      try { baseUri = (await fs.getUri({ path: ROOT, directory: DIR })).uri || null; } catch { baseUri = null; }
    },
    async readText(p){
      try {
        const r = await fs.readFile({ path: full(p), directory: DIR, encoding: 'utf8' });
        return typeof r.data === 'string' ? r.data : String(r.data ?? '');
      } catch { return null; }
    },
    async writeText(p, text){
      await fs.writeFile({ path: full(p), directory: DIR, data: text, encoding: 'utf8', recursive: true });
    },
    async readBase64(p){
      try {
        const r = await fs.readFile({ path: full(p), directory: DIR });
        if (typeof r.data === 'string') return r.data;
        if (r.data instanceof Blob) return await blobToB64(r.data);
        return null;
      } catch { return null; }
    },
    async writeBase64(p, b64){
      await fs.writeFile({ path: full(p), directory: DIR, data: b64, recursive: true });
    },
    async list(dir){
      try {
        const r = await fs.readdir({ path: full(dir), directory: DIR });
        return (r.files || []).map(f => typeof f === 'string' ? f : f.name).filter(Boolean);
      } catch { return []; }
    },
    async remove(p){
      try { await fs.deleteFile({ path: full(p), directory: DIR }); } catch {}
    },
    async exists(p){
      try { await fs.stat({ path: full(p), directory: DIR }); return true; } catch { return false; }
    },
    url(p){
      if (!baseUri) return '';
      return toSrc(baseUri.replace(/\/$/, '') + '/' + p);
    },
    async nativeUri(p){
      try { return (await fs.getUri({ path: full(p), directory: DIR })).uri || ''; } catch { return ''; }
    },
    /* Anything left by earlier builds, outside the locust/ tree. */
    async readLegacyText(path){
      try {
        const r = await fs.readFile({ path, directory: DIR, encoding: 'utf8' });
        return typeof r.data === 'string' ? r.data : String(r.data ?? '');
      } catch { return null; }
    }
  };
}

/* ------------------------------------------------------------------ */
/* IndexedDB backend (browser development / preview)                    */
/* ------------------------------------------------------------------ */
function idbBackend(){
  let db = null;
  const urls = new Map();
  const tx = (m) => db.transaction('files', m).objectStore('files');
  const wrap = rq => new Promise((res, rej) => { rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });

  return {
    kind: 'idb',
    async init(){
      db = await new Promise((res, rej) => {
        const rq = indexedDB.open('locust-disk', 1);
        rq.onupgradeneeded = e => { e.target.result.createObjectStore('files'); };
        rq.onsuccess = e => res(e.target.result);
        rq.onerror = () => rej(rq.error);
      });
    },
    async readText(p){
      try { const v = await wrap(tx('readonly').get(p)); return typeof v === 'string' ? v : null; }
      catch { return null; }
    },
    async writeText(p, text){ await wrap(tx('readwrite').put(text, p)); },
    async readBase64(p){
      try {
        const v = await wrap(tx('readonly').get(p));
        return v instanceof Blob ? await blobToB64(v) : null;
      } catch { return null; }
    },
    async writeBase64(p, b64){
      const blob = b64ToBlob(b64, mimeOf(p));
      await wrap(tx('readwrite').put(blob, p));
      if (urls.has(p)){ URL.revokeObjectURL(urls.get(p)); urls.delete(p); }
    },
    async list(dir){
      const pre = dir.replace(/\/$/, '') + '/';
      try {
        const keys = await wrap(tx('readonly').getAllKeys(IDBKeyRange.bound(pre, pre + '\uffff')));
        return keys.map(k => k.slice(pre.length)).filter(k => k && !k.includes('/'));
      } catch { return []; }
    },
    async remove(p){
      try { await wrap(tx('readwrite').delete(p)); } catch {}
      if (urls.has(p)){ URL.revokeObjectURL(urls.get(p)); urls.delete(p); }
    },
    async exists(p){
      try { return (await wrap(tx('readonly').getKey(p))) !== undefined; } catch { return false; }
    },
    url(p){ return urls.get(p) || ''; },
    /* Object URLs have to be made from the blob; done once per key. */
    async resolveUrl(p){
      if (urls.has(p)) return urls.get(p);
      try {
        const v = await wrap(tx('readonly').get(p));
        if (!(v instanceof Blob)) return '';
        const u = URL.createObjectURL(v);
        urls.set(p, u);
        return u;
      } catch { return ''; }
    },
    async nativeUri(){ return ''; },
    async readLegacyText(){ return null; }
  };
}

/* ------------------------------------------------------------------ */
function blobToB64(blob){
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = () => rej(new Error('read'));
    fr.onload = () => res(String(fr.result).split(',')[1] || '');
    fr.readAsDataURL(blob);
  });
}
export function b64ToBlob(b64, type){
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Blob([u8], { type: type || 'application/octet-stream' });
}
export function b64ToU8(b64){
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}
export function mimeOf(p){
  const ext = (p.split('.').pop() || '').toLowerCase();
  return { jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', gif:'image/gif', webp:'image/webp', avif:'image/avif', json:'application/json' }[ext] || 'application/octet-stream';
}

export const Disk = capFS() ? fsBackend(capFS()) : idbBackend();
export const inApp = () => Disk.kind === 'fs';
