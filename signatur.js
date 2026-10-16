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
const TOP = 74;
const ROW_H = 104;
const H = TOP + ROWS * ROW_H + 58;
const RENDER_TTL_MS = 10 * 60 * 1000;

const MONATE = ['JAN', 'FEB', 'MÄR', 'APR', 'MAI', 'JUN', 'JUL', 'AUG', 'SEP', 'OKT', 'NOV', 'DEZ'];

function berlinParts(iso) {
  const p = {};
  for (const { type, value } of new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin', weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(iso))) p[type] = value;
  return { wd: p.weekday.replace('.', ''), day: +p.day, month: +p.month - 1, time: `${p.hour}:${p.minute}` };
}

const TITLE_SIZE = 34;
const TITLE_MAX_W = W - 146 - 30;

// Zu lange Titel auf den Kern kürzen („Weihnachten dahoim! – Zwei Musicalstars …“ → „Weihnachten dahoim!“).
function shortTitle(t) {
  const s = String(t).replace(/\s+/g, ' ').trim();
  if (BOLD.getAdvanceWidth(s, TITLE_SIZE) <= TITLE_MAX_W) return s;
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

function buildSvg(groups) {
  const parts = [
    `<rect width="${W}" height="${H}" rx="14" fill="${LAV}"/>`,
    `<rect width="10" height="${H}" fill="${PINK}"/>`,
    textPath(BOLD, 'NÄCHSTE TERMINE', 40, 50, 24, PINK, { spacing: 3 }),
  ];
  groups.slice(0, ROWS).forEach((g, i) => {
    const y = TOP + i * ROW_H;
    const first = berlinParts(g.dates[0]);
    const all = g.dates.map(berlinParts);
    const sameMonth = all.every((d) => d.month === first.month);
    const dayText = sameMonth && all.length > 1 ? all.map((d) => d.day).join('/') : String(first.day);
    parts.push(`<rect x="40" y="${y}" width="84" height="84" rx="10" fill="${LILA}"/>`);
    parts.push(textPath(BOLD, dayText, 82, y + 50, all.length > 1 ? 32 : 42, '#ffffff', { anchor: 'middle', maxW: 76 }));
    parts.push(textPath(BOLD, MONATE[first.month], 82, y + 74, 19, '#ffffff', { anchor: 'middle', spacing: 2 }));
    parts.push(textPath(BOLD, g.title, 146, y + 36, TITLE_SIZE, LILA, { maxW: TITLE_MAX_W }));
    const when = all.length > 1
      ? all.map((d) => `${d.wd} ${d.day}.${d.month + 1}.`).join(' + ') + ` · ${first.time} Uhr`
      : `${first.wd} ${first.day}.${first.month + 1}. · ${first.time} Uhr`;
    const info = g.location ? `${when} · ${g.location}` : when;
    parts.push(textPath(LIGHT, info, 146, y + 74, 26, GRAU, { maxW: W - 146 - 30 }));
  });
  if (!groups.length) {
    parts.push(textPath(LIGHT, 'Neue Termine folgen in Kürze.', 40, TOP + 50, 30, GRAU));
  }
  parts.push(textPath(LIGHT, 'Tickets und alle Termine: ', 40, H - 24, 26, GRAU));
  const lw = LIGHT.getAdvanceWidth('Tickets und alle Termine: ', 26);
  parts.push(textPath(BOLD, 'kreatief-neckarsulm.de', 40 + lw, H - 24, 26, LILA));
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
