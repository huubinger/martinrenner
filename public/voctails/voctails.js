// Voctails-Seite: Navigation, Konzerttermine (Konzertmeister über /api/voctails-events),
// Foto-Lightbox und Kontaktformular (über /api/kontakt mit Rechenaufgabe).
(function () {
  var nav = document.getElementById('nav');
  function onScroll() {
    nav.classList.toggle('is-solid', window.scrollY > 40);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // --- Konzerte ---
  var eventsEl = document.getElementById('events');
  var MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

  function berlinParts(iso) {
    var parts = {};
    new Intl.DateTimeFormat('de-DE', {
      timeZone: 'Europe/Berlin', weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(iso)).forEach(function (p) { parts[p.type] = p.value; });
    return parts;
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  function renderEvents(items) {
    eventsEl.textContent = '';
    if (!items.length) {
      eventsEl.appendChild(el('li', 'events-empty', 'Gerade stehen keine Termine fest. Am besten den Newsletter bestellen – dann erfährst du als Erste*r von neuen Konzerten.'));
      return;
    }
    items.forEach(function (e) {
      var p = berlinParts(e.start);
      var li = el('li', 'event');
      var date = el('div', 'event-date');
      date.appendChild(el('span', 'd', p.day));
      date.appendChild(el('span', 'm', MONTHS[+p.month - 1] + ' ' + p.year));
      var info = el('div');
      info.appendChild(el('div', 'event-title', e.title));
      var meta = p.weekday + (e.allDay ? '' : ', ' + p.hour + ':' + p.minute + ' Uhr') + (e.location ? ' · ' + e.location : '');
      info.appendChild(el('div', 'event-meta', meta));
      li.appendChild(date);
      li.appendChild(info);
      eventsEl.appendChild(li);
    });
  }

  fetch('/api/voctails-events')
    .then(function (r) { return r.json(); })
    .then(function (data) { renderEvents(data.items || []); })
    .catch(function () { renderEvents([]); });

  // --- Lightbox ---
  var lb = document.getElementById('lightbox');
  var lbImg = lb.querySelector('img');
  document.getElementById('gallery').addEventListener('click', function (ev) {
    var img = ev.target.closest('button') && ev.target.closest('button').querySelector('img');
    if (!img) return;
    lbImg.src = img.src;
    lbImg.alt = img.alt;
    lb.hidden = false;
  });
  lb.addEventListener('click', function () { lb.hidden = true; });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') lb.hidden = true; });

  // --- Kontaktformular ---
  var form = document.getElementById('form');
  var status = form.querySelector('.form-status');
  var captchaQ = form.querySelector('.captcha-q');

  function loadCaptcha() {
    captchaQ.textContent = '…';
    form.dataset.captchaToken = '';
    fetch('/api/captcha')
      .then(function (r) { return r.json(); })
      .then(function (d) { captchaQ.textContent = d.question; form.dataset.captchaToken = d.token; })
      .catch(function () { captchaQ.textContent = '?'; });
  }
  loadCaptcha();

  // "Jetzt melden" bei Mitsingen füllt die Nachricht vor.
  document.querySelectorAll('[data-topic]').forEach(function (a) {
    a.addEventListener('click', function () {
      var msg = form.elements.message;
      if (!msg.value.trim()) msg.value = a.dataset.topic + '\n\n';
    });
  });

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var f = form.elements;
    status.className = 'form-status';
    if (!f.name.value.trim() || !f.email.value.trim() || !f.message.value.trim() || !f.captchaAnswer.value.trim()) {
      status.textContent = 'Bitte fülle alle Felder aus.';
      status.classList.add('is-error');
      return;
    }
    var btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    status.textContent = 'Wird gesendet …';
    fetch('/api/kontakt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: f.name.value.trim(),
        email: f.email.value.trim(),
        message: f.message.value.trim(),
        website: f.website.value,
        captchaAnswer: f.captchaAnswer.value.trim(),
        captchaToken: form.dataset.captchaToken,
        source: 'voctails',
      }),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.ok) {
          form.reset();
          status.textContent = 'Danke! Deine Nachricht ist angekommen – wir melden uns.';
          status.classList.add('is-ok');
        } else {
          status.textContent = d.error || 'Das hat leider nicht geklappt.';
          status.classList.add('is-error');
        }
        loadCaptcha();
      })
      .catch(function () {
        status.textContent = 'Das hat leider nicht geklappt. Bitte schreib direkt an martin.renner@gmail.com.';
        status.classList.add('is-error');
      })
      .finally(function () { btn.disabled = false; });
  });
})();
