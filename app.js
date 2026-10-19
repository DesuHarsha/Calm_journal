'use strict';
/* Calm Journal for iPhone: an offline web app. All data stays in this browser's IndexedDB.
   Backups use the same format as the Android app, so files move freely between the two. */

const APP_VERSION = '1.0.0-web';
const BACKUP_FORMAT = 'calm-journal-backup';
const BACKUP_VERSION = 1;
const PORTABLE_SETTINGS = ['theme', 'ai_base_url', 'ai_model'];
const KEEP_SNAPSHOTS = 14;
const KEEP_SAFETY = 5;
const PIN_ITERATIONS = 150000;

// ------------------------------------------------------------------ templates
const MOODS = [[1, 'Rough', '#cc8578'], [2, 'Low', '#deab7d'], [3, 'Okay', '#d9c98c'], [4, 'Good', '#99bd94'], [5, 'Great', '#6b9e87']];
const MOOD_LABELS = Object.fromEntries(MOODS.map((m) => [m[0], m[1]]));
const MOOD_COLORS = Object.fromEntries(MOODS.map((m) => [m[0], m[2]]));

const TEMPLATES = {
  morning: {
    title: 'Morning', subtitle: 'Five minutes to start the day with intention',
    sections: [
      {key: 'grateful', header: 'I am grateful for...', hint: 'Something you appreciate', lines: 3},
      {key: 'great', header: 'What would make today great?', hint: 'A small, doable thing', lines: 3},
      {key: 'affirmation', header: 'Daily affirmation. I am...', hint: 'I am calm, capable and kind', lines: 1},
    ],
    mood_question: 'How do you feel this morning?', bonus: true,
  },
  evening: {
    title: 'Evening', subtitle: 'Five minutes to reflect and let the day go',
    sections: [
      {key: 'amazing', header: '3 amazing things that happened today...', hint: 'Big or small', lines: 3},
      {key: 'better', header: 'How could I have made today even better?', hint: 'Gently, without judgement', lines: 1},
      {key: 'lesson', header: 'What did I learn today?', hint: 'Optional', lines: 1},
      {key: 'notes', header: 'Notes and thoughts', hint: 'Anything on your mind', lines: 1},
    ],
    mood_question: 'How was your day overall?', bonus: false,
  },
  weekly: {
    title: 'Weekly review', subtitle: 'Look back on the week and plan the next one',
    sections: [
      {key: 'wins', header: 'Wins of the week', hint: 'What went well?', lines: 3},
      {key: 'challenges', header: 'What was challenging?', hint: 'And how did you handle it?', lines: 1},
      {key: 'grateful_people', header: 'People I am grateful for this week', hint: 'Who made a difference?', lines: 1},
      {key: 'focus', header: 'My focus for next week', hint: 'One to three priorities', lines: 3},
    ],
    mood_question: 'How was this week?', bonus: false,
  },
};
const KINDS = ['morning', 'evening', 'weekly'];

const BONUS_PROMPTS = [
  'What is one thing I can let go of today?', 'Who could I reach out to today?',
  'What would I do today if I were not afraid?', 'What am I looking forward to this week?',
  'How can I take care of my body today?', 'What is a small kindness I can offer someone?',
  'What does a calm version of today look like?', 'What is one thing I want to learn more about?',
  'Which worry can I put down, just for today?', 'What made me smile recently?',
  'What is a boundary I want to keep today?', 'How do I want to feel at the end of today?',
  'What is something I am proud of from yesterday?', 'Where can I slow down today?',
];
const QUOTES = [
  ['The happiness of your life depends upon the quality of your thoughts.', 'Marcus Aurelius'],
  ['Wherever you go, there you are.', 'Jon Kabat-Zinn'],
  ['Gratitude turns what we have into enough.', 'Anonymous'],
  ['Nature does not hurry, yet everything is accomplished.', 'Lao Tzu'],
  ['We suffer more often in imagination than in reality.', 'Seneca'],
  ['Almost everything will work again if you unplug it for a few minutes, including you.', 'Anne Lamott'],
  ['What we think, we become.', 'Buddha'],
  ['Act as if what you do makes a difference. It does.', 'William James'],
  ['You cannot always control what goes on outside, but you can control what goes on inside.', 'Wayne Dyer'],
  ['The present moment is filled with joy and happiness. If you are attentive, you will see it.', 'Thich Nhat Hanh'],
  ['Begin at once to live, and count each separate day as a separate life.', 'Seneca'],
  ['Little by little, one travels far.', 'J.R.R. Tolkien'],
  ['Writing is the painting of the voice.', 'Voltaire'],
  ['Be kind to yourself. You are doing the best you can.', 'Anonymous'],
];

// ------------------------------------------------------------------ dates
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const todayISO = () => isoDate(new Date());
const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return isoDate(d); };
const weekdayIdx = (s) => (parseDate(s).getDay() + 6) % 7;
const weekStart = (s) => addDays(s, -weekdayIdx(s));
// Same as Python date.toordinal(), so daily prompts match the Android app.
const ordinal = (s) => { const [y, m, d] = s.split('-').map(Number); return Math.floor(Date.UTC(y, m - 1, d) / 86400000) + 719163; };
const utcNow = () => new Date().toISOString().slice(0, 19) + '+00:00';
const isValidISO = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && isoDate(parseDate(s)) === s;
const longDate = (s) => { const d = parseDate(s); return `${WEEKDAYS[weekdayIdx(s)]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
const shortDate = (s) => { const d = parseDate(s); return `${WEEKDAYS[weekdayIdx(s)].slice(0, 3)} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`; };
const friendlyTime = (iso) => { if (!iso) return 'never'; const d = new Date(iso); return isNaN(d) ? iso : `${shortDate(isoDate(d))} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

const bonusPrompt = (day) => BONUS_PROMPTS[ordinal(day) % BONUS_PROMPTS.length];
const quoteOfDay = (day) => QUOTES[ordinal(day) % QUOTES.length];

function fieldKeys(kind) {
  const keys = [];
  for (const sec of TEMPLATES[kind].sections) {
    if (sec.lines > 1) for (let i = 1; i <= sec.lines; i++) keys.push(`${sec.key}_${i}`);
    else keys.push(sec.key);
  }
  if (TEMPLATES[kind].bonus) keys.push('bonus');
  return keys;
}
const str = (v) => (typeof v === 'string' ? v : '');

function entryText(kind, data) {
  const parts = [];
  for (const sec of (TEMPLATES[kind] || {sections: []}).sections) {
    let vals;
    if (sec.lines > 1) vals = Array.from({length: sec.lines}, (_, i) => str(data[`${sec.key}_${i + 1}`]).trim()).filter(Boolean);
    else vals = [str(data[sec.key]).trim()].filter(Boolean);
    if (vals.length) { parts.push(sec.header); vals.forEach((v) => parts.push('- ' + v)); }
  }
  if (str(data.bonus).trim()) { parts.push(data.bonus_prompt || 'Bonus'); parts.push('- ' + data.bonus.trim()); }
  return parts.join('\n');
}
const isFilled = (kind, data) => fieldKeys(kind).some((k) => str(data[k]).trim());

// ------------------------------------------------------------------ storage (IndexedDB)
const DB = {
  db: null,
  open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('calm-journal', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('entries', {keyPath: 'id'});
        db.createObjectStore('settings', {keyPath: 'key'});
        db.createObjectStore('snapshots', {keyPath: 'id'});
      };
      req.onsuccess = () => { this.db = req.result; resolve(); };
      req.onerror = () => reject(req.error);
    });
  },
  write(store, fn) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(store, 'readwrite');
      fn(tx.objectStore(store));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Storage write aborted'));
    });
  },
  all(store) {
    return new Promise((resolve, reject) => {
      const req = this.db.transaction(store).objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },
  put(store, value) { return this.write(store, (s) => s.put(value)); },
  del(store, key) { return this.write(store, (s) => s.delete(key)); },
  clear(store) { return this.write(store, (s) => s.clear()); },
};

const S = {
  entries: new Map(), settings: {}, view: 'home', day: todayISO(), editor: null,
  locked: false, pinInput: '', hiddenAt: 0, backupCache: null, aiOutput: '', search: '',
};

const entryId = (day, kind) => `${day}|${kind}`;
const getEntry = (day, kind) => S.entries.get(entryId(day, kind)) || null;
const allEntries = () => [...S.entries.values()].sort((a, b) => (a.day + a.kind < b.day + b.kind ? -1 : 1));
const setting = (k, dflt) => (k in S.settings ? S.settings[k] : dflt);

async function setSetting(key, value) {
  S.settings[key] = value;
  await DB.put('settings', {key, value});
}

async function bumpRevision() {
  await setSetting('revision', setting('revision', 0) + 1);
  scheduleBackupWork();
}

async function saveEntry(day, kind, data, mood) {
  const id = entryId(day, kind);
  const existing = S.entries.get(id);
  if (!isFilled(kind, data) && !mood) {
    if (existing) { S.entries.delete(id); await DB.del('entries', id); await bumpRevision(); }
    return false;
  }
  const now = utcNow();
  const entry = {id, day, kind, data, mood: mood || null, created_at: existing ? existing.created_at : now, updated_at: now};
  S.entries.set(id, entry);
  await DB.put('entries', entry);
  await bumpRevision();
  return true;
}

// ------------------------------------------------------------------ backup / restore
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') return Object.keys(v).sort().reduce((o, k) => { o[k] = sortKeys(v[k]); return o; }, {});
  return v;
}
// Matches Python json.dumps(sort_keys=True, separators=(",", ":"), ensure_ascii=False).
const canonical = (v) => JSON.stringify(sortKeys(v));
async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const plainEntry = (e) => ({day: e.day, kind: e.kind, data: e.data, mood: e.mood ?? null, created_at: e.created_at, updated_at: e.updated_at});

