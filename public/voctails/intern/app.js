'use strict';
// Voctails Intern – Übe-Player als App (PWA), nach dem Vorbild des Playback-Tools.
// Name wählen → nur die Tracks der eigenen Stimme (Register aus Konzertmeister) + Gesamtaufnahme,
// Tempo, Wellenform, Cues und Schleifen, Stimme wechseln an derselben Stelle, Offline-Speicher, Geräte-Sync.
(function () {
  const BASE = '/voctails/intern/';
  const MEDIA_CACHE = 'vt-media-v1';
  const LS = {
    lib: 'vt-library',
    me: 'vt-me',
    fav: 'vt-fav',
    saved: 'vt-saved',
    speed: 'vt-speed',
    last: 'vt-last',
    code: 'vt-sync-code',
    codeAck: 'vt-sync-ack',
    marks: 'vt-marks:',
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const lsDel = (k) => { try { localStorage.removeItem(k); } catch (e) {} };
  const lsJson = (k, fallback) => { try { const v = JSON.parse(lsGet(k)); return v == null ? fallback : v; } catch (e) { return fallback; } };

  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function fmt(t) {
    if (!isFinite(t) || t < 0) t = 0;
    return Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
  }
  function fmtBytes(b) {
    if (!b) return '0 MB';
    if (b > 1e9) return (b / 1e9).toFixed(1).replace('.', ',') + ' GB';
    return Math.max(1, Math.round(b / 1e6)) + ' MB';
  }
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  const state = {
    library: null,       // { members, songs }
    offline: false,
    fresh: false,
    cached: new Set(),   // offline gespeicherte Datei-Adressen
    storage: null,
    saving: {},          // slug → Prozent
    showAll: {},         // slug → alle Tracks anzeigen
  };

  // ---------- Wer bin ich? (Name + Register) ----------
  const me = () => lsJson(LS.me, null);
  const VOICE_GROUPS = { Sopran: ['S'], Mezzo: ['M'], Alt: ['A'], Tenor: ['T'], Bass: ['Bar', 'B'], Beatbox: ['Beat'] };
  const REG_ORDER = ['Sopran', 'Mezzo', 'Alt', 'Tenor', 'Bass', 'Beatbox'];

  // Teilt die Tracks eines Lieds auf: eigene Stimme, Gesamt, Weitere
  function splitTracks(song, register) {
    const groups = VOICE_GROUPS[register];
    const all = song.tracks.filter((t) => t.voice.g === 'all');
    if (!groups) return { mine: [], all, rest: song.tracks.filter((t) => t.voice.g !== 'all'), noVoice: false };
    let mine = song.tracks.filter((t) => groups.includes(t.voice.g) || (t.voice.g === 'minus' && t.voice.of === register));
    // Mezzo ohne eigene Mezzo-Tracks: dann meist 2. Sopran bzw. 1. Alt
    if (register === 'Mezzo' && !mine.some((t) => t.voice.g === 'M')) {
      const alt = song.tracks.filter((t) => (t.voice.g === 'S' && t.voice.n === 2) || (t.voice.g === 'A' && t.voice.n === 1));
      const loose = song.tracks.filter((t) => (t.voice.g === 'S' || t.voice.g === 'A') && !t.voice.n);
      mine = mine.concat(alt.length ? alt : loose);
    }
    const fav = lsJson(LS.fav, {})[song.slug];
    const rank = (t) => ['S', 'M', 'A', 'T', 'Bar', 'B', 'minus'].indexOf(t.voice.g) * 10 + (t.voice.n || 0) + (t.sub ? 5 : 0);
    mine.sort((a, b) => (b.id === fav) - (a.id === fav) || rank(a) - rank(b));
    const used = new Set([...mine, ...all].map((t) => t.id));
    return { mine, all, rest: song.tracks.filter((t) => !used.has(t.id)), noVoice: !mine.length };
  }

  // Reihenfolge für Weiter/Zurück im Player: eigene Stimme, Gesamt, dann (falls angezeigt) die übrigen
  function queueFor(song) {
    const r = me() ? me().register : '';
    const s = splitTracks(song, r);
    const showRest = state.showAll[song.slug] || !VOICE_GROUPS[r] || s.noVoice;
    return [...s.mine, ...s.all, ...(showRest ? s.rest : [])];
  }

  const findSong = (slug) => state.library && state.library.songs.find((s) => s.slug === slug);

  // ---------- Bibliothek & Offline-Speicher ----------
  async function loadLibrary() {
    try {
      const r = await fetch('/api/voctails/library', { cache: 'no-store', credentials: 'same-origin' });
      if (r.status === 401) return 'login';
      const body = await r.json();
      if (!body.ok) throw new Error(body.error);
      state.library = { members: body.members, songs: body.songs };
      lsSet(LS.lib, JSON.stringify(state.library));
      state.offline = false;
      state.fresh = true;
    } catch (e) {
      state.library = lsJson(LS.lib, null);
      state.offline = true;
      if (!state.library) return 'error';
    }
    await refreshCached();
    return 'ok';
  }

  async function refreshCached() {
    state.cached = new Set();
    if (!('caches' in window)) return;
    const cache = await caches.open(MEDIA_CACHE);
    let bytes = 0;
    let count = 0;
    for (const req of await cache.keys()) {
      const p = new URL(req.url).pathname;
      state.cached.add(p);
      if (p.startsWith(BASE + 'file/')) {
        const res = await cache.match(req);
        bytes += Number(res && res.headers.get('Content-Length')) || 0;
        if (!/\.pdf$/i.test(p)) count++;
      }
    }
    let available = null;
    let persisted = false;
    try { const e = await navigator.storage.estimate(); available = Math.max(0, e.quota - e.usage); } catch (e) {}
    try { persisted = await navigator.storage.persisted(); } catch (e) {}
    state.storage = { bytes, count, available, persisted };
  }

  const savedSlugs = () => lsJson(LS.saved, []);
  const isSaved = (song) => savedSlugs().includes(song.slug);
  // Offline gespeichert werden die eigenen Tracks + Gesamt + Noten (bzw. alles, wenn kein Register gewählt ist)
  function offlineFiles(song) {
    const r = me() ? me().register : '';
    const s = splitTracks(song, r);
    const tracks = VOICE_GROUPS[r] && !s.noVoice ? [...s.mine, ...s.all] : song.tracks;
    const files = tracks.map((t) => ({ url: t.url, size: t.size || 0 }));
    tracks.forEach((t) => files.push({ url: BASE + 'peaks/' + t.id, size: 0 }));
    if (song.pdf) files.push({ url: song.pdf.url, size: 0 });
    return files;
  }
  const missingFiles = (song) => offlineFiles(song).filter((f) => !state.cached.has(decodeURI(f.url)) && !state.cached.has(f.url));

  async function saveSongs(songs, silent) {
    if (!('caches' in window)) {
      if (!silent) alert('Dieser Browser kann nichts offline speichern. Bitte Safari, Chrome, Edge oder Firefox verwenden.');
      return;
    }
    try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) {}
    lsSet(LS.saved, JSON.stringify([...new Set([...savedSlugs(), ...songs.map((s) => s.slug)])]));
    const cache = await caches.open(MEDIA_CACHE);
    for (const song of songs) {
      if (song.slug in state.saving) continue;
      const missing = missingFiles(song);
      if (!missing.length) continue;
      const total = missing.reduce((a, f) => a + f.size, 0) || 1;
      let loaded = 0;
      state.saving[song.slug] = 0;
      updateSaveUi(song);
      try {
        for (const f of missing) {
          const r = await fetch(f.url, { cache: 'no-store', credentials: 'same-origin' });
          if (!r.ok) {
            if (f.url.includes('/peaks/')) continue; // Wellenform ist optional
            throw new Error('Server antwortet mit ' + r.status);
          }
          const type = r.headers.get('Content-Type') || 'audio/mpeg';
          const reader = r.body.getReader();
          const chunks = [];
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            loaded += value.length;
            state.saving[song.slug] = Math.min(99, Math.round((loaded / total) * 100));
            updateSaveUi(song);
          }
          const blob = new Blob(chunks, { type });
          await cache.put(f.url, new Response(blob, { headers: { 'Content-Type': type, 'Content-Length': String(blob.size) } }));
          state.cached.add(decodeURI(f.url));
        }
      } catch (e) {
        delete state.saving[song.slug];
        const msg = e.name === 'QuotaExceededError' ? 'Auf dem Gerät ist nicht genug Speicherplatz frei.' : e.message;
        if (!silent) alert('Speichern fehlgeschlagen: ' + msg);
        break;
      }
      delete state.saving[song.slug];
      updateSaveUi(song);
    }
    await refreshCached();
    render();
  }

  async function removeSong(song) {
    lsSet(LS.saved, JSON.stringify(savedSlugs().filter((s) => s !== song.slug)));
    const keep = new Set();
    state.library.songs.filter(isSaved).forEach((s) => offlineFiles(s).forEach((f) => keep.add(f.url)));
    const cache = await caches.open(MEDIA_CACHE);
    for (const f of offlineFiles(song)) if (!keep.has(f.url)) await cache.delete(f.url);
    await refreshCached();
    render();
  }

  // Gespeicherte Lieder automatisch um neue Tracks ergänzen, Dateien gelöschter Tracks entfernen
  async function syncSaved() {
    if (state.offline || !state.fresh || !('caches' in window)) return;
    const saved = state.library.songs.filter(isSaved);
    const known = new Set();
    state.library.songs.forEach((s) => {
      s.tracks.forEach((t) => { known.add(decodeURI(t.url)); known.add(BASE + 'peaks/' + t.id); });
      if (s.pdf) known.add(decodeURI(s.pdf.url));
    });
    const cache = await caches.open(MEDIA_CACHE);
    for (const req of await cache.keys()) {
      const p = decodeURI(new URL(req.url).pathname);
      if (!known.has(p)) await cache.delete(req);
    }
    await refreshCached();
    const todo = saved.filter((s) => missingFiles(s).length);
    if (todo.length) saveSongs(todo, true);
  }

  // ---------- Installation als App ----------
  let installPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; render(); });
  window.addEventListener('appinstalled', () => { installPrompt = null; render(); });
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  function installHtml() {
    if (standalone()) return '';
    if (installPrompt) return `<div class="card install"><div><b>Als App installieren</b><br>Direkt vom Home-Bildschirm starten – auch offline in der Probe.</div><button class="btn primary" id="install-btn">Installieren</button></div>`;
    if (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
      return `<div class="card install"><div><b>Als App installieren</b><br>In Safari auf <b>Teilen</b> <svg class="inline" viewBox="0 0 24 24"><path d="M12 3v12M8 7l4-4 4 4M5 11v9h14v-9"/></svg> tippen und <b>„Zum Home-Bildschirm“</b> wählen.</div></div>`;
    }
    if (/Android/.test(navigator.userAgent)) {
      return `<div class="card install"><div><b>Als App installieren</b><br>Im Chrome-Menü <b>⋮</b> → <b>„App installieren“</b> bzw. <b>„Zum Startbildschirm hinzufügen“</b>.</div></div>`;
    }
    return '';
  }

  // ---------- Ansichten ----------
  const view = $('#view');
  let route = { name: 'home' };

  function parseRoute() {
    const m = location.hash.match(/^#\/lied\/([^/?]+)/);
    if (m) return { name: 'song', slug: decodeURIComponent(m[1]) };
    if (location.hash === '#/name') return { name: 'name' };
    return { name: 'home' };
  }

  function setTop(title, back) {
    $('#top-title').textContent = title || '';
    $('#back').hidden = !back;
    const m = me();
    const chip = $('#me-chip');
    chip.hidden = !m || route.name === 'name' || route.name === 'login';
    if (m) chip.innerHTML = `<span class="me-dot reg-${esc((m.register || 'alle').toLowerCase())}"></span><span class="me-name">${esc(m.name.split(' ')[0])}</span>`;
  }

  function render() {
    if (!state.library) return;
    route = parseRoute();
    if (!me() && route.name !== 'name') route = { name: 'name' };
    if (route.name === 'name') return renderNamePicker();
    if (route.name === 'song') {
      const song = findSong(route.slug);
      if (song) return renderSong(song);
    }
    renderHome();
  }

  function renderLogin(error) {
    route = { name: 'login' };
    setTop('', false);
    view.innerHTML = `<div class="center">
      <img class="hero-logo" src="/voctails/img/logo-weiss.png" alt="Voctails" width="160" height="153">
      <h1>Übe-Tracks &amp; Noten</h1>
      <p class="muted">Nur für die Sängerinnen und Sänger der Voctails.</p>
      <form class="login" novalidate>
        <input type="password" autocomplete="current-password" placeholder="Passwort" aria-label="Passwort">
        <button class="btn primary" type="submit">Weiter</button>
      </form>
      <p class="login-msg" aria-live="polite">${esc(error || '')}</p>
    </div>`;
    const form = $('form', view);
    const input = $('input', form);
    const msg = $('.login-msg', view);
    input.focus();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!input.value.trim()) { msg.textContent = 'Bitte das Passwort eingeben.'; return; }
      try {
        const r = await fetch('/api/voctails/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ password: input.value }),
        });
        const body = await r.json();
        if (!body.ok) { msg.textContent = body.error || 'Das Passwort stimmt leider nicht.'; input.select(); return; }
        start();
      } catch (err) {
        msg.textContent = 'Anmeldung fehlgeschlagen. Bitte später erneut versuchen.';
      }
    });
  }

  function renderNamePicker() {
    setTop('', !!me());
    const members = state.library.members || [];
    const groups = REG_ORDER.map((r) => ({ r, list: members.filter((m) => m.register === r) })).filter((g) => g.list.length);
    const noReg = members.filter((m) => !REG_ORDER.includes(m.register));
    const cur = me();
    const btn = (m) => `<button class="name-btn${cur && cur.name === m.name ? ' on' : ''}" data-name="${esc(m.name)}" data-reg="${esc(m.register || '')}">${esc(m.name)}</button>`;
    view.innerHTML = `<div class="wrap">
      <h1>Wer bist du?</h1>
      <p class="muted">Dann zeigt dir der Player bei jedem Lied gleich die Tracks deiner Stimme. Du kannst das jederzeit oben rechts ändern.</p>
      <input class="search" type="search" id="name-search" placeholder="Name suchen …" aria-label="Name suchen">
      ${groups.map((g) => `<section class="reg-group" data-reg="${esc(g.r)}"><h2><span class="me-dot reg-${g.r.toLowerCase()}"></span>${esc(g.r)}</h2><div class="names">${g.list.map(btn).join('')}</div></section>`).join('')}
      ${noReg.length ? `<section class="reg-group"><h2>Ohne Register</h2><div class="names">${noReg.map(btn).join('')}</div></section>` : ''}
      <section class="reg-group"><h2>Nicht dabei?</h2><div class="names">
        ${REG_ORDER.slice(0, 5).map((r) => `<button class="name-btn ghost" data-name="Gast" data-reg="${r}">Gast · ${r}</button>`).join('')}
        <button class="name-btn ghost" data-name="Gast" data-reg="">Alle Tracks anzeigen</button>
      </div></section>
    </div>`;
    view.addEventListener('click', onNameClick);
    $('#name-search').addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      view.querySelectorAll('.name-btn').forEach((b) => { b.hidden = q && !b.textContent.toLowerCase().includes(q); });
      view.querySelectorAll('.reg-group').forEach((g) => { g.hidden = q && ![...g.querySelectorAll('.name-btn')].some((b) => !b.hidden); });
    });
  }
  function onNameClick(e) {
    const b = e.target.closest('.name-btn');
    if (!b || route.name !== 'name') return;
    view.removeEventListener('click', onNameClick);
    lsSet(LS.me, JSON.stringify({ name: b.dataset.name, register: b.dataset.reg }));
    toast(b.dataset.reg ? `Hallo ${b.dataset.name.split(' ')[0]} – du siehst jetzt die Tracks für ${b.dataset.reg}.` : 'Du siehst alle Tracks.');
    if (location.hash === '#/name') history.back();
    else render();
    setTimeout(render, 50);
  }

  function voiceChips(song) {
    const r = me() ? me().register : '';
    const s = splitTracks(song, r);
    const list = VOICE_GROUPS[r] && !s.noVoice ? s.mine : [];
    const labels = [...new Set(list.map((t) => t.voiceLabel).filter(Boolean))];
    return labels.slice(0, 5).map((l) => `<span class="chip">${esc(l)}</span>`).join('');
  }

  function saveBtnHtml(song) {
    const pct = state.saving[song.slug];
    if (pct !== undefined) return `<span class="saved-state busy" data-save="${esc(song.slug)}">${pct} %</span>`;
    if (isSaved(song) && !missingFiles(song).length) return '<span class="saved-state ok" title="Offline gespeichert"><svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg></span>';
    return '';
  }

  function updateSaveUi(song) {
    const pct = state.saving[song.slug];
    document.querySelectorAll(`[data-save="${CSS.escape(song.slug)}"]`).forEach((el) => {
      if (pct !== undefined) el.textContent = el.classList.contains('btn') ? `Wird gespeichert … ${pct} %` : pct + ' %';
    });
    const all = $('#save-all');
    if (all && Object.keys(state.saving).length) {
      const done = state.library.songs.filter((s) => isSaved(s) && !missingFiles(s).length && !(s.slug in state.saving)).length;
      all.textContent = `Wird gespeichert … ${done} von ${savedSlugs().length} Liedern`;
      all.disabled = true;
    }
  }

  function storageHtml() {
    const st = state.storage;
    if (!st) return '';
    const todo = state.library.songs.filter((s) => !isSaved(s) || missingFiles(s).length);
    const todoSize = todo.reduce((a, s) => a + missingFiles(s).reduce((b, f) => b + f.size, 0), 0);
    const busy = Object.keys(state.saving).length;
    return `<div class="card storage">
      <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 14h18M7 17h.01"/></svg>
      <div class="grow"><b>Offline auf diesem Gerät</b><br>
        ${st.count ? `${st.count} Tracks · ${fmtBytes(st.bytes)}` : 'Noch nichts gespeichert.'}
        ${st.available !== null ? `<span class="muted"> · noch ca. ${fmtBytes(st.available)} frei</span>` : ''}
        ${todo.length && !state.offline ? `<br><button class="btn small primary" id="save-all"${busy ? ' disabled' : ''}>${busy ? 'Wird gespeichert …' : `Alle meine Tracks speichern (${todo.length} ${todo.length === 1 ? 'Lied' : 'Lieder'}, ca. ${fmtBytes(todoSize)})`}</button>` : ''}
      </div>
    </div>`;
  }

  function syncHtml() {
    const code = lsGet(LS.code);
    return `<div class="card sync">
      <svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4"/></svg>
      <div class="grow"><b>Cues auf allen Geräten</b><br>
        ${code ? `Dein Sync-Code: <b class="mono">${esc(code)}</b> <span class="muted">– aufschreiben, damit holst du deine Cues auf Handy, Tablet und Computer.</span>` : '<span class="muted">Sobald du den ersten Cue setzt, bekommst du einen Code aus drei Wörtern. Hast du schon einen?</span>'}
        <br><button class="btn small ghost" id="sync-open">${code ? 'Code ändern' : 'Code eingeben'}</button>
      </div>
    </div>`;
  }

  function renderHome() {
    setTop('', false);
    const m = me();
    const songs = state.library.songs;
    const q = (renderHome.q || '').toLowerCase();
    view.innerHTML = `<div class="wrap">
      <div class="hello">
        <h1>Hallo ${esc(m.name === 'Gast' ? '' : m.name.split(' ')[0])}${m.name === 'Gast' ? 'und willkommen' : ''}!</h1>
        <p class="muted">${m.register ? `Du siehst bei jedem Lied zuerst deine Stimme (<b>${esc(m.register)}</b>) und die Gesamtaufnahme.` : 'Du siehst alle Tracks.'} <a href="#/name">Ändern</a></p>
      </div>
      ${state.offline ? '<div class="card warn">Offline – du siehst die gespeicherten Lieder.</div>' : ''}
      <input class="search" type="search" id="song-search" placeholder="Lied suchen …" aria-label="Lied suchen" value="${esc(renderHome.q || '')}">
      <ul class="songs">${songs.map((s) => {
        const avail = !state.offline || (isSaved(s) && !missingFiles(s).length);
        return `<li${q && !s.title.toLowerCase().includes(q) ? ' hidden' : ''}><a class="song${avail ? '' : ' unavailable'}" href="#/lied/${encodeURIComponent(s.slug)}">
          <span class="song-title">${esc(s.title)}</span>
          <span class="song-meta">${voiceChips(s)}${s.pdf ? '<span class="chip ghost">Noten</span>' : ''}</span>
          ${saveBtnHtml(s)}
          <svg class="arrow" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>
        </a></li>`;
      }).join('')}</ul>
      ${storageHtml()}
      ${installHtml()}
      ${syncHtml()}
      <p class="note">Noten und Übe-Tracks sind nur zum persönlichen Üben für die Sängerinnen und Sänger der Voctails bestimmt. Weitergabe oder Veröffentlichung ist nicht gestattet.</p>
    </div>`;
    $('#song-search').addEventListener('input', (e) => {
      renderHome.q = e.target.value;
      const qq = e.target.value.trim().toLowerCase();
      view.querySelectorAll('.songs li').forEach((li) => { li.hidden = qq && !li.textContent.toLowerCase().includes(qq); });
    });
    const saveAll = $('#save-all');
    if (saveAll) saveAll.addEventListener('click', () => saveSongs(songs.filter((s) => !isSaved(s) || missingFiles(s).length)));
    bindCommon();
  }

  function bindCommon() {
    const ib = $('#install-btn');
    if (ib) ib.addEventListener('click', async () => { installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; render(); });
    const so = $('#sync-open');
    if (so) so.addEventListener('click', openSyncDialog);
  }

  function trackRow(t, song, opts) {
    const playing = player.track && player.track.id === t.id;
    const off = state.offline && !state.cached.has(decodeURI(t.url));
    return `<li><button class="track${playing ? ' current' : ''}${off ? ' unavailable' : ''}" data-track="${esc(t.id)}">
      <span class="t-voice">${esc(t.voiceLabel || '♪')}</span>
      <span class="t-name">${esc(t.label)}${t.sub ? `<small>${esc(t.sub)}</small>` : ''}</span>
      ${state.cached.has(decodeURI(t.url)) ? '<svg class="t-off" viewBox="0 0 24 24" aria-label="offline gespeichert"><path d="M5 12l5 5 9-10"/></svg>' : ''}
      ${opts && opts.star ? `<span class="star${opts.fav ? ' on' : ''}" data-star="${esc(t.id)}" role="button" aria-label="Als meine Stimme merken" title="Als meine Stimme merken – steht dann immer oben">★</span>` : ''}
    </button></li>`;
  }

  function renderSong(song) {
    setTop(song.title, true);
    const r = me() ? me().register : '';
    const s = splitTracks(song, r);
    const fav = lsJson(LS.fav, {})[song.slug];
    const hasReg = !!VOICE_GROUPS[r];
    const showAll = state.showAll[song.slug] || !hasReg || s.noVoice;
    const saved = isSaved(song) && !missingFiles(song).length;
    const pct = state.saving[song.slug];
    view.innerHTML = `<div class="wrap">
      <h1 class="song-h">${esc(song.title)}</h1>
      <div class="song-actions">
        ${song.pdf ? `<a class="btn" href="${esc(song.pdf.url)}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 13h6M9 17h6"/></svg> Noten</a>` : ''}
        ${pct !== undefined ? `<button class="btn" disabled data-save="${esc(song.slug)}">Wird gespeichert … ${pct} %</button>`
          : saved ? '<button class="btn ghost" id="song-unsave"><svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg> Offline gespeichert</button>'
          : state.offline ? '' : '<button class="btn" id="song-save"><svg viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg> Offline speichern</button>'}
      </div>
      ${hasReg && !s.noVoice ? `<h2 class="sub">Deine Stimme · ${esc(r)}</h2><ul class="tracks">${s.mine.map((t) => trackRow(t, song, { star: s.mine.length > 1, fav: t.id === fav })).join('')}</ul>` : ''}
      ${hasReg && s.noVoice ? `<p class="card warn">Für ${esc(r)} gibt es bei diesem Lied keinen eigenen Track – hier sind alle.</p>` : ''}
      ${s.all.length ? `<h2 class="sub">Gesamt</h2><ul class="tracks">${s.all.map((t) => trackRow(t, song)).join('')}</ul>` : ''}
      ${s.rest.length ? (showAll
        ? `<h2 class="sub">${hasReg && !s.noVoice ? 'Weitere Stimmen' : 'Tracks'}</h2><ul class="tracks">${s.rest.map((t) => trackRow(t, song)).join('')}</ul>${hasReg && !s.noVoice ? '<button class="btn small ghost" id="show-less">Nur meine Stimme</button>' : ''}`
        : `<button class="btn small ghost more" id="show-all">Alle Stimmen anzeigen (${s.rest.length} weitere)</button>`) : ''}
      ${!song.tracks.length ? '<p class="muted">Zu diesem Lied gibt es noch keine Übe-Tracks.</p>' : ''}
    </div>`;
    view.onclick = (e) => {
      const star = e.target.closest('[data-star]');
      if (star) {
        e.stopPropagation();
        const favs = lsJson(LS.fav, {});
        if (favs[song.slug] === star.dataset.star) delete favs[song.slug];
        else favs[song.slug] = star.dataset.star;
        lsSet(LS.fav, JSON.stringify(favs));
        renderSong(song);
        return;
      }
      const tb = e.target.closest('[data-track]');
      if (tb) {
        const t = song.tracks.find((x) => x.id === tb.dataset.track);
        if (t) playTrack(song, t, { open: true, autoplay: true });
      }
    };
    const sa = $('#show-all');
    if (sa) sa.addEventListener('click', () => { state.showAll[song.slug] = true; renderSong(song); });
    const sl = $('#show-less');
    if (sl) sl.addEventListener('click', () => { state.showAll[song.slug] = false; renderSong(song); });
    const save = $('#song-save');
    if (save) save.addEventListener('click', () => saveSongs([song]));
    const unsave = $('#song-unsave');
    if (unsave) unsave.addEventListener('click', () => { if (confirm('Offline-Kopie dieses Lieds vom Gerät löschen?')) removeSong(song); });
  }

  $('#back').addEventListener('click', () => {
    if (history.length > 1 && location.hash) history.back();
    else location.hash = '#/';
  });
  $('#me-chip').addEventListener('click', () => { location.hash = '#/name'; });
  window.addEventListener('hashchange', () => { view.onclick = null; render(); window.scrollTo(0, 0); });

  // ---------- Player ----------
  const audio = new Audio();
  audio.preload = 'auto';
  audio.preservesPitch = true;
  audio.mozPreservesPitch = true;
  audio.webkitPreservesPitch = true;
  const player = { song: null, track: null, queue: [], marks: null, pendingLoopStart: null, peaks: null, editing: false };
  let speed = Number(lsGet(LS.speed)) || 1;

  function playTrack(song, track, opts = {}) {
    const keepTime = opts.keepTime;
    player.song = song;
    player.track = track;
    player.queue = queueFor(song);
    if (!player.queue.includes(track)) player.queue.push(track);
    player.marks = readMarks(track.url);
    player.pendingLoopStart = null;
    player.editing = false;
    player.peaks = null;
    const wasPlaying = !audio.paused;
    audio.src = track.url;
    audio.playbackRate = speed;
    audio.defaultPlaybackRate = speed;
    const startAt = keepTime != null ? keepTime : opts.time || 0;
    const autoplay = opts.autoplay || (keepTime != null && wasPlaying);
    if (startAt) {
      // Erst an die Stelle springen, dann abspielen (sonst bricht der Browser das Springen ab)
      audio.addEventListener('loadedmetadata', () => {
        audio.currentTime = Math.min(startAt, (audio.duration || startAt + 1) - 0.2);
        if (autoplay && player.track === track) audio.addEventListener('seeked', playAudio, { once: true });
      }, { once: true });
    } else if (autoplay) playAudio();
    loadPeaks(track);
    renderPlayer();
    if (opts.open) openPlayer();
    $('#mini').hidden = false;
    document.body.classList.add('has-mini');
    lsSet(LS.last, JSON.stringify({ slug: song.slug, id: track.id, t: startAt }));
    updateMediaSession();
    if (route.name === 'song') document.querySelectorAll('.track').forEach((b) => b.classList.toggle('current', b.dataset.track === track.id));
  }

  function playAudio() {
    const p = audio.play();
    if (p && p.catch) p.catch(() => {});
  }
  function togglePlay() {
    if (!player.track) return;
    if (audio.paused) playAudio();
    else audio.pause();
  }
  function seekTo(t) {
    const d = audio.duration || (player.peaks && player.peaks.duration) || 0;
    audio.currentTime = Math.max(0, d ? Math.min(t, d - 0.05) : t);
    updateTime();
  }
  function step(delta) {
    if (!player.track) return;
    seekTo(audio.currentTime + delta * Math.max(1, speed));
  }
  function nextTrack(dir) {
    if (!player.track) return;
    const i = player.queue.indexOf(player.track);
    const n = player.queue[i + dir];
    if (n) playTrack(player.song, n, { autoplay: !audio.paused });
  }

  function openPlayer() {
    document.body.classList.add('player-open');
    $('#player').setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => { sizeCanvas(); drawWave(); });
  }
  function closePlayer() {
    document.body.classList.remove('player-open');
    $('#player').setAttribute('aria-hidden', 'true');
  }

  function renderPlayer() {
    const t = player.track;
    if (!t) return;
    $('#p-song').textContent = player.song.title;
    $('#p-track').textContent = t.label + (t.sub ? ' · ' + t.sub : '');
    $('#m-title').textContent = player.song.title;
    $('#m-sub').textContent = t.voiceLabel ? t.voiceLabel + ' · ' + t.label : t.label;
    const pdf = $('#p-pdf');
    pdf.hidden = !player.song.pdf;
    if (player.song.pdf) pdf.href = player.song.pdf.url;
    // Schnell zwischen eigener Stimme und Gesamt wechseln – an derselben Stelle
    // Gleiche Stimme mehrfach (z. B. „M2“ und „Mezzo2“ aus dem Vocals-Ordner): dann den Dateinamen zeigen
    const counts = {};
    player.queue.forEach((q) => { counts[q.voiceLabel] = (counts[q.voiceLabel] || 0) + 1; });
    const chipText = (q) => (q.voiceLabel && counts[q.voiceLabel] === 1 ? q.voiceLabel : q.label);
    $('#p-voices').innerHTML = player.queue.length > 1
      ? player.queue.map((q) => `<button class="voice${q === t ? ' on' : ''}" data-voice="${esc(q.id)}" title="${esc(q.label + (q.sub ? ' · ' + q.sub : ''))}">${esc(chipText(q))}</button>`).join('')
      : '';
    const on = $('#p-voices .voice.on');
    if (on) on.scrollIntoView({ block: 'nearest', inline: 'center' });
    $('#p-prev').disabled = player.queue.indexOf(t) <= 0;
    $('#p-next').disabled = player.queue.indexOf(t) >= player.queue.length - 1;
    renderSpeed();
    renderCues();
    syncPlayState();
    updateTime();
  }

  $('#p-voices').addEventListener('click', (e) => {
    const b = e.target.closest('[data-voice]');
    if (!b || !player.track || b.dataset.voice === player.track.id) return;
    const t = player.queue.find((q) => q.id === b.dataset.voice);
    if (t) playTrack(player.song, t, { keepTime: audio.currentTime });
  });

  function syncPlayState() {
    const playing = !audio.paused;
    document.body.classList.toggle('is-playing', playing);
    $('#p-play').setAttribute('aria-label', playing ? 'Pause' : 'Abspielen');
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
  }

  function duration() {
    return (isFinite(audio.duration) && audio.duration) || (player.peaks && player.peaks.duration) || 0;
  }

  let lastSave = 0;
  function updateTime() {
    const d = duration();
    const t = audio.currentTime || 0;
    $('#p-cur').textContent = fmt(t);
    $('#p-dur').textContent = fmt(d);
    $('#m-bar').style.width = d ? (t / d) * 100 + '%' : '0';
    $('#p-wave').setAttribute('aria-valuenow', d ? String(Math.round((t / d) * 100)) : '0');
    drawWave();
    if (Date.now() - lastSave > 3000 && player.track) {
      lastSave = Date.now();
      lsSet(LS.last, JSON.stringify({ slug: player.song.slug, id: player.track.id, t }));
    }
  }

  function checkLoop() {
    const m = player.marks;
    if (!m || !m.loop || m.a === null || m.b === null || m.b <= m.a) return;
    if (audio.currentTime >= m.b || audio.currentTime < m.a - 0.5) {
      audio.currentTime = m.a;
    }
  }

  let raf = null;
  function tick() {
    checkLoop();
    updateTime();
    raf = audio.paused ? null : requestAnimationFrame(tick);
  }
  audio.addEventListener('play', () => { syncPlayState(); if (!raf) raf = requestAnimationFrame(tick); wake(true); });
  audio.addEventListener('pause', () => { syncPlayState(); updateTime(); wake(false); });
  audio.addEventListener('loadedmetadata', updateTime);
  audio.addEventListener('timeupdate', () => { if (audio.paused) updateTime(); else checkLoop(); });
  audio.addEventListener('ended', () => {
    const m = player.marks;
    if (m && m.loop && m.a !== null && m.b !== null) { audio.currentTime = m.a; playAudio(); return; }
    syncPlayState();
  });
  audio.addEventListener('error', () => {
    if (!player.track) return;
    toast(state.offline ? 'Dieser Track ist nicht offline gespeichert.' : 'Der Track konnte nicht geladen werden.');
  });

  // Bildschirm bleibt an, solange abgespielt wird (Noten lesen)
  let wakeLock = null;
  async function wake(on) {
    if (!('wakeLock' in navigator)) return;
    try {
      if (on && !wakeLock && document.visibilityState === 'visible') {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      } else if (!on && wakeLock) {
        wakeLock.release();
        wakeLock = null;
      }
    } catch (e) {}
  }
  document.addEventListener('visibilitychange', () => { if (!audio.paused) wake(true); });

  $('#p-play').addEventListener('click', togglePlay);
  $('#m-play').addEventListener('click', (e) => { e.stopPropagation(); togglePlay(); });
  $('#mini').addEventListener('click', openPlayer);
  $('#p-close').addEventListener('click', closePlayer);
  $('#p-back').addEventListener('click', () => step(-5));
  $('#p-fwd').addEventListener('click', () => step(5));
  $('#p-prev').addEventListener('click', () => nextTrack(-1));
  $('#p-next').addEventListener('click', () => nextTrack(1));

  // Player per Wischen nach unten schließen (Handy)
  (function () {
    const head = $('.p-head');
    let y0 = null;
    head.addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY; }, { passive: true });
    head.addEventListener('touchend', (e) => {
      if (y0 !== null && e.changedTouches[0].clientY - y0 > 60) closePlayer();
      y0 = null;
    });
  })();

  // ---------- Tempo ----------
  function renderSpeed() {
    const pct = Math.round(speed * 100);
    $('#p-speed').value = pct;
    $('#p-speed-value').textContent = pct === 100 ? 'Originaltempo' : pct + ' %';
    $('#p-speed').style.setProperty('--fill', ((pct - 50) / 60) * 100 + '%');
    const ms = $('#m-speed');
    ms.hidden = pct === 100;
    ms.textContent = pct + ' %';
  }
  function setSpeed(s) {
    speed = Math.max(0.5, Math.min(1.1, s));
    audio.playbackRate = speed;
    audio.defaultPlaybackRate = speed;
    lsSet(LS.speed, String(speed));
    renderSpeed();
  }
  $('#p-speed').addEventListener('input', (e) => setSpeed(Number(e.target.value) / 100));
  $('#p-speed-reset').addEventListener('click', () => setSpeed(1));

  // ---------- Wellenform ----------
  const canvas = $('#p-canvas');
  const ctx = canvas.getContext('2d');
  function sizeCanvas() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
  }
  window.addEventListener('resize', () => { sizeCanvas(); drawWave(); });

  async function loadPeaks(track) {
    try {
      const r = await fetch(BASE + 'peaks/' + track.id, { credentials: 'same-origin' });
      if (!r.ok) throw new Error();
      const data = await r.json();
      if (player.track === track) { player.peaks = data; drawWave(); updateTime(); }
    } catch (e) {
      if (player.track === track) { player.peaks = null; drawWave(); }
    }
  }

  function drawWave() {
    if (!document.body.classList.contains('player-open') || !canvas.width) return;
    const w = canvas.width;
    const h = canvas.height;
    const dpr = w / (canvas.getBoundingClientRect().width || 1);
    ctx.clearRect(0, 0, w, h);
    const d = duration();
    const pos = d ? (audio.currentTime || 0) / d : 0;
    const m = player.marks;
    // Schleifenbereich
    if (m && d && m.a !== null) {
      const xa = (m.a / d) * w;
      const xb = m.b !== null ? (m.b / d) * w : xa + 2 * dpr;
      ctx.fillStyle = m.loop ? 'rgba(255,210,0,0.16)' : 'rgba(255,255,255,0.08)';
      ctx.fillRect(xa, 0, Math.max(2 * dpr, xb - xa), h);
    }
    const peaks = player.peaks && player.peaks.peaks;
    const bars = Math.max(40, Math.floor(w / (4 * dpr)));
    const bw = w / bars;
    for (let i = 0; i < bars; i++) {
      let v = 0.18;
      if (peaks && peaks.length) {
        const from = Math.floor((i / bars) * peaks.length);
        const to = Math.max(from + 1, Math.floor(((i + 1) / bars) * peaks.length));
        v = 0;
        for (let k = from; k < to; k++) v = Math.max(v, peaks[k] || 0);
        v = Math.max(0.04, v / 100);
      }
      const bh = Math.max(2 * dpr, v * (h - 6 * dpr));
      ctx.fillStyle = (i + 0.5) / bars <= pos ? '#ffd200' : 'rgba(251,248,242,0.32)';
      const x = i * bw + bw * 0.18;
      ctx.fillRect(x, (h - bh) / 2, bw * 0.64, bh);
    }
    // Cues
    if (m && d) {
      ctx.fillStyle = '#ff7ab6';
      m.cues.forEach((c) => {
        const x = (c.t / d) * w;
        ctx.fillRect(x - dpr, 0, 2 * dpr, h);
        ctx.beginPath();
        ctx.moveTo(x - 5 * dpr, 0);
        ctx.lineTo(x + 5 * dpr, 0);
        ctx.lineTo(x, 7 * dpr);
        ctx.fill();
      });
    }
    // Abspielposition
    ctx.fillStyle = '#fff';
    ctx.fillRect(pos * w - dpr, 0, 2 * dpr, h);
  }

  (function () {
    const wave = $('#p-wave');
    let dragging = false;
    const ratio = (e) => {
      const r = wave.getBoundingClientRect();
      return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    };
    let pressTimer = null;
    wave.addEventListener('pointerdown', (e) => {
      if (!player.track) return;
      dragging = true;
      wave.setPointerCapture(e.pointerId);
      seekTo(ratio(e) * duration());
      // Lange drücken = Cue an dieser Stelle (wie im Playback-Tool)
      clearTimeout(pressTimer);
      const x0 = e.clientX;
      pressTimer = setTimeout(() => { if (dragging && Math.abs(lastX - x0) < 8) { addCue(audio.currentTime); dragging = false; } }, 650);
    });
    let lastX = 0;
    wave.addEventListener('pointermove', (e) => {
      lastX = e.clientX;
      if (dragging) seekTo(ratio(e) * duration());
    });
    const up = () => { dragging = false; clearTimeout(pressTimer); };
    wave.addEventListener('pointerup', up);
    wave.addEventListener('pointercancel', up);
    wave.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); step(-5); }
      if (e.key === 'ArrowRight') { e.preventDefault(); step(5); }
    });
  })();

  // ---------- Cues & Schleifen (je Track, lokal + Sync) ----------
  const num = (v) => (v === null || v === undefined || v === '' || !isFinite(v) ? null : Number(v));
  function readMarks(url) {
    const m = lsJson(LS.marks + url, null);
    if (m && Array.isArray(m.cues)) {
      return {
        cues: m.cues.map((c) => (typeof c === 'object' ? { t: num(c.t), n: String(c.n || '') } : { t: num(c), n: '' })).filter((c) => c.t !== null).sort((x, y) => x.t - y.t),
        a: num(m.a), b: num(m.b), loop: !!m.loop, updatedAt: Number(m.updatedAt) || 0,
      };
    }
    return { cues: [], a: null, b: null, loop: false, updatedAt: 0 };
  }
  function writeMarks(url, m) {
    lsSet(LS.marks + url, JSON.stringify({ cues: m.cues, a: m.a, b: m.b, loop: m.loop, updatedAt: m.updatedAt }));
  }
  function allMarks() {
    const out = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(LS.marks)) out[k.slice(LS.marks.length)] = readMarks(k.slice(LS.marks.length));
      }
    } catch (e) {}
    return out;
  }
  function changed() {
    const m = player.marks;
    m.updatedAt = Date.now();
    writeMarks(player.track.url, m);
    renderCues();
    drawWave();
    Sync.schedule();
  }

  function addCue(t) {
    if (!player.track) return;
    const time = Math.round(t * 100) / 100;
    if (player.marks.cues.some((c) => Math.abs(c.t - time) < 0.5)) return;
    player.marks.cues.push({ t: time, n: '' });
    player.marks.cues.sort((x, y) => x.t - y.t);
    if (navigator.vibrate) navigator.vibrate(15);
    toast('Cue bei ' + fmt(time) + ' gesetzt');
    changed();
  }
  function addLoop() {
    if (!player.track) return;
    const t = Math.round(audio.currentTime * 100) / 100;
    const m = player.marks;
    if (player.pendingLoopStart === null) {
      player.pendingLoopStart = t;
      m.a = t;
      m.b = null;
      m.loop = false;
      toast('Anfang gesetzt – jetzt am Ende der Schleife nochmal tippen');
    } else {
      const a = Math.min(player.pendingLoopStart, t);
      const b = Math.max(player.pendingLoopStart, t);
      player.pendingLoopStart = null;
      if (b - a < 0.5) { toast('Die Schleife ist zu kurz.'); m.a = null; m.b = null; changed(); return; }
      m.a = a;
      m.b = b;
      m.loop = true;
      audio.currentTime = a;
      toast('Schleife ' + fmt(a) + '–' + fmt(b) + ' läuft');
    }
    changed();
  }

  function renderCues() {
    const m = player.marks;
    if (!m) return;
    const box = $('#p-cues');
    const loopSet = m.a !== null && m.b !== null;
    $('#p-loop-add').textContent = player.pendingLoopStart !== null ? '■ Ende setzen' : '+ Schleife';
    $('#p-loop-add').classList.toggle('active', player.pendingLoopStart !== null);
    $('#p-loopinfo').textContent = loopSet && m.loop ? '🔁 ' + fmt(m.a) + '–' + fmt(m.b) : '';
    const loopHtml = loopSet
      ? `<div class="loop-row"><button class="cue loop${m.loop ? ' on' : ''}" data-loop-toggle>🔁 ${fmt(m.a)}–${fmt(m.b)} ${m.loop ? 'an' : 'aus'}</button><button class="cue ghost" data-loop-go>Ab Anfang</button><button class="cue ghost" data-loop-del aria-label="Schleife löschen">✕</button></div>`
      : '';
    box.innerHTML = loopHtml + (m.cues.length
      ? `<div class="cue-list${player.editing ? ' editing' : ''}">${m.cues.map((c, i) => player.editing
        ? `<span class="cue-edit"><span class="mono">${fmt(c.t)}</span><input type="text" data-cue-name="${i}" value="${esc(c.n)}" placeholder="Name, z. B. Refrain" maxlength="40" enterkeyhint="done"><button class="cue ghost" data-cue-del="${i}" aria-label="Cue löschen">✕</button></span>`
        : `<button class="cue" data-cue-go="${i}">▶ ${esc(c.n || 'Cue ' + (i + 1))} <span class="mono">${fmt(c.t)}</span></button>`).join('')}
        <button class="cue ghost" data-cue-edit>${player.editing ? '✓ Fertig' : '✎ Bearbeiten'}</button></div>`
      : '');
    $('#p-cue-hint').hidden = !!(m.cues.length || loopSet);
  }

  $('#p-cue-add').addEventListener('click', () => addCue(audio.currentTime));
  $('#p-loop-add').addEventListener('click', addLoop);
  $('#p-cues').addEventListener('click', (e) => {
    const m = player.marks;
    const t = e.target.closest('button');
    if (!t || !m) return;
    if (t.hasAttribute('data-cue-go')) {
      const c = m.cues[Number(t.dataset.cueGo)];
      if (c) { seekTo(c.t); if (audio.paused) playAudio(); }
    } else if (t.hasAttribute('data-cue-del')) {
      m.cues.splice(Number(t.dataset.cueDel), 1);
      if (!m.cues.length) player.editing = false;
      changed();
    } else if (t.hasAttribute('data-cue-edit')) {
      player.editing = !player.editing;
      renderCues();
    } else if (t.hasAttribute('data-loop-toggle')) {
      m.loop = !m.loop;
      if (m.loop && (audio.currentTime < m.a || audio.currentTime > m.b)) audio.currentTime = m.a;
      changed();
    } else if (t.hasAttribute('data-loop-go')) {
      seekTo(m.a);
      if (audio.paused) playAudio();
    } else if (t.hasAttribute('data-loop-del')) {
      m.a = null; m.b = null; m.loop = false;
      player.pendingLoopStart = null;
      changed();
    }
  });
  $('#p-cues').addEventListener('change', (e) => {
    const inp = e.target.closest('[data-cue-name]');
    if (!inp) return;
    const c = player.marks.cues[Number(inp.dataset.cueName)];
    if (c) { c.n = inp.value.replace(/\s+/g, ' ').trim().slice(0, 40); player.marks.updatedAt = Date.now(); writeMarks(player.track.url, player.marks); Sync.schedule(); }
  });
  $('#p-cues').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input')) e.target.blur(); });

  // Tastatur (Computer)
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea') || e.metaKey || e.ctrlKey || e.altKey || !player.track) return;
    if (e.key === ' ') { e.preventDefault(); togglePlay(); }
    else if (e.key === 'ArrowLeft' && e.target.id !== 'p-wave') step(-5);
    else if (e.key === 'ArrowRight' && e.target.id !== 'p-wave') step(5);
    else if (e.key === 'c' || e.key === 'C') addCue(audio.currentTime);
    else if (e.key === 'l' || e.key === 'L') addLoop();
    else if (e.key === 'Escape') closePlayer();
  });

  // ---------- Sperrbildschirm / Kopfhörer-Tasten ----------
  function updateMediaSession() {
    if (!('mediaSession' in navigator) || !player.track) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: player.song.title,
      artist: 'Voctails · ' + (player.track.voiceLabel || player.track.label),
      album: 'Übe-Tracks',
      artwork: [{ src: BASE + 'icon-512.png', sizes: '512x512', type: 'image/png' }],
    });
  }
  if ('mediaSession' in navigator) {
    const ms = navigator.mediaSession;
    const set = (a, fn) => { try { ms.setActionHandler(a, fn); } catch (e) {} };
    set('play', playAudio);
    set('pause', () => audio.pause());
    set('seekbackward', () => step(-5));
    set('seekforward', () => step(5));
    set('previoustrack', () => nextTrack(-1));
    set('nexttrack', () => nextTrack(1));
    set('seekto', (d) => seekTo(d.seekTime));
  }

  // ---------- Geräte-Sync (3-Wort-Code) ----------
  const Sync = {
    timer: null,
    schedule() {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.run(), 1500);
    },
    apply(marks) {
      for (const [url, rec] of Object.entries(marks || {})) {
        const local = readMarks(url);
        if ((rec.updatedAt || 0) > local.updatedAt) writeMarks(url, rec);
      }
      if (player.track) { player.marks = readMarks(player.track.url); renderCues(); drawWave(); }
    },
    async run() {
      if (state.offline || !navigator.onLine) return;
      const code = lsGet(LS.code);
      const marks = allMarks();
      if (!code && !Object.values(marks).some((m) => m.cues.length || m.a !== null)) return;
      try {
        const r = await fetch(code ? '/api/voctails/sync' : '/api/voctails/sync/new', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ code, marks }),
        });
        const body = await r.json();
        if (!body.ok) return;
        if (!code) {
          lsSet(LS.code, body.code);
          showCodeHint(body.code);
        }
        this.apply(body.marks);
      } catch (e) {}
    },
  };

  function showCodeHint(code) {
    if (lsGet(LS.codeAck) === code) return;
    openDialog(`<h2>Dein Sync-Code</h2>
      <p class="big-code mono">${esc(code)}</p>
      <p>Deine Cues und Schleifen werden mit diesem Code gesichert. Gib ihn auf deinen anderen Geräten ein (Startseite → „Cues auf allen Geräten“), dann hast du sie überall. <b>Bitte aufschreiben</b> – damit bekommst du sie auch nach einem neuen Handy zurück.</p>
      <div class="dlg-actions"><button class="btn primary" data-close>Notiert</button></div>`, () => lsSet(LS.codeAck, code));
  }

  function openSyncDialog() {
    const code = lsGet(LS.code) || '';
    openDialog(`<h2>Cues auf allen Geräten</h2>
      <p>Gib den Code aus drei Wörtern ein, den du auf deinem anderen Gerät bekommen hast.</p>
      <form class="code-form"><input type="text" id="code-input" value="${esc(code)}" placeholder="z. B. tuba-mond-kaffee" autocapitalize="off" autocomplete="off" spellcheck="false"><button class="btn primary" type="submit">Verbinden</button></form>
      <p class="login-msg" id="code-msg"></p>
      <div class="dlg-actions">${code ? '<button class="btn ghost" id="code-off">Sync auf diesem Gerät beenden</button>' : ''}<button class="btn" data-close>Schließen</button></div>`);
    $('.code-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const val = $('#code-input').value.trim();
      if (!val) return;
      try {
        const r = await fetch('/api/voctails/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ code: val, marks: allMarks() }),
        });
        const body = await r.json();
        if (!body.ok) { $('#code-msg').textContent = body.error || 'Das hat nicht geklappt.'; return; }
        lsSet(LS.code, body.code);
        lsSet(LS.codeAck, body.code);
        Sync.apply(body.marks);
        closeDialog();
        toast('Verbunden – deine Cues sind jetzt auf diesem Gerät.');
        render();
      } catch (err) {
        $('#code-msg').textContent = 'Keine Verbindung zum Server.';
      }
    });
    const off = $('#code-off');
    if (off) off.addEventListener('click', () => { lsDel(LS.code); closeDialog(); render(); });
  }

  // ---------- Dialog ----------
  const dlg = $('#dlg');
  let dlgClose = null;
  function openDialog(html, onClose) {
    $('#dlg-body').innerHTML = html;
    dlgClose = onClose || null;
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  }
  function closeDialog() {
    if (dlg.close) dlg.close(); else dlg.removeAttribute('open');
  }
  dlg.addEventListener('close', () => { if (dlgClose) dlgClose(); dlgClose = null; });
  dlg.addEventListener('click', (e) => { if (e.target.closest('[data-close]') || e.target === dlg) closeDialog(); });

  // ---------- Start ----------
  async function start() {
    const res = await loadLibrary();
    if (res === 'login') return renderLogin();
    if (res === 'error') {
      view.innerHTML = '<div class="center"><p class="msg error">Die Lieder konnten gerade nicht geladen werden. Bitte später erneut versuchen.</p></div>';
      return;
    }
    render();
    // Zuletzt gespielten Track wieder bereitlegen (pausiert)
    const last = lsJson(LS.last, null);
    if (last && !player.track) {
      const song = findSong(last.slug);
      const t = song && song.tracks.find((x) => x.id === last.id);
      if (t) playTrack(song, t, { time: last.t || 0 });
    }
    Sync.run();
    syncSaved();
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register(BASE + 'sw.js', { scope: BASE }).catch(() => {});
  }
  window.addEventListener('online', () => { if (state.offline) start(); });
  start();
})();
