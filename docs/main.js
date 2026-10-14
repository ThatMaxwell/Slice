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
  // Sound — a soft, airy chime synthesised live (no audio files)
  // ======================================================================
  let ac = null;
  try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* no audio */ }
  const unlock = () => { if (ac && ac.state !== 'running') ac.resume().catch(() => {}); };
  ['pointerdown', 'keydown', 'touchstart'].forEach((e) => addEventListener(e, unlock, { capture: true, passive: true }));

  function chime() {
    if (!ac || ac.state !== 'running') return false;
    const t0 = ac.currentTime + 0.03;
    const out = ac.createGain();
    out.gain.value = 0.85;
    const comp = ac.createDynamicsCompressor();
    out.connect(comp).connect(ac.destination);
    const tone = ac.createBiquadFilter();
    tone.type = 'lowpass'; tone.frequency.value = 5200; tone.connect(out);
    // a little room: two feedback delays, darkened
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
    // warm pad (C, G) + a rising Cmaj9 bloom of bell partials
    voice(130.81, 0, 0.09, 4.2, 0.6, 'triangle');
    voice(196.0, 0.05, 0.07, 4.0, 0.7, 'triangle');
    const bloom = [[523.25, 0.0], [783.99, 0.07], [987.77, 0.14], [1174.66, 0.21], [1567.98, 0.3]];
    bloom.forEach(([f, at], i) => {
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
  // Boot sequence
  // ======================================================================
  const boot = $('#boot');
  const loader = $('#loader');
  const pct = $('#load-pct');
  const stage = $('.boot-stage');
  const soundChip = $('#sound-chip');
  let booted = false;
  let chimed = false;

  const preload = (src) => new Promise((r) => { const i = new Image(); i.onload = i.onerror = () => (i.decode ? i.decode().catch(() => {}).then(r) : r()); i.src = src; });

  async function runBoot() {
    const assets = Promise.all(['assets/slice-mini-white.svg', 'assets/slice-logo.webp', 'assets/slice-logo-512.png'].map(preload));
    // 1) 2s loader: the Slice shape fills like the tide
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
    // 2) a beat of pure black
    await sleep(reduce ? 200 : 1000);
    if (booted) return;
    // 3) the white mark — instantly — with the chime
    boot.classList.add('show-white');
    chimed = chime();
    if (!chimed && ac) soundChip.hidden = false;
    await sleep(reduce ? 300 : 1400);
    if (booted) return;
    // 4) white melts into the full-colour logo, like the tide coming in
    boot.classList.add('show-color');
    await sleep(reduce ? 300 : 1500);
    if (booted) return;
    // 5) the logo flies to its place in the nav while the site fades up
    soundChip.hidden = true;
    await flyToNav();
    finishBoot();
  }

  async function flyToNav() {
    const target = $('#brand-logo').getBoundingClientRect();
    const from = stage.getBoundingClientRect();
    const dx = target.left + target.width / 2 - (from.left + from.width / 2);
    const dy = target.top + target.height / 2 - (from.top + from.height / 2);
    const sc = target.width / from.width;
    whoosh();
    document.body.classList.add('site-in');
    boot.style.transition = 'background-color 1s cubic-bezier(.76,0,.24,1)';
    boot.style.backgroundColor = 'rgba(0,0,0,0)';
    stage.classList.add('flying');
    stage.style.transform = `translate(${dx}px, ${dy}px) scale(${sc})`;
    stage.style.filter = 'none';
    revealHero();
    await sleep(reduce ? 200 : 1080);
  }

  function finishBoot() {
    if (booted) return;
    booted = true;
    $('#brand-logo').style.transition = 'none';
    document.body.classList.remove('is-booting');
    boot.classList.add('done');
    setTimeout(() => boot.remove(), 1200);
    revealHero();
    startDemo();
  }

  $('#skip').addEventListener('click', () => { booted = true; boot.style.transition = 'opacity .5s'; document.body.classList.remove('is-booting'); boot.classList.add('done'); setTimeout(() => boot.remove(), 600); revealHero(); startDemo(); });
  soundChip.addEventListener('click', (e) => { e.stopPropagation(); unlock(); setTimeout(() => { chime(); }, 60); soundChip.hidden = true; });

  let heroRevealed = false;
  function revealHero() {
    if (heroRevealed) return;
    heroRevealed = true;
    $$('.hero .reveal').forEach((el, i) => { el.style.setProperty('--d', `${0.15 + i * 0.09}s`); el.classList.add('in'); });
  }

  // ======================================================================
  // Mock browser (rendered at 1120×700 and scaled to fit)
  // ======================================================================
  const THEMES = {
    shore: ['#2f8cff', '#ffad5c', 6, 'dark'], lemon: ['#f2cf1d', '#c6e04a', 22, 'light'], midnight: ['#7c8cff', '#b38cff', 8, 'dark'],
    sakura: ['#ff7eb6', '#ffc2d9', 14, 'light'], forest: ['#3fbf7f', '#a6d96a', 12, 'dark'], sunset: ['#ff7a45', '#ffc46b', 12, 'dark'],
    ocean: ['#00b8d9', '#5ad1ff', 14, 'dark'], grape: ['#a259ff', '#ff6bd6', 12, 'dark'], mint: ['#2ec4b6', '#cbf3f0', 16, 'light'],
    mono: ['#d4d4d8', '#71717a', 0, 'dark'], paper: ['#3d3d3d', '#9b8b74', 8, 'light'],
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
          <div class="m-input"><span class="spark">✦</span><span class="m-typed" data-ph="Ask anything, or just say a site…"></span><span class="m-caret"></span><span class="m-send">→</span><input class="m-real" aria-label="Try Slice: type a message" autocomplete="off" spellcheck="false"></div>
          <div class="m-chips"><span>yo</span><span>2026 news</span><span>make it lemon</span><span>cool esp32 projects</span></div>
        </div>
        <aside class="m-panel"><div><div class="m-ph"><b class="m-q"></b><div class="m-seg"><span class="on">Images</span><span class="m-srcn">Sources</span></div></div><div class="m-grid"></div></div></aside>
      </div>
      <div class="m-site"><div class="yt-top"><div class="yt-logo"><i></i>YouTube</div><div class="yt-search"></div></div><div class="yt-grid"></div></div>
    </div>`;

  function createMock(wrap) {
    const el = document.createElement('div');
    el.className = 'mock';
    el.dataset.layout = 'top';
    el.innerHTML = MOCK_HTML;
    wrap.append(el);
    const fit = () => {
      const s = wrap.clientWidth / 1120;
      el.style.setProperty('--s', s);
      wrap.style.height = `${700 * s}px`;
    };
    new ResizeObserver(fit).observe(wrap);
    fit();
    const m = {
      el,
      ntp: $('.m-ntp', el), thread: $('.m-thread', el), typed: $('.m-typed', el), grid: $('.m-grid', el), q: $('.m-q', el), site: $('.m-site', el),
      setTheme(key) {
        const [a, b, t, mode] = THEMES[key] || THEMES.shore;
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
    m.setTheme('shore');
    return m;
  }

  // emoji "images" on brand-ish gradients — the demo never hotlinks real photos
  const PALS = [['#2f8cff', '#5ad1ff'], ['#ff9a3c', '#ffd9a0'], ['#0aa7d8', '#2f8cff'], ['#ff7eb6', '#ffc2d9'], ['#3fbf7f', '#a6d96a'], ['#7c8cff', '#b38cff'], ['#ff7a45', '#ffc46b'], ['#1c2b4a', '#3a5a9a'], ['#f2cf1d', '#c6e04a']];
  const HEIGHTS = [118, 160, 96, 140, 176, 110, 150, 124, 168, 100, 136, 156];
  function tiles(emojis, offset = 0) {
    return emojis.map((e, i) => {
      const [a, b] = PALS[(i + offset) % PALS.length];
      return `<div class="m-img" style="--a:${a};--b:${b};height:${HEIGHTS[(i + offset) % HEIGHTS.length]}px;animation-delay:${i * 45}ms"><span>${e}</span></div>`;
    }).join('');
  }
  const skeleton = () => HEIGHTS.slice(0, 9).map((h, i) => `<div class="m-sk" style="height:${h}px;animation-delay:${i * 50}ms"></div>`).join('');

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
  // Hero demo: Slice doing its thing, on loop. Visitors can type too.
  // ======================================================================
  const heroWrap = $('#hero-mock-wrap');
  const hero = createMock(heroWrap);
  const caption = $('#demo-caption-text');
  let demoToken = 0;
  let userTyping = false;
  let idleTimer = null;

  const SCENES = [
    {
      q: 'hey!',
      reply: '<p>hey hey 👋 what are we getting into today?</p>',
      img: ['👋', '☀️', '🌊', '😄', '✨', '🏖️', '🎧', '🌅', '🙌'],
    },
    {
      q: 'cool esp32 projects', web: true,
      reply: '<p>Here are some <b>ESP32 builds</b> people love right now <span class="m-cite">1</span></p><ul><li><b>E-ink weather station</b> — months on one 18650 <span class="m-cite">1</span></li><li><b>Pocket synth</b> with an I²S DAC <span class="m-cite">2</span></li><li><b>LED matrix clock</b> pulling live data</li><li><b>ESP32-CAM doorbell</b> <span class="m-cite">3</span></li></ul><p>want a parts list for one?</p>',
      img: ['📟', '🔌', '🤖', '💡', '📷', '🎛️', '🌦️', '⌚', '🛰️'],
      sources: [['randomnerdtutorials.com', '40+ ESP32 projects to build this weekend'], ['hackster.io', 'ESP32 synths, robots and more'], ['reddit.com', 'r/esp32 — what are you building?']],
    },
    {
      q: 'make my browser lemon colored and use brave search',
      reply: '<p>Done — lemon mode on and Brave is your search now 🍋</p><span class="m-done">✓ Theme → Lemon</span><span class="m-done">✓ Search → Brave Search</span>',
      img: ['🍋', '🌼', '🍯', '🌻', '🧽', '🐤', '⭐', '🌕', '🍌'],
      after: (m) => { m.setTheme('lemon'); m.setEngine('Brave'); },
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

  async function playScene(m, sc, token) {
    const alive = () => token === demoToken;
    if (!await typeText(m, sc.q, token)) return false;
    m.typed.textContent = '';
    m.ntp.classList.add('chat');
    m.thread.insertAdjacentHTML('beforeend', `<div class="m-msg u"><span>${esc(sc.q)}</span></div>`);
    if (sc.open) {
      m.thread.insertAdjacentHTML('beforeend', '<div class="m-msg a"><i class="m-logo"></i><div class="col"><p>Opening <b>YouTube</b>…</p></div></div>');
      await sleep(700); if (!alive()) return false;
      $('.yt-grid', m.el).innerHTML = Array.from({ length: 12 }, (_, i) => { const [a, b] = PALS[i % PALS.length]; return `<div class="yt-card" style="--a:${a};--b:${b}"><i></i><b></b><s></s></div>`; }).join('');
      m.site.classList.add('on');
      m.setTab('YouTube', '#ff0033');
      $('.m-url', m.el).textContent = 'youtube.com';
      await sleep(3200);
      return alive();
    }
    // panel opens with a skeleton, images land a beat later
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
      stat.innerHTML = '<span class="m-status"><i class="fv" style="--c:#3b82f6"></i><i class="fv" style="--c:#f59e0b"></i><i class="fv" style="--c:#ff4500"></i>&nbsp;&nbsp;Read 3 of 6 results</span>';
      $('.m-srcn', m.el).textContent = 'Sources · 3';
    } else {
      $('.m-srcn', m.el).textContent = 'Sources';
      await sleep(500);
    }
    setTimeout(() => { if (alive()) m.grid.innerHTML = tiles(sc.img, SCENES.indexOf(sc) * 2); }, sc.web ? 100 : 700);
    if (!alive()) return false;
    const dur = streamInto(txt, sc.reply);
    await sleep(dur + 200); if (!alive()) return false;
    sc.after?.(m);
    await sleep(sc.after ? 3000 : 2600);
    return alive();
  }

  async function demoLoop() {
    const token = ++demoToken;
    caption.textContent = 'Live demo — click the bar and type anything';
    while (token === demoToken) {
      for (const sc of SCENES) {
        if (!await playScene(hero, sc, token)) return;
        if (sc !== SCENES[SCENES.length - 2] && !sc.open) { hero.reset(); await sleep(500); }
      }
      hero.reset();
      hero.setTheme('shore');
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

  // visitors can type into the demo
  const realInput = $('.m-real', hero.el);
  realInput.addEventListener('focus', () => {
    demoToken++; userTyping = true;
    hero.reset();
    caption.textContent = 'Your turn — try “yo”, “make it pink” or anything';
  });
  realInput.addEventListener('input', () => { hero.typed.textContent = realInput.value; });
  realInput.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter' || !realInput.value.trim()) return;
    const text = realInput.value.trim();
    realInput.value = '';
    clearTimeout(idleTimer);
    await userScene(text);
    idleTimer = setTimeout(() => { if (document.activeElement !== realInput) { userTyping = false; hero.reset(); hero.setTheme('shore'); hero.setEngine('Google'); demoLoop(); } }, 14000);
  });
  realInput.addEventListener('blur', () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { if (userTyping) { userTyping = false; hero.reset(); hero.setTheme('shore'); hero.setEngine('Google'); demoLoop(); } }, 9000);
  });

  const COLOR_WORDS = { lemon: 'lemon', yellow: 'lemon', pink: 'sakura', sakura: 'sakura', green: 'forest', forest: 'forest', purple: 'grape', grape: 'grape', violet: 'grape', blue: 'ocean', ocean: 'ocean', mint: 'mint', teal: 'mint', orange: 'sunset', sunset: 'sunset', black: 'mono', mono: 'mono', gray: 'mono', grey: 'mono', midnight: 'midnight', paper: 'paper', white: 'paper', light: 'paper', default: 'shore', shore: 'shore' };
  const ENGINES = { brave: 'Brave', duckduckgo: 'DuckDuckGo', ddg: 'DuckDuckGo', bing: 'Bing', google: 'Google', kagi: 'Kagi', ecosia: 'Ecosia', startpage: 'Startpage', perplexity: 'Perplexity' };
  const EMOJI = ['✨', '🌊', '🚀', '🎧', '🌅', '🧠', '🎨', '📚', '🍕', '🛠️', '🌙', '⚡', '🎮', '🌿', '📸', '🏝️'];

  async function userScene(text) {
    const token = ++demoToken;
    const t = text.toLowerCase();
    hero.typed.textContent = '';
    if (/^(yo+|youtube|yt)[!.]*$/.test(t)) { hero.reset(); await playScene(hero, SCENES[3], token); return; }
    const theme = Object.keys(COLOR_WORDS).find((w) => new RegExp(`\\b${w}\\b`).test(t));
    const engine = Object.keys(ENGINES).find((w) => new RegExp(`\\b${w}\\b`).test(t));
    const done = [];
    let after = null;
    if (theme && /\b(make|color|colou?r|theme|turn|go|set|something|it|browser)\b/.test(t)) {
      const k = COLOR_WORDS[theme];
      done.push(`✓ Theme → ${k[0].toUpperCase()}${k.slice(1)}`);
      after = (m) => m.setTheme(k);
    }
    if (engine && /\b(search|engine|default|use)\b/.test(t)) {
      done.push(`✓ Search → ${ENGINES[engine]}`);
      const prev = after;
      after = (m) => { prev?.(m); m.setEngine(ENGINES[engine]); };
    }
    if (/\b(sidebar|vertical)\b/.test(t)) { done.push('✓ Layout → sidebar'); const prev = after; after = (m) => { prev?.(m); m.setLayout('sidebar'); }; }
    if (/\b(top tabs|horizontal)\b/.test(t)) { done.push('✓ Layout → top tabs'); const prev = after; after = (m) => { prev?.(m); m.setLayout('top'); }; }
    let seed = 0;
    for (const c of t) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
    const img = Array.from({ length: 9 }, (_, i) => EMOJI[(seed + i * 7) % EMOJI.length]);
    let reply;
    if (done.length) reply = `<p>Done ✌️</p>${done.map((d) => `<span class="m-done">${esc(d)}</span>`).join('')}`;
    else if (/^(hey+|hi+|hello+|sup|yo+)\b/.test(t)) reply = '<p>hey! this is the website demo, so I can only pretend here 😄 — grab Slice and I\'ll actually help.</p>';
    else reply = `<p>This is just the website demo, so I can't really look up <b>“${esc(text)}”</b> yet 😅</p><p>Download Slice and I'll search, read the top pages and answer with sources — in about a second.</p>`;
    hero.reset();
    await playScene(hero, { q: text, reply, img, after, web: !done.length && text.split(' ').length > 2 }, token);
  }

  // ======================================================================
  // Marquee + typers
  // ======================================================================
  const SAYS = ['yo', '2026 news', 'make my browser lemon colored', 'is it true that bananas are berries?', 'reddit', 'cool esp32 projects', 'summarize this page', 'use brave search', 'vertical tabs pls', 'make it see-through', 'whats ur ai model?', 'best synthwave albums', 'remember I\'m vegetarian', 'open github', 'explain this like I\'m 12', 'hey!', 'compare these two laptops', 'something pink'];
  const fillTrack = (el, items) => { const html = items.map((s) => `<span class="say-chip"><span class="spark">✦</span>${esc(s)}</span>`).join(''); el.innerHTML = html + html; };
  fillTrack($('#mq1'), SAYS.slice(0, 9));
  fillTrack($('#mq2'), SAYS.slice(9));

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
  // Bento animations
  // ======================================================================
  const panelViz = $('#panel-viz');
  (async () => {
    const sets = [['📟', '🔌', '🤖', '💡', '📷', '🎛️'], ['🍋', '🌼', '🍯', '🌻', '⭐', '🌕'], ['👋', '☀️', '🌊', '😄', '✨', '🏖️']];
    let n = 0;
    for (;;) {
      panelViz.innerHTML = HEIGHTS.slice(0, 6).map((h, i) => `<div class="pv-sk" style="height:${h}px"></div>`).join('');
      await sleep(1300);
      panelViz.innerHTML = tiles(sets[n++ % sets.length], n).replaceAll('m-img', 'm-img pv');
      await sleep(3200);
    }
  })();

  const SAY_PAIRS = [['yo', 'YouTube', '#ff0033'], ['reddit', 'Reddit', '#ff4500'], ['gh', 'GitHub', '#8b949e'], ['insta', 'Instagram', '#e1306c'], ['hn', 'Hacker News', '#ff6600'], ['spotify', 'Spotify', '#1db954']];
  (async () => {
    const box = $('.say'); const sin = $('#say-in'); const sout = $('#say-out');
    let i = 1;
    for (;;) {
      await sleep(2200);
      box.classList.add('swap');
      await sleep(320);
      const [a, b, c] = SAY_PAIRS[i++ % SAY_PAIRS.length];
      sin.textContent = a;
      sout.innerHTML = `<i style="background:${c}"></i>${b}`;
      box.classList.remove('swap');
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

  (async () => {
    const lv = $('#layout-viz');
    for (;;) { await sleep(2600); lv.classList.toggle('side'); }
  })();

  // blocked counter ticks while visible
  const counter = $('#blocked-count');
  let blocked = 0;
  let counting = false;
  new IntersectionObserver(([e]) => { counting = e.isIntersecting; }).observe(counter);
  setInterval(() => { if (counting) { blocked += 1 + Math.floor(Math.random() * 4); counter.textContent = blocked.toLocaleString(); } }, 260);

  // ======================================================================
  // Customize playground
  // ======================================================================
  const pgWrap = $('#pg-mock-wrap');
  const pg = createMock(pgWrap);
  const pgPreview = $('.pg-preview');
  const czWord = $('#cz-word');
  const swatches = $('#pg-themes');
  for (const [k, [a, b, , mode]] of Object.entries(THEMES)) {
    const s = document.createElement('button');
    s.className = `swatch${k === 'shore' ? ' on' : ''}`;
    s.title = k;
    s.style.setProperty('--a', a); s.style.setProperty('--b', b);
    if (mode === 'light') s.style.setProperty('--base', '#f3f2ee');
    s.addEventListener('click', () => setPgTheme(k));
    swatches.append(s);
  }
  function setPgTheme(k) {
    pg.setTheme(k);
    $$('.swatch', swatches).forEach((s) => s.classList.toggle('on', s.title === k));
    czWord.textContent = k === 'shore' ? 'yours' : k;
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
  // show a little life in the playground mock
  pg.ntp.classList.add('chat', 'open');
  pg.q.textContent = 'best synthwave albums';
  pg.thread.innerHTML = '<div class="m-msg u"><span>best synthwave albums</span></div><div class="m-msg a"><i class="m-logo"></i><div class="col"><span class="m-status"><i class="fv" style="--c:#a259ff"></i><i class="fv" style="--c:#ff6bd6"></i><i class="fv" style="--c:#2f8cff"></i>&nbsp;&nbsp;Read 3 of 6 results</span><p>Start with <b>The Midnight — Endless Summer</b> <span class="m-cite">1</span>, <b>FM-84 — Atlas</b> <span class="m-cite">2</span> and <b>Gunship</b> <span class="m-cite">3</span>. Want a playlist?</p></div></div>';
  pg.grid.innerHTML = tiles(['🌆', '🎹', '🕶️', '🌴', '📼', '🚗', '🌅', '💜', '🎧'], 3);

  // ======================================================================
  // Glass scene: the frame gets glassier as you scroll through it
  // ======================================================================
  const gScene = $('#glass-scene');
  const gWin = $('#glass-win');

  // ======================================================================
  // Memory sorter
  // ======================================================================
  const SORT = [['cool esp32 projects', 'kept'], ['yo', 'discarded'], ['symptoms of strep throat', 'private'], ['best synthwave albums 2026', 'kept'], ['hey!', 'discarded'], ['my credit score', 'private'], ['mechanical keyboard switches', 'kept'], ['reddit', 'discarded'], ['am i depressed', 'private'], ['3d printed esp32 case', 'kept'], ['lol', 'discarded'], ['dating app tips', 'private']];
  const sorterIn = $('#sorter-in');
  let sorting = false;
  new IntersectionObserver(([e]) => { if (e.isIntersecting && !sorting) { sorting = true; runSorter(); } }, { threshold: 0.3 }).observe($('#sorter'));
  async function runSorter() {
    const lock = document.createElement('div');
    lock.className = 'lock';
    lock.innerHTML = '🔒 the AI never sees these';
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
  // Scroll: reveal, progress, nav, hero tilt, glass
  // ======================================================================
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  $$('.reveal').forEach((el) => {
    if (el.closest('.hero')) return;
    const sibs = [...el.parentElement.children].filter((c) => c.classList.contains('reveal'));
    el.style.setProperty('--d', `${Math.min(sibs.indexOf(el), 6) * 0.08}s`);
    io.observe(el);
  });

  const progress = $('#progress');
  const nav = $('#nav');
  const stageEl = $('#hero-stage');
  let ticking = false;
  function onScroll() {
    ticking = false;
    const y = scrollY;
    const max = document.documentElement.scrollHeight - innerHeight;
    progress.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
    nav.classList.toggle('scrolled', y > 30);
    // hero mock leans back, then flattens as it scrolls into view
    const r = stageEl.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, 1 - (r.top - innerHeight * 0.15) / (innerHeight * 0.75)));
    if (!reduce) heroWrap.style.transform = `rotateX(${(1 - p) * 14}deg) scale(${0.94 + p * 0.06})`;
    // glass gets glassier
    const g = gScene.getBoundingClientRect();
    const gp = Math.max(0, Math.min(1, 1 - (g.top + g.height * 0.2) / innerHeight));
    gWin.style.setProperty('--gw-a', String(0.32 - gp * 0.22));
    gWin.style.setProperty('--gw-b', `${10 + gp * 20}px`);
  }
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  addEventListener('resize', onScroll);
  onScroll();

  // ======================================================================
  // Pointer niceties: cursor glow, spotlight cards, magnetic buttons, tilt
  // ======================================================================
  const glow = $('#cursor-glow');
  addEventListener('pointermove', (e) => { glow.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`; }, { passive: true });

  $$('.spot').forEach((c) => c.addEventListener('pointermove', (e) => {
    const r = c.getBoundingClientRect();
    c.style.setProperty('--mx', `${e.clientX - r.left}px`);
    c.style.setProperty('--my', `${e.clientY - r.top}px`);
  }));

  if (!reduce && matchMedia('(hover: hover)').matches) {
    $$('.magnetic').forEach((b) => {
      b.addEventListener('pointermove', (e) => {
        const r = b.getBoundingClientRect();
        b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.18}px, ${(e.clientY - r.top - r.height / 2) * 0.3}px)`;
      });
      b.addEventListener('pointerleave', () => { b.style.transform = ''; });
    });
    $$('.tilt').forEach((c) => {
      c.addEventListener('pointermove', (e) => {
        const r = c.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        c.style.transform = `perspective(900px) rotateY(${x * 7}deg) rotateX(${-y * 7}deg) translateZ(0)`;
      });
      c.addEventListener('pointerleave', () => { c.style.transition = 'transform .6s cubic-bezier(.2,.8,.2,1)'; c.style.transform = ''; setTimeout(() => { c.style.transition = ''; }, 600); });
    });
  }

  // in-page links close the boot if someone clicks super early
  $$('a[href^="#"]').forEach((a) => a.addEventListener('click', () => { if (!booted) $('#skip').click(); }));

  runBoot();
})();
