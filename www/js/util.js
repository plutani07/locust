/* Locust — small shared helpers. Nothing here knows about stories. */

export const $  = s => document.querySelector(s);
export const $$ = s => [...document.querySelectorAll(s)];

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

export const escRx = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const nfm = n => Number(n || 0).toLocaleString('en-US');

/* Word count: CJK is counted per character, everything else per run of
   letters/digits with internal apostrophes and hyphens. */
const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/g;
export function words(t){
  const s = String(t || '');
  if (!s) return 0;
  const cjk = (s.match(CJK) || []).length;
  const latin = (s.replace(CJK, ' ').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
  return cjk + latin;
}

export function ago(ts){
  if (!ts) return 'never';
  const d = Math.floor((Date.now() - ts) / 1000);
  if (d < 60) return 'just now';
  if (d < 3600) return Math.floor(d / 60) + 'm ago';
  if (d < 86400) return Math.floor(d / 3600) + 'h ago';
  if (d < 604800) return Math.floor(d / 86400) + 'd ago';
  return new Date(ts).toLocaleDateString(undefined, { month:'short', day:'numeric' });
}

export function dayKey(d){
  const x = d ? new Date(d) : new Date();
  return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
}

export const slug = t => (t || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'untitled';

export const plural = (n, one, many) => n === 1 ? one : (many || one + 's');

export const sleep = ms => new Promise(r => setTimeout(r, ms));

/* A trailing debounce keyed by name, so callers don't juggle timers. */
const timers = new Map();
export function debounce(key, fn, ms){
  clearTimeout(timers.get(key));
  timers.set(key, setTimeout(() => { timers.delete(key); fn(); }, ms));
}
export function cancelDebounce(key){ clearTimeout(timers.get(key)); timers.delete(key); }

/* ---------- toast ---------- */
let toastT = 0;
export function toast(msg){
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('on'), 2200);
}

/* ---------- bottom sheet ---------- */
export function sheet(html){
  $('#sheet').innerHTML = '<div class="grab"></div>' + html;
  $('#scrim').classList.add('on');
  return $('#sheet');
}
export function closeSheet(){ $('#scrim').classList.remove('on'); }
export const sheetOpen = () => $('#scrim').classList.contains('on');

export function confirmSheet(title, body, label, fn, keep){
  sheet(`<h3>${esc(title)}</h3><p class="sub">${esc(body)}</p>
    <div class="row">
      <button class="btn pri" style="flex:1" id="cfNo">${esc(keep || 'Keep it')}</button>
      <button class="btn danger" style="flex:1" id="cfYes">${esc(label)}</button>
    </div>`);
  $('#cfNo').onclick = closeSheet;
  $('#cfYes').onclick = () => { closeSheet(); fn(); };
}

/* Segmented control. */
export function renderSeg(el, opts, cur, pick){
  el.innerHTML = opts.map(o => `<button type="button" class="${o === cur ? 'on' : ''}" data-v="${esc(o)}">${esc(o)}</button>`).join('');
  el.querySelectorAll('button').forEach(b => b.onclick = () => {
    el.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    pick(b.dataset.v);
  });
}

/* ---------- context menu ---------- */
export function openMenu(items){
  const back = $('#menuBack');
  $('#menu').innerHTML = items.map((it, i) =>
    `<button class="${it.warn ? 'warn' : ''}" data-mi="${i}">${esc(it.label)}</button>`).join('');
  back.classList.add('on');
  $('#menu').querySelectorAll('[data-mi]').forEach(b => b.onclick = () => {
    back.classList.remove('on');
    items[+b.dataset.mi].fn();
  });
}
export function closeMenu(){ $('#menuBack').classList.remove('on'); }
export const menuOpen = () => $('#menuBack').classList.contains('on');

/* Tapping the dimmed area behind a sheet or a menu closes it, and so does
   Escape on a keyboard. Wired once at startup. */
export function initOverlays(){
  $('#scrim').addEventListener('click', e => { if (e.target.id === 'scrim') closeSheet(); });
  $('#menuBack').addEventListener('click', e => { if (e.target.id === 'menuBack') closeMenu(); });
  addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (menuOpen()) closeMenu();
    else if (sheetOpen()) closeSheet();
  });
}

/* ---------- clipboard ---------- */
export async function copyPlain(t){
  try { await navigator.clipboard.writeText(t); return true; } catch {}
  try {
    const ta = document.createElement('textarea');
    ta.value = t; ta.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove();
    return ok;
  } catch { return false; }
}
export async function copyRich(html, plain){
  try {
    if (navigator.clipboard && window.ClipboardItem){
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([html], { type:'text/html' }),
        'text/plain': new Blob([plain], { type:'text/plain' })
      })]);
      return true;
    }
  } catch {}
  try {
    const d = document.createElement('div');
    d.contentEditable = 'true';
    d.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    d.innerHTML = html; document.body.appendChild(d);
    const r = document.createRange(); r.selectNodeContents(d);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    const ok = document.execCommand('copy');
    sel.removeAllRanges(); d.remove();
    return ok;
  } catch { return false; }
}

/* ---------- icons ---------- */
const PATHS = {
  search:  '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  more:    '<circle cx="12" cy="5" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.7" fill="currentColor" stroke="none"/>',
  back:    '<path d="M15 18l-6-6 6-6"/>',
  up:      '<path d="M18 15l-6-6-6 6"/>',
  down:    '<path d="M6 9l6 6 6-6"/>',
  trash:   '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  copy:    '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 012-2h10"/>',
  x:       '<path d="M18 6L6 18M6 6l12 12"/>',
  image:   '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  undo:    '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/>',
  redo:    '<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 000 12h3"/>',
  speaker: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 010 6"/><path d="M18.5 6.5a8 8 0 010 11"/>',
  type:    '<path d="M4 7V4h16v3"/><path d="M12 4v16"/><path d="M9 20h6"/>',
  list:    '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  book:    '<path d="M4 19V6a2 2 0 012-2h12v15H6a2 2 0 00-2 2z"/><path d="M6 19h12"/>',
  desk:    '<path d="M3 9h18M3 9l2-4h14l2 4M5 9v11M19 9v11M9 20v-5h6v5"/>',
  person:  '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>',
  pen:     '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>',
  flame:   '<path d="M12 3c3 4 5 6 5 9a5 5 0 01-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-8z"/>',
  star:    '<path d="M12 3l2.6 5.6 6 .8-4.4 4.2 1.1 6L12 16.9 6.7 19.6l1.1-6L3.4 9.4l6-.8z"/>',
  shield:  '<path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z"/>',
  note:    '<path d="M5 3h9l5 5v13H5z"/><path d="M14 3v5h5"/>',
  alignL:  '<path d="M4 6h16M4 12h10M4 18h14"/>',
  alignC:  '<path d="M4 6h16M7 12h10M5 18h14"/>',
  alignR:  '<path d="M4 6h16M10 12h10M6 18h14"/>'
};
export function icon(name, size){
  const s = size || 18;
  return `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || ''}</svg>`;
}
