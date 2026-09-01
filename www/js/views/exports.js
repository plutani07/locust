/* Locust — exports
   Markdown and EPUB for a single story; a backup file for everything.
   A backup inlines its images as data URLs so the file stands alone on any
   device. Inside the app it's written to Locust's backups folder and handed
   to the share sheet; in a browser it downloads. */

import { $, slug, toast, sleep } from '../util.js';
import { S, KINDS, kindOf, chapterNumbers, entryLabel, exportAuthor, coversOf, savePrefs } from '../model.js';
import { Media, DB } from '../db.js';
import { b64ToU8, inApp, capPlugin } from '../disk.js';
import { toHTML, clean, htmlToMd } from '../text.js';

/* ---------- browser download ---------- */
function download(name, parts, type){
  const b = new Blob(Array.isArray(parts) ? parts : [parts], { type: type || 'text/plain;charset=utf-8' });
  const u = URL.createObjectURL(b);
  const a = document.createElement('a');
  a.href = u; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 1500);
}

/* ---------- markdown ---------- */
export function buildMd(s){
  let md = `# ${s.title || 'Untitled story'}\n\n*by ${exportAuthor()}*\n\n`;
  if (s.description) md += `> ${s.description}\n\n`;
  md += `*${s.category}*` + (s.tags.length ? ` · ${s.tags.join(', ')}` : '') + `\n\n---\n\n`;
  const nums = chapterNumbers(s);
  s.chapters.forEach(c => {
    const head = kindOf(c) === 'chapter'
      ? `${nums[c.id]}. ${c.title || 'Untitled chapter'}`
      : `${KINDS[kindOf(c)].label}${c.title ? ' — ' + c.title : ''}`;
    md += `## ${head}\n\n${htmlToMd(c.body)}\n\n`;
  });
  return md;
}
export function exportMd(s){
  saveOut(slug(s.title) + '.md', buildMd(s), 'text/markdown;charset=utf-8', 'Markdown exported');
}

/* ---------- epub ---------- */
const CRC_T = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++){
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();
function crc32(u8){ let c = ~0; for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 255] ^ (c >>> 8); return ~c >>> 0; }
function zipStore(files){
  const enc = new TextEncoder(), parts = [], cd = [];
  let off = 0;
  const u16 = n => [n & 255, (n >> 8) & 255];
  const u32 = n => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
  files.forEach(f => {
    const name = enc.encode(f.name);
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = crc32(data), sz = data.length;
    const lh = new Uint8Array([0x50,0x4B,3,4, ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(sz), ...u32(sz), ...u16(name.length), ...u16(0)]);
    parts.push(lh, name, data);
    cd.push({ name, crc, sz, off });
    off += lh.length + name.length + sz;
  });
  const cdParts = [];
  let cdLen = 0;
  cd.forEach(e => {
    const hh = new Uint8Array([0x50,0x4B,1,2, ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(e.crc), ...u32(e.sz), ...u32(e.sz), ...u16(e.name.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0), ...u32(e.off)]);
    cdParts.push(hh, e.name);
    cdLen += hh.length + e.name.length;
  });
  const eocd = new Uint8Array([0x50,0x4B,5,6, ...u16(0), ...u16(0), ...u16(cd.length), ...u16(cd.length),
    ...u32(cdLen), ...u32(off), ...u16(0)]);
  return new Blob([...parts, ...cdParts, eocd], { type:'application/epub+zip' });
}
const xesc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function xhtmlBody(body){
  return clean(toHTML(body), false)
    .replace(/<br>/g, '<br/>')
    .replace(/<img ([^>]*?)\/?>/g, '<img $1/>')
    .replace(/&nbsp;/g, '&#160;');
}

