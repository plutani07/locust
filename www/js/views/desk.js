/* Locust — desk */
import { $, $$, esc, nfm, ago, icon, dayKey, toast, confirmSheet } from '../util.js';
import { S, chapterCount, storyWords, chapterNumbers, streak, savePrefs, normalise } from '../model.js';
import { DB } from '../db.js';
import { absorb, parseBackup } from '../migrate.js';
import { exportBackup } from './exports.js';
import { openStory } from './story.js';
import { openEditor } from './editor.js';
import { renderShelf } from './library.js';
import { inApp } from '../disk.js';

export function renderDesk(){
  let ch = 0, w = 0;
  S.stories.forEach(s => { ch += chapterCount(s); w += storyWords(s); });
  $('#stStories').textContent = nfm(S.stories.length);
  $('#stChapters').textContent = nfm(ch);
  $('#stWords').textContent = nfm(w);

  $('#mToday').textContent = nfm(S.stats[dayKey()] || 0);
  $('#mStreak').textContent = nfm(streak());
  const days = [];
  for (let i = 6; i >= 0; i--){
    const x = new Date(); x.setDate(x.getDate() - i);
    days.push({ k: dayKey(x), l: 'SMTWTFS'[x.getDay()] });
  }
  const mx = Math.max(1, ...days.map(x => S.stats[x.k] || 0));
  $('#week').innerHTML = days.map(x => {
    const v = S.stats[x.k] || 0;
    return `<div class="d${v ? '' : ' zero'}" title="${nfm(v)} words">
      <div class="bar" style="height:${Math.max(5, Math.round(v / mx * 100))}%"></div><span>${x.l}</span></div>`;
  }).join('');

  /* backup nudge */
  const hasWork = S.stories.some(s => s.chapters.some(c => (c.body || '').length > 40));
  const dAgo = S.prefs.lastBackup ? Math.floor((Date.now() - S.prefs.lastBackup) / 86400000) : null;
  if (hasWork && (dAgo === null || dAgo >= 21)){
    $('#nudge').innerHTML = `<div class="infobar"><div style="flex:1">
      <b>${dAgo === null ? 'No backup yet.' : `Last backup: ${dAgo} days ago.`}</b>
      Uninstalling the app takes its folder with it. A backup is one file you can keep anywhere.</div>
      <button class="btn pri sm" id="nudgeGo">Export</button></div>`;
    $('#nudgeGo').onclick = () => exportBackup().then(renderDesk);
  } else $('#nudge').innerHTML = '';

  $('#deskBackup').textContent = dAgo === null
    ? "No backup exported yet."
    : dAgo === 0 ? 'Backed up today.' : `Last backup ${dAgo} day${dAgo === 1 ? '' : 's'} ago.`;

  renderTrash();
  renderRecent();
}

function renderTrash(){
  const card = $('#trashCard');
  if (!S.trash.length){ card.hidden = true; return; }
  card.hidden = false;
  $('#trashList').innerHTML = S.trash.map((s, i) => {
    const left = Math.max(0, 30 - Math.floor((Date.now() - s.deletedAt) / 86400000));
    return `<div class="ch" style="animation-delay:${Math.min(i, 8) * 30}ms">
      <span class="body"><b>${esc(s.title || 'Untitled story')}</b>
      <span>${s.chapters.length} ch · gone in ${left} day${left === 1 ? '' : 's'}</span></span>
      <button class="btn sm" data-tres="${s.id}">Restore</button>
      <button class="icb warn" data-tkill="${s.id}" aria-label="Delete forever">${icon('trash', 16)}</button>
    </div>`;
  }).join('');
  $$('#trashList [data-tres]').forEach(b => b.onclick = () => {
    const s = S.trash.find(x => x.id === b.dataset.tres);
    delete s.deletedAt;
    DB.saveStory(s, 0);
    S.trash = S.trash.filter(x => x.id !== s.id);
    S.stories.push(s);
    renderDesk(); renderShelf(); toast('Restored');
  });
  $$('#trashList [data-tkill]').forEach(b => b.onclick = () => {
    const s = S.trash.find(x => x.id === b.dataset.tkill);
    confirmSheet('Delete forever?', `"${s.title || 'Untitled story'}" — no trash, no undo, nothing.`, 'Delete forever', async () => {
      await DB.deleteStory(s.id);
      S.trash = S.trash.filter(x => x.id !== s.id);
      s.chapters.forEach(c => DB.removeSnaps(c.id));
      renderDesk(); toast('Gone');
    });
  });
}

function renderRecent(){
  const recent = [];
  S.stories.forEach(s => s.chapters.forEach(c => recent.push({ s, c })));
  recent.sort((a, b) => (b.c.updatedAt || 0) - (a.c.updatedAt || 0));
  const box = $('#recent');
  if (!recent.length || !recent[0].c.updatedAt){
    box.innerHTML = '<p class="sub">Nothing written yet.</p>';
    return;
  }
  box.innerHTML = '<div class="chlist">' + recent.slice(0, 4).map((r, i) => `
    <button class="ch" data-s="${r.s.id}" data-c="${r.c.id}" style="animation-delay:${i * 35}ms">
      <span class="n">${chapterNumbers(r.s)[r.c.id] || '·'}</span>
      <span class="body"><b>${esc(r.c.title || 'Untitled chapter')}</b>
      <span>${esc(r.s.title || 'Untitled story')} · ${ago(r.c.updatedAt)}</span></span>
    </button>`).join('') + '</div>';
  $$('#recent [data-s]').forEach(b => b.onclick = () => { openStory(b.dataset.s); openEditor('ch', b.dataset.c); });
}

export function restoreFrom(file){
  const fr = new FileReader();
  fr.onload = () => {
    const d = parseBackup(String(fr.result));
    if (!d){ toast("That file isn't a Locust backup"); return; }
    const n = d.stories.length;
    confirmSheet('Restore this backup?',
      `${n} stor${n === 1 ? 'y' : 'ies'} from ${d.savedAt ? new Date(d.savedAt).toLocaleDateString() : 'an earlier save'}. Anything here with the same ID is replaced.`,
      'Restore', async () => {
        toast('Restoring…');
        d.stories.forEach(normalise);
        const got = await absorb(d, null);
        renderShelf(); renderDesk();
        toast(`Restored ${got} stor${got === 1 ? 'y' : 'ies'}`);
      });
  };
  fr.readAsText(file);
}

export function initDesk(){
  $('#deskStore').textContent = inApp()
    ? 'Every keystroke is saved into Locust’s own folder under Android/data as you write. A backup is a single file you can move anywhere.'
    : 'Everything is saved in this browser as you write. A backup is a single file you can move anywhere.';
  $('#optSwap').checked = S.prefs.swap !== false;
  $('#optSwap').onchange = e => { S.prefs.swap = e.target.checked; savePrefs(); };
  $('#backup').onclick = () => exportBackup().then(renderDesk);
  $('#restore').onclick = () => $('#restoreFile').click();
  $('#restoreFile').onchange = e => {
    const f = e.target.files[0]; e.target.value = '';
    if (f) restoreFrom(f);
  };
}
