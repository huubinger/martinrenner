'use strict';
// Balkonkraftwerk (Deye-Mikrowechselrichter, Logger 4171864973) unter /balkonkraftwerk.
// Die Homepage erreicht das Heimnetz nicht – ein Gerät zu Hause (MacBook-Dienst oder iPhone-Kurzbefehl)
// liest den Wechselrichter aus und schickt die Werte an POST /balkonkraftwerk/api/ingest (Header X-Token = BKW_TOKEN).
// Gespeichert wird in DATA_DIR/balkonkraftwerk.json: Messpunkte der letzten 60 Tage + Tageserträge dauerhaft.
// Tageserträge kommen aus dem Gesamtzähler, weil der Tageszähler des Wechselrichters ohne Uhrzeit nicht zurückgesetzt wird.
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const SAMPLE_DAYS = 60;
const COOKIE = 'bkw_auth';
const TZ = 'Europe/Berlin';

module.exports = function setupBalkonkraftwerk(app, { DATA_DIR, readCookie }) {
  const FILE = path.join(DATA_DIR, 'balkonkraftwerk.json');
  const PASSWORD = String(process.env.BKW_PASSWORD || 'Berlin26');
  const INGEST_TOKEN = String(process.env.BKW_TOKEN || '');
  const AUTH = crypto.createHash('sha256').update(`bkw-v1:${PASSWORD}:${INGEST_TOKEN}`).digest('hex');
  const failed = new Map();

  let db = { samples: [], days: {} };
  try { db = { samples: [], days: {}, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch { /* erste Nutzung */ }
  function save() {
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, FILE);
  }

  const dayKey = (ms) => new Date(ms).toLocaleDateString('sv-SE', { timeZone: TZ }); // JJJJ-MM-TT
  const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

  // Tagesertrag = Zählerstand am Tagesende minus letzter Stand vor dem Tag (bzw. erster Stand des Tages)
  function addToDays(s) {
    if (s.total === null) return;
    const k = dayKey(s.t);
    const d = db.days[k] || (db.days[k] = { start: null, end: null });
    if (d.start === null) {
      const before = Object.keys(db.days).filter((x) => x < k).sort().pop();
      d.start = before && db.days[before].end !== null ? db.days[before].end : s.total;
    }
    d.end = Math.max(d.end ?? s.total, s.total);
  }

  function hasAccess(req) {
    const v = readCookie(req, COOKIE);
    return !!v && v.length === AUTH.length && crypto.timingSafeEqual(Buffer.from(v), Buffer.from(AUTH));
  }

  app.post('/balkonkraftwerk/api/ingest', (req, res) => {
    const tok = String(req.get('x-token') || '');
    if (!INGEST_TOKEN || tok.length !== INGEST_TOKEN.length || !crypto.timingSafeEqual(Buffer.from(tok), Buffer.from(INGEST_TOKEN))) {
      return res.status(403).json({ error: 'forbidden' });
    }
    const b = req.body || {};
    const t = num(b.t) && Math.abs(num(b.t) - Date.now()) < 3600e3 ? num(b.t) : Date.now();
    const s = {
      t, p: num(b.power), today: num(b.today), total: num(b.total),
      pv: Array.isArray(b.pv) ? b.pv.slice(0, 4).map((x) => ({ v: num(x.v), i: num(x.i) })) : [],
      grid_v: num(b.grid_v), freq: num(b.freq), temp: num(b.temp), src: String(b.source || '').slice(0, 20),
    };
    if (s.p === null && s.total === null) return res.status(400).json({ error: 'keine Werte' });
    db.samples.push(s);
    db.samples.sort((a, c) => a.t - c.t);
    const cut = Date.now() - SAMPLE_DAYS * 864e5;
    db.samples = db.samples.filter((x) => x.t >= cut);
    addToDays(s);
    save();
    res.json({ ok: true });
  });

  app.post('/balkonkraftwerk/login', (req, res) => {
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
      maxAge: 365 * 864e5, httpOnly: true, sameSite: 'lax', path: '/balkonkraftwerk',
      secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
    });
    res.redirect(303, '/balkonkraftwerk');
  });

  app.get('/balkonkraftwerk/api/data', (req, res) => {
    if (!hasAccess(req)) return res.status(401).json({ error: 'login' });
    const today = dayKey(Date.now());
    const days = Object.entries(db.days).sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([day, d]) => ({ day, kwh: d.end !== null && d.start !== null ? Math.round((d.end - d.start) * 10) / 10 : null }));
    const since = Date.now() - 48 * 3600e3;
    res.set('Cache-Control', 'no-store').json({
      latest: db.samples[db.samples.length - 1] || null,
      today: (days.find((d) => d.day === today) || {}).kwh ?? null,
      days: days.slice(-60),
      curve: db.samples.filter((x) => x.t >= since).map((x) => [x.t, x.p]),
    });
  });

  app.get(['/balkonkraftwerk', '/balkonkraftwerk/'], (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!hasAccess(req)) return res.status(401).send(loginPage(''));
    res.send(PAGE);
  });
};

