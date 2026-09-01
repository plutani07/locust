/* Locust — editor
   Two-stage saving. Typing marks the chapter dirty and, a moment later,
   copies the DOM into the chapter object; the disk write happens on a
   slower timer after that. So a burst of keystrokes costs one write, and
   nothing is ever left only in the DOM. */

import { $, $$, esc, escRx, nfm, ago, icon, toast, sheet, closeSheet, confirmSheet, openMenu, renderSeg, copyPlain, copyRich, sleep, debounce, cancelDebounce } from '../util.js';
import { S, KINDS, KIND_ORDER, kindOf, kindCounts, entryLabel, save, addWords, storeImage } from '../model.js';
import { DB, Media } from '../db.js';
import { clean, toHTML, fromEditor, chapterText, textNodes, scratch } from '../text.js';
import { words } from '../util.js';
import { renderChapters, renderNotes } from './story.js';
import { renderShelf } from './library.js';
import { openReader } from './reader.js';

const ED = () => $('#editor');
export const editorOpen = () => $('#v-editor').classList.contains('on');

let openHTML = null;     // body as it was when the chapter opened
let snapped = false;     // has the opening version been filed yet
let snapAt = 0;
let edText = '';
let lastW = 0;
let dirty = false;
let lastRange = null;
let snaps = [];

/* ---------- open / close ---------- */
export function openEditor(kind, cid, findTerm){
  const pool = kind === 'note' ? (S.story.notes || []) : S.story.chapters;
  const c = pool.find(x => x.id === cid);
  if (!c) return;
  S.editKind = kind;
  S.chapter = c;

  $('#eTitle').value = c.title || '';
  ED().innerHTML = toHTML(c.body);
  $('#eLabel').textContent = kind === 'note' ? 'Note' : entryLabel(S.story, c);
  renderBanner();
  $('#escroll').scrollTop = 0;
  $('#fmtDock').classList.remove('on');
  $('#eAa').classList.remove('on');
  $('#efoot').classList.remove('on');
  $('#frPanel').classList.remove('on');
  $('#bubble').classList.remove('on');

  const html = ED().innerHTML;
  openHTML = html.length > 400000 ? null : html;   // too big to hold a copy of
  snapped = openHTML === null;
  snapAt = Date.now();
  edText = ED().textContent || '';
  lastW = words(edText);
  dirty = false;
  cancelDebounce('capture'); cancelDebounce('persist');
  mark(true);
  blankCheck(); syncFmt(); countNow();
  DB.loadSnaps(c.id).then(list => { snaps = list; });

  $('#v-editor').classList.add('on');
  $('#nav').classList.add('hide');
  if (findTerm){ $('#frPanel').classList.add('on'); $('#frFind').value = findTerm; frUpdate(); }
}

export function closeEditor(){
  $('#bubble').classList.remove('on');
  $('#efoot').classList.remove('on');
  $('#fmtDock').classList.remove('on');
  $('#frPanel').classList.remove('on');
  sprintStop();
  $('#v-editor').classList.remove('on');
  $('#nav').classList.remove('hide');
  S.chapter = null;
  renderChapters(); renderNotes(); renderShelf();
}

function mark(saved){
  $('#eSaved').className = 'saved' + (saved ? '' : ' dirty');
}

/* ---------- word count ---------- */
function countNow(){
  if (!editorOpen()) return;
  edText = ED().textContent || '';
  $('#eCount').textContent = `${nfm(words(edText))} words`;
  if (SP.on) sprintText();
}
const count = () => debounce('count', countNow, 350);

