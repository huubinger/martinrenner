const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { Readable } = require('stream');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Persistenter Speicher (Railway Volume) ---
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const DEFAULT_PROJECTS = [
  {
    id: 'martin-renner',
    icon: '👤',
    eyebrow: 'Über mich',
    title: 'Martin Renner',
    info: 'Kurzer Platzhaltertext über dich – wer du bist und was dich ausmacht.',
    link: '#',
    image: null,
    socials: [
      { label: 'Instagram', href: '#' },
      { label: 'LinkedIn', href: '#' },
    ],
  },
  {
    id: 'kreatief-musical',
    icon: '🎭',
    eyebrow: 'Projekt',
    title: 'Kreatief-Musical',
    info: 'Platzhaltertext: kurze Beschreibung des Projekts Kreatief-Musical.',
    link: '#',
    image: null,
    socials: [
      { label: 'Instagram', href: '#' },
      { label: 'Facebook', href: '#' },
    ],
  },
  {
    id: 'voctails',
    icon: '🎤',
    eyebrow: 'Projekt',
    title: 'Voctails',
    info: 'Platzhaltertext: kurze Beschreibung des Projekts Voctails.',
    link: '#',
    image: null,
    socials: [
      { label: 'Instagram', href: '#' },
      { label: 'YouTube', href: '#' },
    ],
  },
  {
    id: 'lauter-maenner',
    icon: '🎶',
    eyebrow: 'Projekt',
    title: 'Lauter Männer',
    info: 'Platzhaltertext: kurze Beschreibung des Projekts Lauter Männer.',
    link: '#',
    image: null,
    socials: [
      { label: 'Instagram', href: '#' },
      { label: 'Facebook', href: '#' },
    ],
  },
  {
    id: 'fruehstuecks-choerle',
    icon: '☀️',
    eyebrow: 'Projekt',
    title: 'Frühstücks-Chörle',
    info: 'Noten & Unterlagen für das Frühstückschörle findest du direkt hier.',
    link: '/choerle',
    image: null,
    socials: [{ label: 'Instagram', href: '#' }],
  },
  {
    id: 'veranstaltungstechnik',
    icon: '🎛️',
    eyebrow: 'Dienstleistung',
    title: 'Veranstaltungstechnik',
    info: 'Platzhaltertext: kurze Beschreibung des Angebots Veranstaltungstechnik.',
    link: '#',
    image: null,
    socials: [{ label: 'Instagram', href: '#' }],
  },
];

function loadProjects() {
  try {
    const raw = fs.readFileSync(PROJECTS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    saveProjects(DEFAULT_PROJECTS);
    return DEFAULT_PROJECTS;
  }
}

function saveProjects(list) {
  fs.writeFileSync(PROJECTS_FILE, JSON.stringify(list, null, 2));
}

function slugify(str) {
  return String(str)
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || crypto.randomUUID().slice(0, 8);
}

function parseSocials(text) {
  if (!text) return [];
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, href] = line.split('|').map((s) => (s || '').trim());
      return { label: label || 'Link', href: href || '#' };
    });
}

function socialsToText(socials) {
  return (socials || []).map((s) => `${s.label}|${s.href}`).join('\n');
}

// --- Datei-Uploads (Fotos für Projekte) ---
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('Nur Bilddateien sind erlaubt.'));
  },
});

app.use('/uploads', express.static(UPLOADS_DIR));

// Statische Startseite (public/index.html) und weitere statische Seiten unter "/"
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

// --- Öffentliche API für die Startseiten-Slideshow ---
app.get('/api/projects', (req, res) => {
  res.json(loadProjects());
});

// --- Admin-Bereich (Benutzername + Passwort) ---
function requireAdminAuth(req, res, next) {
  const user = process.env.ADMIN_USERNAME;
  const pass = process.env.ADMIN_PASSWORD;
  if (!user || !pass) {
    return res.status(500).send('Admin-Zugang ist nicht konfiguriert (ADMIN_USERNAME/ADMIN_PASSWORD fehlen).');
  }
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).send('Authentifizierung erforderlich.');
  }
  const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8');
  const sepIndex = decoded.indexOf(':');
  const u = decoded.slice(0, sepIndex);
  const p = decoded.slice(sepIndex + 1);
  if (u === user && p === pass) return next();
  res.set('WWW-Authenticate', 'Basic realm="Admin"');
  return res.status(401).send('Ungültige Zugangsdaten.');
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function escapeAttr(str) {
  return escapeHtml(str);
}

