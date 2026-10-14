// Settings: everything is customisable, and every change applies instantly.
S.settingsUI = (() => {
  const { THEMES, SEARCH_ENGINES, FINE_TUNES, DEFAULT_MODEL } = SliceConfig;
  let root = null;
  let section = 'look';
  const set = (patch) => window.slice.settings.set(patch);
  const cur = () => S.app.settings;

  // ------------------------------------------------------------ control builders
  const row = (label, desc, control, cls = '') => S.el('div', { class: `set-row ${cls}` },
    S.el('div', { class: 'set-label' }, S.el('b', { text: label }), desc ? S.el('span', { text: desc }) : null), control);

  const toggle = (key, label, desc) => {
    const input = S.el('input', { type: 'checkbox', class: 'switch', 'data-key': key });
    input.checked = !!cur()[key];
    input.addEventListener('change', () => set({ [key]: input.checked }));
    return row(label, desc, input);
  };

  const seg = (key, label, desc, options) => {
    const box = S.el('div', { class: 'seg wide', 'data-key': key });
    for (const [value, text] of options) {
      box.append(S.el('button', { class: cur()[key] === value ? 'on' : '', text, onclick: () => set({ [key]: value }) }));
    }
    return row(label, desc, box, 'stack-sm');
  };

  const slider = (key, label, desc, min, max, step = 1, unit = '') => {
    const val = key === 'tint' ? S.theme.resolve(cur()).tint : cur()[key] ?? min;
    const out = S.el('output', { text: `${val}${unit}` });
    const input = S.el('input', { type: 'range', min, max, step, value: val });
    const commit = S.debounce((v) => set({ [key]: v }), 60);
    input.addEventListener('input', () => { out.textContent = `${input.value}${unit}`; commit(Number(input.value)); });
    return row(label, desc, S.el('div', { class: 'slider' }, input, out));
  };

  const text = (key, label, desc, { type = 'text', placeholder = '', area = false } = {}) => {
    const input = S.el(area ? 'textarea' : 'input', { type, placeholder, spellcheck: 'false', class: area ? 'code' : '' });
    input.value = cur()[key] ?? '';
    input.addEventListener('change', () => set({ [key]: input.value.trim() }));
    return row(label, desc, input, area ? 'stack' : '');
  };

  const select = (key, label, desc, options) => {
    const sel = S.el('select', {}, ...options.map(([v, t]) => S.el('option', { value: v, text: t, selected: cur()[key] === v })));
    sel.addEventListener('change', () => set({ [key]: sel.value }));
    return row(label, desc, sel);
  };

  const button = (label, onclick, cls = '') => S.el('button', { class: `btn ${cls}`, text: label, onclick });

  // ------------------------------------------------------------ sections
  const SECTIONS = {
    look: { name: 'Look & feel', icon: '◐', build: buildLook },
    ai: { name: 'AI', icon: '✦', build: buildAI },
    memory: { name: 'Memory', icon: '◎', build: buildMemory },
    search: { name: 'Search', icon: '⌕', build: buildSearch },
    privacy: { name: 'Privacy & blocking', icon: '⛨', build: buildPrivacy },
    account: { name: 'Account', icon: '☺', build: buildAccount },
    mods: { name: 'Mods', icon: '✎', build: buildMods },
    keys: { name: 'Shortcuts', icon: '⌘', build: buildKeys },
    about: { name: 'About Slice', icon: 'ⓘ', build: buildAbout },
  };

  function buildLook() {
    const s = cur();
    const grid = S.el('div', { class: 'theme-grid' });
    for (const [k, t] of Object.entries(THEMES)) {
      grid.append(S.el('button', {
        class: `theme-card${s.theme === k && !s.accent ? ' on' : ''}`, 'data-mode': t.mode,
        style: { '--a': t.accent, '--b': t.accent2 },
        onclick: () => set({ theme: k, accent: '', accent2: '', tint: null, mode: 'theme' }),
      }, S.el('span', { class: 'theme-swatch' }), S.el('span', { text: t.name })));
    }
    const color = (key, label) => {
      const resolved = S.theme.resolve(s);
      const input = S.el('input', { type: 'color', value: s[key] || (key === 'accent' ? resolved.accent : resolved.accent2) });
      input.addEventListener('input', S.debounce(() => set({ [key]: input.value }), 80));
      return S.el('label', { class: 'color-pick' }, input, S.el('span', { text: label }));
    };
    return [
      S.el('h3', { text: 'Theme' }),
      grid,
      row('Custom colours', 'Pick your own accent. Clear to go back to the theme.', S.el('div', { class: 'row gap' }, color('accent', 'Accent'), color('accent2', 'Glow'), button('Reset', () => set({ accent: '', accent2: '', tint: null })))),
      slider('tint', 'Colour intensity', 'How much the accent washes over the whole window.', 0, 40, 1, '%'),
      seg('mode', 'Light / dark', null, [['theme', 'Theme'], ['dark', 'Dark'], ['light', 'Light'], ['system', 'System']]),
      S.el('h3', { text: 'Layout' }),
      seg('layout', 'Tabs', 'Classic tabs on top, or a sidebar like Arc / Zen.', [['top', 'Top tabs'], ['sidebar', 'Sidebar']]),
      toggle('compact', 'Compact mode', 'Hide the toolbar (top) or the sidebar until you hover.'),
      seg('density', 'Density', null, [['compact', 'Tight'], ['cozy', 'Cozy'], ['roomy', 'Roomy']]),
      slider('radius', 'Corner radius', null, 0, 24, 1, 'px'),
      slider('uiScale', 'Interface size', null, 80, 130, 5, '%'),
      toggle('showHomeButton', 'Home button', null),
      S.el('h3', { text: 'Glass' }),
      seg('transparency', 'Transparency', 'See your wallpaper through the browser frame. Windows 11 & macOS.', [['off', 'Off'], ['mica', 'Mica'], ['acrylic', 'Acrylic'], ['tabbed', 'Tabbed']]),
      slider('glass', 'Frame opacity', 'Lower = more see-through.', 0, 100, 1, '%'),
      S.el('h3', { text: 'Details' }),
      select('font', 'Font', null, [['system', 'System'], ['inter', 'Inter'], ['rounded', 'Rounded'], ['mono', 'Mono'], ['serif', 'Serif']]),
      toggle('animations', 'Animations', 'Smooth motion everywhere. Turn off for instant everything.'),
      toggle('siteTint', 'Tint with the site', 'The toolbar picks up the colour of the page you’re on.'),
    ];
  }

  function buildAI() {
    const s = cur();
    const tunes = S.el('div', { class: 'tune-grid' });
    for (const [k, t] of Object.entries(FINE_TUNES)) {
      const on = s.fineTunes.includes(k);
      tunes.append(S.el('button', {
        class: `tune${on ? ' on' : ''}`,
        onclick: () => set({ fineTunes: on ? s.fineTunes.filter((x) => x !== k) : [...s.fineTunes, k] }),
      }, S.el('span', { class: 'tune-icon', text: t.icon }), S.el('b', { text: t.name }), S.el('span', { text: t.blurb })));
    }
    const p = s.aiProvider;
    return [
      S.el('h3', { text: 'Engine' }),
      seg('aiProvider', 'Provider', 'Puter.js is free and needs no key. Or bring your own.', [['puter', 'Puter.js (free)'], ['gemini', 'Gemini key'], ['openai', 'OpenAI-compatible']]),
      p !== 'openai' ? text('aiModel', 'Model', `Default: ${DEFAULT_MODEL} — Google’s latest Flash-Lite.`, { placeholder: DEFAULT_MODEL }) : null,
      p === 'gemini' ? text('geminiKey', 'Gemini API key', 'From aistudio.google.com — stored only on this device.', { type: 'password', placeholder: 'AIza…' }) : null,
      p === 'gemini' ? toggle('geminiGrounding', 'Google Search grounding', 'Let Gemini answer with live Google results (cites sources).') : null,
      p === 'openai' ? text('openaiBaseUrl', 'Base URL', 'OpenRouter, Groq, Together, LM Studio, Ollama…', { placeholder: 'https://openrouter.ai/api/v1' }) : null,
      p === 'openai' ? text('openaiKey', 'API key', null, { type: 'password', placeholder: 'sk-…' }) : null,
      p === 'openai' ? text('openaiModel', 'Model', null, { placeholder: 'google/gemini-3.5-flash-lite' }) : null,
      S.el('h3', { text: 'Behaviour' }),
      seg('aiWebSearch', 'Web search', 'Auto searches when you ask about news, facts or “is … true?”. Eager searches any question.', [['auto', 'Auto'], ['eager', 'Eager'], ['off', 'Off']]),
      toggle('imagesPanel', 'Results panel', 'Show images and sources on the right for every prompt.'),
      text('braveSearchKey', 'Brave Search API key', 'Optional: faster, more reliable web results for the AI.', { type: 'password', placeholder: 'BSA…' }),
      S.el('h3', { text: 'Fine-tunes' }),
      S.el('p', { class: 'set-note', text: 'Mix and match Slice’s personality. Changes apply on the next launch, or press “Reload AI”.' }),
      tunes,
      text('customInstructions', 'Your instructions', 'Anything Slice should always know or do.', { area: true, placeholder: 'e.g. I’m in Lisbon. Keep answers under 5 lines. Metric units.' }),
      S.el('div', { class: 'row gap' }, button('Reload AI', async () => { await S.ai.init(cur()); S.toast('AI reloaded with your latest settings & memory', { icon: '✦' }); }, 'primary')),
    ];
  }

  async function buildMemory() {
    const m = await window.slice.memory.list();
    const stats = m.stats || {};
    const entries = [...(m.entries || [])].reverse().slice(0, 150);
    return [
      S.el('p', { class: 'set-note', text: 'Slice learns your taste from what you search so it can be an actual partner. It runs entirely on this device. Personal searches — health, money, relationships, identity, contact details — are never stored and never shown to the AI. Throwaway ones like “yo” are discarded.' }),
      toggle('memoryEnabled', 'Learn from my searches', null),
      S.el('div', { class: 'mem-stats' },
        S.el('div', {}, S.el('b', { text: String(stats.kept || 0) }), S.el('span', { text: 'learned from' })),
        S.el('div', {}, S.el('b', { text: String(stats.discarded || 0) }), S.el('span', { text: 'discarded' })),
        S.el('div', {}, S.el('b', { text: String(stats.private || 0) }), S.el('span', { text: 'private — never read' }))),
      S.el('h3', { text: 'Things you asked Slice to remember' }),
      m.facts?.length
        ? S.el('div', { class: 'mem-list' }, ...m.facts.map((f) => S.el('div', { class: 'mem-item' }, S.el('span', { text: f }), button('Forget', async () => { await window.slice.memory.removeFact(f); render(); }, 'ghost sm'))))
        : S.el('p', { class: 'set-note dim', text: 'Nothing yet. Say “remember I’m vegetarian” in any chat.' }),
      S.el('h3', { text: 'Recent searches it learned from' }),
      entries.length
        ? S.el('div', { class: 'mem-list' }, ...entries.map((e) => S.el('div', { class: 'mem-item' }, S.el('span', { text: e.q }), S.el('time', { text: new Date(e.t).toLocaleDateString() }), button('×', async () => { await window.slice.memory.removeEntry(e.t); render(); }, 'ghost sm'))))
        : S.el('p', { class: 'set-note dim', text: 'Empty for now.' }),
      S.el('div', { class: 'row gap' }, button('Clear all memory', async () => { if (confirm('Erase everything Slice has learned?')) { await window.slice.memory.clear(); render(); } }, 'danger')),
    ];
  }

  function buildSearch() {
    const s = cur();
    const list = S.el('div', { class: 'engine-list' });
    for (const [k, e] of Object.entries(SEARCH_ENGINES)) {
      list.append(S.el('button', { class: `engine${s.searchEngine === k ? ' on' : ''}`, onclick: () => set({ searchEngine: k }) },
        k === 'custom' ? S.el('span', { class: 'engine-ico letter', text: '+' }) : S.el('img', { class: 'engine-ico', src: S.favicon(e.url), alt: '' }),
        S.el('span', { text: e.name })));
    }
    return [
      S.el('p', { class: 'set-note', text: 'The top bar is a plain search box — no AI, just your engine. The AI lives in the new tab and the ✦ sidebar.' }),
      list,
      s.searchEngine === 'custom' ? text('customSearchUrl', 'Custom search URL', 'Use %s where the query goes.', { placeholder: 'https://example.com/search?q=%s' }) : null,
      toggle('restoreTabs', 'Reopen tabs on launch', null),
    ];
  }

  function buildPrivacy() {
    return [
      toggle('adblock', 'uBlock Origin', 'On by default. Runs uBlock Origin’s own filter lists (uBO filters, badware, privacy, unbreak, EasyList, EasyPrivacy, Peter Lowe’s) — ads, trackers and malware blocked natively.'),
      toggle('gpc', 'Global Privacy Control', 'Tell sites not to sell or share your data (Sec-GPC + DNT).'),
      S.el('p', { class: 'set-note', text: 'Slice is built on Chromium’s Blink engine with Google’s background services switched off: no sync, no Safe Browsing pings, no component updater, no Privacy Sandbox ad topics, no Translate or Media Router calls home.' }),
      S.el('h3', { text: 'Browsing data' }),
      S.el('div', { class: 'row gap' },
        button('Clear cache', async () => { await window.slice.app.clearData('cache'); S.toast('Cache cleared'); }),
        button('Clear cookies & site data', async () => { if (confirm('Sign out of all sites and clear their data?')) { await window.slice.app.clearData('all'); S.toast('Browsing data cleared'); } }, 'danger')),
    ];
  }

  function buildAccount() {
    const s = cur();
    const p = s.googleProfile;
    return [
      p
        ? S.el('div', { class: 'account-card' },
          p.picture ? S.el('img', { src: p.picture, alt: '', referrerpolicy: 'no-referrer' }) : S.el('span', { class: 'letter big', text: (p.name || '?')[0] }),
          S.el('div', {}, S.el('b', { text: p.name }), S.el('span', { text: p.email })),
          button('Sign out', () => window.slice.oauth.signOut(), 'ghost'))
        : S.el('div', { class: 'account-card empty' },
          S.el('span', { class: 'letter big', text: 'G' }),
          S.el('div', {}, S.el('b', { text: 'Not signed in' }), S.el('span', { text: 'Sign in so Slice knows your name.' })),
          button('Continue with Google', () => S.onboarding.google().then(render), 'primary')),
      text('oauthClientId', 'OAuth client ID', 'Google Cloud → Credentials → OAuth client (Desktop app). Only needed for your own builds.', { placeholder: '1234-abc.apps.googleusercontent.com' }),
    ];
  }

  function buildMods() {
    const exportTheme = () => {
      const s = cur();
      const keys = ['theme', 'accent', 'accent2', 'tint', 'mode', 'layout', 'compact', 'transparency', 'glass', 'radius', 'density', 'font', 'uiScale', 'customCss'];
      const data = Object.fromEntries(keys.map((k) => [k, s[k]]));
      navigator.clipboard.writeText(JSON.stringify({ slice: 'theme', ...data }, null, 2));
      S.toast('Theme copied to clipboard — share it anywhere');
    };
    const importTheme = async () => {
      try {
        const j = JSON.parse(await navigator.clipboard.readText());
        if (j.slice !== 'theme') throw new Error();
        delete j.slice;
        await set(j);
        S.toast('Theme imported');
        render();
      } catch { S.toast('Copy a Slice theme JSON first'); }
    };
    return [
      S.el('p', { class: 'set-note', text: 'Restyle anything in the browser frame with your own CSS. Every surface reads from CSS variables like --accent, --bg, --surface, --radius.' }),
      text('customCss', 'Custom CSS', null, { area: true, placeholder: '/* rainbow active tab */\n.tab.active { background: linear-gradient(90deg, #f0f, #0ff) !important; }' }),
      S.el('div', { class: 'row gap' }, button('Export theme', exportTheme), button('Import from clipboard', importTheme)),
    ];
  }

  function buildKeys() {
    const k = window.slice.platform === 'darwin' ? '⌘' : 'Ctrl';
    const rows = [
      [`${k} T`, 'New tab'], [`${k} Shift N`, 'New private tab'], [`${k} W`, 'Close tab'], [`${k} Shift T`, 'Reopen closed tab'],
      [`${k} L`, 'Focus the top bar'], [`${k} J`, 'Ask about this page'], [`${k} Tab`, 'Next tab'], [`${k} 1–9`, 'Jump to tab'],
      [`${k} F`, 'Find in page'], [`${k} R`, 'Reload'], ['Alt ← / →', 'Back / forward'], [`${k} + / − / 0`, 'Zoom'],
      [`${k} Shift S`, 'Toggle sidebar mode'], [`${k} Shift C`, 'Toggle compact mode'], [`${k} ,`, 'Settings'], ['F11', 'Full screen'], ['F12', 'Developer tools'],
    ];
    return [S.el('div', { class: 'keys' }, ...rows.map(([a, b]) => S.el('div', { class: 'key-row' }, S.el('kbd', { text: a }), S.el('span', { text: b }))))];
  }

  async function buildAbout() {
    const i = await window.slice.app.info();
    return [
      S.el('div', { class: 'about' },
        S.el('img', { src: 'assets/slice-logo-256.png', alt: 'Slice' }),
        S.el('h2', { text: 'Slice' }),
        S.el('p', { text: `Version ${i.version}` }),
        S.el('p', { class: 'dim', text: `Blink / Chromium ${i.chrome} · Electron ${i.electron} · ${i.platform}` }),
        S.el('p', { class: 'dim', text: 'Slice Mini and Slice Pro — coming soon. Android — coming soon.' })),
      S.el('div', { class: 'row gap center' },
        button('Make Slice my default browser', async () => { await window.slice.app.setDefault(); S.toast('Pick Slice as your web browser in the window that opened'); }, 'primary'),
        button('Run setup again', () => { close(); S.onboarding.open(); }),
        button('Reset all settings', async () => { if (confirm('Reset every setting to default?')) { await window.slice.settings.reset(); render(); } }, 'danger')),
    ];
  }

  // ------------------------------------------------------------ shell
  async function render() {
    if (!root) return;
    const nav = S.$('.set-nav', root);
    nav.replaceChildren(...Object.entries(SECTIONS).map(([k, sct]) => S.el('button', { class: k === section ? 'on' : '', onclick: () => { section = k; render(); } },
      S.el('span', { class: 'set-ico', text: sct.icon }), S.el('span', { text: sct.name }))));
    const body = S.$('.set-body', root);
    const scroll = body.scrollTop;
    const content = await SECTIONS[section].build();
    body.replaceChildren(S.el('h2', { text: SECTIONS[section].name }), ...content.flat().filter(Boolean));
    body.scrollTop = scroll;
  }

  function open(which) {
    if (which) section = which;
    if (root) { render(); return; }
    root = S.el('div', { class: 'modal settings', onclick: (e) => { if (e.target === root) close(); } },
      S.el('div', { class: 'modal-card' },
        S.el('aside', { class: 'set-side' },
          S.el('div', { class: 'set-brand' }, S.el('img', { src: 'assets/slice-logo-128.png', alt: '' }), S.el('b', { text: 'Settings' })),
          S.el('nav', { class: 'set-nav' })),
        S.el('section', { class: 'set-body' }),
        S.el('button', { class: 'icon-btn modal-x', html: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>', onclick: close })));
    document.getElementById('overlay-root').append(root);
    requestAnimationFrame(() => root.classList.add('in'));
    render();
  }

  function close() {
    if (!root) return;
    const r = root;
    root = null;
    r.classList.remove('in');
    setTimeout(() => r.remove(), 250);
  }

  // re-render when settings change elsewhere (e.g. the AI changed them)
  const refresh = S.debounce(() => { if (root && !root.contains(document.activeElement?.closest('input[type=range],textarea,input[type=text],input[type=password]'))) render(); }, 120);

  return { open, close, refresh, get isOpen() { return !!root; } };
})();
