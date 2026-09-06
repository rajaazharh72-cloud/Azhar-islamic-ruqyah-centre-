/* ==========================================================================
   Dua Book — reading interactivity
   Progress bar · back-to-top · reading theme · in-book search · TOC scroll-spy
   · bookmark (resume) · share · print / save-as-PDF.
   Language switching and the navbar are handled by i18n.js + main.js.
   ========================================================================== */
(function () {
  'use strict';

  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  var content = $('#book-chapters');
  if (!content) return;

  var LS_BOOKMARK = 'book-bookmark';
  var LS_THEME = 'book-theme';
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---- tiny toast -------------------------------------------------------- */
  var toastEl, toastTimer;
  function toast(msg, actionLabel, onAction) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'book-toast';
      toastEl.setAttribute('role', 'status');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    if (actionLabel) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = actionLabel;
      b.addEventListener('click', function () { hide(); if (onAction) onAction(); });
      toastEl.appendChild(document.createTextNode(' '));
      toastEl.appendChild(b);
    }
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hide, actionLabel ? 8000 : 2600);
    function hide() { toastEl.classList.remove('is-on'); }
  }
  function t(en, ur) {
    return document.documentElement.getAttribute('data-lang') === 'ur' ? ur : en;
  }

  /* ---- reading progress + back-to-top ------------------------------------ */
  var bar = $('#book-progress-bar');
  var topBtn = $('#book-top');
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      var doc = document.documentElement;
      var max = doc.scrollHeight - doc.clientHeight;
      var p = max > 0 ? (doc.scrollTop || document.body.scrollTop) / max : 0;
      if (bar) bar.style.width = Math.min(100, Math.max(0, p * 100)) + '%';
      if (topBtn) topBtn.classList.toggle('is-shown', (doc.scrollTop || 0) > 700);
      updateSpy();
      ticking = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);

  if (topBtn) {
    topBtn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    });
  }

  /* ---- reading theme (light / dark) -------------------------------------- */
  var themeBtn = $('#book-theme');
  var themeIcon = $('#book-theme-icon');
  function syncTheme() {
    var light = document.documentElement.getAttribute('data-book-theme') === 'light';
    if (themeIcon) themeIcon.setAttribute('href', light ? '#i-moon' : '#i-sun');
    if (themeBtn) themeBtn.setAttribute('aria-label', light ? t('Switch to dark reading', 'گہرے پس منظر پر جائیں') : t('Switch to light reading', 'روشن پس منظر پر جائیں'));
  }
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var light = document.documentElement.getAttribute('data-book-theme') === 'light';
      if (light) document.documentElement.removeAttribute('data-book-theme');
      else document.documentElement.setAttribute('data-book-theme', 'light');
      try { localStorage.setItem(LS_THEME, light ? 'dark' : 'light'); } catch (e) {}
      syncTheme();
    });
    syncTheme();
  }

  /* ---- TOC scroll-spy ---------------------------------------------------- */
  var chapters = $$('.chapter', content);
  var tocLinks = $$('.book-toc a');
  function updateSpy() {
    if (!chapters.length) return;
    var y = (document.documentElement.scrollTop || 0) + (window.innerHeight * 0.28);
    var currentId = chapters[0].id;
    for (var i = 0; i < chapters.length; i++) {
      if (chapters[i].offsetTop <= y) currentId = chapters[i].id;
    }
    tocLinks.forEach(function (a) {
      var on = a.getAttribute('href') === '#' + currentId;
      if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    });
  }

  /* ---- search ------------------------------------------------------------ */
  var search = $('#book-search-input');
  var duas = $$('.dua', content);
  var noResults = null;

  function fold(s) {
    return (s || '')
      .toLowerCase()
      .replace(/[ً-ْٰـۖ-ۭ]/g, '') // harakat, dagger alif, tatweel
      .replace(/[آأإٱ]/g, 'ا')          // alif variants -> alif
      .replace(/[يىی]/g, 'ی')                // ya variants -> urdu ya
      .replace(/[كک]/g, 'ک')                      // kaf variants
      .replace(/[هةہھۃ]/g, 'ہ')    // ha variants
      .replace(/\s+/g, ' ')
      .trim();
  }

  function runSearch() {
    var q = fold(search.value);
    var shown = 0;
    duas.forEach(function (d) {
      var hay = fold(d.textContent);
      var match = !q || hay.indexOf(q) > -1;
      d.classList.toggle('is-hidden', !match);
      if (match) shown++;
    });
    // Hide chapters whose every dua is hidden
    chapters.forEach(function (ch) {
      var any = $$('.dua', ch).some(function (d) { return !d.classList.contains('is-hidden'); });
      ch.classList.toggle('is-hidden', q && !any);
    });
    if (!noResults) {
      noResults = document.createElement('p');
      noResults.className = 'book-noresults';
      noResults.setAttribute('role', 'status');
      noResults.hidden = true;
      content.appendChild(noResults);
    }
    noResults.textContent = t('Nothing matches that search.', 'اس تلاش سے کچھ نہیں ملا۔');
    noResults.hidden = !(q && shown === 0);
  }
  if (search) search.addEventListener('input', runSearch);

  /* ---- bookmark (save & resume place) ------------------------------------ */
  function topmostChapterId() {
    var y = (document.documentElement.scrollTop || 0) + 90;
    var id = chapters.length ? chapters[0].id : null;
    chapters.forEach(function (ch) { if (ch.offsetTop <= y) id = ch.id; });
    return id;
  }
  var bookmarkBtn = $('#book-bookmark');
  if (bookmarkBtn) {
    bookmarkBtn.addEventListener('click', function () {
      var id = topmostChapterId();
      if (!id) return;
      try { localStorage.setItem(LS_BOOKMARK, id); } catch (e) {}
      bookmarkBtn.classList.add('is-on');
      toast(t('Bookmarked — it will reopen here.', 'نشان زد — اگلی بار یہیں سے کھلے گا۔'));
    });
  }
  // On load, offer to resume (only when arriving at the top, no explicit hash)
  (function offerResume() {
    if (location.hash) return;
    var id;
    try { id = localStorage.getItem(LS_BOOKMARK); } catch (e) {}
    if (!id) return;
    var el = document.getElementById(id);
    if (!el) return;
    if (bookmarkBtn) bookmarkBtn.classList.add('is-on');
    setTimeout(function () {
      toast(t('Continue where you left off?', 'جہاں چھوڑا تھا وہیں سے جاری رکھیں؟'),
            t('Resume', 'جاری رکھیں'),
            function () { el.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth' }); });
    }, 900);
  })();

  /* ---- share ------------------------------------------------------------- */
  var shareBtn = $('#book-share');
  if (shareBtn) {
    shareBtn.addEventListener('click', function () {
      var url = location.origin + location.pathname;
      var data = { title: 'Masnoon Duas — Azhar Islamic Ruqyah Centre', url: url };
      if (navigator.share) {
        navigator.share(data).catch(function () {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(url)
          .then(function () { toast(t('Link copied.', 'لنک نقل ہو گیا۔')); })
          .catch(function () { toast(t('Could not share.', 'شیئر نہیں ہو سکا۔')); });
      } else {
        toast(t('Could not share.', 'شیئر نہیں ہو سکا۔'));
      }
    });
  }

  /* ---- print / download PDF --------------------------------------------- */
  function doPrint() {
    // Clear any active search so the whole book prints
    if (search && search.value) { search.value = ''; runSearch(); }
    window.print();
  }
  var printBtn = $('#book-print');
  if (printBtn) printBtn.addEventListener('click', doPrint);
  var dlBtn = $('#book-download');
  if (dlBtn) {
    dlBtn.addEventListener('click', function () {
      toast(t('Choose “Save as PDF” in the print dialog.', 'پرنٹ ونڈو میں ”Save as PDF“ منتخب کریں۔'));
      setTimeout(doPrint, 700);
    });
  }

  /* ---- boot -------------------------------------------------------------- */
  onScroll();
  document.addEventListener('langchange', function () { syncTheme(); runSearch(); });
})();
