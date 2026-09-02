/* Locust — story page */
import { $, $$, esc, nfm, ago, uid, icon, toast, confirmSheet, openMenu, renderSeg, sleep } from '../util.js';
import { S, CATS, KINDS, kindOf, kindCounts, chapterNumbers, entryLabel, storyWords, chapterCount, coversOf, stackHTML, runCovers, blankChapter, save, saveSoon, storeImage, storyById } from '../model.js';
import { Media, DB } from '../db.js';
import { chapterWords } from '../text.js';
import { show, setNav, goLibrary } from './nav.js';
import { openEditor } from './editor.js';
import { openReader } from './reader.js';
import { exportMd, exportEpub } from './exports.js';

export function openStory(id){
  const s = storyById(id);
  if (!s) return;
  S.story = s;
  $('#crumbTitle').textContent = s.title || 'Untitled story';
  $('#sTitle').value = s.title || '';
  $('#sDesc').value = s.description || '';
  renderSeg($('#sCat'), CATS, s.category || 'Fanfiction', v => { S.story.category = v; saveSoon(); });
  $('#sGoal').value = s.goal > 0 ? s.goal : '';
  renderCover(); renderTags(); renderPh(); renderNotes(); renderChapters();
  show('story'); setNav('library');
}

/* ---------- cover ---------- */
function renderCover(){
  const s = S.story, list = coversOf(s);
  $('#coverArt').innerHTML = stackHTML(list);
  $('#thumbs').innerHTML = list.map((c, i) => `
    <div class="thumb${i ? '' : ' first'}" data-i="${i}">
      <img src="${Media.url(c)}" alt="">
      <button class="x" data-rm="${i}" aria-label="Remove cover ${i + 1}">×</button>
    </div>`).join('') + `<button class="thumb add" id="addCover" aria-label="Add cover">+</button>`;
  $('#coverHint').textContent = list.length > 1
    ? `${list.length} covers. Tap one to make it the first frame.`
    : (list.length ? 'Add another image to make the card cycle.' : '');
  $('#addCover').onclick = () => $('#coverFile').click();
  $$('#thumbs [data-rm]').forEach(b => b.onclick = async e => {
    e.stopPropagation();
    const [key] = s.covers.splice(+b.dataset.rm, 1);
    renderCover(); save(); await Media.remove(key);
  });
  $$('#thumbs .thumb[data-i]').forEach(t => t.onclick = () => {
    const i = +t.dataset.i;
    if (!i) return;
    s.covers.unshift(s.covers.splice(i, 1)[0]);
    renderCover(); save(); toast('Moved to front');
  });
  runCovers();
}
async function addCovers(files){
  const s = S.story;
  s.covers = s.covers || [];
  const room = Math.max(0, 8 - s.covers.length);
  if (!room){ toast('Eight covers is the limit'); return; }
  if (files.length > room) toast(`Adding ${room} — eight is the limit`);
  let ok = 0;
  for (const f of files.slice(0, room)){
    const key = await storeImage(f, 760);
    if (!key) continue;
    s.covers.push(key); ok++;
    renderCover(); save();
    await sleep(50);
  }
  if (ok) toast(`${ok} cover${ok === 1 ? '' : 's'} added`);
}

/* ---------- tags ---------- */
function renderTags(){
  const w = $('#tagWrap'), inp = $('#tagInput');
  $$('#tagWrap .chip').forEach(c => c.remove());
  (S.story.tags || []).forEach((t, i) => {
    const c = document.createElement('span');
    c.className = 'chip';
    c.innerHTML = `${esc(t)} <button aria-label="Remove ${esc(t)}">×</button>`;
    c.querySelector('button').onclick = () => { S.story.tags.splice(i, 1); renderTags(); save(); };
    w.insertBefore(c, inp);
  });
}

/* ---------- placeholders ---------- */
function renderPh(){
  const box = $('#phList');
  const ph = S.story.placeholders;
  box.innerHTML = ph.map((p, i) => `
    <div class="two">
      <div class="inp"><input value="${esc(p.k)}" data-ph="k" data-i="${i}" placeholder="Y/N" autocomplete="off"></div>
      <div class="inp"><input value="${esc(p.v)}" data-ph="v" data-i="${i}" placeholder="Their name" autocomplete="off"></div>
      <button class="icb warn" data-phdel="${i}" aria-label="Remove">${icon('x')}</button>
    </div>`).join('') || '<p class="sub" style="margin-bottom:10px">No placeholders yet.</p>';
  $$('#phList [data-ph]').forEach(el => el.oninput = () => { ph[+el.dataset.i][el.dataset.ph] = el.value; saveSoon(); });
  $$('#phList [data-phdel]').forEach(el => el.onclick = () => { ph.splice(+el.dataset.phdel, 1); renderPh(); save(); });
}

