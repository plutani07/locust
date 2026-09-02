/* Locust — reader */
import { $, $$, esc, nfm, icon, toast, sheet, closeSheet, renderSeg, debounce } from '../util.js';
import { S, KINDS, kindOf, kindCounts, chapterNumbers, entryLabel, exportAuthor, save, savePrefs } from '../model.js';
import { Media } from '../db.js';
import { proseHTML, plainOf, chapterWords, scratch } from '../text.js';

export const readerOpen = () => $('#v-reader').classList.contains('on');

export function openReader(i){
  S.readIdx = Math.max(0, Math.min(i || 0, S.story.chapters.length - 1));
  render();
  $('#v-reader').classList.add('on');
  $('#nav').classList.add('hide');
}
export function closeReader(){
  ttsStop();
  savePos();
  $('#v-reader').classList.remove('on', 'bare');
  if (!$('#v-editor').classList.contains('on')) $('#nav').classList.remove('hide');
}

function render(){
  const s = S.story, c = s.chapters[S.readIdx];
  if (!c) return;
  $('#rBanner').innerHTML = c.banner ? `<img class="rbanner" src="${Media.url(c.banner)}" alt="">` : '';
  $('#rKick').textContent = entryLabel(s, c);
  $('#rTitle').textContent = c.title || 'Untitled chapter';
  $('#rBy').textContent = exportAuthor();
  $('#rStoryName').textContent = s.title || 'Untitled story';
  $('#rWhere').textContent = `${S.readIdx + 1} of ${s.chapters.length}`;

  $('#rProse').innerHTML = (c.body || '').trim()
    ? proseHTML(c.body, s.placeholders, S.prefs.swap)
    : `<p style="color:var(--faint);text-align:center">This chapter is still empty.</p>`;

  const more = S.readIdx < s.chapters.length - 1;
  $('#rEnd').innerHTML = more
    ? `<button class="btn pri sm" id="rGoNext">Next chapter ›</button>`
    : `<p class="sub">End of ${esc(s.title || 'the story')}</p>`;
  if (more) $('#rGoNext').onclick = () => step(1);

  $('#rPrev').disabled = S.readIdx === 0;
  $('#rNext').disabled = !more;
  applyStyle();
  s.lastRead = S.readIdx;
  $('#rbody').scrollTop = (s.readPos || {})[c.id] || 0;
  progress();
}

function step(d){
  const n = S.readIdx + d;
  if (n < 0 || n >= S.story.chapters.length) return;
  ttsStop(); savePos();
  S.readIdx = n;
  render();
}
function progress(){
  const b = $('#rbody');
  const max = b.scrollHeight - b.clientHeight;
  $('#rProg').style.width = (max > 20 ? Math.min(100, b.scrollTop / max * 100) : 0) + '%';
}
function savePos(){
  const s = S.story;
  if (!s) return;
  const c = s.chapters[S.readIdx];
  if (c) (s.readPos = s.readPos || {})[c.id] = Math.round($('#rbody').scrollTop);
  save(s);
}
function applyStyle(){
  const p = $('#rProse');
  p.style.fontSize = (S.prefs.rSize || 17) + 'px';
  p.style.lineHeight = S.prefs.rLH || 1.85;
}

/* ---------- read aloud ---------- */
const TTS = { on:false, chunks:[], i:0 };
let SENT_RX = null;
try { SENT_RX = new RegExp('(?<=[.!?\u2026])\\s+'); } catch { SENT_RX = null; }
function ttsChunks(txt){
  const out = [];
  txt.split(/\n+/).forEach(p => {
    p = p.trim(); if (!p) return;
    const bits = SENT_RX ? p.split(SENT_RX) : [p];
    let buf = '';
    bits.forEach(s => {
      if ((buf + ' ' + s).length > 220){ if (buf) out.push(buf); buf = s; }
      else buf = buf ? buf + ' ' + s : s;
    });
    if (buf) out.push(buf);
  });
  return out;
}
function ttsLabel(){
  const b = $('#rSpeak');
  b.style.color = TTS.on ? 'var(--ac-soft)' : '';
  b.setAttribute('aria-label', TTS.on ? 'Stop reading' : 'Read aloud');
}
export function ttsStop(){
  TTS.on = false; TTS.chunks = []; TTS.i = 0;
  try { speechSynthesis.cancel(); } catch {}
  ttsLabel();
}
function ttsNext(){
  if (!TTS.on || TTS.i >= TTS.chunks.length){ ttsStop(); return; }
  const u = new SpeechSynthesisUtterance(TTS.chunks[TTS.i++]);
  u.onend = ttsNext;
  u.onerror = ttsStop;
  try { speechSynthesis.speak(u); } catch { ttsStop(); }
}