/* ---------- saving ---------- */
function capture(){
  if (!S.chapter) return;
  S.chapter.title = $('#eTitle').value;
  S.chapter.body = fromEditor(ED().innerHTML);
  S.chapter.updatedAt = Date.now();
  dirty = true;
}
function persist(){
  cancelDebounce('persist');
  if (!S.chapter) return;
  capture();
  if (!dirty) return;
  dirty = false;
  const w = words(edText);
  if (S.editKind === 'ch' && kindCounts(S.chapter) && w > lastW) addWords(w - lastW);
  lastW = w;
  if (snapped && Date.now() - snapAt > 600000){
    pushSnap(S.chapter.body, S.chapter.title);
    snapAt = Date.now();
  }
  save();
  mark(true);
}
export function flush(){
  cancelDebounce('capture');
  countNow();
  persist();
}
function touch(){
  if (!snapped && S.chapter){
    pushSnap(openHTML, S.chapter.title);
    snapped = true; snapAt = Date.now();
  }
  mark(false);
  debounce('capture', capture, 1200);
  debounce('persist', persist, 2000);
}

/* ---------- version history ---------- */
function pushSnap(bodyHTML, title){
  if (!S.chapter || !bodyHTML || bodyHTML.length > 400000) return;
  const txt = (scratch(bodyHTML).textContent || '').trim();
  if (!txt) return;
  const last = snaps[snaps.length - 1];
  if (last && last.body === bodyHTML) return;
  snaps.push({ t: Date.now(), title: title || '', body: bodyHTML, w: words(txt) });
  const heavy = bodyHTML.length > 120000;
  while (snaps.length > (heavy ? 2 : 6)) snaps.shift();
  DB.saveSnaps(S.chapter.id, snaps);
}
function historySheet(){
  flush();
  const list = snaps.slice().reverse();
  sheet(`<h3>Chapter history</h3>
    <p class="sub">Kept automatically: one version when you start editing, another every ten minutes after. Restoring files the current version first, so nothing is lost either way.</p>
    <div class="chlist">${list.length ? list.map((sn, i) => {
      const peek = esc((scratch(sn.body).textContent || '').trim().slice(0, 90));
      return `<div class="ch">
        <span class="body"><b>${ago(sn.t)} · ${nfm(sn.w)} words</b>
        <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${peek || '—'}</span></span>
        <button class="btn sm" data-restore="${i}">Restore</button>
      </div>`;
    }).join('') : '<p class="sub">No versions yet. They appear once you start editing.</p>'}</div>`);
  $$('#sheet [data-restore]').forEach(b => b.onclick = () => {
    const sn = list[+b.dataset.restore];
    pushSnap(fromEditor(ED().innerHTML), $('#eTitle').value);
    ED().innerHTML = toHTML(sn.body);
    if (sn.title) $('#eTitle').value = sn.title;
    blankCheck(); count(); touch();
    closeSheet(); toast('Version restored');
  });
}

/* ---------- banner ---------- */
function renderBanner(){
  const b = $('#eBanner');
  if (S.editKind === 'note'){ b.hidden = true; return; }
  b.hidden = false;
  const img = S.chapter.banner;
  b.classList.toggle('set', !!img);
  b.innerHTML = img ? `<img src="${Media.url(img)}" alt="">` : icon('image', 22);
}

/* ---------- formatting ---------- */
function keepRange(){
  const sel = getSelection();
  if (sel && sel.rangeCount && ED().contains(sel.anchorNode)) lastRange = sel.getRangeAt(0).cloneRange();
}
function restoreRange(){
  const sel = getSelection();
  if (lastRange && (!sel.rangeCount || !ED().contains(sel.anchorNode))){
    sel.removeAllRanges(); sel.addRange(lastRange);
  }
}
function collapseToEnd(){
  const sel = getSelection();
  if (!sel || !sel.rangeCount || sel.isCollapsed) return;
  const r = sel.getRangeAt(0).cloneRange();
  r.collapse(false);
  sel.removeAllRanges(); sel.addRange(r);
  lastRange = r.cloneRange();
}
function exec(cmd){
  ED().focus();
  restoreRange();
  try { document.execCommand(cmd, false, null); } catch {}
  keepRange(); syncFmt(); count(); touch();
}
function syncFmt(){
  $$('.bubble [data-cmd], .fmtdock [data-cmd]').forEach(b => {
    try { b.classList.toggle('on', document.queryCommandState(b.dataset.cmd)); } catch {}
  });
}
function showBubble(){
  const bub = $('#bubble'), sel = getSelection();
  if (!sel || sel.isCollapsed || !editorOpen() || !sel.rangeCount
      || !ED().contains(sel.anchorNode) || $('#scrim').classList.contains('on')){
    bub.classList.remove('on'); return;
  }
  const r = sel.getRangeAt(0).getBoundingClientRect();
  if (!r || (!r.width && !r.height)){ bub.classList.remove('on'); return; }
  bub.classList.add('on');
  const bw = bub.offsetWidth, bh = bub.offsetHeight;
  let x = Math.max(8, Math.min(r.left + r.width / 2 - bw / 2, innerWidth - bw - 8));
  let y = r.bottom + 12;                        // below the text, clear of the OS handles
  if (y + bh > innerHeight - 8) y = r.top - bh - 12;
  bub.style.left = x + 'px';
  bub.style.top = Math.max(8, y) + 'px';
}
function blankCheck(){
  const e = ED();
  const blank = e.childElementCount <= 1 && !e.textContent.trim() && !e.querySelector('img');
  e.classList.toggle('blank', blank);
}

