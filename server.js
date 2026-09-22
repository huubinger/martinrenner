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
const HIDDEN_EVENTS_FILE = path.join(DATA_DIR, 'hidden-events.json');
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

// Einmalige Übernahme (Sept. 2026): Telefonnummer fürs Impressum als zweiter schneller
// Kontaktweg nach § 5 DDG. Danach nur noch im Admin änderbar.
(function migratePhone() {
  const settings = loadSettings();
  if (settings.phoneInitialized) return;
  if (!settings.phone) settings.phone = '0178-5483836';
  settings.phoneInitialized = true;
  saveSettings(settings);
})();

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

// Automatischer Bildausschnitt fürs Handy: sharp sucht per "attention"-Strategie den
// interessantesten Bereich (Gesichter/Hauttöne, Kontrast, Sättigung) für einen
// Hochkant-Zuschnitt. Ergebnis ist ein CSS-object-position-Wert ("x% y%").
async function computeAutoFocus(filename) {
  const W = 390;
  const H = 844;
  const { info } = await sharp(path.join(UPLOADS_DIR, filename))
    .rotate()
    .resize({ width: W, height: H, fit: 'cover', position: sharp.strategy.attention })
    .toBuffer({ resolveWithObject: true });
  const meta = await sharp(path.join(UPLOADS_DIR, filename)).metadata();
  const rotated = meta.orientation && meta.orientation >= 5;
  const ow = rotated ? meta.height : meta.width;
  const oh = rotated ? meta.width : meta.height;
  // cropOffsetLeft/Top (negativ) beziehen sich auf das skalierte Bild vor dem Zuschnitt;
  // umgerechnet in object-position-Prozent, damit der Browser denselben Ausschnitt zeigt.
  const scale = Math.max(W / ow, H / oh);
  const sw = Math.round(ow * scale);
  const sh = Math.round(oh * scale);
  const x = sw > W ? Math.round((-info.cropOffsetLeft / (sw - W)) * 100) : 50;
  const yRaw = sh > H ? Math.round((-info.cropOffsetTop / (sh - H)) * 100) : Math.round((info.attentionY / sh) * 100);
  const y = Math.min(85, Math.max(15, Number.isFinite(yRaw) ? yRaw : 50));
  return `${Math.min(100, Math.max(0, x))}% ${y}%`;
}

async function computeAutoFocusSafe(filename) {
  try {
    return await computeAutoFocus(filename);
  } catch (err) {
    console.error(`Bildfokus für ${filename} fehlgeschlagen:`, err.message);
    return null;
  }
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
  const projects = loadProjects();
  let changed = false;
  for (const p of projects) {
    // Bis Sept. 2026 wurde "50% 50%" als Standard gespeichert – das gilt jetzt als "automatisch".
    if (p.focus === '50% 50%') {
      p.focus = null;
      changed = true;
    }
    if (!p.image || !p.image.startsWith('/uploads/')) continue;
    const filename = path.basename(p.image);
    await createImageVariantsSafe(filename);
    if (!p.autoFocus) {
      p.autoFocus = await computeAutoFocusSafe(filename);
      changed = true;
    }
  }
  if (changed) {
    // Frisch laden, damit zwischenzeitliche Admin-Änderungen nicht überschrieben werden.
    const latest = loadProjects().map((p) => {
      const updated = projects.find((u) => u.id === p.id);
      return updated ? { ...p, focus: p.focus === '50% 50%' ? null : p.focus, autoFocus: p.autoFocus || updated.autoFocus } : p;
    });
    saveProjects(latest);
  }
}