function renderAdminPage(projects, message) {
  const rows = projects
    .map(
      (p) => `
    <div class="project-card">
      <form method="POST" action="/admin/projects/${encodeURIComponent(p.id)}" enctype="multipart/form-data">
        <div class="row">
          ${p.image ? `<img class="thumb-preview" src="${escapeAttr(p.image)}" alt="">` : '<div class="thumb-preview thumb-empty">kein Foto</div>'}
          <div class="fields">
            <label>Titel<input type="text" name="title" value="${escapeAttr(p.title)}" required></label>
            <label>Kategorie-Label<input type="text" name="eyebrow" value="${escapeAttr(p.eyebrow || '')}"></label>
            <label>Icon (Emoji, für Platzhalter)<input type="text" name="icon" value="${escapeAttr(p.icon || '')}" maxlength="4"></label>
            <label>Infotext<textarea name="info">${escapeHtml(p.info || '')}</textarea></label>
            <label>Link<input type="text" name="link" value="${escapeAttr(p.link || '')}"></label>
            <label>Social-Media-Links (eine Zeile je Link: Label|URL)<textarea name="socials" placeholder="Instagram|https://instagram.com/...">${escapeHtml(socialsToText(p.socials))}</textarea></label>
            <label>Foto ersetzen<input type="file" name="photo" accept="image/*"></label>
          </div>
        </div>
        <div class="actions">
          <button type="submit">Speichern</button>
        </div>
      </form>
      <form method="POST" action="/admin/projects/${encodeURIComponent(p.id)}/delete" class="delete-form" onsubmit="return confirm('Projekt &quot;${escapeAttr(p.title)}&quot; wirklich löschen?');">
        <button type="submit" class="delete-btn">Projekt löschen</button>
      </form>
    </div>`
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Admin – martinrenner.de</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%);
    color: #f8fafc;
    margin: 0;
    padding: 2rem 1rem 5rem;
  }
  .container { max-width: 900px; margin: 0 auto; }
  h1 { margin-bottom: 0.3rem; }
  p.subtitle { color: #94a3b8; margin-top: 0; margin-bottom: 2rem; }
  .message {
    background: rgba(56,189,248,0.15);
    border: 1px solid rgba(56,189,248,0.4);
    color: #38bdf8;
    padding: 0.8rem 1rem;
    border-radius: 10px;
    margin-bottom: 1.5rem;
    font-size: 0.9rem;
  }
  .project-card {
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 14px;
    padding: 1.2rem;
    margin-bottom: 1.5rem;
  }
  .row { display: flex; gap: 1.2rem; flex-wrap: wrap; }
  .thumb-preview {
    width: 120px;
    height: 80px;
    object-fit: cover;
    border-radius: 8px;
    background: rgba(255,255,255,0.08);
    flex-shrink: 0;
  }
  .thumb-empty { display: flex; align-items: center; justify-content: center; font-size: 0.75rem; color: #64748b; text-align: center; }
  .fields { flex: 1; min-width: 260px; display: flex; flex-direction: column; gap: 0.7rem; }
  label { font-size: 0.8rem; color: #94a3b8; display: flex; flex-direction: column; gap: 0.3rem; }
  input, textarea {
    padding: 0.6rem 0.7rem;
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.15);
    background: rgba(255,255,255,0.05);
    color: #f8fafc;
    font-family: inherit;
    font-size: 0.9rem;
  }
  textarea { min-height: 60px; resize: vertical; }
  .actions { margin-top: 1rem; display: flex; justify-content: space-between; align-items: center; }
  button {
    padding: 0.6rem 1.2rem;
    border-radius: 8px;
    border: none;
    background: #38bdf8;
    color: #0f172a;
    font-weight: 600;
    cursor: pointer;
    font-size: 0.9rem;
  }
  button:hover { background: #0ea5e9; }
  .delete-form { margin-top: 0.6rem; }
  .delete-btn { background: rgba(239,68,68,0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.4); }
  .delete-btn:hover { background: rgba(239,68,68,0.3); }
  .new-project {
    background: rgba(255,255,255,0.03);
    border: 1px dashed rgba(255,255,255,0.25);
    border-radius: 14px;
    padding: 1.2rem;
    margin-top: 2.5rem;
  }
  .new-project h2 { margin-top: 0; font-size: 1.1rem; color: #38bdf8; }
  .home-link { display: inline-block; margin-top: 2rem; color: #94a3b8; font-size: 0.9rem; text-decoration: none; }
  .home-link:hover { text-decoration: underline; }
</style>
</head>
<body>
  <div class="container">
    <h1>🛠️ Projekte verwalten</h1>
    <p class="subtitle">Änderungen erscheinen sofort auf der Startseite.</p>
    ${message ? `<div class="message">${escapeHtml(message)}</div>` : ''}

    ${rows || '<p>Noch keine Projekte vorhanden.</p>'}

    <div class="new-project">
      <h2>Neues Projekt hinzufügen</h2>
      <form method="POST" action="/admin/projects" enctype="multipart/form-data">
        <div class="fields">
          <label>Titel<input type="text" name="title" required></label>
          <label>Kategorie-Label<input type="text" name="eyebrow" placeholder="Projekt"></label>
          <label>Icon (Emoji, für Platzhalter)<input type="text" name="icon" maxlength="4" placeholder="🔹"></label>
          <label>Infotext<textarea name="info"></textarea></label>
          <label>Link<input type="text" name="link" placeholder="https://..."></label>
          <label>Social-Media-Links (eine Zeile je Link: Label|URL)<textarea name="socials" placeholder="Instagram|https://instagram.com/..."></textarea></label>
          <label>Foto<input type="file" name="photo" accept="image/*"></label>
        </div>
        <div class="actions">
          <button type="submit">Projekt hinzufügen</button>
        </div>
      </form>
    </div>

    <a class="home-link" href="/">&larr; zur Startseite</a>
  </div>
</body>
</html>`;
}

app.get('/admin', requireAdminAuth, (req, res) => {
  res.send(renderAdminPage(loadProjects()));
});

app.post('/admin/projects', requireAdminAuth, upload.single('photo'), (req, res) => {
  const projects = loadProjects();
  const id = slugify(req.body.title) + '-' + crypto.randomUUID().slice(0, 6);
  const project = {
    id,
    title: req.body.title || 'Ohne Titel',
    eyebrow: req.body.eyebrow || 'Projekt',
    icon: req.body.icon || '🔹',
    info: req.body.info || '',
    link: req.body.link || '#',
    image: req.file ? `/uploads/${req.file.filename}` : null,
    socials: parseSocials(req.body.socials),
  };
  projects.push(project);
  saveProjects(projects);
  res.redirect('/admin');
});

app.post('/admin/projects/:id', requireAdminAuth, upload.single('photo'), (req, res) => {
  const projects = loadProjects();
  const idx = projects.findIndex((p) => p.id === req.params.id);
  if (idx === -1) return res.status(404).send('Projekt nicht gefunden.');

  const existing = projects[idx];
  let image = existing.image;
  if (req.file) {
    if (existing.image) {
      const oldPath = path.join(UPLOADS_DIR, path.basename(existing.image));
      fs.unlink(oldPath, () => {});
    }
    image = `/uploads/${req.file.filename}`;
  }

  projects[idx] = {
    ...existing,
    title: req.body.title || existing.title,
    eyebrow: req.body.eyebrow || existing.eyebrow,
    icon: req.body.icon || existing.icon,
    info: req.body.info !== undefined ? req.body.info : existing.info,
    link: req.body.link || existing.link,
    image,
    socials: parseSocials(req.body.socials),
  };
  saveProjects(projects);
  res.redirect('/admin');
});

app.post('/admin/projects/:id/delete', requireAdminAuth, (req, res) => {
  const projects = loadProjects();
  const idx = projects.findIndex((p) => p.id === req.params.id);
  if (idx !== -1) {
    const [removed] = projects.splice(idx, 1);
    if (removed.image) {
      const oldPath = path.join(UPLOADS_DIR, path.basename(removed.image));
      fs.unlink(oldPath, () => {});
    }
    saveProjects(projects);
  }
  res.redirect('/admin');
});

// --- Dropbox-Anbindung für /choerle ---

let cachedToken = null;
let tokenExpiresAt = 0;

async function getDropboxAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: process.env.DROPBOX_REFRESH_TOKEN,
      client_id: process.env.DROPBOX_APP_KEY,
      client_secret: process.env.DROPBOX_APP_SECRET,
    }),
  });

  if (!res.ok) {
    throw new Error(`Dropbox token refresh fehlgeschlagen: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

function slugifyChoerle(str) {
  return slugify(str);
}

// In Dropbox liegt pro Lied ein eigener Ordner (Ordnername = Liedtitel),
// darin die PDF-Noten und die MP3-Übe-Tracks.
async function listChoerleSongFolders() {
  const token = await getDropboxAccessToken();
  const folderPath = process.env.DROPBOX_FOLDER_PATH || '';

  const listRes = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ path: folderPath, recursive: false }),
  });

  if (!listRes.ok) {
    throw new Error(`Dropbox list_folder fehlgeschlagen: ${listRes.status} ${await listRes.text()}`);
  }

  const listData = await listRes.json();
  const folders = listData.entries
    .filter((entry) => entry['.tag'] === 'folder')
    .map((f) => ({ title: f.name, path_lower: f.path_lower, slug: slugifyChoerle(f.name) }));

  folders.sort((a, b) => a.title.localeCompare(b.title, 'de'));
  return folders;
}

// Listet die Dateien in einem Lied-Ordner. Statt Dropbox-Temp-Links (die von
// Dropbox mit "Content-Disposition: attachment" ausgeliefert werden und sich
// deshalb nicht in einem <iframe> anzeigen lassen) liefern wir hier nur die
// Dateinamen zurück – der eigentliche Datei-Inhalt läuft über die eigene
// Proxy-Route /choerle/:slug/file/:filename weiter unten.
async function getSongFiles(folderPathLower) {
  const token = await getDropboxAccessToken();

  const listRes = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ path: folderPathLower, recursive: false }),
  });

  if (!listRes.ok) {
    throw new Error(`Dropbox list_folder fehlgeschlagen: ${listRes.status} ${await listRes.text()}`);
  }

  const listData = await listRes.json();
  const files = listData.entries.filter((entry) => entry['.tag'] === 'file');

  const pdf = files.find((f) => /\.pdf$/i.test(f.name)) || null;
  const audio = files
    .filter((f) => /\.(mp3|wav|m4a|ogg)$/i.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));

  return {
    pdf: pdf ? { name: pdf.name } : null,
    audio: audio.map((a) => ({ name: a.name })),
  };
}