/* ---------- notes ---------- */
export function renderNotes(){
  if (!S.story) return;
  const s = S.story, box = $('#noteList');
  const notes = (s.notes || []).slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  box.innerHTML = notes.length ? notes.map((n, i) => `
    <div class="ch" style="animation-delay:${Math.min(i, 8) * 30}ms">
      <button class="body" data-note="${n.id}">
        <b>${esc(n.title || 'Untitled note')}</b>
        <span>${nfm(chapterWords(n))} words · ${ago(n.updatedAt)}</span>
      </button>
      <div class="acts"><button class="icb warn" data-ndel="${n.id}" aria-label="Delete note">${icon('trash', 16)}</button></div>
    </div>`).join('') : '<p class="sub">Nothing here yet.</p>';
  $$('#noteList [data-note]').forEach(b => b.onclick = () => openEditor('note', b.dataset.note));
  $$('#noteList [data-ndel]').forEach(b => b.onclick = () => {
    const n = s.notes.find(x => x.id === b.dataset.ndel);
    confirmSheet('Delete this note?', `"${n.title || 'Untitled note'}" can't be brought back.`, 'Delete', () => {
      s.notes = s.notes.filter(x => x.id !== n.id);
      renderNotes(); save(); toast('Note deleted');
    });
  });
}

/* ---------- chapters ---------- */
export function renderChapters(){
  if (!S.story) return;
  const s = S.story, box = $('#chList');
  const total = storyWords(s);
  const nCh = chapterCount(s), extra = s.chapters.length - nCh;
  $('#chSummary').textContent = `${nCh} chapter${nCh === 1 ? '' : 's'}`
    + (extra ? `, ${extra} extra${extra === 1 ? '' : 's'}` : '')
    + ` · ${nfm(total)} words`
    + (s.goal > 0 ? ` · ${Math.min(999, Math.round(total / s.goal * 100))}% of ${nfm(s.goal)}` : '');
  const nums = chapterNumbers(s);
  box.innerHTML = s.chapters.map((c, i) => {
    const k = kindOf(c), meta = KINDS[k];
    const mark = k === 'chapter' ? (nums[c.id] || '') : `<span class="alt">${meta.short}</span>`;
    const wc = kindCounts(c) ? `${nfm(chapterWords(c))} words` : 'not counted';
    return `
    <div class="ch" style="animation-delay:${Math.min(i, 8) * 30}ms">
      <span class="n">${mark}</span>
      <button class="body" data-open="${c.id}">
        <b>${esc(c.title || entryLabel(s, c, nums))}</b>
        <span>${k === 'chapter' ? '' : esc(meta.label) + ' · '}${wc} · ${ago(c.updatedAt)}</span>
      </button>
      <div class="acts">
        <button class="icb" data-up="${i}" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>${icon('up', 16)}</button>
        <button class="icb" data-down="${i}" aria-label="Move down" ${i === s.chapters.length - 1 ? 'disabled' : ''}>${icon('down', 16)}</button>
        <button class="icb" data-dup="${i}" aria-label="Duplicate">${icon('copy', 16)}</button>
        <button class="icb warn" data-del="${i}" aria-label="Delete">${icon('trash', 16)}</button>
      </div>
    </div>`;
  }).join('');
  $$('#chList [data-open]').forEach(b => b.onclick = () => openEditor('ch', b.dataset.open));
  $$('#chList [data-up]').forEach(b => b.onclick = () => move(+b.dataset.up, -1));
  $$('#chList [data-down]').forEach(b => b.onclick = () => move(+b.dataset.down, 1));
  $$('#chList [data-dup]').forEach(b => b.onclick = () => {
    const i = +b.dataset.dup, c = s.chapters[i];
    s.chapters.splice(i + 1, 0, { id: uid(), kind: kindOf(c), title: (c.title || 'Untitled chapter') + ' (copy)', body: c.body, banner: c.banner || null, updatedAt: Date.now() });
    renderChapters(); save(); toast('Chapter duplicated');
  });
  $$('#chList [data-del]').forEach(b => b.onclick = () => {
    const i = +b.dataset.del, c = s.chapters[i];
    confirmSheet('Delete this chapter?', `"${c.title || 'Untitled chapter'}" and its ${nfm(chapterWords(c))} words go with it. This can't be undone.`, 'Delete', () => {
      s.chapters.splice(i, 1);
      if (!s.chapters.length) s.chapters.push(blankChapter('Chapter 1'));
      renderChapters(); save(); DB.removeSnaps(c.id); toast('Chapter deleted');
    });
  });
}
function move(i, d){
  const a = S.story.chapters, j = i + d;
  if (j < 0 || j >= a.length) return;
  [a[i], a[j]] = [a[j], a[i]];
  renderChapters(); save();
}