// Bildfokus als "x% y%" (für CSS object-position), sonst null.
function parseFocus(value) {
  const m = String(value || '').trim().match(/^(\d{1,3})% (\d{1,3})%$/);
  if (!m || +m[1] > 100 || +m[2] > 100) return null;
  return `${+m[1]}% ${+m[2]}%`;
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
      // Double-Opt-in: Mailchimp schickt zuerst eine Bestätigungsmail, eingetragen wird erst nach dem Klick.
      status_if_new: 'pending',
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
    <p>Diese Website wird bei Railway (Railway Corporation, 548 Market St, PMB 68956, San Francisco, CA 94104, USA) gehostet. Zusätzlich wird der Netzwerkverkehr über den Dienst Cloudflare (Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107, USA) geleitet, der als Content-Delivery-Network (CDN) und Sicherheits-/DNS-Dienst vorgeschaltet ist. Beim Aufruf der Website erheben Cloudflare und der Hosting-Provider automatisch technische Verbindungsdaten, u. a.:</p>
    <ul>
      <li>IP-Adresse des anfragenden Geräts</li>
      <li>Datum und Uhrzeit des Zugriffs</li>
      <li>aufgerufene Seite / Datei</li>
      <li>Browsertyp und -version, verwendetes Betriebssystem</li>
      <li>Referrer-URL (zuvor besuchte Seite)</li>
    </ul>
    <p>Diese Daten werden ausschließlich zum technischen Betrieb, zur Absicherung der Website (Fehleranalyse, IT-Sicherheit, Schutz vor Missbrauch/DDoS) verarbeitet und nicht zu Marketingzwecken genutzt oder mit anderen Datenquellen zusammengeführt. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an einem sicheren und stabilen Betrieb der Website). Die Daten werden nach Zweckfortfall gelöscht bzw. anonymisiert.</p>
    <p>Railway und Cloudflare sind als Auftragsverarbeiter tätig (Art. 28 DSGVO). Da beide ihren Sitz in den USA haben, findet eine Datenübermittlung in ein Drittland statt. Diese stützt sich auf den Angemessenheitsbeschluss der EU-Kommission zum EU-US Data Privacy Framework (Art. 45 DSGVO), soweit der Anbieter danach zertifiziert ist, und ergänzend auf EU-Standardvertragsklauseln (Art. 46 Abs. 2 lit. c DSGVO).</p>

    <h2>4. Kontaktaufnahme über das Kontaktformular</h2>
    <p>Über das <a href="/kontakt">Kontaktformular</a> auf der Startseite kannst du mir eine Nachricht senden. Die von dir eingegebenen Daten (Name, E-Mail-Adresse, Nachricht) werden dabei an den Server dieser Website übermittelt und von dort per E-Mail an mein Postfach weitergeleitet. Auf dem Webserver selbst wird deine Nachricht nicht gespeichert. Die Daten werden ausschließlich zur Bearbeitung deiner Anfrage genutzt und nicht an Dritte weitergegeben. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an der Beantwortung von Anfragen) bzw. Art. 6 Abs. 1 lit. b DSGVO, sofern die Anfrage der Anbahnung eines Vertrags dient.</p>
    <p>Die Angabe der Daten ist freiwillig; ohne Name, E-Mail-Adresse und Nachricht kann ich deine Anfrage jedoch nicht bearbeiten.</p>
    <p>Zum Schutz vor automatisiertem Missbrauch (Spam) enthält das Formular eine einfache Rechenaufgabe ("Captcha"). Diese wird ausschließlich serverseitig auf dieser Website erzeugt und geprüft – es wird kein Drittanbieter-Dienst (z. B. Google reCAPTCHA) eingebunden, es werden dabei keine Cookies gesetzt und keine personenbezogenen Daten an Dritte übermittelt.</p>
    <p>Alternativ kannst du mich auch direkt per E-Mail unter <a href="mailto:${escapeAttr(settings.email)}">${escapeHtml(settings.email)}</a> kontaktieren.</p>

    <h2>5. Anfrageformular Veranstaltungstechnik</h2>
    <p>Über das Anfrageformular im Bereich „Veranstaltungstechnik" auf der Startseite kannst du eine unverbindliche Anfrage stellen. Die von dir eingegebenen Daten (Name, E-Mail-Adresse, optional Telefonnummer, Datum und Art der Veranstaltung, optional das gewünschte Material sowie optionale weitere Anmerkungen) werden dabei an den Server dieser Website übermittelt und von dort per E-Mail an mein Postfach weitergeleitet. Auf dem Webserver selbst wird deine Anfrage nicht gespeichert. Die Daten werden ausschließlich zur Bearbeitung deiner Anfrage genutzt und nicht an Dritte weitergegeben. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Anbahnung eines Vertrags) bzw. Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an der Beantwortung von Anfragen). Bei der Anfrage handelt es sich um eine unverbindliche Anfrage; ein Angebot oder eine Reservierung kommt erst durch meine gesonderte Rückmeldung zustande.</p>
    <p>Die Angabe der Pflichtfelder ist freiwillig; ohne sie kann ich jedoch kein Angebot erstellen. Zum Schutz vor Spam enthält auch dieses Formular die oben beschriebene, selbst gehostete Rechenaufgabe.</p>

    <h2>6. E-Mail-Versand und Speicherdauer von Anfragen</h2>
    <p>Die Nachrichten aus Kontakt- und Anfrageformular sowie E-Mails, die du mir direkt schickst, werden über den E-Mail-Dienst Gmail der Google Ireland Limited (Gordon House, Barrow Street, Dublin 4, Irland) versendet und in meinem Postfach gespeichert. Google ist dabei als Auftragsverarbeiter tätig; eine Übermittlung in die USA an die Google LLC ist nicht auszuschließen und stützt sich auf das EU-US Data Privacy Framework (Art. 45 DSGVO) sowie EU-Standardvertragsklauseln.</p>
    <p>Ich lösche deine Anfrage, sobald sie abschließend bearbeitet ist und keine weitere Kommunikation zu erwarten ist, spätestens nach zwei Jahren. Kommt es zu einem Auftrag, bewahre ich die dafür relevante Korrespondenz entsprechend den gesetzlichen Aufbewahrungspflichten (§ 147 AO, § 257 HGB: 6 bzw. 10 Jahre) auf.</p>

    <h2>7. Newsletter</h2>
    <p>Du kannst dich auf der Startseite für meinen Newsletter anmelden, um Neuigkeiten zu meinen Projekten per E-Mail zu erhalten. Dafür benötige ich lediglich deine E-Mail-Adresse. Rechtsgrundlage ist deine Einwilligung (Art. 6 Abs. 1 lit. a DSGVO).</p>
    <p><strong>Double-Opt-in:</strong> Nach der Anmeldung erhältst du eine E-Mail mit einem Bestätigungslink. Erst wenn du diesen anklickst, wirst du in den Verteiler aufgenommen. So wird sichergestellt, dass sich niemand mit fremden E-Mail-Adressen anmelden kann. Zum Nachweis der Einwilligung werden Anmelde- und Bestätigungszeitpunkt sowie die dabei verwendete IP-Adresse protokolliert.</p>
    <p><strong>Versanddienstleister:</strong> Der Newsletter wird über Mailchimp versendet, einen Dienst der Intuit Inc. bzw. The Rocket Science Group LLC (405 N Angier Ave NE, Atlanta, GA 30308, USA). Deine E-Mail-Adresse und die Protokolldaten werden dazu auf Servern von Mailchimp in den USA gespeichert. Mailchimp ist als Auftragsverarbeiter tätig; die Datenübermittlung stützt sich auf das EU-US Data Privacy Framework (Art. 45 DSGVO) sowie EU-Standardvertragsklauseln. Mailchimp kann auswerten, ob ein Newsletter geöffnet und welche Links angeklickt wurden; diese Auswertung dient nur dazu, den Newsletter zu verbessern.</p>
    <p><strong>Widerruf:</strong> Du kannst deine Einwilligung jederzeit mit Wirkung für die Zukunft widerrufen – über den Abmeldelink in jedem Newsletter oder per E-Mail an <a href="mailto:${escapeAttr(settings.email)}">${escapeHtml(settings.email)}</a>. Deine E-Mail-Adresse wird dann aus dem Verteiler gelöscht; die Rechtmäßigkeit der bis dahin erfolgten Verarbeitung bleibt unberührt (Art. 7 Abs. 3 DSGVO).</p>

    <h2>8. Terminhinweise (Eventticker)</h2>
    <p>Am unteren Bildschirmrand werden die nächsten Veranstaltungen von Kreatief – Kultur im Unterland e.V. und den Voctails angezeigt. Die Termindaten werden serverseitig von www.kreatief-neckarsulm.de bzw. vom Dienst Konzertmeister abgerufen und zwischengespeichert; dein Browser nimmt dabei keinen direkten Kontakt zu diesen Anbietern auf und es werden keine Daten über dich übermittelt. Erst wenn du auf einen Termin klickst, wird die Seite des jeweiligen Anbieters in einem neuen Tab geöffnet; dort gelten dessen Datenschutzhinweise.</p>

    <h2>9. Bereich „/choerle" (Übe-Tracks & Noten) – Passwort und Dropbox-Anbindung</h2>
    <p>Im Bereich „/choerle" werden Dateien (z. B. Noten) angezeigt, die serverseitig über die API des Cloud-Speicherdienstes Dropbox (Dropbox Inc., USA bzw. Dropbox International Unlimited Company, Irland) abgerufen werden. Dabei werden ausschließlich Dateiinformationen aus einem dediziert für diese Website angelegten Dropbox-Ordner abgerufen – es werden keine personenbezogenen Daten von Besuchern der Website an Dropbox übermittelt. Der Abruf erfolgt serverseitig über einen Zugriffstoken; Besucher der Seite treten mit Dropbox nicht in direkten Kontakt.</p>
    <p>Die Übe-Tracks und Noten sind nur für Mitsingende gedacht und durch ein gemeinsames Passwort geschützt. Nach der richtigen Eingabe wird in deinem Browser ein technisch notwendiges Cookie („choerle_auth") gespeichert, damit du das Passwort nicht bei jedem Besuch erneut eingeben musst. Es enthält keine personenbezogenen Daten, dient ausschließlich der Zugangsfreigabe und wird nach 180 Tagen automatisch gelöscht. Rechtsgrundlage ist § 25 Abs. 2 Nr. 2 TDDDG i. V. m. Art. 6 Abs. 1 lit. f DSGVO; eine Einwilligung ist hierfür nicht erforderlich. Zum Schutz vor dem Durchprobieren von Passwörtern wird die IP-Adresse bei Fehleingaben für höchstens 10 Minuten im Arbeitsspeicher des Servers vorgehalten und danach verworfen.</p>

    <h2>10. Cookies, lokaler Speicher und Tracking</h2>
    <p>Diese Website setzt keine Cookies zu Marketing- oder Analysezwecken und keine Analyse- oder Trackingdienste (z. B. Google Analytics) ein. Es werden keine externen Schriftarten, Skripte oder Inhalte von Drittanbietern (z. B. Google Fonts, YouTube, Instagram) eingebunden. Es findet kein Tracking des Nutzerverhaltens statt. Einzige Ausnahme ist das technisch notwendige Zugangs-Cookie für den passwortgeschützten Chörle-Bereich (siehe Abschnitt 9), das nur nach Eingabe des Passworts gesetzt wird.</p>
    <p>Für den Hinweisbanner zu diesem Abschnitt wird eine kleine technische Information im lokalen Speicher deines Browsers (Local Storage, kein Cookie) abgelegt, damit dir der Hinweis nach dem Bestätigen nicht erneut angezeigt wird. Diese Information wird nicht an mich oder Dritte übertragen, enthält keine personenbezogenen Daten und ist rein technisch notwendig (§ 25 Abs. 2 Nr. 2 TDDDG); eine Einwilligung ist hierfür nicht erforderlich.</p>
    <p>Links zu anderen Websites (z. B. Instagram oder Projektseiten) sind einfache Verweise: Erst wenn du darauf klickst, wird die fremde Seite in einem neuen Tab geöffnet, und es gelten deren Datenschutzhinweise.</p>

    <h2>11. Deine Rechte als betroffene Person</h2>
    <p>Dir stehen gegenüber mir folgende Rechte hinsichtlich der dich betreffenden personenbezogenen Daten zu:</p>
    <ul>
      <li>Recht auf Auskunft (Art. 15 DSGVO)</li>
      <li>Recht auf Berichtigung (Art. 16 DSGVO)</li>
      <li>Recht auf Löschung (Art. 17 DSGVO)</li>
      <li>Recht auf Einschränkung der Verarbeitung (Art. 18 DSGVO)</li>
      <li>Recht auf Datenübertragbarkeit (Art. 20 DSGVO)</li>
      <li>Recht auf Widerruf einer erteilten Einwilligung mit Wirkung für die Zukunft (Art. 7 Abs. 3 DSGVO)</li>
    </ul>
    <p><strong>Widerspruchsrecht (Art. 21 DSGVO):</strong> Soweit ich Daten auf Grundlage eines berechtigten Interesses (Art. 6 Abs. 1 lit. f DSGVO) verarbeite, kannst du dieser Verarbeitung aus Gründen, die sich aus deiner besonderen Situation ergeben, jederzeit widersprechen. Eine formlose Nachricht an <a href="mailto:${escapeAttr(settings.email)}">${escapeHtml(settings.email)}</a> genügt.</p>
    <p>Du hast zudem das Recht, dich bei einer Datenschutz-Aufsichtsbehörde über die Verarbeitung deiner personenbezogenen Daten durch mich zu beschweren (Art. 77 DSGVO). Für mich zuständig ist der Landesbeauftragte für den Datenschutz und die Informationsfreiheit Baden-Württemberg, Lautenschlagerstraße 20, 70173 Stuttgart, <a href="https://www.baden-wuerttemberg.datenschutz.de">www.baden-wuerttemberg.datenschutz.de</a>.</p>
    <p>Eine automatisierte Entscheidungsfindung einschließlich Profiling (Art. 22 DSGVO) findet nicht statt.</p>

    <h2>12. Aktualität und Änderung dieser Datenschutzerklärung</h2>
    <p>Diese Datenschutzerklärung ist aktuell gültig (Stand: September 2026). Durch die Weiterentwicklung der Website oder geänderte gesetzliche Vorgaben kann es notwendig werden, diese Erklärung anzupassen.</p>

    <a class="home-link" href="/">&larr; zurück zur Startseite</a>
  </div>

  ${LEGAL_FOOTER_BLOCK}
  ${COOKIE_BANNER_BLOCK}
</body>
</html>`;
}

function renderAdminPage(projects, settings, news, events, message) {
  const rows = projects
    .map(
      (p) => `
    <div class="project-card">
      <form method="POST" action="/admin/projects/${encodeURIComponent(p.id)}" enctype="multipart/form-data">
        <div class="row">
          ${p.image
            ? (() => {
                const effective = (p.focus || p.autoFocus || '50% 50%').split(' ');
                return `<div class="focus-picker" data-auto="${escapeAttr(p.autoFocus || '50% 50%')}" title="Tippe auf den wichtigsten Punkt im Foto">
                <img class="thumb-preview" src="${escapeAttr(p.image)}" alt="">
                <span class="focus-dot${p.focus ? ' manual' : ''}" style="left:${escapeAttr(effective[0])};top:${escapeAttr(effective[1])}"></span>
                <input type="hidden" name="focus" value="${escapeAttr(p.focus || '')}">
                <span class="focus-hint">Bildausschnitt fürs Handy: <strong class="focus-mode">${p.focus ? 'von Hand gesetzt' : 'automatisch'}</strong>. Zum Ändern auf das Wichtigste im Foto tippen.
                  <button type="button" class="focus-reset"${p.focus ? '' : ' hidden'}>Automatisch verwenden</button></span>
              </div>`;
              })()
            : '<div class="thumb-preview thumb-empty">kein Foto</div>'}
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
  .focus-picker { position: relative; width: 240px; flex-shrink: 0; align-self: flex-start; cursor: crosshair; }
  .focus-picker .thumb-preview { width: 240px; height: 135px; display: block; }
  .focus-dot {
    position: absolute;
    width: 18px;
    height: 18px;
    margin: -9px 0 0 -9px;
    border-radius: 50%;
    border: 2px solid #fff;
    background: rgba(56,189,248,0.7);
    box-shadow: 0 0 0 2px rgba(0,0,0,0.4);
    pointer-events: none;
  }
  .focus-hint { display: block; margin-top: 0.35rem; font-size: 0.7rem; color: #64748b; line-height: 1.35; }
  .focus-dot.manual { background: rgba(250,204,21,0.8); }
  .focus-reset { margin-top: 0.3rem; padding: 0.2rem 0.6rem; font-size: 0.7rem; border-radius: 999px; border: 1px solid rgba(255,255,255,0.2); background: transparent; color: #cbd5e1; cursor: pointer; }
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
  .evt-admin-item.is-hidden > div { opacity: 0.45; }
  .evt-admin-item.is-hidden .news-admin-title { text-decoration: line-through; }
  .evt-admin-source { font-size: 0.72rem; color: #94a3b8; }
  .evt-hide-btn { width: 2.2rem; height: 2.2rem; padding: 0; font-size: 1.2rem; line-height: 1; }
  .evt-show-btn { background: rgba(56,189,248,0.15); color: #38bdf8; border: 1px solid rgba(56,189,248,0.4); white-space: nowrap; }
  .evt-show-btn:hover { background: rgba(56,189,248,0.3); }
  .home-link { display: inline-block; margin-top: 2rem; color: #94a3b8; font-size: 0.9rem; text-decoration: none; }
  .home-link:hover { text-decoration: underline; }
  @media (max-width: 560px) {
    body { padding: 1.2rem 0.8rem 4rem; }
    .project-card, .new-project { padding: 1rem; }
    .thumb-preview { width: 90px; height: 60px; }
    .focus-picker, .focus-picker .thumb-preview { width: 100%; height: auto; aspect-ratio: 16 / 9; }
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

    <div class="new-project" id="events">
      <h2>📅 Eventticker</h2>
      <p class="subtitle" style="margin-bottom:1rem;">Mit ✕ blendest du einen Termin im Ticker und in der Terminübersicht aus, mit „Einblenden“ holst du ihn zurück.</p>
      ${
        events === null
          ? '<p class="subtitle">Termine konnten gerade nicht geladen werden.</p>'
          : events.length
          ? `<ul class="news-admin-list">${events
              .map(
                (e) => `<li class="news-admin-item evt-admin-item${e.hidden ? ' is-hidden' : ''}">
                  <div>
                    <div class="news-admin-date">${escapeHtml(formatEventDate(e))} · <span class="evt-admin-source">${escapeHtml(e.source === 'voctails' ? 'Voctails' : 'Kreatief')}</span>${e.hidden ? ' · ausgeblendet' : ''}</div>
                    <div class="news-admin-title">${escapeHtml(e.title)}</div>
                    ${e.location ? `<div class="news-admin-text">${escapeHtml(e.location)}</div>` : ''}
                  </div>
                  <form method="POST" action="/admin/events/${e.hidden ? 'show' : 'hide'}">
                    <input type="hidden" name="key" value="${escapeAttr(eventKey(e))}">
                    ${
                      e.hidden
                        ? '<button type="submit" class="evt-show-btn">Einblenden</button>'
                        : '<button type="submit" class="delete-btn evt-hide-btn" title="Ausblenden" aria-label="Ausblenden">✕</button>'
                    }
                  </form>
                </li>`
              )
              .join('')}</ul>`
          : '<p class="subtitle">Keine kommenden Termine.</p>'
      }
    </div>

    <a class="home-link" href="/">&larr; zur Startseite</a>
  </div>
  <script>
    // Bildfokus: Klick ins Vorschaubild setzt den Punkt, der beim Zuschneiden (Handy) sichtbar bleibt;
    // ohne Klick gilt der vom Server automatisch ermittelte Ausschnitt.
    document.querySelectorAll('.focus-picker').forEach(function (picker) {
      var img = picker.querySelector('img');
      img.addEventListener('click', function (e) {
        var rect = img.getBoundingClientRect();
        var x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
        var y = Math.round(((e.clientY - rect.top) / rect.height) * 100);
        x = Math.min(100, Math.max(0, x));
        y = Math.min(100, Math.max(0, y));
        picker.querySelector('input[name="focus"]').value = x + '% ' + y + '%';
        var dot = picker.querySelector('.focus-dot');
        dot.style.left = x + '%';
        dot.style.top = y + '%';
        dot.classList.add('manual');
        picker.querySelector('.focus-mode').textContent = 'von Hand gesetzt (noch speichern)';
        picker.querySelector('.focus-reset').hidden = false;
      });
      picker.querySelector('.focus-reset').addEventListener('click', function () {
        var auto = picker.dataset.auto.split(' ');
        picker.querySelector('input[name="focus"]').value = '';
        var dot = picker.querySelector('.focus-dot');
        dot.style.left = auto[0];
        dot.style.top = auto[1];
        dot.classList.remove('manual');
        picker.querySelector('.focus-mode').textContent = 'automatisch (noch speichern)';
        this.hidden = true;
      });
    });
  </script>
</body>
</html>`;
}

app.get('/admin', requireAdminAuth, async (req, res) => {
  let events = null;
  try {
    const hidden = new Set(loadHiddenEvents());
    events = (await getAllTickerEvents()).map((e) => ({ ...e, hidden: hidden.has(eventKey(e)) }));
  } catch (err) {
    console.error('Admin: Termine konnten nicht geladen werden:', err);
  }
  res.send(renderAdminPage(loadProjects(), loadSettings(), loadNews(), events));
});

app.post('/admin/events/hide', requireAdminAuth, (req, res) => {
  const key = String(req.body.key || '');
  const hidden = loadHiddenEvents();
  if (key && !hidden.includes(key)) {
    hidden.push(key);
    saveHiddenEvents(hidden);
  }
  res.redirect('/admin#events');
});

app.post('/admin/events/show', requireAdminAuth, (req, res) => {
  const key = String(req.body.key || '');
  saveHiddenEvents(loadHiddenEvents().filter((k) => k !== key));
  res.redirect('/admin#events');
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
  if (req.file) {
    await createImageVariantsSafe(req.file.filename);
    project.autoFocus = await computeAutoFocusSafe(req.file.filename);
  }
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
  let autoFocus = existing.autoFocus || null;
  if (req.file) {
    await createImageVariantsSafe(req.file.filename);
    autoFocus = await computeAutoFocusSafe(req.file.filename);
    deleteUploadedImage(existing.image);
    image = `/uploads/${req.file.filename}`;
  }
  // Bildfokus: leer = automatisch; neues Foto setzt immer auf automatisch zurück.
  let focus = existing.focus || null;
  if (req.file || req.body.focus === '') focus = null;
  else if (parseFocus(req.body.focus)) focus = parseFocus(req.body.focus);

  projects[idx] = {
    ...existing,
    title: req.body.title || existing.title,
    eyebrow: req.body.eyebrow || existing.eyebrow,
    icon: req.body.icon || existing.icon,
    info: req.body.info !== undefined ? req.body.info : existing.info,
    details: req.body.details !== undefined ? req.body.details : existing.details,
    link: req.body.link ? normalizeUrl(req.body.link) : existing.link,
    image,
    focus,
    autoFocus,
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
  <script src="/links.js" defer></script>
  <script src="/ticker.js" defer></script>`;

// --- Frühstücks-Chörle: Passwortschutz für Übe-Tracks & Noten ---
// Ein gemeinsames Passwort für alle Mitsingenden. Groß-/Kleinschreibung egal,
// "ö" darf auch als "oe" geschrieben werden (chörle = Chörle = choerle).
const CHOERLE_COOKIE = 'choerle_auth';
const CHOERLE_COOKIE_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;

function normalizeChoerlePassword(pw) {
  return String(pw || '')
    .trim()
    .toLowerCase()
    .normalize('NFC')
    .replace(/ö/g, 'oe')
    .replace(/ä/g, 'ae')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
}

const CHOERLE_PASSWORD = normalizeChoerlePassword(process.env.CHOERLE_PASSWORD || 'choerle');
// Das Cookie hängt am Passwort: wird es geändert, müssen alle das neue eingeben.
const CHOERLE_TOKEN = crypto
  .createHash('sha256')
  .update(`choerle-v1:${CHOERLE_PASSWORD}:${process.env.CHOERLE_SECRET || ''}`)
  .digest('hex');

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

function hasChoerleAccess(req) {
  const value = readCookie(req, CHOERLE_COOKIE);
  if (!value || value.length !== CHOERLE_TOKEN.length) return false;
  return crypto.timingSafeEqual(Buffer.from(value), Buffer.from(CHOERLE_TOKEN));
}

function requireChoerleAccess(req, res, next) {
  if (hasChoerleAccess(req)) return next();
  res.status(401).json({ ok: false, needsPassword: true });
}

// Schutz gegen Durchprobieren: max. 10 Fehlversuche pro IP in 10 Minuten.
const choerleFailedLogins = new Map();
const CHOERLE_LOGIN_WINDOW_MS = 10 * 60 * 1000;

app.post('/api/choerle/login', (req, res) => {
  // Hinter Cloudflare/Railway ist req.ip nur die Proxy-Adresse.
  const ip = req.headers['cf-connecting-ip'] || req.ip;
  const now = Date.now();
  const attempts = (choerleFailedLogins.get(ip) || []).filter((t) => now - t < CHOERLE_LOGIN_WINDOW_MS);
  if (attempts.length >= 10) {
    return res.status(429).json({ ok: false, error: 'Zu viele Versuche. Bitte in ein paar Minuten erneut probieren.' });
  }
  if (normalizeChoerlePassword((req.body || {}).password) !== CHOERLE_PASSWORD) {
    attempts.push(now);
    choerleFailedLogins.set(ip, attempts);
    return res.status(401).json({ ok: false, error: 'Das Passwort stimmt leider nicht.' });
  }
  choerleFailedLogins.delete(ip);
  res.cookie(CHOERLE_COOKIE, CHOERLE_TOKEN, {
    maxAge: CHOERLE_COOKIE_MAX_AGE_MS,
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
    path: '/',
  });
  res.json({ ok: true });
});

app.get('/api/choerle/songs', requireChoerleAccess, async (req, res) => {
  try {
    const folders = await listChoerleSongFolders();
    res.json({ ok: true, songs: folders.map((f) => ({ slug: f.slug, title: f.title })) });
  } catch (err) {
    console.error(err);
    res.status(502).json({ ok: false, error: 'Die Lieder konnten gerade nicht geladen werden. Bitte später erneut versuchen.' });
  }
});

app.get('/api/choerle/songs/:slug', requireChoerleAccess, async (req, res) => {
  try {
    const folders = await listChoerleSongFolders();
    const folder = folders.find((f) => f.slug === req.params.slug);
    if (!folder) return res.status(404).json({ ok: false, error: 'Dieses Lied wurde nicht gefunden.' });
    const { pdf, audio } = await getSongFiles(folder.path_lower);
    const fileUrl = (name) => `/choerle/${folder.slug}/file/${encodeURIComponent(name)}`;
    res.json({
      ok: true,
      song: {
        slug: folder.slug,
        title: folder.title,
        pdf: pdf ? { name: pdf.name, url: fileUrl(pdf.name) } : null,
        audio: sortChoerleTracks(audio).map((a) => ({ name: a.name, url: fileUrl(a.name) })),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(502).json({ ok: false, error: 'Das Lied konnte gerade nicht geladen werden. Bitte später erneut versuchen.' });
  }
});

// /choerle und /choerle/<lied> bleiben als Direktlinks erhalten: Sie liefern die
// Startseite aus, die dort automatisch die Übe-Tracks über dem Chörle-Foto öffnet.
function sendHomePage(req, res) {
  res.set('X-Robots-Tag', 'noindex');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
}
app.get('/choerle', sendHomePage);
app.get('/choerle/:slug', sendHomePage);

// Proxy: liefert PDF/MP3-Inhalte direkt von Dropbox aus, mit korrektem
// Content-Type und "inline" (Ansehen/Abspielen) oder "attachment" (?download=1)
// als Content-Disposition. Unterstützt HTTP-Range-Requests fürs Vor-/Zurückspulen
// bei Audiodateien.
app.get('/choerle/:slug/file/:filename', async (req, res) => {
  if (!hasChoerleAccess(req)) return res.status(401).send('Bitte zuerst unter /choerle das Passwort eingeben.');
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
// Alle kommenden Termine für die aufklappbare Übersicht; der Ticker selbst zeigt nur die ersten 10.
const TICKER_MAX_ITEMS = 100;
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

// Im Admin ausgeblendete Termine (Schlüssel aus Quelle, Beginn und Titel).
function eventKey(e) {
  return `${e.source}|${e.start}|${e.title}`;
}

function loadHiddenEvents() {
  try {
    const list = JSON.parse(fs.readFileSync(HIDDEN_EVENTS_FILE, 'utf8'));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveHiddenEvents(list) {
  // Vergangene Termine aufräumen, damit die Liste nicht endlos wächst.
  const cutoff = Date.now() - 2 * 24 * 60 * 60 * 1000;
  const keep = list.filter((k) => {
    const t = new Date(String(k).split('|')[1]).getTime();
    return !Number.isFinite(t) || t >= cutoff;
  });
  fs.writeFileSync(HIDDEN_EVENTS_FILE, JSON.stringify(keep, null, 2));
}

function formatEventDate(e) {
  const opts = { timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' };
  if (!e.allDay) Object.assign(opts, { hour: '2-digit', minute: '2-digit' });
  return new Date(e.start).toLocaleString('de-DE', opts);
}

async function getAllTickerEvents() {
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

async function getTickerEvents() {
  const hidden = new Set(loadHiddenEvents());
  return (await getAllTickerEvents()).filter((e) => !hidden.has(eventKey(e)));
}

app.get('/api/events-ticker', async (req, res) => {
  try {
    const items = await getTickerEvents();
    res.set('Cache-Control', 'public, max-age=60');
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