async function buildBackup() {
  const entries = allEntries().map(plainEntry);
  const settings = {};
  for (const k of PORTABLE_SETTINGS) if (k in S.settings) settings[k] = S.settings[k];
  return {
    format: BACKUP_FORMAT, version: BACKUP_VERSION, app_version: APP_VERSION, created_at: utcNow(),
    entry_count: entries.length, checksum: await sha256Hex(canonical(entries)), settings, entries,
  };
}
const backupText = async () => JSON.stringify(sortKeys(await buildBackup()), null, 1);

async function parseBackup(text) {
  let payload;
  try { payload = JSON.parse(text); } catch (e) { throw new Error('This file is not a valid backup (bad JSON).'); }
  if (!payload || typeof payload !== 'object' || payload.format !== BACKUP_FORMAT) throw new Error('This file is not a Calm Journal backup.');
  if (Number(payload.version || 0) > BACKUP_VERSION) throw new Error('This backup was made by a newer version of the app. Please update first.');
  const entries = payload.entries;
  if (!Array.isArray(entries)) throw new Error('Backup has no entries list.');
  for (const e of entries) {
    if (!e || typeof e !== 'object' || !KINDS.includes(e.kind) || !e.data || typeof e.data !== 'object' || Array.isArray(e.data)) {
      throw new Error('Backup contains an invalid entry.');
    }
    if (!isValidISO(e.day)) throw new Error(`Backup contains an invalid date: ${e.day}`);
  }
  if (payload.checksum && payload.checksum !== await sha256Hex(canonical(entries))) {
    throw new Error('Backup file is damaged (checksum mismatch).');
  }
  return payload;
}

async function restoreBackup(payload, mode) {
  const stats = {added: 0, updated: 0, skipped: 0};
  if (mode === 'replace') { await DB.clear('entries'); S.entries.clear(); }
  const toWrite = [];
  for (const raw of payload.entries) {
    const id = entryId(raw.day, raw.kind);
    const mood = Number.isInteger(raw.mood) && raw.mood >= 1 && raw.mood <= 5 ? raw.mood : null;
    const created = raw.created_at || raw.updated_at || utcNow();
    const entry = {id, day: raw.day, kind: raw.kind, data: raw.data, mood, created_at: created, updated_at: raw.updated_at || created};
    const existing = S.entries.get(id);
    if (!existing) stats.added++;
    else if ((entry.updated_at || '') > (existing.updated_at || '')) stats.updated++;
    else { stats.skipped++; continue; }
    S.entries.set(id, entry);
    toWrite.push(entry);
  }
  await DB.write('entries', (s) => toWrite.forEach((e) => s.put(e)));
  if (mode === 'replace') {
    const st = payload.settings || {};
    if (['day', 'night', 'auto'].includes(st.theme)) await setSetting('theme', st.theme);
    if (typeof st.ai_base_url === 'string' && st.ai_base_url.startsWith('https://')) await setSetting('ai_base_url', st.ai_base_url);
    if (typeof st.ai_model === 'string' && st.ai_model) await setSetting('ai_model', st.ai_model);
    applyTheme();
  }
  await bumpRevision();
  return stats;
}

async function snapshot(kind) {
  if (!S.entries.size) return null;
  const id = kind === 'auto' ? `auto-${todayISO()}` : `${kind}-${Date.now()}`;
  const snap = {id, kind, created_at: utcNow(), count: S.entries.size, text: await backupText()};
  await DB.put('snapshots', snap);
  const snaps = await DB.all('snapshots');
  const old = (k, keep) => snaps.filter((s) => s.kind === k).sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(keep);
  for (const s of [...old('auto', KEEP_SNAPSHOTS), ...old('pre-restore', KEEP_SAFETY)]) await DB.del('snapshots', s.id);
  return snap;
}

async function autoSnapshot() {
  if (!setting('auto_backup', true) || !S.entries.size) return;
  if (setting('last_snapshot_revision', -1) === setting('revision', 0)) return;
  await snapshot('auto');
  await setSetting('last_snapshot_revision', setting('revision', 0));
}

let backupTimer = null;
function scheduleBackupWork() {
  clearTimeout(backupTimer);
  backupTimer = setTimeout(async () => {
    try {
      S.backupCache = S.entries.size ? {text: await backupText(), name: `calm-journal-backup-${todayISO()}.json`} : null;
      await autoSnapshot();
    } catch (e) { console.error(e); }
  }, 600);
}

function exportMarkdown() {
  const lines = ['# Calm Journal', ''];
  let current = null;
  for (const e of allEntries()) {
    if (e.day !== current) {
      current = e.day;
      const d = parseDate(current);
      lines.push('', `## ${WEEKDAYS[weekdayIdx(current)]}, ${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`, '');
    }
    lines.push('### ' + TEMPLATES[e.kind].title);
    if (e.mood) lines.push(`Mood: ${MOOD_LABELS[e.mood] || e.mood}`);
    lines.push(entryText(e.kind, e.data), '');
  }
  return lines.join('\n').trim() + '\n';
}

