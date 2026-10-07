'use strict';
// Voctails „Intern“: Übe-Player (App) unter /voctails/intern/.
// Die Übe-Tracks werden direkt aus dem Dropbox-Ordner „Öffentlich/Voctails/Übe-Files“ gelesen –
// über einen Freigabelink (VOCTAILS_DROPBOX_LINK), weil die Dropbox-App selbst nur ihren
// App-Ordner sieht. Noten-PDFs optional über einen zweiten Freigabelink (VOCTAILS_NOTEN_LINK).
// Sängerinnen und Sänger samt Register (aus Konzertmeister) stehen in DATA_DIR/voctails-members.json
// und lassen sich im Admin-Bereich pflegen.
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { Readable } = require('stream');

const REGISTERS = ['Sopran', 'Mezzo', 'Alt', 'Tenor', 'Bass', 'Beatbox'];

// Stand Konzertmeister (Register der Voctails), 07.10.2026
const DEFAULT_MEMBERS = [
  ['Chiara Koppenhöfer', 'Sopran'], ['Judith Haß', 'Sopran'], ['Katharina Rode', 'Sopran'], ['Larissa Neubert', 'Sopran'],
  ['Marie Götzinger', 'Sopran'], ['Nicole Walz', 'Sopran'], ['Wiebke Barthelmie', 'Sopran'],
  ['Birgit Gündisch', 'Mezzo'], ['Carina Keppler', 'Mezzo'], ['Christine Gundel', 'Mezzo'], ['Elisabeth Karasek', 'Mezzo'],
  ['Emilia Kontidis', 'Mezzo'], ['Hannah Weissmann', 'Mezzo'], ['Juli Held', 'Mezzo'], ['Julia Sedelies', 'Mezzo'],
  ['Luisa Bernert', 'Mezzo'], ['Valerie Von Raven-Niebelschütz', 'Mezzo'],
  ['Anika Höhn', 'Alt'], ['Franziska Lang', 'Alt'], ['Jessie Niemann', 'Alt'], ['Julia Adam', 'Alt'],
  ['Michaela Seyfarth', 'Alt'], ['Sarah Schmid', 'Alt'], ['Theresa Rudolph', 'Alt'], ['Tina Adam', 'Alt'],
  ['Daniel Rivier', 'Tenor'], ['Dominik Hetzler', 'Tenor'], ['Jens Müller', 'Tenor'], ['Rico Siebel', 'Tenor'], ['Vincent Ziehr', 'Tenor'],
  ['Benjamin Müller', 'Bass'], ['Elian Schmetzer', 'Bass'], ['Jonathan Kaller', 'Bass'], ['Tobias Hetzler', 'Bass'], ['Tristan Pape', 'Bass'],
  ['Martin Renner', 'Beatbox'],
].map(([name, register]) => ({ name, register }));

