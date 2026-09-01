/* Locust — boot */
import { $, $$, icon, toast, esc, initOverlays } from './util.js';
import { DB } from './db.js';
import { inApp } from './disk.js';
import { S, normalise, applyAccent, savePrefs } from './model.js';
import { migrateIfNeeded } from './migrate.js';
import { initNav, goLibrary } from './views/nav.js';
import { initLibrary } from './views/library.js';
import { initStory } from './views/story.js';
import { initEditor, editorOpen, flush } from './views/editor.js';
import { initReader } from './views/reader.js';
import { initDesk } from './views/desk.js';
import { initProfile } from './views/profile.js';

function alarm(why){
  $('#alarm').innerHTML = `<div class="alarmbar"><div style="flex:1"><b>Not saving.</b> ${esc(why)}</div></div>`;
}

(async function boot(){
  $$('#nav [data-icon]').forEach(el => el.innerHTML = icon(el.dataset.icon, 21));

  try { await DB.init(); }
  catch (e){ alarm('Locust could not open its own folder: ' + (e && e.message || e)); }
  DB.onError(msg => alarm('The last write failed: ' + msg + ' Export a backup now if you can.'));

  const prefs = await DB.loadPrefs();
  if (prefs) Object.assign(S.prefs, prefs);
  const profile = await DB.loadProfile();
  if (profile) Object.assign(S.profile, profile);
  S.stats = (await DB.loadStats()) || {};

  const loaded = await DB.loadStories();
  const cutoff = Date.now() - 30 * 86400000;
  for (const s of loaded){
    normalise(s);
    if (s.deletedAt && s.deletedAt < cutoff){ await DB.deleteStory(s.id); continue; }
    (s.deletedAt ? S.trash : S.stories).push(s);
  }

  /* first run after an update: pull anything the old build left behind */
  let note = '';
  try { note = await migrateIfNeeded(); } catch {}

  if (!S.profile.since){
    S.profile.since = S.stories.reduce((m, s) => Math.min(m, s.createdAt || Date.now()), Date.now());
    DB.saveProfile(S.profile);
  }
  applyAccent(S.profile.accent);

  initOverlays();
  initNav(); initLibrary(); initStory(); initEditor(); initReader(); initDesk(); initProfile();
  goLibrary();
  if (note) setTimeout(() => toast(note), 500);

  /* sticky headers get a hairline once you scroll past them */
  const onScroll = () => {
    const s = window.scrollY > 6;
    $$('.top, .crumb').forEach(el => el.classList.toggle('stuck', s));
  };
  addEventListener('scroll', onScroll, { passive:true });

  /* leaving the app: get everything on disk before Android freezes us */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return;
    if (editorOpen()) flush();
    DB.flushAll();
  });
  addEventListener('pagehide', () => { if (editorOpen()) flush(); DB.flushAll(); });

  /* tidy up images nothing points at any more, once, well after startup */
  setTimeout(() => DB.collectGarbage([...S.stories, ...S.trash], S.profile), 8000);

  if (!inApp() && !S.prefs.webNoted){
    S.prefs.webNoted = true; savePrefs();
  }
})();