async function findSongFile(folderPathLower, filename) {
  const token = await getDropboxAccessToken();
  const listRes = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ path: folderPathLower, recursive: false }),
  });
  if (!listRes.ok) {
    throw new Error(`Dropbox list_folder fehlgeschlagen: ${listRes.status} ${await listRes.text()}`);
  }
  const listData = await listRes.json();
  return listData.entries.find((e) => e['.tag'] === 'file' && e.name === filename) || null;
}

// Dropbox verlangt für HTTP-Header (Dropbox-API-Arg) reines ASCII. Nicht-ASCII-
// Zeichen (Umlaute etc.) werden als \uXXXX escaped, wie von der Dropbox-API gefordert.
function asciiSafeJson(obj) {
  return JSON.stringify(obj).replace(/[-￿]/g, (c) => '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4));
}

const CHOERLE_MIME_TYPES = {
  '.pdf': 'application/pdf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
};

const CHOERLE_STYLE = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%);
    color: #f8fafc;
    min-height: 100vh;
    padding: 2.5rem 1rem 5rem;
  }
  .container { max-width: 720px; margin: 0 auto; }
  h1 { font-size: clamp(1.6rem, 5vw, 2.2rem); margin-bottom: 0.25rem; }
  p.subtitle { color: #cbd5e1; margin-bottom: 2rem; }
  ul { list-style: none; }
  li { margin-bottom: 0.75rem; }
  a.file-link {
    display: block;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 10px;
    padding: 0.9rem 1.1rem;
    color: #38bdf8;
    text-decoration: none;
    font-size: 1.05rem;
    transition: background 0.15s ease;
  }
  a.file-link:hover { background: rgba(255,255,255,0.12); }
  .home-link { display: inline-block; margin-top: 2rem; color: #94a3b8; font-size: 0.9rem; text-decoration: none; }
  .home-link:hover { text-decoration: underline; }
  .empty { color: #94a3b8; }
  .pdf-viewer {
    width: 100%;
    height: 70vh;
    min-height: 420px;
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 12px;
    background: #fff;
    margin-bottom: 1rem;
  }
  .pdf-fallback { margin-bottom: 2rem; font-size: 0.85rem; color: #94a3b8; }
  .audio-list { display: flex; flex-direction: column; gap: 0.9rem; margin-bottom: 2rem; }
  .audio-item {
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 10px;
    padding: 0.8rem 1rem;
  }
  .audio-name { display: block; font-size: 0.85rem; color: #cbd5e1; margin-bottom: 0.5rem; }
  audio { width: 100%; }
  .download-link { display: inline-block; margin-top: 0.5rem; font-size: 0.8rem; color: #38bdf8; text-decoration: none; }
  .download-link:hover { text-decoration: underline; }
  .legal-footer {
    position: fixed;
    right: 1rem;
    bottom: 0.75rem;
    display: flex;
    gap: 0.9rem;
    font-size: 0.78rem;
  }
  .legal-footer a { color: #64748b; text-decoration: none; }
  .legal-footer a:hover { color: #94a3b8; }
  .cookie-banner {
    position: fixed;
    left: 0; right: 0; bottom: 0;
    z-index: 20;
    display: none;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 1rem 1.2rem;
    background: rgba(15,23,42,0.97);
    border-top: 1px solid rgba(255,255,255,0.12);
    backdrop-filter: blur(6px);
  }
  .cookie-banner p { color: #e2e8f0; font-size: 0.85rem; max-width: 640px; line-height: 1.5; margin: 0; }
  .cookie-banner a { color: #38bdf8; }
  .cookie-banner button {
    padding: 0.55rem 1.2rem;
    border-radius: 999px;
    border: none;
    background: #38bdf8;
    color: #0f172a;
    font-weight: 600;
    font-size: 0.85rem;
    cursor: pointer;
    white-space: nowrap;
  }
  .cookie-banner button:hover { background: #0ea5e9; }
`;

const COOKIE_BANNER_BLOCK = `
  <div class="cookie-banner" id="cookie-banner">
    <p>Diese Website verwendet ausschließlich technisch notwendige Funktionen – keine Cookies zu Tracking- oder Marketingzwecken. Mehr dazu in der <a href="/datenschutz.html">Datenschutzerklärung</a>.</p>
    <button id="cookie-banner-ok">Verstanden</button>
  </div>
  <script>
    (function () {
      var KEY = 'cookie_notice_ack_v1';
      var banner = document.getElementById('cookie-banner');
      if (banner && !localStorage.getItem(KEY)) {
        banner.style.display = 'flex';
      }
      var btn = document.getElementById('cookie-banner-ok');
      if (btn) {
        btn.addEventListener('click', function () {
          try { localStorage.setItem(KEY, '1'); } catch (e) {}
          banner.style.display = 'none';
        });
      }
    })();
  </script>`;

const LEGAL_FOOTER_BLOCK = `
  <div class="legal-footer">
    <a href="/impressum.html">Impressum</a>
    <a href="/datenschutz.html">Datenschutz</a>
    <a href="/apps.html">Apps</a>
  </div>`;

function renderChoerleListPage(itemsHtml) {
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Frühstückschörle – Lieder</title>
<style>${CHOERLE_STYLE}</style>
</head>
<body>
  <div class="container">
    <h1>🎶 Frühstückschörle</h1>
    <p class="subtitle">Lied auswählen</p>
    <ul>${itemsHtml}</ul>
    <a class="home-link" href="/">&larr; zurück zur Startseite</a>
  </div>
  ${LEGAL_FOOTER_BLOCK}
  ${COOKIE_BANNER_BLOCK}
</body>
</html>`;
}

function renderChoerleSongPage(song, notFound) {
  let body;
  if (notFound || !song) {
    body = `<h1>🎶 Frühstückschörle</h1><p class="subtitle empty">Dieses Lied wurde nicht gefunden.</p>`;
  } else {
    const fileUrl = (filename) => `/choerle/${song.slug}/file/${encodeURIComponent(filename)}`;

    const pdfSection = song.pdf
      ? `<iframe class="pdf-viewer" src="${fileUrl(song.pdf.name)}"></iframe>
         <p class="pdf-fallback">
           <a href="${fileUrl(song.pdf.name)}" target="_blank" rel="noopener">PDF ansehen (neuer Tab)</a>
           &nbsp;·&nbsp;
           <a href="${fileUrl(song.pdf.name)}?download=1">PDF herunterladen</a>
         </p>`
      : `<p class="empty">PDF derzeit nicht verfügbar.</p>`;

    const audioSection = song.audio.length
      ? `<div class="audio-list">${song.audio
          .map(
            (a) => `<div class="audio-item">
              <span class="audio-name">${escapeHtml(a.name)}</span>
              <audio controls preload="none" src="${fileUrl(a.name)}"></audio>
              <a class="download-link" href="${fileUrl(a.name)}?download=1">Herunterladen</a>
            </div>`
          )
          .join('')}</div>`
      : `<p class="empty">Keine Audiodatei zu diesem Lied vorhanden.</p>`;

    body = `<h1>🎶 ${escapeHtml(song.title)}</h1>
      <p class="subtitle">Frühstückschörle</p>
      ${pdfSection}
      ${audioSection}`;
  }

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${song ? escapeHtml(song.title) : 'Lied nicht gefunden'} – Frühstückschörle</title>
<style>${CHOERLE_STYLE}</style>
</head>
<body>
  <div class="container">
    ${body}
    <a class="home-link" href="/choerle">&larr; zurück zur Liedauswahl</a>
  </div>
  ${LEGAL_FOOTER_BLOCK}
  ${COOKIE_BANNER_BLOCK}
</body>
</html>`;
}

app.get('/choerle', async (req, res) => {
  try {
    const folders = await listChoerleSongFolders();
    if (folders.length === 0) {
      res.send(renderChoerleListPage('<li class="empty">Noch keine Lieder-Ordner vorhanden.</li>'));
      return;
    }
    const items = folders
      .map((f) => `<li><a class="file-link" href="/choerle/${f.slug}">${escapeHtml(f.title)}</a></li>`)
      .join('\n');
    res.send(renderChoerleListPage(items));
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .send(renderChoerleListPage('<li class="empty">Die Lieder konnten gerade nicht geladen werden. Bitte später erneut versuchen.</li>'));
  }
});

app.get('/choerle/:slug', async (req, res) => {
  try {
    const folders = await listChoerleSongFolders();
    const folder = folders.find((f) => f.slug === req.params.slug);
    if (!folder) {
      res.status(404).send(renderChoerleSongPage(null, true));
      return;
    }
    const { pdf, audio } = await getSongFiles(folder.path_lower);
    res.send(renderChoerleSongPage({ title: folder.title, slug: folder.slug, pdf, audio }));
  } catch (err) {
    console.error(err);
    res.status(500).send(renderChoerleSongPage(null, true));
  }
});

// Proxy: liefert PDF/MP3-Inhalte direkt von Dropbox aus, mit korrektem
// Content-Type und "inline" (Ansehen/Abspielen) oder "attachment" (?download=1)
// als Content-Disposition. Unterstützt HTTP-Range-Requests fürs Vor-/Zurückspulen
// bei Audiodateien.
app.get('/choerle/:slug/file/:filename', async (req, res) => {
  try {
    const folders = await listChoerleSongFolders();
    const folder = folders.find((f) => f.slug === req.params.slug);
    if (!folder) return res.status(404).send('Lied nicht gefunden.');

    const file = await findSongFile(folder.path_lower, req.params.filename);
    if (!file) return res.status(404).send('Datei nicht gefunden.');

    const token = await getDropboxAccessToken();
    const dropboxHeaders = {
      Authorization: `Bearer ${token}`,
      // Der Dropbox-API-Arg-Header muss reines ASCII sein; Umlaute & Sonderzeichen
      // in Dateinamen (z. B. "Über sieben Brücken") müssen als \uXXXX escaped werden,
      // sonst antwortet Dropbox mit "path/not_found".
      'Dropbox-API-Arg': asciiSafeJson({ path: file.path_lower }),
    };
    if (req.headers.range) dropboxHeaders.Range = req.headers.range;

    const dropboxRes = await fetch('https://content.dropboxapi.com/2/files/download', {
      method: 'POST',
      headers: dropboxHeaders,
    });

    if (!dropboxRes.ok && dropboxRes.status !== 206) {
      console.error('Dropbox download fehlgeschlagen:', dropboxRes.status, await dropboxRes.text());
      return res.status(502).send('Fehler beim Laden der Datei.');
    }

    const ext = path.extname(file.name).toLowerCase();
    const mime = CHOERLE_MIME_TYPES[ext] || 'application/octet-stream';
    const disposition = req.query.download ? 'attachment' : 'inline';
    const safeName = file.name.replace(/[^\w.\- ]/g, '_');

    res.status(dropboxRes.status);
    res.setHeader('Content-Type', mime);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Disposition', `${disposition}; filename="${safeName}"`);
    const contentRange = dropboxRes.headers.get('content-range');
    if (contentRange) res.setHeader('Content-Range', contentRange);
    const contentLength = dropboxRes.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);

    Readable.fromWeb(dropboxRes.body).pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).send('Fehler beim Laden der Datei.');
  }
});

app.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
});
