(function () {
  'use strict';

  var DATA = null;
  var listEl = document.getElementById('list');
  var resultsEl = document.getElementById('results');
  var yearsEl = document.getElementById('years');
  var q = document.getElementById('q');
  var qClear = document.getElementById('q-clear');

  var ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>';
  var ICON_DOWN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  var MONATE = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];
  var TAGE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Für die Suche: Groß-/Kleinschreibung, Umlaute und Akzente egal
  function norm(s) {
    return String(s || '').toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function dauer(sek) {
    if (!sek) return '';
    var min = Math.round(sek / 60);
    if (min < 60) return min + ' Min.';
    var h = Math.floor(min / 60), m = min % 60;
    return h + ' Std.' + (m ? ' ' + m + ' Min.' : '');
  }

  function datum(iso) {
    if (!iso) return '';
    var d = new Date(iso + 'T12:00:00');
    if (isNaN(d)) return '';
    return TAGE[d.getDay()] + ', ' + d.getDate() + '. ' + MONATE[d.getMonth()] + ' ' + d.getFullYear();
  }

  function ytUrl(id) { return 'https://www.youtube.com/watch?v=' + encodeURIComponent(id); }
  function ytAll(ids) { return 'https://www.youtube.com/watch_videos?video_ids=' + ids.map(encodeURIComponent).join(','); }
  function thumb(id) { return '/musicals/thumbs/' + id + '.jpg'; }

  function showDauer(s) {
    return s.teile.reduce(function (a, t) { return a + (t.dauer || 0); }, 0);
  }

  // --- Wer spielte wann? ---------------------------------------------------
  // rollen: [{rolle, darsteller:[...]}]; Vorstellungen können eine eigene
  // "besetzung" {Rolle: Name} haben (Doppelbesetzungen). Ist eine Rolle
  // mehrfach besetzt und die Vorstellung ohne Angabe, ist es "unbekannt".
  function personInShow(m, person, show) {
    var roles = rolesOf(m, person);
    if (!roles.length) return 'nein';
    var status = 'nein';
    roles.forEach(function (r) {
      if (r.darsteller.length === 1 && !(show.besetzung && show.besetzung[r.rolle])) { status = 'ja'; return; }
      if (show.besetzung && show.besetzung[r.rolle]) {
        if (norm(show.besetzung[r.rolle]) === norm(person)) status = 'ja';
        return;
      }
      if (status !== 'ja') status = 'unbekannt';
    });
    if (status === 'nein' && (m.ensemble || []).some(function (n) { return norm(n) === norm(person); })) status = 'ja';
    return status;
  }

  function rolesOf(m, person) {
    var p = norm(person);
    return (m.rollen || []).filter(function (r) {
      return r.darsteller.some(function (n) { return norm(n) === p; });
    });
  }

  // --- Darstellung ----------------------------------------------------------
  function showCard(m, s, hit) {
    var first = s.teile[0];
    var total = showDauer(s);
    var parts = '';
    if (s.teile.length > 1) {
      parts += '<a class="all" href="' + ytAll(s.teile.map(function (t) { return t.yt; })) + '" target="_blank" rel="noopener">▶ Ganze Vorstellung</a>';
      parts += s.teile.map(function (t) {
        return '<a href="' + ytUrl(t.yt) + '" target="_blank" rel="noopener" title="' + esc(dauer(t.dauer)) + '">' + esc(t.label) + '</a>';
      }).join('');
    } else {
      parts += '<a class="all" href="' + ytUrl(first.yt) + '" target="_blank" rel="noopener">▶ Abspielen</a>';
    }
    var cast = '';
    if (s.besetzung && Object.keys(s.besetzung).length) {
      // nur mehrfach besetzte Rollen zeigen – die übrigen sind ohnehin immer gleich
      var multi = {};
      (m.rollen || []).forEach(function (r) { if (r.darsteller.length > 1) multi[r.rolle] = 1; });
      var keys = Object.keys(s.besetzung).filter(function (r) { return multi[r] || !(m.rollen || []).length; });
      if (keys.length) {
        cast = '<details class="show-cast"><summary>Besetzung' + (s.besetzung_teilweise ? ' (teilweise bekannt)' : '') + '</summary>' +
          keys.map(function (r) { return esc(r) + ': <b>' + esc(s.besetzung[r]) + '</b>'; }).join('<br>') + '</details>';
      }
    } else if (s.cast) {
      cast = '<div class="show-cast">Besetzung <b>' + esc(s.cast) + '</b></div>';
    }
    return '<article class="show' + (hit ? ' hit' : '') + '">' +
      '<a class="show-thumb" href="' + (s.teile.length > 1 ? ytAll(s.teile.map(function (t) { return t.yt; })) : ytUrl(first.yt)) + '" target="_blank" rel="noopener" aria-label="' + esc(m.titel + ' – ' + s.name + ' abspielen') + '">' +
        '<img src="' + thumb(first.yt) + '" alt="" loading="lazy" width="320" height="180" onerror="this.style.display=\'none\'">' +
        '<span class="play">' + ICON_PLAY + '</span>' +
        (total ? '<span class="len">' + esc(dauer(total)) + '</span>' : '') +
      '</a>' +
      '<div class="show-info">' +
        '<div><div class="show-name">' + esc(s.name) + '</div>' +
        (s.datum ? '<div class="show-date">' + esc(datum(s.datum)) + '</div>' : '') + '</div>' +
        cast +
        (s.hinweis ? '<div class="show-cast">' + esc(s.hinweis) + '</div>' : '') +
        '<div class="parts">' + parts + '</div>' +
      '</div>' +
    '</article>';
  }

  function personBtn(name) {
    return '<button class="person" type="button" data-person="' + esc(name) + '">' + esc(name) + '</button>';
  }

  function castBlock(m) {
    if (!(m.rollen || []).length && !(m.ensemble || []).length) {
      return '<p class="note">Die Besetzung ist noch nicht eingetragen.</p>';
    }
    var html = '<div class="cast">' + (m.rollen || []).map(function (r) {
      return '<div class="cast-row"><span class="role">' + esc(r.rolle) + '</span><span class="names">' +
        r.darsteller.map(personBtn).join(' / ') + '</span></div>';
    }).join('') + '</div>';
    if ((m.ensemble || []).length) {
      html += '<p class="ensemble"><b>Ensemble:</b> ' + m.ensemble.map(personBtn).join(', ') + '</p>';
    }
    if (m.besetzung_hinweis) html += '<p class="note">' + esc(m.besetzung_hinweis) + '</p>';
    var doppelt = (m.rollen || []).some(function (r) { return r.darsteller.length > 1; });
    var proAbend = m.vorstellungen.some(function (s) { return s.besetzung; });
    if (doppelt && !proAbend && m.vorstellungen.length) {
      html += '<p class="note">Die Rollen waren doppelt besetzt. Wer an welchem Abend gespielt hat, ist leider nicht festgehalten.</p>';
    }
    return html;
  }

  function sectionShows(m, list, title) {
    if (!list.length) return '';
    return '<h3 class="sec">' + esc(title) + '</h3><div class="shows">' +
      list.map(function (s) { return showCard(m, s, false); }).join('') + '</div>';
  }

  function musicalBody(m) {
    var shows = m.vorstellungen.filter(function (s) { return s.art === 'show'; });
    var proben = m.vorstellungen.filter(function (s) { return s.art === 'probe'; });
    var extra = m.vorstellungen.filter(function (s) { return s.art === 'highlight'; });
    var team = m.team ? Object.keys(m.team).filter(function (k) { return m.team[k]; }).map(function (k) {
      return k + ': ' + m.team[k];
    }).join(' · ') : '';
    return (m.beschreibung ? '<p class="m-desc">' + esc(m.beschreibung) + '</p>' : '') +
      (team ? '<p class="m-team">' + esc(team) + '</p>' : '') +
      sectionShows(m, shows, shows.length === 1 ? 'Vorstellung' : 'Vorstellungen') +
      sectionShows(m, extra, 'Highlights') +
      sectionShows(m, proben, 'Proben') +
      (m.vorstellungen.length ? '' : '<p class="note" style="margin-top:1.1rem">Von diesem Musical gibt es keine Aufzeichnung auf YouTube.</p>') +
      '<h3 class="sec">Besetzung</h3>' + castBlock(m);
  }

  function countShows(m) {
    return m.vorstellungen.filter(function (s) { return s.art === 'show'; }).length;
  }

  function musicalCard(m) {
    var n = countShows(m);
    var cover = m.cover || (m.vorstellungen[0] && m.vorstellungen[0].teile[0].yt);
    var chips = [];
    if (n) chips.push('<span class="chip pink">' + n + (n === 1 ? ' Vorstellung' : ' Vorstellungen') + '</span>');
    var ex = m.vorstellungen.filter(function (s) { return s.art === 'highlight'; }).length;
    if (ex && !n) chips.push('<span class="chip">' + (ex === 1 ? m.vorstellungen.filter(function (s) { return s.art === 'highlight'; })[0].name : ex + ' Highlights') + '</span>');
    if (!m.vorstellungen.length) chips.push('<span class="chip">Keine Aufzeichnung</span>');
    if ((m.rollen || []).length) chips.push('<span class="chip">' + countPeople(m) + ' Mitwirkende</span>');
    return '<article class="musical" id="' + esc(m.id) + '" data-year="' + m.jahr + '">' +
      '<button class="m-head" type="button" aria-expanded="false">' +
        '<span class="m-cover">' + (cover ? '<img src="' + thumb(cover) + '" alt="" loading="lazy" width="320" height="180">' : '<span class="no-img">' + esc(m.titel.charAt(0)) + '</span>') + '</span>' +
        '<span><span class="m-year">' + m.jahr + '</span>' +
          '<span class="m-title" style="display:block">' + esc(m.titel) + '</span>' +
          (m.untertitel ? '<span class="m-sub" style="display:block">' + esc(m.untertitel) + '</span>' : '') +
          '<span class="m-chips">' + chips.join('') + '</span></span>' +
        '<span class="m-toggle">' + ICON_DOWN + '</span>' +
      '</button>' +
      '<div class="m-body" hidden></div>' +
    '</article>';
  }

  function countPeople(m) {
    var set = {};
    (m.rollen || []).forEach(function (r) { r.darsteller.forEach(function (n) { set[norm(n)] = 1; }); });
    (m.ensemble || []).forEach(function (n) { set[norm(n)] = 1; });
    return Object.keys(set).length;
  }

  function openMusical(el, open, scroll) {
    var body = el.querySelector('.m-body');
    var m = DATA.musicals.filter(function (x) { return x.id === el.id; })[0];
    if (open && !body.innerHTML) body.innerHTML = musicalBody(m);
    body.hidden = !open;
    el.classList.toggle('open', open);
    el.querySelector('.m-head').setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open && scroll) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderList() {
    listEl.innerHTML = DATA.musicals.map(musicalCard).join('');
    var years = [];
    DATA.musicals.forEach(function (m) { if (years.indexOf(m.jahr) < 0) years.push(m.jahr); });
    yearsEl.innerHTML = years.map(function (y) {
      var m = DATA.musicals.filter(function (x) { return x.jahr === y; })[0];
      return '<a href="#' + esc(m.id) + '">' + y + '</a>';
    }).join('');
    var shows = 0, videos = 0;
    DATA.musicals.forEach(function (m) {
      shows += countShows(m);
      m.vorstellungen.forEach(function (s) { videos += s.teile.length; });
    });
    document.getElementById('stats').textContent =
      DATA.musicals.length + ' Musicals · ' + shows + ' Vorstellungen · ' + videos + ' Videos';
  }

  // --- Suche -----------------------------------------------------------------
  function allPeople() {
    var map = {};
    DATA.musicals.forEach(function (m) {
      (m.rollen || []).forEach(function (r) { r.darsteller.forEach(function (n) { map[norm(n)] = map[norm(n)] || n; }); });
      (m.ensemble || []).forEach(function (n) { map[norm(n)] = map[norm(n)] || n; });
    });
    return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return a.localeCompare(b, 'de'); });
  }

  function personCard(name) {
    var blocks = [];
    var nMus = 0;
    DATA.musicals.forEach(function (m) {
      var roles = rolesOf(m, name);
      var inEns = (m.ensemble || []).some(function (n) { return norm(n) === norm(name); });
      if (!roles.length && !inEns) return;
      nMus++;
      var ja = [], unbekannt = [];
      m.vorstellungen.forEach(function (s) {
        if (s.art === 'highlight') return;
        var st = personInShow(m, name, s);
        if (st === 'ja') ja.push(s); else if (st === 'unbekannt') unbekannt.push(s);
      });
      var roleTxt = roles.map(function (r) { return r.rolle; }).join(', ') || 'Ensemble';
      var info = '';
      var alleShows = m.vorstellungen.filter(function (s) { return s.art !== 'highlight'; }).length;
      if (ja.length && ja.length === alleShows) info = ' – in allen Aufzeichnungen dabei';
      else if (ja.length) info = ' – in ' + ja.length + ' von ' + alleShows + ' Aufzeichnungen';
      var html = '<div class="p-musical"><h4><span class="m-year">' + m.jahr + '</span><a href="#' + esc(m.id) + '" data-open="' + esc(m.id) + '">' + esc(m.titel) + '</a></h4>' +
        '<p class="p-role">als <b>' + esc(roleTxt) + '</b>' + esc(info) + '</p>';
      if (ja.length) html += '<div class="shows">' + ja.map(function (s) { return showCard(m, s, true); }).join('') + '</div>';
      if (unbekannt.length) {
        html += '<details class="more"' + (ja.length ? '' : ' open') + '><summary>' + unbekannt.length +
          ' weitere Aufzeichnung' + (unbekannt.length === 1 ? '' : 'en') + ' – Besetzung dort nicht bekannt</summary><div class="shows" style="margin-top:.7rem">' +
          unbekannt.map(function (s) { return showCard(m, s, false); }).join('') + '</div></details>';
      }
      if (!ja.length && !unbekannt.length) html += '<p class="note">Von diesem Musical gibt es keine Aufzeichnung einer ganzen Vorstellung.</p>';
      blocks.push(html);
    });
    var frueher = Object.keys(DATA.aliase || {}).filter(function (a) { return DATA.aliase[a] === name; });
    return '<div class="person-card"><h3>' + esc(name) + (frueher.length ? ' <small style="font-weight:400;color:var(--muted);font-size:.9rem">(früher ' + esc(frueher.join(', ')) + ')</small>' : '') + '</h3><p class="p-sum">' + nMus +
      (nMus === 1 ? ' Musical' : ' Musicals') + '</p>' + blocks.join('') + '</div>';
  }

  function search(text) {
    var t = norm(text);
    qClear.hidden = !text;
    if (!t) {
      resultsEl.hidden = true;
      resultsEl.innerHTML = '';
      listEl.hidden = false;
      yearsEl.hidden = false;
      return;
    }
    var words = t.split(' ');
    var alias = DATA.aliase || {};
    var people = allPeople().filter(function (n) {
      var nn = norm(n) + ' ' + Object.keys(alias).filter(function (a) { return alias[a] === n; }).map(norm).join(' ');
      return words.every(function (w) { return nn.indexOf(w) >= 0; });
    });
    // Treffer über Rollennamen
    var roleHits = [];
    DATA.musicals.forEach(function (m) {
      (m.rollen || []).forEach(function (r) {
        var rr = norm(r.rolle);
        if (words.every(function (w) { return rr.indexOf(w) >= 0; })) roleHits.push({ m: m, r: r });
      });
    });
    var musHits = DATA.musicals.filter(function (m) {
      var mm = norm(m.titel + ' ' + m.jahr);
      return words.every(function (w) { return mm.indexOf(w) >= 0; });
    });

    var html = '';
    if (people.length === 1 || (people.length && norm(people[0]) === t)) {
      html += personCard(people[0]);
      people = people.slice(1);
    }
    if (people.length) {
      html += '<div class="res-head"><h2>Darsteller</h2></div><p>' + people.slice(0, 60).map(personBtn).join(', ') + '</p>';
    }
    if (roleHits.length) {
      html += '<div class="res-head"><h2>Rollen</h2></div>' + roleHits.slice(0, 40).map(function (h) {
        return '<div class="cast-row"><span class="role">' + esc(h.r.rolle) + ' <small>(' + esc(h.m.titel) + ' ' + h.m.jahr + ')</small></span><span class="names">' +
          h.r.darsteller.map(personBtn).join(' / ') + '</span></div>';
      }).join('');
    }
    if (musHits.length) {
      html += '<div class="res-head"><h2>Musicals</h2></div><p>' + musHits.map(function (m) {
        return '<a href="#' + esc(m.id) + '" data-open="' + esc(m.id) + '">' + esc(m.titel) + ' (' + m.jahr + ')</a>';
      }).join(' · ') + '</p>';
    }
    if (!html) html = '<p class="empty">Nichts gefunden für „' + esc(text) + '“.</p>';
    resultsEl.innerHTML = '<div class="res-head"><span></span><button type="button" id="res-close">Alle Musicals anzeigen</button></div>' + html;
    resultsEl.hidden = false;
    listEl.hidden = true;
    yearsEl.hidden = true;
  }

  function setSearch(text, push) {
    q.value = text;
    search(text);
    var hash = text ? '#suche=' + encodeURIComponent(text) : '';
    if (push !== false && location.hash !== hash) history.replaceState(null, '', hash || location.pathname);
    window.scrollTo({ top: text ? document.querySelector('main').offsetTop - 10 : 0, behavior: 'smooth' });
  }

  // --- Ereignisse ----------------------------------------------------------
  document.addEventListener('click', function (e) {
    var p = e.target.closest('.person');
    if (p) { setSearch(p.getAttribute('data-person')); return; }
    var head = e.target.closest('.m-head');
    if (head) {
      var el = head.parentNode;
      var open = !el.classList.contains('open');
      openMusical(el, open, false);
      history.replaceState(null, '', open ? '#' + el.id : location.pathname);
      return;
    }
    var o = e.target.closest('[data-open]');
    if (o) {
      e.preventDefault();
      setSearch('', false);
      var target = document.getElementById(o.getAttribute('data-open'));
      history.replaceState(null, '', '#' + target.id);
      openMusical(target, true, true);
      return;
    }
    if (e.target.id === 'res-close') setSearch('');
  });

  var timer = null;
  q.addEventListener('input', function () {
    clearTimeout(timer);
    timer = setTimeout(function () { setSearch(q.value.trim(), true); }, 180);
  });
  qClear.addEventListener('click', function () { setSearch(''); q.focus(); });

  yearsEl.addEventListener('click', function (e) {
    var a = e.target.closest('a');
    if (!a) return;
    e.preventDefault();
    var el = document.getElementById(a.getAttribute('href').slice(1));
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  function fromHash() {
    var h = decodeURIComponent(location.hash.slice(1));
    if (h.indexOf('suche=') === 0) { setSearch(h.slice(6), false); return; }
    var el = h && document.getElementById(h);
    if (el && el.classList.contains('musical')) openMusical(el, true, true);
  }

  window.addEventListener('hashchange', function () { if (DATA) fromHash(); });

  fetch('/musicals/data.json', { cache: 'no-cache' })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      DATA = d;
      renderList();
      document.getElementById('namen').innerHTML = allPeople().map(function (n) { return '<option value="' + esc(n) + '">'; }).join('');
      fromHash();
    })
    .catch(function () {
      listEl.innerHTML = '<p class="empty">Die Musical-Liste konnte nicht geladen werden.</p>';
    });
})();
