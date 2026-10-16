// Gmail-Signatur: Bild mit den nächsten Kreatief-Terminen, wird bei jedem Abruf aktuell erzeugt.
// Gmail und andere Mailprogramme laden das Bild beim Öffnen der Mail neu, deshalb kein Caching.
const path = require('path');
const opentype = require('opentype.js');
const sharp = require('sharp');

const BOLD = opentype.loadSync(path.join(__dirname, 'fonts', 'GuerrerBold.ttf'));
const LIGHT = opentype.loadSync(path.join(__dirname, 'fonts', 'GuerrerLight.ttf'));

const LILA = '#4b2581';
const PINK = '#e64889';
const GRAU = '#5b5566';
const LAV = '#f3eff8';

// Alles in doppelter Größe zeichnen (scharf auf Retina), in der Signatur halb so groß anzeigen.
const W = 960;
const ROWS = 3;
const TOP = 78;
const ROW_H = 44;
const DATE_W = 130;
const H = TOP + ROWS * ROW_H - 8;
const RENDER_TTL_MS = 10 * 60 * 1000;

const MONATE = ['JAN', 'FEB', 'MÄR', 'APR', 'MAI', 'JUN', 'JUL', 'AUG', 'SEP', 'OKT', 'NOV', 'DEZ'];

function berlinParts(iso) {
  const p = {};
  for (const { type, value } of new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin', weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(iso))) p[type] = value;
  return { wd: p.weekday.replace('.', ''), day: +p.day, month: +p.month - 1, time: `${p.hour}:${p.minute}` };
}

const TITLE_SIZE = 24;
const TITLE_MAX_W = W - DATE_W - 10;

// Zu lange Titel auf den Kern kürzen („Weihnachten dahoim! – Zwei Musicalstars …“ → „Weihnachten dahoim!“).
function shortTitle(t) {
  const s = String(t).replace(/\s+/g, ' ').trim();
  if (LIGHT.getAdvanceWidth(s, TITLE_SIZE) <= TITLE_MAX_W) return s;
  const cut = s.split(/\s[–-]\s/)[0];
  return cut.length >= 4 ? cut : s;
}

// Aufeinanderfolgende Termine mit gleichem Titel zusammenfassen (z. B. zwei Aufführungstage).
function groupEvents(events) {
  const out = [];
  for (const e of events) {
    const title = shortTitle(e.title);
    const last = out[out.length - 1];
    if (last && last.title === title) last.dates.push(e.start);
    else out.push({ title, location: e.location || '', dates: [e.start] });
  }
  return out;
}

function fit(font, text, size, maxW) {
  if (font.getAdvanceWidth(text, size) <= maxW) return text;
  let s = text;
  while (s.length > 1 && font.getAdvanceWidth(s + '…', size) > maxW) s = s.slice(0, -1);
  return s.trimEnd() + '…';
}

function textPath(font, text, x, y, size, fill, { maxW = Infinity, spacing = 0, anchor = 'start' } = {}) {
  const str = fit(font, text, size, maxW);
  let width = font.getAdvanceWidth(str, size) + spacing * Math.max(0, str.length - 1);
  let cx = anchor === 'middle' ? x - width / 2 : x;
  if (!spacing) return `<path fill="${fill}" d="${font.getPath(str, cx, y, size).toPathData(1)}"/>`;
  let d = '';
  for (const ch of str) {
    d += font.getPath(ch, cx, y, size).toPathData(1);
    cx += font.getAdvanceWidth(ch, size) + spacing;
  }
  return `<path fill="${fill}" d="${d}"/>`;
}

// Dezent: weißer Grund, eine Zeile je Termin (Datum in Pink, Titel in Lila, Ort in Grau), alles klein.
function buildSvg(groups) {
  const parts = [
    `<rect width="${W}" height="${H}" fill="#ffffff"/>`,
    `<rect y="0" width="${W}" height="2" fill="${LAV}"/>`,
    textPath(BOLD, 'NÄCHSTE TERMINE', 0, 50, 17, '#8a8494', { spacing: 3 }),
  ];
  const linkLabel = 'kreatief-neckarsulm.de';
  parts.push(textPath(LIGHT, linkLabel, W - LIGHT.getAdvanceWidth(linkLabel, 19) - 2, 50, 19, '#8a8494'));
  groups.slice(0, ROWS).forEach((g, i) => {
    const y = TOP + i * ROW_H + 26;
    const all = g.dates.map(berlinParts);
    const first = all[0];
    const sameMonth = all.every((d) => d.month === first.month);
    const date = all.length > 1 && sameMonth
      ? `${all.map((d) => d.day).join('./')}.${first.month + 1}.`
      : `${first.wd} ${first.day}.${first.month + 1}.`;
    parts.push(textPath(BOLD, date, 0, y, 21, PINK, { maxW: DATE_W - 16 }));
    const title = fit(LIGHT, g.title, TITLE_SIZE, TITLE_MAX_W);
    parts.push(textPath(LIGHT, title, DATE_W, y, TITLE_SIZE, LILA));
    const tw = LIGHT.getAdvanceWidth(title, TITLE_SIZE);
    const rest = TITLE_MAX_W - tw;
    if (g.location && rest > 120) {
      parts.push(textPath(LIGHT, ` · ${g.location}`, DATE_W + tw, y, 21, '#8a8494', { maxW: rest }));
    }
  });
  if (!groups.length) {
    parts.push(textPath(LIGHT, 'Neue Termine folgen in Kürze.', 0, TOP + 26, 24, GRAU));
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`;
}

module.exports = function signatur(app, { getTickerEvents }) {
  const cache = { png: null, at: 0 };

  async function render() {
    if (cache.png && Date.now() - cache.at < RENDER_TTL_MS) return cache.png;
    const events = (await getTickerEvents())
      .filter((e) => e.source === 'kreatief' && new Date(e.start).getTime() > Date.now());
    const png = await sharp(Buffer.from(buildSvg(groupEvents(events)))).png({ compressionLevel: 9, palette: true }).toBuffer();
    cache.png = png;
    cache.at = Date.now();
    return png;
  }

  app.get('/signatur/termine.png', async (req, res) => {
    try {
      const png = await render();
      res.set({
        'Content-Type': 'image/png',
        'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
        Pragma: 'no-cache',
        Expires: '0',
      });
      res.send(png);
    } catch (err) {
      console.error('Signatur-Termine:', err);
      res.status(500).end();
    }
  });
};

module.exports.buildSvg = buildSvg;
module.exports.groupEvents = groupEvents;
module.exports.SIZE = { W, H };
