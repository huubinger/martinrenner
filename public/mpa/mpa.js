// MPA-Control: Steuerung der Behringer Europort MPA200BT im Browser (Web Bluetooth).
// iPhone: im Browser „Bluefy“ öffnen (Safari kann kein Web Bluetooth), Mac/Android: Chrome.
// Ohne bekanntes Protokoll (protokoll.js) läuft alles im Demo-Modus.
(function () {
  const P = window.MPA_PROTOKOLL;
  const $ = s => document.querySelector(s);
  const SPEICHER = 'mpa_v1';

  // --- Kanäle (Belegung der MPA200BT: 2 Kombi-Eingänge, Funkmikro über USB-Empfänger, Bluetooth) ---
  const KANAELE = [
    { id: 'in1', quelle: 'Eingang 1', name: 'Mikro 1', gain: true },
    { id: 'in2', quelle: 'Eingang 2', name: 'Keyboard', gain: true },
    { id: 'funk', quelle: 'Funkmikro', name: 'Funkmikro', gain: true },
    { id: 'bt', quelle: 'Bluetooth', name: 'Playback', gain: false }
  ];
  // Vorläufig – die tatsächlichen Effekte der Box werden mit dem Protokoll ermittelt
  const EFFEKTE = ['Hall (Raum)', 'Hall (Saal)', 'Echo', 'Aus'];
  const BAENDER = [['tief', 'Tief'], ['mitte', 'Mitte'], ['hoch', 'Hoch']];

  const standardKanal = k => ({ vol: 70, gain: 50, mute: false, eq: { tief: 0, mitte: 0, hoch: 0 }, fx: k.id === 'bt' ? 0 : 20 });
  const STANDARD_SZENEN = [
    { name: 'Ansage', info: 'Mikros an, Musik aus', werte: { in1: { mute: false }, funk: { mute: false }, in2: { mute: true }, bt: { mute: true } } },
    { name: 'Singen mit Keyboard', info: 'Mikros + Keyboard', werte: { in1: { mute: false }, funk: { mute: false }, in2: { mute: false }, bt: { mute: true } } },
    { name: 'Singen mit Playback', info: 'Mikros + Playback', werte: { in1: { mute: false }, funk: { mute: false }, in2: { mute: true }, bt: { mute: false, vol: 65 } } },
    { name: 'Pausenmusik', info: 'Nur Playback, leise', werte: { in1: { mute: true }, funk: { mute: true }, in2: { mute: true }, bt: { mute: false, vol: 45 } } }
  ];

  // --- Zustand (wird im Browser gespeichert) ---
  function neuerZustand() {
    const z = { kanaele: {}, namen: {}, master: { vol: 70, mute: false }, fxTyp: EFFEKTE[0], szenen: STANDARD_SZENEN, aktiveSzene: null, wach: true };
    KANAELE.forEach(k => { z.kanaele[k.id] = standardKanal(k); z.namen[k.id] = k.name; });
    return z;
  }
  let z = neuerZustand();
  try {
    const gespeichert = JSON.parse(localStorage.getItem(SPEICHER));
    if (gespeichert && gespeichert.kanaele) z = Object.assign(z, gespeichert);
  } catch (e) { /* ohne Speicher: Standardwerte */ }
  let speicherTimer;
  function speichern() {
    clearTimeout(speicherTimer);
    speicherTimer = setTimeout(() => { try { localStorage.setItem(SPEICHER, JSON.stringify(z)); } catch (e) { /* privat */ } }, 400);
  }

  let toastTimer;
  function toast(text) {
    const t = $('#toast');
    t.textContent = text; t.classList.add('zeigen');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('zeigen'), 2200);
  }

  // --- Regler: relatives Ziehen (springt nicht beim Antippen), seitlich wegziehen = Feinjustierung,
  //     Doppeltipp = Standardwert, Pfeiltasten am Mac ---
  function regler(el, o) {
    const senk = o.richtung !== 'quer';
    el.classList.add('regler', senk ? 'senk' : 'quer');
    if (o.mitte) el.classList.add('mitte');
    el.tabIndex = 0;
    el.setAttribute('role', 'slider');
    el.setAttribute('aria-valuemin', o.min); el.setAttribute('aria-valuemax', o.max);
    if (o.label) el.setAttribute('aria-label', o.label);
    el.innerHTML = '<div class="spur"></div><div class="griff"></div>';
    const spur = el.firstChild, griff = el.lastChild;
    let wert = o.wert;

    function zeichnen() {
      const p = (wert - o.min) / (o.max - o.min) * 100;
      if (o.mitte) {
        const a = Math.min(p, 50), b = Math.abs(p - 50);
        if (senk) { spur.style.bottom = a + '%'; spur.style.height = b + '%'; } else { spur.style.left = a + '%'; spur.style.width = b + '%'; }
        spur.style.background = 'var(--akzent)';
      } else if (senk) spur.style.height = p + '%'; else spur.style.width = p + '%';
      if (senk) griff.style.bottom = p + '%'; else griff.style.left = p + '%';
      el.setAttribute('aria-valuenow', Math.round(wert));
    }
    function setzen(w, melden) {
      w = Math.max(o.min, Math.min(o.max, Math.round(w / (o.schritt || 1)) * (o.schritt || 1)));
      if (w === wert) return;
      wert = w; zeichnen();
      if (melden) o.aenderung(w);
    }

    let start = null, letzterTipp = 0;
    el.addEventListener('pointerdown', e => {
      el.setPointerCapture(e.pointerId);
      start = { x: e.clientX, y: e.clientY, wert, bewegt: false };
    });
    el.addEventListener('pointermove', e => {
      if (!start) return;
      const r = el.getBoundingClientRect();
      const laenge = senk ? r.height : r.width;
      const entlang = senk ? start.y - e.clientY : e.clientX - start.x;
      const quer = Math.abs(senk ? e.clientX - start.x : e.clientY - start.y);
      if (Math.abs(entlang) > 3) start.bewegt = true;
      const fein = quer > 50;
      el.classList.toggle('fein', fein);
      setzen(start.wert + entlang / laenge * (o.max - o.min) * (fein ? 0.2 : 1), true);
    });
    const ende = () => {
      if (!start) return;
      if (!start.bewegt) {
        const jetzt = Date.now();
        if (jetzt - letzterTipp < 320) { setzen(o.standard, true); toast(`${o.label || 'Regler'}: Standardwert`); letzterTipp = 0; } else letzterTipp = jetzt;
      }
      el.classList.remove('fein');
      start = null;
    };
    el.addEventListener('pointerup', ende);
    el.addEventListener('pointercancel', ende);
    el.addEventListener('keydown', e => {
      const d = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key];
      if (d) { e.preventDefault(); setzen(wert + d * (o.schritt || 1) * (e.shiftKey ? 5 : 1), true); }
    });
    zeichnen();
    return { setzen: w => setzen(w, false), el };
  }

  // --- An die Box senden: höchstens alle 40 ms je Regler, der letzte Wert gewinnt (schont die Verbindung) ---
  const ausstehend = new Map();
  function senden(art, kanal, wert, extra) {
    if (!box.verbunden || !P.bekannt) return;
    const key = art + '|' + kanal + '|' + (extra || '');
    const war = ausstehend.has(key);
    ausstehend.set(key, [art, kanal, wert, extra]);
    if (war) return;
    setTimeout(() => {
      const [a, k, w, x] = ausstehend.get(key);
      ausstehend.delete(key);
      const bytes = P.befehl(a, k, w, x);
      if (bytes) box.schreiben(bytes);
    }, 40);
  }

  // --- Oberfläche: Mixer ---
  const ui = { kanal: {}, eq: {} };
  function mixerBauen() {
    const ziel = $('#kanaele');
    ziel.style.setProperty('--n', KANAELE.length);
    KANAELE.forEach(k => {
      const zk = z.kanaele[k.id];
      const el = document.createElement('div');
      el.className = 'kanal';
      el.innerHTML = `<button type="button" class="kanal-name" title="Umbenennen"></button><span class="kanal-quelle">${k.quelle}</span>
        <div class="senk"></div><output></output>${k.gain ? '<div class="gain">Gain<div class="quer"></div></div>' : '<div class="gain leer" aria-hidden="true">Gain<div class="quer"></div></div>'}
        <button type="button" class="mute" aria-pressed="false">Mute</button>`;
      ziel.appendChild(el);
      const out = el.querySelector('output');
      const fader = regler(el.querySelector('.senk'), {
        min: 0, max: 100, wert: zk.vol, standard: 70, label: z.namen[k.id],
        aenderung: w => { zk.vol = w; out.textContent = w; szeneVerlassen(); senden('lautstaerke', k.id, w); speichern(); }
      });
      const gain = k.gain && regler(el.querySelector('.gain .quer'), {
        richtung: 'quer', min: 0, max: 100, wert: zk.gain, standard: 50, label: 'Gain ' + z.namen[k.id],
        aenderung: w => { zk.gain = w; senden('gain', k.id, w); speichern(); }
      });
      const mute = el.querySelector('.mute');
      mute.addEventListener('click', () => { zk.mute = !zk.mute; kanalZeigen(k.id); szeneVerlassen(); senden('mute', k.id, zk.mute); speichern(); });
      el.querySelector('.kanal-name').addEventListener('click', () => {
        const n = prompt(`Name für ${k.quelle}:`, z.namen[k.id]);
        if (n && n.trim()) { z.namen[k.id] = n.trim().slice(0, 20); kanalZeigen(k.id); klangChipsBauen(); speichern(); }
      });
      ui.kanal[k.id] = { el, fader, gain, mute, out };
      kanalZeigen(k.id);
    });
  }
  function kanalZeigen(id) {
    const u = ui.kanal[id], zk = z.kanaele[id];
    u.el.querySelector('.kanal-name').textContent = z.namen[id];
    u.fader.setzen(zk.vol); u.out.textContent = zk.vol;
    if (u.gain) u.gain.setzen(zk.gain);
    u.mute.setAttribute('aria-pressed', String(zk.mute));
    u.el.classList.toggle('ist-stumm', zk.mute);
    u.fader.el.classList.toggle('stumm', zk.mute);
  }

  // --- Master (immer sichtbar) ---
  let masterFader;
  function masterBauen() {
    masterFader = regler($('#masterFader'), {
      richtung: 'quer', min: 0, max: 100, wert: z.master.vol, standard: 70, label: 'Master',
      aenderung: w => { z.master.vol = w; $('#masterWert').textContent = w; senden('master', null, w); speichern(); }
    });
    $('#masterMute').addEventListener('click', () => { z.master.mute = !z.master.mute; masterZeigen(); senden('masterMute', null, z.master.mute); speichern(); });
    masterZeigen();
  }
  function masterZeigen() {
    masterFader.setzen(z.master.vol);
    $('#masterWert').textContent = z.master.vol;
    $('#masterMute').setAttribute('aria-pressed', String(z.master.mute));
    masterFader.el.classList.toggle('stumm', z.master.mute);
  }

  // --- Klang: EQ je Kanal, Effekt ---
  let klangKanal = KANAELE[0].id, fxRegler;
  function klangChipsBauen() {
    $('#klangKanal').innerHTML = KANAELE.map(k => `<button type="button" class="chip" data-kanal="${k.id}" aria-pressed="${k.id === klangKanal}">${z.namen[k.id].replace(/</g, '&lt;')}</button>`).join('');
  }
  function klangBauen() {
    klangChipsBauen();
    $('#klangKanal').addEventListener('click', e => {
      const b = e.target.closest('[data-kanal]');
      if (b) { klangKanal = b.dataset.kanal; klangChipsBauen(); klangZeigen(); }
    });
    const eq = $('#eq');
    BAENDER.forEach(([key, text]) => {
      const el = document.createElement('div');
      el.className = 'eq-band';
      el.innerHTML = `<output></output><div class="senk"></div><span>${text}</span>`;
      eq.appendChild(el);
      const out = el.querySelector('output');
      const r = regler(el.querySelector('.senk'), {
        min: -12, max: 12, wert: 0, standard: 0, mitte: true, label: 'EQ ' + text,
        aenderung: w => { z.kanaele[klangKanal].eq[key] = w; out.textContent = dB(w); kurveZeichnen(); senden('eq', klangKanal, w, key); speichern(); }
      });
      ui.eq[key] = { r, out };
    });
    $('#fxTyp').innerHTML = EFFEKTE.map(f => `<option>${f}</option>`).join('');
    $('#fxTyp').addEventListener('change', e => { z.fxTyp = e.target.value; senden('fxTyp', null, z.fxTyp); speichern(); });
    fxRegler = regler($('#fxAnteil'), {
      richtung: 'quer', min: 0, max: 100, wert: 0, standard: 20, label: 'Effektanteil',
      aenderung: w => { z.kanaele[klangKanal].fx = w; senden('fx', klangKanal, w); speichern(); }
    });
    klangZeigen();
  }
  const dB = w => (w > 0 ? '+' : '') + w + ' dB';
  function klangZeigen() {
    const zk = z.kanaele[klangKanal];
    BAENDER.forEach(([key]) => { ui.eq[key].r.setzen(zk.eq[key]); ui.eq[key].out.textContent = dB(zk.eq[key]); });
    fxRegler.setzen(zk.fx);
    $('#fxTyp').value = z.fxTyp;
    kurveZeichnen();
  }
  // Ungefähre Klangkurve aus den drei Bändern (Tief ~100 Hz, Mitte ~1 kHz, Hoch ~8 kHz)
  function kurveZeichnen() {
    const e = z.kanaele[klangKanal].eq;
    const punkte = [];
    for (let x = 0; x <= 300; x += 10) {
      const t = x / 300;
      const g = e.tief * Math.exp(-((t - 0.12) ** 2) / 0.02) + e.mitte * Math.exp(-((t - 0.5) ** 2) / 0.02) + e.hoch * Math.exp(-((t - 0.88) ** 2) / 0.02);
      punkte.push(`${x},${(50 - g * 3.4).toFixed(1)}`);
    }
    $('#kurvePfad').setAttribute('d', 'M' + punkte.join(' L'));
  }

  // --- Szenen ---
  let bearbeiten = false, vorher = null;
  function szenenZeigen() {
    $('#szenen').innerHTML = z.szenen.map((s, i) => `<div class="szene${z.aktiveSzene === i ? ' ist-aktiv' : ''}" data-i="${i}" role="button" tabindex="0">
      <b>${s.name.replace(/</g, '&lt;')}</b><small>${(s.info || '').replace(/</g, '&lt;')}</small>
      ${bearbeiten ? `<div class="szene-werkzeug"><button type="button" data-aktion="hoch" aria-label="Nach vorn">◀</button><button type="button" data-aktion="name">Name</button><button type="button" data-aktion="weg">Löschen</button></div>` : ''}
    </div>`).join('');
    $('#szenenBearbeiten').textContent = bearbeiten ? 'Fertig' : 'Bearbeiten';
    $('#rueckgaengig').disabled = !vorher;
  }
  function momentaufnahme() {
    const werte = {};
    KANAELE.forEach(k => { const zk = z.kanaele[k.id]; werte[k.id] = { vol: zk.vol, mute: zk.mute, gain: zk.gain, fx: zk.fx, eq: Object.assign({}, zk.eq) }; });
    return werte;
  }
  function szeneAnwenden(i) {
    vorher = { werte: momentaufnahme(), aktiv: z.aktiveSzene };
    werteAnwenden(z.szenen[i].werte);
    z.aktiveSzene = i;
    toast('Szene: ' + z.szenen[i].name);
    szenenZeigen(); speichern();
  }
  function werteAnwenden(werte) {
    Object.entries(werte).forEach(([id, w]) => {
      const zk = z.kanaele[id];
      if (!zk) return;
      if (w.vol !== undefined && w.vol !== zk.vol) { zk.vol = w.vol; senden('lautstaerke', id, w.vol); }
      if (w.mute !== undefined && w.mute !== zk.mute) { zk.mute = w.mute; senden('mute', id, w.mute); }
      if (w.gain !== undefined && w.gain !== zk.gain) { zk.gain = w.gain; senden('gain', id, w.gain); }
      if (w.fx !== undefined && w.fx !== zk.fx) { zk.fx = w.fx; senden('fx', id, w.fx); }
      if (w.eq) BAENDER.forEach(([b]) => { if (w.eq[b] !== undefined && w.eq[b] !== zk.eq[b]) { zk.eq[b] = w.eq[b]; senden('eq', id, w.eq[b], b); } });
      kanalZeigen(id);
    });
    klangZeigen();
  }
  function szeneVerlassen() {
    if (z.aktiveSzene === null) return;
    z.aktiveSzene = null;
    szenenZeigen();
  }
  function szenenBauen() {
    $('#szenen').addEventListener('click', e => {
      const karte = e.target.closest('[data-i]');
      if (!karte) return;
      const i = Number(karte.dataset.i);
      const aktion = e.target.closest('[data-aktion]');
      if (aktion) {
        const a = aktion.dataset.aktion;
        if (a === 'hoch' && i > 0) { z.szenen.splice(i - 1, 0, z.szenen.splice(i, 1)[0]); z.aktiveSzene = null; }
        if (a === 'name') { const n = prompt('Name der Szene:', z.szenen[i].name); if (n && n.trim()) z.szenen[i].name = n.trim().slice(0, 40); }
        if (a === 'weg' && confirm(`Szene „${z.szenen[i].name}“ löschen?`)) { z.szenen.splice(i, 1); z.aktiveSzene = null; }
        szenenZeigen(); speichern();
        return;
      }
      if (!bearbeiten) szeneAnwenden(i);
    });
    $('#szeneSpeichern').addEventListener('click', () => {
      const n = prompt('Name der neuen Szene:', 'Meine Szene');
      if (!n || !n.trim()) return;
      z.szenen.push({ name: n.trim().slice(0, 40), info: 'Eigene Szene', werte: momentaufnahme() });
      z.aktiveSzene = z.szenen.length - 1;
      szenenZeigen(); speichern(); toast('Szene gespeichert');
    });
    $('#szenenBearbeiten').addEventListener('click', () => { bearbeiten = !bearbeiten; szenenZeigen(); });
    $('#rueckgaengig').addEventListener('click', () => {
      if (!vorher) return;
      werteAnwenden(vorher.werte);
      z.aktiveSzene = vorher.aktiv; vorher = null;
      szenenZeigen(); speichern(); toast('Rückgängig gemacht');
    });
    szenenZeigen();
  }

  // --- Bluetooth ---
  const box = {
    verbunden: false, geraet: null, befehl: null,
    async verbinden() {
      if (!navigator.bluetooth) return toast('Dieser Browser kann kein Bluetooth – auf dem iPhone „Bluefy“ nutzen');
      if (!P.bekannt) { toast('Steuerung noch nicht möglich – Protokoll wird entschlüsselt (siehe Diagnose)'); $('#diagnose').open = true; return; }
      try {
        this.geraet = await navigator.bluetooth.requestDevice({ filters: [{ namePrefix: P.namePrefix }], optionalServices: P.services });
        this.geraet.addEventListener('gattserverdisconnected', () => this.getrennt());
        await this.aufbauen();
      } catch (e) { if (e.name !== 'NotFoundError') toast('Verbindung fehlgeschlagen: ' + e.message); }
    },
    async aufbauen() {
      const server = await this.geraet.gatt.connect();
      const [sUuid, cUuid] = P.befehlsKanal;
      this.befehl = await (await server.getPrimaryService(sUuid)).getCharacteristic(cUuid);
      if (P.meldeKanal) {
        const melde = await (await server.getPrimaryService(P.meldeKanal[0])).getCharacteristic(P.meldeKanal[1]);
        melde.addEventListener('characteristicvaluechanged', e => meldungAnwenden(P.auswerten(new Uint8Array(e.target.value.buffer))));
        await melde.startNotifications();
      }
      this.verbunden = true;
      statusZeigen();
      const abfrage = P.zustandAbfragen();
      if (abfrage) this.schreiben(abfrage);
      toast('Mit der Box verbunden');
    },
    async schreiben(bytes) {
      try {
        if (this.befehl.writeValueWithoutResponse && this.befehl.properties.writeWithoutResponse) await this.befehl.writeValueWithoutResponse(bytes);
        else await this.befehl.writeValue(bytes);
      } catch (e) { console.warn('[MPA] Senden fehlgeschlagen', e); }
    },
    // Abriss: automatisch wiederverbinden (ohne an der Box etwas zu verstellen)
    async getrennt() {
      if (!this.verbunden) return;
      this.verbunden = false;
      statusZeigen('getrennt');
      for (let versuch = 0; versuch < 8 && this.geraet; versuch++) {
        await new Promise(r => setTimeout(r, Math.min(1000 * 2 ** versuch, 15000)));
        try { await this.aufbauen(); return; } catch (e) { /* weiter versuchen */ }
      }
      toast('Box nicht erreichbar – bitte neu verbinden');
    },
    trennen() {
      const g = this.geraet; this.geraet = null; this.verbunden = false;
      if (g && g.gatt.connected) g.gatt.disconnect();
      statusZeigen();
    }
  };
  // Änderungen, die die Box meldet (z. B. Drehregler an der Box), nur anzeigen – nicht zurücksenden
  function meldungAnwenden(liste) {
    (liste || []).forEach(({ art, kanal, wert, extra }) => {
      const zk = z.kanaele[kanal];
      if (art === 'master') z.master.vol = wert;
      else if (art === 'masterMute') z.master.mute = !!wert;
      else if (zk && art === 'lautstaerke') zk.vol = wert;
      else if (zk && art === 'mute') zk.mute = !!wert;
      else if (zk && art === 'gain') zk.gain = wert;
      else if (zk && art === 'fx') zk.fx = wert;
      else if (zk && art === 'eq') zk.eq[extra] = wert;
      if (zk) kanalZeigen(kanal);
    });
    masterZeigen(); klangZeigen(); speichern();
  }
  function statusZeigen(art) {
    const s = $('#status');
    s.classList.toggle('verbunden', box.verbunden);
    s.classList.toggle('getrennt', art === 'getrennt');
    s.querySelector('span').textContent = box.verbunden ? 'Verbunden' : art === 'getrennt' ? 'Verbindet neu …' : 'Demo';
    $('#demoHinweis').hidden = box.verbunden;
    $('#verbinden').hidden = box.verbunden;
    $('#trennen').hidden = !box.verbunden;
    wachHalten();
  }

  // --- Diagnose: alle Services/Characteristics anzeigen, Meldungen mitschreiben, Bytes senden ---
  const diag = { chars: [] };
  function diagLog(text) {
    const t = new Date().toLocaleTimeString('de-DE', { hour12: false }) + '.' + String(Date.now() % 1000).padStart(3, '0');
    const log = $('#diagLog');
    log.textContent += `${t}  ${text}\n`;
    log.scrollTop = log.scrollHeight;
  }
  const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join(' ');
  function diagBauen() {
    try { $('#diagServices').value = localStorage.getItem('mpa_diag_services') || P.services.join(', '); } catch (e) { /* privat */ }
    $('#diagVerbinden').addEventListener('click', async () => {
      if (!navigator.bluetooth) return toast('Dieser Browser kann kein Bluetooth – auf dem iPhone „Bluefy“ nutzen');
      const services = $('#diagServices').value.split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean)
        .map(s => /^[0-9a-f]{4}$/.test(s) ? parseInt(s, 16) : s);
      try { localStorage.setItem('mpa_diag_services', $('#diagServices').value); } catch (e) { /* privat */ }
      try {
        const geraet = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: services });
        diagLog(`Gerät: ${geraet.name || '–'} (${geraet.id})`);
        const server = await geraet.gatt.connect();
        geraet.addEventListener('gattserverdisconnected', () => diagLog('Verbindung getrennt'));
        const liste = await server.getPrimaryServices();
        if (!liste.length) diagLog('Keine Services freigegeben – Service-UUIDs oben eintragen (aus entdecken.py).');
        diag.chars = [];
        for (const s of liste) {
          diagLog(`SERVICE ${s.uuid}`);
          for (const c of await s.getCharacteristics()) {
            const p = Object.entries(c.properties).filter(([, v]) => v === true).map(([k]) => k).join(',');
            diagLog(`  CHAR ${c.uuid} [${p}]`);
            if (c.properties.read) { try { diagLog(`    Wert: ${hex((await c.readValue()).buffer)}`); } catch (e) { diagLog(`    nicht lesbar: ${e.message}`); } }
            if (c.properties.notify || c.properties.indicate) {
              c.addEventListener('characteristicvaluechanged', e => diagLog(`NOTIFY ${c.uuid.slice(4, 8)}  ${hex(e.target.value.buffer)}`));
              try { await c.startNotifications(); diagLog('    abonniert'); } catch (e) { diagLog(`    Abo nicht möglich: ${e.message}`); }
            }
            if (c.properties.write || c.properties.writeWithoutResponse) diag.chars.push(c);
          }
        }
        $('#diagChar').innerHTML = diag.chars.map((c, i) => `<option value="${i}">${c.uuid}</option>`).join('');
        diagLog('Bereit. Jetzt am Drehregler der Box drehen.');
      } catch (e) { if (e.name !== 'NotFoundError') diagLog('Fehler: ' + e.message); }
    });
    $('#diagSenden').addEventListener('click', async () => {
      const c = diag.chars[Number($('#diagChar').value)];
      const teile = $('#diagBytes').value.trim().split(/[\s,:]+/).filter(Boolean);
      if (!c || !teile.length || teile.some(b => !/^[0-9a-f]{1,2}$/i.test(b))) return toast('Characteristic wählen und Bytes als Hex eingeben');
      const bytes = new Uint8Array(teile.map(b => parseInt(b, 16)));
      try {
        if (c.properties.writeWithoutResponse) await c.writeValueWithoutResponse(bytes); else await c.writeValue(bytes);
        diagLog(`GESENDET ${c.uuid.slice(4, 8)}  ${hex(bytes.buffer)}`);
      } catch (e) { diagLog('Senden fehlgeschlagen: ' + e.message); }
    });
    $('#diagKopieren').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText($('#diagLog').textContent); toast('Log kopiert'); } catch (e) { toast('Kopieren nicht möglich'); }
    });
    $('#diagLeeren').addEventListener('click', () => { $('#diagLog').textContent = ''; });
  }

  // --- Display wach halten, solange verbunden (oder im Demo-Modus, wenn eingeschaltet) ---
  let wachSperre = null;
  async function wachHalten() {
    const soll = z.wach && !document.hidden;
    if (soll && !wachSperre && 'wakeLock' in navigator) {
      try { wachSperre = await navigator.wakeLock.request('screen'); wachSperre.addEventListener('release', () => { wachSperre = null; }); } catch (e) { /* nicht erlaubt */ }
    } else if (!soll && wachSperre) { wachSperre.release(); wachSperre = null; }
  }

  // --- Sperre gegen versehentliches Verstellen: Entsperren durch 1 Sekunde gedrückt halten ---
  function sperreBauen() {
    const schicht = $('#sperrschicht'), knopf = $('#entsperren');
    $('#sperre').addEventListener('click', () => { schicht.hidden = false; toast('Bedienung gesperrt'); });
    let timer;
    const los = () => { clearTimeout(timer); knopf.classList.remove('haelt'); };
    knopf.addEventListener('pointerdown', () => {
      knopf.classList.add('haelt');
      timer = setTimeout(() => { schicht.hidden = true; los(); toast('Entsperrt'); }, 1000);
    });
    knopf.addEventListener('pointerup', los);
    knopf.addEventListener('pointerleave', los);
    knopf.addEventListener('pointercancel', los);
  }

  // --- Reiter ---
  function reiterZeigen(name) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('ist-aktiv', t.id === 'tab-' + name));
    document.querySelectorAll('.reiter [data-tab]').forEach(b => { if (b.dataset.tab === name) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
  }
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-tab]');
    if (t) reiterZeigen(t.dataset.tab);
  });

  // --- Start ---
  mixerBauen(); masterBauen(); klangBauen(); szenenBauen(); diagBauen(); sperreBauen();
  $('#verbinden').addEventListener('click', () => box.verbinden());
  $('#trennen').addEventListener('click', () => box.trennen());
  $('#wach').checked = z.wach;
  $('#wach').addEventListener('change', e => { z.wach = e.target.checked; speichern(); wachHalten(); });
  document.addEventListener('visibilitychange', wachHalten);
  $('#btHinweis').textContent = navigator.bluetooth
    ? (P.bekannt ? 'Box einschalten, dann „Box verbinden“ tippen.' : 'Die Steuerung der Box wird gerade eingerichtet. Bis dahin funktioniert alles im Demo-Modus.')
    : 'Dieser Browser kann kein Bluetooth. Auf dem iPhone die kostenlose App „Bluefy“ installieren und diese Seite darin öffnen; am Mac Chrome verwenden.';
  statusZeigen();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