export async function buildEpub(s){
  const title = s.title || 'Untitled story';
  const files = [{ name:'mimetype', data:'application/epub+zip' }];
  files.push({ name:'META-INF/container.xml', data:'<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>' });
  files.push({ name:'OEBPS/style.css', data:'body{font-family:Georgia,serif;line-height:1.7;margin:5%}h1{font-size:1.5em;text-align:center;margin:2em 0 1.4em}p{margin:0 0 .6em}img{max-width:100%}img.cover{width:100%;height:auto}' });

  let coverItem = '', coverMeta = '', coverSpine = '';
  const coverKey = coversOf(s)[0];
  const coverData = coverKey ? await Media.dataURL(coverKey) : null;
  const cm = coverData && coverData.match(/^data:image\/(jpeg|png);base64,/);
  if (cm){
    files.push({ name:'OEBPS/cover.' + (cm[1] === 'jpeg' ? 'jpg' : 'png'), data: b64ToU8(coverData.split(',')[1]) });
    const cname = 'cover.' + (cm[1] === 'jpeg' ? 'jpg' : 'png');
    files.push({ name:'OEBPS/cover.xhtml', data:'<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Cover</title><link rel="stylesheet" href="style.css"/></head><body><img class="cover" src="' + cname + '" alt="Cover"/></body></html>' });
    coverItem = `<item id="cimg" href="${cname}" media-type="image/${cm[1]}" properties="cover-image"/><item id="cpage" href="cover.xhtml" media-type="application/xhtml+xml"/>`;
    coverMeta = '<meta name="cover" content="cimg"/>';
    coverSpine = '<itemref idref="cpage"/>';
  }

  const items = [], spine = [], navLis = [];
  let imgN = 0;
  const nums = chapterNumbers(s);
  for (let i = 0; i < s.chapters.length; i++){
    const c = s.chapters[i];
    const id = 'ch' + (i + 1), fn = id + '.xhtml';
    const ct = c.title || entryLabel(s, c, nums);
    let bodyX = xhtmlBody(c.body);
    if (c.banner){
      const b = await Media.dataURL(c.banner);
      if (b) bodyX = `<img src="${b}"/>` + bodyX;
    }
    /* pull every media ref into the package as a real file */
    const refs = [...new Set((bodyX.match(/src="media:[^"]+"/g) || []).map(m => m.slice(11, -1)))];
    for (const key of refs){
      const d = await Media.dataURL(key);
      const m = d && d.match(/^data:image\/(jpeg|png|gif|webp);base64,(.+)$/);
      if (!m){ bodyX = bodyX.split(`src="media:${key}"`).join('src=""'); continue; }
      imgN++;
      const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
      const iname = `img${imgN}.${ext}`;
      files.push({ name:'OEBPS/' + iname, data: b64ToU8(m[2]) });
      items.push(`<item id="im${imgN}" href="${iname}" media-type="image/${m[1]}"/>`);
      bodyX = bodyX.split(`src="media:${key}"`).join(`src="${iname}"`);
    }
    bodyX = bodyX.replace(/<img src="data:image\/(jpeg|png|gif|webp);base64,([^"]+)"\/>/g, (mm, kind, b64) => {
      imgN++;
      const ext = kind === 'jpeg' ? 'jpg' : kind;
      const iname = `img${imgN}.${ext}`;
      files.push({ name:'OEBPS/' + iname, data: b64ToU8(b64) });
      items.push(`<item id="im${imgN}" href="${iname}" media-type="image/${kind}"/>`);
      return `<img src="${iname}" alt=""/>`;
    });
    bodyX = bodyX.replace(/<img src=""\/>/g, '');
    files.push({ name:'OEBPS/' + fn, data:
      '<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>' + xesc(ct) + '</title><link rel="stylesheet" href="style.css"/></head><body><h1>' + xesc(ct) + '</h1>' + bodyX + '</body></html>' });
    items.push(`<item id="${id}" href="${fn}" media-type="application/xhtml+xml"/>`);
    spine.push(`<itemref idref="${id}"/>`);
    navLis.push(`<li><a href="${fn}">${xesc(ct)}</a></li>`);
    if (i % 6 === 5) await sleep(0);
  }
  files.push({ name:'OEBPS/nav.xhtml', data:
    '<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><h1>Contents</h1><ol>' + navLis.join('') + '</ol></nav></body></html>' });
  files.splice(2, 0, { name:'OEBPS/content.opf', data:
    '<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">' +
    '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    '<dc:identifier id="uid">urn:locust:' + s.id + '</dc:identifier>' +
    '<dc:title>' + xesc(title) + '</dc:title>' +
    '<dc:creator>' + xesc(exportAuthor()) + '</dc:creator><dc:language>en</dc:language>' +
    '<meta property="dcterms:modified">' + new Date().toISOString().replace(/\.\d+Z$/, 'Z') + '</meta>' +
    coverMeta + '</metadata>' +
    '<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>' + coverItem + items.join('') + '</manifest>' +
    '<spine>' + coverSpine + spine.join('') + '</spine></package>' });

  return zipStore(files);
}

