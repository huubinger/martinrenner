'use strict';
// Liedwunsch-Abstimmung für den Männerchor „Lauter Männer“ (Liederkranz Kochersteinsfeld) unter /lautermaenner.
// Die Vorschläge stammen aus der WhatsApp-Gruppe (Aufruf von Martin am 23.11.2026, gesammelt am 25.11.2026).
// Jeder Sänger trägt seinen Namen ein und wählt bis zu MAX_VOTES Lieder; erneutes Abstimmen mit demselben Namen
// ersetzt die alte Stimme. Ergebnis sieht nur Martin (Login der Tool-Übersicht) unter /lautermaenner/ergebnis.
// Gespeichert wird in DATA_DIR/lauter-maenner.json.
const path = require('path');
const fs = require('fs');
const { isOwner } = require('./owner-sso');

const MAX_VOTES = 5;

// noten: Link zu Noten/Hörprobe beim Verlag, falls im Chat genannt
const SONGS = [
  { id: 'tauben', titel: 'Tauben vergiften im Park', interpret: 'Georg Kreisler', von: ['Jörg'], noten: 'https://www.schott-music.com/de/tauben-vergiften-im-park-noc345704.html' },
  { id: 'hoch', titel: 'Hoch', interpret: 'Tim Bendzko', von: ['Armin', 'Raimund'] },
  { id: 'komet', titel: 'Komet', interpret: 'Udo Lindenberg & Apache 207', von: ['Armin', 'Raimund'] },
  { id: 'meinding', titel: 'Ich mach mein Ding', interpret: 'Udo Lindenberg', von: ['Armin'] },
  { id: 'lebentraum', titel: '’s Leben is wiar a Traum (Sh-Boom)', interpret: 'Spider Murphy Gang', von: ['Armin'] },
  { id: 'traeume', titel: 'Solang man Träume noch leben kann', interpret: 'Münchener Freiheit', von: ['Armin'] },
  { id: 'verdammt', titel: 'Verdammt, ich lieb’ dich', interpret: 'Matthias Reim', von: ['Armin'] },
  { id: 'kriege', titel: 'Wozu sind Kriege da', interpret: 'Udo Lindenberg', von: ['Armin'] },
  { id: 'geboren', titel: 'Geboren um zu leben', interpret: 'Unheilig', von: ['Werner'] },
  { id: 'irgendwo', titel: 'Irgendwo auf der Welt', interpret: 'Comedian Harmonists', von: ['Marc'], noten: 'https://www.alle-noten.de/Chor/Maennerchor/Irgendwo-auf-der-Welt-nr.html' },
  { id: 'engel', titel: 'Engel', interpret: 'Rammstein', von: ['Marc'], noten: 'https://www.alle-noten.de/Chor/Maennerchor/Engel.html' },
  { id: 'fahrrad', titel: 'Mein Fahrrad', interpret: 'Die Prinzen', von: ['Rudi'] },
  { id: 'geklaut', titel: 'Alles nur geklaut', interpret: 'Die Prinzen', von: ['Wolfgang'] },
  { id: 'gutentagen', titel: 'An guten Tagen', interpret: 'Johannes Oerding', von: ['Raimund', 'Werner'] },
  { id: 'seiteanseite', titel: 'Seite an Seite', interpret: 'Christina Stürmer', von: ['Werner'] },
  { id: 'neuertag', titel: 'Ein neuer Tag', interpret: 'Gospel mit deutschem Text', von: ['Raimund'], suche: 'Ein neuer Tag Gospel Chor' },
  { id: 'kommmit', titel: 'Komm mit', interpret: 'Unheilig', von: ['Raimund'] },
  { id: 'kaffee', titel: 'Eine Tasse Kaffee (Stumblin’ in)', interpret: 'nach Suzi Quatro & Chris Norman', von: ['Raimund'], suche: 'Eine Tasse Kaffee Stumblin in Chor' },
  { id: 'schwan', titel: 'Wenn ein Schwan stirbt', interpret: 'Puhdys', von: ['Raimund'] },
  { id: 'vaterunser', titel: 'Vater unser', interpret: 'Hanne Haller', von: ['Raimund'] },
  { id: 'niemals', titel: 'Niemals geht man so ganz', interpret: 'Trude Herr', von: ['Raimund'] },
  { id: 'legenden', titel: 'Legenden', interpret: 'Max Giesinger', von: ['Raimund', 'Werner'] },
  { id: 'nein', titel: 'Warum hast du nicht nein gesagt', interpret: 'Maite Kelly & Roland Kaiser', von: ['Raimund'] },
  { id: 'weitweg', titel: 'Weit, weit weg', interpret: 'Hubert von Goisern', von: ['Raimund'] },
  { id: 'liebe', titel: 'Du trägst keine Liebe in dir', interpret: 'Echt', von: ['Werner'] },
  { id: 'tausendmal', titel: 'Tausendmal Du', interpret: 'Münchener Freiheit', von: ['Werner'] },
  { id: 'wunderschoen', titel: 'Wunderschön', interpret: 'Unheilig', von: ['Werner'] },
  { id: 'ohnedich', titel: 'Ohne dich (schlaf’ ich heut’ Nacht nicht ein)', interpret: 'Münchener Freiheit', von: ['Werner'] },
].sort((a, b) => a.titel.replace(/^’s /, '').localeCompare(b.titel.replace(/^’s /, ''), 'de'));