function readStory(){
  const s = S.story;
  openReader(Math.min(s.lastRead || 0, s.chapters.length - 1));
}
function duplicateStory(){
  const src = S.story;
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = uid();
  copy.title = (src.title || 'Untitled story') + ' (copy)';
  copy.createdAt = copy.updatedAt = Date.now();
  copy.chapters.forEach(c => { c.id = uid(); });
  (copy.notes || []).forEach(n => { n.id = uid(); });
  copy.readPos = {};
  S.stories.push(copy);
  DB.saveStory(copy, 0);
  openStory(copy.id);
  toast('Story duplicated');
}
function trashStory(){
  const s = S.story;
  confirmSheet('Move to trash?', `"${s.title || 'Untitled story'}" goes to the trash on your Desk. It's restorable for 30 days, then it's gone for good.`, 'Trash it', () => {
    s.deletedAt = Date.now();
    save(s);
    S.stories = S.stories.filter(x => x.id !== s.id);
    S.trash.push(s);
    S.story = null;
    goLibrary(); toast('Moved to trash');
  });
}

export function initStory(){
  $('#sMore').innerHTML = icon('more');
  $('#backLib').onclick = goLibrary;
  $('#sTitle').oninput = e => { S.story.title = e.target.value; $('#crumbTitle').textContent = e.target.value || 'Untitled story'; saveSoon(); };
  $('#sDesc').oninput = e => { S.story.description = e.target.value; saveSoon(); };
  $('#sGoal').oninput = e => { const v = parseInt(e.target.value, 10); S.story.goal = v > 0 ? v : null; renderChapters(); saveSoon(); };
  $('#pickCover').onclick = () => $('#coverFile').click();
  $('#coverFile').onchange = e => { const files = [...e.target.files]; e.target.value = ''; if (files.length) addCovers(files); };
  $('#dropCover').onclick = () => {
    if (!coversOf(S.story).length) return;
    confirmSheet('Clear every cover?', 'The images go, the story stays.', 'Clear', async () => {
      const gone = S.story.covers; S.story.covers = [];
      renderCover(); save();
      for (const k of gone) await Media.remove(k);
      toast('Covers cleared');
    });
  };
  $('#tagInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ','){
      e.preventDefault();
      const v = e.target.value.replace(/,/g, '').trim();
      if (!v) return;
      if (!S.story.tags.includes(v)){ S.story.tags.push(v); renderTags(); save(); }
      e.target.value = '';
    } else if (e.key === 'Backspace' && !e.target.value && S.story.tags.length){
      S.story.tags.pop(); renderTags(); save();
    }
  });
  $('#tagInput').addEventListener('blur', e => {
    const v = e.target.value.replace(/,/g, '').trim();
    if (v && !S.story.tags.includes(v)){ S.story.tags.push(v); renderTags(); save(); }
    e.target.value = '';
  });
  $('#addPh').onclick = () => { S.story.placeholders.push({ k:'', v:'' }); renderPh(); save(); };
  $('#addNote').onclick = () => {
    const n = { id: uid(), title:'', body:'', updatedAt: Date.now() };
    S.story.notes.push(n);
    renderNotes(); save();
    openEditor('note', n.id);
  };
  $('#addCh').onclick = () => {
    const c = blankChapter('Chapter ' + (chapterCount(S.story) + 1));
    S.story.chapters.push(c);
    renderChapters(); save();
    openEditor('ch', c.id);
  };
  $('#readAll').onclick = readStory;
  $('#sMore').onclick = () => openMenu([
    { label:'Read as a reader', fn: readStory },
    { label:'Export as Markdown', fn: () => exportMd(S.story) },
    { label:'Export as EPUB', fn: () => exportEpub(S.story) },
    { label:'Duplicate story', fn: duplicateStory },
    { label:'Move to trash', warn:true, fn: trashStory }
  ]);
}
