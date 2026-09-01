/* Locust — profile */
import { $, $$, esc, nfm, icon, sheet, closeSheet } from '../util.js';
import { S, ACCENTS, applyAccent, penName, handleOf, coversOf, kindCounts, streak, saveProfile, storeImage } from '../model.js';
import { Media } from '../db.js';
import { chapterText } from '../text.js';
import { words } from '../util.js';
import { inApp } from '../disk.js';
import { exportBackup } from './exports.js';

function initials(){
  const parts = penName().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'A';
  return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[1][0]).toUpperCase();
}

function badges(){
  let w = 0, chs = 0, imgs = 0, notes = 0;
  S.stories.forEach(s => {
    notes += (s.notes || []).length;
    imgs += coversOf(s).length;
    s.chapters.forEach(c => {
      const t = chapterText(c);
      /* a prologue is still writing — anything that counts toward the
         word total counts toward the badge */
      if (t && kindCounts(c)) chs++;
      if (kindCounts(c)) w += words(t);
      if (c.banner) imgs++;
      imgs += ((c.body || '').match(/<img /g) || []).length;
    });
  });
  const out = [];
  if (chs >= 1) out.push(['pen', 'First words']);
  if (chs >= 10) out.push(['book', 'Serialist']);
  if (w >= 50000) out.push(['star', 'Novelist']);
  else if (w >= 10000) out.push(['star', '10k club']);
  const st = streak();
  if (st >= 3) out.push(['flame', `${st}-day streak`]);
  if (imgs >= 5) out.push(['image', 'Illustrator']);
  if (notes >= 3) out.push(['note', 'Worldbuilder']);
  if (S.prefs.lastBackup) out.push(['shield', 'Archivist']);
  return out;
}

function renderCard(){
  $('#pfNameBig').textContent = S.profile.name || 'Your pen name';
  $('#pfHandleBig').textContent = handleOf();
  $('#pfAboutBig').textContent = S.profile.line || 'Nothing here yet.';
  $('#pfAvatar').innerHTML = S.profile.avatar ? `<img src="${Media.url(S.profile.avatar)}" alt="">` : esc(initials());
  $('#pfBanner').innerHTML = S.profile.banner ? `<img src="${Media.url(S.profile.banner)}" alt="">` : '';
  $('#pfSince').textContent = 'Writing here since ' + new Date(S.profile.since || Date.now()).toLocaleDateString(undefined, { month:'long', year:'numeric' });
  const list = badges();
  $('#pfBadges').innerHTML = list.length
    ? list.map(([ic, label]) => `<span class="pbadge">${icon(ic, 13)}${esc(label)}</span>`).join('')
    : '<span class="pbadge">Write a chapter to earn your first badge</span>';
}

export async function renderProfile(){
  $('#pfName').value = S.profile.name || '';
  $('#pfLine').value = S.profile.line || '';
  $('#pfHandle').value = (S.profile.handle || '').replace(/^@/, '');
  $('#pfAuthor').value = S.profile.author || '';
  renderCard();

  $('#pfAccent').innerHTML = Object.entries(ACCENTS).map(([k, a]) =>
    `<button data-acc="${k}" aria-label="${a.label}" class="${S.profile.accent === k ? 'on' : ''}"
      style="background:linear-gradient(135deg,rgb(${a.rgb}),rgb(${a.deep}))"></button>`).join('');
  $$('#pfAccent [data-acc]').forEach(b => b.onclick = () => {
    S.profile.accent = b.dataset.acc;
    applyAccent(S.profile.accent);
    $$('#pfAccent [data-acc]').forEach(x => x.classList.toggle('on', x === b));
    saveProfile();
  });

  let chs = 0, imgs = 0, w = 0;
  S.stories.concat(S.trash).forEach(s => {
    imgs += coversOf(s).length;
    s.chapters.forEach(c => {
      chs++;
      if (c.banner) imgs++;
      imgs += ((c.body || '').match(/<img /g) || []).length;
      if (kindCounts(c)) w += words(chapterText(c));
    });
  });
  $('#pfStore').textContent = `${nfm(S.stories.length)} stor${S.stories.length === 1 ? 'y' : 'ies'} · ${nfm(chs)} chapters · ${nfm(w)} words · ${nfm(imgs)} images`;
  $('#pfWhere').textContent = inApp()
    ? 'Saved in Android/data/com.plutani.locust/files/locust. It survives app updates; uninstalling removes it.'
    : 'Saved in this browser’s storage for this site.';

  const d = S.prefs.lastBackup ? Math.floor((Date.now() - S.prefs.lastBackup) / 86400000) : null;
  $('#pfBackup').textContent = d === null
    ? "You haven't exported a backup yet. Nothing here exists anywhere else."
    : d === 0 ? 'Backed up today.' : `Last backup ${d} day${d === 1 ? '' : 's'} ago.`;
}

export function initProfile(){
  $('#pfName').oninput = e => { S.profile.name = e.target.value; renderCard(); saveProfile(); };
  $('#pfLine').oninput = e => { S.profile.line = e.target.value; renderCard(); saveProfile(); };
  $('#pfHandle').oninput = e => { S.profile.handle = e.target.value.replace(/^@/, ''); renderCard(); saveProfile(); };
  $('#pfAuthor').oninput = e => { S.profile.author = e.target.value; saveProfile(); };

  $('#pfAvatar').onclick = () => {
    if (!S.profile.avatar){ $('#pfAvatarFile').click(); return; }
    sheet(`<h3>Avatar</h3><div class="row">
      <button class="btn sm" style="flex:1" id="avSwap">Replace</button>
      <button class="btn danger sm" style="flex:1" id="avDrop">Remove</button></div>`);
    $('#avSwap').onclick = () => { closeSheet(); $('#pfAvatarFile').click(); };
    $('#avDrop').onclick = async () => {
      const old = S.profile.avatar;
      S.profile.avatar = null;
      renderCard(); saveProfile(); closeSheet();
      await Media.remove(old);
    };
  };
  $('#pfAvatarFile').onchange = async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    const key = await storeImage(f, 400);
    if (key){ S.profile.avatar = key; renderCard(); saveProfile(); }
  };

  $('#pfBanner').onclick = () => {
    if (!S.profile.banner){ $('#pfBannerFile').click(); return; }
    sheet(`<h3>Banner</h3><div class="row">
      <button class="btn sm" style="flex:1" id="bnSwap2">Replace</button>
      <button class="btn danger sm" style="flex:1" id="bnDrop2">Use accent colour</button></div>`);
    $('#bnSwap2').onclick = () => { closeSheet(); $('#pfBannerFile').click(); };
    $('#bnDrop2').onclick = async () => {
      const old = S.profile.banner;
      S.profile.banner = null;
      renderCard(); saveProfile(); closeSheet();
      await Media.remove(old);
    };
  };
  $('#pfBannerFile').onchange = async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    const key = await storeImage(f, 1000);
    if (key){ S.profile.banner = key; renderCard(); saveProfile(); }
  };

  $('#pfBackupGo').onclick = () => exportBackup().then(renderProfile);
  $('#pfRestoreGo').onclick = () => $('#restoreFile').click();
}