export function initReader(){
  $('#rClose').innerHTML = icon('back');
  $('#rSpeak').innerHTML = icon('speaker');
  if (!('speechSynthesis' in window)) $('#rSpeak').hidden = true;

  $('#rClose').onclick = closeReader;
  $('#rPrev').onclick = () => step(-1);
  $('#rNext').onclick = () => step(1);

  $('#rbody').addEventListener('click', e => {
    if (e.target.closest('button, a, img')) return;
    $('#v-reader').classList.toggle('bare');
  });
  $('#rbody').addEventListener('scroll', () => {
    if (!readerOpen() || !S.story) return;
    progress();
    debounce('rpos', savePos, 400);
  }, { passive:true });

  $('#rWhere').onclick = () => {
    const s = S.story, nums = chapterNumbers(s);
    sheet(`<h3>Chapters</h3><p class="sub">${esc(s.title || 'Untitled story')}</p>
      <div class="chlist">${s.chapters.map((c, i) => `
        <button class="ch${i === S.readIdx ? ' cur' : ''}" data-jump="${i}">
          <span class="n">${kindOf(c) === 'chapter' ? (nums[c.id] || '') : `<span class="alt">${KINDS[kindOf(c)].short}</span>`}</span>
          <span class="body"><b>${esc(c.title || entryLabel(s, c, nums))}</b>
          <span>${esc(entryLabel(s, c, nums))}${kindCounts(c) ? ' · ' + nfm(chapterWords(c)) + ' words' : ''}</span></span>
        </button>`).join('')}</div>`);
    $$('#sheet [data-jump]').forEach(b => b.onclick = () => {
      ttsStop(); savePos();
      S.readIdx = +b.dataset.jump;
      render(); closeSheet();
    });
  };

  $('#rAa').onclick = () => {
    const lhName = () => S.prefs.rLH <= 1.7 ? 'Cosy' : S.prefs.rLH >= 2 ? 'Airy' : 'Classic';
    sheet(`<h3>Reading comfort</h3>
      <div class="field"><label>Text size</label>
        <div class="szrow">
          <button class="btn sm" id="szDn">A−</button>
          <b id="szVal">${S.prefs.rSize}px</b>
          <button class="btn sm" id="szUp">A+</button>
        </div></div>
      <div class="field last"><label>Line spacing</label><div class="seg" id="lhSeg"></div></div>`);
    const keep = () => { applyStyle(); savePrefs(); };
    $('#szDn').onclick = () => { S.prefs.rSize = Math.max(14, S.prefs.rSize - 1); $('#szVal').textContent = S.prefs.rSize + 'px'; keep(); };
    $('#szUp').onclick = () => { S.prefs.rSize = Math.min(23, S.prefs.rSize + 1); $('#szVal').textContent = S.prefs.rSize + 'px'; keep(); };
    renderSeg($('#lhSeg'), ['Cosy', 'Classic', 'Airy'], lhName(), v => {
      S.prefs.rLH = v === 'Cosy' ? 1.68 : v === 'Airy' ? 2.05 : 1.85;
      keep();
    });
  };

  $('#rSpeak').onclick = () => {
    if (TTS.on){ ttsStop(); return; }
    const c = S.story.chapters[S.readIdx];
    if (!c) return;
    const box = scratch();
    box.innerHTML = proseHTML(c.body, S.story.placeholders, false);   // placeholders read as names
    const txt = plainOf(box).trim();
    if (!txt){ toast('Nothing to read yet'); return; }
    TTS.chunks = ttsChunks(txt); TTS.i = 0; TTS.on = true;
    ttsLabel(); ttsNext();
  };
}
