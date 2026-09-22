// Links auf fremde Seiten immer in einem neuen Tab öffnen – Besucher sollen auf
// martinrenner.de bleiben. Greift auch für Links, die erst später per Script entstehen.
(function () {
  function isExternal(a) {
    return /^https?:$/.test(a.protocol) && a.host !== location.host;
  }

  function markExternal(a) {
    a.target = '_blank';
    var rel = (a.getAttribute('rel') || '').split(/\s+/);
    if (rel.indexOf('noopener') === -1) rel.push('noopener');
    a.setAttribute('rel', rel.join(' ').trim());
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (a && isExternal(a) && a.target !== '_blank') markExternal(a);
  }, true);

  document.querySelectorAll('a[href]').forEach(function (a) {
    if (isExternal(a)) markExternal(a);
  });
})();
