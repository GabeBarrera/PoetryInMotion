/* ===========================================================
   Poetry in Motion — view router + interactions
   =========================================================== */
(function () {
  'use strict';

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  // ---- video crossfader ------------------------------------
  const VA = $('#videoA');
  const VB = $('#videoB');
  let currentVid = VA;
  let nextVid = VB;
  let currentSrc = '';

  function setStageVideo(src) {
    if (!src || src === currentSrc) return;
    currentSrc = src;
    nextVid.src = src;
    nextVid.load();
    const onReady = () => {
      nextVid.removeEventListener('loadeddata', onReady);
      const play = nextVid.play();
      if (play && play.catch) play.catch(() => {});
      // crossfade
      nextVid.classList.add('is-active');
      currentVid.classList.remove('is-active');
      // swap roles
      const tmp = currentVid; currentVid = nextVid; nextVid = tmp;
    };
    nextVid.addEventListener('loadeddata', onReady);
    // safety: if metadata loads but loadeddata is slow, still flip
    setTimeout(() => {
      if (!nextVid.classList.contains('is-active') && currentSrc === src) {
        nextVid.classList.add('is-active');
        currentVid.classList.remove('is-active');
        const tmp = currentVid; currentVid = nextVid; nextVid = tmp;
      }
    }, 1500);
  }

  // ---- carousel build --------------------------------------
  const track = $('#carouselTrack');
  const dotsWrap = $('#carouselDots');
  const counter = $('#poemsCounter');
  const POEMS = window.POEMS || [];

  function buildCarousel() {
    track.innerHTML = '';
    dotsWrap.innerHTML = '';
    POEMS.forEach((p, i) => {
      const card = document.createElement('div');
      card.className = 'card';
      card.dataset.index = i;
      card.dataset.id = p.id;
      card.innerHTML = `
        <video class="card__video" src="${p.video}" autoplay muted loop playsinline preload="metadata"></video>
        <div class="card__veil"></div>
        <span class="card__corner-tl">№ ${p.number}</span>
        <span class="card__corner-br">loop</span>
        <div class="card__inner">
          <div class="card__num">poem ${p.number}</div>
          <h3 class="card__title">${p.title}</h3>
          <div class="card__rule"></div>
          <p class="card__epigraph">${p.epigraph}</p>
        </div>
        <span class="card__open-hint">press ↵ or click to open</span>
      `;
      track.appendChild(card);

      const dot = document.createElement('button');
      dot.className = 'dot-btn';
      dot.dataset.index = i;
      dot.setAttribute('aria-label', `Go to poem ${p.number}`);
      dotsWrap.appendChild(dot);
    });
  }

  // ---- carousel state --------------------------------------
  let activeIdx = 0;
  let dragX0 = null;
  let dragX = 0;
  let isDragging = false;

  function cardWidth() {
    const c = track.querySelector('.card');
    if (!c) return 320;
    const style = getComputedStyle(track);
    const gap = parseFloat(style.gap) || 24;
    return c.offsetWidth + gap;
  }

  function updateCardHalfVar() {
    const c = track.querySelector('.card');
    if (!c) return;
    track.style.setProperty('--card-half', (c.offsetWidth / 2) + 'px');
  }

  function applyCarousel(animate = true) {
    updateCardHalfVar();
    const w = cardWidth();
    const offset = -activeIdx * w + dragX;
    track.style.transform = `translateX(${offset}px)`;
    track.classList.toggle('is-dragging', !animate);

    $$('.card', track).forEach((c, i) => {
      c.classList.toggle('is-active', i === activeIdx);
      const v = c.querySelector('video');
      if (v) {
        // throttle: pause far-away videos to save resources
        const far = Math.abs(i - activeIdx) > 2;
        if (far) { v.pause(); } else { const p = v.play(); if (p && p.catch) p.catch(()=>{}); }
      }
    });

    $$('.dot-btn', dotsWrap).forEach((d, i) => {
      d.classList.toggle('is-active', i === activeIdx);
    });

    if (counter) {
      const total = String(POEMS.length).padStart(2, '0');
      const cur = String(activeIdx + 1).padStart(2, '0');
      counter.textContent = `${cur} / ${total}`;
    }
  }

  function goTo(i) {
    activeIdx = Math.max(0, Math.min(POEMS.length - 1, i));
    dragX = 0;
    applyCarousel(true);
  }

  // ---- carousel interactions -------------------------------
  function bindCarousel() {
    $('#carouselPrev').addEventListener('click', () => goTo(activeIdx - 1));
    $('#carouselNext').addEventListener('click', () => goTo(activeIdx + 1));

    dotsWrap.addEventListener('click', (e) => {
      const btn = e.target.closest('.dot-btn');
      if (!btn) return;
      goTo(parseInt(btn.dataset.index, 10));
    });

    // click card: if active, open; else focus it
    track.addEventListener('click', (e) => {
      if (Math.abs(dragX) > 6) return; // suppress click after drag
      const card = e.target.closest('.card');
      if (!card) return;
      const i = parseInt(card.dataset.index, 10);
      if (i === activeIdx) {
        openPoem(POEMS[i].id);
      } else {
        goTo(i);
      }
    });

    // touch + mouse drag
    const vp = $('#carouselViewport');

    function onDown(x) {
      isDragging = true;
      dragX0 = x;
      dragX = 0;
      vp.classList.add('is-dragging');
    }
    function onMove(x) {
      if (!isDragging) return;
      dragX = x - dragX0;
      applyCarousel(false);
    }
    function onUp() {
      if (!isDragging) return;
      isDragging = false;
      vp.classList.remove('is-dragging');
      const w = cardWidth();
      const threshold = w * 0.18;
      if (dragX < -threshold) activeIdx = Math.min(POEMS.length - 1, activeIdx + 1);
      else if (dragX > threshold) activeIdx = Math.max(0, activeIdx - 1);
      dragX = 0;
      applyCarousel(true);
    }

    vp.addEventListener('mousedown', (e) => { e.preventDefault(); onDown(e.clientX); });
    window.addEventListener('mousemove', (e) => onMove(e.clientX));
    window.addEventListener('mouseup', onUp);

    vp.addEventListener('touchstart', (e) => onDown(e.touches[0].clientX), { passive: true });
    vp.addEventListener('touchmove',  (e) => onMove(e.touches[0].clientX), { passive: true });
    vp.addEventListener('touchend',   onUp);
  }

  // ---- home virtual-scroll driven title/bio ----------------
  // The harness blocks inner-container scrolling, so we drive
  // a virtual progress 0..1 from wheel/touch events.
  let homeProgress = 0;
  function setHomeProgress(p) {
    homeProgress = Math.max(0, Math.min(1, p));
    const sz = $('.view--home');
    if (!sz) return;
    // title fades and lifts as we move 0..0.55
    const tT = Math.min(1, homeProgress / 0.55);
    sz.style.setProperty('--title-shift', `${-tT * 80}px`);
    sz.style.setProperty('--title-opacity', `${1 - tT}`);
    sz.style.setProperty('--title-blur', `${tT * 6}px`);
    // bio rises across 0.35..1
    const tB = Math.max(0, Math.min(1, (homeProgress - 0.35) / 0.55));
    sz.style.setProperty('--bio-opacity', `${tB}`);
    sz.style.setProperty('--bio-shift', `${(1 - tB) * 60}px`);
    // toggle pointer-events on bio when visible
    const bio = $('#homeBio');
    if (bio) bio.style.pointerEvents = tB > 0.6 ? 'auto' : 'none';
  }

  function bindHomeScroll() {
    const homeView = $('.view--home');
    if (!homeView) return;

    let touchStart = null;

    homeView.addEventListener('wheel', (e) => {
      if (document.body.dataset.view !== 'home') return;
      e.preventDefault();
      const delta = e.deltaY / 600; // 600px ~ full progress
      setHomeProgress(homeProgress + delta);
    }, { passive: false });

    homeView.addEventListener('touchstart', (e) => {
      touchStart = { y: e.touches[0].clientY, p: homeProgress };
    }, { passive: true });
    homeView.addEventListener('touchmove', (e) => {
      if (!touchStart) return;
      const dy = touchStart.y - e.touches[0].clientY;
      setHomeProgress(touchStart.p + dy / 600);
    }, { passive: true });
    homeView.addEventListener('touchend', () => { touchStart = null; });

    // initial
    setHomeProgress(0);
  }

  // ---- view routing ----------------------------------------
  function parseHash() {
    const h = (location.hash || '#/').replace(/^#/, '');
    const parts = h.split('/').filter(Boolean);
    // '#/' -> []; '#/poems' -> ['poems']; '#/poem/tidewater' -> ['poem','tidewater']
    if (parts.length === 0) return { view: 'home' };
    if (parts[0] === 'about') return { view: 'about' };
    if (parts[0] === 'poems') return { view: 'poems' };
    if (parts[0] === 'poem' && parts[1]) return { view: 'poem', id: parts[1] };
    return { view: 'home' };
  }

  function setActiveNav(view) {
    $$('.navlink').forEach(a => {
      const link = a.dataset.link;
      const match =
        (view === 'about' && link === 'about') ||
        (view === 'poems' && link === 'poems') ||
        (view === 'poem'  && link === 'poems');
      a.classList.toggle('is-active', !!match);
    });
  }

  function showView(view) {
    $$('.view').forEach(v => {
      const match = v.dataset.view === view;
      if (match) {
        v.hidden = false;
        // retrigger fade-in animation
        v.classList.remove('is-fading-in');
        void v.offsetWidth;
        v.classList.add('is-fading-in');
      } else {
        v.classList.remove('is-fading-in');
        v.hidden = true;
      }
    });
    document.body.dataset.view = view;
  }

  function renderPoem(id) {
    const p = POEMS.find(x => x.id === id);
    const root = $('#poemBody');
    if (!p || !root) return null;
    const lines = p.body.map((l, i) =>
      `<span class="poem__line" style="animation-delay:${0.2 + i * 0.08}s">${l || '&nbsp;'}</span>`
    ).join('');
    root.innerHTML = `
      <p class="poem__num">poem № ${p.number}</p>
      <h2 class="poem__title">${p.title}</h2>
      <p class="poem__epigraph">${p.epigraph}</p>
      <div class="poem__rule"></div>
      <div class="poem__body">${lines}</div>
      <div class="poem__footer">
        <span>filed under: small weather</span>
        <span>
          <a href="#/poem/${prevPoemId(id)}">← prev</a> &middot;
          <a href="#/poem/${nextPoemId(id)}">next →</a>
        </span>
      </div>
    `;
    return p;
  }

  function prevPoemId(id) {
    const i = POEMS.findIndex(p => p.id === id);
    return POEMS[(i - 1 + POEMS.length) % POEMS.length].id;
  }
  function nextPoemId(id) {
    const i = POEMS.findIndex(p => p.id === id);
    return POEMS[(i + 1) % POEMS.length].id;
  }

  function route() {
    const r = parseHash();
    setActiveNav(r.view);

    if (r.view === 'home') {
      showView('home');
      setStageVideo(window.VIEW_VIDEOS.home);
      // reset scroll back to top on home re-entry? leave alone for now.
    } else if (r.view === 'about') {
      showView('about');
      setStageVideo(window.VIEW_VIDEOS.about);
    } else if (r.view === 'poems') {
      showView('poems');
      // use the active card's video as the bg too — it'll be mostly hidden by cards
      const p = POEMS[activeIdx];
      if (p) setStageVideo(p.video);
      // re-layout after show
      requestAnimationFrame(() => { applyCarousel(true); });
    } else if (r.view === 'poem') {
      const p = renderPoem(r.id);
      showView('poem');
      if (p) setStageVideo(p.video);
    }
  }

  function openPoem(id) {
    location.hash = `#/poem/${id}`;
  }

  // ---- keyboard --------------------------------------------
  function bindKeys() {
    document.addEventListener('keydown', (e) => {
      const view = document.body.dataset.view;
      if (view === 'poems') {
        if (e.key === 'ArrowLeft')  { e.preventDefault(); goTo(activeIdx - 1); }
        if (e.key === 'ArrowRight') { e.preventDefault(); goTo(activeIdx + 1); }
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openPoem(POEMS[activeIdx].id);
        }
        if (e.key === 'Escape') { location.hash = '#/'; }
      } else if (view === 'poem') {
        const curId = (location.hash.match(/#\/poem\/(.+)$/) || [])[1];
        if (e.key === 'ArrowLeft' && curId)  { location.hash = `#/poem/${prevPoemId(curId)}`; }
        if (e.key === 'ArrowRight' && curId) { location.hash = `#/poem/${nextPoemId(curId)}`; }
        if (e.key === 'Escape') { location.hash = '#/poems'; }
      } else if (view === 'home') {
        if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
          e.preventDefault();
          setHomeProgress(homeProgress + 0.5);
        }
        if (e.key === 'ArrowUp' || e.key === 'PageUp') {
          e.preventDefault();
          setHomeProgress(homeProgress - 0.5);
        }
      }
    });
  }

  // ---- nav link click (smooth hash change) -----------------
  function bindNav() {
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href^="#/"]');
      if (!a) return;
      const target = a.getAttribute('href');
      if (target === '#/') {
        // reset home progress on brand click
        requestAnimationFrame(() => setHomeProgress(0));
      }
    });

    // clicking the scroll hint advances the home progress
    const hint = $('.home-title__hint');
    if (hint) {
      hint.style.cursor = 'pointer';
      hint.addEventListener('click', () => setHomeProgress(0.9));
    }
  }

  // ---- resize ----------------------------------------------
  window.addEventListener('resize', () => {
    applyCarousel(true);
  });

  // ---- init ------------------------------------------------
  function init() {
    // initial video
    setStageVideo(window.VIEW_VIDEOS.home);

    buildCarousel();
    bindCarousel();
    bindHomeScroll();
    bindKeys();
    bindNav();

    window.addEventListener('hashchange', route);
    route();

    // first layout pass for carousel measurements
    requestAnimationFrame(() => applyCarousel(false));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
