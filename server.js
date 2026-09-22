const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const nodemailer = require('nodemailer');
const sharp = require('sharp');
const { Readable } = require('stream');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Persistenter Speicher (Railway Volume) ---
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const NEWS_FILE = path.join(DATA_DIR, 'news.json');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// --- News-Shoutbox (kurze Meldungen auf der Startseite) ---
function loadNews() {
  try {
    const raw = fs.readFileSync(NEWS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    saveNews([]);
    return [];
  }
}

function saveNews(list) {
  fs.writeFileSync(NEWS_FILE, JSON.stringify(list, null, 2));
}

// --- Kontakt-/Rechtliches-Einstellungen (Impressum, Datenschutz, Kontaktformular) ---
const DEFAULT_SETTINGS = {
  contactName: 'Martin Renner',
  street: 'Berliner Straße 26',
  zip: '74172',
  city: 'Neckarsulm',
  email: 'martin.renner@gmail.com',
  phone: '',
};

function loadSettings() {
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    saveSettings(DEFAULT_SETTINGS);
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

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

// --- Bildvarianten für die Slideshow ---
// Aus jedem hochgeladenen Projektfoto werden verkleinerte WebP-Varianten erzeugt
// (<name>-w1600.webp usw.). Die Startseite wählt per srcset die passende Größe –
// scharf auf großen/Retina-Displays, trotzdem schlank auf dem Handy.
const IMAGE_WIDTHS = [960, 1600, 2560, 3840];
const MAX_IMAGE_WIDTH = 3840;

function variantName(filename, width) {
  return `${path.parse(filename).name}-w${width}.webp`;
}

// Alle vorhandenen Varianten eines Fotos (aufsteigend nach Breite).
function listVariantFiles(filename) {
  const prefix = `${path.parse(filename).name}-w`;
  let files = [];
  try {
    files = fs.readdirSync(UPLOADS_DIR);
  } catch {
    return [];
  }
  return files
    .filter((f) => f.startsWith(prefix) && f.endsWith('.webp'))
    .map((f) => ({ file: f, width: parseInt(f.slice(prefix.length), 10) }))
    .filter((v) => Number.isFinite(v.width))
    .sort((a, b) => a.width - b.width);
}

async function createImageVariants(filename) {
  const src = path.join(UPLOADS_DIR, filename);
  const meta = await sharp(src).metadata();
  const rotated = meta.orientation && meta.orientation >= 5; // Hochkant laut EXIF -> Breite/Höhe vertauscht
  const origWidth = rotated ? meta.height : meta.width;
  const top = Math.min(origWidth, MAX_IMAGE_WIDTH);
  // Standardbreiten unterhalb des Originals + das Original selbst (max. 4K), nie hochskalieren.
  const widths = Array.from(new Set([...IMAGE_WIDTHS.filter((w) => w < top), top]));
  for (const w of widths) {
    const out = path.join(UPLOADS_DIR, variantName(filename, w));
    if (fs.existsSync(out)) continue;
    await sharp(src)
      .rotate()
      .resize({ width: w, withoutEnlargement: true })
      .webp({ quality: 88, effort: 5 })
      .toFile(out);
  }
}

function imageVariants(imageUrl) {
  if (!imageUrl || !imageUrl.startsWith('/uploads/')) return [];
  return listVariantFiles(path.basename(imageUrl)).map((v) => ({ url: `/uploads/${v.file}`, width: v.width }));
}

function deleteUploadedImage(imageUrl) {
  if (!imageUrl) return;
  const filename = path.basename(imageUrl);
  for (const v of listVariantFiles(filename)) fs.unlink(path.join(UPLOADS_DIR, v.file), () => {});
  fs.unlink(path.join(UPLOADS_DIR, filename), () => {});
}

async function createImageVariantsSafe(filename) {
  try {
    await createImageVariants(filename);
  } catch (err) {
    // Ohne Varianten zeigt die Startseite einfach das Original an.
    console.error(`Bildvarianten für ${filename} fehlgeschlagen:`, err.message);
  }
}

async function ensureAllImageVariants() {
  for (const p of loadProjects()) {
    if (!p.image || !p.image.startsWith('/uploads/')) continue;
    try {
      await createImageVariants(path.basename(p.image));
    } catch (err) {
      console.error(`Bildvarianten für ${p.image} fehlgeschlagen:`, err.message);
    }
  }
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

// Ergänzt fehlendes "https://" bei Links, die sonst als relativer Pfad
// interpretiert würden (z. B. "www.instagram.com/..." -> "Cannot GET /...").
// Interne Pfade ("/choerle"), "#", "mailto:" und "tel:" bleiben unverändert.
function normalizeUrl(href) {
  const h = (href || '').trim();
  if (!h || h === '#') return h || '#';
  if (/^(https?:\/\/|mailto:|tel:|\/)/i.test(h)) return h;
  return 'https://' + h;
}

function parseSocials(text) {
  if (!text) return [];
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, href] = line.split('|').map((s) => (s || '').trim());
      return { label: label || 'Link', href: normalizeUrl(href) };
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
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('Nur Bilddateien sind erlaubt.'));
  },
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
// Dateinamen sind eindeutige UUIDs – ein neues Foto bekommt immer einen neuen Namen,
// daher dürfen Browser die Bilder lange zwischenspeichern.
app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '365d', immutable: true }));

// --- Rechtliche Seiten & Kontaktformular (dynamisch, siehe unten) ---
// Diese Routen müssen VOR der Static-Middleware registriert werden, damit sie
// die alten statischen public/impressum.html & public/datenschutz.html überschreiben.
app.get('/impressum.html', (req, res) => {
  res.send(renderImpressumPage(loadSettings()));
});

app.get('/datenschutz.html', (req, res) => {
  res.send(renderDatenschutzPage(loadSettings()));
});

app.get('/apps', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'apps.html'));
});

app.get('/kontakt', (req, res) => {
  res.redirect(302, '/?p=martin-renner&form=kontakt');
});

// Statische Startseite (public/index.html) und weitere statische Seiten unter "/"
app.use(express.static(path.join(__dirname, 'public')));

// --- Öffentliche API für die Startseiten-Slideshow ---
app.get('/api/projects', (req, res) => {
  res.json(loadProjects().map((p) => ({ ...p, imageVariants: imageVariants(p.image) })));
});

// --- Öffentliche API für die News-Shoutbox ---
app.get('/api/news', (req, res) => {
  const news = loadNews()
    .slice()
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    .slice(0, 8);
  res.json(news);
});

// --- Newsletter-Anmeldung über Mailchimp ---
async function subscribeToMailchimp(email) {
  const apiKey = process.env.MAILCHIMP_API_KEY;
  const audienceId = process.env.MAILCHIMP_AUDIENCE_ID;
  const serverPrefix = process.env.MAILCHIMP_SERVER_PREFIX; // z. B. "us21" (Endung deines API-Keys nach dem "-")
  if (!apiKey || !audienceId || !serverPrefix) {
    const err = new Error('MAILCHIMP_NOT_CONFIGURED');
    err.code = 'MAILCHIMP_NOT_CONFIGURED';
    throw err;
  }
  const hash = crypto.createHash('md5').update(email.trim().toLowerCase()).digest('hex');
  const url = `https://${serverPrefix}.api.mailchimp.com/3.0/lists/${audienceId}/members/${hash}`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: 'Basic ' + Buffer.from('anystring:' + apiKey).toString('base64'),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email_address: email,
      status_if_new: 'subscribed',
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data && data.detail) || 'Mailchimp-Fehler');
  }
  return data;
}