const AUDIO_RE = /\.(mp3|wav|m4a|ogg)$/i;
const MIME = { '.pdf': 'application/pdf', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg' };

// --- Stimme aus dem Dateinamen: „Durch die Stille_S1.mp3“ → S1, „…_SATB“ → Gesamt, „vocals_Mezzo2“ → M2 ---
const VOICE_PATTERNS = [
  [/^(tutti|tuttidemo|alle|all|mixdown|mix|demo|original)$/, () => ({ g: 'all' })],
  [/^(?:s|sop|sopran|soprano)(\d)?$/, (m) => ({ g: 'S', n: m[1] })],
  [/^(?:m|ms|mez|mezzo)(\d)?$/, (m) => ({ g: 'M', n: m[1] })],
  [/^(?:a|alt|alto)(\d)?$/, (m) => ({ g: 'A', n: m[1] })],
  [/^(?:t|ten|tenor)(\d)?$/, (m) => ({ g: 'T', n: m[1] })],
  [/^(?:bar|bari|bariton|baritone)(\d)?$/, (m) => ({ g: 'Bar', n: m[1] })],
  [/^(?:b|bs|bass)(\d)?$/, (m) => ({ g: 'B', n: m[1] })],
  [/^(beatbox|bb|vp|perc)$/, () => ({ g: 'Beat' })],
];

const REG_OF_LETTER = { s: 'Sopran', m: 'Mezzo', a: 'Alt', t: 'Tenor', b: 'Bass' };

function matchVoice(seg) {
  const minus = seg.match(/^(?:tutti)?minus(sopran|soprano|mezzo|alt|alto|tenor|bass)$/);
  if (minus) return { g: 'minus', of: REG_OF_LETTER[minus[1][0]] };
  for (const [re, make] of VOICE_PATTERNS) {
    const m = seg.match(re);
    if (m) {
      const v = make(m);
      return v.n ? { g: v.g, n: Number(v.n) } : { g: v.g };
    }
  }
  // Besetzungen wie SAM, SMAB, TTBB, SMATBB → Gesamtaufnahme
  if (/^[smatb]{3,}\d?$/.test(seg) && new Set(seg.replace(/\d/, '')).size >= 2) return { g: 'all' };
  return null;
}

function parseVoice(fileName) {
  const base = fileName.replace(/\.[a-z0-9]+$/i, '').toLowerCase();
  const segments = base.split('_').map((s) => s.trim()).filter(Boolean);
  const candidates = [];
  // Von hinten: „S1 1“, „S1_slow“ usw. – Zusätze wie „slow“ oder eine angehängte „1“ überspringen
  for (let i = segments.length - 1; i >= Math.max(1, segments.length - 3); i--) candidates.push(segments[i]);
  // Ohne Unterstrich („Kings and Queens ALT“): die letzten Wörter prüfen
  const words = base.split(/\s+/);
  if (words.length > 1) candidates.push(words.slice(-1)[0], words.slice(-2).join(' '), words.slice(-3).join(' '));
  for (const raw of candidates) {
    const seg = raw
      .replace(/\s+\d+$/, '')
      .replace(/vocals?|wav$|übungstrack/g, '')
      .replace(/[^a-z0-9äöü]/g, '');
    if (!seg) continue;
    const v = matchVoice(seg);
    if (v) return v;
  }
  return { g: 'other' };
}

function voiceLabel(v) {
  if (v.g === 'all') return 'Gesamt';
  if (v.g === 'other') return '';
  if (v.g === 'Beat') return 'Beatbox';
  if (v.g === 'minus') return 'ohne ' + v.of;
  return v.g + (v.n || '');
}

// Anzeige-Name eines Tracks: Liedtitel vorne abschneiden, Unterstriche zu Leerzeichen
function trackLabel(fileName, songTitle) {
  let label = fileName.replace(AUDIO_RE, '');
  const parts = label.split('_');
  if (parts.length > 1) {
    // Präfix wie „Spielerfrauen_Voctails_bearb_“ entfernen – bei „Lead1_Vocals“ die letzten zwei Teile behalten
    const keep = /^vocals?$/i.test(parts[parts.length - 1]) && parts.length > 2 ? 2 : 1;
    label = parts.slice(-keep).join(' ');
  } else if (label.toLowerCase().startsWith(songTitle.toLowerCase() + ' ')) {
    label = label.slice(songTitle.length + 1);
  }
  return label.replace(/^übungstrack\s+/i, '').trim() || fileName;
}

module.exports = function setupVoctailsIntern(app, deps) {
  const { getDropboxAccessToken, asciiSafeJson, slugify, readCookie, escapeHtml, DATA_DIR, WORDS, cleanMarks, mp3Peaks, wavPeaks, requireAdminAuth } = deps;

  // ---------- Sängerinnen und Sänger ----------
  const MEMBERS_FILE = path.join(DATA_DIR, 'voctails-members.json');
  function loadMembers() {
    try {
      const list = JSON.parse(fs.readFileSync(MEMBERS_FILE, 'utf8'));
      if (Array.isArray(list)) return list;
    } catch (e) {}
    return DEFAULT_MEMBERS;
  }
  function saveMembers(list) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(MEMBERS_FILE, JSON.stringify(list, null, 2));
  }

  // Eingabe im Admin: je Zeile „Name; Register“ (auch Tab, wie beim Einfügen aus Excel)
  function parseMembers(text) {
    const out = [];
    for (const line of String(text || '').split(/\r?\n/)) {
      const parts = line.split(/[;\t|]|\s+[-–]\s+/).map((s) => s.trim()).filter(Boolean);
      if (!parts.length) continue;
      const name = parts[0].replace(/_/g, ' ').replace(/\s+/g, ' ').slice(0, 80);
      const reg = REGISTERS.find((r) => parts.slice(1).some((p) => p.toLowerCase().startsWith(r.toLowerCase().slice(0, 3)))) || '';
      out.push({ name, register: reg });
    }
    return out;
  }

  // ---------- Passwort ----------
  const COOKIE = 'voctails_auth';
  const COOKIE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
  const norm = (pw) => String(pw || '').trim().toLowerCase().normalize('NFC')
    .replace(/ö/g, 'oe').replace(/ä/g, 'ae').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
  const PASSWORD = norm(process.env.VOCTAILS_PASSWORD || 'voctails');
  const TOKEN = crypto.createHash('sha256').update(`voctails-v1:${PASSWORD}:${process.env.CHOERLE_SECRET || ''}`).digest('hex');

  function hasAccess(req) {
    const value = readCookie(req, COOKIE);
    if (!value || value.length !== TOKEN.length) return false;
    return crypto.timingSafeEqual(Buffer.from(value), Buffer.from(TOKEN));
  }
  function requireAccess(req, res, next) {
    if (hasAccess(req)) return next();
    res.status(401).set('Cache-Control', 'no-store').json({ ok: false, needsPassword: true });
  }

  const failedLogins = new Map();
  app.post('/api/voctails/login', (req, res) => {
    const ip = req.headers['cf-connecting-ip'] || req.ip;
    const now = Date.now();
    const attempts = (failedLogins.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
    if (attempts.length >= 10) return res.status(429).json({ ok: false, error: 'Zu viele Versuche. Bitte in ein paar Minuten erneut probieren.' });
    if (norm((req.body || {}).password) !== PASSWORD) {
      attempts.push(now);
      failedLogins.set(ip, attempts);
      return res.status(401).json({ ok: false, error: 'Das Passwort stimmt leider nicht.' });
    }
    failedLogins.delete(ip);
    res.cookie(COOKIE, TOKEN, {
      maxAge: COOKIE_MAX_AGE_MS,
      httpOnly: true,
      sameSite: 'lax',
      secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
      path: '/',
    });
    res.json({ ok: true });
  });

  // ---------- Dropbox über Freigabelinks ----------
  const TRACKS_LINK = process.env.VOCTAILS_DROPBOX_LINK || (process.env.VOCTAILS_LOCAL_DIR ? 'local:tracks' : '');
  const NOTEN_LINK = process.env.VOCTAILS_NOTEN_LINK || (process.env.VOCTAILS_LOCAL_NOTEN ? 'local:noten' : '');

  async function dbx(endpoint, body) {
    const token = await getDropboxAccessToken();
    const res = await fetch('https://api.dropboxapi.com/2/' + endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Dropbox ${endpoint} fehlgeschlagen: ${res.status} ${await res.text()}`);
    return res.json();
  }

  // Inhalt eines Ordners im Freigabelink (rekursiv geht bei Freigabelinks nicht → selbst absteigen)
  // Nur für lokale Tests: statt Dropbox einen Ordner auf der Platte lesen (VOCTAILS_LOCAL_DIR / VOCTAILS_LOCAL_NOTEN)
  const LOCAL = { [TRACKS_LINK]: process.env.VOCTAILS_LOCAL_DIR, [NOTEN_LINK]: process.env.VOCTAILS_LOCAL_NOTEN };

  async function listShared(url, folder) {
    if (LOCAL[url]) {
      const dir = path.join(LOCAL[url], folder);
      return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => !d.name.startsWith('.')).map((d) => {
        const st = fs.statSync(path.join(dir, d.name));
        return { '.tag': d.isDirectory() ? 'folder' : 'file', name: d.name, size: st.size, rev: String(st.mtimeMs) };
      });
    }
    let data = await dbx('files/list_folder', { path: folder, shared_link: { url } });
    const entries = [...data.entries];
    while (data.has_more) {
      data = await dbx('files/list_folder/continue', { cursor: data.cursor });
      entries.push(...data.entries);
    }
    return entries.filter((e) => !e.name.startsWith('.'));
  }

  async function mapLimit(items, limit, fn) {
    const out = new Array(items.length);
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }));
    return out;
  }

  const fileId = (link, p) => crypto.createHash('sha1').update(link + '\n' + p.toLowerCase()).digest('hex').slice(0, 16);
  // id → { link, path, name, rev } für Datei-Proxy und Wellenform
  let fileIndex = new Map();
  let library = null;
  let libraryAt = 0;
  let libraryPending = null;
  const LIBRARY_TTL_MS = 5 * 60 * 1000;

  // Noten: PDFs aus dem Noten-Ordner (oberste Ebene + Unterordner) dem Lied per Titel zuordnen
  const NOTEN_RANK = (folder) => (/konzert/i.test(folder) ? 0 : /weihnacht/i.test(folder) ? 1 : /ablage/i.test(folder) ? 3 : 2);
  async function listNoten() {
    if (!NOTEN_LINK) return [];
    const top = await listShared(NOTEN_LINK, '');
    const pdfs = [];
    const add = (folder, e) => {
      if (e['.tag'] !== 'file' || !/\.pdf$/i.test(e.name) || /kopie|cracked/i.test(e.name)) return;
      pdfs.push({ folder, name: e.name, path: (folder ? '/' + folder : '') + '/' + e.name, rev: e.rev, slug: slugify(e.name.replace(/\.pdf$/i, '')) });
    };
    top.forEach((e) => add('', e));
    const folders = top.filter((e) => e['.tag'] === 'folder');
    const lists = await mapLimit(folders, 4, (f) => listShared(NOTEN_LINK, '/' + f.name).catch(() => []));
    folders.forEach((f, i) => lists[i].forEach((e) => add(f.name, e)));
    return pdfs.sort((a, b) => NOTEN_RANK(a.folder) - NOTEN_RANK(b.folder));
  }

  function findNoten(pdfs, title) {
    const s = slugify(title).replace(/-\d+$/, '');
    if (s.length < 3) return null;
    return pdfs.find((p) => p.slug === s)
      || pdfs.find((p) => p.slug.startsWith(s) || (s.startsWith(p.slug) && p.slug.length >= 5))
      || (s.length >= 8 ? pdfs.find((p) => p.slug.includes(s)) : null)
      || null;
  }

  async function buildLibrary() {
    if (!TRACKS_LINK) throw new Error('VOCTAILS_DROPBOX_LINK ist nicht gesetzt.');
    const index = new Map();
    const register = (link, p, e) => {
      const id = fileId(link, p);
      index.set(id, { link, path: p, name: e.name, rev: e.rev || e.content_hash || String(e.size || '') });
      return id;
    };
    const fileUrl = (id, name) => `/voctails/intern/file/${id}/${encodeURIComponent(name)}`;

    const [top, noten] = await Promise.all([listShared(TRACKS_LINK, ''), listNoten().catch((err) => { console.error('Voctails-Noten:', err.message); return []; })]);
    const folders = top.filter((e) => e['.tag'] === 'folder');
    const songs = await mapLimit(folders, 6, async (folder) => {
      const base = '/' + folder.name;
      const files = [];
      const entries = await listShared(TRACKS_LINK, base);
      entries.filter((e) => e['.tag'] === 'file').forEach((e) => files.push({ sub: '', e, p: base + '/' + e.name }));
      // Unterordner (z. B. „… Vocals“, „Voice Over“) eine Ebene tief mitnehmen
      const subs = entries.filter((e) => e['.tag'] === 'folder');
      const subLists = await mapLimit(subs, 3, (s) => listShared(TRACKS_LINK, base + '/' + s.name).catch(() => []));
      subs.forEach((s, i) => subLists[i].filter((e) => e['.tag'] === 'file').forEach((e) => files.push({ sub: s.name, e, p: base + '/' + s.name + '/' + e.name })));

      const tracks = files
        .filter((f) => AUDIO_RE.test(f.e.name))
        .map((f) => {
          const id = register(TRACKS_LINK, f.p, f.e);
          const voice = parseVoice(f.e.name);
          const label = trackLabel(f.e.name, folder.name);
          return { id, name: f.e.name, label, sub: f.sub, voice, voiceLabel: voiceLabel(voice), size: f.e.size || 0, url: fileUrl(id, f.e.name) };
        })
        .sort((a, b) => (a.sub || '').localeCompare(b.sub || '', 'de') || a.label.localeCompare(b.label, 'de', { numeric: true }));

      let pdf = files.find((f) => /\.pdf$/i.test(f.e.name));
      let pdfInfo = null;
      if (pdf) {
        const id = register(TRACKS_LINK, pdf.p, pdf.e);
        pdfInfo = { name: pdf.e.name, url: fileUrl(id, pdf.e.name) };
      } else {
        const n = findNoten(noten, folder.name);
        if (n) {
          const id = register(NOTEN_LINK, n.path, n);
          pdfInfo = { name: n.name, url: fileUrl(id, n.name) };
        }
      }
      return { slug: slugify(folder.name), title: folder.name, tracks, pdf: pdfInfo };
    });
    fileIndex = index;
    return songs.filter((s) => s.tracks.length || s.pdf).sort((a, b) => a.title.localeCompare(b.title, 'de'));
  }

  function getLibrary(force) {
    const fresh = library && Date.now() - libraryAt < (force ? 30 * 1000 : LIBRARY_TTL_MS);
    if (fresh) return Promise.resolve(library);
    if (!libraryPending) {
      libraryPending = buildLibrary()
        .then((songs) => { library = songs; libraryAt = Date.now(); return songs; })
        .finally(() => { libraryPending = null; });
    }
    // Veralteten Stand sofort liefern, im Hintergrund auffrischen
    if (library && !force) {
      libraryPending.catch((err) => console.error('Voctails-Bibliothek:', err.message));
      return Promise.resolve(library);
    }
    return libraryPending;
  }

  async function findFile(id) {
    if (!fileIndex.has(id)) await getLibrary(true).catch(() => {});
    return fileIndex.get(id) || null;
  }

  app.get('/api/voctails/library', requireAccess, async (req, res) => {
    try {
      const songs = await getLibrary(req.query.refresh === '1');
      res.set('Cache-Control', 'no-store');
      res.json({ ok: true, members: loadMembers(), songs, updatedAt: libraryAt });
    } catch (err) {
      console.error('Voctails-Bibliothek:', err);
      res.status(502).json({ ok: false, error: 'Die Lieder konnten gerade nicht geladen werden. Bitte später erneut versuchen.' });
    }
  });

  async function downloadShared(file, range) {
    if (LOCAL[file.link]) {
      const fp = path.join(LOCAL[file.link], file.path);
      const size = fs.statSync(fp).size;
      const m = /bytes=(\d*)-(\d*)/.exec(range || '');
      if (!m) return new Response(Readable.toWeb(fs.createReadStream(fp)), { status: 200, headers: { 'Content-Length': String(size) } });
      const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
      const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
      return new Response(Readable.toWeb(fs.createReadStream(fp, { start, end })), {
        status: 206,
        headers: { 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) },
      });
    }
    const token = await getDropboxAccessToken();
    const headers = {
      Authorization: `Bearer ${token}`,
      'Dropbox-API-Arg': asciiSafeJson({ url: file.link, path: file.path }),
    };
    if (range) headers.Range = range;
    return fetch('https://content.dropboxapi.com/2/sharing/get_shared_link_file', { method: 'POST', headers });
  }

  // Datei-Proxy mit Range-Requests (Spulen) – Adresse bleibt stabil, damit die App sie offline speichern kann
  app.get('/voctails/intern/file/:id/:name', async (req, res) => {
    if (!hasAccess(req)) return res.status(401).send('Bitte zuerst unter /voctails/intern das Passwort eingeben.');
    try {
      const file = await findFile(req.params.id);
      if (!file) return res.status(404).send('Datei nicht gefunden.');
      const dRes = await downloadShared(file, req.headers.range);
      if (!dRes.ok && dRes.status !== 206) {
        console.error('Voctails-Download fehlgeschlagen:', dRes.status, await dRes.text());
        return res.status(502).send('Fehler beim Laden der Datei.');
      }
      const ext = path.extname(file.name).toLowerCase();
      res.status(dRes.status);
      res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'private, no-cache');
      res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="${file.name.replace(/[^\w.\- ]/g, '_')}"`);
      const cr = dRes.headers.get('content-range');
      if (cr) res.setHeader('Content-Range', cr);
      const cl = dRes.headers.get('content-length');
      if (cl) res.setHeader('Content-Length', cl);
      Readable.fromWeb(dRes.body).pipe(res);
    } catch (err) {
      console.error(err);
      res.status(500).send('Fehler beim Laden der Datei.');
    }
  });

  // ---------- Wellenform (einmal je Datei-Version berechnet, auf dem Volume zwischengespeichert) ----------
  const PEAKS_DIR = path.join(DATA_DIR, 'voctails-peaks');
  const peaksMemo = new Map();
  let peaksQueue = Promise.resolve();
  function getPeaks(file) {
    const key = crypto.createHash('sha256').update(file.link + ':' + file.path + ':' + file.rev).digest('hex').slice(0, 32);
    if (peaksMemo.has(key)) return peaksMemo.get(key);
    const cacheFile = path.join(PEAKS_DIR, key + '.json');
    const job = peaksQueue.then(async () => {
      try {
        return JSON.parse(await fs.promises.readFile(cacheFile, 'utf8'));
      } catch (e) {}
      const ext = path.extname(file.name).toLowerCase();
      const calc = ext === '.mp3' ? mp3Peaks : ext === '.wav' ? wavPeaks : null;
      if (!calc) return null;
      const dRes = await downloadShared(file);
      if (!dRes.ok) throw new Error(`Dropbox-Download fehlgeschlagen: ${dRes.status}`);
      const result = await calc(Readable.fromWeb(dRes.body));
      if (result) {
        await fs.promises.mkdir(PEAKS_DIR, { recursive: true });
        await fs.promises.writeFile(cacheFile, JSON.stringify(result));
      }
      return result;
    });
    peaksQueue = job.catch(() => {});
    peaksMemo.set(key, job);
    job.catch(() => peaksMemo.delete(key));
    return job;
  }

  app.get('/voctails/intern/peaks/:id', async (req, res) => {
    if (!hasAccess(req)) return res.status(401).json({ ok: false });
    try {
      const file = await findFile(req.params.id);
      if (!file) return res.status(404).json({ ok: false });
      const result = await getPeaks(file);
      if (!result) return res.status(415).json({ ok: false });
      res.set('Cache-Control', 'private, max-age=86400');
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error('Voctails-Wellenform fehlgeschlagen:', err);
      res.status(500).json({ ok: false });
    }
  });

  // ---------- Geräte-Sync für Cues/Schleifen (3-Wort-Code, wie beim Chörle) ----------
  const SYNC_FILE = path.join(DATA_DIR, 'voctails-sync.json');
  let sync = { users: {} };
  try {
    if (fs.existsSync(SYNC_FILE)) sync = JSON.parse(fs.readFileSync(SYNC_FILE, 'utf8'));
  } catch (err) {
    console.error('voctails-sync.json konnte nicht gelesen werden:', err);
  }
  let syncTimer = null;
  function saveSync() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(SYNC_FILE + '.tmp', JSON.stringify(sync));
      fs.renameSync(SYNC_FILE + '.tmp', SYNC_FILE);
    }, 300);
  }
  const normCode = (c) => String(c || '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .split(/[^a-z0-9]+/).filter(Boolean).join('-');
  const codeKey = (c) => crypto.createHash('sha256').update('voctails-sync:' + normCode(c)).digest('hex');

  function mergeMarks(target, incoming) {
    for (const [url, rec] of Object.entries(incoming || {}).slice(0, 3000)) {
      if (!/^\/voctails\/intern\/file\/[0-9a-f]{16}\/[^\s]{1,400}$/.test(url)) continue;
      const clean = cleanMarks(rec);
      if (!target[url] || clean.updatedAt > (target[url].updatedAt || 0)) target[url] = clean;
    }
    return target;
  }

  const limits = new Map();
  function limited(key, max, windowMs) {
    const now = Date.now();
    const e = limits.get(key);
    if (!e || e.reset < now) {
      limits.set(key, { n: 0, reset: now + windowMs });
      return false;
    }
    return e.n >= max;
  }
  const hit = (key) => { const e = limits.get(key); if (e) e.n++; };
  setInterval(() => {
    const now = Date.now();
    for (const [k, e] of limits) if (e.reset < now) limits.delete(k);
  }, 10 * 60 * 1000).unref();

  app.post('/api/voctails/sync/new', requireAccess, (req, res) => {
    const key = 'new:' + (req.headers['cf-connecting-ip'] || req.ip);
    if (limited(key, 20, 60 * 60 * 1000)) return res.status(429).json({ ok: false, error: 'Zu viele Anfragen, bitte später erneut versuchen.' });
    hit(key);
    let code;
    do {
      code = Array.from({ length: 3 }, () => WORDS[crypto.randomInt(WORDS.length)]).join('-');
    } while (sync.users[codeKey(code)]);
    const user = { marks: mergeMarks({}, (req.body || {}).marks), createdAt: Date.now(), updatedAt: Date.now() };
    sync.users[codeKey(code)] = user;
    saveSync();
    res.json({ ok: true, code, marks: user.marks });
  });

  app.post('/api/voctails/sync', requireAccess, (req, res) => {
    const key = 'code:' + (req.headers['cf-connecting-ip'] || req.ip);
    if (limited(key, 10, 15 * 60 * 1000)) return res.status(429).json({ ok: false, error: 'Zu viele falsche Codes. Bitte in 15 Minuten erneut versuchen.' });
    const user = sync.users[codeKey((req.body || {}).code)];
    if (!user) {
      hit(key);
      return res.status(404).json({ ok: false, error: 'Diesen Sync-Code gibt es nicht.' });
    }
    mergeMarks(user.marks, req.body.marks);
    user.updatedAt = Date.now();
    saveSync();
    res.json({ ok: true, code: normCode(req.body.code), marks: user.marks });
  });

  // ---------- Admin: Sängerliste ----------
  app.post('/admin/voctails-members', requireAdminAuth, (req, res) => {
    const list = parseMembers(req.body.members);
    if (list.length) saveMembers(list);
    res.redirect('/admin#voctails');
  });
  app.post('/admin/voctails-refresh', requireAdminAuth, async (req, res) => {
    libraryAt = 0;
    await getLibrary(true).catch((err) => console.error('Voctails-Bibliothek:', err.message));
    res.redirect('/admin#voctails');
  });

  function renderAdminSection() {
    const members = loadMembers();
    const text = members.map((m) => `${m.name}; ${m.register || '–'}`).join('\n');
    const status = !TRACKS_LINK
      ? '<p class="subtitle" style="color:#b91c1c">Der Dropbox-Freigabelink fehlt noch (Railway-Variable VOCTAILS_DROPBOX_LINK).</p>'
      : `<p class="subtitle">${library ? `${library.length} Lieder geladen, Stand ${new Date(libraryAt).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}.` : 'Lieder werden beim ersten Aufruf geladen.'}</p>`;
    return `
    <div class="new-project" id="voctails">
      <h2>🎤 Voctails Intern – Übe-Player</h2>
      <p class="subtitle" style="margin-bottom:0.6rem;">Die App liegt unter <a href="/voctails/intern/" target="_blank" rel="noopener">/voctails/intern/</a>. Tracks kommen direkt aus Dropbox (Übe-Files); neue Dateien erscheinen nach spätestens 5 Minuten.</p>
      ${status}
      <form method="POST" action="/admin/voctails-refresh" style="margin:0.6rem 0 1rem;"><button type="submit">Lieder jetzt neu einlesen</button></form>
      <form method="POST" action="/admin/voctails-members">
        <div class="fields">
          <label>Sängerinnen und Sänger – je Zeile „Name; Register“ (Register: ${REGISTERS.join(', ')}; aus Konzertmeister → Verein → Register)
            <textarea name="members" rows="14" style="font-family:monospace">${escapeHtml(text)}</textarea>
          </label>
        </div>
        <div class="actions"><button type="submit">Liste speichern</button></div>
      </form>
    </div>`;
  }

  // Bibliothek beim Start schon einmal laden, damit die erste Anfrage schnell ist
  if (TRACKS_LINK) setTimeout(() => getLibrary().catch((err) => console.error('Voctails-Bibliothek:', err.message)), 3000);

  return { renderAdminSection, hasAccess };
};

module.exports.parseVoice = parseVoice;
module.exports.trackLabel = trackLabel;
