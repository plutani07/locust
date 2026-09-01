/* Locust — model: state and the rules about stories. */

import { uid, dayKey, debounce, words, toast } from './util.js';
import { DB, Media } from './db.js';
import { chapterText } from './text.js';

export const S = {
  stories: [], trash: [],
  story: null, chapter: null, editKind: 'ch', readIdx: 0,
  profile: { name:'', handle:'', line:'', author:'', avatar:null, banner:null, accent:'iris', since:0 },
  prefs: { sort:'Recent', swap:true, rSize:17, rLH:1.85, lastBackup:0, migrated:false },
  stats: {}
};

/* ---------- entry kinds ----------
   Only 'chapter' entries take a number, so a prologue in front of chapter
   one doesn't push it to two. Author's notes never count toward totals. */
export const KINDS = {
  chapter:  { label:'Chapter',       short:'',    counts:true  },
  prologue: { label:'Prologue',      short:'PRO', counts:true  },
  epilogue: { label:'Epilogue',      short:'EPI', counts:true  },
  bio:      { label:'Bio',           short:'BIO', counts:true  },
  note:     { label:"Author's note", short:'A/N', counts:false }
};
export const KIND_ORDER = ['chapter', 'prologue', 'epilogue', 'bio', 'note'];
export const kindOf = c => (c && KINDS[c.kind]) ? c.kind : 'chapter';
export const kindCounts = c => KINDS[kindOf(c)].counts;

export const CATS = ['Fanfiction', 'Original', 'Reader-insert', 'Web novel', 'Short story', 'Poetry'];

export const ACCENTS = {
  iris:  { label:'Iris',  rgb:'168,85,247', deep:'124,58,237', soft:'#D8B4FE' },
  ember: { label:'Ember', rgb:'244,63,94',  deep:'190,18,60',  soft:'#FDA4AF' },
  ocean: { label:'Ocean', rgb:'56,189,248', deep:'2,132,199',  soft:'#A5DEFA' },
  jade:  { label:'Jade',  rgb:'52,211,153', deep:'5,150,105',  soft:'#A7F3D0' },
  amber: { label:'Amber', rgb:'251,191,36', deep:'217,119,6',  soft:'#FCD98B' },
  rose:  { label:'Rose',  rgb:'236,72,153', deep:'190,24,93',  soft:'#F9A8D4' }
};
export function applyAccent(key){
  const a = ACCENTS[key] || ACCENTS.iris;
  const r = document.documentElement.style;
  r.setProperty('--ac-rgb', a.rgb);
  r.setProperty('--ac-deep-rgb', a.deep);
  r.setProperty('--ac-soft', a.soft);
}

/* ---------- story helpers ---------- */
export function chapterNumbers(s){
  const map = {}; let n = 0;
  (s.chapters || []).forEach(c => { if (kindOf(c) === 'chapter') map[c.id] = ++n; });
  return map;
}
export function entryLabel(s, c, nums){
  const k = kindOf(c);
  if (k !== 'chapter') return KINDS[k].label;
  const n = (nums || chapterNumbers(s))[c.id];
  return n ? 'Chapter ' + n : 'Chapter';
}
export const storyWords = s => (s.chapters || []).reduce((n, c) => n + (kindCounts(c) ? words(chapterText(c)) : 0), 0);
export const chapterCount = s => (s.chapters || []).filter(c => kindOf(c) === 'chapter').length;
export const coversOf = s => (s && Array.isArray(s.covers)) ? s.covers : [];
export const storyById = id => S.stories.find(x => x.id === id) || null;

export const blankChapter = (title) => ({ id: uid(), kind:'chapter', title: title || 'Chapter 1', body:'', banner:null, updatedAt: Date.now() });

export function makeStory(){
  return {
    id: uid(), title:'', description:'', category:'Fanfiction', goal:null,
    tags:[], covers:[], placeholders:[{ k:'Y/N', v:'' }], notes:[],
    chapters:[blankChapter('Chapter 1')],
    readPos:{}, lastRead:0,
    createdAt: Date.now(), updatedAt: Date.now()
  };
}

/* Normalise anything loaded from disk or a backup so the rest of the app
   never has to check for missing fields. */
export function normalise(s){
  s.title = s.title || '';
  s.description = s.description || '';
  s.category = CATS.includes(s.category) ? s.category : 'Fanfiction';
  s.tags = Array.isArray(s.tags) ? s.tags : [];
  s.covers = Array.isArray(s.covers) ? s.covers.filter(Boolean) : (s.cover ? [s.cover] : []);
  delete s.cover;
  s.placeholders = Array.isArray(s.placeholders) ? s.placeholders : [];
  s.notes = Array.isArray(s.notes) ? s.notes : [];
  s.chapters = Array.isArray(s.chapters) && s.chapters.length ? s.chapters : [blankChapter('Chapter 1')];
  s.chapters.forEach(c => { c.id = c.id || uid(); c.body = c.body || ''; delete c.snaps; });
  s.notes.forEach(n => { n.id = n.id || uid(); n.body = n.body || ''; });
  s.readPos = s.readPos && typeof s.readPos === 'object' ? s.readPos : {};
  s.createdAt = s.createdAt || Date.now();
  s.updatedAt = s.updatedAt || s.createdAt;
  if (!(s.goal > 0)) s.goal = null;
  return s;
}