const STYLE = `
:root{--bg:#f6f7f4;--card:#fff;--text:#1d2420;--muted:#66706a;--line:#e3e6e0;--sun:#e8a317;--sun2:#f5d27a;--ok:#2f8f5b}
@media (prefers-color-scheme:dark){:root{--bg:#121512;--card:#1b201c;--text:#eef1ec;--muted:#9aa49d;--line:#2c332e;--sun:#f2b833;--sun2:#6b5420;--ok:#5cc28a}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
main{max-width:880px;margin:0 auto;padding:24px 16px 48px}h1{font-size:1.5rem;margin:0 0 4px}.sub{color:var(--muted);margin:0 0 20px;font-size:.95rem}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px}
.k{color:var(--muted);font-size:.85rem}.v{font-size:1.9rem;font-weight:650;font-variant-numeric:tabular-nums}.v small{font-size:1rem;font-weight:500;color:var(--muted)}
.big .v{color:var(--sun)}h2{font-size:1.05rem;margin:0 0 10px}svg{display:block;width:100%;height:auto}
.small{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px 16px;font-size:.92rem}.small b{font-variant-numeric:tabular-nums}
.stale{color:#c0392b}.note{color:var(--muted);font-size:.85rem;margin-top:18px}
.login{max-width:340px;margin:18vh auto 0;display:flex;flex-direction:column;gap:10px;text-align:center}
.login input,.login button{font:inherit;padding:12px 14px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--text)}
.login button{background:var(--sun);border:0;color:#1d1d1d;font-weight:600}.err{color:#c0392b}`;

