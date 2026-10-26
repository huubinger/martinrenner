'use strict';
// Tool-Übersicht unter /tools: Links auf alle eigenen Tools, hinter einem Passwort (TOOLS_PASSWORD, nur als Railway-Variable).
// Neue Tools hier in TOOLS eintragen – die Seite baut sich daraus auf.
// img = Icon public/tool-icons/<img>.webp (Kling-Icons, Quelle ~/Dropbox/Claude/Projekte/Werkzeuge/Tool-Icons).
const crypto = require('crypto');

const COOKIE = 'tools_auth';

const TOOLS = [
  { group: 'Musical & Kreatief', items: [
    { name: 'Skript-Tool', img: 'skript', url: '/skript', info: 'Musical-Skripte schreiben und formatieren' },
    { name: 'Bühnen-Tool', img: 'buehne', url: '/buehne', info: 'Bühnenbilder, Szenen-Umbauten, 3D' },
    { name: 'Programmheft-Tool', img: 'programmheft', url: '/programmheft', info: 'Programmhefte, Druck-PDF für WIRmachenDRUCK' },
    { name: 'Bewertungstool', img: 'bewertung', url: '/bewertung/', info: 'Entwürfe per Swipe bewerten, Feedback an Claude' },
    { name: 'Probenvideo', img: 'probenvideo', url: '/probenvideo', info: 'Probenvideos kommentieren und bemalen' },
    { name: 'Playback-Tool', img: 'playback', url: 'https://playback.martinrenner.de', info: 'Playbacks verwalten und abspielen' },
    { name: 'Musicals', img: 'musicals', url: '/musicals', info: 'Kreatief-Musicals, Shows, Darstellersuche' },
    { name: 'LOKAL-Tool', img: 'lokal', url: '/lokal', info: 'Förderung LOK.26.0468' },
    { name: 'Frühstücks-Chörle', img: 'choerle', url: '/choerle', info: 'Übe-Tracks und Noten' },
    { name: 'Voctails intern', img: 'voctails', url: '/voctails/intern/', info: 'Übe-Player und Termine' },
    { name: 'MPA-Control', img: 'mpa', url: '/mpa/', info: 'Box steuern (MPA200BT, im Browser Bluefy)' },
  ] },
  { group: 'Büro', items: [
    { name: 'Lucy', img: 'lucy', url: '/buero/', info: 'Büro-Assistentin – Chat + Sprache' },
    { name: 'Office-Tool', img: 'office', url: 'https://office.martinrenner.de', info: 'Aufgaben und Vorgänge' },
    { name: 'Office-Diktat', img: 'diktat', url: 'https://office.martinrenner.de/diktat', info: 'Aufgaben per Sprache' },
    { name: 'JPMR-Tool', img: 'jpmr', url: 'https://jpmr-tool-production.up.railway.app', info: 'JPMR-Verwaltung' },
    { name: 'Kulturkalender', img: 'kulturkalender', url: 'https://www.neckarsulmer-kulturkalender.de', info: 'Neckarsulmer Kulturkalender' },
    { name: 'Homepage-Admin', img: 'admin', url: '/admin', info: 'Inhalte von martinrenner.de' },
  ] },
  { group: 'Zuhause', items: [
    { name: 'Tagebuch', img: 'tagebuch', url: '/tagebuch', info: 'Diktiertes Tagebuch' },
    { name: 'Heizkurve', img: 'heizkurve', url: '/heizung', info: 'Wärmepumpe' },
    { name: 'Balkonkraftwerk', img: 'balkonkraftwerk', url: '/balkonkraftwerk', info: 'Leistung und Ertrag' },
    { name: 'Kameras', img: 'kameras', url: '/kameras', info: 'Überwachung an/aus' },
  ] },
  { group: 'Lokal am Mac', items: [
    { name: 'Skript-Tool lokal', img: 'skript-lokal', url: 'http://localhost:3210', info: 'Befehl skript' },
    { name: 'Büroassistent', img: 'buero', url: 'http://localhost:3220', info: 'Cockpit (MacBook Air)' },
  ] },
];