/* ---------- saving ---------- */
export function save(s){
  const st = s || S.story;
  if (!st) return;
  st.updatedAt = Date.now();
  DB.saveStory(st);
}
export function saveSoon(){ debounce('story', () => save(), 400); }
export function savePrefs(){ DB.savePrefs(S.prefs); }
export function saveProfile(){ DB.saveProfile(S.profile); }

export function addWords(n){
  if (!n || n <= 0) return;
  const k = dayKey();
  S.stats[k] = (S.stats[k] || 0) + n;
  DB.saveStats(S.stats);
}
export function streak(){
  let n = 0; const cur = new Date();
  if (!(S.stats[dayKey(cur)] > 0)) cur.setDate(cur.getDate() - 1);
  while (S.stats[dayKey(cur)] > 0){ n++; cur.setDate(cur.getDate() - 1); }
  return n;
}

/* ---------- images ---------- */
const ANIMATED = /^image\/(gif|apng|webp|avif)$/i;
const MAX_SRC = 30e6;

function fileToDataURL(file){
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = () => rej(new Error('read'));
    fr.onload = () => res(fr.result);
    fr.readAsDataURL(file);
  });
}
/* Decode straight from the file, draw once, free the bitmap. Animated
   formats are kept whole because resizing would kill the animation. */
export async function shrink(file, max){
  if (ANIMATED.test(file.type || '')){
    if (file.size > 6e6) throw new Error('too big');
    return await fileToDataURL(file);
  }
  if (file.size > MAX_SRC) throw new Error('too big');
  const cap = max || 760;
  let src = null, url = null;
  try {
    if (window.createImageBitmap) src = await createImageBitmap(file);
    else {
      url = URL.createObjectURL(file);
      src = await new Promise((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = () => rej(new Error('decode'));
        im.src = url;
      });
    }
    const iw = src.width || src.naturalWidth, ih = src.height || src.naturalHeight;
    if (!iw || !ih) throw new Error('decode');
    const scale = Math.min(1, cap / Math.max(iw, ih));
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(iw * scale));
    cv.height = Math.max(1, Math.round(ih * scale));
    cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height);
    const out = cv.toDataURL('image/jpeg', 0.84);
    cv.width = cv.height = 0;
    return out;
  } finally {
    if (src && src.close) src.close();
    if (url) URL.revokeObjectURL(url);
  }
}
/* Pick, shrink, store. Returns the media key or null. */
export async function storeImage(file, max){
  try {
    return await Media.put(await shrink(file, max));
  } catch (err) {
    toast(err && err.message === 'too big' ? 'That image is too large to store' : "Couldn't read that image");
    return null;
  }
}

/* ---------- cover stacks ---------- */
export function stackHTML(list){
  if (!list.length) return '<span class="blank">No cover</span>';
  if (list.length === 1) return `<img src="${Media.url(list[0])}" alt="" loading="lazy">`;
  return '<span class="stack">' + list.map((c, i) => `<img src="${Media.url(c)}" class="${i ? '' : 'live'}" alt="" loading="lazy">`).join('') + '</span>'
    + '<span class="pip">' + list.map((_, i) => `<i class="${i ? '' : 'live'}"></i>`).join('') + '</span>';
}
let coverTimer = 0, coverTick = 0;
export function runCovers(){
  clearInterval(coverTimer);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  coverTimer = setInterval(() => {
    if (document.hidden) return;
    coverTick++;
    document.querySelectorAll('.stack').forEach((st, n) => {
      const imgs = [...st.children];
      if (imgs.length < 2 || (coverTick + n) % 4) return;
      const cur = Math.max(0, imgs.findIndex(i => i.classList.contains('live')));
      const nxt = (cur + 1) % imgs.length;
      imgs[cur].classList.remove('live'); imgs[nxt].classList.add('live');
      const pips = st.parentElement.querySelector('.pip');
      if (pips) [...pips.children].forEach((p, i) => p.classList.toggle('live', i === nxt));
    });
  }, 1000);
}

export const penName = () => (S.profile.name || '').trim() || 'Anonymous';
export const handleOf = () => '@' + ((S.profile.handle || '').trim().replace(/^@/, '') || penName().toLowerCase().replace(/[^a-z0-9._-]/g, ''));
export const exportAuthor = () => (S.profile.author || '').trim() || penName();
