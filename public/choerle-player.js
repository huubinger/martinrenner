// Frühstücks-Chörle: Übe-Player (Wellenform, Tempo, benannte Cues, A-B-Loop) und Geräte-Sync per 3-Wort-Code.
// Gemeinsam genutzt von der Startseite (Panel über dem Foto) und der Vollbild-Seite.
(function () {
  const MARKS_PREFIX = 'ch-marks:';
  const SYNC_KEY = 'ch-sync-code';
  const SYNC_ACK_KEY = 'ch-sync-ack';   // Code, dessen Hinweis „bitte aufschreiben“ schon bestätigt wurde

  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function trackLabel(name) {
    return name.replace(/\.(mp3|wav|m4a|ogg)$/i, '');
  }

  function fmtTime(t) {
    if (!isFinite(t) || t < 0) t = 0;
    const m = Math.floor(t / 60);
    const sec = Math.floor(t % 60);
    return m + ':' + String(sec).padStart(2, '0');
  }

  // --- Speicherung: lokal je Track-Adresse; "updatedAt" entscheidet beim Abgleich zwischen Geräten.
  // Gelöschte Marken bleiben als leerer Eintrag stehen, damit das Löschen auch auf den anderen Geräten ankommt.
  const num = (v) => (v === null || v === undefined || v === '' || !isFinite(v) ? null : Number(v));

  // Cue = { t: Zeitpunkt in s, n: Name }; ältere Stände speichern nur den Zeitpunkt als Zahl.
  function cleanCues(list) {
    return list
      .map((c) => (c && typeof c === 'object' ? { t: num(c.t), n: String(c.n || '') } : { t: num(c), n: '' }))
      .filter((c) => c.t !== null)
      .sort((x, y) => x.t - y.t);
  }

  function readMarks(url) {
    try {
      const m = JSON.parse(localStorage.getItem(MARKS_PREFIX + url) || 'null');
      if (m && Array.isArray(m.cues)) {
        return { cues: cleanCues(m.cues), a: num(m.a), b: num(m.b), loop: !!m.loop, updatedAt: Number(m.updatedAt) || 0 };
      }
    } catch (e) {}
    return { cues: [], a: null, b: null, loop: false, updatedAt: 0 };
  }

  function writeMarks(url, m) {
    try {
      localStorage.setItem(MARKS_PREFIX + url, JSON.stringify({ cues: m.cues, a: m.a, b: m.b, loop: m.loop, updatedAt: m.updatedAt }));
    } catch (e) {}
  }

  function allMarks() {
    const out = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(MARKS_PREFIX)) {
          const url = key.slice(MARKS_PREFIX.length);
          out[url] = readMarks(url);
        }
      }
    } catch (e) {}
    return out;
  }

  // --- Track-Karte ---
  function trackHtml(a) {
    return `<div class="ch-track" data-url="${esc(a.url)}">
      <div class="ch-track-name">${esc(trackLabel(a.name))}</div>
      <audio controls preload="none" src="${esc(a.url)}"></audio>
      <div class="ch-track-tools">Tempo:
        <button type="button" class="ch-speed active" data-speed="1">1,0×</button>
        <button type="button" class="ch-speed" data-speed="0.9">0,9×</button>
        <button type="button" class="ch-speed" data-speed="0.8">0,8×</button>
        <button type="button" class="ch-speed" data-speed="0.7">0,7×</button>
        <a class="ch-download" href="${esc(a.url)}?download=1">Herunterladen</a>
      </div>
      <div class="ch-practice">
        <div class="ch-bar" title="Tippen oder ziehen zum Springen"><canvas class="ch-wave" aria-hidden="true"></canvas><div class="ch-bar-loop"></div><div class="ch-bar-pos"></div></div>
        <div class="ch-practice-row">Üben:
          <button type="button" class="ch-speed" data-act="cue">+ Cue</button>
          <button type="button" class="ch-speed" data-act="a">A setzen</button>
          <button type="button" class="ch-speed" data-act="b">B setzen</button>
          <button type="button" class="ch-speed" data-act="loop" disabled>🔁 Loop</button>
          <button type="button" class="ch-speed" data-act="clear" hidden>Loop löschen</button>
        </div>
        <div class="ch-cues"></div>
        <div class="ch-practice-row ch-edit-row" hidden>
          <button type="button" class="ch-speed" data-act="edit">✎ Cues benennen / löschen</button>
        </div>
      </div>
    </div>`;
  }

  const HELP_HTML = '<p class="ch-help">Tipp: „+ Cue" merkt sich die aktuelle Stelle zum schnellen Hinspringen. Mit „A setzen" und „B setzen" legst du Anfang und Ende eines Abschnitts fest, der dann in Schleife läuft. Unter „✎ Cues benennen / löschen" kannst du Cues einen Namen geben (z. B. „Refrain") oder sie löschen. Cues und Loops bleiben in diesem Browser gespeichert und lassen sich per Geräte-Sync auf Handy und Computer gleichzeitig nutzen. Wichtig: Den 3-Wort-Code aufschreiben – damit holst du deine Cues auch nach einer neuen Anmeldung oder in einem anderen Browser zurück.</p>';

  function duration(audio) {
    return isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null;
  }

  // Länge für die Anzeige: aus der Audiodatei oder – solange die noch nicht geladen ist – aus der Wellenform
  function shownDuration(track) {
    return duration(track.querySelector('audio')) || (track._wave && track._wave.duration) || null;
  }

  const cueLabel = (c, i) => (c.n ? c.n : String(i + 1));

  function render(track) {
    const m = track._marks;
    const btn = (act) => track.querySelector(`[data-act="${act}"]`);
    btn('a').textContent = m.a !== null ? 'A ' + fmtTime(m.a) : 'A setzen';
    btn('b').textContent = m.b !== null ? 'B ' + fmtTime(m.b) : 'B setzen';
    btn('a').classList.toggle('active', m.a !== null);
    btn('b').classList.toggle('active', m.b !== null);
    const loop = btn('loop');
    loop.disabled = m.a === null || m.b === null;
    loop.classList.toggle('loop-on', m.loop && !loop.disabled);
    loop.textContent = m.loop && !loop.disabled ? '🔁 Loop an' : '🔁 Loop';
    btn('clear').hidden = m.a === null && m.b === null;

    // Löschen nur im Bearbeiten-Modus, damit man Cues nicht versehentlich erwischt
    if (!m.cues.length) track._editing = false;
    track.querySelector('.ch-edit-row').hidden = !m.cues.length;
    const edit = btn('edit');
    edit.textContent = track._editing ? '✓ Fertig' : '✎ Cues benennen / löschen';
    edit.classList.toggle('edit-on', !!track._editing);

    renderBar(track);

    const cues = track.querySelector('.ch-cues');
    cues.classList.toggle('editing', !!track._editing);
    cues.innerHTML = m.cues
      .map((c, i) => track._editing
        ? `<span class="ch-cue"><span class="ch-cue-time">${fmtTime(c.t)}</span><input type="text" data-cue-name="${i}" value="${esc(c.n)}" placeholder="Cue ${i + 1} – Name, z. B. Refrain" maxlength="40" enterkeyhint="done" aria-label="Name für Cue ${i + 1}"><button type="button" data-cue-del="${i}" title="Cue löschen" aria-label="Cue ${i + 1} löschen">✕ Löschen</button></span>`
        : `<span class="ch-cue"><button type="button" data-cue-go="${i}" title="Zu dieser Stelle springen">▶ ${esc(cueLabel(c, i))} · ${fmtTime(c.t)}</button></span>`)
      .join('');
    renderPos(track);
  }

  // Cue-Fähnchen und Loop-Bereich auf der Wellenform
  function renderBar(track) {
    const m = track._marks;
    const dur = shownDuration(track);
    const pct = (t) => Math.min(100, Math.max(0, (t / dur) * 100)) + '%';
    const bar = track.querySelector('.ch-bar');
    bar.querySelectorAll('.ch-bar-cue').forEach((c) => c.remove());
    const region = bar.querySelector('.ch-bar-loop');
    if (dur) {
      m.cues.forEach((cue, i) => {
        const c = document.createElement('div');
        c.className = 'ch-bar-cue';
        c.style.left = pct(cue.t);
        c.innerHTML = '<span>' + esc(cueLabel(cue, i)) + '</span>';
        bar.appendChild(c);
      });
      if (m.a !== null || m.b !== null) {
        const s = m.a !== null ? m.a : 0;
        const e = m.b !== null ? m.b : dur;
        region.style.display = 'block';
        region.style.left = pct(s);
        region.style.width = 'calc(' + pct(e) + ' - ' + pct(s) + ')';
        region.style.borderLeftWidth = m.a !== null ? '2px' : '0';
        region.style.borderRightWidth = m.b !== null ? '2px' : '0';
        region.classList.toggle('on', m.loop && m.a !== null && m.b !== null);
      } else region.style.display = 'none';
    } else region.style.display = 'none';
  }

  function renderPos(track) {
    const audio = track.querySelector('audio');
    const dur = shownDuration(track);
    const ratio = dur ? Math.min(1, audio.currentTime / dur) : 0;
    track.querySelector('.ch-bar-pos').style.width = ratio * 100 + '%';
    drawWave(track, ratio);
  }

  // --- Wellenform: Balken, der gespielte Teil in Akzentfarbe ---
  function drawWave(track, ratio, force) {
    const w = track._wave;
    if (!w) return;
    const canvas = track.querySelector('.ch-wave');
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    const dpr = window.devicePixelRatio || 1;
    const step = 3; // Balken 2 px + 1 px Abstand
    const count = Math.max(1, Math.floor(width / step));
    const played = Math.round(ratio * count);
    if (!force && canvas.width === Math.round(width * dpr) && track._wavePlayed === played) return;
    track._wavePlayed = played;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const peaks = w.peaks;
    const x0 = (width - count * step) / 2;
    for (let i = 0; i < count; i++) {
      // lautester Wert im Abschnitt dieses Balkens
      const from = Math.floor((i * peaks.length) / count);
      const to = Math.max(from + 1, Math.floor(((i + 1) * peaks.length) / count));
      let v = 0;
      for (let k = from; k < to && k < peaks.length; k++) if (peaks[k] > v) v = peaks[k];
      const h = Math.max(2, (v / 100) * (height - 4));
      ctx.fillStyle = i < played ? '#38bdf8' : 'rgba(148,163,184,0.45)';
      ctx.fillRect(x0 + i * step, (height - h) / 2, 2, h);
    }
  }

  function loadWave(track) {
    const url = track.dataset.url.replace('/file/', '/peaks/');
    fetch(url, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!body || !Array.isArray(body.peaks) || !body.peaks.length) return;
        track._wave = { peaks: body.peaks, duration: Number(body.duration) || null };
        track.querySelector('.ch-bar').classList.add('has-wave');
        render(track);
        drawWave(track, 0, true);
        renderPos(track);
      })
      .catch(() => {});
  }

  function seek(audio, t) {
    const dur = duration(audio);
    audio.currentTime = Math.max(0, dur ? Math.min(t, dur - 0.05) : t);
  }

  // Loop-Ende prüfen: bei "timeupdate" (läuft auch bei gesperrtem Handy weiter) und
  // zusätzlich per Timer, weil "timeupdate" nur ca. 4× pro Sekunde feuert.
  function checkLoop(track) {
    const audio = track.querySelector('audio');
    const m = track._marks;
    if (m.loop && m.a !== null && m.b !== null && audio.currentTime >= m.b) seek(audio, m.a);
  }

  function initTrack(track) {
    track._marks = readMarks(track.dataset.url);
    const audio = track.querySelector('audio');
    const bar = track.querySelector('.ch-bar');
    audio.addEventListener('loadedmetadata', () => render(track));
    audio.addEventListener('timeupdate', () => {
      checkLoop(track);
      renderPos(track);
    });
    audio.addEventListener('play', () => {
      const m = track._marks;
      // Beim Start im Loop-Modus außerhalb des Abschnitts → an den Anfang des Abschnitts.
      if (m.loop && m.a !== null && m.b !== null && (audio.currentTime < m.a - 0.5 || audio.currentTime >= m.b)) seek(audio, m.a);
      clearInterval(track._timer);
      track._timer = setInterval(() => {
        if (audio.paused) return clearInterval(track._timer);
        checkLoop(track);
        renderPos(track);
      }, 50);
    });
    audio.addEventListener('ended', () => {
      const m = track._marks;
      if (m.loop && m.a !== null && m.b !== null) {
        seek(audio, m.a);
        audio.play();
      }
    });
    // Tippen oder Ziehen auf der Wellenform springt an die Stelle
    const seekTo = (e) => {
      const dur = duration(audio);
      const rect = bar.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      if (!dur) {
        // Noch nicht geladen: erst Metadaten holen, dann springen.
        audio.preload = 'metadata';
        audio.addEventListener('loadedmetadata', () => { seek(audio, ratio * audio.duration); renderPos(track); }, { once: true });
        audio.load();
        return;
      }
      seek(audio, ratio * dur);
      renderPos(track);
    };
    bar.addEventListener('pointerdown', (e) => {
      if (e.button) return;
      track._dragging = true;
      try { bar.setPointerCapture(e.pointerId); } catch (err) {}
      seekTo(e);
    });
    bar.addEventListener('pointermove', (e) => { if (track._dragging) seekTo(e); });
    const stop = () => { track._dragging = false; };
    bar.addEventListener('pointerup', stop);
    bar.addEventListener('pointercancel', stop);
    if (window.ResizeObserver) new ResizeObserver(() => drawWave(track, Math.min(1, audio.currentTime / (shownDuration(track) || Infinity)), true)).observe(bar);
    render(track);
    loadWave(track);
  }

  function practiceClick(e) {
    const track = e.target.closest('.ch-track');
    if (!track || !track._marks) return false;
    const audio = track.querySelector('audio');
    const m = track._marks;
    const t = Math.round(audio.currentTime * 100) / 100;
    const go = e.target.closest('[data-cue-go]');
    const del = e.target.closest('[data-cue-del]');
    const act = e.target.closest('[data-act]');
    if (go) {
      seek(audio, m.cues[+go.dataset.cueGo].t);
      if (audio.paused) audio.play();
      return true;
    } else if (del) {
      m.cues.splice(+del.dataset.cueDel, 1);
    } else if (act) {
      const a = act.dataset.act;
      if (a === 'edit') {
        track._editing = !track._editing;
        render(track);
        return true;
      } else if (a === 'cue') {
        // Doppelte Cues (weniger als eine halbe Sekunde auseinander) vermeiden
        if (!m.cues.some((c) => Math.abs(c.t - t) < 0.5)) {
          m.cues.push({ t, n: '' });
          m.cues.sort((x, y) => x.t - y.t);
        }
      } else if (a === 'a' || a === 'b') {
        m[a] = t;
        if (m.a !== null && m.b !== null) {
          if (m.b < m.a) [m.a, m.b] = [m.b, m.a];
          if (m.b - m.a < 0.3) m.b = null;
          else m.loop = true;
        }
      } else if (a === 'loop') {
        m.loop = !m.loop;
        if (m.loop && (t < m.a || t >= m.b)) seek(audio, m.a);
      } else if (a === 'clear') {
        m.a = null;
        m.b = null;
        m.loop = false;
      }
    } else return false;
    m.updatedAt = Date.now();
    writeMarks(track.dataset.url, m);
    render(track);
    Sync.changed();
    return true;
  }

  function speedClick(e) {
    const speed = e.target.closest('.ch-speed[data-speed]');
    if (!speed) return false;
    const track = speed.closest('.ch-track');
    const audio = track.querySelector('audio');
    const rate = parseFloat(speed.dataset.speed);
    if (audio && !isNaN(rate)) {
      audio.playbackRate = rate;
      audio.preservesPitch = true;
    }
    track.querySelectorAll('.ch-speed[data-speed]').forEach((b) => b.classList.toggle('active', b === speed));
    return true;
  }

  // Alle Tracks und das Sync-Feld in einem Bereich aktivieren (darf mehrfach aufgerufen werden).
  function attach(container) {
    container.querySelectorAll('.ch-track').forEach(initTrack);
    container.querySelectorAll('.ch-sync').forEach(renderSyncBox);
    if (container._chBound) return;
    container._chBound = true;
    container.addEventListener('click', (e) => {
      if (practiceClick(e) || speedClick(e)) return;
      syncClick(e);
    });
    // Cue-Namen: beim Tippen speichern, ohne die Liste neu zu zeichnen (Fokus bleibt im Feld)
    container.addEventListener('input', (e) => {
      const input = e.target.closest('[data-cue-name]');
      const track = input && input.closest('.ch-track');
      if (!track || !track._marks) return;
      const cue = track._marks.cues[+input.dataset.cueName];
      if (!cue) return;
      cue.n = input.value.replace(/\s+/g, ' ').slice(0, 40);
      track._marks.updatedAt = Date.now();
      writeMarks(track.dataset.url, track._marks);
      renderBar(track);
      Sync.changed();
    });
    container.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.closest('[data-cue-name]')) e.target.blur();
    });
    container.addEventListener('submit', (e) => {
      if (!e.target.closest('.ch-sync')) return;
      e.preventDefault();
      Sync.connect(e.target.querySelector('input').value);
    });
    // Immer nur ein Übe-Track gleichzeitig
    container.addEventListener('play', (e) => {
      container.querySelectorAll('audio').forEach((a) => {
        if (a !== e.target) a.pause();
      });
    }, true);
  }

  // Nach einem Abgleich: angezeigte Tracks mit dem neuen Stand neu zeichnen.
  function refreshTracks() {
    document.querySelectorAll('.ch-track').forEach((track) => {
      if (!track._marks) return;
      const fresh = readMarks(track.dataset.url);
      if (fresh.updatedAt === track._marks.updatedAt) return;
      track._marks = fresh;
      // Nicht neu zeichnen, während hier gerade ein Cue-Name getippt wird (Fokus ginge verloren)
      if (track.contains(document.activeElement) && document.activeElement.matches('[data-cue-name]')) return renderBar(track);
      render(track);
    });
  }

  // --- Geräte-Sync: ein 3-Wort-Code verbindet Handy, Tablet und Computer.
  // Jede Änderung wird hochgeladen; beim Öffnen und beim Zurückkehren in den Tab wird abgeglichen.
  const Sync = {
    state: '',
    error: '',
    open: false,
    timer: null,
    running: false,
    again: false,

    code() {
      try { return localStorage.getItem(SYNC_KEY) || ''; } catch (e) { return ''; }
    },

    setCode(code) {
      try {
        if (code) localStorage.setItem(SYNC_KEY, code);
        else localStorage.removeItem(SYNC_KEY);
      } catch (e) {}
    },

    // Neu angelegter Code, den die Person noch nicht bestätigt (aufgeschrieben) hat
    fresh() {
      const code = this.code();
      if (!code) return false;
      try { return localStorage.getItem(SYNC_ACK_KEY) !== code; } catch (e) { return false; }
    },

    ack() {
      try { localStorage.setItem(SYNC_ACK_KEY, this.code()); } catch (e) {}
    },

    changed() {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.run(true), 600);
    },

    pull() {
      if (this.code()) this.run(false);
    },

    // create: ohne Code beim ersten eigenen Cue automatisch einen Code anlegen
    async run(create) {
      if (this.running) { this.again = true; return; }
      const code = this.code();
      if (!code && !create) return;
      const marks = allMarks();
      if (!code && !Object.keys(marks).length) return;
      this.running = true;
      this.setState('busy');
      try {
        const res = await fetch(code ? '/api/choerle/sync' : '/api/choerle/sync/new', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(code ? { code, marks } : { marks }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'Abgleich fehlgeschlagen.');
        if (!code) this.setCode(body.code);
        this.apply(body.marks);
        this.setState('ok');
      } catch (e) {
        this.setState('error', navigator.onLine === false ? 'Offline – wird später abgeglichen.' : e.message);
      } finally {
        this.running = false;
        if (this.again) {
          this.again = false;
          this.run(create);
        }
      }
    },

    apply(marks) {
      Object.keys(marks || {}).forEach((url) => {
        const rec = marks[url];
        if ((Number(rec.updatedAt) || 0) > readMarks(url).updatedAt) writeMarks(url, rec);
      });
      refreshTracks();
    },

    async connect(input) {
      const code = String(input || '').trim();
      if (!code) return this.setState('error', 'Bitte den Code vom anderen Gerät eingeben.');
      this.setState('busy');
      try {
        const res = await fetch('/api/choerle/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ code, marks: allMarks() }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'Verbinden fehlgeschlagen.');
        this.setCode(body.code);
        this.ack();   // Code kam vom anderen Gerät – ist also schon bekannt
        this.open = false;
        this.apply(body.marks);
        this.setState('ok');
      } catch (e) {
        this.setState('error', e.message);
      }
    },

    async create() {
      this.setCode('');
      this.open = false;
      this.setState('busy');
      try {
        const res = await fetch('/api/choerle/sync/new', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ marks: allMarks() }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'Code konnte nicht erstellt werden.');
        this.setCode(body.code);
        this.apply(body.marks);
        this.setState('ok');
      } catch (e) {
        this.setState('error', e.message);
      }
    },

    setState(state, error) {
      this.state = state;
      this.error = error || '';
      document.querySelectorAll('.ch-sync').forEach(renderSyncBox);
    },
  };

  function renderSyncBox(box) {
    const code = Sync.code();
    const stateText = Sync.state === 'busy' ? 'gleicht ab …' : Sync.state === 'ok' && code ? '✓ abgeglichen' : '';
    const status = Sync.state === 'error'
      ? `<span class="ch-sync-state error">${esc(Sync.error)}</span>`
      : `<span class="ch-sync-state">${stateText}</span>`;
    const fresh = Sync.fresh() && !Sync.open;
    box.classList.toggle('fresh', fresh);
    const head = fresh
      ? `<div class="ch-sync-head">📝 <strong>Dein persönlicher Code</strong>${status}</div><div class="ch-sync-big">${esc(code)}</div>`
      : code
      ? `<div class="ch-sync-head">🔄 <strong>Geräte-Sync</strong> Code: <span class="ch-sync-code">${esc(code)}</span>${status}</div>`
      : `<div class="ch-sync-head">🔄 <strong>Cues auf Handy &amp; Computer nutzen</strong>${status}</div>`;
    const connectForm = `<form class="ch-sync-row" novalidate>
        <input type="text" name="code" placeholder="z. B. tuba-mond-kaffee" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" aria-label="Sync-Code">
        <button type="submit" class="ch-speed">Verbinden</button>
      </form>`;
    let body;
    if (Sync.open) {
      body = code
        ? `<div class="ch-sync-body"><p>Anderen Code eingeben, um dieses Gerät mit einem anderen Gerät zu verbinden. Deine Cues von hier werden dabei mit übernommen.</p>${connectForm}
            <div class="ch-sync-row" style="margin-top:0.45rem"><button type="button" class="ch-speed" data-sync="off">Sync auf diesem Gerät beenden</button><button type="button" class="ch-speed" data-sync="close">Abbrechen</button></div></div>`
        : `<div class="ch-sync-body"><p>Schon einen Code von einem anderen Gerät? Hier eingeben:</p>${connectForm}
            <div class="ch-sync-row" style="margin-top:0.45rem"><button type="button" class="ch-speed" data-sync="new">Neuen Code erstellen</button><button type="button" class="ch-speed" data-sync="close">Abbrechen</button></div></div>`;
    } else if (fresh) {
      body = `<div class="ch-sync-body"><p><strong>Bitte aufschreiben oder ein Foto machen!</strong> Mit diesem Code holst du deine Cues aufs Handy (dort ein Lied öffnen, unter „Geräte-Sync" → „Code eingeben" eintippen) – und nach einer neuen Anmeldung oder in einem anderen Browser wieder zurück.</p><div class="ch-sync-row"><button type="button" class="ch-speed active" data-sync="ack">Hab ich notiert</button></div></div>`;
    } else {
      body = code
        ? `<div class="ch-sync-body"><p>Deine Cues und Loops werden automatisch abgeglichen. Auf dem anderen Gerät (oder nach einer neuen Anmeldung) beim Chörle unter „Geräte-Sync" diesen Code eingeben.</p><div class="ch-sync-row"><button type="button" class="ch-speed" data-sync="open">Code ändern / beenden</button></div></div>`
        : `<div class="ch-sync-body"><p>Sobald du einen Cue setzt, bekommst du hier einen Code aus drei Wörtern. Auf dem anderen Gerät eingeben – dann sind deine Cues überall gleich.</p><div class="ch-sync-row"><button type="button" class="ch-speed" data-sync="open">Code eingeben / erstellen</button></div></div>`;
    }
    // Während der Eingabe nicht neu zeichnen (sonst geht der Text verloren)
    const input = box.querySelector('input');
    const typed = input && input.value;
    const hadFocus = input && document.activeElement === input;
    box.innerHTML = head + body;
    const next = box.querySelector('input');
    if (next && typed) next.value = typed;
    if (next && hadFocus) next.focus();
  }

  function syncClick(e) {
    const b = e.target.closest('[data-sync]');
    if (!b) return;
    const act = b.dataset.sync;
    if (act === 'ack') Sync.ack();
    else if (act === 'open') Sync.open = true;
    else if (act === 'close') Sync.open = false;
    else if (act === 'new') return Sync.create();
    else if (act === 'off') {
      Sync.setCode('');
      Sync.open = false;
    }
    Sync.setState(act === 'off' ? '' : Sync.state, Sync.error);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') Sync.pull();
  });
  window.addEventListener('online', () => Sync.pull());

  window.ChoerlePlayer = {
    esc,
    trackLabel,
    trackHtml,
    HELP_HTML,
    SYNC_HTML: '<div class="ch-sync"></div>',
    attach,
    pull: () => Sync.pull(),
  };
})();
