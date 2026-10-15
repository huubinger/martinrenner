'use strict';
// Voctails × Konzertmeister (nur für den Chorleiter, unter /voctails/intern/termine):
// – Anwesenheitsübersicht: wer hat für welchen Termin zu- oder abgesagt, nach Registern sortiert.
// – Rückmelde-Automatik:
//     Abgelaufene Fristen werden wieder geöffnet, solange sich jemand nicht gemeldet hat
//     (Auftritte bis Terminbeginn, Proben bis Montag 22 Uhr davor).
//     Auftritte: alle 2 Tage erinnern (Konzertmeister schickt nur an die, die sich noch nicht gemeldet haben);
//                nach 5 Erinnerungen ohne vollständige Rückmeldung wird geschlossen.
//     Proben:    am Montag vor der Probe einmal erinnern, Montag 22 Uhr Rückmeldung schließen.
//     Haben sich alle gemeldet, wird die Rückmeldung sofort geschlossen (Frist = jetzt) und nie wieder
//     geöffnet – absagen geht dann nur noch persönlich beim Chorleiter.
// Konzertmeister hat keine offizielle Schnittstelle – genutzt wird dieselbe REST-API wie die Web-App
// (rest.konzertmeister.app), angemeldet mit KM_MAIL / KM_PASSWORD (Railway-Variablen).
const path = require('path');
const fs = require('fs');

const API = 'https://rest.konzertmeister.app/api/';
const ORG_ID = Number(process.env.KM_ORG_ID || 149367); // Verein Voctails
const TYPE_NAMES = { 1: 'Probe', 2: 'Auftritt', 3: 'Sonstiges', 4: 'Probenanfrage', 5: 'Auftrittsanfrage', 6: 'Information' };
const REHEARSAL_TYPES = [1, 4];
const REMIND_EVERY_MS = 48 * 60 * 60 * 1000;
const MAX_REMINDERS = 5; // danach wird die Rückmeldung geschlossen
const TICK_MS = 15 * 60 * 1000;
const MODES = ['aus', 'probelauf', 'an'];

