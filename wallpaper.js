/* Calm Journal: "Today's picture". Combines what will make today great (from today's
   morning entry) with the to-do list into a phone-sized image for the lock screen.
   Uses globals from app.js: S, entryId, todayISO, readTasks, modal, toast, download, setting, setSetting. */
(() => {
'use strict';
const W = 1179, H = 2556;
const PAL = {
  navy: ['#14304f', '#2b5c8a', '#e3c47e', 'Navy and gold'],
  forest: ['#10322b', '#2c6b58', '#f0d9a0', 'Forest and sand'],
  dusk: ['#2a1f4d', '#6a4a8c', '#f6c9a0', 'Dusk and peach'],
};
const PAL_KEYS = Object.keys(PAL);

function wrap(c, text, maxW) {
  const out = []; let cur = '';
  for (const w of String(text).split(/\s+/)) {
    const t = cur ? `${cur} ${w}` : w;
    if (c.measureText(t).width > maxW && cur) { out.push(cur); cur = w; } else cur = t;
  }
  if (cur) out.push(cur);
  return out;
}

function paint(c, s, draw, y0, P, data, limit) {
  const X = 110, MW = W - 220, TX = X + 84 * s;
  let y = y0;
  const font = (px, bold) => { c.font = `${bold ? 700 : 500} ${px}px -apple-system,"SF Pro Display",system-ui,"Segoe UI",Roboto,sans-serif`; };
  const fS = Math.round(38 * s), fH = Math.round(52 * s), fB = Math.round(52 * s), lh = fB * 1.28, gap = 30 * s;
  c.textAlign = 'left';
  font(fS, true); y += fS;
  if (draw) { c.fillStyle = P[2]; c.fillText(data.date.toUpperCase(), X, y); }
  y += 70 * s;
  if (data.great.length) {
    font(fH, true); y += fH;
    if (draw) { c.fillStyle = '#f4f7fb'; c.fillText('What will make today great', X, y); }
    y += 44 * s;
    data.great.forEach((g, i) => {
      font(fB, false);
      const ls = wrap(c, g, MW - 84 * s);
      if (draw) {
        font(fB, true); c.fillStyle = P[2]; c.fillText(String(i + 1), X + 6 * s, y + fB);
        font(fB, false); c.fillStyle = '#f4f7fb';
        ls.forEach((l, k) => c.fillText(l, TX, y + fB + k * lh));
      }
      y += ls.length * lh + gap;
    });
  }
  if (data.great.length && data.items.length) {
    y += 20 * s;
    if (draw) { c.fillStyle = 'rgba(255,255,255,.22)'; c.fillRect(X, y, MW, 2); }
    y += 70 * s;
  }
  if (data.items.length) {
    font(fH, true); y += fH;
    const done = data.items.filter((i) => i.d).length;
    if (draw) {
      c.fillStyle = '#f4f7fb'; c.fillText('To-do', X, y);
      c.textAlign = 'right'; c.fillStyle = P[2]; c.fillText(`${done}/${data.items.length}`, W - X, y); c.textAlign = 'left';
    }
    y += 44 * s;
    data.items.slice(0, limit).forEach((it) => {
      font(fB, false);
      const ls = wrap(c, it.t, MW - 84 * s);
      if (draw) {
        const cy = y + fB * 0.62, r = 22 * s, cx = X + 26 * s;
        c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2);
        c.lineWidth = 4 * s; c.strokeStyle = P[2];
        if (it.d) {
          c.fillStyle = P[2]; c.fill();
          c.beginPath(); c.moveTo(cx - 10 * s, cy); c.lineTo(cx - 2 * s, cy + 9 * s); c.lineTo(cx + 11 * s, cy - 9 * s);
          c.strokeStyle = P[0]; c.lineWidth = 5 * s; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke();
        } else c.stroke();
        c.globalAlpha = it.d ? 0.55 : 1; c.fillStyle = '#f4f7fb'; font(fB, false);
        ls.forEach((l, k) => c.fillText(l, TX, y + fB + k * lh));
        c.globalAlpha = 1;
      }
      y += ls.length * lh + gap;
    });
    if (limit < data.items.length) {
      const f = Math.round(fB * 0.8);
      font(f, false); y += f;
      if (draw) { c.fillStyle = P[2]; c.fillText(`+${data.items.length - limit} more`, TX, y); }
      y += gap;
    }
  }
  return y;
}

function renderCanvas(data, palKey, leaveClockSpace) {
  const P = PAL[palKey] || PAL.navy;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, P[0]); g.addColorStop(1, P[1]);
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.globalAlpha = 0.1; c.fillStyle = P[2]; c.beginPath(); c.arc(W * 0.9, H * 0.08, 420, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
  const y0 = leaveClockSpace ? 900 : 260, maxY = H - 260;
  let s = 1, limit = data.items.length;
  while (s > 0.56 && paint(c, s, false, y0, P, data, limit) > maxY) s -= 0.05;
  while (limit > 1 && paint(c, s, false, y0, P, data, limit) > maxY) limit--;
  paint(c, s, true, y0, P, data, limit);
  return cv;
}

// Today's content, taken from the app's own data.
function todayData() {
  const day = todayISO();
  const entry = S.entries.get(entryId(day, 'morning'));
  const great = [];
  if (entry && entry.data) {
    for (let i = 1; i <= 3; i++) { const v = String(entry.data[`great_${i}`] || '').trim(); if (v) great.push(v); }
  }
  const tasks = readTasks();
  const open = tasks.filter((t) => !t.completed).map((t) => ({t: t.text, d: false}));
  const done = tasks.filter((t) => t.completed && t.completedDate === day).map((t) => ({t: t.text, d: true}));
  return {
    date: new Date().toLocaleDateString(undefined, {weekday: 'long', day: 'numeric', month: 'long'}),
    great, items: open.concat(done),
  };
}

const toBlob = (cv) => new Promise((res) => cv.toBlob(res, 'image/png'));

async function open() {
  const data = todayData();
  if (!data.great.length && !data.items.length) {
    return toast('Add a to-do or write today\u2019s morning entry first');
  }
  let pal = setting('wallpaper_palette', 'navy');
  let clock = setting('wallpaper_clock', true);
  for (;;) {
    const cv = renderCanvas(data, pal, clock);
    const blob = await toBlob(cv);
    const file = new File([blob], `calm-journal-today-${todayISO()}.png`, {type: 'image/png'});
    const note = data.great.length ? '' : '<p class="small muted">No morning entry for today yet. Write one on the Today tab and \u201cWhat would make today great?\u201d will appear here.</p>';
    const {v} = await modal('Today\u2019s picture',
      `<img src="${cv.toDataURL('image/png')}" alt="Preview of today\u2019s picture" style="display:block;width:100%;max-width:240px;margin:0 auto 10px;border-radius:18px">
       ${note}<p class="small muted">Tap Save picture, then choose Save Image. Or press and hold the picture and choose Save to Photos. In Photos, tap Share, then Use as Wallpaper.</p>`,
      [['share', 'Save picture'], ['palette', `Colours: ${PAL[pal][3]}`, 'ghost'], ['clock', `Clock space: ${clock ? 'on' : 'off'}`, 'ghost'], ['close', 'Close', 'quiet']]);
    if (v === 'palette') {
      pal = PAL_KEYS[(PAL_KEYS.indexOf(pal) + 1) % PAL_KEYS.length];
      await setSetting('wallpaper_palette', pal); continue;
    }
    if (v === 'clock') { clock = !clock; await setSetting('wallpaper_clock', clock); continue; }
    if (v === 'share') {
      if (navigator.canShare && navigator.canShare({files: [file]})) {
        try { await navigator.share({files: [file], title: file.name}); } catch (e) { if (!e || e.name !== 'AbortError') download(blob, file.name, 'image/png'); }
      } else download(blob, file.name, 'image/png');
    }
    return;
  }
}

window.CalmWallpaper = {open, _render: renderCanvas, _data: todayData};
})();