function loginPage(err) {
  return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Balkonkraftwerk</title><style>${STYLE}</style></head><body><main>
<form class="login" method="post" action="/balkonkraftwerk/login"><h1>☀️ Balkonkraftwerk</h1>
<input type="password" name="password" placeholder="Passwort" autocomplete="current-password" autofocus required>
<button type="submit">Anzeigen</button>${err ? `<p class="err">${err}</p>` : ''}</form></main></body></html>`;
}

const PAGE = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Balkonkraftwerk</title><style>${STYLE}</style></head><body><main>
<h1>☀️ Balkonkraftwerk</h1><p class="sub" id="stand">Lade …</p>
<div class="grid">
  <div class="card big"><div class="k">Leistung</div><div class="v" id="p">–</div></div>
  <div class="card"><div class="k">Ertrag heute</div><div class="v" id="today">–</div></div>
  <div class="card"><div class="k">Gesamtertrag</div><div class="v" id="total">–</div></div>
</div>
<div class="card" style="margin-bottom:16px"><h2>Leistung – letzte 48 Stunden</h2><div id="curve"></div></div>
<div class="card" style="margin-bottom:16px"><h2>Tageserträge</h2><div id="days"></div></div>
<div class="card"><h2>Details</h2><div class="small" id="det"></div></div>
<p class="note">Die Werte kommen, solange ein Gerät zu Hause im WLAN ist (MacBook bzw. iPhone). Lücken in der Kurve = niemand zu Hause; die Tageserträge werden aus dem Gesamtzähler trotzdem vollständig nachgetragen.</p>
</main><script>
const f1 = (x, d = 1) => x === null || x === undefined ? '–' : x.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function ago(t) { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'gerade eben' : m < 60 ? 'vor ' + m + ' min' : m < 1440 ? 'vor ' + Math.round(m / 60) + ' h' : 'vor ' + Math.round(m / 1440) + ' Tagen'; }
function curveSvg(pts) {
  const W = 840, H = 220, L = 40, B = 22, now = Date.now(), t0 = now - 48 * 3600e3;
  const max = Math.max(600, ...pts.map((p) => p[1] || 0));
  const x = (t) => L + (t - t0) / (now - t0) * (W - L - 6), y = (v) => H - B - v / max * (H - B - 8);
  let path = '', area = '', prev = null;
  for (const [t, v] of pts) { if (v === null) continue;
    const gap = !prev || t - prev > 30 * 60e3; path += (gap ? 'M' : 'L') + x(t).toFixed(1) + ',' + y(v).toFixed(1); prev = t; }
  let g = '';
  for (let w = 0; w <= max; w += 200) g += '<line x1="' + L + '" x2="' + W + '" y1="' + y(w) + '" y2="' + y(w) + '" stroke="' + css('--line') + '"/><text x="' + (L - 6) + '" y="' + (y(w) + 4) + '" text-anchor="end" font-size="11" fill="' + css('--muted') + '">' + w + ' W</text>';
  for (let h = 0; h <= 48; h += 6) { const t = t0 + h * 3600e3, d = new Date(t);
    g += '<text x="' + x(t) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="11" fill="' + css('--muted') + '">' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + '</text>'; }
  return '<svg viewBox="0 0 ' + W + ' ' + H + '">' + g + '<path d="' + path + '" fill="none" stroke="' + css('--sun') + '" stroke-width="2.2" stroke-linejoin="round"/></svg>' + (pts.length ? '' : '<p class="note">Noch keine Messpunkte.</p>');
}
function daysSvg(days) {
  days = days.slice(-30); if (!days.length) return '<p class="note">Noch keine Tageswerte.</p>';
  const W = 840, H = 200, L = 40, B = 22, max = Math.max(1, ...days.map((d) => d.kwh || 0)), bw = (W - L) / days.length;
  let g = '';
  days.forEach((d, i) => { const h = (d.kwh || 0) / max * (H - B - 16), xx = L + i * bw;
    g += '<rect x="' + (xx + 2) + '" y="' + (H - B - h) + '" width="' + Math.max(2, bw - 4) + '" height="' + h + '" rx="3" fill="' + css('--sun') + '"><title>' + d.day + ': ' + f1(d.kwh) + ' kWh</title></rect>';
    if (days.length <= 10 || i % 3 === days.length % 3 - 1 || i === days.length - 1) g += '<text x="' + (xx + bw / 2) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="11" fill="' + css('--muted') + '">' + d.day.slice(8) + '.' + d.day.slice(5, 7) + '.</text>';
    if (bw > 26 && d.kwh) g += '<text x="' + (xx + bw / 2) + '" y="' + (H - B - h - 4) + '" text-anchor="middle" font-size="10" fill="' + css('--muted') + '">' + f1(d.kwh) + '</text>'; });
  return '<svg viewBox="0 0 ' + W + ' ' + H + '">' + g + '</svg>';
}
async function load() {
  const r = await fetch('/balkonkraftwerk/api/data', { cache: 'no-store' });
  if (r.status === 401) return location.reload();
  const d = await r.json(), s = d.latest;
  if (!s) { document.getElementById('stand').textContent = 'Noch keine Daten empfangen.'; return; }
  const old = Date.now() - s.t > 20 * 60e3;
  document.getElementById('stand').innerHTML = 'Stand: ' + new Date(s.t).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) + ' (<span class="' + (old ? 'stale' : '') + '">' + ago(s.t) + '</span>)';
  document.getElementById('p').innerHTML = old ? '– <small>(veraltet: ' + f1(s.p, 0) + ' W)</small>' : f1(s.p, 0) + ' <small>W</small>';
  document.getElementById('today').innerHTML = f1(d.today) + ' <small>kWh</small>';
  document.getElementById('total').innerHTML = f1(s.total) + ' <small>kWh</small>';
  document.getElementById('curve').innerHTML = curveSvg(d.curve);
  document.getElementById('days').innerHTML = daysSvg(d.days);
  const det = [];
  (s.pv || []).forEach((m, i) => det.push(['Modul ' + (i + 1), f1(m.v) + ' V · ' + f1(m.i) + ' A · ' + f1(m.v * m.i, 0) + ' W']));
  det.push(['Netzspannung', f1(s.grid_v) + ' V'], ['Netzfrequenz', f1(s.freq, 2) + ' Hz'], ['Temperatur', f1(s.temp) + ' °C'], ['Quelle', s.src || '–']);
  document.getElementById('det').innerHTML = det.map(([k, v]) => '<div><div class="k">' + k + '</div><b>' + v + '</b></div>').join('');
}
load(); setInterval(load, 60000);
</script></body></html>`;