export async function exportEpub(s){
  const title = s.title || 'Untitled story';
  let blob;
  try { blob = await buildEpub(s); }
  catch { toast('That story is too large to package'); return; }
  if (inApp()){
    const b64 = await new Promise(res => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result).split(',')[1]);
      fr.readAsDataURL(blob);
    });
    await saveBinary(slug(title) + '.epub', b64, 'EPUB saved');
  } else {
    download(slug(title) + '.epub', [blob], 'application/epub+zip');
    toast('EPUB exported');
  }
}

/* ---------- writing a file out of the app ---------- */
async function share(uri, title){
  const Share = capPlugin('Share');
  if (!Share || !uri) return false;
  try { await Share.share({ title, files: [uri] }); return true; }
  catch { return false; }
}
async function saveOut(name, text, type, okMsg){
  if (inApp()){
    const uri = await DB.writeBackup(name, text);
    const shared = await share(uri, name);
    toast(shared ? 'Shared' : okMsg + ' to Locust’s backups folder');
    return;
  }
  download(name, text, type);
  toast(okMsg);
}
async function saveBinary(name, b64, okMsg){
  const { Disk } = await import('../disk.js');
  await Disk.writeBase64('backups/' + name, b64);
  const uri = await Disk.nativeUri('backups/' + name);
  const shared = await share(uri, name);
  toast(shared ? 'Shared' : okMsg + ' to Locust’s backups folder');
}

/* ---------- backup ---------- */
/* Built one story at a time so the whole library is never a single string
   in memory at once. */
async function backupParts(){
  const parts = ['{"app":"locust","kind":"backup","version":4'
    + ',"savedAt":' + JSON.stringify(new Date().toISOString())
    + ',"profile":' + JSON.stringify(await inlineProfile())
    + ',"stats":' + JSON.stringify(S.stats)
    + ',"prefs":' + JSON.stringify({ sort:S.prefs.sort, swap:S.prefs.swap, rSize:S.prefs.rSize, rLH:S.prefs.rLH, lastBackup:S.prefs.lastBackup })
    + ',"stories":['];
  const all = [...S.stories, ...S.trash];
  for (let i = 0; i < all.length; i++){
    parts.push((i ? ',' : '') + JSON.stringify(await inlineStory(all[i])));
    await sleep(0);
  }
  parts.push(']}');
  return parts;
}
async function inlineProfile(){
  const p = { ...S.profile };
  if (p.avatar) p.avatar = (await Media.dataURL(p.avatar)) || null;
  if (p.banner) p.banner = (await Media.dataURL(p.banner)) || null;
  return p;
}
async function inlineBody(body){
  if (!body || !/src="media:/.test(body)) return body || '';
  const refs = [...new Set((body.match(/src="media:[^"]+"/g) || []).map(m => m.slice(11, -1)))];
  let out = body;
  for (const key of refs){
    const d = await Media.dataURL(key);
    out = out.split(`src="media:${key}"`).join(d ? `src="${d}"` : 'src=""');
  }
  return out.replace(/<img src="">/g, '');
}
async function inlineStory(s){
  const out = { ...s };
  out.covers = [];
  for (const k of s.covers){ const d = await Media.dataURL(k); if (d) out.covers.push(d); }
  out.chapters = [];
  for (const c of s.chapters){
    const cc = { ...c };
    if (cc.banner) cc.banner = (await Media.dataURL(cc.banner)) || null;
    cc.body = await inlineBody(cc.body);
    out.chapters.push(cc);
  }
  out.notes = [];
  for (const n of (s.notes || [])) out.notes.push({ ...n, body: await inlineBody(n.body) });
  return out;
}

export async function buildBackup(){
  return (await backupParts()).join('');
}

export async function exportBackup(){
  toast('Building backup…');
  let text;
  try { text = await buildBackup(); }
  catch { toast('Could not build the backup'); return false; }
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const name = `locust-${stamp}.json`;
  if (inApp()){
    const uri = await DB.writeBackup(name, text);
    S.prefs.lastBackup = Date.now(); savePrefs();
    const shared = await share(uri, 'Locust backup');
    toast(shared ? 'Backup shared' : 'Backup saved to Locust’s backups folder');
  } else {
    download(name, text, 'application/json');
    S.prefs.lastBackup = Date.now(); savePrefs();
    toast('Backup downloaded');
  }
  return true;
}
