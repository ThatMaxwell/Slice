/* ==========================================================================
   slice — website behaviour
   ========================================================================== */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ======================================================================
  // Sound: a soft, airy chime synthesised live (no audio files)
  // ======================================================================
  let ac = null;
  try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* no audio */ }
  const unlock = () => { if (ac && ac.state !== 'running') ac.resume().catch(() => {}); };
  ['pointerdown', 'pointerup', 'click', 'keydown', 'touchstart', 'touchend'].forEach((e) => addEventListener(e, unlock, { capture: true, passive: true }));

  function chime() {
    if (!ac || ac.state !== 'running') return false;
    const t0 = ac.currentTime + 0.03;
    const out = ac.createGain(); out.gain.value = 0.85;
    const comp = ac.createDynamicsCompressor();
    out.connect(comp).connect(ac.destination);
    const tone = ac.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 5200; tone.connect(out);
    const send = ac.createGain(); send.gain.value = 0.5;
    [[0.19, 0.42], [0.31, 0.36]].forEach(([time, fbAmt]) => {
      const d = ac.createDelay(1); d.delayTime.value = time;
      const fb = ac.createGain(); fb.gain.value = fbAmt;
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
      send.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(tone);
    });
    const voice = (freq, at, peak, dur, attack = 0.012, type = 'sine') => {
      const o = ac.createOscillator(); o.type = type; o.frequency.value = freq;
      const shimmer = ac.createOscillator(); shimmer.frequency.value = 5.5;
      const sg = ac.createGain(); sg.gain.value = freq * 0.0025;
      shimmer.connect(sg).connect(o.frequency);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(peak, t0 + at + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      o.connect(g); g.connect(tone); g.connect(send);
      o.start(t0 + at); shimmer.start(t0 + at);
      o.stop(t0 + at + dur + 0.1); shimmer.stop(t0 + at + dur + 0.1);
    };
    voice(130.81, 0, 0.09, 4.2, 0.6, 'triangle');
    voice(196.0, 0.05, 0.07, 4.0, 0.7, 'triangle');
    [[523.25, 0.0], [783.99, 0.07], [987.77, 0.14], [1174.66, 0.21], [1567.98, 0.3]].forEach(([f, at], i) => {
      voice(f, at, 0.11 - i * 0.012, 3.2 - i * 0.2);
      voice(f * 2.01, at, 0.025, 1.4);
    });
    return true;
  }

  function whoosh() {
    if (!ac || ac.state !== 'running') return;
    const t0 = ac.currentTime;
    const len = ac.sampleRate * 1.1;
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource(); src.buffer = buf;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(300, t0); bp.frequency.exponentialRampToValueAtTime(2400, t0 + 0.9);
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.06, t0 + 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.05);
    src.connect(bp).connect(g).connect(ac.destination);
    src.start(t0);
  }

  // ======================================================================
  // Boot: 2s tide loader → black → white mark + chime → colour → flies into the nav
  // ======================================================================
  const boot = $('#boot');
  const loader = $('#loader');
  const pct = $('#load-pct');
  const stage = $('.boot-stage');
  const soundChip = $('#sound-chip');
  let booted = false;

  const preload = (src) => new Promise((r) => { const i = new Image(); i.onload = i.onerror = () => (i.decode ? i.decode().catch(() => {}).then(r) : r()); i.src = src; });

  async function runBoot() {
    const assets = Promise.all(['assets/slice-mini-white.svg', 'assets/slice-logo.webp', 'assets/slice-logo-512.png'].map(preload));
    const start = performance.now();
    const LOAD = reduce ? 600 : 2000;
    await new Promise((resolve) => {
      const tick = (now) => {
        const p = Math.min(1, (now - start) / LOAD);
        const eased = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
        pct.textContent = String(Math.round(eased * 100)).padStart(2, '0');
        if (p < 1 && !booted) requestAnimationFrame(tick); else resolve();
      };
      requestAnimationFrame(tick);
    });
    await assets;
    if (booted) return;
    loader.classList.add('out');
    await sleep(reduce ? 200 : 1000);
    if (booted) return;
    boot.classList.add('show-white');
    // Sound is on by default. Browsers only let a page make sound after a tap or key press,
    // so if this one hasn't had one yet, the intro waits here on the white mark for it.
    if (!chime() && ac) { await waitForGesture(); chime(); }
    await sleep(reduce ? 300 : 1400);
    if (booted) return;
    boot.classList.add('show-color');
    await sleep(reduce ? 300 : 1500);
    if (booted) return;
    await flyToNav();
    finishBoot();
  }

  async function flyToNav() {
    const target = $('#brand-logo').getBoundingClientRect();
    const from = stage.getBoundingClientRect();
    const dx = target.left + target.width / 2 - (from.left + from.width / 2);
    const dy = target.top + target.height / 2 - (from.top + from.height / 2);
    whoosh();
    boot.style.transition = 'background-color 1s cubic-bezier(.76,0,.24,1)';
    boot.style.backgroundColor = 'rgba(0,0,0,0)';
    stage.classList.add('flying');
    stage.style.transform = `translate(${dx}px, ${dy}px) scale(${target.width / from.width})`;
    stage.style.filter = 'none';
    revealHero();
    await sleep(reduce ? 200 : 1080);
  }

  function waitForGesture() {
    return new Promise((resolve) => {
      soundChip.hidden = false;
      boot.classList.add('await-tap');
      const go = async () => {
        ['pointerup', 'click', 'keydown', 'touchend'].forEach((e) => removeEventListener(e, go, true));
        unlock();
        for (let i = 0; i < 20 && ac.state !== 'running'; i++) await sleep(25);
        soundChip.hidden = true;
        boot.classList.remove('await-tap');
        resolve();
      };
      ['pointerup', 'click', 'keydown', 'touchend'].forEach((e) => addEventListener(e, go, true));
    });
  }

  function endBoot(fade = 1200) {
    booted = true;
    document.body.classList.remove('is-booting');
    boot.classList.add('done');
    setTimeout(() => boot.remove(), fade);
    revealHero();
    startDemo();
  }
  function finishBoot() { if (!booted) endBoot(); }

  let heroRevealed = false;
  function revealHero() {
    if (heroRevealed) return;
    heroRevealed = true;
    $$('.hero .reveal').forEach((el, i) => { el.style.setProperty('--d', `${0.12 + i * 0.08}s`); el.classList.add('in'); });
  }

  // ======================================================================
  // Generated scenery: soft little landscapes in the logo's palette.
  // The demo never hotlinks other people's photos.
  // ======================================================================
  const PALETTES = {
    beach: { sky: ['#7cc4ff', '#dff4ff'], sun: '#fff6d8', land: ['#3cc8f2', '#e9fbff', '#ffd9a6'] },
    sunset: { sky: ['#ff9a6b', '#ffe0b3'], sun: '#fff3cf', land: ['#e07a8f', '#9b6bb3', '#4d4a86'] },
    lemon: { sky: ['#fff3a6', '#fffbe6'], sun: '#ffd93b', land: ['#f2d51d', '#d5e46d', '#a6d36b'] },
    dusk: { sky: ['#5b6fd6', '#c6b8ff'], sun: '#ffe2f4', land: ['#6a5cc4', '#40418f', '#25285e'] },
    mint: { sky: ['#bff3ea', '#f2fffc'], sun: '#ffffff', land: ['#6edbcc', '#2ec4b6', '#169688'] },
    alps: { sky: ['#9fd0ff', '#eef8ff'], sun: '#ffffff', land: ['#c9defa', '#8fb8ee', '#5d93dd'] },
    rose: { sky: ['#ffc2d9', '#fff0f5'], sun: '#fff8e7', land: ['#ff9cc0', '#f070a1', '#c2507e'] },
  };
  function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function scenery(kind, seed, h = 200, w = 300) {
    const p = PALETTES[kind] || PALETTES.beach;
    const r = rng(seed * 9973 + kind.length * 31);
    const layers = p.land.map((c, i) => {
      const base = h * (0.5 + i * 0.15) + r() * h * 0.06;
      const amp = h * (kind === 'alps' && i === 0 ? 0.22 : 0.05 + r() * 0.05);
      const k = 1 + Math.floor(r() * 2);
      let d = `M0 ${base.toFixed(1)}`;
      const steps = 6 * k;
      for (let s = 1; s <= steps; s++) {
        const x = (w / steps) * s;
        const y = base + Math.sin((s / steps) * Math.PI * 2 * k + r() * 2) * amp * (kind === 'alps' && i === 0 ? (s % 2 ? 1 : -1) : 1);
        const cx = x - w / steps / 2;
        d += ` Q${cx.toFixed(1)} ${(y - amp * 0.6).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`;
      }
      return `<path d="${d} V${h} H0Z" fill="${c}"/>`;
    }).join('');
    const sx = (0.2 + r() * 0.6) * w;
    const sy = h * (0.18 + r() * 0.2);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.sky[0]}"/><stop offset="1" stop-color="${p.sky[1]}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/><circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="${(h * (0.08 + r() * 0.06)).toFixed(1)}" fill="${p.sun}"/>${layers}</svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }
  const HEIGHTS = [150, 210, 120, 180, 230, 140, 200, 160, 220, 130, 170, 190];
  function tiles(kinds, offset = 0, count = 9) {
    return Array.from({ length: count }, (_, i) => {
      const kind = kinds[i % kinds.length];
      const h = HEIGHTS[(i + offset) % HEIGHTS.length];
      return `<img class="m-img" alt="" src="${scenery(kind, i + offset * 13, h)}" style="animation-delay:${i * 45}ms">`;
    }).join('');
  }

  // ======================================================================
  // Mock browser: wide 1120×700 on bigger screens, a taller 600×820 layout on phones.
  // Re-fits live, so folding / unfolding a phone (iPhone Duo) just works.
  // ======================================================================
  const THEMES = {
    daylight: ['#2f7bff', '#ff9a4d', 4, 'light'], shore: ['#2f8cff', '#ffad5c', 6, 'dark'], lemon: ['#f2cf1d', '#c6e04a', 22, 'light'],
    sakura: ['#ff7eb6', '#ffc2d9', 14, 'light'], mint: ['#2ec4b6', '#cbf3f0', 16, 'light'], paper: ['#3d3d3d', '#9b8b74', 8, 'light'],
    midnight: ['#7c8cff', '#b38cff', 8, 'dark'], forest: ['#3fbf7f', '#a6d96a', 12, 'dark'], sunset: ['#ff7a45', '#ffc46b', 12, 'dark'],
    ocean: ['#00b8d9', '#5ad1ff', 14, 'dark'], grape: ['#a259ff', '#ff6bd6', 12, 'dark'], mono: ['#d4d4d8', '#71717a', 0, 'dark'],
  };

  const MOCK_HTML = `
    <aside class="m-side">
      <div class="m-omni"><span>⌕</span><span>Search or type a URL</span></div>
      <div class="m-side-label">Tabs</div>
      <div class="m-tab on"><i class="m-logo"></i><span class="m-tab-title">New tab</span></div>
      <div class="m-tab"><i class="m-ico" style="background:#24292f"></i><span>GitHub</span></div>
      <div class="m-tab"><i class="m-ico" style="background:#ff4500"></i><span>r/esp32</span></div>
    </aside>
    <div class="m-strip">
      <div class="m-tab on"><i class="m-logo"></i><span class="m-tab-title">New tab</span><span class="x">✕</span></div>
      <div class="m-tab"><i class="m-ico" style="background:#24292f"></i><span>GitHub</span></div>
      <div class="m-tab"><i class="m-ico" style="background:#ff4500"></i><span>r/esp32</span></div>
      <span class="m-plus">+</span>
      <div class="m-wco"><span>—</span><span>☐</span><span>✕</span></div>
    </div>
    <div class="m-bar">
      <div class="m-nav"><span>‹</span><span>›</span><span>↻</span></div>
      <div class="m-omni"><span>⌕</span><span class="m-url">Search Google or type a URL</span><span class="eng">Google</span></div>
      <div class="m-tools"><span>⛨</span><span class="spark">✦</span><span>⋯</span></div>
    </div>
    <div class="m-body">
      <div class="m-ntp">
        <div class="m-main">
          <div class="m-hero"><i class="m-logo"></i><h4>Good evening</h4></div>
          <div class="m-thread"></div>
          <div class="m-input"><span class="spark">✦</span><span class="m-typed" data-ph="Ask anything, or just say a site…"></span><span class="m-caret"></span><span class="m-send">→</span><input class="m-real" aria-label="Try Slice: type a message" autocomplete="off" autocapitalize="off" enterkeyhint="send" spellcheck="false"></div>
          <div class="m-chips"><span>yo</span><span>2026 news</span><span>make it lemon</span><span>best beaches in portugal</span></div>
        </div>
        <aside class="m-panel"><div><div class="m-ph"><b class="m-q"></b><div class="m-seg"><span class="on">Images</span><span class="m-srcn">Sources</span></div></div><div class="m-grid"></div></div></aside>
      </div>
      <div class="m-site"><div class="yt-top"><div class="yt-logo"><i></i>YouTube</div><div class="yt-search"></div></div><div class="yt-grid"></div></div>
    </div>`;

  function createMock(wrap, { theme = 'daylight', allowNarrow = true } = {}) {
    const el = document.createElement('div');
    el.className = 'mock';
    el.dataset.layout = 'top';
    el.innerHTML = MOCK_HTML;
    wrap.append(el);
    const fit = () => {
      const narrow = allowNarrow && wrap.clientWidth < 560;
      el.classList.toggle('narrow', narrow);
      const W = narrow ? 600 : 1120;
      const H = narrow ? 820 : 700;
      const s = wrap.clientWidth / W;
      el.style.setProperty('--s', s);
      wrap.style.height = `${H * s}px`;
    };
    new ResizeObserver(fit).observe(wrap);
    fit();
    const m = {
      el,
      ntp: $('.m-ntp', el), thread: $('.m-thread', el), typed: $('.m-typed', el), grid: $('.m-grid', el), q: $('.m-q', el), site: $('.m-site', el),
      setTheme(key) {
        const [a, b, t, mode] = THEMES[key] || THEMES.daylight;
        el.style.setProperty('--ma', a); el.style.setProperty('--mb', b); el.style.setProperty('--mt', `${t}%`);
        el.dataset.mode = mode; el.dataset.theme = key;
      },
      setEngine(name) {
        const e = $('.eng', el); e.textContent = name; e.classList.add('flash'); setTimeout(() => e.classList.remove('flash'), 900);
        $('.m-url', el).textContent = `Search ${name} or type a URL`;
      },
      setLayout(v) { el.dataset.layout = v; },
      setCompact(v) { el.dataset.compact = v ? '1' : '0'; },
      setGlass(v) { el.dataset.glass = v ? '1' : '0'; },
      setRadius(px) { el.style.setProperty('--mr', `${px}px`); },
      setTab(title, icon) {
        $$('.m-tab-title', el).forEach((t) => { t.textContent = title; });
        $$('.m-tab.on > i', el).forEach((i) => { if (icon) { i.className = 'm-ico'; i.style.background = icon; } else { i.className = 'm-logo'; i.style.background = ''; } });
      },
      reset() {
        m.ntp.classList.remove('chat', 'open');
        m.thread.innerHTML = '';
        m.grid.innerHTML = '';
        m.typed.textContent = '';
        m.site.classList.remove('on');
        $('.m-url', el).textContent = `Search ${$('.eng', el).textContent} or type a URL`;
        m.setTab('New tab');
      },
    };
    m.setTheme(theme);
    return m;
  }

  const skeleton = () => HEIGHTS.slice(0, 9).map((h, i) => `<div class="m-sk" style="height:${h * 0.8}px;animation-delay:${i * 50}ms"></div>`).join('');

  function streamInto(el, html, speed = 26) {
    el.innerHTML = html;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    let i = 0;
    for (const n of nodes) {
      const frag = document.createDocumentFragment();
      for (const part of n.textContent.split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) { frag.append(part); continue; }
        const s = document.createElement('span');
        s.textContent = part;
        s.style.cssText = `opacity:0;animation:w-in .4s ${i++ * speed}ms forwards`;
        frag.append(s);
      }
      n.replaceWith(frag);
    }
    $$('.m-cite, .m-done', el).forEach((c, k) => { c.style.opacity = 0; c.style.animation = `pop-to .4s cubic-bezier(.34,1.56,.64,1) ${(i * speed) * 0.6 + k * 60}ms forwards`; });
    return i * speed + 350;
  }

  // ======================================================================
  // Hero demo
  // ======================================================================
  const heroWrap = $('#hero-mock-wrap');
  const hero = createMock(heroWrap);
  const caption = $('#demo-caption-text');
  let demoToken = 0;
  let userTyping = false;
  let idleTimer = null;

  const SCENES = [
    { q: 'hey!', reply: '<p>hey hey 👋 what are we getting into today?</p>', img: ['beach', 'sunset', 'mint', 'alps', 'rose', 'dusk'] },
    {
      q: 'best beaches in portugal', web: true,
      reply: '<p>Top picks right now <span class="m-cite">1</span></p><ul><li><b>Praia da Marinha</b> — golden cliffs, glassy water <span class="m-cite">1</span></li><li><b>Benagil</b> — the sea cave everyone posts <span class="m-cite">2</span></li><li><b>Comporta</b> — quiet, wild, very chill <span class="m-cite">3</span></li><li><b>Nazaré</b> — come in winter for the giant waves</li></ul><p>want a road-trip route?</p>',
      img: ['beach', 'sunset', 'beach', 'alps', 'beach', 'sunset'],
    },
    {
      q: 'make my browser lemon colored and use brave search',
      reply: '<p>Done — lemon mode on and Brave is your search now 🍋</p><span class="m-done">✓ Theme → Lemon</span><span class="m-done">✓ Search → Brave Search</span>',
      img: ['lemon'], after: (m) => { m.setTheme('lemon'); m.setEngine('Brave'); },
    },
    { q: 'yo', open: true },
  ];

  async function typeText(m, text, token) {
    m.typed.textContent = '';
    for (const ch of text) {
      if (token !== demoToken) return false;
      m.typed.textContent += ch;
      await sleep(38 + Math.random() * 55);
    }
    await sleep(380);
    return token === demoToken;
  }

  async function playScene(m, sc, token, typed = true) {
    const alive = () => token === demoToken;
    if (typed && !await typeText(m, sc.q, token)) return false;
    m.typed.textContent = '';
    m.ntp.classList.add('chat');
    m.thread.insertAdjacentHTML('beforeend', `<div class="m-msg u"><span>${esc(sc.q)}</span></div>`);
    if (sc.open) {
      m.thread.insertAdjacentHTML('beforeend', '<div class="m-msg a"><i class="m-logo"></i><div class="col"><p>Opening <b>YouTube</b>…</p></div></div>');
      await sleep(700); if (!alive()) return false;
      $('.yt-grid', m.el).innerHTML = Array.from({ length: 12 }, (_, i) => `<div class="yt-card"><img alt="" src="${scenery(Object.keys(PALETTES)[i % 7], i + 40, 169, 300)}"><b></b><s></s></div>`).join('');
      m.site.classList.add('on');
      m.setTab('YouTube', '#ff0033');
      $('.m-url', m.el).textContent = 'youtube.com';
      await sleep(3200);
      return alive();
    }
    m.q.textContent = sc.q;
    m.grid.innerHTML = skeleton();
    m.ntp.classList.add('open');
    const ai = document.createElement('div');
    ai.className = 'm-msg a';
    ai.innerHTML = '<i class="m-logo"></i><div class="col"><div class="m-stat"></div><div class="m-txt"><span class="m-dots"><i></i><i></i><i></i></span></div></div>';
    m.thread.append(ai);
    const stat = $('.m-stat', ai);
    const txt = $('.m-txt', ai);
    if (sc.web) {
      stat.innerHTML = '<span class="m-status"><span class="m-spin"></span>Searching the web</span>';
      await sleep(1100); if (!alive()) return false;
      stat.innerHTML = '<span class="m-status"><i class="fv" style="--c:#2f7bff"></i><i class="fv" style="--c:#f59e0b"></i><i class="fv" style="--c:#ff4500"></i>&nbsp;&nbsp;Read 3 of 6 results</span>';
      $('.m-srcn', m.el).textContent = 'Sources · 3';
    } else {
      $('.m-srcn', m.el).textContent = 'Sources';
      await sleep(500);
    }
    setTimeout(() => { if (alive()) m.grid.innerHTML = tiles(sc.img, SCENES.indexOf(sc) + 2); }, sc.web ? 100 : 700);
    if (!alive()) return false;
    const dur = streamInto(txt, sc.reply);
    await sleep(dur + 200); if (!alive()) return false;
    sc.after?.(m);
    await sleep(sc.after ? 3000 : 2600);
    return alive();
  }

  async function demoLoop() {
    const token = ++demoToken;
    caption.textContent = 'Live demo — tap the bar and type anything';
    while (token === demoToken) {
      for (const sc of SCENES) {
        if (!await playScene(hero, sc, token)) return;
        if (sc !== SCENES[2] && !sc.open) { hero.reset(); await sleep(500); }
      }
      hero.reset();
      hero.setTheme('daylight');
      hero.setEngine('Google');
      await sleep(900);
    }
  }

  let demoStarted = false;
  function startDemo() {
    if (demoStarted) return;
    demoStarted = true;
    setTimeout(demoLoop, 900);
  }

  // visitors can type into the demo (a real input sits on top, so phone keyboards work)
  const realInput = $('.m-real', hero.el);
  const resumeDemo = (ms) => { clearTimeout(idleTimer); idleTimer = setTimeout(() => { if (document.activeElement !== realInput) { userTyping = false; hero.reset(); hero.setTheme('daylight'); hero.setEngine('Google'); demoLoop(); } }, ms); };
  realInput.addEventListener('focus', () => {
    demoToken++; userTyping = true;
    hero.reset();
    caption.textContent = 'Your turn — try “yo”, “make it pink” or anything';
  });
  realInput.addEventListener('input', () => { hero.typed.textContent = realInput.value; });
  realInput.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter' || !realInput.value.trim()) return;
    e.preventDefault();
    const text = realInput.value.trim();
    realInput.value = '';
    if (matchMedia('(hover: none)').matches) realInput.blur(); // let phones close the keyboard so the answer is visible
    clearTimeout(idleTimer);
    await userScene(text);
    resumeDemo(14000);
  });
  realInput.addEventListener('blur', () => resumeDemo(12000));

  const COLOR_WORDS = { lemon: 'lemon', yellow: 'lemon', pink: 'sakura', sakura: 'sakura', green: 'forest', forest: 'forest', purple: 'grape', grape: 'grape', violet: 'grape', blue: 'ocean', ocean: 'ocean', mint: 'mint', teal: 'mint', orange: 'sunset', sunset: 'sunset', black: 'mono', mono: 'mono', dark: 'midnight', midnight: 'midnight', paper: 'paper', white: 'daylight', light: 'daylight', default: 'daylight' };
  const ENGINES = { brave: 'Brave', duckduckgo: 'DuckDuckGo', ddg: 'DuckDuckGo', bing: 'Bing', google: 'Google', kagi: 'Kagi', ecosia: 'Ecosia', startpage: 'Startpage', perplexity: 'Perplexity' };
  const KINDS = Object.keys(PALETTES);

  async function userScene(text) {
    const token = ++demoToken;
    const t = text.toLowerCase();
    hero.typed.textContent = '';
    hero.reset();
    if (/^(yo+|youtube|yt)[!.]*$/.test(t)) { await playScene(hero, SCENES[3], token, false); return; }
    const theme = Object.keys(COLOR_WORDS).find((w) => new RegExp(`\\b${w}\\b`).test(t));
    const engine = Object.keys(ENGINES).find((w) => new RegExp(`\\b${w}\\b`).test(t));
    const done = [];
    const acts = [];
    if (theme && /\b(make|colou?r|theme|turn|go|set|something|it|browser|mode)\b/.test(t)) {
      const k = COLOR_WORDS[theme];
      done.push(`✓ Theme → ${k[0].toUpperCase()}${k.slice(1)}`);
      acts.push((m) => m.setTheme(k));
    }
    if (engine && /\b(search|engine|default|use)\b/.test(t)) { done.push(`✓ Search → ${ENGINES[engine]}`); acts.push((m) => m.setEngine(ENGINES[engine])); }
    if (/\b(sidebar|vertical)\b/.test(t)) { done.push('✓ Layout → sidebar'); acts.push((m) => m.setLayout('sidebar')); }
    if (/\b(top tabs|horizontal)\b/.test(t)) { done.push('✓ Layout → top tabs'); acts.push((m) => m.setLayout('top')); }
    let seed = 0;
    for (const c of t) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
    const img = Array.from({ length: 6 }, (_, i) => KINDS[(seed + i * 3) % KINDS.length]);
    let reply;
    if (done.length) reply = `<p>Done ✌️</p>${done.map((d) => `<span class="m-done">${esc(d)}</span>`).join('')}`;
    else if (/^(hey+|hi+|hello+|sup|yo+)\b/.test(t)) reply = '<p>hey! this is the website demo, so I can only pretend here 😄 — grab Slice and I\'ll actually help.</p>';
    else reply = `<p>This is the website demo, so I can't really look up <b>“${esc(text)}”</b> 😅</p><p>Download Slice and I'll search, read the top pages and answer with sources in about a second.</p>`;
    await playScene(hero, { q: text, reply, img, after: acts.length ? (m) => acts.forEach((a) => a(m)) : null, web: !done.length && text.split(' ').length > 2 }, token, false);
  }

  // ======================================================================
  // Ticker + typers
  // ======================================================================
  const SAYS = ['yo', '2026 news', 'make my browser lemon colored', 'is it true that bananas are berries?', 'reddit', 'best beaches in portugal', 'summarize this page', 'use brave search', 'vertical tabs pls', 'make it see-through', 'whats ur ai model?', 'remember I\'m vegetarian', 'open github', 'explain this like I\'m 12', 'hey!'];
  const mq = $('#mq1');
  const ticker = SAYS.map((s) => `<span class="say">${esc(s)}</span>`).join('');
  mq.innerHTML = ticker + ticker;

  $$('.typer').forEach(async (el) => {
    const words = el.dataset.words.split('|');
    let i = 0;
    await sleep(800);
    for (;;) {
      const w = words[i++ % words.length];
      for (let k = 1; k <= w.length; k++) { el.textContent = w.slice(0, k); await sleep(55 + Math.random() * 40); }
      await sleep(1600);
      for (let k = w.length; k >= 0; k--) { el.textContent = w.slice(0, k); await sleep(22); }
      await sleep(300);
    }
  });

  // ======================================================================
  // Feature visuals
  // ======================================================================
  const panelViz = $('#panel-viz');
  (async () => {
    const sets = [['beach', 'sunset', 'beach'], ['alps', 'mint', 'beach'], ['sunset', 'rose', 'beach']];
    let n = 0;
    for (;;) {
      panelViz.innerHTML = HEIGHTS.slice(0, 6).map((h) => `<div class="pv-sk" style="height:${h * 0.65}px"></div>`).join('');
      await sleep(1300);
      panelViz.innerHTML = tiles(sets[n++ % sets.length], n, 6).replaceAll('m-img', 'm-img pv');
      await sleep(3400);
    }
  })();

  const SAY_PAIRS = [['yo', 'YouTube'], ['reddit', 'Reddit'], ['gh', 'GitHub'], ['insta', 'Instagram'], ['hn', 'Hacker News'], ['spotify', 'Spotify']];
  (async () => {
    const sin = $('#say-in'); const sout = $('#say-out');
    let i = 1;
    for (;;) {
      await sleep(2200);
      const [a, b] = SAY_PAIRS[i++ % SAY_PAIRS.length];
      sin.textContent = a; sout.textContent = b;
    }
  })();

  (async () => {
    const rows = $$('#auto-viz .sw-row');
    for (;;) {
      for (const r of rows) { await sleep(700); r.classList.add('on'); }
      await sleep(2200);
      rows.forEach((r) => r.classList.remove('on'));
      await sleep(600);
    }
  })();

  const counter = $('#blocked-count');
  let blocked = 0;
  let counting = false;
  new IntersectionObserver(([e]) => { counting = e.isIntersecting; }).observe(counter);
  setInterval(() => { if (counting) { blocked += 1 + Math.floor(Math.random() * 4); counter.textContent = blocked.toLocaleString(); } }, 260);

  // ======================================================================
  // Customize playground
  // ======================================================================
  const pg = createMock($('#pg-mock-wrap'));
  const pgPreview = $('#pg-preview');
  const czWord = $('#cz-word');
  const swatches = $('#pg-themes');
  for (const [k, [a, b, , mode]] of Object.entries(THEMES)) {
    const s = document.createElement('button');
    s.className = `swatch${k === 'daylight' ? ' on' : ''}`;
    s.title = k;
    s.setAttribute('aria-label', `${k} theme`);
    s.style.setProperty('--a', a); s.style.setProperty('--b', b);
    if (mode === 'light') s.style.setProperty('--base', '#f6f5f1');
    s.addEventListener('click', () => setPgTheme(k));
    swatches.append(s);
  }
  function setPgTheme(k) {
    pg.setTheme(k);
    $$('.swatch', swatches).forEach((s) => s.classList.toggle('on', s.title === k));
    czWord.textContent = k === 'daylight' ? 'yours' : k;
  }
  const seg = $('#pg-layout');
  const setPgLayout = (v) => { pg.setLayout(v); $$('button', seg).forEach((b) => b.classList.toggle('on', b.dataset.v === v)); };
  seg.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setPgLayout(b.dataset.v); });
  const tg = (id, fn) => { const b = $(id); b.addEventListener('click', () => { const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(on)); fn(on); }); return (on) => { b.setAttribute('aria-pressed', String(on)); fn(on); }; };
  const setGlass = tg('#pg-glass', (on) => { pg.setGlass(on); pgPreview.classList.toggle('glass', on); });
  tg('#pg-compact', (on) => pg.setCompact(on));
  const radius = $('#pg-radius');
  radius.addEventListener('input', () => { pg.setRadius(+radius.value); $('#pg-radius-out').textContent = `${radius.value}px`; });
  $$('.ask-chips button').forEach((b) => b.addEventListener('click', () => {
    const a = b.dataset.ask;
    if (a === 'lemon' || a === 'sakura') setPgTheme(a);
    if (a === 'sidebar') setPgLayout('sidebar');
    if (a === 'glass') setGlass(true);
    b.animate([{ transform: 'scale(.94)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'cubic-bezier(.34,1.56,.64,1)' });
  }));
  pg.ntp.classList.add('chat', 'open');
  pg.q.textContent = 'weekend in the alps';
  pg.thread.innerHTML = '<div class="m-msg u"><span>weekend in the alps</span></div><div class="m-msg a"><i class="m-logo"></i><div class="col"><span class="m-status"><i class="fv" style="--c:#2f7bff"></i><i class="fv" style="--c:#10b981"></i><i class="fv" style="--c:#f59e0b"></i>&nbsp;&nbsp;Read 3 of 6 results</span><p>Try <b>Zermatt</b> for the Matterhorn views <span class="m-cite">1</span>, <b>Grindelwald</b> for easy hikes <span class="m-cite">2</span>, or <b>Chamonix</b> if you want the cable cars <span class="m-cite">3</span>. Want a 2-day plan?</p></div></div>';
  pg.grid.innerHTML = tiles(['alps', 'mint', 'alps', 'sunset'], 5);

  // ======================================================================
  // Memory sorter
  // ======================================================================
  const SORT = [['best beaches in portugal', 'kept'], ['yo', 'discarded'], ['symptoms of strep throat', 'private'], ['synthwave albums 2026', 'kept'], ['hey!', 'discarded'], ['my credit score', 'private'], ['mechanical keyboard switches', 'kept'], ['reddit', 'discarded'], ['am i depressed', 'private'], ['3d printed esp32 case', 'kept'], ['lol', 'discarded'], ['dating app tips', 'private']];
  const sorterIn = $('#sorter-in');
  let sorting = false;
  new IntersectionObserver(([e]) => { if (e.isIntersecting && !sorting) { sorting = true; runSorter(); } }, { threshold: 0.25 }).observe($('#sorter'));
  async function runSorter() {
    const lock = document.createElement('div');
    lock.className = 'lock';
    lock.textContent = '🔒 the AI never sees these';
    $('.bin.private').append(lock);
    let i = 0;
    for (;;) {
      const [q, bin] = SORT[i++ % SORT.length];
      const chip = document.createElement('div');
      chip.className = 'q-fly';
      chip.textContent = q;
      sorterIn.append(chip);
      await sleep(900);
      const target = $(`.bin.${bin} .bin-items`);
      const a = chip.getBoundingClientRect();
      const b = target.getBoundingClientRect();
      chip.classList.add('go');
      chip.style.transform = `translate(${b.left + b.width / 2 - (a.left + a.width / 2)}px, ${b.top + 20 - a.top}px) scale(.7)`;
      await sleep(650);
      chip.remove();
      const item = document.createElement('div');
      item.className = 'bin-item';
      item.textContent = q;
      target.prepend(item);
      while (target.children.length > 4) target.lastElementChild.remove();
      await sleep(700);
    }
  }

  // ======================================================================
  // Nav, reveal, progress, glass
  // ======================================================================
  const nav = $('#nav');
  const menuBtn = $('#menu-btn');
  menuBtn.addEventListener('click', () => { const open = !nav.classList.contains('open'); nav.classList.toggle('open', open); menuBtn.setAttribute('aria-expanded', String(open)); });
  $$('#nav-links a').forEach((a) => a.addEventListener('click', () => { nav.classList.remove('open'); menuBtn.setAttribute('aria-expanded', 'false'); }));
  document.addEventListener('click', (e) => { if (!nav.contains(e.target)) nav.classList.remove('open'); });

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }, { threshold: 0.1, rootMargin: '0px 0px -5% 0px' });
  $$('.reveal').forEach((el) => {
    if (el.closest('.hero')) return;
    const sibs = [...el.parentElement.children].filter((c) => c.classList.contains('reveal'));
    el.style.setProperty('--d', `${Math.min(sibs.indexOf(el), 6) * 0.07}s`);
    io.observe(el);
  });

  const progress = $('#progress');
  const gScene = $('#glass-scene');
  const gWin = $('#glass-win');
  let ticking = false;
  function onScroll() {
    ticking = false;
    const y = scrollY;
    const max = document.documentElement.scrollHeight - innerHeight;
    progress.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
    nav.classList.toggle('scrolled', y > 20);
    const g = gScene.getBoundingClientRect();
    const gp = Math.max(0, Math.min(1, 1 - (g.top + g.height * 0.2) / innerHeight));
    gWin.style.setProperty('--gw-a', String(0.42 - gp * 0.27));
    gWin.style.setProperty('--gw-b', `${10 + gp * 20}px`);
  }
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  addEventListener('resize', onScroll);
  onScroll();


  // Download buttons fetch the .exe straight away (GitHub's latest-release asset URL), no GitHub page.
  const toast = $('#dl-toast');
  let toastTimer;
  $$('a[data-dl]').forEach((a) => a.addEventListener('click', () => {
    const file = a.href.split('/').pop();
    $('#dl-toast-file').textContent = /windows/i.test(navigator.userAgent) || !matchMedia('(hover: none)').matches
      ? `Open ${file} when it finishes.` : `Slice is for Windows — grab ${file} on your PC.`;
    toast.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('on'), 6000);
  }));

  runBoot();
})();
