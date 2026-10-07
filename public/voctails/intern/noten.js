'use strict';
// Voctails Intern – Noten-Ansicht mit Chorleiter-Version.
// Die PDF-Seiten werden mit PDF.js gezeichnet; darüber liegt je Seite eine Zeichenebene.
// Der Chorleiter schreibt mit dem Apple Pencil (oder Maus) hinein, alle anderen sehen die Einträge.
// Striche werden als Vektoren gespeichert: Koordinaten relativ zur Seitenbreite (x, y) + Druck.
window.VtNoten = (function () {
  const COLORS = [
    { c: '#d62828', n: 'Rot' },
    { c: '#1d4ed8', n: 'Blau' },
    { c: '#111111', n: 'Schwarz' },
    { c: '#15803d', n: 'Grün' },
    { c: '#f59e0b', n: 'Gelb' },
  ];
  const SIZES = { pen: [0.0016, 0.0028, 0.0048], hl: [0.012, 0.02, 0.03] };
  const ZOOMS = [1, 1.25, 1.5, 1.75, 2, 2.5];
  const ERASE_R = 0.012;

  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const esc = (str) => String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let pdfjsReady = null;
  function loadPdfJs() {
    if (!pdfjsReady) {
      pdfjsReady = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = '/vendor/pdfjs/pdf.min.js';
        s.onload = () => {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.js';
          resolve(window.pdfjsLib);
        };
        s.onerror = () => { pdfjsReady = null; reject(new Error('PDF.js konnte nicht geladen werden')); };
        document.head.appendChild(s);
      });
    }
    return pdfjsReady;
  }

  // Strich zeichnen. W = Seitenbreite in Canvas-Pixeln.
  function drawStroke(ctx, st, W) {
    const p = st.p;
    if (!p.length) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = st.c;
    ctx.fillStyle = st.c;
    if (st.t === 'hl') {
      ctx.globalAlpha = 0.32;
      ctx.lineWidth = st.w * W;
      ctx.beginPath();
      ctx.moveTo(p[0] * W, p[1] * W);
      if (p.length === 3) ctx.lineTo(p[0] * W + 0.1, p[1] * W);
      for (let i = 3; i < p.length; i += 3) ctx.lineTo(p[i] * W, p[i + 1] * W);
      ctx.stroke();
    } else if (p.length === 3) {
      ctx.beginPath();
      ctx.arc(p[0] * W, p[1] * W, (st.w * W * (0.6 + p[2] * 0.8)) / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Linienbreite folgt dem Druck des Stifts
      for (let i = 3; i < p.length; i += 3) {
        ctx.lineWidth = st.w * W * (0.6 + ((p[i - 1] + p[i + 2]) / 2) * 0.8);
        ctx.beginPath();
        ctx.moveTo(p[i - 3] * W, p[i - 2] * W);
        ctx.lineTo(p[i] * W, p[i + 1] * W);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function hitStroke(st, x, y, r) {
    const p = st.p;
    const rr = r + st.w / 2;
    for (let i = 0; i < p.length; i += 3) {
      const dx = p[i] - x;
      const dy = p[i + 1] - y;
      if (dx * dx + dy * dy < rr * rr) return true;
      if (i >= 3) {
        // Abstand zur Strecke
        const ax = p[i - 3], ay = p[i - 2], bx = p[i], by = p[i + 1];
        const vx = bx - ax, vy = by - ay;
        const len = vx * vx + vy * vy;
        if (len) {
          const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / len));
          const qx = ax + t * vx - x, qy = ay + t * vy - y;
          if (qx * qx + qy * qy < rr * rr) return true;
        }
      }
    }
    return false;
  }

  /**
   * opts: { pdfUrl, pdfName, notesUrl, leiter, title }
   */
  function render(root, opts) {
    const leiter = !!opts.leiter;
    let notes = { pages: {}, updatedAt: 0, pdf: '' };
    let showNotes = lsGet('vt-notes-show') !== '0';
    let editing = false;
    let tool = 'pen';
    let color = lsGet('vt-pen-color') || COLORS[0].c;
    let sizeIdx = Number(lsGet('vt-pen-size')) || 1;
    const touchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    let penOnly = touchDevice ? lsGet('vt-pen-only') !== '0' : false;
    let zoomIdx = Math.max(0, ZOOMS.indexOf(Number(lsGet('vt-noten-zoom'))));
    const undo = [];
    const redo = [];
    let dirty = false;
    let saveTimer = null;
    let destroyed = false;
    let pages = [];

    root.innerHTML = `<div class="nt">
      <div class="nt-bar">
        <div class="nt-row">
          <span class="nt-group nt-view">
            <button type="button" class="nt-btn" data-zoom="-1" aria-label="Noten kleiner">A−</button>
            <button type="button" class="nt-btn" data-zoom="1" aria-label="Noten größer">A+</button>
          </span>
          <label class="nt-toggle" id="nt-show-wrap" hidden><input type="checkbox" id="nt-show"${showNotes ? ' checked' : ''}><span class="switch"></span> Chorleiter-Version</label>
          ${leiter ? '<button type="button" class="nt-btn nt-edit" id="nt-edit">✎ Schreiben</button>' : ''}
          <span class="nt-status" id="nt-status"></span>
          <a class="nt-btn ghost" href="${esc(opts.pdfUrl)}" target="_blank" rel="noopener" title="Original-PDF öffnen">PDF</a>
        </div>
        ${leiter ? `<div class="nt-row nt-tools" id="nt-tools" hidden>
          <span class="nt-group">
            <button type="button" class="nt-tool" data-tool="pen" title="Stift">✏️</button>
            <button type="button" class="nt-tool" data-tool="hl" title="Textmarker">🖍️</button>
            <button type="button" class="nt-tool" data-tool="erase" title="Radierer (ganzen Strich löschen)">⌫</button>
          </span>
          <span class="nt-group">${COLORS.map((c) => `<button type="button" class="nt-color" data-color="${c.c}" title="${c.n}" style="--c:${c.c}"></button>`).join('')}</span>
          <span class="nt-group">${[0, 1, 2].map((i) => `<button type="button" class="nt-size" data-size="${i}" title="${['dünn', 'mittel', 'dick'][i]}"><span style="--s:${4 + i * 4}px"></span></button>`).join('')}</span>
          <span class="nt-group">
            <button type="button" class="nt-btn" id="nt-undo" title="Rückgängig">↶</button>
            <button type="button" class="nt-btn" id="nt-redo" title="Wiederholen">↷</button>
          </span>
          ${touchDevice ? `<label class="nt-toggle" title="Mit dem Finger blättern, mit dem Apple Pencil schreiben"><input type="checkbox" id="nt-penonly"${penOnly ? ' checked' : ''}><span class="switch"></span> Nur Pencil</label>` : ''}
        </div>` : ''}
        <p class="nt-warn" id="nt-warn" hidden></p>
      </div>
      <div class="nt-scroll"><div class="nt-pages"><p class="msg">Noten werden geladen …</p></div></div>
    </div>`;

    const $ = (sel) => root.querySelector(sel);
    const pagesEl = $('.nt-pages');
    const scrollEl = $('.nt-scroll');
    const status = $('#nt-status');
    const ntRoot = $('.nt');

    function setStatus(text, cls) {
      status.textContent = text || '';
      status.className = 'nt-status' + (cls ? ' ' + cls : '');
    }

    function hasNotes() {
      return Object.values(notes.pages).some((l) => l && l.length);
    }

    function updateBar() {
      const wrap = $('#nt-show-wrap');
      wrap.hidden = leiter ? !hasNotes() || editing : !hasNotes();
      if (!leiter && hasNotes() && notes.updatedAt) {
        setStatus('Stand ' + new Date(notes.updatedAt).toLocaleDateString('de-DE'));
      }
      if (!leiter) return;
      $('#nt-edit').classList.toggle('on', editing);
      $('#nt-edit').textContent = editing ? '✓ Fertig' : '✎ Schreiben';
      $('#nt-tools').hidden = !editing;
      root.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === tool));
      root.querySelectorAll('[data-color]').forEach((b) => b.classList.toggle('on', b.dataset.color === color));
      root.querySelectorAll('[data-size]').forEach((b) => b.classList.toggle('on', Number(b.dataset.size) === sizeIdx));
      $('#nt-undo').disabled = !undo.length;
      $('#nt-redo').disabled = !redo.length;
      ntRoot.classList.toggle('editing', editing);
      ntRoot.classList.toggle('pen-only', editing && penOnly);
      ntRoot.classList.toggle('draw-all', editing && !penOnly);
    }

    // --- Notizen laden & speichern ---
    async function loadNotes() {
      try {
        const r = await fetch(opts.notesUrl, { credentials: 'same-origin', cache: 'no-store' });
        if (!r.ok) throw new Error();
        const body = await r.json();
        notes = { pages: body.pages || {}, updatedAt: body.updatedAt || 0, pdf: body.pdf || '' };
      } catch (e) {
        notes = { pages: {}, updatedAt: 0, pdf: '' };
      }
      if (leiter && notes.pdf && opts.pdfName && notes.pdf !== opts.pdfName) {
        const w = $('#nt-warn');
        w.hidden = false;
        w.textContent = `Hinweis: Die Einträge wurden auf „${notes.pdf}“ gemacht, die Noten heißen jetzt „${opts.pdfName}“. Bitte prüfen, ob sie noch passen.`;
      }
      updateBar();
      pages.forEach(drawOverlay);
    }

    function scheduleSave() {
      dirty = true;
      setStatus('Ungespeichert …');
      clearTimeout(saveTimer);
      saveTimer = setTimeout(save, 1200);
    }

    async function save() {
      clearTimeout(saveTimer);
      if (!dirty) return;
      dirty = false;
      setStatus('Speichert …');
      try {
        const r = await fetch(opts.notesUrl, {
          method: 'PUT',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ pages: notes.pages, pdf: opts.pdfName || '' }),
          keepalive: false,
        });
        const body = await r.json().catch(() => ({}));
        if (!r.ok || !body.ok) throw new Error(body.error || 'Fehler ' + r.status);
        notes.updatedAt = body.updatedAt;
        if (!destroyed) setStatus('Gespeichert ✓', 'ok');
      } catch (e) {
        dirty = true;
        if (!destroyed) setStatus('Nicht gespeichert – ' + (navigator.onLine ? e.message : 'offline') + '. Neuer Versuch …', 'err');
        clearTimeout(saveTimer);
        saveTimer = setTimeout(save, 5000);
      }
    }

    const onHide = () => { if (document.visibilityState === 'hidden' && dirty) save(); };
    document.addEventListener('visibilitychange', onHide);
    const onUnload = (e) => { if (dirty) { save(); e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', onUnload);

    // --- Seiten ---
    function applyZoom() {
      pagesEl.style.width = ZOOMS[zoomIdx] * 100 + '%';
    }

    function sizeOverlay(p) {
      const r = p.wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const w = Math.round(r.width * dpr);
      const h = Math.round(r.height * dpr);
      if (p.ov.width !== w || p.ov.height !== h) {
        p.ov.width = w;
        p.ov.height = h;
      }
    }

    function drawOverlay(p) {
      if (!p.visible) return;
      sizeOverlay(p);
      const ctx = p.ov.getContext('2d');
      ctx.clearRect(0, 0, p.ov.width, p.ov.height);
      if (!showNotes && !editing) return;
      const W = p.ov.width;
      (notes.pages[p.n] || []).forEach((st) => drawStroke(ctx, st, W));
      if (p.live) drawStroke(ctx, p.live, W);
    }

    function drawPdf(p) {
      const cssWidth = p.wrap.clientWidth;
      if (!cssWidth || (p.canvas && Math.abs(p.width - cssWidth) < 2)) return;
      let scale = (cssWidth * Math.min(window.devicePixelRatio || 1, 3)) / p.vp.width;
      const maxPixels = 6e6;
      if (p.vp.width * p.vp.height * scale * scale > maxPixels) scale = Math.sqrt(maxPixels / (p.vp.width * p.vp.height));
      const viewport = p.page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.className = 'nt-pdf';
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      if (p.task) p.task.cancel();
      p.task = p.page.render({ canvasContext: canvas.getContext('2d'), viewport });
      p.width = cssWidth;
      p.task.promise.then(() => {
        p.task = null;
        if (!p.visible) return free(canvas);
        if (p.canvas) free(p.canvas);
        p.canvas = canvas;
        p.wrap.prepend(canvas);
      }, () => free(canvas));
    }

    function free(canvas) {
      canvas.width = 0;
      canvas.height = 0;
      canvas.remove();
    }

    async function loadPdf() {
      try {
        const pdfjsLib = await loadPdfJs();
        const doc = await pdfjsLib.getDocument({ url: opts.pdfUrl, isEvalSupported: false, withCredentials: true }).promise;
        if (destroyed) return;
        pagesEl.innerHTML = '';
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          if (destroyed) return;
          const vp = page.getViewport({ scale: 1 });
          const wrap = document.createElement('div');
          wrap.className = 'nt-page';
          wrap.style.aspectRatio = vp.width + ' / ' + vp.height;
          wrap.innerHTML = `<canvas class="nt-ov"></canvas><span class="nt-page-no">${i} / ${doc.numPages}</span>`;
          pagesEl.appendChild(wrap);
          const p = { n: i, page, wrap, vp, ov: wrap.querySelector('.nt-ov'), canvas: null, width: 0, task: null, visible: false, live: null };
          pages.push(p);
          bindDrawing(p);
        }
        setupPages();
      } catch (err) {
        console.error(err);
        pagesEl.innerHTML = `<p class="msg error">Die Noten konnten nicht angezeigt werden${navigator.onLine ? '' : ' (offline und nicht gespeichert)'}.</p>`;
      }
    }

    let io = null;
    let ro = null;
    let redrawTimer = null;
    function redrawAll() {
      clearTimeout(redrawTimer);
      redrawTimer = setTimeout(() => pages.forEach((p) => { if (p.visible) { drawPdf(p); drawOverlay(p); } }), 150);
    }
    function setupPages() {
      io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          const p = pages.find((x) => x.wrap === entry.target);
          p.visible = entry.isIntersecting;
          if (p.visible) { drawPdf(p); drawOverlay(p); }
          else {
            if (p.canvas) { free(p.canvas); p.canvas = null; p.width = 0; }
            p.ov.width = 0;
            p.ov.height = 0;
          }
        });
      }, { rootMargin: '150% 0px' });
      pages.forEach((p) => io.observe(p.wrap));
      if (window.ResizeObserver) {
        ro = new ResizeObserver(redrawAll);
        ro.observe(scrollEl);
      }
    }

    // --- Zeichnen ---
    function pointAt(p, e) {
      const r = p.wrap.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.width, pr: e.pressure || 0.5 };
    }

    function eraseAt(p, pt, op) {
      const list = notes.pages[p.n] || [];
      for (let i = list.length - 1; i >= 0; i--) {
        if (hitStroke(list[i], pt.x, pt.y, ERASE_R)) {
          op.removed.push({ stroke: list[i], page: p.n });
          list.splice(i, 1);
        }
      }
    }

    function bindDrawing(p) {
      if (!leiter) return;
      let drawingId = null;
      let eraseOp = null;
      p.ov.addEventListener('pointerdown', (e) => {
        if (!editing) return;
        if (penOnly && e.pointerType !== 'pen') return; // Finger blättern
        if (e.button > 0) return;
        e.preventDefault();
        p.ov.setPointerCapture(e.pointerId);
        drawingId = e.pointerId;
        const pt = pointAt(p, e);
        if (tool === 'erase') {
          eraseOp = { type: 'erase', removed: [] };
          eraseAt(p, pt, eraseOp);
          drawOverlay(p);
          return;
        }
        p.live = { t: tool, c: color, w: SIZES[tool][sizeIdx], p: [pt.x, pt.y, pt.pr] };
        drawOverlay(p);
      });
      p.ov.addEventListener('pointermove', (e) => {
        if (drawingId !== e.pointerId) return;
        e.preventDefault();
        const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
        if (tool === 'erase') {
          events.forEach((ev) => eraseAt(p, pointAt(p, ev), eraseOp));
          drawOverlay(p);
          return;
        }
        const last = p.live.p;
        events.forEach((ev) => {
          const pt = pointAt(p, ev);
          const lx = last[last.length - 3], ly = last[last.length - 2];
          if (Math.abs(pt.x - lx) + Math.abs(pt.y - ly) < 0.0008) return;
          last.push(pt.x, pt.y, pt.pr);
        });
        // Nur das neue Stück zeichnen wäre schneller – bei Notenseiten reicht das komplette Neuzeichnen
        drawOverlay(p);
      });
      const end = (e) => {
        if (drawingId !== e.pointerId) return;
        drawingId = null;
        if (tool === 'erase') {
          if (eraseOp && eraseOp.removed.length) { undo.push(eraseOp); redo.length = 0; scheduleSave(); }
          eraseOp = null;
          updateBar();
          return;
        }
        const st = p.live;
        p.live = null;
        if (!st) return;
        (notes.pages[p.n] = notes.pages[p.n] || []).push(st);
        undo.push({ type: 'add', page: p.n, stroke: st });
        redo.length = 0;
        drawOverlay(p);
        updateBar();
        scheduleSave();
      };
      p.ov.addEventListener('pointerup', end);
      p.ov.addEventListener('pointercancel', end);
    }

    // iPad: Mit dem Apple Pencil soll nicht gescrollt, sondern geschrieben werden
    const stopStylusScroll = (e) => {
      if (!editing) return;
      if ([...e.touches].some((t) => t.touchType === 'stylus') || !penOnly) e.preventDefault();
    };
    pagesEl.addEventListener('touchstart', stopStylusScroll, { passive: false });
    pagesEl.addEventListener('touchmove', stopStylusScroll, { passive: false });

    function pageOf(n) { return pages.find((p) => p.n === n); }
    function applyOp(op, reverse) {
      if (op.type === 'add') {
        const list = notes.pages[op.page] = notes.pages[op.page] || [];
        if (reverse) { const i = list.indexOf(op.stroke); if (i >= 0) list.splice(i, 1); }
        else list.push(op.stroke);
        const p = pageOf(op.page);
        if (p) drawOverlay(p);
      } else if (op.type === 'erase') {
        op.removed.forEach((r) => {
          const list = notes.pages[r.page] = notes.pages[r.page] || [];
          if (reverse) list.push(r.stroke);
          else { const i = list.indexOf(r.stroke); if (i >= 0) list.splice(i, 1); }
          const p = pageOf(r.page);
          if (p) drawOverlay(p);
        });
      }
    }

    // --- Leiste ---
    root.addEventListener('click', (e) => {
      const z = e.target.closest('[data-zoom]');
      if (z) {
        const before = scrollEl.scrollLeft / Math.max(1, scrollEl.scrollWidth);
        zoomIdx = Math.min(ZOOMS.length - 1, Math.max(0, zoomIdx + Number(z.dataset.zoom)));
        lsSet('vt-noten-zoom', ZOOMS[zoomIdx]);
        applyZoom();
        scrollEl.scrollLeft = before * scrollEl.scrollWidth;
        redrawAll();
        return;
      }
      if (!leiter) return;
      const t = e.target.closest('[data-tool]');
      if (t) { tool = t.dataset.tool; updateBar(); return; }
      const c = e.target.closest('[data-color]');
      if (c) {
        color = c.dataset.color;
        lsSet('vt-pen-color', color);
        if (tool === 'erase') tool = 'pen';
        updateBar();
        return;
      }
      const s = e.target.closest('[data-size]');
      if (s) { sizeIdx = Number(s.dataset.size); lsSet('vt-pen-size', String(sizeIdx)); updateBar(); return; }
      if (e.target.closest('#nt-edit')) {
        editing = !editing;
        if (!editing) save();
        updateBar();
        pages.forEach(drawOverlay);
        return;
      }
      if (e.target.closest('#nt-undo') && undo.length) {
        const op = undo.pop();
        applyOp(op, true);
        redo.push(op);
        updateBar();
        scheduleSave();
        return;
      }
      if (e.target.closest('#nt-redo') && redo.length) {
        const op = redo.pop();
        applyOp(op, false);
        undo.push(op);
        updateBar();
        scheduleSave();
      }
    });
    root.addEventListener('change', (e) => {
      if (e.target.id === 'nt-show') {
        showNotes = e.target.checked;
        lsSet('vt-notes-show', showNotes ? '1' : '0');
        pages.forEach(drawOverlay);
      }
      if (e.target.id === 'nt-penonly') {
        penOnly = e.target.checked;
        lsSet('vt-pen-only', penOnly ? '1' : '0');
        updateBar();
      }
    });

    applyZoom();
    updateBar();
    loadNotes();
    loadPdf();

    return {
      async destroy() {
        destroyed = true;
        if (dirty) await save();
        clearTimeout(saveTimer);
        document.removeEventListener('visibilitychange', onHide);
        window.removeEventListener('beforeunload', onUnload);
        if (io) io.disconnect();
        if (ro) ro.disconnect();
        pages.forEach((p) => { if (p.canvas) free(p.canvas); });
      },
      isDirty: () => dirty,
    };
  }

  return { render };
})();
