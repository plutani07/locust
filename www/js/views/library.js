/* Locust — library */
import { $, $$, esc, nfm, ago, icon, debounce, renderSeg } from '../util.js';
import { S, storyWords, chapterCount, coversOf, stackHTML, runCovers, makeStory, chapterNumbers, savePrefs } from '../model.js';
import { Media, DB } from '../db.js';
import { chapterText } from '../text.js';
import { openStory } from './story.js';
import { openEditor } from './editor.js';

export function renderShelf(){
  const box = $('#shelf');
  const q = $('#sq').value.trim();
  if (q.length >= 2){ renderSearch(q); return; }
  if (!S.stories.length){
    $('#sortSeg').style.display = 'none';
    $('#resume').innerHTML = '';
    box.innerHTML = `<div class="empty"><img class="glyph" src="logo.png" alt="">
      <h3>Nothing on the shelf</h3>
      <p>Every story starts as a title and a bad first line. Make the title.</p>
      <button class="btn pri" id="emptyNew">Start a story</button></div>`;
    $('#emptyNew').onclick = newStory;
    return;
  }
  const by = S.prefs.sort || 'Recent';
  const list = [...S.stories].sort(
    by === 'Title'  ? (a, b) => (a.title || '').localeCompare(b.title || '') :
    by === 'Oldest' ? (a, b) => (a.createdAt || 0) - (b.createdAt || 0) :
                      (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  $('#sortSeg').style.display = '';
  box.innerHTML = '<div class="shelf">' + list.map((s, i) => {
    const w = storyWords(s);
    return `<button class="tile" data-id="${s.id}" style="animation-delay:${Math.min(i, 8) * 40}ms">
      <div class="art">${stackHTML(coversOf(s))}</div>
      <h3>${esc(s.title || 'Untitled story')}</h3>
      <p>${chapterCount(s)} ch · ${nfm(w)} words</p>
      ${s.goal > 0 ? `<div class="goalbar"><i style="width:${Math.min(100, Math.round(w / s.goal * 100))}%"></i></div>` : ''}
    </button>`;
  }).join('') + '</div>';
  $$('#shelf .tile').forEach(t => t.onclick = () => openStory(t.dataset.id));
  renderResume();
  runCovers();
}

function lastTouched(){
  let best = null;
  S.stories.forEach(s => s.chapters.forEach(c => {
    if (c.updatedAt && (c.body || '').trim() && (!best || c.updatedAt > best.c.updatedAt)) best = { s, c };
  }));
  return best;
}
function renderResume(){
  const box = $('#resume'), last = lastTouched();
  if (!last){ box.innerHTML = ''; return; }
  const cover = coversOf(last.s)[0];
  const n = last.s.chapters.indexOf(last.c) + 1;
  box.innerHTML = `<button class="resume" id="resumeGo">
    <span class="rart">${cover ? `<img src="${Media.url(cover)}" alt="">` : ''}</span>
    <span class="rtxt">
      <small>Continue writing</small>
      <b>${esc(last.c.title || 'Chapter ' + n)}</b>
      <span>${esc(last.s.title || 'Untitled story')} · ${ago(last.c.updatedAt)}</span>
    </span>
    <span class="go">${icon('chevron', 16)}</span>
  </button>`;
  $('#resumeGo').onclick = () => { openStory(last.s.id); openEditor('ch', last.c.id); };
}

export async function newStory(){
  const s = makeStory();
  S.stories.push(s);
  DB.saveStory(s, 0);
  openStory(s.id);
  setTimeout(() => $('#sTitle').focus(), 320);
}

function renderSearch(q){
  const ql = q.toLowerCase(), rows = [];
  S.stories.forEach(s => {
    const sHit = (s.title || '').toLowerCase().includes(ql);
    const pools = [['ch', s.chapters], ['note', s.notes || []]];
    pools.forEach(([kind, pool]) => pool.forEach(c => {
      const title = c.title || (kind === 'note' ? 'Untitled note' : 'Untitled chapter');
      const txt = chapterText(c);
      const bi = txt.toLowerCase().indexOf(ql);
      if (bi < 0 && !title.toLowerCase().includes(ql) && !sHit) return;
      let peek;
      if (bi >= 0){
        const a = Math.max(0, bi - 34), b = Math.min(txt.length, bi + q.length + 52);
        peek = (a ? '…' : '') + esc(txt.slice(a, bi)) + '<mark>' + esc(txt.slice(bi, bi + q.length)) + '</mark>'
             + esc(txt.slice(bi + q.length, b)) + (b < txt.length ? '…' : '');
      } else peek = esc(txt.slice(0, 84));
      rows.push({ s, c, kind, title, peek });
    }));
  });
  $('#resume').innerHTML = '';
  $('#sortSeg').style.display = 'none';
  $('#shelf').innerHTML = rows.length
    ? `<p class="sub" style="margin:2px 0 12px">${rows.length} hit${rows.length === 1 ? '' : 's'} for “${esc(q)}”</p><div class="chlist">`
      + rows.slice(0, 40).map((r, i) => `
        <button class="ch" data-ss="${r.s.id}" data-sc="${r.c.id}" data-kind="${r.kind}" style="animation-delay:${Math.min(i, 8) * 25}ms">
          <span class="n">${r.kind === 'note' ? '<span class="alt">NOTE</span>' : (chapterNumbers(r.s)[r.c.id] || '·')}</span>
          <span class="body"><b>${esc(r.title)} · ${esc(r.s.title || 'Untitled story')}</b>
          <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.peek || '—'}</span></span>
        </button>`).join('') + '</div>'
    : `<div class="empty"><h3>No matches</h3><p>Nothing in any story contains “${esc(q)}”.</p></div>`;
  $$('#shelf [data-ss]').forEach(b => b.onclick = () => {
    openStory(b.dataset.ss);
    openEditor(b.dataset.kind, b.dataset.sc, q);
  });
}

export function initLibrary(){
  $('#searchBtn').innerHTML = icon('search');
  $('#newStory').onclick = newStory;
  $('#searchBtn').onclick = () => {
    const on = $('#srow').classList.toggle('on');
    if (on) $('#sq').focus();
    else { $('#sq').value = ''; renderShelf(); }
  };
  $('#sqClose').onclick = () => { $('#srow').classList.remove('on'); $('#sq').value = ''; renderShelf(); };
  $('#sq').addEventListener('input', () => debounce('search', renderShelf, 200));
  renderSeg($('#sortSeg'), ['Recent', 'Title', 'Oldest'], S.prefs.sort || 'Recent', v => {
    S.prefs.sort = v; savePrefs(); renderShelf();
  });
}
