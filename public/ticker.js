// Eventticker: schwebende Leiste unten mit den nächsten Terminen (Kreatief + Voctails).
// Wird auf allen Seiten eingebunden; Daten kommen gecacht vom Server (/api/events-ticker).
(function () {
  if (window.__eventTicker) return;
  window.__eventTicker = true;

  var INTERVAL_MS = 5000;
  var SOURCES = {
    kreatief: { label: 'Kreatief' },
    voctails: { label: 'Voctails' },
  };

  var CSS = `
  .evt {
    --evt-bottom: 14px;
    position: fixed;
    left: 50%;
    bottom: var(--evt-bottom);
    z-index: 12;
    width: min(560px, calc(100vw - 2rem));
    height: 46px;
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
    padding: 0 0.95rem 0 1.05rem;
    border-right: 1px solid rgba(255,255,255,0.1);
    color: #94a3b8;
    font-size: 0.64rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    white-space: nowrap;
  }
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
  .evt:hover .evt-progress.is-running,
  .evt:focus-within .evt-progress.is-running { animation-play-state: paused; }
  @keyframes evt-progress { from { transform: scaleX(0); } to { transform: scaleX(1); } }

  /* Unterhalb dieser Breite stößt die Leiste an den Impressum/Datenschutz-Footer rechts unten -> darüber setzen */
  @media (max-width: 1100px) {
    .evt { --evt-bottom: 2.4rem; }
  }
  @media (max-width: 600px) {
    .evt { height: 44px; }
    .evt-label { padding: 0 0.75rem 0 0.9rem; }
    .evt-label-text { display: none; }
    .evt-item { gap: 0.5rem; padding: 0 0.55rem 0 0.6rem; }
    .evt-title { font-size: 0.8rem; }
  }
  @media (prefers-reduced-motion: reduce) {
    .evt, .evt-item { transition: none; }
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
      '<span class="evt-text"><span class="evt-title">' + esc(e.title) + '</span>' +
      '<span class="evt-meta">' + esc(meta.join(' · ')) + '</span></span>' +
      '<span class="evt-arrow">' + ARROW + '</span>' +
      '</a>';
  }

  function build(items) {
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    var root = document.createElement('aside');
    root.className = 'evt';
    root.setAttribute('aria-label', 'Nächste Termine');
    root.innerHTML =
      '<div class="evt-label"><span class="evt-dot"></span><span class="evt-label-text">Nächste Termine</span></div>' +
      '<div class="evt-stage">' + items.map(itemHtml).join('') + '</div>' +
      '<div class="evt-progress"></div>';

    var spacer = document.createElement('div');
    spacer.className = 'evt-spacer';
    document.body.appendChild(spacer);
    document.body.appendChild(root);
    document.documentElement.classList.add('has-evt');

    var els = root.querySelectorAll('.evt-item');
    var progress = root.querySelector('.evt-progress');
    var current = 0;
    var timer = null;
    var paused = false;
    var remaining = INTERVAL_MS;
    var startedAt = 0;
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var interval = reduced ? INTERVAL_MS * 1.6 : INTERVAL_MS;

    els[0].classList.add('is-active');
    requestAnimationFrame(function () { root.classList.add('is-ready'); });
    if (els.length < 2) return;

    function restartProgress() {
      progress.classList.remove('is-running');
      void progress.offsetWidth; // Animation neu starten
      progress.style.animationDuration = interval + 'ms';
      progress.classList.add('is-running');
    }

    function show(next) {
      var prev = els[current];
      prev.classList.remove('is-active');
      prev.classList.add('is-leaving');
      setTimeout(function () { prev.classList.remove('is-leaving'); }, 650);
      current = next;
      els[current].classList.add('is-active');
    }

    function schedule(ms) {
      clearTimeout(timer);
      startedAt = Date.now();
      remaining = ms;
      timer = setTimeout(function () {
        show((current + 1) % els.length);
        restartProgress();
        schedule(interval);
      }, ms);
    }

    function pause() {
      if (paused) return;
      paused = true;
      clearTimeout(timer);
      remaining = Math.max(300, remaining - (Date.now() - startedAt));
    }

    function resume() {
      if (!paused) return;
      paused = false;
      schedule(remaining);
    }

    root.addEventListener('mouseenter', pause);
    root.addEventListener('mouseleave', resume);
    root.addEventListener('focusin', pause);
    root.addEventListener('focusout', resume);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) pause();
      else resume();
    });

    restartProgress();
    schedule(interval);
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