app.post('/api/newsletter', async (req, res) => {
  const email = (req.body.email || '').trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: 'Bitte eine gültige E-Mail-Adresse eingeben.' });
  }
  try {
    await subscribeToMailchimp(email);
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'MAILCHIMP_NOT_CONFIGURED') {
      console.error('Newsletter: Mailchimp ist nicht konfiguriert (MAILCHIMP_API_KEY/MAILCHIMP_AUDIENCE_ID/MAILCHIMP_SERVER_PREFIX fehlen).');
      return res.status(503).json({ ok: false, error: 'Die Newsletter-Anmeldung ist aktuell nicht verfügbar.' });
    }
    console.error('Newsletter: Mailchimp-Fehler:', err.message);
    res.status(502).json({ ok: false, error: 'Anmeldung fehlgeschlagen. Bitte später erneut versuchen.' });
  }
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

// --- Captcha (selbstgehostet, kein Drittanbieter, keine Cookies) ---
const CAPTCHA_SECRET = process.env.CAPTCHA_SECRET || crypto.randomBytes(32).toString('hex');
const CAPTCHA_TTL_MS = 15 * 60 * 1000;

function createCaptcha() {
  const a = crypto.randomInt(1, 10);
  const b = crypto.randomInt(1, 10);
  const expires = Date.now() + CAPTCHA_TTL_MS;
  const payload = `${a}:${b}:${expires}`;
  const sig = crypto.createHmac('sha256', CAPTCHA_SECRET).update(payload).digest('hex');
  const token = Buffer.from(payload).toString('base64') + '.' + sig;
  return { question: `${a} + ${b}`, token };
}

function verifyCaptcha(token, answer) {
  if (!token || typeof token !== 'string' || token.indexOf('.') === -1) return false;
  const [payloadB64, sig] = token.split('.');
  let payload;
  try {
    payload = Buffer.from(payloadB64, 'base64').toString('utf8');
  } catch {
    return false;
  }
  const expectedSig = crypto.createHmac('sha256', CAPTCHA_SECRET).update(payload).digest('hex');
  const sigBuf = Buffer.from(sig || '', 'hex');
  const expectedBuf = Buffer.from(expectedSig, 'hex');
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) return false;
  const parts = payload.split(':');
  const a = parseInt(parts[0], 10);
  const b = parseInt(parts[1], 10);
  const expires = parseInt(parts[2], 10);
  if (!Number.isFinite(expires) || Date.now() > expires) return false;
  return parseInt(answer, 10) === a + b;
}

// --- Mailversand fürs Kontaktformular (SMTP über Umgebungsvariablen) ---
let mailTransporter;
function getMailTransporter() {
  if (mailTransporter !== undefined) return mailTransporter;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    mailTransporter = null;
    return mailTransporter;
  }
  mailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return mailTransporter;
}

// --- Gemeinsame Projekt-Navigation (oben), auch auf allen Unterseiten sichtbar ---
const TOP_NAV_STYLE = `
  .top-nav {
    position: fixed;
    top: 0; left: 0; right: 0;
    z-index: 15;
    display: flex;
    align-items: center;
    gap: 1.3rem;
    padding: 1.1rem 1.5rem;
    background: linear-gradient(180deg, rgba(15,23,42,0.85) 0%, rgba(15,23,42,0) 100%);
    overflow-x: auto;
    white-space: nowrap;
  }
  .top-nav a {
    color: rgba(255,255,255,0.65);
    font-size: 0.85rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    text-decoration: none;
    padding: 0.3rem 0;
    flex: 0 0 auto;
  }
  .top-nav a:hover { color: #f8fafc; }
  .top-nav a.active { color: #38bdf8; }
  .top-nav .nav-divider {
    width: 1px;
    height: 16px;
    background: rgba(255,255,255,0.2);
    flex: 0 0 auto;
  }
  @media (max-width: 700px) {
    .top-nav {
      flex-wrap: wrap;
      overflow-x: visible;
      white-space: normal;
      padding: 0.8rem 1rem;
      gap: 0.5rem 0.9rem;
      row-gap: 0.4rem;
      background: rgba(15,23,42,0.72);
      backdrop-filter: blur(6px);
    }
    .top-nav .nav-divider { display: none; }
    .top-nav a { font-size: 0.8rem; padding: 0.15rem 0; }
  }
`;

const TOP_NAV_BLOCK = `
  <nav class="top-nav" id="top-nav"></nav>
  <script>
    (function () {
      function esc(str) {
        return String(str).replace(/[&<>"']/g, function (c) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
      }
      fetch('/api/projects')
        .then(function (r) { return r.json(); })
        .then(function (slides) {
          var nav = document.getElementById('top-nav');
          if (!nav || !Array.isArray(slides)) return;
          var html = slides
            .map(function (s) {
              var key = s.id || s.key || s.title;
              return '<a href="/?p=' + encodeURIComponent(key) + '">' + esc(s.title) + '</a>';
            })
            .join('');
          html += '<span class="nav-divider"></span>';
          html += '<a href="/kontakt">Kontakt</a>';
          nav.innerHTML = html;
        })
        .catch(function () {});
    })();
  </script>`;

