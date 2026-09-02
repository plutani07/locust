/* Locust — text
   A chapter body is a small HTML dialect: one <div> per line, <br> for a
   blank line, b/i/u for emphasis, <img> for pictures, and text-align on a
   line for centred or right-set text. Nothing else survives. Images are
   stored as src="media:<key>" and resolved to real URLs only for display. */

import { esc, escRx, words } from './util.js';
import { Media } from './db.js';

const OK = { B:1, STRONG:1, I:1, EM:1, U:1, BR:1, DIV:1, P:1, IMG:1 };

/* Scratch parsing happens in an inert document. A <div> made with
   document.createElement belongs to the live page, so setting innerHTML on
   it makes the browser start fetching every <img> inside — including the
   media: references that only mean something to us. Word counts run on
   every keystroke, so that was a request storm for nothing. */
const inert = document.implementation.createHTMLDocument('');
export function scratch(html){
  const d = inert.createElement('div');
  if (html != null) d.innerHTML = String(html);
  return d;
}

/* Sanitise to the dialect. Image sources become media: refs when they can;
   data: URLs are allowed through so a freshly pasted image can be stored
   on the next save. `resolve` swaps refs for display URLs instead. */
export function clean(html, resolve){
  const box = scratch(html || '');
  (function walk(node){
    [...node.childNodes].forEach(c => {
      if (c.nodeType === 3) return;
      if (c.nodeType !== 1){ node.removeChild(c); return; }
      if (!OK[c.tagName]){
        while (c.firstChild) node.insertBefore(c.firstChild, c);
        node.removeChild(c);
        return;
      }
      if (c.tagName === 'IMG'){
        const src = c.getAttribute('src') || '';
        let out = '';
        const key = Media.keyFor(src);
        if (key) out = resolve ? Media.url(key) : 'media:' + key;
        else if (src.startsWith('data:image/')) out = src;
        if (!out){ node.removeChild(c); return; }
        [...c.attributes].forEach(a => c.removeAttribute(a.name));
        c.setAttribute('src', out);
        return;
      }
      const ta = (c.style && c.style.textAlign) || '';
      [...c.attributes].forEach(a => c.removeAttribute(a.name));
      if ((c.tagName === 'DIV' || c.tagName === 'P') && (ta === 'center' || ta === 'right')) c.style.textAlign = ta;
      walk(c);
    });
  })(box);
  return box.innerHTML;
}

/* Body -> HTML ready for the editor or reader. Old plain-text chapters
   (some with ** markers) are lifted into the dialect on the way. */
export function toHTML(body){
  if (!body) return '';
  if (/<(b|i|u|br|div|p|strong|em|img)\b/i.test(body)) return clean(body, true);
  const lines = esc(body)
    .replace(/\*\*([^*\n]+?)\*\*/g, '<b>$1</b>')
    .replace(/__([^_\n]+?)__/g, '<u>$1</u>')
    .replace(/\*([^*\n]+?)\*/g, '<i>$1</i>')
    .split(/\n/);
  return lines.map(l => l.trim() ? `<div>${l}</div>` : '<div><br></div>').join('');
}

/* Editor DOM -> storable body (media refs, no display URLs). */
export function fromEditor(html){ return clean(html, false); }

export function plainOf(node){
  let out = '';
  node.childNodes.forEach(c => {
    if (c.nodeType === 3){ out += c.nodeValue; return; }
    if (c.nodeType !== 1) return;
    const t = c.tagName;
    if (t === 'BR') out += '\n';
    else if (t === 'DIV' || t === 'P') out += plainOf(c) + '\n';
    else out += plainOf(c);
  });
  return out;
}

/* Plain text of a chapter, cached by id + edit time. Word counts walk this. */
const cache = new Map();
let cacheBytes = 0;
export function chapterText(c){
  if (!c) return '';
  const key = c.id + '|' + (c.updatedAt || 0) + '|' + (c.body || '').length;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const box = scratch(toHTML(c.body));
  const out = plainOf(box).replace(/\n{3,}/g, '\n\n').trim();
  cacheBytes += out.length;
  if (cacheBytes > 4e6){ cache.clear(); cacheBytes = out.length; }
  cache.set(key, out);
  return out;
}
export const chapterWords = c => words(chapterText(c));

export function mdOf(node){
  let out = '';
  node.childNodes.forEach(c => {
    if (c.nodeType === 3){ out += c.nodeValue; return; }
    if (c.nodeType !== 1) return;
    const t = c.tagName;
    if (t === 'BR') out += '\n';
    else if (t === 'B' || t === 'STRONG') out += '**' + mdOf(c) + '**';
    else if (t === 'I' || t === 'EM') out += '*' + mdOf(c) + '*';
    else if (t === 'U') out += '__' + mdOf(c) + '__';
    else if (t === 'DIV' || t === 'P') out += mdOf(c) + '\n';
    else out += mdOf(c);
  });
  return out;
}
export function htmlToMd(body){
  const box = scratch(toHTML(body));
  return mdOf(box).replace(/\n{3,}/g, '\n\n').trim();
}

export function textNodes(root){
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const out = []; while (w.nextNode()) out.push(w.currentNode);
  return out;
}

/* The editor keeps one <div> per line plus blank spacers, which reads as
   doubled gaps. Fold that into proper paragraphs for the reader. */
export function toParagraphs(box){
  const out = scratch();
  let run = null;
  const flush = () => { if (run && run.textContent.trim()) out.appendChild(run); run = null; };
  [...box.childNodes].forEach(node => {
    if (node.nodeType === 1 && (node.tagName === 'DIV' || node.tagName === 'P')){
      const blank = !node.textContent.trim() && !node.querySelector('img');
      flush();
      if (blank) return;
      const p = document.createElement('p');
      if (node.style && node.style.textAlign) p.style.textAlign = node.style.textAlign;
      while (node.firstChild) p.appendChild(node.firstChild);
      out.appendChild(p);
      return;
    }
    if (node.nodeType === 1 && node.tagName === 'IMG'){ flush(); out.appendChild(node); return; }
    if (node.nodeType === 1 && node.tagName === 'BR'){ flush(); return; }
    if (node.nodeType === 3 && !node.nodeValue.trim()) return;
    if (!run) run = document.createElement('p');
    run.appendChild(node);
  });
  flush();
  return out;
}

/* Reader HTML: paragraphs, with placeholders swapped for their values.
   The draft text is never changed — only this rendering. */
export function proseHTML(body, placeholders, highlight){
  let box = scratch(toHTML(body));
  box = toParagraphs(box);
  const ph = (placeholders || []).filter(p => p.k && p.v).sort((a, b) => b.k.length - a.k.length);
  if (ph.length){
    const rx = new RegExp(ph.map(p => escRx(p.k)).join('|'), 'g');
    textNodes(box).forEach(t => {
      let hit = false;
      const marked = t.nodeValue.replace(rx, m => {
        const p = ph.find(x => x.k === m);
        if (!p) return m;
        hit = true;
        return '\u0000' + p.v + '\u0001';
      });
      if (!hit) return;
      const holder = inert.createElement('span');
      holder.innerHTML = esc(marked)
        .replace(/\u0000/g, highlight ? '<span class="swap">' : '')
        .replace(/\u0001/g, highlight ? '</span>' : '');
      t.parentNode.replaceChild(holder, t);
    });
  }
  return box.innerHTML;
}
