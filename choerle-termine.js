'use strict';
// Frühstücks-Chörle: Auftrittstermine abfragen.
// Mitsingende (hinter dem Chörle-Passwort) tragen Name, Register, Zu-/Absage und die Antworten
// auf beliebig viele Zusatzfragen ein. Die Übersicht mit Namen sieht nur der Admin unter /admin/choerle.
// Eine Person = ein Name: wer denselben Namen erneut einträgt, ändert damit seine Antwort.
// Gespeichert wird in DATA_DIR/choerle-termine.json.
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const REGISTERS = ['Sopran', 'Alt', 'Tenor', 'Bass'];
const QUESTION_TYPES = { single: 'Eine Antwort', multi: 'Mehrere Antworten', text: 'Freitext' };
const TZ = 'Europe/Berlin';

module.exports = function setupChoerleTermine(app, { DATA_DIR, requireChoerleAccess, requireAdminAuth, escapeHtml }) {
  const FILE = path.join(DATA_DIR, 'choerle-termine.json');
  let db = { termine: [] };
  try { db = { termine: [], ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch { /* erste Nutzung */ }
  function save() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, FILE);
  }

  // Termine (samt Antworten) zwölf Monate nach dem Auftritt automatisch löschen – so steht es in der Datenschutzerklärung
  function purgeOld() {
    const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const keep = db.termine.filter((t) => t.date >= cutoff);
    if (keep.length !== db.termine.length) {
      db.termine = keep;
      save();
    }
  }
  purgeOld();
  setInterval(purgeOld, 24 * 60 * 60 * 1000).unref();

  const str = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
  const longStr = (v, max) => String(v == null ? '' : v).replace(/\r/g, '').trim().slice(0, max);
  const newId = () => crypto.randomBytes(6).toString('hex');
  const nameKey = (n) => str(n, 80).toLowerCase().normalize('NFC');
  const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: TZ }); // JJJJ-MM-TT
  const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d);
  const findTermin = (id) => db.termine.find((t) => t.id === id);
  const sorted = (list) => [...list].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  function formatDate(d) {
    if (!isDate(d)) return d || '';
    const dt = new Date(d + 'T12:00:00Z');
    return dt.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
  }

  // Fragen aus dem Admin-Formular (JSON) säubern; bestehende IDs bleiben, damit Antworten erhalten bleiben
  function cleanQuestions(raw) {
    let list = [];
    try { list = JSON.parse(raw || '[]'); } catch { list = []; }
    if (!Array.isArray(list)) list = [];
    return list.slice(0, 30).map((q) => {
      const type = QUESTION_TYPES[q && q.type] ? q.type : 'single';
      const options = type === 'text' ? [] : (Array.isArray(q.options) ? q.options : [])
        .map((o) => str(o, 200)).filter(Boolean).slice(0, 20);
      return {
        id: /^[a-f0-9]{12}$/.test(q && q.id) ? q.id : newId(),
        text: str(q && q.text, 300),
        type,
        options,
        onlyIfYes: !!(q && q.onlyIfYes),
        required: !!(q && q.required),
      };
    }).filter((q) => q.text && (q.type === 'text' || q.options.length));
  }

  function publicTermin(t, key) {
    const mine = key ? t.responses.find((r) => nameKey(r.name) === key) : null;
    return {
      id: t.id, title: t.title, date: t.date, time: t.time, place: t.place, meet: t.meet,
      deadline: t.deadline, note: t.note, questions: t.questions, createdAt: t.createdAt,
      mine: mine ? { name: mine.name, register: mine.register, kommt: mine.kommt, answers: mine.answers, updatedAt: mine.updatedAt } : null,
    };
  }

  // Antworten auf die Zusatzfragen säubern; missing = erste unbeantwortete Pflichtfrage
  function cleanAnswers(t, kommt, given) {
    const answers = {};
    let missing = null;
    if (!given || typeof given !== 'object') given = {};
    for (const q of t.questions) {
      if (q.onlyIfYes && !kommt) continue;
      let v = given[q.id];
      if (q.type === 'single') v = q.options.includes(v) ? v : '';
      else if (q.type === 'multi') v = q.options.filter((o) => [].concat(v || []).includes(o));
      else v = longStr(v, 1000);
      const empty = Array.isArray(v) ? !v.length : !v;
      if (q.required && empty && !missing) missing = q;
      if (!empty) answers[q.id] = v;
    }
    return { answers, missing };
  }

  // --- Für die Mitsingenden ---
  app.get('/api/choerle/termine', requireChoerleAccess, (req, res) => {
    const key = nameKey(req.query.name);
    const t0 = today();
    const termine = sorted(db.termine.filter((t) => t.date >= t0)).map((t) => publicTermin(t, key));
    res.json({ ok: true, registers: REGISTERS, termine });
  });

  app.post('/api/choerle/termine/:id/antwort', requireChoerleAccess, (req, res) => {
    const t = findTermin(req.params.id);
    if (!t || t.date < today()) return res.status(404).json({ ok: false, error: 'Diesen Termin gibt es nicht mehr.' });
    const body = req.body || {};
    const name = str(body.name, 80);
    if (name.length < 2) return res.status(400).json({ ok: false, error: 'Bitte deinen Namen eintragen.' });
    if (!REGISTERS.includes(body.register)) return res.status(400).json({ ok: false, error: 'Bitte dein Register auswählen.' });
    if (typeof body.kommt !== 'boolean') return res.status(400).json({ ok: false, error: 'Bitte angeben, ob du kannst.' });

    const { answers, missing } = cleanAnswers(t, body.kommt, body.answers);
    if (missing) return res.status(400).json({ ok: false, error: `Bitte beantworte noch: „${missing.text}“` });

    const key = nameKey(name);
    const now = Date.now();
    const existing = t.responses.find((r) => nameKey(r.name) === key);
    if (existing) Object.assign(existing, { register: body.register, kommt: body.kommt, answers, updatedAt: now });
    else t.responses.push({ id: newId(), name, register: body.register, kommt: body.kommt, answers, createdAt: now, updatedAt: now });
    save();
    res.json({ ok: true, termin: publicTermin(t, key) });
  });

  // --- Admin ---
  function answerText(q, v) {
    if (v == null || v === '') return '';
    return Array.isArray(v) ? v.join(', ') : String(v);
  }

  // Auswertung als Tabelle: eine Zeile je Register (Sopran, Alt, Tenor, Bass) plus Gesamt
  function summaryTable(t) {
    const choice = t.questions.filter((q) => q.type !== 'text' && q.options.length);
    const picked = (r, q, o) => { const v = r.answers[q.id]; return Array.isArray(v) ? v.includes(o) : v === o; };
    const row = (label, list, cls) => {
      const yes = list.filter((r) => r.kommt);
      const cells = choice.map((q) => q.options.map((o) => (q.onlyIfYes ? yes : list).filter((r) => picked(r, q, o)).length)
        .map((n, i) => `<td class="num${i === 0 ? ' qstart' : ''}">${n || '–'}</td>`).join('')).join('');
      return `<tr class="${cls || ''}"><th scope="row">${escapeHtml(label)}</th><td class="num yes">${yes.length}</td><td class="num">${list.length - yes.length}</td>${cells}</tr>`;
    };
    return `<div class="table-wrap"><table class="summary">
      <thead>
        <tr><th rowspan="${choice.length ? 2 : 1}">Register</th><th rowspan="${choice.length ? 2 : 1}" class="num">Zusagen</th><th rowspan="${choice.length ? 2 : 1}" class="num">Absagen</th>${choice.map((q) => `<th colspan="${q.options.length}" class="qstart qhead">${escapeHtml(q.text)}</th>`).join('')}</tr>
        ${choice.length ? `<tr>${choice.map((q) => q.options.map((o, i) => `<th class="num opt${i === 0 ? ' qstart' : ''}">${escapeHtml(o)}</th>`).join('')).join('')}</tr>` : ''}
      </thead>
      <tbody>${REGISTERS.map((reg) => row(reg, t.responses.filter((r) => r.register === reg))).join('')}</tbody>
      <tfoot>${row('Gesamt', t.responses, 'total')}</tfoot>
    </table></div>`;
  }

  // Sortierung: Sopran, Alt, Tenor, Bass – innerhalb des Registers erst Zusagen, dann alphabetisch
  function sortedResponses(t) {
    const regIdx = (r) => REGISTERS.indexOf(r.register);
    return [...t.responses].sort((a, b) => (regIdx(a) - regIdx(b)) || (b.kommt - a.kommt) || a.name.localeCompare(b.name, 'de'));
  }

  function terminForm(t) {
    const v = (k) => escapeHtml((t && t[k]) || '');
    const action = t ? `/admin/choerle/${t.id}` : '/admin/choerle';
    return `<form method="POST" action="${action}" class="termin-form">
      <div class="grid">
        <label class="wide">Titel<input type="text" name="title" value="${v('title')}" required placeholder="z. B. Auftritt Weihnachtsmarkt"></label>
        <label>Datum<input type="date" name="date" value="${v('date')}" required></label>
        <label>Uhrzeit<input type="text" name="time" value="${v('time')}" placeholder="15:00 Uhr"></label>
        <label>Ort<input type="text" name="place" value="${v('place')}"></label>
        <label>Treffpunkt<input type="text" name="meet" value="${v('meet')}" placeholder="14:15 Uhr am Marktplatz"></label>
        <label>Antwort bis<input type="date" name="deadline" value="${v('deadline')}"></label>
        <label class="wide">Notiz für die Mitsingenden<textarea name="note">${v('note')}</textarea></label>
      </div>
      <h3>Zusatzfragen</h3>
      <div class="questions" data-questions="${escapeHtml(JSON.stringify((t && t.questions) || []))}"></div>
      <button type="button" class="ghost add-q">+ Frage hinzufügen</button>
      <input type="hidden" name="questions">
      <div class="actions"><button type="submit">${t ? 'Änderungen speichern' : 'Termin anlegen'}</button></div>
    </form>`;
  }

  // Admin trägt für jemand anderen ein (oder ändert einen Eintrag) – gleiche Felder wie auf der Homepage
  function answerForm(t) {
    const qs = t.questions.map((q) => {
      const n = `answers[${q.id}]`;
      let field;
      if (q.type === 'text') field = `<textarea name="${n}"></textarea>`;
      else field = '<div class="opts">' + q.options.map((o) => `<label><input type="${q.type === 'multi' ? 'checkbox' : 'radio'}" name="${n}${q.type === 'multi' ? '[]' : ''}" value="${escapeHtml(o)}"> ${escapeHtml(o)}</label>`).join('')
        + (q.type === 'single' ? `<label><input type="radio" name="${n}" value=""> <em>keine Angabe</em></label>` : '') + '</div>';
      return `<fieldset class="a-q${q.onlyIfYes ? ' only-yes' : ''}" data-qid="${q.id}"><legend>${escapeHtml(q.text)}${q.required ? ' *' : ''}</legend>${field}</fieldset>`;
    }).join('');
    return `<form method="POST" action="/admin/choerle/${t.id}/antwort" class="answer-form">
      <input type="hidden" name="rid" value="">
      <div class="grid">
        <label>Name<input type="text" name="name" required minlength="2" maxlength="80"></label>
        <label>Register<select name="register" required><option value="">– bitte wählen –</option>${REGISTERS.map((r) => `<option>${r}</option>`).join('')}</select></label>
        <fieldset class="a-kommt"><legend>Kommt?</legend><div class="opts">
          <label><input type="radio" name="kommt" value="ja" required> ✔ Ja</label><label><input type="radio" name="kommt" value="nein"> ✘ Nein</label></div></fieldset>
      </div>
      ${qs}
      <p class="hint">Gibt es den Namen schon, wird dieser Eintrag überschrieben. Pflichtfragen (*) darfst du hier auch leer lassen.</p>
      <div class="actions"><button type="submit" class="a-submit">Eintragen</button> <button type="button" class="ghost a-reset">Leeren</button></div>
    </form>`;
  }

  function terminCard(t) {
    const cols = 3 + t.questions.length;
    const rows = REGISTERS.map((reg) => {
      const list = sortedResponses(t).filter((r) => r.register === reg);
      if (!list.length) return '';
      const yes = list.filter((r) => r.kommt).length;
      return `<tr class="group"><th colspan="${cols}">${reg} <span>${yes} dabei${list.length - yes ? ` · ${list.length - yes} abgesagt` : ''}</span></th><th class="noprint"></th></tr>` + list.map((r) => `<tr class="${r.kommt ? 'yes' : 'no'}">
        <td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.register)}</td><td>${r.kommt ? '✔ Ja' : '✘ Nein'}</td>
        ${t.questions.map((q) => `<td>${escapeHtml(answerText(q, r.answers[q.id]))}</td>`).join('')}
        <td class="noprint row-tools"><button type="button" class="link-edit" title="Eintrag bearbeiten" data-r="${escapeHtml(JSON.stringify({ id: r.id, name: r.name, register: r.register, kommt: r.kommt, answers: r.answers }))}">✎</button><form method="POST" action="/admin/choerle/${t.id}/antwort/${r.id}/delete" onsubmit="return confirm(${escapeHtml(JSON.stringify('Eintrag von ' + r.name + ' löschen?'))});"><button class="link-del" title="Eintrag löschen">✕</button></form></td>
      </tr>`).join('');
    }).join('');
    const past = t.date < today();
    return `<section class="termin${past ? ' past' : ''}" id="t-${t.id}">
      <div class="termin-head">
        <div>
          <h2>${escapeHtml(t.title)}${past ? ' <span class="badge">vorbei</span>' : ''}</h2>
          <p class="meta">${escapeHtml(formatDate(t.date))}${t.time ? ' · ' + escapeHtml(t.time) : ''}${t.place ? ' · ' + escapeHtml(t.place) : ''}${t.meet ? ' · Treffpunkt ' + escapeHtml(t.meet) : ''}${t.deadline ? ' · Antwort bis ' + escapeHtml(formatDate(t.deadline)) : ''}</p>
        </div>
        <div class="noprint head-actions">
          <a class="btn ghost" href="/admin/choerle/${t.id}.csv">CSV / Excel</a>
          <button type="button" class="btn ghost" onclick="printTermin('${t.id}')">Drucken</button>
        </div>
      </div>
      <h3>Übersicht</h3>
      ${summaryTable(t)}
      <h3>Einzelne Antworten</h3>
      ${t.responses.length ? `<div class="table-wrap"><table class="names">
        <thead><tr><th>Name</th><th>Register</th><th>Kommt</th>${t.questions.map((q) => `<th>${escapeHtml(q.text)}</th>`).join('')}<th class="noprint"></th></tr></thead>
        <tbody>${rows}</tbody></table></div>` : '<p class="empty">Noch keine Antworten.</p>'}
      <details class="noprint answer-box"><summary>Antwort für jemanden eintragen</summary>${answerForm(t)}</details>
      <details class="noprint"><summary>Termin bearbeiten</summary>${terminForm(t)}
        <form method="POST" action="/admin/choerle/${t.id}/delete" onsubmit="return confirm('Termin samt allen Antworten löschen?');"><button class="danger">Termin löschen</button></form>
      </details>
    </section>`;
  }

  function renderPage() {
    const t0 = today();
    const list = sorted(db.termine);
    const upcoming = list.filter((t) => t.date >= t0);
    const past = list.filter((t) => t.date < t0).reverse();
    return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>Chörle-Termine</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0f172a; color: #e2e8f0; }
  .container { max-width: 1100px; margin: 0 auto; padding: 1.5rem 1rem 4rem; }
  a { color: #38bdf8; }
  h1 { margin: 0.3rem 0 0.2rem; } .subtitle { color: #94a3b8; margin: 0 0 1.5rem; }
  h2 { margin: 0; font-size: 1.2rem; } h3 { margin: 1rem 0 0.5rem; font-size: 1rem; }
  .termin, .new { background: #1e293b; border: 1px solid #334155; border-radius: 14px; padding: 1.1rem; margin-bottom: 1.2rem; }
  .termin.past { opacity: 0.75; }
  .termin-head { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
  .meta { color: #94a3b8; margin: 0.3rem 0 0; font-size: 0.9rem; }
  .badge { font-size: 0.7rem; background: #475569; padding: 0.15rem 0.5rem; border-radius: 999px; vertical-align: middle; }
  .head-actions { display: flex; gap: 0.5rem; align-items: flex-start; }
  .termin h3 { margin: 1.1rem 0 0.5rem; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; }
  .num { text-align: center; }
  .qstart { border-left: 1px solid #475569; }
  table.summary th.qhead { text-align: center; color: #e2e8f0; }
  table.summary th.opt { font-weight: 500; white-space: normal; min-width: 90px; max-width: 160px; font-size: 0.8rem; }
  table.summary tbody th { color: #e2e8f0; }
  table.summary td.yes { color: #86efac; font-weight: 700; }
  table.summary tfoot tr th, table.summary tfoot tr td { font-weight: 700; color: #f8fafc; border-top: 2px solid #64748b; border-bottom: none; }
  table.names tr.group th { background: #0f172a; color: #f8fafc; font-size: 0.85rem; padding-top: 0.6rem; }
  table.names tr.group th span { font-weight: 400; color: #94a3b8; margin-left: 0.4rem; }
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
  th, td { text-align: left; padding: 0.45rem 0.6rem; border-bottom: 1px solid #334155; vertical-align: top; }
  th { color: #94a3b8; font-weight: 600; white-space: nowrap; }
  tr.no td { color: #94a3b8; }
  .empty { color: #94a3b8; }
  details { margin-top: 1rem; } summary { cursor: pointer; color: #38bdf8; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.7rem; margin-top: 0.8rem; }
  .grid .wide { grid-column: 1 / -1; }
  label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.85rem; color: #cbd5e1; }
  input, textarea, select { font: inherit; padding: 0.5rem 0.6rem; border-radius: 8px; border: 1px solid #475569; background: #0f172a; color: #f8fafc; }
  textarea { min-height: 70px; }
  button, .btn { font: inherit; font-size: 0.88rem; padding: 0.5rem 1rem; border-radius: 999px; border: none; background: #38bdf8; color: #0f172a; font-weight: 600; cursor: pointer; text-decoration: none; display: inline-block; }
  button.ghost, .btn.ghost { background: transparent; color: #e2e8f0; border: 1px solid #475569; }
  button.danger { background: transparent; color: #fca5a5; border: 1px solid #7f1d1d; margin-top: 0.8rem; }
  .link-del { background: none; color: #64748b; padding: 0 0.3rem; } .link-del:hover { color: #fca5a5; }
  .actions { margin-top: 1rem; }
  .question { border: 1px solid #334155; border-radius: 10px; padding: 0.7rem; margin-bottom: 0.6rem; display: grid; gap: 0.5rem; }
  .question .row { display: flex; gap: 0.6rem; flex-wrap: wrap; align-items: center; }
  .question .row label { flex-direction: row; align-items: center; gap: 0.35rem; }
  .question .q-text { flex: 1; min-width: 220px; }
  .question textarea { min-height: 80px; }
  .q-tools button { padding: 0.25rem 0.6rem; font-size: 0.8rem; }
  .answer-form fieldset { border: 1px solid #334155; border-radius: 10px; padding: 0.5rem 0.7rem; margin: 0.6rem 0 0; }
  .answer-form .grid fieldset { margin: 0; }
  .answer-form legend { font-size: 0.85rem; color: #cbd5e1; padding: 0 0.3rem; }
  .answer-form .opts { display: flex; flex-wrap: wrap; gap: 0.4rem 1rem; }
  .answer-form .opts label { flex-direction: row; align-items: center; gap: 0.35rem; font-size: 0.9rem; color: #e2e8f0; }
  .answer-form textarea { width: 100%; min-height: 60px; }
  .answer-form .hint { color: #94a3b8; font-size: 0.8rem; margin: 0.6rem 0 0; }
  .row-tools { white-space: nowrap; } .row-tools form { display: inline; }
  .link-edit { background: none; color: #64748b; padding: 0 0.3rem; } .link-edit:hover { color: #38bdf8; }
  .message { background: #14532d; border-radius: 10px; padding: 0.6rem 0.9rem; margin-bottom: 1rem; }
  @media print {
    body { background: #fff; color: #000; } .noprint, .new, h1, .subtitle, .back, .past-head { display: none !important; }
    .termin { border: none; background: none; padding: 0; } .termin:not(.printing) { display: none; }
    th, td { border-color: #ccc !important; color: #000 !important; background: none !important; } .meta, .termin h3 { color: #333; }
  }
</style></head><body><div class="container">
  <a class="back" href="/admin">← Admin</a>
  <h1>🎤 Chörle-Termine</h1>
  <p class="subtitle">Die Mitsingenden sehen anstehende Termine oben im Chörle-Bereich (martinrenner.de/choerle) und tragen sich dort ein. Die Namen sieht nur du hier.</p>
  ${upcoming.map((t) => terminCard(t)).join('') || '<p class="empty">Keine anstehenden Termine.</p>'}
  <section class="new"><h2>Neuen Termin anlegen</h2>${terminForm(null)}</section>
  ${past.length ? `<h2 class="past-head" style="margin:2rem 0 1rem;">Vergangene Termine</h2>${past.map((t) => terminCard(t)).join('')}` : ''}
</div>
<script>
  const TYPES = ${JSON.stringify(QUESTION_TYPES)};
  function printTermin(id) {
    document.querySelectorAll('.termin').forEach((el) => el.classList.toggle('printing', el.id === 't-' + id));
    window.print();
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function questionEl(q) {
    const el = document.createElement('div');
    el.className = 'question';
    el.dataset.id = q.id || '';
    el.innerHTML = '<div class="row"><input class="q-text" placeholder="Frage, z. B. Essen nach dem Auftritt" value="' + esc(q.text || '') + '">'
      + '<select class="q-type">' + Object.entries(TYPES).map(([k, v]) => '<option value="' + k + '"' + (q.type === k ? ' selected' : '') + '>' + v + '</option>').join('') + '</select></div>'
      + '<label class="q-opts">Antwortmöglichkeiten (eine pro Zeile)<textarea placeholder="Vegetarisch: Linsen + Spätzle&#10;Mit Fleisch: Saitenwürstle + Linsen + Spätzle&#10;Danke, ich möchte nichts essen">' + esc((q.options || []).join('\\n')) + '</textarea></label>'
      + '<div class="row"><label><input type="checkbox" class="q-yes"' + (q.onlyIfYes !== false ? ' checked' : '') + '> nur bei Zusage fragen</label>'
      + '<label><input type="checkbox" class="q-req"' + (q.required ? ' checked' : '') + '> Pflichtfrage</label>'
      + '<span class="q-tools"><button type="button" class="ghost q-up" title="nach oben">↑</button> <button type="button" class="ghost q-down" title="nach unten">↓</button> <button type="button" class="ghost q-del">Entfernen</button></span></div>';
    const sync = () => { el.querySelector('.q-opts').style.display = el.querySelector('.q-type').value === 'text' ? 'none' : ''; };
    el.querySelector('.q-type').addEventListener('change', sync);
    el.querySelector('.q-del').addEventListener('click', () => el.remove());
    el.querySelector('.q-up').addEventListener('click', () => el.previousElementSibling && el.parentNode.insertBefore(el, el.previousElementSibling));
    el.querySelector('.q-down').addEventListener('click', () => el.nextElementSibling && el.parentNode.insertBefore(el.nextElementSibling, el));
    sync();
    return el;
  }
  // Antwort-Formular: Fragen „nur bei Zusage“ bei Absage ausblenden; ✎ füllt das Formular mit einem bestehenden Eintrag
  document.querySelectorAll('.answer-form').forEach((form) => {
    const sync = () => {
      const no = form.querySelector('[name=kommt][value=nein]').checked;
      form.querySelectorAll('.only-yes').forEach((el) => { el.style.display = no ? 'none' : ''; });
    };
    const reset = () => {
      form.reset();
      form.querySelector('[name=rid]').value = '';
      form.querySelector('.a-submit').textContent = 'Eintragen';
      sync();
    };
    form.querySelectorAll('[name=kommt]').forEach((el) => el.addEventListener('change', sync));
    form.querySelector('.a-reset').addEventListener('click', reset);
    const card = form.closest('.termin');
    card.querySelectorAll('.link-edit').forEach((btn) => btn.addEventListener('click', () => {
      const r = JSON.parse(btn.dataset.r);
      reset();
      form.querySelector('[name=rid]').value = r.id;
      form.querySelector('[name=name]').value = r.name;
      form.querySelector('[name=register]').value = r.register;
      form.querySelector('[name=kommt][value=' + (r.kommt ? 'ja' : 'nein') + ']').checked = true;
      form.querySelectorAll('.a-q').forEach((fs) => {
        const v = r.answers[fs.dataset.qid];
        if (v == null) return;
        const ta = fs.querySelector('textarea');
        if (ta) ta.value = v;
        else fs.querySelectorAll('input').forEach((i) => { i.checked = [].concat(v).includes(i.value); });
      });
      form.querySelector('.a-submit').textContent = 'Änderungen speichern';
      sync();
      const box = form.closest('details');
      box.open = true;
      box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    sync();
  });
  document.querySelectorAll('.termin-form').forEach((form) => {
    const box = form.querySelector('.questions');
    JSON.parse(box.dataset.questions || '[]').forEach((q) => box.appendChild(questionEl(q)));
    form.querySelector('.add-q').addEventListener('click', () => box.appendChild(questionEl({ type: 'single' })));
    form.addEventListener('submit', () => {
      form.querySelector('[name=questions]').value = JSON.stringify([...box.querySelectorAll('.question')].map((el) => ({
        id: el.dataset.id,
        text: el.querySelector('.q-text').value,
        type: el.querySelector('.q-type').value,
        options: el.querySelector('.q-opts textarea').value.split('\\n'),
        onlyIfYes: el.querySelector('.q-yes').checked,
        required: el.querySelector('.q-req').checked,
      })));
    });
  });
</script></body></html>`;
  }

  function terminFromForm(body, t) {
    const date = isDate(body.date) ? body.date : '';
    if (!str(body.title, 150) || !date) return null;
    return Object.assign(t || { id: newId(), responses: [], createdAt: Date.now() }, {
      title: str(body.title, 150),
      date,
      time: str(body.time, 40),
      place: str(body.place, 150),
      meet: str(body.meet, 150),
      deadline: isDate(body.deadline) ? body.deadline : '',
      note: longStr(body.note, 2000),
      questions: cleanQuestions(body.questions),
    });
  }

  app.get('/admin/choerle', requireAdminAuth, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.send(renderPage());
  });

  app.post('/admin/choerle', requireAdminAuth, (req, res) => {
    const t = terminFromForm(req.body || {}, null);
    if (!t) return res.status(400).send('Titel und Datum sind Pflicht. <a href="/admin/choerle">Zurück</a>');
    db.termine.push(t);
    save();
    res.redirect('/admin/choerle#t-' + t.id);
  });

  app.post('/admin/choerle/:id', requireAdminAuth, (req, res) => {
    const t = findTermin(req.params.id);
    if (!t) return res.redirect('/admin/choerle');
    if (!terminFromForm(req.body || {}, { ...t })) return res.status(400).send('Titel und Datum sind Pflicht. <a href="/admin/choerle">Zurück</a>');
    terminFromForm(req.body || {}, t);
    save();
    res.redirect('/admin/choerle#t-' + t.id);
  });

  app.post('/admin/choerle/:id/delete', requireAdminAuth, (req, res) => {
    db.termine = db.termine.filter((t) => t.id !== req.params.id);
    save();
    res.redirect('/admin/choerle');
  });

  app.post('/admin/choerle/:id/antwort', requireAdminAuth, (req, res) => {
    const t = findTermin(req.params.id);
    if (!t) return res.redirect('/admin/choerle');
    const body = req.body || {};
    const back = ' <a href="/admin/choerle#t-' + t.id + '">Zurück</a>';
    const name = str(body.name, 80);
    if (name.length < 2) return res.status(400).send('Bitte einen Namen eintragen.' + back);
    if (!REGISTERS.includes(body.register)) return res.status(400).send('Bitte ein Register auswählen.' + back);
    if (body.kommt !== 'ja' && body.kommt !== 'nein') return res.status(400).send('Bitte angeben, ob die Person kommt.' + back);
    const kommt = body.kommt === 'ja';
    const { answers } = cleanAnswers(t, kommt, body.answers);

    const key = nameKey(name);
    const byName = t.responses.find((r) => nameKey(r.name) === key);
    const byId = body.rid ? t.responses.find((r) => r.id === body.rid) : null;
    if (byId && byName && byName !== byId) return res.status(400).send(`Für „${escapeHtml(byName.name)}“ gibt es schon einen Eintrag.` + back);
    const existing = byId || byName;
    const now = Date.now();
    if (existing) Object.assign(existing, { name, register: body.register, kommt, answers, updatedAt: now });
    else t.responses.push({ id: newId(), name, register: body.register, kommt, answers, createdAt: now, updatedAt: now, byAdmin: true });
    save();
    res.redirect('/admin/choerle#t-' + t.id);
  });

  app.post('/admin/choerle/:id/antwort/:rid/delete', requireAdminAuth, (req, res) => {
    const t = findTermin(req.params.id);
    if (t) {
      t.responses = t.responses.filter((r) => r.id !== req.params.rid);
      save();
    }
    res.redirect('/admin/choerle#t-' + req.params.id);
  });

  // CSV mit Semikolon und BOM, damit Excel Umlaute und Spalten richtig erkennt
  app.get('/admin/choerle/:id.csv', requireAdminAuth, (req, res) => {
    const t = findTermin(req.params.id);
    if (!t) return res.status(404).send('Termin nicht gefunden.');
    const cell = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const lines = [['Name', 'Register', 'Kommt', ...t.questions.map((q) => q.text), 'Zuletzt geändert']];
    for (const r of sortedResponses(t)) {
      lines.push([r.name, r.register, r.kommt ? 'Ja' : 'Nein', ...t.questions.map((q) => answerText(q, r.answers[q.id])),
        new Date(r.updatedAt).toLocaleString('de-DE', { timeZone: TZ })]);
    }
    const file = `Choerle ${t.date} ${t.title}`.replace(/[^\w äöüÄÖÜß.-]+/g, '').trim() + '.csv';
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="choerle-${t.date}.csv"; filename*=UTF-8''${encodeURIComponent(file)}`);
    res.send('﻿' + lines.map((l) => l.map(cell).join(';')).join('\r\n'));
  });
};