// --- Gemeinsames Styling für Impressum / Datenschutz / Kontakt ---
const LEGAL_PAGE_STYLE = `
  ${TOP_NAV_STYLE}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%);
    color: #f8fafc;
    min-height: 100vh;
    padding: 6.2rem 1rem 5rem;
  }
  .container { max-width: 720px; margin: 0 auto; }
  h1 { font-size: clamp(1.6rem, 5vw, 2.2rem); margin-bottom: 1.5rem; }
  h2 { font-size: 1.15rem; margin-top: 2rem; margin-bottom: 0.6rem; color: #38bdf8; }
  h3 { font-size: 1rem; margin-top: 1.2rem; margin-bottom: 0.4rem; color: #cbd5e1; }
  p, li { line-height: 1.6; color: #e2e8f0; margin-bottom: 0.6rem; }
  ul { padding-left: 1.2rem; margin-bottom: 0.6rem; }
  a { color: #38bdf8; }
  .home-link { display: inline-block; margin-top: 2.5rem; color: #94a3b8; font-size: 0.9rem; text-decoration: none; }
  .home-link:hover { text-decoration: underline; }
  .hint {
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 10px;
    padding: 1rem 1.2rem;
    font-size: 0.9rem;
    color: #cbd5e1;
    margin-bottom: 1.5rem;
    max-width: 480px;
  }
  .message-box {
    background: rgba(56,189,248,0.15);
    border: 1px solid rgba(56,189,248,0.4);
    color: #7dd3fc;
    padding: 0.9rem 1.1rem;
    border-radius: 10px;
    margin-bottom: 1.5rem;
    font-size: 0.9rem;
  }
  .message-box.error {
    background: rgba(239,68,68,0.12);
    border-color: rgba(239,68,68,0.4);
    color: #fca5a5;
  }
  form { margin-top: 0.5rem; display: flex; flex-direction: column; gap: 0.9rem; max-width: 480px; }
  label { font-size: 0.85rem; color: #94a3b8; display: flex; flex-direction: column; gap: 0.3rem; }
  input, textarea {
    width: 100%;
    padding: 0.65rem 0.8rem;
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.15);
    background: rgba(255,255,255,0.05);
    color: #f8fafc;
    font-family: inherit;
    font-size: 0.95rem;
    transition: border-color 0.15s ease, background 0.15s ease;
  }
  input:focus, textarea:focus {
    outline: none;
    border-color: #38bdf8;
    background: rgba(56,189,248,0.07);
  }
  textarea { min-height: 110px; resize: vertical; }
  button {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.7rem 1.5rem;
    border-radius: 999px;
    border: none;
    background: #38bdf8;
    color: #0f172a;
    font-weight: 600;
    cursor: pointer;
    font-size: 0.95rem;
    transition: background 0.15s ease, transform 0.15s ease;
  }
  button:hover { background: #0ea5e9; transform: translateY(-1px); }
  button svg { display: block; }
  .hp-field { position: absolute; left: -9999px; top: -9999px; }
  .contact-card {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 18px;
    padding: 1.8rem 1.8rem 2rem;
    max-width: 540px;
    margin-top: 0.5rem;
  }
  .contact-card .hint {
    background: none;
    border: none;
    padding: 0;
    max-width: none;
    margin-bottom: 1.4rem;
  }
  .contact-card form { margin-top: 0; max-width: none; }
  .contact-card .message-box { max-width: none; }
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

  .newsletter-box {
    position: relative;
    display: none;
    max-width: 420px;
    margin: 3rem auto 1rem;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 12px;
    padding: 1rem 1.1rem;
  }
  .newsletter-text { font-size: 0.82rem; color: #f8fafc; margin-bottom: 0.3rem; }
  .newsletter-subtext { font-size: 0.74rem; color: #94a3b8; margin-bottom: 0.6rem; line-height: 1.4; }
  .newsletter-form { display: flex; gap: 0.4rem; }
  .newsletter-form input {
    flex: 1;
    min-width: 0;
    padding: 0.45rem 0.6rem;
    border-radius: 6px;
    border: 1px solid rgba(255,255,255,0.15);
    background: rgba(255,255,255,0.06);
    color: #f8fafc;
    font-size: 0.78rem;
    font-family: inherit;
  }
  .newsletter-form button {
    padding: 0.45rem 0.7rem;
    border-radius: 6px;
    border: none;
    background: #38bdf8;
    color: #0f172a;
    font-weight: 600;
    font-size: 0.78rem;
    cursor: pointer;
    white-space: nowrap;
  }
  .newsletter-form button:hover { background: #0ea5e9; }
  .newsletter-msg { font-size: 0.72rem; color: #94a3b8; margin-top: 0.4rem; min-height: 1em; }

  @media (max-width: 560px) {
    body { padding: 1.8rem 1rem 4rem; }
    h1 { font-size: 1.5rem; }
    .newsletter-form { flex-direction: column; align-items: stretch; }
    .newsletter-form button { align-self: stretch; }
  }
`;