function download(text, name, mime) {
  const url = URL.createObjectURL(new Blob([text], {type: mime}));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// Must be called straight from a tap so iOS allows the share sheet.
async function shareFile(text, name, mime) {
  const file = new File([text], name, {type: mime});
  if (navigator.canShare && navigator.canShare({files: [file]})) {
    try { await navigator.share({files: [file], title: name}); return true; } catch (e) {
      if (e && e.name === 'AbortError') return false;
    }
  }
  download(text, name, mime);
  return true;
}

// ------------------------------------------------------------------ insights
const STOPWORDS = new Set(`a about above after again against all also am an and any are as at be because been before being
below between both but by can could did do does doing down during each few for from further get got had
has have having he her here hers herself him himself his how i if in into is it its itself just let me
more most my myself no nor not now of off on once only or other our ours ourselves out over own really
same she should so some still such than that the their theirs them themselves then there these they
this those through to too today under until up very was we were what when where which while who whom
why will with would you your yours yourself yourselves day thing things lot make made made more much
feel felt bit able going went one two three get getting even well way time back being something`.split(/\s+/));
const POSITIVE = new Set(`calm grateful thankful happy joy joyful love loved peaceful relaxed proud excited great good amazing
wonderful fun laughed laugh smile smiled energized rested kind beautiful hope hopeful confident
productive accomplished inspired content satisfied delicious healthy strong progress win won success`.split(/\s+/));
const NEGATIVE = new Set(`tired stressed stress anxious anxiety sad angry upset worried worry overwhelmed exhausted lonely bored
frustrated frustrating annoyed sick pain hurt afraid scared fear late rushed guilty disappointed bad
awful terrible difficult hard struggle struggled cried argument conflict`.split(/\s+/));

const words = (text) => (str(text).match(/[A-Za-z][A-Za-z']+/g) || []).map((w) => w.toLowerCase().replace(/^'+|'+$/g, ''));
const contentWords = (text) => words(text).filter((w) => w.length > 2 && !STOPWORDS.has(w));

class Counter extends Map {
  add(items) { for (const k of items) this.set(k, (this.get(k) || 0) + 1); }
  mostCommon(n) { return [...this.entries()].sort((a, b) => b[1] - a[1]).slice(0, n); }
}
const avg = (vals) => { const v = vals.filter((x) => x != null); return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100 : null; };

function computeStreaks(days, today) {
  const ds = [...new Set(days)].sort();
  if (!ds.length) return [0, 0];
  let longest = 1, run = 1;
  for (let i = 1; i < ds.length; i++) { run = addDays(ds[i - 1], 1) === ds[i] ? run + 1 : 1; longest = Math.max(longest, run); }
  const present = new Set(ds);
  let cur = present.has(today) ? today : addDays(today, -1), current = 0;
  while (present.has(cur)) { current++; cur = addDays(cur, -1); }
  return [current, longest];
}

function dailyMoods(entries) {
  const moods = {};
  for (const e of entries) {
    if (e.mood && (e.kind === 'morning' || e.kind === 'evening')) {
      if (e.kind === 'evening' || !(e.day in moods)) moods[e.day] = e.mood;
    }
  }
  return moods;
}

function sentiment(text) {
  const ws = words(text);
  const pos = ws.filter((w) => POSITIVE.has(w)).length, neg = ws.filter((w) => NEGATIVE.has(w)).length;
  return pos + neg === 0 ? 0 : Math.round(((pos - neg) / (pos + neg)) * 100) / 100;
}

function summarize(entries, today = todayISO()) {
  const days = entries.map((e) => e.day);
  const [current, longest] = computeStreaks(days, today);
  const moods = dailyMoods(entries);
  const windowDays = (start, len) => Array.from({length: len}, (_, i) => addDays(today, -(start + i)));
  const last7 = windowDays(0, 7), prev7 = windowDays(7, 7);
  const avg7 = avg(last7.map((d) => moods[d])), avgPrev = avg(prev7.map((d) => moods[d]));
  let trend = null;
  if (avg7 != null && avgPrev != null) { const diff = avg7 - avgPrev; trend = diff >= 0.3 ? 'up' : diff <= -0.3 ? 'down' : 'steady'; }
  const byWeekday = {};
  for (const [d, m] of Object.entries(moods)) (byWeekday[weekdayIdx(d)] = byWeekday[weekdayIdx(d)] || []).push(m);
  const weekdayAvg = {};
  for (const [wd, v] of Object.entries(byWeekday)) weekdayAvg[wd] = avg(v);
  const series = windowDays(0, 14).reverse().map((d) => [d, moods[d] || null]);

  const gratitude = new Counter(), themes = new Counter(), good = new Counter(), low = new Counter();
  let totalWords = 0;
  for (const e of entries) {
    const text = entryText(e.kind, e.data);
    totalWords += words(text).length;
    const cw = new Set(contentWords(text));
    themes.add(cw);
    for (const [k, v] of Object.entries(e.data)) {
      if (/^(grateful_|amazing_|wins_)/.test(k)) gratitude.add(new Set(contentWords(v)));
    }
    const m = moods[e.day];
    if (m && m >= 4) good.add(cw); else if (m && m <= 2) low.add(cw);
  }
  const last30 = new Set(windowDays(0, 30));
  const recent = entries.filter((e) => last30.has(e.day));
  const morningDays = new Set(recent.filter((e) => e.kind === 'morning').map((e) => e.day));
  const eveningDays = new Set(recent.filter((e) => e.kind === 'evening').map((e) => e.day));
  const boosters = good.mostCommon(30).filter(([w, c]) => c >= 2 && c > 2 * (low.get(w) || 0)).map(([w]) => w).slice(0, 5);
  const s = {
    total_days: new Set(days).size, total_entries: entries.length, current_streak: current, longest_streak: longest,
    total_words: totalWords, avg_mood_7: avg7, avg_mood_prev_7: avgPrev, mood_trend: trend, weekday_avg: weekdayAvg,
    mood_series: series, top_gratitude: gratitude.mostCommon(8), top_themes: themes.mostCommon(10), mood_boosters: boosters,
    morning_days_30: morningDays.size, evening_days_30: eveningDays.size,
    both_days_30: [...morningDays].filter((d) => eveningDays.has(d)).length,
    sentiment_30: recent.length ? avg(recent.map((e) => sentiment(entryText(e.kind, e.data)))) : null,
  };
  s.observations = observations(s);
  return s;
}

function observations(s) {
  const out = [];
  if (s.total_entries === 0) return ['Write your first entry to start seeing insights here.'];
  if (s.current_streak >= 2) out.push(`You are on a ${s.current_streak}-day streak. Lovely consistency.`);
  else if (s.current_streak === 0) out.push('No entry yet today or yesterday. Five minutes is all it takes to restart.');
  if (s.mood_trend === 'up') out.push(`Your mood this week is higher than last week (${s.avg_mood_7.toFixed(1)} vs ${s.avg_mood_prev_7.toFixed(1)}).`);
  else if (s.mood_trend === 'down') out.push(`Your mood dipped compared to last week (${s.avg_mood_7.toFixed(1)} vs ${s.avg_mood_prev_7.toFixed(1)}). Be gentle with yourself.`);
  else if (s.mood_trend === 'steady') out.push('Your mood has been steady over the last two weeks.');
  const wd = Object.entries(s.weekday_avg).filter(([, v]) => v != null);
  if (wd.length >= 4) {
    const best = wd.reduce((a, b) => (b[1] > a[1] ? b : a)), worst = wd.reduce((a, b) => (b[1] < a[1] ? b : a));
    if (best[1] - worst[1] >= 0.5) out.push(`${WEEKDAYS[best[0]]}s tend to be your best days; ${WEEKDAYS[worst[0]]}s are usually harder.`);
  }
  if (s.top_gratitude.length) out.push(`You often feel grateful for: ${s.top_gratitude.slice(0, 4).map((x) => x[0]).join(', ')}.`);
  if (s.mood_boosters.length) out.push(`Good days often mention: ${s.mood_boosters.slice(0, 4).join(', ')}.`);
  if (s.morning_days_30 > s.evening_days_30 + 5) out.push('Mornings are your habit. An evening reminder could help close the loop.');
  else if (s.evening_days_30 > s.morning_days_30 + 5) out.push('Evenings are your habit. Try a short morning intention as well.');
  return out;
}

// ------------------------------------------------------------------ AI (optional, explicit action only)
const AI_SYSTEM_PROMPT = "You are a warm, concise journaling companion. Read the user's journal entries and reply with: " +
  '1) a short summary of the period, 2) recurring themes and what seems to lift or lower their mood, ' +
  '3) two gentle, practical suggestions, 4) one reflective question for tomorrow. ' +
  'Be kind and non-judgemental, do not diagnose, keep it under 250 words, use plain text with short headings.';

function buildAiMessages(entries, label) {
  const blocks = entries.map((e) => `[${e.day}, ${TEMPLATES[e.kind].title}${e.mood ? ` (mood: ${MOOD_LABELS[e.mood]})` : ''}]\n${entryText(e.kind, e.data)}`);
  const content = `My journal entries for ${label}:\n\n${blocks.join('\n\n') || '(no entries)'}`;
  return [{role: 'system', content: AI_SYSTEM_PROMPT}, {role: 'user', content: content.slice(0, 24000)}];
}

async function askAI(messages) {
  const key = setting('ai_api_key', '');
  if (!key) throw new Error('Add your API key in Settings > AI reflection first.');
  const base = setting('ai_base_url', 'https://api.openai.com/v1').replace(/\/+$/, '');
  if (!base.startsWith('https://')) throw new Error('The AI address must start with https://');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  let res;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: 'POST', signal: ctrl.signal,
      headers: {'Content-Type': 'application/json', Authorization: `Bearer ${key}`},
      body: JSON.stringify({model: setting('ai_model', 'gpt-4o-mini'), messages, temperature: 0.6}),
    });
  } catch (e) {
    throw new Error(`Could not reach the AI service: ${e.name === 'AbortError' ? 'timed out' : e.message}`);
  } finally { clearTimeout(timer); }
  let data = null;
  try { data = await res.json(); } catch (e) { /* handled below */ }
  if (!res.ok) throw new Error(`AI service error ${res.status}. ${(data && data.error && data.error.message) || ''}`.trim());
  const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!text) throw new Error('Unexpected AI response format.');
  return text.trim();
}

