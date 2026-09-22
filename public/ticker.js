// Eventticker: schwebende Leiste unten mit den nächsten Terminen (Kreatief + Voctails).
// Wird auf allen Seiten eingebunden; Daten kommen gecacht vom Server (/api/events-ticker).
// Klick auf "Nächste Termine" klappt nach oben eine Übersicht aller kommenden Termine auf.
(function () {
  if (window.__eventTicker) return;
  window.__eventTicker = true;

  var INTERVAL_MS = 5000;
  var TICKER_ITEMS = 10;
  var SOURCES = {
    kreatief: { label: 'Kreatief' },
    voctails: { label: 'Voctails' },
  };

  var CSS = `
  :root { --evt-bottom: 14px; --evt-h: 46px; }
  .evt {
    position: fixed;
    left: 50%;
    bottom: var(--evt-bottom);
    z-index: 12;
    width: min(560px, calc(100vw - 2rem));
    height: var(--evt-h);
    display: flex;
    align-items: stretch;
    border-radius: 999px;
    background: rgba(15,23,42,0.74);
    border: 1px solid rgba(255,255,255,0.14);
    box-shadow: 0 12px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06);
    -webkit-backdrop-filter: blur(14px) saturate(140%);
    backdrop-filter: blur(14px) saturate(140%);
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    opacity: 0;
    transform: translate(-50%, 12px);
    transition: opacity 0.5s ease, transform 0.5s cubic-bezier(.2,.8,.2,1);
  }
  .evt.is-ready { opacity: 1; transform: translate(-50%, 0); }
  .evt-label {
    flex: none;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0 0.85rem 0 1.05rem;
    border: none;
    border-right: 1px solid rgba(255,255,255,0.1);
    background: transparent;
    color: #94a3b8;
    font-family: inherit;
    font-size: 0.64rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    white-space: nowrap;
    cursor: pointer;
    transition: background 0.2s ease, color 0.2s ease;
  }
  .evt-label:hover,
  .evt.is-open .evt-label { background: rgba(255,255,255,0.06); color: #f8fafc; }
  .evt-label:focus-visible { outline: 2px solid #38bdf8; outline-offset: -3px; border-radius: 999px 0 0 999px; }
  .evt-chevron { display: block; transition: transform 0.3s ease; opacity: 0.8; }
  .evt.is-open .evt-chevron { transform: rotate(180deg); }
  .evt-dot {
    position: relative;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #38bdf8;
    flex: none;
  }
  .evt-dot::after {
    content: "";
    position: absolute;
    inset: -4px;
    border-radius: 50%;
    border: 2px solid #38bdf8;
    opacity: 0;
    animation: evt-pulse 2.4s ease-out infinite;
  }
  @keyframes evt-pulse {
    0% { transform: scale(0.5); opacity: 0.7; }
    100% { transform: scale(1.6); opacity: 0; }
  }
  .evt-stage { position: relative; flex: 1; min-width: 0; }
  .evt-item {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    gap: 0.65rem;
    padding: 0 0.8rem 0 0.75rem;
    color: #f8fafc;
    text-decoration: none;
    opacity: 0;
    transform: translateY(100%);
    transition: transform 0.6s cubic-bezier(.2,.8,.2,1), opacity 0.45s ease;
    pointer-events: none;
  }
  .evt-item.is-active { opacity: 1; transform: translateY(0); pointer-events: auto; }
  .evt-item.is-leaving { opacity: 0; transform: translateY(-100%); }
  .evt-item:focus-visible { outline: 2px solid #38bdf8; outline-offset: -4px; border-radius: 999px; }
  .evt-date {
    flex: none;
    padding: 0.24rem 0.5rem;
    border-radius: 7px;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.03em;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .evt-src-kreatief .evt-date { background: rgba(167,139,250,0.18); color: #c4b5fd; }
  .evt-src-voctails .evt-date { background: rgba(34,211,238,0.16); color: #67e8f9; }
  .evt-text { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.2; }
  .evt-title {
    font-size: 0.84rem;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .evt-title-inner { display: inline-block; will-change: transform; }
  /* Laufschrift für zu lange Titel: weich ausblenden statt "…" */
  .evt-title.is-marquee { text-overflow: clip; -webkit-mask-image: linear-gradient(90deg, #000 0, #000 calc(100% - 22px), transparent); mask-image: linear-gradient(90deg, #000 0, #000 calc(100% - 22px), transparent); }
  .evt-title.is-marquee.is-running { -webkit-mask-image: linear-gradient(90deg, transparent, #000 14px, #000 calc(100% - 22px), transparent); mask-image: linear-gradient(90deg, transparent, #000 14px, #000 calc(100% - 22px), transparent); }

  .evt-meta {
    font-size: 0.68rem;
    color: #94a3b8;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .evt-arrow {
    flex: none;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255,255,255,0.07);
    color: #cbd5e1;
    transition: background 0.2s ease, transform 0.2s ease, color 0.2s ease;
  }
  .evt-item:hover .evt-arrow { background: #38bdf8; color: #0f172a; transform: translateX(2px); }
  .evt-progress {
    position: absolute;
    left: 0;
    bottom: 0;
    height: 2px;
    width: 100%;
    transform-origin: left center;
    transform: scaleX(0);
    background: linear-gradient(90deg, rgba(56,189,248,0.9), rgba(167,139,250,0.9));
    opacity: 0.7;
  }
  .evt-progress.is-running { animation: evt-progress linear forwards; }
  .evt.is-held .evt-progress.is-running,
  .evt.is-open .evt-progress.is-running { animation-play-state: paused; }

  /* Aufgeklappte Übersicht aller Termine – wächst aus der Leiste nach oben */
  .evt-panel {
    position: fixed;
    left: 50%;
    bottom: calc(var(--evt-bottom) + var(--evt-h) + 10px);
    z-index: 13;
    width: min(780px, calc(100vw - 2rem));
    max-height: min(62vh, 580px);
    display: flex;
    flex-direction: column;
    border-radius: 20px;
    background: rgba(15,23,42,0.86);
    border: 1px solid rgba(255,255,255,0.14);
    box-shadow: 0 24px 60px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06);
    -webkit-backdrop-filter: blur(18px) saturate(140%);
    backdrop-filter: blur(18px) saturate(140%);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #f8fafc;
    transform-origin: 50% 100%;
    opacity: 0;
    visibility: hidden;
    transform: translate(-50%, 18px) scale(0.96);
    transition: opacity 0.3s ease, transform 0.4s cubic-bezier(.2,.8,.2,1), visibility 0s linear 0.4s;
  }
  .evt-panel.is-open {
    opacity: 1;
    visibility: visible;
    transform: translate(-50%, 0) scale(1);
    transition: opacity 0.3s ease, transform 0.4s cubic-bezier(.2,.8,.2,1), visibility 0s;
  }
  .evt-panel-head {
    flex: none;
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 1rem 1rem 0.8rem 1.3rem;
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }
  .evt-panel-head h2 { font-size: 1rem; font-weight: 700; letter-spacing: -0.01em; margin: 0; }
  .evt-count { font-size: 0.72rem; color: #94a3b8; }
  .evt-legend { margin-left: auto; margin-right: 0.2rem; display: flex; gap: 0.8rem; font-size: 0.68rem; color: #94a3b8; }
  .evt-legend + .evt-close { margin-left: 0; }
  .evt-legend span { display: inline-flex; align-items: center; gap: 0.35rem; }
  .evt-legend i { width: 8px; height: 8px; border-radius: 50%; display: block; }
  .evt-close {
    flex: none;
    margin-left: auto;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    border: none;
    background: rgba(255,255,255,0.08);
    color: #f8fafc;
    font-size: 1.1rem;
    line-height: 1;
    cursor: pointer;
  }
  .evt-close:hover { background: rgba(255,255,255,0.18); }
  .evt-list { overflow-y: auto; padding: 0.3rem 0.6rem 0.8rem; overscroll-behavior: contain; }
  .evt-month {
    position: sticky;
    top: 0;
    z-index: 1;
    padding: 0.7rem 0.7rem 0.35rem;
    font-size: 0.66rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #38bdf8;
    background: linear-gradient(180deg, rgba(15,23,42,0.97) 70%, rgba(15,23,42,0));
  }
  .evt-row {
    display: grid;
    grid-template-columns: 92px 64px minmax(0, 1fr) minmax(0, 190px) 28px;
    align-items: center;
    gap: 0.8rem;
    padding: 0.55rem 0.7rem;
    border-radius: 10px;
    color: #f8fafc;
    text-decoration: none;
    transition: background 0.15s ease;
  }
  .evt-row + .evt-row { box-shadow: inset 0 1px 0 rgba(255,255,255,0.05); }
  .evt-row:hover, .evt-row:focus-visible { background: rgba(255,255,255,0.07); box-shadow: none; outline: none; }
  .evt-row .evt-date { justify-self: start; }
  .evt-row-time { font-size: 0.8rem; color: #cbd5e1; font-variant-numeric: tabular-nums; }
  .evt-row-title { font-size: 0.88rem; font-weight: 600; line-height: 1.3; }
  .evt-row-src { display: block; font-size: 0.66rem; font-weight: 600; letter-spacing: 0.04em; margin-top: 0.1rem; }
  .evt-src-kreatief .evt-row-src { color: #c4b5fd; }
  .evt-src-voctails .evt-row-src { color: #67e8f9; }
  .evt-row-loc { font-size: 0.78rem; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .evt-row .evt-arrow { width: 28px; height: 28px; }
  .evt-row:hover .evt-arrow { background: #38bdf8; color: #0f172a; transform: translateX(2px); }
  .evt-backdrop {
    position: fixed;
    inset: 0;
    z-index: 12;
    background: rgba(2,6,23,0.35);
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.3s ease, visibility 0s linear 0.3s;
  }
  .evt-backdrop.is-open { opacity: 1; visibility: visible; transition: opacity 0.3s ease, visibility 0s; }
  @keyframes evt-progress { from { transform: scaleX(0); } to { transform: scaleX(1); } }

  /* Unterhalb dieser Breite stößt die Leiste an den Impressum/Datenschutz-Footer rechts unten -> darüber setzen */
  @media (max-width: 1100px) {
    :root { --evt-bottom: 2.4rem; }
  }
  @media (max-width: 760px) {
    .evt-row { grid-template-columns: 84px minmax(0, 1fr) 28px; row-gap: 0.1rem; }
    .evt-row-time, .evt-row-loc { display: none; }
    .evt-row-src::before { content: attr(data-meta); color: #94a3b8; font-weight: 400; letter-spacing: 0; }
    .evt-legend { display: none; }
  }
  @media (max-width: 700px) {
    /* Startseite auf dem Handy: keine Footer-Links mehr unten -> Leiste ganz nach unten */
    html.is-home { --evt-bottom: calc(10px + env(safe-area-inset-bottom)); }
  }
  @media (max-width: 600px) {
    /* Handy: Titel einzeilig (Laufschrift bei Überlänge), darunter Uhrzeit + Kreatief/Voctails */
    :root { --evt-h: 48px; }
    .evt-label { padding: 0 0.7rem 0 0.9rem; }
    .evt-label-text { display: none; }
    .evt-item { gap: 0.5rem; padding: 0 0.5rem 0 0.6rem; }
    .evt-title { font-size: 0.82rem; }
    /* Übersicht als Blatt von unten */
    .evt-panel {
      left: 0;
      right: 0;
      bottom: 0;
      width: auto;
      max-height: 80vh;
      max-height: 80dvh;
      border-radius: 20px 20px 0 0;
      border-bottom: none;
      padding-bottom: env(safe-area-inset-bottom);
      transform: translateY(100%);
      z-index: 50;
    }
    .evt-panel.is-open { transform: none; }
    .evt-panel-head::before {
      content: "";
      position: absolute;
      top: 6px;
      left: 50%;
      width: 38px;
      height: 4px;
      margin-left: -19px;
      border-radius: 2px;
      background: rgba(255,255,255,0.25);
    }
    .evt-panel-head { position: relative; padding-top: 1.2rem; }
    .evt-backdrop { z-index: 49; background: rgba(2,6,23,0.55); }
    .evt-row { padding: 0.7rem 0.6rem; }
  }
  @media (prefers-reduced-motion: reduce) {
    .evt, .evt-item, .evt-panel, .evt-backdrop { transition: none !important; }
    .evt-dot::after { animation: none; }
    .evt-progress { display: none; }
  }

  /* Platz schaffen, damit die Leiste keine Inhalte verdeckt */
  .evt-spacer { height: 4.5rem; }
  html.has-evt .banner { padding-bottom: 5.4rem; }
  html.has-evt .newsletter-box { bottom: 4.6rem; }
  @media (max-width: 1100px) {
    html.has-evt .banner { padding-bottom: 6.4rem; }
    html.has-evt .newsletter-box { bottom: 5.8rem; }
  }
  html.has-evt .cookie-banner { padding-bottom: 1rem; }
  `;

  var ARROW = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>';

  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function part(date, opts) {
    return new Intl.DateTimeFormat('de-DE', Object.assign({ timeZone: 'Europe/Berlin' }, opts)).format(date);
  }

  function formatDate(date) {
    var wd = part(date, { weekday: 'short' }).replace('.', '');
    return wd + ' ' + part(date, { day: '2-digit', month: '2-digit' });
  }

  function itemHtml(e) {
    var date = new Date(e.start);
    var src = SOURCES[e.source] || { label: '' };
    var meta = [];
    if (!e.allDay) meta.push(part(date, { hour: '2-digit', minute: '2-digit' }) + ' Uhr');
    if (src.label) meta.push(src.label);
    var title = e.title + (e.location ? ' – ' + e.location : '');
    return '<a class="evt-item evt-src-' + esc(e.source) + '" href="' + esc(e.url) + '" target="_blank" rel="noopener" title="' + esc(title) + '">' +
      '<span class="evt-date">' + esc(formatDate(date)) + '</span>' +
      '<span class="evt-text"><span class="evt-title"><span class="evt-title-inner">' + esc(e.title) + '</span></span>' +
      '<span class="evt-meta">' + esc(meta.join(' · ')) + '</span></span>' +
      '<span class="evt-arrow">' + ARROW + '</span>' +
      '</a>';
  }

  var CHEVRON = '<svg class="evt-chevron" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="18 15 12 9 6 15"></polyline></svg>';

  function rowHtml(e) {
    var date = new Date(e.start);
    var src = SOURCES[e.source] || { label: '' };
    var time = e.allDay ? '' : part(date, { hour: '2-digit', minute: '2-digit' });
    var mobileMeta = [time && time + ' Uhr', e.location].filter(Boolean).join(' · ');
    return '<a class="evt-row evt-src-' + esc(e.source) + '" href="' + esc(e.url) + '" target="_blank" rel="noopener">' +
      '<span class="evt-date">' + esc(formatDate(date)) + '</span>' +
      '<span class="evt-row-time">' + esc(time ? time + ' Uhr' : '') + '</span>' +
      '<span><span class="evt-row-title">' + esc(e.title) + '</span>' +
      '<span class="evt-row-src" data-meta="' + esc(mobileMeta ? mobileMeta + ' · ' : '') + '">' + esc(src.label) + '</span></span>' +
      '<span class="evt-row-loc">' + esc(e.location || '') + '</span>' +
      '<span class="evt-arrow">' + ARROW + '</span>' +
      '</a>';
  }

  function listHtml(items) {
    var html = '';
    var lastMonth = '';
    items.forEach(function (e) {
      var month = part(new Date(e.start), { month: 'long', year: 'numeric' });
      if (month !== lastMonth) {
        html += '<div class="evt-month">' + esc(month) + '</div>';
        lastMonth = month;
      }
      html += rowHtml(e);
    });
    return html;
  }

  function build(allItems) {
    var items = allItems.slice(0, TICKER_ITEMS);
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    var root = document.createElement('aside');
    root.className = 'evt';
    root.setAttribute('aria-label', 'Nächste Termine');
    root.innerHTML =
      '<button type="button" class="evt-label" aria-expanded="false" aria-controls="evt-panel" title="Alle Termine anzeigen"><span class="evt-dot"></span><span class="evt-label-text">Nächste Termine</span>' + CHEVRON + '</button>' +
      '<div class="evt-stage">' + items.map(itemHtml).join('') + '</div>' +
      '<div class="evt-progress"></div>';

    var panel = document.createElement('section');
    panel.className = 'evt-panel';
    panel.id = 'evt-panel';
    panel.setAttribute('aria-label', 'Alle kommenden Termine');
    panel.innerHTML =
      '<div class="evt-panel-head"><h2>Kommende Termine</h2>' +
      '<span class="evt-count">' + allItems.length + (allItems.length === 1 ? ' Termin' : ' Termine') + '</span>' +
      '<span class="evt-legend"><span><i style="background:#a78bfa"></i>Kreatief</span><span><i style="background:#22d3ee"></i>Voctails</span></span>' +
      '<button type="button" class="evt-close" aria-label="Terminübersicht schließen">&times;</button></div>' +
      '<div class="evt-list">' + listHtml(allItems) + '</div>';

    var backdrop = document.createElement('div');
    backdrop.className = 'evt-backdrop';

    var spacer = document.createElement('div');
    spacer.className = 'evt-spacer';
    document.body.appendChild(spacer);
    document.body.appendChild(backdrop);
    document.body.appendChild(panel);
    document.body.appendChild(root);
    document.documentElement.classList.add('has-evt');

    var labelBtn = root.querySelector('.evt-label');
    var isOpen = false;

    function setOpen(open) {
      if (open === isOpen) return;
      isOpen = open;
      panel.classList.toggle('is-open', open);
      backdrop.classList.toggle('is-open', open);
      root.classList.toggle('is-open', open);
      labelBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) {
        hold('panel');
        panel.querySelector('.evt-list').scrollTop = 0;
      } else {
        release('panel');
      }
    }

    labelBtn.addEventListener('click', function () { setOpen(!isOpen); });
    panel.querySelector('.evt-close').addEventListener('click', function () {
      setOpen(false);
      labelBtn.focus();
    });
    backdrop.addEventListener('click', function () { setOpen(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen) setOpen(false);
    });
    document.addEventListener('click', function (e) {
      if (isOpen && !panel.contains(e.target) && !root.contains(e.target)) setOpen(false);
    });

    var els = root.querySelectorAll('.evt-item');
    var progress = root.querySelector('.evt-progress');
    var current = 0;
    var timer = null;
    var armed = false; // läuft der Wechsel-Zyklus?
    var holds = {};
    var remaining = INTERVAL_MS;
    var startedAt = 0;
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var interval = reduced ? INTERVAL_MS * 1.6 : INTERVAL_MS;

    var rotating = els.length > 1;

    // Mehrere Gründe können die Rotation anhalten (Maus, Fokus, Übersicht offen, Tab im Hintergrund).
    function hold(reason) {
      var wasRunning = !Object.keys(holds).length;
      holds[reason] = true;
      root.classList.add('is-held');
      if (wasRunning) {
        clearTimeout(timer);
        remaining = Math.max(300, remaining - (Date.now() - startedAt));
        if (marquee) marquee.pause();
      }
    }

    function release(reason) {
      if (!holds[reason]) return;
      delete holds[reason];
      if (Object.keys(holds).length) return;
      root.classList.remove('is-held');
      if (marquee) marquee.play();
      if (armed) schedule(remaining);
    }

    var MARQUEE_SPEED = 40; // px pro Sekunde
    var MARQUEE_DELAY = 1200; // erst kurz stillstehen, dann laufen
    var MARQUEE_END_PAUSE = 1400; // am Ende kurz stehen lassen
    var marquee = null;

    // Passt der Titel nicht, läuft er als Laufschrift durch. Liefert, wie lange der Termin stehen soll.
    function prepareItem(el) {
      var title = el.querySelector('.evt-title');
      var inner = el.querySelector('.evt-title-inner');
      title.classList.remove('is-marquee', 'is-running');
      inner.style.transform = '';
      // Auch bei "Bewegung reduzieren" (iPhone-Einstellung) laufen lassen – sonst wären lange Titel nicht lesbar.
      var distance = inner.scrollWidth - title.clientWidth;
      if (distance <= 2) {
        title.classList.remove('is-marquee');
        return interval;
      }
      title.classList.add('is-marquee');
      distance = inner.scrollWidth - title.clientWidth + 26; // bis hinter die Ausblendung
      var runMs = Math.round((distance / MARQUEE_SPEED) * 1000);
      if (inner.animate) {
        marquee = inner.animate(
          [{ transform: 'translateX(0)' }, { transform: 'translateX(' + -distance + 'px)' }],
          { duration: runMs, delay: MARQUEE_DELAY, easing: 'linear', fill: 'forwards' }
        );
        setTimeout(function () { title.classList.add('is-running'); }, MARQUEE_DELAY);
        if (Object.keys(holds).length) marquee.pause();
      }
      return Math.max(interval, MARQUEE_DELAY + runMs + MARQUEE_END_PAUSE);
    }

    function resetItem(el) {
      var inner = el.querySelector('.evt-title-inner');
      inner.getAnimations && inner.getAnimations().forEach(function (a) { a.cancel(); });
      el.querySelector('.evt-title').classList.remove('is-running');
    }

    els[0].classList.add('is-active');
    requestAnimationFrame(function () { root.classList.add('is-ready'); });

    function restartProgress(ms) {
      progress.classList.remove('is-running');
      void progress.offsetWidth; // Animation neu starten
      progress.style.animationDuration = ms + 'ms';
      progress.classList.add('is-running');
    }

    function show(next) {
      var prev = els[current];
      marquee = null;
      if (prev !== els[next]) {
        prev.classList.remove('is-active');
        prev.classList.add('is-leaving');
        setTimeout(function () {
          prev.classList.remove('is-leaving');
          resetItem(prev);
        }, 650);
      } else {
        resetItem(prev);
      }
      current = next;
      els[current].classList.add('is-active');
    }

    function startCurrent() {
      var ms = prepareItem(els[current]);
      if (!rotating && ms === interval) return; // einzelner, kurzer Termin: nichts zu tun
      restartProgress(ms);
      schedule(ms);
    }

    function schedule(ms) {
      armed = true;
      clearTimeout(timer);
      startedAt = Date.now();
      remaining = ms;
      if (Object.keys(holds).length) return;
      timer = setTimeout(function () {
        show((current + 1) % els.length);
        startCurrent();
      }, ms);
    }

    // Nur echte Maus-Geräte pausieren beim Drüberfahren: Auf dem Handy "klebt" hover/focus nach
    // einem Antippen (z. B. nach Rückkehr aus dem neuen Tab) und würde den Ticker dauerhaft anhalten.
    var canHover = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (canHover) {
      root.addEventListener('mouseenter', function () { hold('hover'); });
      root.addEventListener('mouseleave', function () { release('hover'); });
    }
    root.addEventListener('focusin', function (e) {
      if (e.target.matches && e.target.matches(':focus-visible')) hold('focus');
    });
    root.addEventListener('focusout', function () { release('focus'); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) hold('hidden');
      else release('hidden');
    });

    // Webfonts/Layout abwarten, damit die Titelbreite stimmt
    requestAnimationFrame(function () { setTimeout(startCurrent, 50); });
  }

  function start() {
    fetch('/api/events-ticker')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var items = (data && Array.isArray(data.items) ? data.items : []).filter(function (e) {
          return e && e.title && e.start && e.url;
        });
        if (items.length) build(items);
      })
      .catch(function () {});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