function renderImpressumPage(settings) {
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Impressum – martinrenner.de</title>
<style>${LEGAL_PAGE_STYLE}</style>
</head>
<body>
  ${TOP_NAV_BLOCK}
  <div class="container">
    <h1>Impressum</h1>

    <h2>Angaben gemäß § 5 DDG</h2>
    <p>${escapeHtml(settings.contactName)}<br>
    ${escapeHtml(settings.street)}<br>
    ${escapeHtml(settings.zip)} ${escapeHtml(settings.city)}<br>
    Deutschland</p>

    <h2>Kontakt</h2>
    <p>E-Mail: <a href="mailto:${escapeAttr(settings.email)}">${escapeHtml(settings.email)}</a>${settings.phone ? `<br>Telefon: ${escapeHtml(settings.phone)}` : ''}</p>
    <p>Für Anfragen nutze gerne auch das <a href="/kontakt">Kontaktformular</a>.</p>

    <h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
    <p>${escapeHtml(settings.contactName)} (Anschrift wie oben)</p>

    <h2>Hinweis zur Website</h2>
    <p>Diese Website dient privaten, nicht-kommerziellen Zwecken. Es werden über sie keine Waren oder Dienstleistungen verkauft.</p>

    <h2>Haftung für Inhalte</h2>
    <p>Als Diensteanbieter bin ich gemäß § 7 Abs. 1 DDG für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 DDG bin ich als Diensteanbieter jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen. Verpflichtungen zur Entfernung oder Sperrung der Nutzung von Informationen nach den allgemeinen Gesetzen bleiben hiervon unberührt.</p>

    <h2>Haftung für Links</h2>
    <p>Mein Angebot enthält gegebenenfalls Links zu externen Websites Dritter, auf deren Inhalte ich keinen Einfluss habe. Deshalb kann ich für diese fremden Inhalte auch keine Gewähr übernehmen. Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber der Seiten verantwortlich.</p>

    <h2>Urheberrecht</h2>
    <p>Die durch mich erstellten Inhalte und Werke auf diesen Seiten unterliegen dem deutschen Urheberrecht. Vervielfältigung, Bearbeitung, Verbreitung und jede Art der Verwertung außerhalb der Grenzen des Urheberrechtes bedürfen meiner schriftlichen Zustimmung.</p>

    <a class="home-link" href="/">&larr; zurück zur Startseite</a>
  </div>

  ${LEGAL_FOOTER_BLOCK}
  ${COOKIE_BANNER_BLOCK}
</body>
</html>`;
}

function renderDatenschutzPage(settings) {
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Datenschutzerklärung – martinrenner.de</title>
<style>${LEGAL_PAGE_STYLE}</style>
</head>
<body>
  ${TOP_NAV_BLOCK}
  <div class="container">
    <h1>Datenschutzerklärung</h1>

    <h2>1. Verantwortlicher</h2>
    <p>${escapeHtml(settings.contactName)}<br>
    ${escapeHtml(settings.street)}<br>
    ${escapeHtml(settings.zip)} ${escapeHtml(settings.city)}<br>
    Deutschland<br>
    E-Mail: <a href="mailto:${escapeAttr(settings.email)}">${escapeHtml(settings.email)}</a></p>

    <h2>2. Allgemeines zur Datenverarbeitung</h2>
    <p>Ich erhebe und verwende personenbezogene Daten meiner Nutzer grundsätzlich nur, soweit dies zur Bereitstellung einer funktionsfähigen Website sowie meiner Inhalte und Leistungen erforderlich ist. Die Verarbeitung erfolgt nur mit Einwilligung des Nutzers oder auf Grundlage einer gesetzlichen Erlaubnis (Art. 6 DSGVO).</p>

    <h2>3. Bereitstellung der Website und Erstellung von Server-Logfiles</h2>
    <p>Diese Website wird bei Railway (Railway Corporation) gehostet. Zusätzlich wird der Netzwerkverkehr über den Dienst Cloudflare (Cloudflare, Inc., USA, bzw. Cloudflare Germany GmbH) geleitet, der als Content-Delivery-Network (CDN) und Sicherheits-/DNS-Dienst vorgeschaltet ist. Beim Aufruf der Website erheben Cloudflare und der Hosting-Provider automatisch technische Verbindungsdaten, u. a.:</p>
    <ul>
      <li>IP-Adresse des anfragenden Geräts</li>
      <li>Datum und Uhrzeit des Zugriffs</li>
      <li>aufgerufene Seite / Datei</li>
      <li>Browsertyp und -version, verwendetes Betriebssystem</li>
      <li>Referrer-URL (zuvor besuchte Seite)</li>
    </ul>
    <p>Diese Daten werden ausschließlich zum technischen Betrieb, zur Absicherung der Website (Fehleranalyse, IT-Sicherheit, Schutz vor Missbrauch/DDoS) verarbeitet und nicht zu Marketingzwecken genutzt oder mit anderen Datenquellen zusammengeführt. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an einem sicheren und stabilen Betrieb der Website). Die Daten werden nach Zweckfortfall gelöscht bzw. anonymisiert.</p>
    <p>Da die eingesetzten Dienstleister ihren Sitz bzw. Teile ihrer Infrastruktur außerhalb der EU/des EWR (insbesondere in den USA) haben können, ist eine Datenübermittlung in ein Drittland nicht auszuschließen. Ich achte bei der Auswahl meiner Dienstleister auf angemessene Garantien (z. B. EU-Standardvertragsklauseln nach Art. 46 DSGVO).</p>

    <h2>4. Kontaktaufnahme über das Kontaktformular</h2>
    <p>Über das <a href="/kontakt">Kontaktformular</a> auf der Startseite kannst du mir eine Nachricht senden. Die von dir eingegebenen Daten (Name, E-Mail-Adresse, Nachricht) werden dabei an den Server dieser Website (gehostet bei Railway) übermittelt und von dort per E-Mail an mein Postfach weitergeleitet. Es findet keine Speicherung deiner Nachricht in einer Datenbank statt – die Daten werden ausschließlich zur Bearbeitung deiner Anfrage genutzt und nicht an Dritte weitergegeben. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an der Beantwortung von Anfragen) bzw. Art. 6 Abs. 1 lit. b DSGVO, sofern die Anfrage der Anbahnung eines Vertrags dient.</p>
    <p>Zum Schutz vor automatisiertem Missbrauch (Spam) enthält das Formular eine einfache Rechenaufgabe ("Captcha"). Diese wird ausschließlich serverseitig auf dieser Website erzeugt und geprüft – es wird kein Drittanbieter-Dienst (z. B. Google reCAPTCHA) eingebunden, es werden dabei keine Cookies gesetzt und keine personenbezogenen Daten an Dritte übermittelt.</p>
    <p>Alternativ kannst du mich auch direkt per E-Mail unter <a href="mailto:${escapeAttr(settings.email)}">${escapeHtml(settings.email)}</a> kontaktieren; in diesem Fall gelten die Datenschutzhinweise deines E-Mail-Anbieters.</p>

    <h2>5. Anfrageformular Veranstaltungstechnik</h2>
    <p>Über das Anfrageformular im Bereich „Veranstaltungstechnik" auf der Startseite kannst du eine unverbindliche Anfrage stellen. Die von dir eingegebenen Daten (Name, E-Mail-Adresse, optional Telefonnummer, Datum und Art der Veranstaltung, optional das gewünschte Material sowie optionale weitere Anmerkungen) werden dabei an den Server dieser Website übermittelt und von dort per E-Mail an mein Postfach weitergeleitet. Es findet keine Speicherung deiner Anfrage in einer Datenbank statt – die Daten werden ausschließlich zur Bearbeitung deiner Anfrage genutzt und nicht an Dritte weitergegeben. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Anbahnung eines Vertrags) bzw. Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an der Beantwortung von Anfragen). Bei der Anfrage handelt es sich um eine unverbindliche Anfrage; ein Angebot oder eine Reservierung kommt erst durch meine gesonderte Rückmeldung zustande.</p>
    <p>Zum Schutz vor automatisiertem Missbrauch (Spam) enthält auch dieses Formular eine einfache Rechenaufgabe ("Captcha"), die ausschließlich serverseitig auf dieser Website erzeugt und geprüft wird – es wird kein Drittanbieter-Dienst eingebunden, es werden dabei keine Cookies gesetzt und keine personenbezogenen Daten an Dritte übermittelt.</p>

    <h2>6. Terminhinweise (Eventticker)</h2>
    <p>Am unteren Bildschirmrand werden die nächsten Veranstaltungen von Kreatief – Kultur im Unterland e.V. und den Voctails angezeigt. Die Termindaten werden serverseitig von www.kreatief-neckarsulm.de bzw. vom Dienst Konzertmeister abgerufen und zwischengespeichert; dein Browser nimmt dabei keinen direkten Kontakt zu diesen Anbietern auf und es werden keine Daten über dich übermittelt. Erst wenn du auf einen Termin klickst, wird die Seite des jeweiligen Anbieters in einem neuen Fenster geöffnet; dort gelten dessen Datenschutzhinweise.</p>

    <h2>7. Bereich „/choerle" – Dropbox-Anbindung</h2>
    <p>Im Bereich „/choerle" werden Dateien (z. B. Noten) angezeigt, die serverseitig über die API des Cloud-Speicherdienstes Dropbox (Dropbox Inc., USA bzw. Dropbox International Unlimited Company, Irland) abgerufen werden. Dabei werden ausschließlich Dateiinformationen aus einem dediziert für diese Website angelegten Dropbox-Ordner abgerufen – es werden keine personenbezogenen Daten von Besuchern der Website an Dropbox übermittelt. Der Abruf erfolgt serverseitig über einen Zugriffstoken; Besucher der Seite treten mit Dropbox nicht in direkten Kontakt.</p>

    <h2>8. Cookies und Tracking</h2>
    <p>Diese Website setzt keine Cookies und keine Analyse- oder Trackingdienste (z. B. Google Analytics) zu Marketing- oder Analysezwecken ein. Es findet kein Tracking des Nutzerverhaltens statt.</p>
    <p>Lediglich für den Hinweisbanner zu diesem Abschnitt wird eine kleine technische Information im lokalen Speicher deines Browsers (Local Storage, kein Cookie) abgelegt, damit dir der Hinweis nach dem Bestätigen nicht erneut angezeigt wird. Diese Information wird nicht an mich oder Dritte übertragen, enthält keine personenbezogenen Daten und ist rein technisch notwendig (Art. 6 Abs. 1 lit. f DSGVO bzw. § 25 Abs. 2 Nr. 2 TDDDG). Eine Einwilligung ist hierfür nach § 25 TDDDG nicht erforderlich, da keine nicht-notwendigen Cookies gesetzt werden.</p>
    <p>Solltest du künftig Funktionen mit nicht-technisch-notwendigen Cookies (z. B. Statistik- oder Einbettungsdienste) hinzufügen, wird vor deren Einsatz eine Einwilligung über den Cookie-Banner eingeholt.</p>

    <h2>9. Deine Rechte als betroffene Person</h2>
    <p>Dir stehen gegenüber mir folgende Rechte hinsichtlich der dich betreffenden personenbezogenen Daten zu:</p>
    <ul>
      <li>Recht auf Auskunft (Art. 15 DSGVO)</li>
      <li>Recht auf Berichtigung (Art. 16 DSGVO)</li>
      <li>Recht auf Löschung (Art. 17 DSGVO)</li>
      <li>Recht auf Einschränkung der Verarbeitung (Art. 18 DSGVO)</li>
      <li>Recht auf Datenübertragbarkeit (Art. 20 DSGVO)</li>
      <li>Widerspruchsrecht gegen die Verarbeitung (Art. 21 DSGVO)</li>
    </ul>
    <p>Du hast zudem das Recht, dich bei einer Datenschutz-Aufsichtsbehörde über die Verarbeitung deiner personenbezogenen Daten durch mich zu beschweren (Art. 77 DSGVO).</p>

    <h2>10. Aktualität und Änderung dieser Datenschutzerklärung</h2>
    <p>Diese Datenschutzerklärung ist aktuell gültig (Stand: September 2026). Durch die Weiterentwicklung der Website oder geänderte gesetzliche Vorgaben kann es notwendig werden, diese Erklärung anzupassen.</p>

    <a class="home-link" href="/">&larr; zurück zur Startseite</a>
  </div>

  ${LEGAL_FOOTER_BLOCK}
  ${COOKIE_BANNER_BLOCK}
</body>
</html>`;
}

