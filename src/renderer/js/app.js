// Boot + glue: toolbar, omnibox, shortcuts, AI actions, downloads.
S.app = (() => {
  const { SEARCH_ENGINES, THEMES } = SliceConfig;
  const $ = (id) => document.getElementById(id);
  const app = { settings: null };
  S.app = app; // available to modules during boot

  // ------------------------------------------------------------ navigation
  app.navigate = (url) => {
    const t = S.tabs.active;
    if (!t) return S.tabs.create({ url });
    t.load(url);
    t.webview?.focus();
  };
  app.openTab = (url, { background = false, private: priv = false } = {}) => S.tabs.create({ url, background, private: priv });

  function go(text, { newTab = false } = {}) {
    const t = text.trim();
    if (!t) return;
    let url;
    if (S.looksLikeUrl(t)) url = S.normalizeUrl(t);
    else {
      url = S.searchUrl(t, app.settings);
      if (!S.tabs.active?.private) window.slice.memory.record(t).catch(() => {});
    }
    if (newTab) app.openTab(url); else app.navigate(url);
  }

  // ------------------------------------------------------------ omnibox
  const omni = $('omni-input');
  const suggest = $('omni-suggest');
  let sel = -1;
  let items = [];

  function syncOmni() {
    const t = S.tabs.active;
    if (document.activeElement !== omni) omni.value = t?.kind === 'web' ? prettyUrl(t.url) : '';
    $('omni-icon').classList.toggle('secure', !!t?.url?.startsWith('https://'));
    $('btn-back').disabled = !(t?.kind === 'web');
    $('btn-fwd').disabled = !(t?.kind === 'web' && t.wvReady() && t.webview.canGoForward());
    document.body.classList.toggle('loading', !!t?.loading);
    document.body.classList.toggle('on-ntp', t?.kind === 'ntp');
    $('shield-count').textContent = t?.blocked ? (t.blocked > 99 ? '99+' : String(t.blocked)) : '';
    const tint = app.settings.siteTint && t?.kind === 'web' && t.themeColor ? t.themeColor : '';
    document.documentElement.style.setProperty('--site', tint || 'transparent');
    document.documentElement.dataset.sitetint = tint ? '1' : '0';
    document.title = t ? `${t.title} — Slice` : 'Slice';
    $('tool-title').textContent = t?.kind === 'web' ? t.title : '';
    if (S.assistant.isOpen()) S.assistant.syncTitle();
  }

  const prettyUrl = (u) => {
    if (!u) return '';
    try {
      const x = new URL(u);
      if (x.protocol === 'https:' || x.protocol === 'http:') return decodeURI(`${x.hostname.replace(/^www\./, '')}${x.pathname === '/' ? '' : x.pathname}${x.search}${x.hash}`);
    } catch { /* noop */ }
    return u;
  };

  function buildSuggestions() {
    const q = omni.value.trim();
    if (!q) { suggest.hidden = true; items = []; return; }
    const engine = app.settings.searchEngine === 'custom' ? 'Search' : SEARCH_ENGINES[app.settings.searchEngine]?.name || 'Google';
    items = [];
    if (S.looksLikeUrl(q)) items.push({ icon: '↗', label: S.normalizeUrl(q), hint: 'Open', run: () => go(q) });
    items.push({ icon: '⌕', label: q, hint: `${engine}`, run: () => go(q) });
    const lower = q.toLowerCase();
    for (const t of S.tabs.list) {
      if (t === S.tabs.active || t.kind !== 'web') continue;
      if ((t.title + t.url).toLowerCase().includes(lower)) items.push({ icon: '⇥', label: t.title, hint: 'Switch to tab', run: () => S.tabs.activate(t), fav: t.favicon });
      if (items.length > 5) break;
    }
    const site = S.ai.route(q);
    if (site && !S.looksLikeUrl(q)) items.push({ icon: '↗', label: site.label, hint: site.url.replace(/^https:\/\//, ''), run: () => app.navigate(site.url) });
    items.push({ icon: '✦', label: `Ask Slice: ${q}`, hint: 'AI', ai: true, run: () => { const t = S.tabs.create(); setTimeout(() => t.ntp.ask(q), 60); } });
    sel = 0;
    paintSuggest();
  }

  function paintSuggest() {
    suggest.replaceChildren(...items.map((it, i) => S.el('div', {
      class: `sg${i === sel ? ' on' : ''}${it.ai ? ' ai' : ''}`,
      onmousedown: (e) => { e.preventDefault(); omni.blur(); it.run(); },
    }, it.fav ? S.el('img', { src: it.fav, alt: '' }) : S.el('span', { class: 'sg-icon', text: it.icon }), S.el('span', { class: 'sg-label', text: it.label }), S.el('span', { class: 'sg-hint', text: it.hint }))));
    suggest.hidden = !items.length;
  }

  omni.addEventListener('focus', () => { omni.select(); document.body.classList.add('omni-focus'); });
  omni.addEventListener('blur', () => { setTimeout(() => { suggest.hidden = true; }, 120); document.body.classList.remove('omni-focus'); syncOmni(); });
  omni.addEventListener('input', buildSuggestions);
  omni.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!items.length) return;
      e.preventDefault();
      sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      paintSuggest();
    } else if (e.key === 'Escape') {
      suggest.hidden = true; omni.blur(); S.tabs.active?.webview?.focus();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const it = items[sel];
      omni.blur();
      if (e.altKey) go(omni.value, { newTab: true });
      else if (it) it.run(); else go(omni.value);
    }
  });
  $('omnibox').addEventListener('submit', (e) => e.preventDefault());

  // ------------------------------------------------------------ toolbar
  $('btn-back').addEventListener('click', () => S.tabs.active?.back());
  $('btn-fwd').addEventListener('click', () => S.tabs.active?.forward());
  $('btn-reload').addEventListener('click', (e) => { const t = S.tabs.active; if (t?.loading) t.stop(); else t?.reload(e.shiftKey); });
  $('btn-home').addEventListener('click', () => S.tabs.active?.showNtp());
  $('btn-newtab-h').addEventListener('click', () => S.tabs.create());
  $('btn-newtab-v').addEventListener('click', () => S.tabs.create());
  $('btn-layout').addEventListener('click', () => setS({ layout: app.settings.layout === 'top' ? 'sidebar' : 'top' }));
  $('btn-menu').addEventListener('click', () => S.settingsUI.open());
  $('btn-assistant').addEventListener('click', () => S.assistant.toggle());
  $('btn-shield').addEventListener('click', () => {
    const t = S.tabs.active;
    S.toast(app.settings.adblock ? `uBlock Origin is on — ${t?.blocked || 0} ads & trackers blocked on this page` : 'uBlock Origin is off', {
      icon: '⛨', actions: [{ label: app.settings.adblock ? 'Turn off' : 'Turn on', onClick: () => { setS({ adblock: !app.settings.adblock }); t?.reload(); } }], timeout: 5000,
    });
  });
  S.$$('[data-proxy]').forEach((b) => b.addEventListener('click', () => $(b.dataset.proxy).click()));

  const setS = (patch) => window.slice.settings.set(patch);

  // sidebar resize
  (() => {
    const handle = $('side-resize');
    let start = 0; let w0 = 0;
    const move = (e) => document.documentElement.style.setProperty('--sidebar-w', `${Math.max(180, Math.min(440, w0 + e.clientX - start))}px`);
    const up = (e) => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); document.body.classList.remove('resizing'); setS({ sidebarWidth: Math.round(Math.max(180, Math.min(440, w0 + e.clientX - start))) }); };
    handle.addEventListener('mousedown', (e) => { start = e.clientX; w0 = app.settings.sidebarWidth; document.body.classList.add('resizing'); window.addEventListener('mousemove', move); window.addEventListener('mouseup', up); });
  })();

  // ------------------------------------------------------------ hover url + find
  const hoverEl = S.el('div', { id: 'hover-url' });
  $('content').append(hoverEl);
  app.hoverUrl = (u) => { hoverEl.textContent = u ? decodeURI(u) : ''; hoverEl.classList.toggle('on', !!u); };

  const find = { bar: $('findbar'), input: $('find-input'), count: $('find-count') };
  function openFind() {
    const t = S.tabs.active;
    if (t?.kind !== 'web') return;
    find.bar.hidden = false;
    find.input.focus();
    find.input.select();
  }
  function closeFind() {
    find.bar.hidden = true;
    try { S.tabs.active?.webview?.stopFindInPage('clearSelection'); } catch { /* not ready */ }
  }
  const doFind = (forward = true, findNext = false) => {
    const t = S.tabs.active;
    if (!t?.wvReady() || !find.input.value) { find.count.textContent = ''; return; }
    t.webview.findInPage(find.input.value, { forward, findNext });
  };
  find.input.addEventListener('input', () => doFind(true, false));
  find.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doFind(!e.shiftKey, true); if (e.key === 'Escape') closeFind(); });
  $('find-next').addEventListener('click', () => doFind(true, true));
  $('find-prev').addEventListener('click', () => doFind(false, true));
  $('find-close').addEventListener('click', closeFind);
  app.foundInPage = (tab, r) => { if (tab === S.tabs.active && r.finalUpdate) find.count.textContent = r.matches ? `${r.activeMatchOrdinal}/${r.matches}` : 'No matches'; };

  // ------------------------------------------------------------ shortcuts
  function zoom(delta) {
    const t = S.tabs.active;
    if (!t?.wvReady()) return;
    t.zoom = delta === 0 ? 0 : Math.max(-5, Math.min(6, t.zoom + delta));
    t.webview.setZoomLevel(t.zoom);
    S.toast(`Zoom ${Math.round(1.2 ** t.zoom * 100)}%`, { id: 'zoom', timeout: 1200 });
  }

  function shortcut({ key, ctrl, shift, alt, rawKey }) {
    const k = key.toLowerCase();
    if (ctrl && !alt) {
      if (k === 't' && shift) return S.tabs.reopen(), true;
      if (k === 't') return S.tabs.create(), true;
      if (k === 'n' && shift) return S.tabs.create({ private: true }), true;
      if (k === 'w') return S.tabs.close(), true;
      if (k === 'l' || (k === 'k' && !shift) || k === 'e') { focusOmni(); return true; }
      if (k === 'r') return S.tabs.active?.reload(shift), true;
      if (k === 'f') return openFind(), true;
      if (k === 'j') return S.assistant.toggle(), true;
      if (k === 'tab') return S.tabs.next(shift ? -1 : 1), true;
      if (/^[1-9]$/.test(k)) return S.tabs.nth(+k), true;
      if (k === '=' || k === '+') return zoom(1), true;
      if (k === '-') return zoom(-1), true;
      if (k === '0') return zoom(0), true;
      if (k === ',') return S.settingsUI.open(), true;
      if (k === 's' && shift) return setS({ layout: app.settings.layout === 'top' ? 'sidebar' : 'top' }), true;
      if (k === 'c' && shift) return setS({ compact: !app.settings.compact }), true;
      if (k === 'b' && shift) return setS({ layout: app.settings.layout === 'top' ? 'sidebar' : 'top' }), true;
      if (k === 'd') return S.toast('Bookmarks? Just tell Slice: “open my github” — it remembers.', { icon: '✦' }), true;
    }
    if (alt && !ctrl) {
      if (rawKey === 'ArrowLeft' || k === 'arrowleft') return S.tabs.active?.back(), true;
      if (rawKey === 'ArrowRight' || k === 'arrowright') return S.tabs.active?.forward(), true;
      if (rawKey === 'Home' || k === 'home') return S.tabs.active?.showNtp(), true;
    }
    if (k === 'f5') return S.tabs.active?.reload(ctrl), true;
    if (k === 'f6') { focusOmni(); return true; }
    if (k === 'f11') return window.slice.win.fullscreen(), true;
    if (k === 'f12') { const t = S.tabs.active; if (t?.wvReady()) t.webview.isDevToolsOpened() ? t.webview.closeDevTools() : t.webview.openDevTools(); return true; }
    if (k === 'escape') {
      if (S.settingsUI.isOpen) return S.settingsUI.close(), true;
      if (!find.bar.hidden) return closeFind(), true;
      if (S.assistant.isOpen() && document.activeElement?.closest('#assistant')) return S.assistant.toggle(false), true;
    }
    return false;
  }

  function focusOmni() {
    if (app.settings.compact) document.body.classList.add('reveal');
    omni.focus();
    omni.select();
    setTimeout(() => document.body.classList.remove('reveal'), 2500);
  }

  document.addEventListener('keydown', (e) => {
    const ctrl = window.slice.platform === 'darwin' ? e.metaKey : e.ctrlKey;
    if (shortcut({ key: e.key, rawKey: e.key, ctrl, shift: e.shiftKey, alt: e.altKey })) e.preventDefault();
  });
  window.slice.events.onShortcut((s) => shortcut(s));

  // ------------------------------------------------------------ AI actions
  const LABELS = {
    searchEngine: ['Search', (v) => SEARCH_ENGINES[v]?.name || v], theme: ['Theme', (v) => THEMES[v]?.name || v],
    accent: ['Accent', (v) => v || 'theme'], accent2: ['Glow', (v) => v || 'theme'], tint: ['Colour intensity', (v) => `${v}%`],
    mode: ['Mode', (v) => v], layout: ['Layout', (v) => (v === 'sidebar' ? 'sidebar' : 'top tabs')], compact: ['Compact mode', (v) => (v ? 'on' : 'off')],
    transparency: ['Glass', (v) => (v === 'off' ? 'off' : v)], glass: ['Frame opacity', (v) => `${v}%`], radius: ['Corners', (v) => `${v}px`],
    density: ['Density', (v) => v], font: ['Font', (v) => v], uiScale: ['Size', (v) => `${v}%`], animations: ['Animations', (v) => (v ? 'on' : 'off')],
    siteTint: ['Site tint', (v) => (v ? 'on' : 'off')], adblock: ['uBlock Origin', (v) => (v ? 'on' : 'off')], aiWebSearch: ['Web search', (v) => v],
    imagesPanel: ['Results panel', (v) => (v ? 'on' : 'off')], memoryEnabled: ['Memory', (v) => (v ? 'on' : 'off')], showHomeButton: ['Home button', (v) => (v ? 'on' : 'off')],
    geminiGrounding: ['Google grounding', (v) => (v ? 'on' : 'off')],
  };

  app.runAction = async (a) => {
    try {
      switch (a.do) {
        case 'open': {
          let url = String(a.url || '');
          if (!url) return '';
          if (!/^[a-z]+:/i.test(url)) url = S.normalizeUrl(url);
          if (!/^https?:|^file:/i.test(url)) return '';
          const t = S.tabs.active;
          if (!a.newTab && t?.kind === 'ntp') setTimeout(() => app.navigate(url), 450);
          else app.openTab(url, { background: false });
          return `Opened ${S.host(url)}`;
        }
        case 'set': {
          const asked = { ...(a.settings || {}) };
          const patch = { ...asked };
          // a named theme should win over leftover custom colours
          if (patch.theme && !('accent' in patch)) Object.assign(patch, { accent: '', accent2: '', tint: null, mode: patch.mode || 'theme' });
          const { applied } = await window.slice.settings.set(patch, true);
          const parts = Object.entries(applied).filter(([k, v]) => k in asked && LABELS[k] && !(v === '' || v === null)).map(([k, v]) => `${LABELS[k][0]} → ${LABELS[k][1](v)}`);
          return parts.join(' · ') || '';
        }
        case 'remember': return (await window.slice.memory.remember(a.fact)) ? 'Remembered' : '';
        case 'forget': { const n = await window.slice.memory.forget(a.match); return `Forgot ${n} memor${n === 1 ? 'y' : 'ies'}`; }
        case 'newTab': S.tabs.create(); return 'New tab';
        case 'closeTab': setTimeout(() => S.tabs.close(), 600); return 'Closed tab';
        default: return '';
      }
    } catch (e) {
      console.warn('action failed', a, e);
      return '';
    }
  };

  app.stateLine = () => {
    const s = app.settings;
    const t = S.tabs.active;
    return [
      `current tab: ${t?.kind === 'web' ? `${t.title} <${t.url}>` : 'Slice new tab'}`,
      `open tabs: ${S.tabs.list.length}`,
      `search engine: ${s.searchEngine}`,
      `theme: ${s.theme}${s.accent ? ` (custom accent ${s.accent})` : ''}, mode ${S.theme.resolve(s).mode}`,
      `layout: ${s.layout}${s.compact ? ' compact' : ''}`,
      `transparency: ${s.transparency}`,
      `uBlock: ${s.adblock ? 'on' : 'off'}`,
      `local time: ${new Date().toLocaleString()}`,
    ].join(' | ');
  };

  // ------------------------------------------------------------ layout plumbing
  function placeOmnibox() {
    const form = $('omnibox');
    const slot = app.settings.layout === 'sidebar' ? $('side-omni-slot') : $('toolbar').querySelector('.nav-btns');
    if (app.settings.layout === 'sidebar') { if (form.parentElement !== slot) slot.append(form); }
    else if (form.previousElementSibling !== slot) slot.after(form);
  }

  function applySettings(s) {
    const prev = app.settings;
    app.settings = s;
    S.theme.apply(s);
    placeOmnibox();
    $('omni-engine').textContent = s.searchEngine === 'custom' ? 'Custom' : SEARCH_ENGINES[s.searchEngine]?.name || '';
    omni.placeholder = `Search ${s.searchEngine === 'custom' ? 'the web' : SEARCH_ENGINES[s.searchEngine]?.name || 'Google'} or type a URL`;
    S.tabs.render();
    syncOmni();
    if (prev && S.settingsUI.isOpen) S.settingsUI.refresh();
  }

  // ------------------------------------------------------------ events from main
  window.slice.settings.onChange(applySettings);
  window.slice.events.onOpenTab(({ url, background, private: priv }) => app.openTab(url, { background, private: priv }));
  window.slice.events.onSearch(({ text }) => app.openTab(S.searchUrl(text, app.settings)));
  window.slice.events.onAssistantAsk(({ text }) => S.assistant.ask(`Explain this: “${text}”`));
  window.slice.events.onAssistantOpen(() => S.assistant.toggle(true));
  window.slice.adblock.onBlocked(({ wcId, count }) => {
    const t = S.tabs.byWc(wcId);
    if (!t) return;
    t.blocked = count;
    if (t === S.tabs.active) $('shield-count').textContent = count > 99 ? '99+' : String(count);
  });
  window.slice.win.onFullscreen((on) => document.body.classList.toggle('fullscreen', on));
  window.slice.win.onFocus((on) => document.body.classList.toggle('blurred', !on));
  window.slice.downloads.onUpdate((d) => {
    const pct = d.total ? Math.round((d.received / d.total) * 100) : null;
    if (d.state === 'progressing') S.toast(`${d.name} — ${pct != null ? `${pct}%` : S.bytes(d.received)}`, { id: d.id, icon: '↓', timeout: 0 });
    else if (d.state === 'completed') S.toast(`Downloaded ${d.name}`, { id: d.id, icon: '✓', timeout: 7000, actions: [{ label: 'Open', onClick: () => window.slice.downloads.open(d.file) }, { label: 'Show', onClick: () => window.slice.downloads.show(d.file) }] });
    else if (d.state === 'cancelled' || d.state === 'interrupted') S.toast(`Download ${d.state}: ${d.name}`, { id: d.id, icon: '!', timeout: 5000 });
  });

  S.tabs.onChange(syncOmni);

  // ------------------------------------------------------------ boot
  async function boot() {
    applySettings(await window.slice.settings.get());
    S.assistant.init();
    const aiReady = S.ai.init(app.settings);

    const pending = await window.slice.app.pendingUrls();
    const sess = app.settings.restoreTabs ? await window.slice.session.get() : { tabs: [] };
    for (const t of sess.tabs || []) S.tabs.create({ url: t.url, background: true });
    S.tabs.create();
    for (const u of pending) app.openTab(u);

    requestAnimationFrame(() => document.body.classList.remove('booting'));
    if (!app.settings.onboarded) S.onboarding.open();
    await aiReady;
  }

  boot();
  return app;
})();