/* the toolbar only exists while you're actually in the text */
function footShow(on){
  cancelDebounce('foot');
  if (on){ $('#efoot').classList.add('on'); return; }
  debounce('foot', () => {
    const a = document.activeElement;
    if (a === ED() || a === $('#eTitle')) return;
    if ($('#scrim').classList.contains('on') || $('#menuBack').classList.contains('on')) return;
    $('#efoot').classList.remove('on');
    $('#fmtDock').classList.remove('on');
    $('#eAa').classList.remove('on');
  }, 180);
}

/* ---------- caret tracking ----------
   Chrome stops scrolling to the caret inside a custom scroll container once
   the keyboard resizes the viewport, so keep it in view here. */
function caretRect(){
  const sel = getSelection();
  if (!sel || !sel.rangeCount || !ED().contains(sel.anchorNode)) return null;
  const r = sel.getRangeAt(0).cloneRange();
  r.collapse(false);
  let rect = r.getBoundingClientRect();
  if (!rect || (!rect.width && !rect.height)){
    let n = sel.anchorNode;
    if (n && n.nodeType === 3) n = n.parentElement;
    if (n && n.getBoundingClientRect) rect = n.getBoundingClientRect();
  }
  return (rect && (rect.width || rect.height || rect.top)) ? rect : null;
}
let caretRAF = 0, caretLast = 0;
function keepCaret(force){
  const now = Date.now();
  if (!force && now - caretLast < 110) return;   // forces layout; not every frame
  caretLast = now;
  cancelAnimationFrame(caretRAF);
  caretRAF = requestAnimationFrame(() => {
    if (!editorOpen()) return;
    const box = $('#escroll'), rect = caretRect();
    if (!box || !rect) return;
    const b = box.getBoundingClientRect();
    if (rect.bottom > b.bottom - 72) box.scrollTop += rect.bottom - (b.bottom - 72);
    else if (rect.top < b.top + 24) box.scrollTop -= (b.top + 24) - rect.top;
  });
}

/* ---------- find & replace ---------- */
function frCount(){
  const f = $('#frFind').value;
  if (!f) return 0;
  const rx = new RegExp(escRx(f), $('#frCase').checked ? 'g' : 'gi');
  return textNodes(ED()).reduce((n, t) => n + (t.nodeValue.match(rx) || []).length, 0);
}
function frUpdate(){
  const n = frCount();
  $('#frRes').textContent = $('#frFind').value ? (n ? `${n} match${n === 1 ? '' : 'es'}` : 'No matches') : '';
  $('#frGo').disabled = !n;
}
function frReplace(){
  const f = $('#frFind').value;
  if (!f) return 0;
  const rx = new RegExp(escRx(f), $('#frCase').checked ? 'g' : 'gi');
  const rep = $('#frRep').value;
  let n = 0;
  textNodes(ED()).forEach(t => {
    const nv = t.nodeValue.replace(rx, () => { n++; return rep; });
    if (nv !== t.nodeValue) t.nodeValue = nv;
  });
  return n;
}