// ------------------------------------------------------------------ PIN
const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (h) => new Uint8Array(h.match(/../g).map((x) => parseInt(x, 16)));
async function pbkdf2(pin, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({name: 'PBKDF2', hash: 'SHA-256', salt, iterations}, key, 256));
}
async function hashPin(pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2_sha256$${PIN_ITERATIONS}$${hex(salt)}$${hex(await pbkdf2(pin, salt, PIN_ITERATIONS))}`;
}
async function verifyPin(pin, stored) {
  try {
    const [algo, iters, salt, digest] = stored.split('$');
    if (algo !== 'pbkdf2_sha256') return false;
    const got = hex(await pbkdf2(pin, unhex(salt), Number(iters)));
    let diff = got.length ^ digest.length;
    for (let i = 0; i < Math.min(got.length, digest.length); i++) diff |= got.charCodeAt(i) ^ digest.charCodeAt(i);
    return diff === 0;
  } catch (e) { return false; }
}
const lockoutSeconds = (n) => (n < 5 ? 0 : Math.min(300, 30 * 2 ** (n - 5)));

// ------------------------------------------------------------------ UI helpers
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const isStandalone = () => window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;

let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

function modal(title, bodyHtml, buttons) {
  return new Promise((resolve) => {
    const root = $('#modal-root');
    root.innerHTML = `<div class="modal-back"><div class="modal" role="dialog" aria-modal="true">
      <h3>${esc(title)}</h3><div class="modal-body">${bodyHtml}</div>
      <div class="modal-actions">${buttons.map(([v, label, cls]) => `<button class="btn ${cls || ''}" data-v="${v}">${esc(label)}</button>`).join('')}</div>
    </div></div>`;
    const first = root.querySelector('input'); if (first) setTimeout(() => first.focus(), 50);
    root.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => {
      const vals = {}; root.querySelectorAll('input').forEach((i) => { vals[i.name] = i.value; });
      root.innerHTML = '';
      resolve({v: b.dataset.v, vals});
    }));
  });
}
const alertModal = (title, text) => modal(title, `<p>${esc(text)}</p>`, [['ok', 'OK']]);
const confirmModal = async (title, text, yes, cls = '') => (await modal(title, `<p>${esc(text)}</p>`, [['yes', yes, cls], ['no', 'Cancel', 'quiet']])).v === 'yes';

function resolvedTheme() {
  const t = setting('theme', 'auto');
  if (t === 'auto') return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'day';
  return t;
}
function applyTheme() {
  const t = resolvedTheme();
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name=theme-color]').setAttribute('content', t === 'night' ? '#1b1f1d' : '#f4f1ea');
}

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}
function firstLine(e) {
  const vals = Object.keys(e.data).sort().filter((k) => k !== 'bonus_prompt').map((k) => str(e.data[k]).trim()).filter(Boolean);
  return vals[0] || (e.mood ? `Mood: ${MOOD_LABELS[e.mood]}` : '');
}
const switchHtml = (name, on) => `<label class="switch"><input type="checkbox" data-toggle="${name}" ${on ? 'checked' : ''}><span></span></label>`;

// ------------------------------------------------------------------ views
function viewHome() {
  const day = S.day, today = todayISO();
  const days = allEntries().map((e) => e.day);
  const [streak] = computeStreaks(days, today);
  const [quote, author] = quoteOfDay(day);
  const daysSinceExport = setting('last_export_at') ? (Date.now() - new Date(setting('last_export_at'))) / 86400000 : Infinity;
  const card = (kind, d, sub) => {
    const e = getEntry(d, kind);
    const done = e && (isFilled(kind, e.data) || e.mood);
    return `<section class="card accent">
      <div class="row between"><h2>${TEMPLATES[kind].title}</h2><span class="chip ${done ? 'done' : ''}">${done ? 'Done' : 'Not yet'}</span></div>
      <p class="muted">${esc(sub)}</p>
      <button class="btn" data-act="open" data-kind="${kind}" data-day="${d}">${done ? 'Edit' : 'Start'} ${kind === 'weekly' ? 'review' : kind}</button>
    </section>`;
  };
  return `
    <div class="row between" style="margin-top:10px">
      <button class="iconbtn" data-act="prev-day" aria-label="Previous day">&#8249;</button>
      <div class="center grow"><h1>${day === today ? greeting() : esc(shortDate(day))}</h1><p class="muted">${esc(longDate(day))}</p></div>
      <button class="iconbtn" data-act="next-day" aria-label="Next day" ${day >= today ? 'disabled' : ''}>&#8250;</button>
    </div>
    ${!isStandalone() ? `<section class="card soft"><h2>Add to your Home Screen</h2>
      <p>In Safari, tap the <b>Share</b> button, then <b>Add to Home Screen</b>. Always open Calm Journal from that icon: entries written in the Home Screen app are kept separately from Safari.</p></section>` : ''}
    <div class="grid2" style="margin-top:14px">
      <div class="card stat"><b>${streak}</b><span>day streak</span></div>
      <div class="card stat"><b>${new Set(days).size}</b><span>days journaled</span></div>
    </div>
    <section class="card"><p class="quote">${esc(quote)}</p><p class="muted small">${esc(author)}</p></section>
    ${S.entries.size && setting('backup_nudge', true) && daysSinceExport > 7 ? `<section class="card soft">
      <h2>Keep a copy safe</h2><p class="small">Last backup saved to Files: ${esc(friendlyTime(setting('last_export_at')))}. Save one to iCloud Drive so your journal survives a lost or replaced phone.</p>
      <button class="btn" data-act="export">Save backup to Files</button></section>` : ''}
    ${card('morning', day, TEMPLATES.morning.subtitle)}
    ${card('evening', day, TEMPLATES.evening.subtitle)}
    ${card('weekly', weekStart(day), `Week of ${shortDate(weekStart(day))}`)}`;
}

function viewEditor() {
  const ed = S.editor, t = TEMPLATES[ed.kind];
  const field = (key, hint, multi, num) => multi
    ? `<textarea data-key="${key}" placeholder="${esc(hint)}" rows="3">${esc(ed.data[key] || '')}</textarea>`
    : `<div class="numbered"><span>${num}.</span><textarea class="numbered-answer" data-key="${key}" placeholder="${esc(hint)}" rows="1">${esc(ed.data[key] || '')}</textarea></div>`;
  let form = '';
  for (const sec of t.sections) {
    form += `<label class="field-label">${esc(sec.header)}</label>`;
    if (sec.lines > 1) for (let i = 1; i <= sec.lines; i++) form += field(`${sec.key}_${i}`, sec.hint, false, i);
    else form += field(sec.key, sec.hint, true);
  }
  if (t.bonus) form += `<label class="field-label">Bonus prompt</label><p class="muted">${esc(ed.prompt)}</p>${field('bonus', 'Your answer', true)}`;
  const moods = MOODS.map(([v, label, color]) => `<button class="mood ${ed.mood === v ? 'sel' : ''}" data-act="mood" data-mood="${v}"><i style="background:${color}"></i>${label}</button>`).join('');
  const exists = !!getEntry(ed.day, ed.kind);
  return `
    <div class="topbar row">
      <button class="iconbtn" data-act="close-editor" aria-label="Back">&#8249;</button>
      <div class="grow"><div class="title">${esc(t.title)}</div><div class="muted small">${esc(ed.kind === 'weekly' ? 'Week of ' + longDate(ed.day) : longDate(ed.day))}</div></div>
      <button class="btn small" data-act="save-editor">Save</button>
    </div>
    <p class="muted" style="margin-top:16px">${esc(t.subtitle)}</p>
    ${form}
    <label class="field-label">${esc(t.mood_question)}</label>
    <div class="moods">${moods}</div>
    <p class="muted small center">Your words save automatically as you type.</p>
    ${exists ? '<button class="btn danger" data-act="delete-entry">Delete this entry</button>' : ''}`;
}

function viewHistory() {
  const q = S.search.trim().toLowerCase();
  const byDay = new Map();
  for (const e of allEntries().reverse()) {
    if (q && !(entryText(e.kind, e.data).toLowerCase().includes(q) || e.day.includes(q))) continue;
    if (!byDay.has(e.day)) byDay.set(e.day, []);
    byDay.get(e.day).push(e);
  }
  const items = [...byDay.entries()].slice(0, 200).map(([day, list]) => {
    const mood = dailyMoods(list)[day];
    return `<section class="card">
      <div class="row between"><b>${esc(longDate(day))}</b>${mood ? `<span class="dot" style="background:${MOOD_COLORS[mood]}" title="${MOOD_LABELS[mood]}"></span>` : ''}</div>
      ${list.map((e) => `<div class="list-item" data-act="open" data-kind="${e.kind}" data-day="${e.day}" style="padding-top:8px">
        <span class="chip done">${TEMPLATES[e.kind].title}</span><div class="preview">${esc(firstLine(e))}</div></div>`).join('')}
    </section>`;
  }).join('');
  return `<h1>Journal</h1>
    <input type="search" id="search" placeholder="Search your entries" value="${esc(S.search)}">
    <div id="history-list">${items || `<p class="muted center" style="margin-top:30px">${q ? 'No entries match your search.' : 'Your entries will appear here.'}</p>`}</div>`;
}

function viewInsights() {
  const s = summarize(allEntries());
  const bars = s.mood_series.map(([d, m]) => `<div><i style="height:${m ? m * 20 : 4}%;background:${m ? MOOD_COLORS[m] : 'var(--chip)'}"></i><small>${WEEKDAYS[weekdayIdx(d)][0]}</small></div>`).join('');
  const wbars = WEEKDAYS.map((w, i) => { const v = s.weekday_avg[i]; return `<div><i style="height:${v ? v * 20 : 4}%;background:${v ? 'var(--accent)' : 'var(--chip)'}"></i><small>${w.slice(0, 2)}</small></div>`; }).join('');
  const chips = (list) => list.length ? list.map(([w, c]) => `<span class="chip">${esc(w)} · ${c}</span>`).join('') : '<p class="muted small">Not enough entries yet.</p>';
  const trend = {up: 'Rising', down: 'Dipping', steady: 'Steady'}[s.mood_trend] || '-';
  return `<h1>Insights</h1><p class="muted">Calculated on this iPhone. Nothing leaves the device.</p>
    <div class="grid2" style="margin-top:14px">
      <div class="card stat"><b>${s.current_streak}</b><span>current streak</span></div>
      <div class="card stat"><b>${s.longest_streak}</b><span>longest streak</span></div>
      <div class="card stat"><b>${s.total_entries}</b><span>entries</span></div>
      <div class="card stat"><b>${s.total_words}</b><span>words written</span></div>
    </div>
    <section class="card"><h2>Mood, last 14 days</h2>
      <p class="muted small">This week ${s.avg_mood_7 ?? '-'} · last week ${s.avg_mood_prev_7 ?? '-'} · ${trend}</p>
      <div class="bars">${bars}</div></section>
    <section class="card"><h2>Gentle observations</h2><ul>${s.observations.map((o) => `<li>${esc(o)}</li>`).join('')}</ul></section>
    <section class="card"><h2>Mood by weekday</h2><div class="bars">${wbars}</div></section>
    <section class="card"><h2>Last 30 days</h2>
      <p>Mornings: <b>${s.morning_days_30}</b> · Evenings: <b>${s.evening_days_30}</b> · Both: <b>${s.both_days_30}</b></p>
      ${s.sentiment_30 != null ? `<p class="muted small">Tone of your writing: ${s.sentiment_30 > 0.2 ? 'mostly positive' : s.sentiment_30 < -0.2 ? 'heavier than usual' : 'balanced'}</p>` : ''}</section>
    <section class="card"><h2>Often grateful for</h2>${chips(s.top_gratitude)}</section>
    <section class="card"><h2>Recurring themes</h2>${chips(s.top_themes)}</section>
    <section class="card"><h2>AI reflection</h2>
      <p class="small muted">Optional. Sends the selected entries to your AI provider only when you tap the button.</p>
      <div class="seg" id="ai-range"><button data-act="ai-range" data-days="7" class="${setting('ai_days', 7) === 7 ? 'on' : ''}">Last 7 days</button><button data-act="ai-range" data-days="30" class="${setting('ai_days', 7) === 30 ? 'on' : ''}">Last 30 days</button></div>
      <button class="btn" data-act="ask-ai">${setting('ai_api_key') ? 'Reflect with AI' : 'Set up AI in Settings'}</button>
      <div class="ai-output" id="ai-output">${esc(S.aiOutput)}</div></section>`;
}

function viewSettings() {
  const theme = setting('theme', 'auto');
  return `<h1>Settings</h1>
    <section class="card"><h2>Appearance</h2>
      <div class="seg">${['auto', 'day', 'night'].map((t) => `<button data-act="theme" data-theme="${t}" class="${theme === t ? 'on' : ''}">${t === 'auto' ? 'Automatic' : t === 'day' ? 'Day' : 'Night'}</button>`).join('')}</div></section>

    <section class="card"><h2>Reminders</h2>
      <p class="small">iPhone web apps can't schedule their own notifications, so the built-in <b>Shortcuts</b> app sends your morning and evening reminders.</p>
      <details><summary>Set up reminders (2 minutes)</summary><ol class="steps small">
        <li>Open the <b>Shortcuts</b> app and tap <b>Automation</b> at the bottom.</li>
        <li>Tap <b>+</b> (or <b>New Automation</b>), then choose <b>Time of Day</b>.</li>
        <li>Set the time to <b>7:30 AM</b>, choose <b>Daily</b>, select <b>Run Immediately</b>, then tap <b>Next</b>.</li>
        <li>Tap <b>New Blank Automation</b>, then <b>Add Action</b>. Search for <b>Show Notification</b> and add it.</li>
        <li>Replace the text with <i>Morning journal: three gratitudes and today's intention</i>. Tap <b>Done</b>.</li>
        <li>Repeat for the evening at <b>9:30 PM</b> with <i>Evening journal: three amazing things today</i>.</li>
        <li>When the reminder arrives, open <b>Calm Journal</b> from your Home Screen (keep it in the Dock for one tap).</li>
      </ol><p class="muted small">Make sure Shortcuts notifications are allowed in Settings > Notifications > Shortcuts.</p></details></section>

    <section class="card"><h2>Backup and restore</h2>
      <div class="setting"><div class="grow">Automatic daily backup<div class="muted small">Keeps the last ${KEEP_SNAPSHOTS} daily copies inside the app.</div></div>${switchHtml('auto_backup', setting('auto_backup', true))}</div>
      <div class="setting"><div class="grow">Weekly reminder to save a copy<div class="muted small">A gentle card on Today when your last saved backup is over a week old.</div></div>${switchHtml('backup_nudge', setting('backup_nudge', true))}</div>
      <p class="small muted">Last saved to Files: ${esc(friendlyTime(setting('last_export_at')))}</p>
      <button class="btn" data-act="export">Save backup to Files / iCloud</button>
      <button class="btn ghost" data-act="import">Restore from a backup file</button>
      <button class="btn quiet" data-act="export-md">Export as readable text (Markdown)</button>
      <details style="margin-top:12px"><summary>Backups kept on this iPhone</summary><div id="snapshots" class="small muted">Loading...</div></details>
      <p class="muted small">Backup files work with the Android version of Calm Journal too.</p></section>

    <section class="card"><h2>Privacy</h2>
      <div class="setting"><div class="grow">PIN lock<div class="muted small">${setting('pin_hash') ? 'On' : 'Off'}. Keeps casual eyes out. Entries are stored only on this iPhone.</div></div>
        <button class="btn small" data-act="${setting('pin_hash') ? 'pin-remove' : 'pin-set'}">${setting('pin_hash') ? 'Remove' : 'Set PIN'}</button></div>
      ${setting('pin_hash') ? `<button class="btn quiet" data-act="pin-set">Change PIN</button>
      <label class="field-label">Lock after leaving the app</label>
      <select data-select="lock_after">${[[0, 'Immediately'], [60, 'After 1 minute'], [300, 'After 5 minutes'], [900, 'After 15 minutes']].map(([v, l]) => `<option value="${v}" ${setting('lock_after', 60) === v ? 'selected' : ''}>${l}</option>`).join('')}</select>` : ''}
      <p class="muted small" id="persist-status"></p></section>

    <section class="card"><h2>AI reflection (optional)</h2>
      <p class="small muted">Works with any OpenAI-compatible service. Your key stays on this iPhone and is never included in backups.</p>
      <input type="url" id="ai_base_url" placeholder="https://api.openai.com/v1" value="${esc(setting('ai_base_url', 'https://api.openai.com/v1'))}" autocapitalize="off" autocorrect="off">
      <input type="text" id="ai_model" placeholder="Model, e.g. gpt-4o-mini" value="${esc(setting('ai_model', 'gpt-4o-mini'))}" autocapitalize="off" autocorrect="off">
      <input type="password" id="ai_api_key" placeholder="${setting('ai_api_key') ? 'API key saved (enter a new one to replace)' : 'API key'}" autocomplete="off">
      <button class="btn" data-act="save-ai">Save AI settings</button>
      ${setting('ai_api_key') ? '<button class="btn quiet" data-act="clear-ai">Remove API key</button>' : ''}</section>

    <section class="card"><h2>Danger zone</h2>
      <button class="btn danger" data-act="delete-all">Delete all entries</button>
      <p class="muted small">A safety copy is kept under "Backups kept on this iPhone".</p></section>
    <p class="muted small center">Calm Journal ${APP_VERSION} · works offline</p>`;
}

function viewLock() {
  const len = setting('pin_length', 4);
  const dots = Array.from({length: len}, (_, i) => `<i class="${i < S.pinInput.length ? 'on' : ''}"></i>`).join('');
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => `<button data-act="pin" data-d="${d}">${d}</button>`).join('');
  return `<div class="lock"><h1>Calm Journal</h1><p class="muted" id="lock-msg">Enter your PIN</p>
    <div class="pin-dots" id="pin-dots">${dots}</div>
    <div class="keypad">${keys}<button class="blank" data-act="forgot-pin">Forgot?</button><button data-act="pin" data-d="0">0</button><button class="blank" data-act="pin-back">Delete</button></div></div>`;
}

function render() {
  document.body.classList.toggle('no-nav', S.locked || S.view === 'editor');
  const views = {home: viewHome, editor: viewEditor, history: viewHistory, insights: viewInsights, settings: viewSettings};
  $('#app').innerHTML = S.locked ? viewLock() : views[S.view]();
  $('#app').querySelectorAll('textarea.numbered-answer').forEach((t) => { t.style.height = 'auto'; t.style.height = `${Math.max(50, t.scrollHeight)}px`; });
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.nav === S.view));
  if (!S.locked && S.view === 'settings') { renderSnapshots(); renderPersistStatus(); }
}

async function renderSnapshots() {
  const el = $('#snapshots'); if (!el) return;
  const snaps = (await DB.all('snapshots')).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  el.innerHTML = snaps.length ? snaps.map((s) => `<div class="setting"><div class="grow">${s.kind === 'auto' ? 'Daily' : 'Safety copy'} · ${esc(friendlyTime(s.created_at))}<br>${s.count} entries</div>
    <button class="btn small quiet" data-act="snap-share" data-id="${esc(s.id)}">Save</button>
    <button class="btn small ghost" data-act="snap-restore" data-id="${esc(s.id)}">Restore</button></div>`).join('')
    : 'No backups yet. One is made automatically after you write.';
}
async function renderPersistStatus() {
  const el = $('#persist-status'); if (!el || !navigator.storage || !navigator.storage.persisted) return;
  const p = await navigator.storage.persisted();
  el.textContent = p ? 'Storage is protected from automatic clean-up.' : 'Tip: open the app from the Home Screen icon so iOS keeps its storage.';
}

// ------------------------------------------------------------------ editor logic
function openEditor(kind, day) {
  if (kind === 'weekly') day = weekStart(day);
  const e = getEntry(day, kind);
  S.editor = {kind, day, data: e ? {...e.data} : {}, mood: e ? e.mood : null};
  if (TEMPLATES[kind].bonus) S.editor.prompt = S.editor.data.bonus_prompt || bonusPrompt(day);
  S.view = 'editor';
  render();
  window.scrollTo(0, 0);
}

let autosaveTimer = null;
function scheduleAutosave() { clearTimeout(autosaveTimer); autosaveTimer = setTimeout(() => flushEditor(), 700); }
async function flushEditor() {
  clearTimeout(autosaveTimer);
  const ed = S.editor; if (!ed) return false;
  const data = {};
  for (const k of fieldKeys(ed.kind)) if (str(ed.data[k]).trim()) data[k] = ed.data[k];
  if (TEMPLATES[ed.kind].bonus && data.bonus) data.bonus_prompt = ed.prompt;
  const prev = getEntry(ed.day, ed.kind);
  if (prev && canonical(prev.data) === canonical(data) && (prev.mood || null) === (ed.mood || null)) return true;
  return saveEntry(ed.day, ed.kind, data, ed.mood);
}
async function closeEditor() { await flushEditor(); S.editor = null; S.view = 'home'; render(); }

// ------------------------------------------------------------------ restore flow
async function restoreFromText(text, sourceLabel) {
  let payload;
  try { payload = await parseBackup(text); } catch (e) { return alertModal('Cannot restore', e.message); }
  const n = payload.entries.length;
  const {v} = await modal('Restore backup', `<p>${esc(sourceLabel)} contains <b>${n}</b> entries (made ${esc(friendlyTime(payload.created_at))}).</p>
    <p class="small"><b>Merge</b> adds missing entries and keeps the newer version of each day.<br><b>Replace</b> deletes everything on this iPhone first.</p>
    <p class="muted small">A safety copy of your current journal is saved before restoring.</p>`,
  [['merge', 'Merge'], ['replace', 'Replace everything', 'danger'], ['cancel', 'Cancel', 'quiet']]);
  if (v !== 'merge' && v !== 'replace') return;
  if (v === 'replace' && !(await confirmModal('Replace everything?', 'All entries on this iPhone will be replaced by the backup.', 'Replace', 'danger'))) return;
  await snapshot('pre-restore');
  const st = await restoreBackup(payload, v);
  render();
  toast(`Restored: ${st.added} added, ${st.updated} updated, ${st.skipped} unchanged`);
}

// ------------------------------------------------------------------ PIN flows
async function pinSetFlow() {
  if (setting('pin_hash') && !(await askCurrentPin())) return;
  const {v, vals} = await modal('Choose a PIN', `<p class="small">4 to 8 digits. If you forget it, the only way back in is to erase the app and restore a backup.</p>
    <input type="password" name="a" inputmode="numeric" pattern="[0-9]*" maxlength="8" placeholder="New PIN" autocomplete="off">
    <input type="password" name="b" inputmode="numeric" pattern="[0-9]*" maxlength="8" placeholder="Repeat PIN" autocomplete="off">`,
  [['ok', 'Save PIN'], ['cancel', 'Cancel', 'quiet']]);
  if (v !== 'ok') return;
  if (!/^\d{4,8}$/.test(vals.a)) return alertModal('PIN not saved', 'Use 4 to 8 digits.');
  if (vals.a !== vals.b) return alertModal('PIN not saved', 'The two PINs did not match.');
  await setSetting('pin_hash', await hashPin(vals.a));
  await setSetting('pin_length', vals.a.length);
  await setSetting('pin_failed', 0);
  render(); toast('PIN saved');
}
async function askCurrentPin() {
  const {v, vals} = await modal('Current PIN', '<input type="password" name="p" inputmode="numeric" pattern="[0-9]*" maxlength="8" placeholder="Current PIN" autocomplete="off">', [['ok', 'Continue'], ['cancel', 'Cancel', 'quiet']]);
  if (v !== 'ok') return false;
  if (await verifyPin(vals.p, setting('pin_hash'))) return true;
  await alertModal('Wrong PIN', 'That PIN is not correct.');
  return false;
}
async function pinRemoveFlow() {
  if (!(await askCurrentPin())) return;
  delete S.settings.pin_hash; await DB.del('settings', 'pin_hash');
  render(); toast('PIN removed');
}
function updatePinDots() {
  const dots = $('#pin-dots'); if (!dots) return;
  dots.querySelectorAll('i').forEach((d, i) => d.classList.toggle('on', i < S.pinInput.length));
}
let pinBusy = false;
async function pinDigit(d) {
  if (pinBusy) return;
  const msg = $('#lock-msg');
  const until = setting('pin_locked_until', 0);
  if (Date.now() < until) { msg.textContent = `Too many attempts. Try again in ${Math.ceil((until - Date.now()) / 1000)} s`; return; }
  S.pinInput += d; updatePinDots();
  if (S.pinInput.length < setting('pin_length', 4)) return;
  pinBusy = true;
  const ok = await verifyPin(S.pinInput, setting('pin_hash'));
  S.pinInput = ''; pinBusy = false;
  if (ok) { await setSetting('pin_failed', 0); S.locked = false; render(); return; }
  const n = setting('pin_failed', 0) + 1;
  await setSetting('pin_failed', n);
  const secs = lockoutSeconds(n);
  if (secs) await setSetting('pin_locked_until', Date.now() + secs * 1000);
  msg.textContent = secs ? `Wrong PIN. Wait ${secs} s before trying again.` : 'Wrong PIN, try again';
  const dots = $('#pin-dots'); dots.classList.remove('shake'); void dots.offsetWidth; dots.classList.add('shake');
  updatePinDots();
}
async function forgotPin() {
  if (!(await confirmModal('Forgot your PIN?', 'For your privacy the PIN cannot be recovered. You can erase everything in this app and then restore a backup file you saved earlier.', 'Erase this app', 'danger'))) return;
  if (!(await confirmModal('Erase all entries?', 'This cannot be undone. Make sure you have a backup in Files or iCloud Drive.', 'Erase', 'danger'))) return;
  await DB.clear('entries'); await DB.clear('snapshots'); await DB.clear('settings');
  S.entries.clear(); S.settings = {}; S.locked = false; S.view = 'settings';
  applyTheme(); render(); toast('Erased. You can restore a backup now.');
}

// ------------------------------------------------------------------ actions
const actions = {
  'prev-day': () => { S.day = addDays(S.day, -1); render(); },
  'next-day': () => { if (S.day < todayISO()) { S.day = addDays(S.day, 1); render(); } },
  open: (el) => openEditor(el.dataset.kind, el.dataset.day),
  'close-editor': () => closeEditor(),
  'save-editor': async () => { await flushEditor(); toast('Saved'); S.editor = null; S.view = 'home'; render(); },
  mood: (el) => {
    const m = Number(el.dataset.mood);
    S.editor.mood = S.editor.mood === m ? null : m;
    document.querySelectorAll('.mood').forEach((b) => b.classList.toggle('sel', Number(b.dataset.mood) === S.editor.mood));
    scheduleAutosave();
  },
  'delete-entry': async () => {
    if (!(await confirmModal('Delete entry?', 'This entry will be removed. Your automatic backups still contain it.', 'Delete', 'danger'))) return;
    const ed = S.editor; const id = entryId(ed.day, ed.kind);
    S.entries.delete(id); await DB.del('entries', id); await bumpRevision();
    S.editor = null; S.view = 'home'; render(); toast('Entry deleted');
  },
  export: async () => {
    if (!S.entries.size) return toast('Nothing to back up yet');
    const b = S.backupCache || {text: await backupText(), name: `calm-journal-backup-${todayISO()}.json`};
    if (await shareFile(b.text, b.name, 'application/json')) { await setSetting('last_export_at', utcNow()); render(); toast('Backup saved'); }
  },
  import: () => $('#file-input').click(),
  'export-md': async () => {
    if (!S.entries.size) return toast('Nothing to export yet');
    await shareFile(exportMarkdown(), `calm-journal-${todayISO()}.md`, 'text/plain');
  },
  'snap-share': async (el) => {
    const s = (await DB.all('snapshots')).find((x) => x.id === el.dataset.id);
    if (s) await shareFile(s.text, `calm-journal-${s.id}.json`, 'application/json');
  },
  'snap-restore': async (el) => {
    const s = (await DB.all('snapshots')).find((x) => x.id === el.dataset.id);
    if (s) await restoreFromText(s.text, 'This on-device backup');
  },
  theme: async (el) => { await setSetting('theme', el.dataset.theme); applyTheme(); render(); },
  'pin-set': () => pinSetFlow(),
  'pin-remove': () => pinRemoveFlow(),
  pin: (el) => pinDigit(el.dataset.d),
  'pin-back': () => { S.pinInput = S.pinInput.slice(0, -1); updatePinDots(); },
  'forgot-pin': () => forgotPin(),
  'save-ai': async () => {
    const base = $('#ai_base_url').value.trim() || 'https://api.openai.com/v1';
    if (!base.startsWith('https://')) return alertModal('Not saved', 'The AI address must start with https://');
    await setSetting('ai_base_url', base);
    await setSetting('ai_model', $('#ai_model').value.trim() || 'gpt-4o-mini');
    const key = $('#ai_api_key').value.trim();
    if (key) await setSetting('ai_api_key', key);
    render(); toast('AI settings saved');
  },
  'clear-ai': async () => { delete S.settings.ai_api_key; await DB.del('settings', 'ai_api_key'); render(); toast('API key removed'); },
  'ai-range': async (el) => { await setSetting('ai_days', Number(el.dataset.days)); document.querySelectorAll('#ai-range button').forEach((b) => b.classList.toggle('on', b === el)); },
  'ask-ai': async (el) => {
    if (!setting('ai_api_key')) { S.view = 'settings'; render(); return toast('Add your AI key below'); }
    const n = setting('ai_days', 7), start = addDays(todayISO(), -(n - 1));
    const entries = allEntries().filter((e) => e.day >= start);
    if (!entries.length) return toast('No entries in that period yet');
    if (!(await confirmModal('Send to AI?', `${entries.length} entries from the last ${n} days will be sent to ${setting('ai_base_url', 'https://api.openai.com/v1')}.`, 'Send'))) return;
    el.disabled = true; el.textContent = 'Reflecting...';
    try { S.aiOutput = await askAI(buildAiMessages(entries, `the last ${n} days`)); } catch (e) { S.aiOutput = e.message; }
    if (S.view === 'insights') render();
  },
  'delete-all': async () => {
    if (!S.entries.size) return toast('No entries to delete');
    if (!(await confirmModal('Delete all entries?', 'Everything you have written will be removed from this iPhone. A safety copy is kept in the app.', 'Delete all', 'danger'))) return;
    await snapshot('pre-restore');
    await DB.clear('entries'); S.entries.clear(); await bumpRevision();
    render(); toast('All entries deleted');
  },
};

document.addEventListener('click', (ev) => {
  const nav = ev.target.closest('[data-nav]');
  if (nav) {
    const go = async () => { if (S.view === 'editor') { await flushEditor(); S.editor = null; } S.view = nav.dataset.nav; if (S.view === 'home') S.day = S.day || todayISO(); render(); window.scrollTo(0, 0); };
    go(); return;
  }
  const el = ev.target.closest('[data-act]');
  if (el && actions[el.dataset.act]) {
    Promise.resolve(actions[el.dataset.act](el)).catch((e) => { console.error(e); alertModal('Something went wrong', e.message || String(e)); });
  }
});
document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (t.dataset.key && S.editor) { S.editor.data[t.dataset.key] = t.value; scheduleAutosave(); }
  if (t.matches('textarea.numbered-answer')) { t.style.height = 'auto'; t.style.height = `${Math.max(50, t.scrollHeight)}px`; }
  if (t.id === 'search') {
    S.search = t.value;
    const list = viewHistory().split('<div id="history-list">')[1];
    $('#history-list').innerHTML = list.slice(0, list.lastIndexOf('</div>'));
  }
});
document.addEventListener('change', async (ev) => {
  const t = ev.target;
  if (t.dataset.toggle) { await setSetting(t.dataset.toggle, t.checked); if (t.dataset.toggle === 'auto_backup' && t.checked) scheduleBackupWork(); }
  if (t.dataset.select) await setSetting(t.dataset.select, Number(t.value));
  if (t.id === 'file-input') {
    const f = t.files[0]; t.value = '';
    if (f) await restoreFromText(await f.text(), `“${f.name}”`);
  }
});
document.addEventListener('visibilitychange', async () => {
  if (document.hidden) {
    S.hiddenAt = Date.now();
    if (setting('pin_hash')) document.body.classList.add('privacy');
    await flushEditor();
    try { await autoSnapshot(); } catch (e) { console.error(e); }
  } else {
    document.body.classList.remove('privacy');
    if (setting('pin_hash') && !S.locked && Date.now() - S.hiddenAt >= setting('lock_after', 60) * 1000) {
      S.locked = true; S.pinInput = ''; render();
    } else if (S.view === 'home') render();
  }
});
window.addEventListener('pagehide', () => { flushEditor(); });
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

async function start() {
  try {
    await DB.open();
    for (const e of await DB.all('entries')) S.entries.set(e.id, e);
    for (const s of await DB.all('settings')) S.settings[s.key] = s.value;
  } catch (e) {
    $('#app').innerHTML = `<div class="card"><h2>Storage unavailable</h2><p>${esc(e.message || e)}</p><p class="small">Private Browsing blocks storage. Open Calm Journal normally from the Home Screen.</p></div>`;
    return;
  }
  applyTheme();
  S.locked = !!setting('pin_hash');
  render();
  scheduleBackupWork();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e));
}

// Exposed for automated tests.
window.CalmJournal = {S, canonical, sha256Hex, parseBackup, buildBackup, backupText, summarize, bonusPrompt, ordinal, entryText, hashPin, verifyPin};
start();