const SONG_IDS = new Set(SONGS.map((s) => s.id));

// Aktive Sänger aus Konzertmeister (Verein Liederkranz Kochersteinsfeld, Stand 26.11.2026; ohne Leiter und inaktive).
// Wer fehlt, wählt „Mein Name fehlt“ und tippt ihn ein.
const SAENGER = ['Armin Götzinger', 'Bernhard Keiner', 'Günter Frank', 'Gunter Schmetzer', 'Harald Hetzler', 'Heinz Wollensack',
  'Helmut Lange', 'Joachim Sinderhauf', 'Jörg Hömme', 'Karl Braun', 'Konrad Brütsch', 'Lukas Einfalt', 'Marc Zendler',
  'Michael Matthes', 'Philipp Grein', 'Raimund Heiler', 'Rainer Schwab', 'Rudi Stahl-Gaumann', 'Torsten Schmötzer',
  'Werner Frank', 'Wolfgang Grein', 'Wolfgang Speiser'];
const ANDERS = '__anders';

const normName = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/ß/g, 'ss').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();

const yt = (q) => 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q);

module.exports = function setupLauterMaenner(app, { DATA_DIR, escapeHtml }) {
  const FILE = path.join(DATA_DIR, 'lauter-maenner.json');
  let db = { votes: {} };
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    db = { ...raw, votes: raw && raw.votes && typeof raw.votes === 'object' ? raw.votes : {} };
  } catch (e) {
    // Datei fehlt = erste Nutzung; unlesbare Datei vor dem Überschreiben sichern
    if (e.code !== 'ENOENT') try { fs.copyFileSync(FILE, `${FILE}.kaputt-${Date.now()}`); } catch { /* egal */ }
  }
  function save() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
    fs.renameSync(tmp, FILE);
  }
  // Eigene Auswahl nur dem zeigen, der sie abgegeben hat (Cookie mit seinem Namensschlüssel)
  const COOKIE = 'lm_stimme';
  function ownKey(req) {
    const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]*)`).exec(req.headers.cookie || '');
    try { return m ? decodeURIComponent(m[1]) : ''; } catch { return ''; }
  }

  const esc = escapeHtml;

  function tally() {
    const count = Object.fromEntries(SONGS.map((s) => [s.id, []]));
    for (const v of Object.values(db.votes)) for (const id of v.songs) if (count[id]) count[id].push(v.name);
    return SONGS.map((s) => ({ ...s, stimmen: count[s.id] }))
      .sort((a, b) => b.stimmen.length - a.stimmen.length || a.titel.localeCompare(b.titel, 'de'));
  }

  const CSS = `
  :root { --gelb:#ffd400; --schwarz:#141414; --grau:#6b6b6b; --linie:#e6e6e6; }
  * { box-sizing:border-box; }
  body { margin:0; font:16px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color:var(--schwarz); background:#fafafa; }
  header { background:var(--schwarz); color:#fff; padding:28px 20px 24px; border-bottom:6px solid var(--gelb); }
  header .wrap { max-width:760px; margin:0 auto; }
  header small { color:var(--gelb); font-weight:700; letter-spacing:.08em; text-transform:uppercase; font-size:13px; }
  h1 { margin:6px 0 8px; font-size:30px; line-height:1.15; }
  header p { margin:0; color:#ddd; max-width:600px; }
  main { max-width:760px; margin:0 auto; padding:20px 20px 120px; }
  .name { background:#fff; border:1px solid var(--linie); border-radius:12px; padding:16px; margin-bottom:18px; }
  .name label { font-weight:700; display:block; margin-bottom:6px; }
  .name input, .name select { width:100%; background:#fff; font:inherit; padding:11px 12px; border:1px solid #ccc; border-radius:8px; }
  .song { display:flex; gap:12px; align-items:flex-start; background:#fff; border:1px solid var(--linie); border-radius:12px; padding:14px; margin-bottom:10px; cursor:pointer; transition:border-color .15s, box-shadow .15s; }
  .song.on { border-color:var(--schwarz); box-shadow:inset 0 0 0 2px var(--gelb); }
  .song input { width:22px; height:22px; margin:2px 0 0; accent-color:var(--schwarz); flex:none; }
  .song .t { font-weight:700; }
  .song .i { color:var(--grau); font-size:14px; }
  .song .links { margin-top:6px; display:flex; flex-wrap:wrap; gap:6px 14px; font-size:14px; }
  .song a { color:var(--schwarz); font-weight:600; text-decoration:none; border-bottom:2px solid var(--gelb); }
  .song .von { color:var(--grau); font-size:13px; margin-top:4px; }
  .bar { position:fixed; left:0; right:0; bottom:0; background:var(--schwarz); color:#fff; padding:12px 16px; }
  .bar .wrap { max-width:760px; margin:0 auto; display:flex; align-items:center; gap:12px; justify-content:space-between; }
  .bar button { font:inherit; font-weight:700; background:var(--gelb); color:var(--schwarz); border:0; border-radius:8px; padding:12px 20px; cursor:pointer; }
  .bar button:disabled { opacity:.45; cursor:default; }
  .msg { background:#fff7cc; border:1px solid var(--gelb); border-radius:12px; padding:14px 16px; margin-bottom:18px; }
  table { width:100%; border-collapse:collapse; background:#fff; border:1px solid var(--linie); border-radius:12px; overflow:hidden; }
  td, th { padding:10px 12px; border-bottom:1px solid var(--linie); text-align:left; vertical-align:top; }
  th { background:#f2f2f2; font-size:14px; }
  td.n { font-weight:700; font-size:20px; width:54px; text-align:center; }
  .wer { color:var(--grau); font-size:13px; }
  `;

  function page(title, body) {
    return `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(title)}</title><style>${CSS}</style></head><body>${body}</body></html>`;
  }

  function songHtml(s, checked) {
    const links = [`<a href="${esc(yt(s.suche || `${s.titel} ${s.interpret}`))}" target="_blank" rel="noopener">▶ Original anhören</a>`,
      `<a href="${esc(yt(`${s.titel} Männerchor`))}" target="_blank" rel="noopener">▶ als Männerchor</a>`];
    if (s.noten) links.push(`<a href="${esc(s.noten)}" target="_blank" rel="noopener">Noten &amp; Hörprobe</a>`);
    return `<label class="song${checked ? ' on' : ''}">
  <input type="checkbox" name="songs" value="${esc(s.id)}"${checked ? ' checked' : ''}>
  <div><div class="t">${esc(s.titel)}</div><div class="i">${esc(s.interpret)}</div>
  <div class="links">${links.join('')}</div>
  <div class="von">vorgeschlagen von ${esc(s.von.join(' und '))}</div></div></label>`;
  }

  app.get(['/lautermaenner', '/lautermaenner/', '/lauter-maenner'], (req, res) => {
    if (req.path === '/lauter-maenner') return res.redirect(301, '/lautermaenner');
    res.set('X-Robots-Tag', 'noindex');
    const key = ownKey(req);
    let name = String(req.query.name || '').slice(0, 60);
    const prev = key ? db.votes[key] : null; // nur die eigene Stimme vorbelegen
    if (prev && !name) name = prev.name;
    const chosen = new Set(prev ? prev.songs : []);
    const msg = req.query.danke
      ? `<div class="msg"><b>Danke, ${esc(name)}!</b> Deine Stimme ist gespeichert. Du kannst sie jederzeit ändern: einfach unten neu wählen und wieder abschicken.</div>`
      : prev && !req.query.fehler ? `<div class="msg">Auf diesem Gerät wurde schon als <b>${esc(prev.name)}</b> abgestimmt. Nicht du? Dann wähl bitte oben deinen eigenen Namen aus, sonst wird die Stimme von ${esc(prev.name)} überschrieben.</div>`
      : req.query.fehler ? `<div class="msg"><b>Hoppla:</b> ${esc(String(req.query.fehler).slice(0, 120))}</div>` : '';
    res.send(page('Lauter Männer – Liedwünsche', `
<header><div class="wrap"><small>Lauter Männer · Liederkranz Kochersteinsfeld</small>
<h1>Welche Lieder singen wir als Nächstes?</h1>
<p>Hier sind alle Vorschläge aus unserer WhatsApp-Gruppe. Hört gern rein und wählt bis zu ${MAX_VOTES === 5 ? 'fünf' : MAX_VOTES} Favoriten. Wer noch einmal abstimmt, ersetzt damit seine alte Stimme.</p></div></header>
<main>${msg}
<form method="post" action="/lautermaenner" id="f">
<div class="name"><label for="name">Wer bist du?</label>
<select id="name" name="name" required>
<option value="">Bitte Namen auswählen …</option>
${SAENGER.map((n) => `<option${n === name ? ' selected' : ''}>${esc(n)}</option>`).join('')}
<option value="${ANDERS}"${name && !SAENGER.includes(name) ? ' selected' : ''}>Mein Name fehlt</option>
</select>
<input id="name2" name="name2" maxlength="60" placeholder="Vor- und Nachname" value="${name && !SAENGER.includes(name) ? esc(name) : ''}" style="margin-top:8px"></div>
${SONGS.map((s) => songHtml(s, chosen.has(s.id))).join('\n')}
<div class="bar"><div class="wrap"><span id="z">0 von ${MAX_VOTES} gewählt</span><button type="submit" id="b">Abstimmen</button></div></div>
</form></main>
<script>
const max=${MAX_VOTES}, boxes=[...document.querySelectorAll('input[name=songs]')], z=document.getElementById('z'), b=document.getElementById('b');
function upd(){const n=boxes.filter(x=>x.checked).length; z.textContent=n+' von '+max+' gewählt';
 boxes.forEach(x=>{x.disabled=!x.checked&&n>=max; x.closest('.song').classList.toggle('on',x.checked);}); b.disabled=n===0;}
const sel=document.getElementById('name'), n2=document.getElementById('name2');
function nm(){const a=sel.value==='__anders'; n2.style.display=a?'':'none'; n2.required=a;} sel.addEventListener('change',nm); nm();
boxes.forEach(x=>x.addEventListener('change',upd)); document.querySelectorAll('.song a').forEach(a=>a.addEventListener('click',e=>e.stopPropagation())); upd();
</script>`));
  });

  app.post('/lautermaenner', (req, res) => {
    const b = req.body || {};
    const name = String((b.name === ANDERS ? b.name2 : b.name) || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    let songs = req.body && req.body.songs;
    songs = [...new Set((Array.isArray(songs) ? songs : songs ? [songs] : []).map(String))].filter((id) => SONG_IDS.has(id));
    const back = (q) => res.redirect(303, '/lautermaenner?' + new URLSearchParams(q).toString());
    if (normName(name).length < 2) return back({ name, fehler: 'Bitte deinen Namen auswählen (oder bei „Mein Name fehlt“ eintragen).' });
    if (!songs.length) return back({ name, fehler: 'Bitte mindestens ein Lied wählen.' });
    if (songs.length > MAX_VOTES) return back({ name, fehler: `Höchstens ${MAX_VOTES} Lieder.` });
    db.votes[normName(name)] = { name, songs, t: new Date().toISOString() };
    try { save(); } catch (e) {
      console.error('lauter-maenner speichern:', e.message);
      return res.status(500).send('Speichern hat nicht geklappt – bitte später noch einmal versuchen.');
    }
    res.cookie(COOKIE, normName(name), { maxAge: 365 * 864e5, httpOnly: true, sameSite: 'lax', path: '/lautermaenner' });
    back({ name, danke: '1' });
  });

  app.get('/lautermaenner/ergebnis', (req, res) => {
    if (!isOwner(req)) return res.redirect('/login?next=' + encodeURIComponent('/lautermaenner/ergebnis'));
    res.set('X-Robots-Tag', 'noindex');
    const voters = Object.values(db.votes).sort((a, b) => a.name.localeCompare(b.name, 'de'));
    const rows = tally().map((s) => `<tr><td class="n">${s.stimmen.length}</td><td><b>${esc(s.titel)}</b><br><span class="wer">${esc(s.interpret)}</span></td><td class="wer">${esc(s.stimmen.join(', '))}</td></tr>`).join('');
    res.send(page('Lauter Männer – Ergebnis', `
<header><div class="wrap"><small>Lauter Männer · nur für Martin</small><h1>Ergebnis Liedwünsche</h1>
<p>${voters.length} ${voters.length === 1 ? 'Sänger hat' : 'Sänger haben'} abgestimmt: ${esc(voters.map((v) => v.name).join(', ')) || '–'}</p></div></header>
<main><table><tr><th>Stimmen</th><th>Lied</th><th>Gewählt von</th></tr>${rows}</table></main>`));
  });
};