module.exports = function setupToolsPage(app, { readCookie, escapeHtml }) {
  const PASSWORD = String(process.env.TOOLS_PASSWORD || '').trim();
  const AUTH = crypto.createHash('sha256').update(`tools-v1:${PASSWORD}:${process.env.CHOERLE_SECRET || ''}`).digest('hex');
  const failed = new Map();

  function hasAccess(req) {
    const value = readCookie(req, COOKIE);
    if (!PASSWORD || !value || value.length !== AUTH.length) return false;
    return crypto.timingSafeEqual(Buffer.from(value), Buffer.from(AUTH));
  }

  app.post('/tools/login', (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!PASSWORD) return res.status(503).send(loginPage('Die Tool-Übersicht ist nicht eingerichtet.'));
    const ip = req.headers['cf-connecting-ip'] || req.ip;
    const now = Date.now();
    const tries = (failed.get(ip) || []).filter((x) => now - x < 10 * 60e3);
    if (tries.length >= 10) return res.status(429).send(loginPage('Zu viele Versuche. Bitte später erneut probieren.'));
    if (String((req.body || {}).password || '').trim() !== PASSWORD) {
      tries.push(now); failed.set(ip, tries);
      return res.status(401).send(loginPage('Das Passwort stimmt leider nicht.'));
    }
    failed.delete(ip);
    res.cookie(COOKIE, AUTH, {
      maxAge: 365 * 864e5, httpOnly: true, sameSite: 'lax', path: '/tools',
      secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
    });
    res.redirect(303, '/tools');
  });

  app.get(['/tools', '/tools/'], (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!hasAccess(req)) return res.status(401).send(loginPage(''));
    res.send(page(escapeHtml));
  });
};

const STYLE = `
:root{--bg:#f5f6f8;--card:#fff;--text:#1b1f27;--muted:#667085;--line:#e2e5ea;--accent:#0b84c6;--hover:#eef6fb}
@media (prefers-color-scheme:dark){:root{--bg:#0f172a;--card:#172036;--text:#f1f5f9;--muted:#94a3b8;--line:#26314a;--accent:#38bdf8;--hover:#1d2944}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
main{max-width:920px;margin:0 auto;padding:28px 16px 48px}h1{font-size:1.6rem;margin:0 0 4px}.sub{color:var(--muted);margin:0 0 24px}
h2{font-size:.8rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:28px 0 10px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px}
.tool{display:flex;gap:12px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;color:inherit;text-decoration:none;transition:background .15s,border-color .15s}
.tool:hover{background:var(--hover);border-color:var(--accent)}.ico{width:44px;height:44px;flex:0 0 auto;border-radius:10px}
.name{font-weight:600}.info{color:var(--muted);font-size:.85rem}
.login{max-width:340px;margin:18vh auto 0;display:flex;flex-direction:column;gap:10px;text-align:center}
.login input,.login button{font:inherit;padding:12px 14px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--text)}
.login button{background:var(--accent);border:0;color:#fff;font-weight:600}.err{color:#d14343}`;

const HEAD = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Tools</title><style>${STYLE}</style></head><body><main>`;

function loginPage(err) {
  return `${HEAD}<form class="login" method="post" action="/tools/login"><h1>🧰 Tools</h1>
<input type="password" name="password" placeholder="Passwort" aria-label="Passwort" autocomplete="current-password" autofocus required>
<button type="submit">Öffnen</button>${err ? `<p class="err">${err}</p>` : ''}</form></main></body></html>`;
}

function page(esc) {
  const groups = TOOLS.map((g) => `<h2>${esc(g.group)}</h2><div class="grid">${g.items.map((t) => {
    const external = /^https?:/.test(t.url) ? ' target="_blank" rel="noopener"' : '';
    return `<a class="tool" href="${esc(t.url)}"${external}><img class="ico" src="/tool-icons/${esc(t.img)}.webp" alt="">`
      + `<span><span class="name">${esc(t.name)}</span><br><span class="info">${esc(t.info)}</span></span></a>`;
  }).join('')}</div>`).join('');
  return `${HEAD}<h1>🧰 Tools</h1><p class="sub">Alle Werkzeuge auf einen Blick</p>${groups}</main></body></html>`;
}