/* ---------- sprint ---------- */
const SP = { on:false, end:0, base:0, timer:0 };
function sprintText(){
  const left = Math.max(0, SP.end - Date.now());
  const mm = Math.floor(left / 60000), ss = String(Math.floor(left / 1000) % 60).padStart(2, '0');
  const got = Math.max(0, words(ED().textContent || '') - SP.base);
  $('#spPill').textContent = `${mm}:${ss} · ${nfm(got)} w`;
}
export function sprintStop(){
  SP.on = false;
  clearInterval(SP.timer);
  $('#spPill').hidden = true;
}
function sprintTick(){
  if (!SP.on) return;
  if (Date.now() >= SP.end){
    const got = Math.max(0, words(ED().textContent || '') - SP.base);
    sprintStop();
    sheet(`<h3>Sprint done</h3>
      <p class="sub">${nfm(got)} word${got === 1 ? '' : 's'} in the tank. Shake your hands out.</p>
      <button class="btn pri block" id="spOk">Back to it</button>`);
    $('#spOk').onclick = closeSheet;
    return;
  }
  sprintText();
}
function sprintStart(min){
  SP.on = true;
  SP.end = Date.now() + min * 60000;
  SP.base = words(ED().textContent || '');
  clearInterval(SP.timer);
  SP.timer = setInterval(sprintTick, 1000);
  closeSheet();
  $('#spPill').hidden = false;
  sprintText();
  ED().focus();
}
function sprintSheet(){
  sheet(`<h3>Writing sprint</h3><p class="sub">Pick a length, then it's just you and the page. The clock keeps itself in the corner.</p>
    <div class="row">${[5, 10, 15, 25].map(m => `<button class="btn sm" style="flex:1" data-sp="${m}">${m} min</button>`).join('')}</div>`);
  $$('#sheet [data-sp]').forEach(b => b.onclick = () => sprintStart(+b.dataset.sp));
}

/* ---------- menu actions ---------- */
function typeSheet(){
  const c = S.chapter;
  sheet(`<h3>What is this?</h3>
    <p class="sub">Only chapters get numbered. An author's note is never counted in your word totals.</p>
    <div class="seg wrap" id="kindSeg"></div>`);
  renderSeg($('#kindSeg'), KIND_ORDER.map(k => KINDS[k].label), KINDS[kindOf(c)].label, label => {
    const key = KIND_ORDER.find(k => KINDS[k].label === label) || 'chapter';
    c.kind = key;
    c.updatedAt = Date.now();
    save();
    $('#eLabel').textContent = entryLabel(S.story, c);
    renderChapters();
    setTimeout(closeSheet, 240);
  });
}
function copySheet(){
  flush();
  const c = S.chapter;
  sheet(`<h3>Copy chapter</h3>
    <p class="sub">Puts “${esc(c.title || 'Untitled chapter')}” on your clipboard, ready to paste.</p>
    <div class="row">
      <button class="btn pri sm" style="flex:1" id="cpFmt">With formatting</button>
      <button class="btn sm" style="flex:1" id="cpPlain">Plain text</button>
    </div>
    <p class="hint">“With formatting” keeps bold and italics when pasting into Wattpad, Docs, or anywhere else that takes rich text.</p>`);
  $('#cpFmt').onclick = async () => {
    const ok = await copyRich(clean(ED().innerHTML, true), chapterText(c));
    closeSheet(); toast(ok ? 'Copied with formatting' : "Couldn't copy here");
  };
  $('#cpPlain').onclick = async () => {
    const ok = await copyPlain(chapterText(c));
    closeSheet(); toast(ok ? 'Copied as plain text' : "Couldn't copy here");
  };
}
function deleteCurrent(){
  const kind = S.editKind, obj = S.chapter;
  const noun = kind === 'note' ? 'note' : 'chapter';
  confirmSheet(`Delete this ${noun}?`, `"${obj.title || 'Untitled ' + noun}" and everything in it. This can't be undone.`, 'Delete', () => {
    if (kind === 'note') S.story.notes = S.story.notes.filter(x => x.id !== obj.id);
    else {
      S.story.chapters = S.story.chapters.filter(x => x.id !== obj.id);
      if (!S.story.chapters.length) S.story.chapters.push({ id: Date.now().toString(36), kind:'chapter', title:'Chapter 1', body:'', banner:null, updatedAt: Date.now() });
    }
    S.chapter = null;
    save(); DB.removeSnaps(obj.id);
    closeEditor(); toast('Deleted');
  });
}

