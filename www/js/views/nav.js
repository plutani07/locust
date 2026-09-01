/* Locust — navigation */
import { $, $$, closeSheet, sheetOpen, closeMenu, menuOpen } from '../util.js';
import { renderShelf } from './library.js';
import { renderDesk } from './desk.js';
import { renderProfile } from './profile.js';
import { editorOpen, closeEditor, flush } from './editor.js';
import { readerOpen, closeReader } from './reader.js';

const TABS = ['library', 'desk', 'profile'];

export function show(id){
  $$('.view').forEach(v => v.classList.remove('on'));
  $('#v-' + id).classList.add('on');
  window.scrollTo(0, 0);
}
export function setNav(key){
  $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.go === key));
}
export function currentTab(){
  if ($('#v-desk').classList.contains('on')) return 'desk';
  if ($('#v-profile').classList.contains('on')) return 'profile';
  return 'library';
}
export function goTab(key, dir, force){
  if (!force && key === currentTab() && !$('#v-story').classList.contains('on')) return;
  if (key === 'library'){ renderShelf(); show('library'); }
  else if (key === 'desk'){ renderDesk(); show('desk'); }
  else { renderProfile(); show('profile'); }
  setNav(key);
  if (dir){
    const to = $('.view.on');
    if (to) to.style.animation = `slideIn${dir > 0 ? 'R' : 'L'} .26s var(--ease) both`;
  }
}
export function goLibrary(){ goTab('library', 0, true); }

export function initNav(){
  $$('#nav button').forEach(b => b.onclick = () => goTab(b.dataset.go, 0));

  /* horizontal swipe moves between tabs, or back from the story page */
  let x0 = 0, y0 = 0, live = false;
  const blocked = t => !t || !t.closest || t.closest('#editor, input, textarea, .thumbs, .seg, .week, .bubble, #sheet, #menu, .swatches');
  addEventListener('touchstart', e => {
    live = false;
    if (e.touches.length !== 1) return;
    if (editorOpen() || readerOpen() || sheetOpen() || menuOpen()) return;
    if (blocked(e.target)) return;
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; live = true;
  }, { passive:true });
  addEventListener('touchend', e => {
    if (!live) return;
    live = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - x0, dy = t.clientY - y0;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.7) return;
    if ($('#v-story').classList.contains('on')){
      if (dx > 0) goTab('library', -1);
      return;
    }
    const i = TABS.indexOf(currentTab());
    const next = dx < 0 ? i + 1 : i - 1;
    if (next < 0 || next >= TABS.length) return;
    goTab(TABS[next], dx < 0 ? 1 : -1);
  }, { passive:true });

  /* Android back: close whatever is on top; on the library, really leave. */
  addEventListener('popstate', () => {
    let handled = true;
    if (menuOpen()) closeMenu();
    else if (sheetOpen()) closeSheet();
    else if (readerOpen()) closeReader();
    else if (editorOpen()) { flush(); closeEditor(); }
    else if ($('#v-story').classList.contains('on')) goLibrary();
    else handled = false;
    if (handled) history.pushState({ trap:1 }, '');
  });
  history.pushState({ trap:1 }, '');
}
