/* ==========================================================================
   Azhar Islamic Ruqyah Center — Interaction layer
   Vanilla JS, no dependencies. The Three.js hero is loaded lazily and
   separately so this file stays small and blocks nothing.
   ========================================================================== */

(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

  var $  = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  /* ------------------------------------------------------------------------
     1. Navbar — stuck state, mobile menu, scroll spy
     ------------------------------------------------------------------------ */

  function initNav() {
    var nav = $('.nav');
    var toggle = $('.nav__toggle');
    var links = $$('.nav__link');
    if (!nav) return;

    // Stuck state, driven by a sentinel rather than a scroll listener.
    var sentinel = document.createElement('div');
    sentinel.setAttribute('aria-hidden', 'true');
    sentinel.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:1px;pointer-events:none;';
    document.body.prepend(sentinel);

    new IntersectionObserver(function (entries) {
      nav.classList.toggle('is-stuck', !entries[0].isIntersecting);
    }, { rootMargin: '-8px 0px 0px 0px' }).observe(sentinel);

    // Mobile menu
    function setOpen(open) {
      nav.classList.toggle('is-open', open);
      if (toggle) toggle.setAttribute('aria-expanded', String(open));
      document.body.style.overflow = open ? 'hidden' : '';
    }

    if (toggle) {
      toggle.addEventListener('click', function () {
        setOpen(!nav.classList.contains('is-open'));
      });
    }

    links.forEach(function (link) {
      link.addEventListener('click', function () { setOpen(false); });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) {
        setOpen(false);
        if (toggle) toggle.focus();
      }
    });

    // Reset the menu if the viewport grows past the mobile breakpoint.
    var wide = window.matchMedia('(min-width: 901px)');
    (wide.addEventListener ? wide.addEventListener.bind(wide, 'change') : wide.addListener.bind(wide))(
      function (e) { if (e.matches) setOpen(false); }
    );

    // Scroll spy — highlight the section currently occupying the viewport.
    var targets = links
      .map(function (l) {
        var id = (l.getAttribute('href') || '').replace('#', '');
        var el = id ? document.getElementById(id) : null;
        return el ? { link: l, el: el } : null;
      })
      .filter(Boolean);

    if (!targets.length) return;

    var visible = new Map();

    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) visible.set(entry.target, entry.intersectionRatio);
        else visible.delete(entry.target);
      });

      var best = null;
      var bestRatio = 0;
      visible.forEach(function (ratio, el) {
        if (ratio > bestRatio) { bestRatio = ratio; best = el; }
      });

      targets.forEach(function (t) {
        var on = t.el === best;
        if (on) t.link.setAttribute('aria-current', 'true');
        else t.link.removeAttribute('aria-current');
      });
    }, {
      // Weight the middle band of the viewport so the "current" section
      // matches what the visitor is actually reading.
      rootMargin: '-45% 0px -45% 0px',
      threshold: [0, 0.25, 0.5, 0.75, 1]
    });

    targets.forEach(function (t) { spy.observe(t.el); });
  }

  /* ------------------------------------------------------------------------
     2. Scroll reveal — staggered, one-shot
     ------------------------------------------------------------------------ */

  function initReveal() {
    var items = $$('.reveal');
    if (!items.length) return;

    if (reduceMotion.matches || !('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      // Stagger within each batch that crosses the threshold together,
      // so a grid of tiles cascades instead of popping as one block.
      var entering = entries.filter(function (e) { return e.isIntersecting; });

      entering.forEach(function (entry, i) {
        var el = entry.target;
        var explicit = el.getAttribute('data-delay');
        var delay = explicit !== null ? parseInt(explicit, 10) : Math.min(i * 90, 540);
        el.style.setProperty('--reveal-delay', delay + 'ms');
        el.classList.add('is-visible');
        io.unobserve(el);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });

    items.forEach(function (el) { io.observe(el); });
  }

  /* ------------------------------------------------------------------------
     3. Tile pointer tilt + glow
     One rAF-batched pass; listeners are passive and only bound on fine pointers.
     ------------------------------------------------------------------------ */

  function initTilt() {
    if (reduceMotion.matches || !finePointer.matches) return;

    var tiles = $$('.tile');
    if (!tiles.length) return;

    var MAX_TILT = 4.5; // degrees — restrained on purpose; this is a sacred site
    var queued = false;
    var pending = [];

    function flush() {
      queued = false;
      pending.forEach(function (job) {
        job.el.style.setProperty('--rx', job.rx.toFixed(2) + 'deg');
        job.el.style.setProperty('--ry', job.ry.toFixed(2) + 'deg');
        job.el.style.setProperty('--px', job.px.toFixed(1) + '%');
        job.el.style.setProperty('--py', job.py.toFixed(1) + '%');
      });
      pending = [];
    }

    tiles.forEach(function (tile) {
      tile.addEventListener('pointermove', function (e) {
        var r = tile.getBoundingClientRect();
        if (!r.width || !r.height) return;

        var nx = (e.clientX - r.left) / r.width;   // 0..1
        var ny = (e.clientY - r.top) / r.height;   // 0..1

        pending.push({
          el: tile,
          rx: (0.5 - ny) * MAX_TILT * 2,
          ry: (nx - 0.5) * MAX_TILT * 2,
          px: nx * 100,
          py: ny * 100
        });

        if (!queued) { queued = true; requestAnimationFrame(flush); }
      }, { passive: true });

      tile.addEventListener('pointerleave', function () {
        tile.style.setProperty('--rx', '0deg');
        tile.style.setProperty('--ry', '0deg');
      });
    });
  }

  /* ------------------------------------------------------------------------
     4. Symptom self-check — entirely local. Nothing is stored or transmitted.
     ------------------------------------------------------------------------ */

  function initChecklist() {
    var form = $('#symptom-check');
    if (!form) return;

    var countEl = $('#check-count');
    var messageEl = $('#check-message');
    var resetBtn = $('#check-reset');
    var boxes = $$('input[type="checkbox"]', form);
    if (!boxes.length) return;

    // The reassurance copy lives in the dictionary, not here, so it switches
    // language with everything else.
    var MESSAGE_KEYS = ['signs.msg0', 'signs.msg1', 'signs.msg2', 'signs.msg3'];

    function update() {
      var n = boxes.filter(function (b) { return b.checked; }).length;
      if (countEl) countEl.textContent = String(n);

      var tier = n === 0 ? 0 : n <= 4 ? 1 : n <= 9 ? 2 : 3;
      if (messageEl && window.I18N) messageEl.textContent = window.I18N.t(MESSAGE_KEYS[tier]);
    }

    form.addEventListener('change', update);

    // A language switch rewrites #check-message back to its tier-0 default;
    // re-run so the visitor's current tally keeps its correct message.
    document.addEventListener('langchange', update);

    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        boxes.forEach(function (b) { b.checked = false; });
        update();
      });
    }

    // Guard against a browser restoring checkbox state on soft reload.
    boxes.forEach(function (b) { b.checked = false; });
    update();
  }

  /* ------------------------------------------------------------------------
     5. Floating WhatsApp — reveal once the hero has been passed
     ------------------------------------------------------------------------ */

  function initFab() {
    var fab = $('.fab');
    var hero = $('#hero');
    if (!fab) return;

    if (!hero || !('IntersectionObserver' in window)) {
      fab.classList.add('is-shown');
      return;
    }

    new IntersectionObserver(function (entries) {
      fab.classList.toggle('is-shown', !entries[0].isIntersecting);
    }, { threshold: 0.35 }).observe(hero);
  }

  /* ------------------------------------------------------------------------
     6. Accordion polish — one FAQ open at a time
     ------------------------------------------------------------------------ */

  function initAccordion() {
    var items = $$('.faq__item');

    items.forEach(function (item) {
      item.addEventListener('toggle', function () {
        if (!item.open) return;
        items.forEach(function (other) {
          if (other !== item) other.open = false;
        });
      });
    });
  }

  /* ------------------------------------------------------------------------
     7. Divider line-drawing
     ------------------------------------------------------------------------ */

  function initDividers() {
    var svgs = $$('.divider-svg');
    if (!svgs.length) return;

    if (reduceMotion.matches || !('IntersectionObserver' in window)) {
      svgs.forEach(function (s) { s.classList.add('is-visible'); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      });
    }, { threshold: 0.3 });

    svgs.forEach(function (s) { io.observe(s); });
  }

  /* ------------------------------------------------------------------------
     8. Lazy-load the Three.js hero
     Deferred until the browser is idle so it never competes with first paint,
     and skipped entirely for reduced-motion or non-WebGL visitors.
     ------------------------------------------------------------------------ */

  function initHeroScene() {
    var canvas = $('#hero-canvas');
    var fallback = $('#hero-fallback');
    if (!canvas) return;

    if (reduceMotion.matches) return;      // static fallback stands

    // Cheap WebGL probe before pulling ~600KB of Three.js over the wire.
    var supported = (function () {
      try {
        var c = document.createElement('canvas');
        return !!(window.WebGLRenderingContext &&
          (c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl')));
      } catch (err) {
        return false;
      }
    })();

    if (!supported) return;

    // Don't spend a visitor's data on a scene they'll never see.
    var conn = navigator.connection;
    if (conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || ''))) return;

    var started = false;

    function boot() {
      if (started) return;
      started = true;

      import('./hero.js')
        .then(function (mod) {
          return mod.initHero(canvas, {
            getScrollProgress: function () {
              var h = $('#hero');
              if (!h) return 0;
              var r = h.getBoundingClientRect();
              return Math.min(1, Math.max(0, -r.top / Math.max(1, r.height)));
            }
          });
        })
        .then(function () {
          canvas.classList.add('is-ready');
          if (fallback) fallback.classList.add('is-hidden');
        })
        .catch(function (err) {
          // Fallback is already on screen; just note it for the console.
          console.warn('[hero] 3D scene unavailable, using static fallback:', err && err.message);
        });
    }

    if ('requestIdleCallback' in window) {
      requestIdleCallback(boot, { timeout: 2200 });
    } else {
      setTimeout(boot, 900);
    }
  }

  /* ------------------------------------------------------------------------
     9. Language switch
     The language itself is applied by i18n.js before first paint; this only
     wires the controls. Both copies of the switch (navbar + mobile menu)
     share one handler and are kept in sync by i18n.js.
     ------------------------------------------------------------------------ */

  function initLangSwitch() {
    if (!window.I18N) return;

    $$('[data-lang-switch]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        window.I18N.toggle();
      });
    });
  }

  /* ------------------------------------------------------------------------
     10. Year stamp
     ------------------------------------------------------------------------ */

  function initYear() {
    var el = $('#year');
    if (el) el.textContent = String(new Date().getFullYear());
  }

  /* ------------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------------ */

  function boot() {
    initNav();
    initReveal();
    initTilt();
    initChecklist();
    initFab();
    initAccordion();
    initDividers();
    initLangSwitch();
    initYear();
    initHeroScene();
    document.documentElement.classList.add('js-ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