// Datum/Uhrzeit in deutscher Zeit
const berlinFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
});
function berlin(date) {
  const p = Object.fromEntries(berlinFmt.formatToParts(new Date(date)).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute), weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) };
}
function addDays(day, n) {
  const d = new Date(day + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const fmtDay = (date) => new Date(date).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit' });
const fmtDateTime = (date) => new Date(date).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
// Format der Web-App: YYYY-MM-DDTHH:mm:ssZ (dayjs) → z. B. 2026-10-19T20:00:00+00:00
const kmIso = (date) => new Date(date).toISOString().replace(/\.\d{3}Z$/, '+00:00');

// Namen vergleichen: „Jessie Niemann“ (Liste) ↔ „Jessica Niemann“ (Konzertmeister)
const normName = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();

module.exports = function setupVoctailsKm(app, deps) {
  const { DATA_DIR, escapeHtml, hasAccess, isLeiter, loadMembers, registers } = deps;
  const STATE_FILE = path.join(DATA_DIR, 'voctails-km.json');

  function loadState() {
    try {
      const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      if (s && typeof s === 'object') return { mode: 'probelauf', reminded: {}, remindCount: {}, closed: {}, log: [], ...s };
    } catch (e) {}
    return { mode: 'probelauf', reminded: {}, remindCount: {}, closed: {}, log: [] };
  }
  let state = loadState();
  function saveState() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    state.log = state.log.slice(-200);
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  }
  function log(text, extra) {
    state.log.push({ at: Date.now(), text, ...extra });
    console.log('Voctails/Konzertmeister:', text);
  }

  // ---------- Konzertmeister-Sitzung ----------
  const configured = () => !!(process.env.KM_MAIL && process.env.KM_PASSWORD);
  let cookie = '';
  let lastError = '';

  async function login() {
    const res = await fetch(API + 'v5/login/totpaware', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ mail: process.env.KM_MAIL, password: process.env.KM_PASSWORD, totp: null, locale: 'de', timezoneId: 'Europe/Berlin' }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Anmeldung bei Konzertmeister fehlgeschlagen (${res.status})`);
    const set = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    if (!set.length) throw new Error('Konzertmeister hat bei der Anmeldung kein Sitzungs-Cookie geliefert (Zwei-Faktor-Anmeldung aktiv?)');
    cookie = set.map((c) => c.split(';')[0]).join('; ');
  }

  async function km(method, p, body, retry = true) {
    if (!configured()) throw new Error('KM_MAIL / KM_PASSWORD fehlen in Railway');
    if (!cookie) await login();
    const res = await fetch(API + p, {
      method,
      headers: { Accept: 'application/json', Cookie: cookie, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
    if ((res.status === 401 || res.status === 403) && retry) {
      cookie = '';
      return km(method, p, body, false);
    }
    if (!res.ok) throw new Error(`Konzertmeister ${method} ${p.split('?')[0]}: ${res.status}`);
    const text = await res.text();
    try { return text ? JSON.parse(text) : null; } catch (e) { return text; }
  }

  async function upcomingAppointments() {
    const all = [];
    for (let page = 0; page < 10; page++) {
      const list = await km('POST', 'v4/app/getpaged/' + page, { dateMode: 'UPCOMING', sortMode: 'STARTDATE', parentOrgIds: [ORG_ID], settings: [] });
      if (!Array.isArray(list) || !list.length) break;
      all.push(...list);
      if (list.length < 10) break;
    }
    return all.filter((a) => a.active !== false && (!a.org || a.org.id === ORG_ID) && a.typId !== 6);
  }

  const remind = (a) => km('PUT', `v2/app/${a.id}/remind?onlyUnanswered=true`);
  // Frist setzen (wie „Mehrere Termine bearbeiten → Rückmeldefrist und Erinnerung“ in der Web-App)
  const setDeadline = (a, deadline, reminder) => km('POST', 'v4/app/update/batch', {
    appointmentIds: [a.id],
    batchCommand: { commandType: 'SET_APPOINTMENT_REPLY_DEADLINE_REMINDER', deadline: kmIso(deadline), deadlineReminder: kmIso(reminder) },
  });
  // Rückmeldung schließen = Frist auf jetzt. Danach sagt man nur noch persönlich beim Chorleiter ab.
  const closeReplies = (a) => setDeadline(a, Date.now(), Date.now() - 60 * 1000);

  // Montag vor der Probe, 22 Uhr deutscher Zeit
  function rehearsalMonday(a) {
    const startB = berlin(a.start);
    return addDays(startB.day, -(((startB.weekday + 6) % 7) || 7));
  }
  function berlinDate(day, hour) {
    for (const off of [1, 2]) {
      const d = new Date(`${day}T${String(hour - off).padStart(2, '0')}:00:00Z`);
      const b = berlin(d);
      if (b.day === day && b.hour === hour) return d.getTime();
    }
    return new Date(`${day}T${String(hour - 1).padStart(2, '0')}:00:00Z`).getTime();
  }

  // ---------- Regeln ----------
  // Liefert je Termin, was die Automatik jetzt tun würde (ohne es zu tun)
  function planFor(a, now = Date.now()) {
    const st = a.statistics || {};
    const deadline = a.statusDeadline ? new Date(a.statusDeadline).getTime() : 0;
    const open = deadline > now;
    const unanswered = st.numUnanswered || 0;
    const nowB = berlin(now);
    const daytime = nowB.hour >= 9 && nowB.hour < 20;
    const rehearsal = REHEARSAL_TYPES.includes(a.typId);
    const closedByUs = state.closed[a.id];
    if (closedByUs) return { action: null, why: `von der Automatik geschlossen${closedByUs.reason ? ' (' + closedByUs.reason + ')' : ''}` };
    if (!unanswered) return open ? { action: 'close', why: 'alle haben sich gemeldet' } : { action: null, why: 'alle gemeldet, Rückmeldung zu' };
    if (rehearsal) {
      const monday = rehearsalMonday(a);
      const final = berlinDate(monday, 22);
      if (now >= final) return open ? { action: 'close', why: 'Montag 22 Uhr vor der Probe – finale Rückmeldung' } : { action: null, why: 'Rückmeldung zu (Montag 22 Uhr)' };
      if (!open) return { action: 'reopen', deadline: final, reminder: Math.max(now + 5 * 60 * 1000, final - 13 * 60 * 60 * 1000), why: `${unanswered} offen – Frist wieder öffnen bis ${fmtDateTime(final)}` };
      if (nowB.day === monday && nowB.hour >= 9) {
        return state.reminded[a.id] && berlin(state.reminded[a.id]).day === monday
          ? { action: null, why: 'heute schon erinnert, schließt um 22 Uhr' }
          : { action: 'remind', why: `${unanswered} offen – Erinnerung am Montag vor der Probe` };
      }
      return { action: null, why: `${unanswered} offen – Erinnerung am ${fmtDay(monday + 'T12:00:00Z')} um 9 Uhr` };
    }
    const start = new Date(a.start).getTime();
    if (!open) return { action: 'reopen', deadline: start, reminder: Math.max(now + 5 * 60 * 1000, start - 24 * 60 * 60 * 1000), why: `${unanswered} offen – Frist wieder öffnen bis Terminbeginn` };
    const last = state.reminded[a.id] || 0;
    const count = state.remindCount[a.id] || 0;
    if (now - last < REMIND_EVERY_MS) return { action: null, why: `${unanswered} offen – ${count} von ${MAX_REMINDERS} Erinnerungen, nächste ${fmtDateTime(last + REMIND_EVERY_MS)}` };
    if (count >= MAX_REMINDERS) return { action: 'close', why: `${unanswered} ohne Reaktion nach ${MAX_REMINDERS} Erinnerungen` };
    if (!daytime) return { action: null, why: `${unanswered} offen – Erinnerung ab 9 Uhr` };
    return { action: 'remind', why: `${unanswered} offen – Erinnerung ${count + 1} von ${MAX_REMINDERS} (alle 2 Tage)` };
  }

  const ACTION_TEXT = { remind: 'erinnern', close: 'Rückmeldung schließen', reopen: 'Rückmeldefrist wieder öffnen' };
  let running = null;
  async function tick(force = false) {
    if (running) return running;
    running = (async () => {
      state = loadState();
      if (!configured() || (state.mode === 'aus' && !force)) return;
      try {
        const apps = await upcomingAppointments();
        const now = Date.now();
        for (const a of apps) {
          const plan = planFor(a, now);
          if (!plan.action) continue;
          const label = `${TYPE_NAMES[a.typId] || 'Termin'} „${String(a.name || '').trim()}“ (${fmtDay(a.start)})`;
          if (state.mode !== 'an') {
            const key = `${a.id}:${plan.action}:${berlin(now).day}`;
            if (!state.log.slice(-50).some((l) => l.key === key)) log(`Probelauf: würde ${ACTION_TEXT[plan.action]} – ${label}: ${plan.why}`, { key });
            continue;
          }
          if (plan.action === 'remind') {
            await remind(a);
            state.reminded[a.id] = now;
            state.remindCount[a.id] = (state.remindCount[a.id] || 0) + 1;
            log(`Erinnerung verschickt – ${label}: ${plan.why}`);
          } else if (plan.action === 'close') {
            await closeReplies(a);
            state.closed[a.id] = { at: now, reason: plan.why };
            log(`Rückmeldung geschlossen – ${label}: ${plan.why}`);
          } else if (plan.action === 'reopen') {
            await setDeadline(a, plan.deadline, plan.reminder);
            log(`Rückmeldefrist geöffnet – ${label}: ${plan.why}`);
          }
        }
        state.lastRun = now;
        lastError = '';
      } catch (err) {
        lastError = err.message;
        console.error('Voctails/Konzertmeister:', err.message);
      } finally {
        saveState();
      }
    })().finally(() => { running = null; });
    return running;
  }
  if (configured()) {
    setTimeout(() => tick(), 20 * 1000);
    setInterval(() => tick(), TICK_MS);
  }

  // ---------- Übersicht ----------
  let overviewCache = null;
  async function overview(force) {
    if (!force && overviewCache && Date.now() - overviewCache.at < 5 * 60 * 1000) return overviewCache;
    const apps = (await upcomingAppointments()).slice(0, 40);
    const grouped = await Promise.all(apps.map((a) => km('GET', 'v3/att/grouped/' + a.id).catch(() => [])));
    overviewCache = { at: Date.now(), apps, grouped };
    return overviewCache;
  }

  function buildMatrix({ apps, grouped }) {
    // Register aus der eigenen Sängerliste (z. B. Jessie Niemann → Tenor), sonst Register-Gruppe aus Konzertmeister
    const members = loadMembers();
    const byFull = new Map(members.map((m) => [normName(m.name), m]));
    const findMember = (name) => {
      const n = normName(name);
      if (byFull.has(n)) return byFull.get(n);
      const parts = n.split(' ');
      const last = parts[parts.length - 1];
      return members.find((m) => {
        const mp = normName(m.name).split(' ');
        return mp[mp.length - 1] === last && mp[0].slice(0, 3) === parts[0].slice(0, 3);
      });
    };
    const people = new Map();
    grouped.forEach((groups, col) => {
      for (const g of Array.isArray(groups) ? groups : []) {
        for (const u of g.users || []) {
          const id = u.kmUser && u.kmUser.id;
          if (!id) continue;
          if (!people.has(id)) {
            const name = u.kmUser.name || [u.kmUser.firstname, u.kmUser.lastname].filter(Boolean).join(' ');
            const m = findMember(name);
            people.set(id, { id, name, register: (m && m.register) || (g.org && g.org.name) || '–', sort: u.kmUser.userSort || name, cells: {} });
          }
          const att = u.attendance || {};
          people.get(id).cells[col] = att.positive ? 'yes' : att.negative ? 'no' : att.maybe ? 'maybe' : 'open';
          if (att.description) people.get(id).notes = { ...(people.get(id).notes || {}), [col]: att.description };
        }
      }
    });
    const order = [...registers, 'Techniker'];
    const regIndex = (r) => { const i = order.indexOf(r); return i === -1 ? order.length : i; };
    const list = [...people.values()].sort((a, b) => regIndex(a.register) - regIndex(b.register) || a.register.localeCompare(b.register) || a.name.localeCompare(b.name, 'de'));
    const regs = [];
    for (const p of list) {
      let r = regs[regs.length - 1];
      if (!r || r.name !== p.register) regs.push(r = { name: p.register, people: [] });
      r.people.push(p);
    }
    return { apps, regs };
  }

  const CELL = { yes: ['✓', 'zugesagt'], no: ['✗', 'abgesagt'], maybe: ['?', 'vielleicht'], open: ['·', 'keine Rückmeldung'] };

  function renderPage(data, msg) {
    const { apps, regs } = data ? buildMatrix(data) : { apps: [], regs: [] };
    const head = apps.map((a, i) => {
      const plan = planFor(a);
      const deadline = a.statusDeadline ? new Date(a.statusDeadline) : null;
      const open = deadline && deadline.getTime() > Date.now();
      return `<th class="app t${a.typId}" data-tip="${escapeHtml(`${a.name}\n${fmtDateTime(a.start)}\nRückmeldung ${open ? 'bis ' + fmtDateTime(deadline) : 'geschlossen'}\nAutomatik: ${plan.why}`)}">
        <a href="https://web.konzertmeister.app/appointment/${a.id}/invites" target="_blank" rel="noopener">
          <span class="d">${escapeHtml(fmtDay(a.start))}</span><span class="n">${escapeHtml(String(a.name || '').trim())}</span>
          <span class="ty">${TYPE_NAMES[a.typId] || ''}${open ? '' : ' · zu'}</span></a></th>`;
    }).join('');
    const body = regs.map((r) => {
      const sums = apps.map((a, i) => {
        const yes = r.people.filter((p) => p.cells[i] === 'yes').length;
        const inv = r.people.filter((p) => p.cells[i]).length;
        return `<td class="sum${inv && !yes ? ' bad' : ''}">${inv ? `${yes}/${inv}` : ''}</td>`;
      }).join('');
      const rows = r.people.map((p) => `<tr><th class="who">${escapeHtml(p.name)}</th>${apps.map((a, i) => {
        const c = p.cells[i];
        if (!c) return '<td class="na" title="nicht eingeladen">–</td>';
        const note = p.notes && p.notes[i];
        return `<td class="c ${c}${note ? ' note' : ''}" data-tip="${escapeHtml(CELL[c][1] + (note ? ': ' + note : ''))}">${CELL[c][0]}${note ? '<sup>•</sup>' : ''}</td>`;
      }).join('')}</tr>`).join('');
      return `<tbody><tr class="reg"><th>${escapeHtml(r.name)} <small>(${r.people.length})</small></th>${sums}</tr>${rows}</tbody>`;
    }).join('');
    const totals = apps.map((a) => { const s = a.statistics || {}; return `<td class="sum">${s.numPositive || 0}✓ ${s.numNegative || 0}✗${s.numUnanswered ? ` <b>${s.numUnanswered}·</b>` : ''}</td>`; }).join('');
    const logHtml = state.log.slice(-25).reverse().map((l) => `<li><time>${escapeHtml(fmtDateTime(l.at))}</time> ${escapeHtml(l.text)}</li>`).join('') || '<li>Noch nichts passiert.</li>';
    const modeBtn = (m, label) => `<button name="mode" value="${m}" class="${state.mode === m ? 'on' : ''}">${label}</button>`;
    return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Voctails – Termine</title><meta name="robots" content="noindex">
<style>
:root{--bg:#1c0e21;--card:rgba(255,255,255,.06);--line:rgba(255,255,255,.12);--text:#fbf8f2;--muted:rgba(251,248,242,.66);--yellow:#ffd200;--green:#3ecf8e;--red:#ff6b6b;--grey:rgba(255,255,255,.35);color-scheme:dark}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.45 "Avenir Next",Avenir,-apple-system,"Segoe UI",Roboto,sans-serif;padding:16px}
a{color:var(--yellow)}h1{font-size:1.4rem;margin:.2rem 0 .3rem}h2{font-size:1.05rem;margin:1.6rem 0 .5rem}.muted{color:var(--muted)}
.top{display:flex;gap:.8rem;align-items:center;flex-wrap:wrap}.top a.back{text-decoration:none}
.box{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 14px;margin:.8rem 0}
.wrap{overflow:auto;max-height:78vh;border:1px solid var(--line);border-radius:12px}
table{border-collapse:separate;border-spacing:0;font-size:13px}
th,td{border-bottom:1px solid var(--line);padding:4px 6px;text-align:center;white-space:nowrap}
thead th{position:sticky;top:0;background:#2a1530;z-index:2;vertical-align:bottom}
th.who,tr.reg th{position:sticky;left:0;background:#24122a;text-align:left;z-index:1;font-weight:500}
thead th:first-child{left:0;z-index:3}
th.app a{color:var(--text);text-decoration:none;display:flex;flex-direction:column;align-items:center;max-width:92px}
th.app .d{font-weight:700}th.app .n{white-space:normal;font-weight:400;font-size:12px;line-height:1.2;max-height:2.5em;overflow:hidden}
th.app .ty{font-size:11px;color:var(--muted)}th.t2 .d,th.t5 .d{color:var(--yellow)}
tr.reg th,tr.reg td{background:#3a1f43;font-weight:700}tr.reg th{background:#3a1f43}
td.c.yes{color:var(--green);font-weight:700}td.c.no{color:var(--red);font-weight:700}td.c.maybe{color:var(--yellow)}td.c.open{color:var(--grey)}td.na{color:rgba(255,255,255,.15)}
td.sum{font-size:12px}td.sum.bad{color:var(--red)}sup{color:var(--muted)}
.modes{display:flex;gap:.4rem;flex-wrap:wrap;margin:.5rem 0}button{font:inherit;color:var(--text);background:rgba(255,255,255,.08);border:1px solid var(--line);border-radius:999px;padding:.35rem .9rem;cursor:pointer}
button.on{background:var(--yellow);color:#1c0e21;border-color:var(--yellow);font-weight:700}
ul.log{list-style:none;padding:0;margin:0;font-size:13px}ul.log li{padding:3px 0;border-bottom:1px solid var(--line)}ul.log time{color:var(--muted);margin-right:.4rem}
.legend span{margin-right:1rem}
td.c,th.app{cursor:default}td.c.note{cursor:help;background:rgba(255,210,0,.07)}td.c.note sup{color:var(--yellow)}
#tip{position:fixed;z-index:50;max-width:min(320px,90vw);background:#fbf8f2;color:#1c0e21;border-radius:10px;padding:7px 10px;font-size:13px;line-height:1.35;white-space:pre-line;text-align:left;box-shadow:0 6px 24px rgba(0,0,0,.45);pointer-events:none;display:none}.msg{color:var(--yellow)}.err{color:var(--red)}
</style></head><body>
<div class="top"><a class="back" href="/voctails/intern/">← Übe-Player</a><span class="muted">Chorleiter</span></div>
<h1>Voctails – Termine &amp; Rückmeldungen</h1>
${msg ? `<p class="msg">${escapeHtml(msg)}</p>` : ''}
${!configured() ? '<p class="err">Konzertmeister-Zugang fehlt: In Railway (Projekt martinrenner.de) die Variablen <b>KM_MAIL</b> und <b>KM_PASSWORD</b> setzen.</p>' : ''}
${lastError ? `<p class="err">Letzter Fehler: ${escapeHtml(lastError)}</p>` : ''}
<p class="legend muted"><span><b style="color:var(--green)">✓</b> zugesagt</span><span><b style="color:var(--red)">✗</b> abgesagt</span><span>? vielleicht</span><span>· keine Rückmeldung</span><span>– nicht eingeladen</span><span><sup style="color:var(--yellow)">•</sup> mit Begründung (Maus drüber oder antippen)</span></p>
${apps.length ? `<div class="wrap"><table><thead><tr><th class="who">Stand ${data ? escapeHtml(fmtDateTime(data.at)) : ''}</th>${head}</tr></thead>${body}
<tfoot><tr class="reg"><th>Gesamt</th>${totals}</tr></tfoot></table></div>` : (configured() ? '<p class="muted">Keine kommenden Termine gefunden.</p>' : '')}
<p><a href="?neu=1">Neu laden</a></p>

<h2>Rückmelde-Automatik</h2>
<div class="box">
<p class="muted" style="margin:0">Abgelaufene Fristen werden wieder geöffnet, solange jemand fehlt (Auftritte bis Terminbeginn, Proben bis Montag 22 Uhr davor).<br>
Auftritte: alle 2 Tage Erinnerung an alle ohne Rückmeldung (9–20 Uhr); nach 5 Erinnerungen wird geschlossen.<br>
Proben: Montag vor der Probe um 9 Uhr Erinnerung, um 22 Uhr wird die Rückmeldung geschlossen.<br>
Sobald sich alle gemeldet haben, wird die Rückmeldung sofort geschlossen und bleibt zu – absagen dann nur noch persönlich beim Chorleiter.</p>
<form method="POST" action="/voctails/intern/termine/modus" class="modes">${modeBtn('aus', 'Aus')}${modeBtn('probelauf', 'Probelauf (nur protokollieren)')}${modeBtn('an', 'An')}</form>
<form method="POST" action="/voctails/intern/termine/jetzt"><button>Jetzt prüfen</button></form>
<p class="muted">Zuletzt geprüft: ${state.lastRun ? escapeHtml(fmtDateTime(state.lastRun)) : '–'} · prüft alle 15 Minuten</p>
<ul class="log">${logHtml}</ul>
</div>
<div id="tip"></div>
<script>
(() => {
  const tip = document.getElementById('tip');
  let pinned = null;
  const show = (el, x, y) => {
    tip.textContent = el.dataset.tip; tip.style.display = 'block';
    const r = tip.getBoundingClientRect();
    tip.style.left = Math.max(8, Math.min(x + 14, innerWidth - r.width - 8)) + 'px';
    tip.style.top = (y + 16 + r.height > innerHeight ? y - r.height - 10 : y + 16) + 'px';
  };
  const hide = () => { tip.style.display = 'none'; pinned = null; };
  document.addEventListener('mousemove', (e) => {
    if (pinned) return;
    const el = e.target.closest('[data-tip]');
    el ? show(el, e.clientX, e.clientY) : (tip.style.display = 'none');
  });
  document.addEventListener('click', (e) => {
    const el = e.target.closest('td[data-tip]');
    if (!el || el === pinned) return hide();
    pinned = el; show(el, e.clientX, e.clientY);
  });
  document.querySelector('.wrap')?.addEventListener('scroll', hide, { passive: true });
})();
</script>
</body></html>`;
  }

  function requireLeiter(req, res, next) {
    if (hasAccess(req) && isLeiter(req)) return next();
    res.redirect('/voctails/intern/');
  }

  app.get('/voctails/intern/termine', requireLeiter, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    let data = null; let msg = req.query.msg ? String(req.query.msg).slice(0, 200) : '';
    if (configured()) {
      try { data = await overview(!!req.query.neu); } catch (err) { lastError = err.message; }
    }
    state = loadState();
    res.send(renderPage(data, msg));
  });
  app.post('/voctails/intern/termine/modus', requireLeiter, (req, res) => {
    const mode = String((req.body || {}).mode || '');
    if (!MODES.includes(mode)) return res.redirect('/voctails/intern/termine');
    state = loadState();
    state.mode = mode;
    log(`Automatik auf „${mode}“ gestellt`);
    saveState();
    if (mode !== 'aus') tick();
    res.redirect('/voctails/intern/termine?msg=' + encodeURIComponent(`Automatik: ${mode}`));
  });
  app.post('/voctails/intern/termine/jetzt', requireLeiter, async (req, res) => {
    await tick(true);
    overviewCache = null;
    res.redirect('/voctails/intern/termine?msg=' + encodeURIComponent(lastError ? 'Fehler: ' + lastError : 'Geprüft.'));
  });

  return { tick, planFor };
};