/* ---------- wiring ---------- */
export function initEditor(){
  $('#eBack').innerHTML = icon('back');
  $('#eMore').innerHTML = icon('more');
  $('#eUndo').innerHTML = icon('undo');
  $('#eRedo').innerHTML = icon('redo');
  $('#eImg').innerHTML = icon('image');
  $$('[data-cmd="justifyLeft"]').forEach(b => b.innerHTML = icon('alignL', 16));
  $$('[data-cmd="justifyCenter"]').forEach(b => b.innerHTML = icon('alignC', 16));
  $$('[data-cmd="justifyRight"]').forEach(b => b.innerHTML = icon('alignR', 16));

  $('#eBack').onclick = () => { flush(); closeEditor(); };

  $$('.bubble [data-cmd], .fmtdock [data-cmd]').forEach(b => {
    b.addEventListener('mousedown', e => e.preventDefault());
    b.onclick = () => { exec(b.dataset.cmd); showBubble(); };
  });
  [['#eUndo', 'undo'], ['#eRedo', 'redo']].forEach(([sel, cmd]) => {
    const b = $(sel);
    b.addEventListener('mousedown', e => e.preventDefault());
    b.onclick = () => { exec(cmd); blankCheck(); };
  });
  $('#eAa').addEventListener('mousedown', e => e.preventDefault());
  $('#eAa').onclick = () => {
    const on = $('#fmtDock').classList.toggle('on');
    $('#eAa').classList.toggle('on', on);
  };

  [ED(), $('#eTitle')].forEach(el => {
    el.addEventListener('focus', () => footShow(true));
    el.addEventListener('blur', () => footShow(false));
  });
  $('#eTitle').addEventListener('input', () => {
    touch();
    if (S.editKind === 'note') renderNotes();
  });
  $('#eTitle').addEventListener('focus', () => setTimeout(() => { $('#escroll').scrollTop = 0; }, 60));

  ED().addEventListener('input', () => { blankCheck(); count(); touch(); keepCaret(); });
  ED().addEventListener('keyup', keepCaret);
  ED().addEventListener('focus', () => setTimeout(() => keepCaret(true), 260));
  ED().addEventListener('blur', persist);
  ED().addEventListener('keydown', e => {
    if (e.key === 'Enter') keepCaret(true);
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    const cmd = k === 'b' ? 'bold' : k === 'i' ? 'italic' : k === 'u' ? 'underline' : null;
    if (cmd){ e.preventDefault(); exec(cmd); }
  });
  ED().addEventListener('paste', e => {
    e.preventDefault();
    const cd = e.clipboardData;
    const html = cd.getData('text/html');
    const ins = html ? clean(html, true) : esc(cd.getData('text/plain')).replace(/\n/g, '<br>');
    try { document.execCommand('insertHTML', false, ins); } catch {}
    blankCheck(); count(); touch();
  });
  /* tap an image to select it, so backspace can delete it */
  ED().addEventListener('click', e => {
    if (e.target.tagName !== 'IMG') return;
    const r = document.createRange(); r.selectNode(e.target);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
  });

  document.addEventListener('selectionchange', () => {
    if (!editorOpen()) return;
    debounce('sel', () => {
      keepRange();
      const sel = getSelection();
      if ((sel && sel.rangeCount && !sel.isCollapsed) || $('#fmtDock').classList.contains('on')) syncFmt();
      showBubble();
    }, 40);
  });
  $('#escroll').addEventListener('scroll', showBubble, { passive:true });
  addEventListener('resize', showBubble);
  if (window.visualViewport) visualViewport.addEventListener('resize', () => setTimeout(() => keepCaret(true), 90));
  try { document.execCommand('styleWithCSS', false, false); } catch {}

  /* banner */
  $('#eBanner').onclick = () => {
    if (!S.chapter || S.editKind === 'note') return;
    if (!S.chapter.banner){ $('#bannerFile').click(); return; }
    sheet(`<h3>Header image</h3>
      <div class="row">
        <button class="btn sm" style="flex:1" id="bnSwap">Replace</button>
        <button class="btn danger sm" style="flex:1" id="bnDrop">Remove</button>
      </div>`);
    $('#bnSwap').onclick = () => { closeSheet(); $('#bannerFile').click(); };
    $('#bnDrop').onclick = async () => {
      const old = S.chapter.banner;
      S.chapter.banner = null;
      renderBanner(); save(); closeSheet();
      await Media.remove(old);
    };
  };
  $('#bannerFile').onchange = async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f || !S.chapter) return;
    const key = await storeImage(f, 1400);
    if (!key) return;
    S.chapter.banner = key;
    S.chapter.updatedAt = Date.now();
    renderBanner(); save(); toast('Header set');
  };

  /* inline images */
  $('#eImg').addEventListener('mousedown', e => e.preventDefault());
  $('#eImg').onclick = () => { footShow(true); $('#chImgFile').click(); };
  $('#chImgFile').onchange = async e => {
    const files = [...e.target.files]; e.target.value = '';
    if (!files.length) return;
    ED().focus(); restoreRange();
    /* insertHTML replaces whatever is selected. If a run of text happened to
       be highlighted — say you just bolded it — inserting a picture would
       delete it. Drop the caret at the end of the selection first. */
    collapseToEnd();
    let ok = 0;
    for (const f of files.slice(0, 6)){
      const key = await storeImage(f, 1100);
      if (!key) continue;
      try { document.execCommand('insertHTML', false, `<img src="${Media.url(key)}"><div><br></div>`); ok++; } catch {}
      await sleep(40);
    }
    keepRange(); blankCheck(); count(); touch(); footShow(true); keepCaret(true);
    if (ok) persist();
  };

  /* find & replace */
  $('#frFind').oninput = frUpdate;
  $('#frCase').onchange = frUpdate;
  $('#frDone').onclick = () => { $('#frPanel').classList.remove('on'); $('#frRes').textContent = ''; };
  $('#frGo').onclick = () => {
    const n = frReplace();
    blankCheck(); count(); flush(); frUpdate();
    toast(n ? `Replaced ${n}` : 'Nothing to replace');
  };

  /* sprint pill */
  $('#spPill').onclick = () => {
    const got = Math.max(0, words(ED().textContent || '') - SP.base);
    sheet(`<h3>Sprint running</h3><p class="sub">${nfm(got)} words so far. Keep going, or call it here.</p>
      <div class="row">
        <button class="btn pri sm" style="flex:1" id="spKeep">Keep writing</button>
        <button class="btn danger sm" style="flex:1" id="spStop">End it early</button>
      </div>`);
    $('#spKeep').onclick = closeSheet;
    $('#spStop').onclick = () => { sprintStop(); closeSheet(); };
  };

  $('#eMore').onclick = () => {
    const items = [];
    if (S.editKind !== 'note'){
      items.push({ label:'Read as a reader', fn: () => { flush(); openReader(S.story.chapters.indexOf(S.chapter)); } });
      items.push({ label:`Type: ${KINDS[kindOf(S.chapter)].label}`, fn: typeSheet });
    }
    items.push({ label:'Find and replace', fn: () => { $('#frPanel').classList.add('on'); frUpdate(); $('#frFind').focus(); } });
    items.push(SP.on ? { label:'End sprint', fn: () => $('#spPill').click() } : { label:'Start a sprint', fn: sprintSheet });
    items.push({ label:'Chapter history', fn: historySheet });
    items.push({ label:'Copy chapter', fn: copySheet });
    items.push({ label: S.editKind === 'note' ? 'Delete note' : 'Delete chapter', warn:true, fn: deleteCurrent });
    openMenu(items);
  };
}
