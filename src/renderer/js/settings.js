// Settings: everything is customisable, and every change applies instantly.
S.settingsUI = (() => {
  const { THEMES, SEARCH_ENGINES, FINE_TUNES, AI_PROVIDERS, detectProvider } = SliceConfig;
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
      select('font', 'Font', null, [['slice', 'Slice (Instrument Sans)'], ['system', 'System'], ['inter', 'Inter'], ['rounded', 'Rounded'], ['mono', 'Mono'], ['serif', 'Serif']]),
      toggle('animations', 'Animations', 'Smooth motion everywhere. Turn off for instant everything.'),
      toggle('siteTint', 'Tint with the site', 'The toolbar picks up the colour of the page you’re on.'),
    ];
  }

  async function buildAI() {
    const s = cur();
    const status = await window.slice.keys.status();
    const p = AI_PROVIDERS[s.aiProvider] ? s.aiProvider : 'puter';
    const def = AI_PROVIDERS[p];

    // paste-anything key box
    const quick = S.el('input', { type: 'password', placeholder: 'Paste any AI key — Slice figures out whose it is', spellcheck: 'false' });
    quick.addEventListener('change', async () => {
      const key = quick.value.trim();
      const prov = detectProvider(key);
      if (!prov) { S.toast('Couldn’t tell which AI that key belongs to — pick the provider below and paste it there.', { timeout: 5000 }); return; }
      const st = await window.slice.keys.set(prov, key);
      await set({ aiProvider: prov });
      S.toast(`${st?.type || 'Key'} saved — now using ${AI_PROVIDERS[prov].name}`, { icon: '✓' });
      render();
    });

    const grid = S.el('div', { class: 'prov-grid' });
    for (const [k, d] of Object.entries(AI_PROVIDERS)) {
      const ready = !d.needsKey || status[k]?.set;
      grid.append(S.el('button', { class: `prov${k === p ? ' on' : ''}${ready ? ' ready' : ''}`, onclick: () => set({ aiProvider: k }) },
        S.el('span', { class: 'prov-ico', text: d.name[0] }),
        S.el('b', { text: d.name }),
        S.el('span', { class: 'prov-tag', text: d.tag || (status[k]?.set ? 'Key saved' : d.needsKey ? 'Needs key' : 'Key optional') })));
    }

    // selected provider
    const rows = [];
    if (def.needsKey || p === 'custom') {
      const st = status[p];
      const keyIn = S.el('input', { type: 'password', placeholder: st?.set ? `${st.hint} — paste to replace` : def.keyHint || 'API key', spellcheck: 'false' });
      keyIn.addEventListener('change', async () => {
        const r = await window.slice.keys.set(p, keyIn.value);
        S.toast(r?.set ? `${r.type} saved` : 'Key removed', { icon: '✓' });
        render();
      });
      rows.push(row(`${def.name} key`, st?.set ? `${st.type} · ${st.hint} · encrypted on this device` : 'Stored encrypted on this device, never sent anywhere but the provider.',
        S.el('div', { class: 'row gap' }, keyIn,
          def.keyUrl ? button('Get a key ↗', () => { S.app.openTab(def.keyUrl); close(); }, 'ghost sm') : null,
          st?.set ? button('Remove', async () => { await window.slice.keys.set(p, ''); render(); }, 'ghost sm') : null)));
    }
    if (def.kind === 'openai' && ['ollama', 'lmstudio', 'custom'].includes(p)) {
      const base = S.el('input', { type: 'text', placeholder: def.base || 'https://example.com/v1', spellcheck: 'false' });
      base.value = s.aiBaseUrls?.[p] || def.base || '';
      base.addEventListener('change', () => set({ aiBaseUrls: { [p]: base.value.trim() } }));
      rows.push(row('Base URL', 'OpenAI-compatible endpoint (ends in /v1).', base));
    }
    const listId = `models-${p}`;
    const model = S.el('input', { type: 'text', list: listId, placeholder: def.default || 'model id', spellcheck: 'false' });
    model.value = s.aiModels?.[p] || def.default || '';
    model.addEventListener('change', () => set({ aiModels: { [p]: model.value.trim() } }));
    const dl = S.el('datalist', { id: listId }, ...def.models.map(([id, name]) => S.el('option', { value: id, text: name })));
    const loadBtn = button('Load models', async () => {
      loadBtn.textContent = 'Loading…';
      const r = await window.slice.ai.models(p);
      loadBtn.textContent = 'Load models';
      if (!r.ok) { S.toast(r.error, { timeout: 6000 }); return; }
      dl.replaceChildren(...r.models.map(([id, name]) => S.el('option', { value: id, text: name })));
      S.toast(`${r.models.length} models available — click the model box to pick one`);
      model.focus();
    }, 'ghost sm');
    rows.push(row('Model', p === 'puter' ? 'Free through Puter: Gemini, Claude, GPT, Grok, DeepSeek, Mistral, Qwen…' : `Default: ${def.default || '—'}`,
      S.el('div', { class: 'row gap' }, model, dl, p !== 'puter' ? loadBtn : null)));
    if (p !== 'puter') {
      const out = S.el('span', { class: 'test-out' });
      const testBtn = button('Test connection', async () => {
        out.className = 'test-out'; out.textContent = 'Testing…';
        const r = await window.slice.ai.test(p);
        out.className = `test-out ${r.ok ? 'ok' : 'bad'}`;
        out.textContent = r.ok ? `✓ Works — answered in ${r.ms} ms` : `✗ ${r.error}`;
      }, 'primary sm');
      rows.push(S.el('div', { class: 'test-row' }, testBtn, out));
    }
    if (p === 'gemini') rows.push(toggle('geminiGrounding', 'Google Search grounding', 'Let Gemini answer with live Google results (cites sources).'));

    const brave = S.el('input', { type: 'password', placeholder: status.brave?.set ? status.brave.hint : 'BSA…', spellcheck: 'false' });
    brave.addEventListener('change', async () => { await window.slice.keys.set('brave', brave.value); render(); });

    return [
      row('Quick add', 'Gemini (AQ. or AIza), OpenAI, Anthropic, xAI, Groq, OpenRouter…', quick, 'stack-sm'),
      S.el('h3', { text: 'Provider' }),
      grid,
      S.el('p', { class: 'set-note', text: def.blurb }),
      ...rows,
      S.el('h3', { text: 'Behaviour' }),
      seg('aiWebSearch', 'Web search', 'Auto searches when you ask about news, facts or “is … true?”. Eager searches any question.', [['auto', 'Auto'], ['eager', 'Eager'], ['off', 'Off']]),
      toggle('imagesPanel', 'Results panel', 'Show images and sources on the right for every prompt.'),
      row('Brave Search API key', 'Optional: faster, more reliable web results for the AI.', brave),
      S.el('h3', { text: 'Fine-tunes' }),
      S.el('p', { class: 'set-note', text: 'Mix and match Slice’s personality. Changes apply on the next launch, or press “Reload AI”.' }),
      tunes(s),
      text('customInstructions', 'Your instructions', 'Anything Slice should always know or do.', { area: true, placeholder: 'e.g. I’m in Lisbon. Keep answers under 5 lines. Metric units.' }),
      S.el('div', { class: 'row gap' }, button('Reload AI', async () => { await S.ai.init(cur()); S.toast(`AI reloaded — ${S.ai.modelLabel(cur())}`, { icon: '✦' }); }, 'primary')),
    ];
  }

  function tunes(s) {
    const box = S.el('div', { class: 'tune-grid' });
    for (const [k, t] of Object.entries(FINE_TUNES)) {
      const on = s.fineTunes.includes(k);
      box.append(S.el('button', {
        class: `tune${on ? ' on' : ''}`,
        onclick: () => set({ fineTunes: on ? s.fineTunes.filter((x) => x !== k) : [...s.fineTunes, k] }),
      }, S.el('span', { class: 'tune-icon', text: t.icon }), S.el('b', { text: t.name }), S.el('span', { text: t.blurb })));
    }
    return box;
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

  async function buildAccount() {
    const s = cur();
    const p = s.profile || {};
    const email = S.el('input', { type: 'email', placeholder: 'you@gmail.com', spellcheck: 'false' });
    email.value = p.email || '';
    const name = S.el('input', { type: 'text', placeholder: 'Your name' });
    name.value = p.name || '';
    email.addEventListener('change', () => {
      if (!S.isEmail(email.value)) { S.toast('That doesn’t look like an email address'); return; }
      const d = S.profileFromEmail(email.value);
      set({ profile: { ...d, name: name.value.trim() || d.name, givenName: (name.value.trim().split(/\s+/)[0]) || d.givenName } });
      if (!name.value.trim()) name.value = d.name;
    });
    name.addEventListener('change', () => set({ profile: { ...(cur().profile || {}), name: name.value.trim(), givenName: name.value.trim().split(/\s+/)[0] || '' } }));

    // Puter: the only sign-in Slice uses (it powers the free AI)
    const puterRow = S.el('div', { class: 'account-card' }, S.el('span', { class: 'puter-mark lg', text: 'P' }), S.el('div', {}, S.el('b', { text: 'Puter' }), S.el('span', { text: 'Checking…' })));
    S.ai.puterAuth.user().then((u) => {
      const info = S.$('div span', puterRow);
      if (u) {
        info.textContent = `Signed in${u.username ? ` as @${u.username}` : ''} — free AI is on`;
        puterRow.append(button('Sign out', async () => { await S.ai.puterAuth.signOut(); render(); }, 'ghost'));
      } else {
        info.textContent = 'Not signed in — the free AI needs this';
        puterRow.append(button('Sign in with Puter', async () => {
          try { await S.ai.puterAuth.signIn(); S.toast('Signed in to Puter', { icon: '✓' }); } catch (e) { S.toast(`Puter: ${e?.error || e?.message || e}`); }
          render();
        }, 'primary'));
      }
    });

    return [
      S.el('div', { class: 'account-card' }, S.avatar(s.profile, 48),
        S.el('div', {}, S.el('b', { text: p.name || 'No name yet' }), S.el('span', { text: p.email || 'Add your Gmail below' }))),
      row('Gmail', 'Slice works out your name from it. It stays on this PC.', email),
      row('Name', 'What Slice calls you.', name),
      S.el('h3', { text: 'Sign-in' }),
      puterRow,
      S.el('p', { class: 'set-note', text: 'Puter is the only account Slice asks for. Using your own API key instead? Set it in Settings → AI.' }),
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