function renderAdminPage(projects, settings, news, message) {
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
            <label>Infotext (kurz, im Banner)<textarea name="info">${escapeHtml(p.info || '')}</textarea></label>
            <label>Ausführliche Infos (Pop-up, optional)<textarea name="details">${escapeHtml(p.details || '')}</textarea></label>
            <label>Link<input type="text" name="link" value="${escapeAttr(p.link || '')}"></label>
            <label>Social-Media-Links (eine Zeile je Link: Label|URL)<textarea name="socials" placeholder="Instagram|https://instagram.com/...">${escapeHtml(socialsToText(p.socials))}</textarea></label>
            <label>Foto ersetzen<input type="file" name="photo" accept="image/*"><span class="hint">Ideal: Querformat (16:9) in voller Auflösung, gern 3840×2160 px (mind. 2560×1440), JPG oder PNG, bis 30 MB – wird automatisch für schnelle Ladezeiten optimiert</span></label>
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
  .hint { font-size: 0.72rem; color: #64748b; font-weight: normal; }
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
  .news-admin-list { list-style: none; margin-bottom: 0.5rem; }
  .news-admin-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.7rem 0;
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }
  .news-admin-item:last-child { border-bottom: none; }
  .news-admin-date { font-size: 0.72rem; color: #64748b; margin-bottom: 0.2rem; }
  .news-admin-title { font-size: 0.92rem; font-weight: 600; color: #f8fafc; margin-bottom: 0.15rem; }
  .news-admin-text { font-size: 0.88rem; color: #e2e8f0; }
  .news-admin-link { font-size: 0.78rem; color: #38bdf8; margin-top: 0.2rem; word-break: break-all; }
  .home-link { display: inline-block; margin-top: 2rem; color: #94a3b8; font-size: 0.9rem; text-decoration: none; }
  .home-link:hover { text-decoration: underline; }
  @media (max-width: 560px) {
    body { padding: 1.2rem 0.8rem 4rem; }
    .project-card, .new-project { padding: 1rem; }
    .thumb-preview { width: 90px; height: 60px; }
    .fields { min-width: 0; }
    .actions { flex-direction: column; align-items: stretch; gap: 0.6rem; }
    .news-admin-item { flex-direction: column; align-items: stretch; gap: 0.5rem; }
  }
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
          <label>Infotext (kurz, im Banner)<textarea name="info"></textarea></label>
          <label>Ausführliche Infos (Pop-up, optional)<textarea name="details"></textarea></label>
          <label>Link<input type="text" name="link" placeholder="https://..."></label>
          <label>Social-Media-Links (eine Zeile je Link: Label|URL)<textarea name="socials" placeholder="Instagram|https://instagram.com/..."></textarea></label>
          <label>Foto<input type="file" name="photo" accept="image/*"><span class="hint">Ideal: Querformat (16:9) in voller Auflösung, gern 3840×2160 px (mind. 2560×1440), JPG oder PNG, bis 30 MB – wird automatisch für schnelle Ladezeiten optimiert</span></label>
        </div>
        <div class="actions">
          <button type="submit">Projekt hinzufügen</button>
        </div>
      </form>
    </div>

    <div class="new-project">
      <h2>📇 Kontakt &amp; Rechtliches</h2>
      <p class="subtitle" style="margin-bottom:1rem;">Diese Angaben erscheinen automatisch im Impressum, in der Datenschutzerklärung und auf der Kontakt-Seite.</p>
      <form method="POST" action="/admin/settings">
        <div class="fields">
          <label>Name<input type="text" name="contactName" value="${escapeAttr(settings.contactName)}" required></label>
          <label>Straße &amp; Hausnummer<input type="text" name="street" value="${escapeAttr(settings.street)}" required></label>
          <label>PLZ<input type="text" name="zip" value="${escapeAttr(settings.zip)}" required></label>
          <label>Ort<input type="text" name="city" value="${escapeAttr(settings.city)}" required></label>
          <label>E-Mail<input type="email" name="email" value="${escapeAttr(settings.email)}" required></label>
          <label>Telefon (optional)<input type="text" name="phone" value="${escapeAttr(settings.phone || '')}"></label>
        </div>
        <div class="actions">
          <button type="submit">Speichern</button>
        </div>
      </form>
    </div>

    <div class="new-project">
      <h2>📰 News-Shoutbox</h2>
      <p class="subtitle" style="margin-bottom:1rem;">Diese kurzen Meldungen erscheinen rechts auf der Startseite (neueste zuerst).</p>
      ${
        news.length
          ? `<ul class="news-admin-list">${news
              .slice()
              .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
              .map(
                (n) => `<li class="news-admin-item">
                  <div>
                    <div class="news-admin-date">${escapeHtml(new Date(n.createdAt).toLocaleDateString('de-DE'))}</div>
                    ${n.title ? `<div class="news-admin-title">${escapeHtml(n.title)}</div>` : ''}
                    <div class="news-admin-text">${escapeHtml(n.text)}</div>
                    ${n.link ? `<div class="news-admin-link">🔗 ${escapeHtml(n.link)}</div>` : ''}
                  </div>
                  <form method="POST" action="/admin/news/${encodeURIComponent(n.id)}/delete" onsubmit="return confirm('Diese News-Meldung wirklich löschen?');">
                    <button type="submit" class="delete-btn">Löschen</button>
                  </form>
                </li>`
              )
              .join('')}</ul>`
          : '<p class="subtitle">Noch keine News-Meldungen vorhanden.</p>'
      }
      <form method="POST" action="/admin/news" style="margin-top:1rem;">
        <div class="fields">
          <label>Überschrift (optional)<input type="text" name="title" placeholder="Kurzer Titel"></label>
          <label>Text<textarea name="text" placeholder="Kurze aktuelle Meldung..." required></textarea></label>
          <label>Link (optional)<input type="text" name="link" placeholder="https://..."></label>
        </div>
        <div class="actions">
          <button type="submit">Meldung veröffentlichen</button>
        </div>
      </form>
    </div>

    <a class="home-link" href="/">&larr; zur Startseite</a>
  </div>
</body>
</html>`;
}

app.get('/admin', requireAdminAuth, (req, res) => {
  res.send(renderAdminPage(loadProjects(), loadSettings(), loadNews()));
});

app.post('/admin/news', requireAdminAuth, (req, res) => {
  const text = (req.body.text || '').trim();
  const title = (req.body.title || '').trim();
  const link = (req.body.link || '').trim();
  if (text) {
    const news = loadNews();
    news.push({
      id: crypto.randomUUID().slice(0, 8),
      title,
      text,
      link: link ? normalizeUrl(link) : '',
      createdAt: new Date().toISOString(),
    });
    saveNews(news);
  }
  res.redirect('/admin');
});

app.post('/admin/news/:id/delete', requireAdminAuth, (req, res) => {
  const news = loadNews().filter((n) => n.id !== req.params.id);
  saveNews(news);
  res.redirect('/admin');
});

app.post('/admin/settings', requireAdminAuth, (req, res) => {
  const settings = loadSettings();
  saveSettings({
    ...settings,
    contactName: req.body.contactName || settings.contactName,
    street: req.body.street || settings.street,
    zip: req.body.zip || settings.zip,
    city: req.body.city || settings.city,
    email: req.body.email || settings.email,
    phone: req.body.phone !== undefined ? req.body.phone : settings.phone,
  });
  res.redirect('/admin');
});

app.post('/admin/projects', requireAdminAuth, upload.single('photo'), async (req, res) => {
  const projects = loadProjects();
  const id = slugify(req.body.title) + '-' + crypto.randomUUID().slice(0, 6);
  const project = {
    id,
    title: req.body.title || 'Ohne Titel',
    eyebrow: req.body.eyebrow || 'Projekt',
    icon: req.body.icon || '🔹',
    info: req.body.info || '',
    details: req.body.details || '',
    link: normalizeUrl(req.body.link) || '#',
    image: req.file ? `/uploads/${req.file.filename}` : null,
    socials: parseSocials(req.body.socials),
  };
  if (req.file) await createImageVariantsSafe(req.file.filename);
  projects.push(project);
  saveProjects(projects);
  res.redirect('/admin');
});

app.post('/admin/projects/:id', requireAdminAuth, upload.single('photo'), async (req, res) => {
  const projects = loadProjects();
  const idx = projects.findIndex((p) => p.id === req.params.id);
  if (idx === -1) return res.status(404).send('Projekt nicht gefunden.');

  const existing = projects[idx];
  let image = existing.image;
  if (req.file) {
    await createImageVariantsSafe(req.file.filename);
    deleteUploadedImage(existing.image);
    image = `/uploads/${req.file.filename}`;
  }

  projects[idx] = {
    ...existing,
    title: req.body.title || existing.title,
    eyebrow: req.body.eyebrow || existing.eyebrow,
    icon: req.body.icon || existing.icon,
    info: req.body.info !== undefined ? req.body.info : existing.info,
    details: req.body.details !== undefined ? req.body.details : existing.details,
    link: req.body.link ? normalizeUrl(req.body.link) : existing.link,
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
    deleteUploadedImage(removed.image);
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

// Sortiert Übe-Tracks: SATB/SAB (Gesamtaufnahme) ganz oben, dann einzelne
// Stimmen in der Reihenfolge Sopran-Alt-Tenor-Bariton-Bass, unerkannte
// Tracks danach, Playback ganz unten.
function classifyChoerleTrack(name) {
  const n = name.toLowerCase();
  if (/\b(satb|sab)\b/.test(n)) return 0;
  if (/\bsopran/.test(n)) return 1;
  if (/\balt\b/.test(n)) return 2;
  if (/\btenor/.test(n)) return 3;
  if (/\bbariton/.test(n)) return 4;
  if (/\bbass\b/.test(n)) return 5;
  if (/\bplayback\b/.test(n)) return 7;
  return 6;
}

function sortChoerleTracks(files) {
  return [...files].sort((a, b) => {
    const ra = classifyChoerleTrack(a.name);
    const rb = classifyChoerleTrack(b.name);
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name, 'de');
  });
}

const CHOERLE_STYLE = `
  ${TOP_NAV_STYLE}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%);
    color: #f8fafc;
    min-height: 100vh;
    padding: 6.2rem 1rem 5rem;
  }
  .container { max-width: 720px; margin: 0 auto; }
  h1 { font-size: clamp(1.6rem, 5vw, 2.2rem); margin-bottom: 0.25rem; }
  p.subtitle { color: #cbd5e1; margin-bottom: 2rem; }
  ul { list-style: none; }
  li { margin-bottom: 0.75rem; }
  .song-grid {
    list-style: none;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 0.9rem;
  }
  .song-grid li { margin-bottom: 0; }
  .song-card {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 14px;
    padding: 1.1rem 1.2rem;
    color: #f8fafc;
    text-decoration: none;
    transition: background 0.15s ease, transform 0.15s ease, border-color 0.15s ease;
  }
  .song-card:hover {
    background: rgba(56,189,248,0.1);
    border-color: rgba(56,189,248,0.4);
    transform: translateY(-2px);
  }
  .song-card-icon {
    font-size: 1.4rem;
    flex-shrink: 0;
    width: 2.4rem;
    height: 2.4rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(56,189,248,0.12);
    border-radius: 10px;
  }
  .song-card-title { flex: 1; font-size: 1rem; font-weight: 600; }
  .song-card-arrow { color: #38bdf8; opacity: 0.7; transition: transform 0.15s ease; }
  .song-card:hover .song-card-arrow { transform: translateX(3px); }
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
  .pdf-button {
    display: inline-block;
    margin-bottom: 2rem;
  }
  .audio-list { display: flex; flex-direction: column; gap: 0.9rem; margin-bottom: 2rem; }
  .audio-item {
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 10px;
    padding: 0.8rem 1rem;
  }
  .audio-name { display: block; font-size: 0.85rem; color: #cbd5e1; margin-bottom: 0.5rem; }
  audio { width: 100%; }
  .speed-controls { display: flex; align-items: center; gap: 0.4rem; margin-top: 0.65rem; flex-wrap: wrap; }
  .speed-label { font-size: 0.78rem; color: #94a3b8; margin-right: 0.2rem; }
  .speed-btn {
    padding: 0.3rem 0.65rem;
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.15);
    background: rgba(255,255,255,0.05);
    color: #e2e8f0;
    font-size: 0.78rem;
    cursor: pointer;
  }
  .speed-btn:hover { background: rgba(255,255,255,0.12); }
  .speed-btn.active { background: #38bdf8; border-color: #38bdf8; color: #0f172a; font-weight: 600; }
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

  .newsletter-box {
    position: relative;
    display: none;
    max-width: 420px;
    margin: 3rem auto 1rem;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 12px;
    padding: 1rem 1.1rem;
  }
  .newsletter-text { font-size: 0.82rem; color: #f8fafc; margin-bottom: 0.3rem; }
  .newsletter-subtext { font-size: 0.74rem; color: #94a3b8; margin-bottom: 0.6rem; line-height: 1.4; }
  .newsletter-form { display: flex; gap: 0.4rem; }
  .newsletter-form input {
    flex: 1;
    min-width: 0;
    padding: 0.45rem 0.6rem;
    border-radius: 6px;
    border: 1px solid rgba(255,255,255,0.15);
    background: rgba(255,255,255,0.06);
    color: #f8fafc;
    font-size: 0.78rem;
    font-family: inherit;
  }
  .newsletter-form button {
    padding: 0.45rem 0.7rem;
    border-radius: 6px;
    border: none;
    background: #38bdf8;
    color: #0f172a;
    font-weight: 600;
    font-size: 0.78rem;
    cursor: pointer;
    white-space: nowrap;
  }
  .newsletter-form button:hover { background: #0ea5e9; }
  .newsletter-msg { font-size: 0.72rem; color: #94a3b8; margin-top: 0.4rem; min-height: 1em; }

  @media (max-width: 560px) {
    body { padding: 1.8rem 1rem 4rem; }
    h1 { font-size: 1.5rem; }
    .newsletter-form { flex-direction: column; align-items: stretch; }
    .newsletter-form button { align-self: stretch; }
  }
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
    <a href="/kontakt">Kontakt</a>
  </div>
  <script src="/ticker.js" defer></script>`;

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
  ${TOP_NAV_BLOCK}
  <div class="container">
    <h1>🎶 Frühstückschörle</h1>
    <p class="subtitle">Lied auswählen</p>
    <ul class="song-grid">${itemsHtml}</ul>
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
      ? `<a class="file-link pdf-button" href="${fileUrl(song.pdf.name)}" target="_blank" rel="noopener">📄 PDF ansehen</a>`
      : `<p class="empty">PDF derzeit nicht verfügbar.</p>`;

    const sortedAudio = sortChoerleTracks(song.audio);
    const audioSection = sortedAudio.length
      ? `<div class="audio-list">${sortedAudio
          .map(
            (a) => `<div class="audio-item">
              <span class="audio-name">${escapeHtml(a.name)}</span>
              <audio controls preload="none" src="${fileUrl(a.name)}"></audio>
              <div class="speed-controls">
                <span class="speed-label">Tempo:</span>
                <button type="button" class="speed-btn active" data-speed="1">1,0×</button>
                <button type="button" class="speed-btn" data-speed="0.9">0,9×</button>
                <button type="button" class="speed-btn" data-speed="0.8">0,8×</button>
                <button type="button" class="speed-btn" data-speed="0.7">0,7×</button>
              </div>
              <a class="download-link" href="${fileUrl(a.name)}?download=1">Herunterladen</a>
            </div>`
          )
          .join('')}</div>
         <script>
           (function () {
             document.addEventListener('click', function (e) {
               var btn = e.target.closest('.speed-btn');
               if (!btn) return;
               var item = btn.closest('.audio-item');
               if (!item) return;
               var audio = item.querySelector('audio');
               var rate = parseFloat(btn.dataset.speed);
               if (audio && !isNaN(rate)) {
                 audio.playbackRate = rate;
                 try { audio.preservesPitch = true; } catch (e) {}
                 try { audio.mozPreservesPitch = true; } catch (e) {}
                 try { audio.webkitPreservesPitch = true; } catch (e) {}
               }
               item.querySelectorAll('.speed-btn').forEach(function (b) {
                 b.classList.toggle('active', b === btn);
               });
             });
           })();
         </script>`
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
  ${TOP_NAV_BLOCK}
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
      .map(
        (f) => `<li><a class="song-card" href="/choerle/${f.slug}">
          <span class="song-card-icon">🎵</span>
          <span class="song-card-title">${escapeHtml(f.title)}</span>
          <span class="song-card-arrow">→</span>
        </a></li>`
      )
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

// Die Formulare (Anfrage Veranstaltungstechnik, Kontakt) liegen als Overlay auf der
// Startseite – die alten Unterseiten leiten dorthin weiter.
app.get('/vt', (req, res) => {
  res.redirect(302, '/?p=veranstaltungstechnik&form=anfrage');
});

app.get('/api/captcha', (req, res) => {
  const { question, token } = createCaptcha();
  res.json({ question, token });
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.post('/api/vt-anfrage', async (req, res) => {
  const {
    name,
    email,
    phone,
    eventDate,
    eventType,
    material,
    message,
    captchaAnswer,
    captchaToken,
    website, // Honeypot
  } = req.body || {};

  // Honeypot: Bots ausfüllen dieses versteckte Feld. Wir tun so, als wäre alles ok.
  if (website) {
    return res.json({ ok: true });
  }

  if (!name || !email || !eventDate || !eventType) {
    return res.status(400).json({ ok: false, error: 'Bitte fülle alle Pflichtfelder aus.' });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ ok: false, error: 'Bitte eine gültige E-Mail-Adresse eingeben.' });
  }
  if (!verifyCaptcha(captchaToken, captchaAnswer)) {
    return res.status(400).json({ ok: false, error: 'Die Rechenaufgabe wurde nicht richtig gelöst (oder ist abgelaufen). Bitte erneut versuchen.', captchaExpired: true });
  }

  const transporter = getMailTransporter();
  if (!transporter) {
    console.error('Materialanfrage: Mailversand ist nicht konfiguriert (SMTP_HOST/SMTP_USER/SMTP_PASS fehlen).');
    return res.status(503).json({ ok: false, error: 'Der Versand ist aktuell nicht konfiguriert. Bitte schreib mir direkt eine E-Mail.' });
  }

  const settings = loadSettings();
  const materialText = material && String(material).trim() ? material : '– (nicht angegeben)';

  try {
    await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: process.env.CONTACT_TO || settings.email,
      replyTo: email,
      subject: `Anfrage Veranstaltungstechnik über martinrenner.de von ${name}`,
      text: `Neue Anfrage Veranstaltungstechnik über martinrenner.de\n\n` +
        `Name: ${name}\n` +
        `E-Mail: ${email}\n` +
        `${phone ? `Telefon: ${phone}\n` : ''}` +
        `Veranstaltungsdatum: ${eventDate}\n` +
        `Veranstaltungsart: ${eventType}\n` +
        `\nGewünschtes Material:\n${materialText}\n` +
        `${message ? `\nWeitere Anmerkungen:\n${message}\n` : ''}`,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('Materialanfrage: Mailversand fehlgeschlagen:', err);
    res.status(502).json({ ok: false, error: `Beim Versand ist ein Fehler aufgetreten. Bitte schreib mir direkt an ${settings.email}.` });
  }
});

app.post('/api/kontakt', async (req, res) => {
  const { name, email, message, captchaAnswer, captchaToken, website } = req.body || {};

  // Honeypot: Ein verstecktes Feld, das nur Bots ausfüllen. Wird es befüllt,
  // tun wir so, als hätte alles geklappt, ohne wirklich etwas zu versenden.
  if (website) {
    return res.json({ ok: true });
  }

  if (!name || !email || !message || !String(message).trim()) {
    return res.status(400).json({ ok: false, error: 'Bitte fülle alle Felder aus.' });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ ok: false, error: 'Bitte eine gültige E-Mail-Adresse eingeben.' });
  }
  if (!verifyCaptcha(captchaToken, captchaAnswer)) {
    return res.status(400).json({ ok: false, error: 'Die Rechenaufgabe wurde nicht richtig gelöst (oder ist abgelaufen). Bitte erneut versuchen.', captchaExpired: true });
  }

  const settings = loadSettings();
  const transporter = getMailTransporter();
  if (!transporter) {
    console.error('Kontaktformular: Mailversand ist nicht konfiguriert (SMTP_HOST/SMTP_USER/SMTP_PASS fehlen).');
    return res.status(503).json({ ok: false, error: `Der Mailversand ist aktuell nicht konfiguriert. Bitte schreib mir direkt an ${settings.email}.` });
  }

  try {
    await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: process.env.CONTACT_TO || settings.email,
      replyTo: email,
      subject: `Kontaktanfrage von ${name} über martinrenner.de`,
      text: `Name: ${name}\nE-Mail: ${email}\n\nNachricht:\n${message}`,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('Kontaktformular: Mailversand fehlgeschlagen:', err);
    res.status(502).json({ ok: false, error: `Beim Versand ist ein Fehler aufgetreten. Bitte schreib mir direkt an ${settings.email}.` });
  }
});

// --- Eventticker (unten auf allen Seiten): nächste Termine von Kreatief + Voctails ---
const KREATIEF_API_URL = 'https://api.kreatief-neckarsulm.de/frontend/veranstaltung/list-items';
const KREATIEF_EVENT_URL = 'https://www.kreatief-neckarsulm.de/veranstaltungen/';
const KREATIEF_ORGANIZER_ID = 1; // nur Kreatief-eigene Termine, keine Fremdveranstalter
const KONZERTMEISTER_URL = process.env.KONZERTMEISTER_URL ||
  'https://rest.konzertmeister.app/api/v3/org/OALS_61f21604-97b8-4e79-bd31-f16cc0332b78/upcomingappointments?types=2&showDescription=false&onlyPublicsite=false&limit=30&display=light&lang=de&hash=454c4cfbeb43c2de3d4263cf0d5bbf14f0e6b5cf8879aae8ca970088140fa104';
// Konzertmeister verlinkt je Termin nur eine iCal-Datei – Klick führt daher zur Konzertseite der Voctails.
const VOCTAILS_EVENTS_URL = 'https://www.voctails.de/konzerte/';
const TICKER_CACHE_TTL_MS = 30 * 60 * 1000;
const TICKER_MAX_ITEMS = 10;
const tickerCache = { kreatief: null, voctails: null, fetchedAt: 0, pending: null };

async function fetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'martinrenner.de Eventticker' } });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    return res;
  } finally {
    clearTimeout(t);
  }
}

async function fetchKreatiefEvents() {
  const res = await fetchWithTimeout(KREATIEF_API_URL, 10000);
  const list = await res.json();
  if (!Array.isArray(list)) return [];
  return list
    .filter((e) => e && e.showEvent !== false && !e.cancelledReason && e.organizer === KREATIEF_ORGANIZER_ID && e.date)
    .map((e) => ({
      source: 'kreatief',
      title: String(e.name || '').trim(),
      start: e.date,
      location: e.locationTextname || '',
      url: KREATIEF_EVENT_URL + encodeURIComponent(e.id),
    }));
}

function decodeEntities(str) {
  return String(str)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&([aou])uml;/gi, (m, c) => ({ a: 'ä', o: 'ö', u: 'ü', A: 'Ä', O: 'Ö', U: 'Ü' }[c]))
    .replace(/&szlig;/g, 'ß')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(parseInt(n, 10)));
}

function kmText(html, cls) {
  const m = html.match(new RegExp(`class="(?:[^"]*\\s)?${cls}(?:\\s[^"]*)?"[^>]*>([\\s\\S]*?)</`, 'i'));
  return m ? decodeEntities(m[1].replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim() : '';
}

const KM_MONTHS = { jan: 0, feb: 1, mär: 2, mae: 2, mar: 2, apr: 3, mai: 4, jun: 5, jul: 6, aug: 7, sep: 8, okt: 9, nov: 10, dez: 11 };

// Wandelt eine Uhrzeit in Europe/Berlin in einen UTC-Zeitpunkt um (berücksichtigt Sommer-/Winterzeit).
function berlinToIso(year, month, day, hour, minute) {
  const guess = Date.UTC(year, month, day, hour, minute);
  const berlin = new Date(new Date(guess).toLocaleString('en-US', { timeZone: 'Europe/Berlin' }));
  const utc = new Date(new Date(guess).toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(guess - (berlin - utc)).toISOString();
}

// Konzertmeister liefert kein JSON, sondern ein HTML-Widget – daraus die Termine auslesen.
async function fetchVoctailsEvents() {
  const res = await fetchWithTimeout(KONZERTMEISTER_URL, 10000);
  const html = await res.text();
  const parts = html.split(/(?=<div[^>]*class="(?:[^"]*\s)?km-list-item(?:\s[^"]*)?")/i).slice(1);
  const now = new Date();
  const events = [];
  const seen = new Set();
  for (const part of parts) {
    const title = kmText(part, 'km-appointment-name');
    const day = parseInt(kmText(part, 'km-date'), 10);
    const monthKey = kmText(part, 'km-month').toLowerCase().replace('.', '').slice(0, 3);
    const month = KM_MONTHS[monthKey];
    if (!title || !Number.isFinite(day) || month === undefined) continue;
    if (/class="(?:[^"]*\s)?km-app-date\s(?:[^"]*\s)?cancelled[\s"]/i.test(part)) continue;
    const timeMatch = kmText(part, 'km-time').match(/(\d{1,2})[:.](\d{2})/);
    const yearMatch = kmText(part, 'km-year').match(/\d{4}/);
    let year = yearMatch ? parseInt(yearMatch[0], 10) : now.getFullYear();
    if (!yearMatch && new Date(year, month, day + 1) < now) year += 1;
    const start = berlinToIso(year, month, day, timeMatch ? +timeMatch[1] : 0, timeMatch ? +timeMatch[2] : 0);
    const url = VOCTAILS_EVENTS_URL;
    const key = title + start;
    if (seen.has(key)) continue;
    seen.add(key);
    events.push({ source: 'voctails', title, start, location: kmText(part, 'km-location'), url, allDay: !timeMatch });
  }
  return events;
}

async function refreshTicker() {
  const [kreatief, voctails] = await Promise.allSettled([fetchKreatiefEvents(), fetchVoctailsEvents()]);
  // Bei einem Fehler den letzten erfolgreichen Stand der jeweiligen Quelle weiterverwenden.
  if (kreatief.status === 'fulfilled') tickerCache.kreatief = kreatief.value;
  else console.error('Eventticker: Kreatief-Abruf fehlgeschlagen:', kreatief.reason && kreatief.reason.message);
  if (voctails.status === 'fulfilled') tickerCache.voctails = voctails.value;
  else console.error('Eventticker: Konzertmeister-Abruf fehlgeschlagen:', voctails.reason && voctails.reason.message);
  tickerCache.fetchedAt = Date.now();
}

async function getTickerEvents() {
  if (Date.now() - tickerCache.fetchedAt > TICKER_CACHE_TTL_MS) {
    if (!tickerCache.pending) {
      tickerCache.pending = refreshTicker().finally(() => {
        tickerCache.pending = null;
      });
    }
    await tickerCache.pending;
  }
  const cutoff = Date.now() - 2 * 60 * 60 * 1000; // laufende Veranstaltungen noch kurz anzeigen
  return [...(tickerCache.kreatief || []), ...(tickerCache.voctails || [])]
    .filter((e) => new Date(e.start).getTime() >= cutoff)
    .sort((a, b) => new Date(a.start) - new Date(b.start))
    .slice(0, TICKER_MAX_ITEMS);
}

app.get('/api/events-ticker', async (req, res) => {
  try {
    const items = await getTickerEvents();
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ items });
  } catch (err) {
    console.error('Eventticker:', err);
    res.json({ items: [] });
  }
});

app.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
  ensureAllImageVariants();
});
