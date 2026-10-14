// Tabs: each one is either Slice's AI new-tab page or a <webview> (Blink), or both (NTP → site).
S.tabs = (() => {
  const list = [];
  const closed = [];
  let active = null;
  const views = () => document.getElementById('views');
  const listeners = new Set();
  const emit = () => { for (const fn of listeners) fn(); render(); save(); };
  const save = S.debounce(() => {
    window.slice.session.save(list.filter((t) => t.kind === 'web' && !t.private && t.url).map((t) => ({ url: t.url, title: t.title })));
  }, 600);

  class Tab {
    constructor({ url, private: priv = false }) {
      this.id = S.uid();
      this.private = priv;
      this.kind = 'ntp';
      this.title = 'New tab';
      this.url = '';
      this.favicon = '';
      this.loading = false;
      this.progress = 0;
      this.blocked = 0;
      this.themeColor = '';
      this.audible = false;
      this.muted = false;
      this.zoom = 0;
      this.view = S.el('div', { class: 'view', 'data-tab': this.id });
      views().append(this.view);
      this.ntp = null;
      this.webview = null;
      if (url) this.load(url); else this.showNtp();
    }

    showNtp() {
      this.kind = 'ntp';
      this.title = this.private ? 'Private tab' : 'New tab';
      this.url = '';
      this.favicon = '';
      this.themeColor = '';
      this.loading = false;
      if (this.webview) { this.webview.remove(); this.webview = null; this.wcId = null; }
      if (!this.ntp) { this.ntp = S.ntp.create(this); this.view.prepend(this.ntp.el); }
      this.ntp.el.hidden = false;
      this.view.classList.add('is-ntp');
      if (this === active) setTimeout(() => this.ntp.focus(), 30);
      emit();
    }

    load(url) {
      this.kind = 'web';
      this.url = url;
      this.view.classList.remove('is-ntp');
      this.view.querySelector('.load-error')?.remove();
      if (this.ntp) this.ntp.el.hidden = true;
      if (!this.webview) this.createWebview(url);
      else if (this.wvReady()) this.webview.loadURL(url).catch(() => {});
      else this.webview.src = url;
      this.title = S.host(url) || url;
      emit();
    }

    createWebview(url) {
      const wv = document.createElement('webview');
      wv.setAttribute('partition', this.private ? 'slice-private' : 'persist:slice');
      wv.setAttribute('allowpopups', '');
      wv.setAttribute('webpreferences', 'contextIsolation=yes,spellcheck=yes');
      wv.setAttribute('src', url);
      this.webview = wv;
      this.view.append(wv);
      const set = (patch) => { Object.assign(this, patch); emit(); };

      wv.addEventListener('dom-ready', () => {
        if (!this.wcId) {
          this.wcId = wv.getWebContentsId();
          if (this.zoom) wv.setZoomLevel(this.zoom);
        }
      });
      wv.addEventListener('did-start-loading', () => set({ loading: true }));
      wv.addEventListener('did-stop-loading', () => set({ loading: false }));
      wv.addEventListener('page-title-updated', (e) => set({ title: e.title }));
      wv.addEventListener('page-favicon-updated', (e) => set({ favicon: e.favicons?.[0] || '' }));
      wv.addEventListener('did-change-theme-color', (e) => set({ themeColor: e.themeColor || '' }));
      wv.addEventListener('did-navigate', (e) => {
        this.blocked = 0;
        if (this.wcId) window.slice.adblock.reset(this.wcId);
        set({ url: e.url, themeColor: '' });
        this.view.querySelector('.load-error')?.remove();
      });
      wv.addEventListener('did-navigate-in-page', (e) => { if (e.isMainFrame) set({ url: e.url }); });
      wv.addEventListener('media-started-playing', () => set({ audible: true }));
      wv.addEventListener('media-paused', () => set({ audible: false }));
      wv.addEventListener('update-target-url', (e) => S.app.hoverUrl(e.url));
      wv.addEventListener('enter-html-full-screen', () => document.body.classList.add('html-fullscreen'));
      wv.addEventListener('leave-html-full-screen', () => document.body.classList.remove('html-fullscreen'));
      wv.addEventListener('found-in-page', (e) => S.app.foundInPage(this, e.result));
      wv.addEventListener('did-fail-load', (e) => {
        if (!e.isMainFrame || e.errorCode === -3) return; // -3 = aborted (normal on redirects)
        this.view.querySelector('.load-error')?.remove();
        const err = S.el('div', { class: 'load-error' },
          S.el('div', { class: 'mini-logo xl dim' }),
          S.el('h2', { text: e.errorCode === -105 ? 'Can’t find that site' : e.errorCode === -106 ? 'You’re offline' : 'This page didn’t load' }),
          S.el('p', { text: `${S.host(e.validatedURL) || e.validatedURL} · ${e.errorDescription}` }),
          S.el('div', { class: 'row' },
            S.el('button', { class: 'btn primary', text: 'Try again', onclick: () => { err.remove(); wv.reload(); } }),
            S.el('button', { class: 'btn', text: 'Ask Slice instead', onclick: () => { this.showNtp(); setTimeout(() => this.ntp.ask(`what is ${S.host(e.validatedURL) || e.validatedURL}?`), 50); } })));
        this.view.append(err);
        set({ loading: false, title: S.host(e.validatedURL) || 'Error' });
      });
      wv.addEventListener('ipc-message', () => {});
    }

    get canGoBack() { return this.kind === 'web' && !!this.ntp || (this.webview?.canGoBack?.() ?? false); }

    back() {
      if (this.kind !== 'web') return;
      if (this.wvReady() && this.webview.canGoBack()) this.webview.goBack();
      else if (this.ntp) this.showNtp();
    }
    forward() { if (this.wvReady() && this.webview.canGoForward()) this.webview.goForward(); }
    reload(hard) { if (this.wvReady()) (hard ? this.webview.reloadIgnoringCache() : this.webview.reload()); }
    stop() { if (this.wvReady()) this.webview.stop(); }
    wvReady() { try { return !!(this.webview && this.webview.getWebContentsId()); } catch { return false; } }

    destroy() { this.view.remove(); this.ntp?.destroy?.(); }
  }

  function create({ url = '', background = false, private: priv = false, index } = {}) {
    const tab = new Tab({ url, private: priv });
    const at = index ?? (active ? list.indexOf(active) + 1 : list.length);
    list.splice(at, 0, tab);
    if (!background || !active) activate(tab);
    else emit();
    return tab;
  }

  function activate(tab) {
    if (!tab) return;
    active = tab;
    for (const t of list) t.view.classList.toggle('active', t === tab);
    emit();
    if (tab.kind === 'ntp') setTimeout(() => tab.ntp?.focus(), 30);
    else tab.webview?.focus();
  }

  function close(tab = active) {
    if (!tab) return;
    const i = list.indexOf(tab);
    if (i < 0) return;
    if (tab.kind === 'web' && tab.url && !tab.private) closed.push({ url: tab.url, index: i });
    list.splice(i, 1);
    tab.view.classList.add('closing');
    setTimeout(() => tab.destroy(), 10);
    if (!list.length) { create(); return; }
    if (tab === active) activate(list[Math.min(i, list.length - 1)]);
    else emit();
  }

  function reopen() {
    const c = closed.pop();
    if (c) create({ url: c.url, index: Math.min(c.index, list.length) });
  }

  function move(tab, to) {
    const from = list.indexOf(tab);
    if (from < 0 || from === to) return;
    list.splice(from, 1);
    list.splice(Math.max(0, Math.min(list.length, to)), 0, tab);
    emit();
  }

  // ------------------------------------------------------------ rendering (both strips)
  const ICONS = {
    close: '<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17"/></svg>',
    audio: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>',
    muted: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9zM17 9l5 6M22 9l-5 6"/></svg>',
  };

  function tabEl(t, vertical) {
    const icon = t.loading
      ? S.el('span', { class: 'tab-icon spin' })
      : t.kind === 'ntp'
        ? S.el('span', { class: 'tab-icon mini-logo' })
        : t.favicon
          ? S.el('img', { class: 'tab-icon', src: t.favicon, alt: '', onerror: (e) => { e.target.replaceWith(S.el('span', { class: 'tab-icon letter', text: (S.host(t.url)[0] || '•').toUpperCase() })); } })
          : S.el('span', { class: 'tab-icon letter', text: (S.host(t.url)[0] || '•').toUpperCase() });
    const el = S.el('div', {
      class: `tab${t === active ? ' active' : ''}${t.private ? ' private' : ''}`, role: 'tab', draggable: 'true', title: `${t.title}${t.url ? `\n${t.url}` : ''}`,
      'data-id': t.id,
    },
    icon,
    S.el('span', { class: 'tab-title', text: t.title || S.host(t.url) || 'New tab' }),
    t.audible || t.muted ? S.el('button', { class: 'tab-audio', html: t.muted ? ICONS.muted : ICONS.audio, title: t.muted ? 'Unmute' : 'Mute', onclick: (e) => { e.stopPropagation(); t.muted = !t.muted; t.webview?.setAudioMuted(t.muted); emit(); } }) : null,
    t.private ? S.el('span', { class: 'tab-private', title: 'Private tab', text: '◐' }) : null,
    S.el('button', { class: 'tab-close', html: ICONS.close, title: 'Close (Ctrl+W)', onclick: (e) => { e.stopPropagation(); close(t); } }));
    el.addEventListener('mousedown', (e) => { if (e.button === 0) activate(t); });
    el.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); close(t); } });
    el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/slice-tab', t.id); el.classList.add('dragging'); });
    el.addEventListener('dragend', () => el.classList.remove('dragging'));
    el.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/slice-tab')) { e.preventDefault(); el.classList.add('drop'); } });
    el.addEventListener('dragleave', () => el.classList.remove('drop'));
    el.addEventListener('drop', (e) => {
      e.preventDefault(); el.classList.remove('drop');
      const src = list.find((x) => x.id === e.dataTransfer.getData('text/slice-tab'));
      if (src) move(src, list.indexOf(t));
    });
    if (vertical) el.classList.add('v');
    return el;
  }

  function render() {
    const h = document.getElementById('tabs-h');
    const v = document.getElementById('tabs-v');
    if (!h || !v) return;
    const vertical = document.documentElement.dataset.layout === 'sidebar';
    (vertical ? v : h).replaceChildren(...list.map((t) => tabEl(t, vertical)));
    (vertical ? h : v).replaceChildren();
    const a = (vertical ? v : h).querySelector('.tab.active');
    a?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  return {
    get list() { return list; },
    get active() { return active; },
    create, activate, close, reopen, move, render,
    onChange: (fn) => listeners.add(fn),
    byWc: (wcId) => list.find((t) => t.wcId === wcId),
    next(d = 1) { if (list.length) activate(list[(list.indexOf(active) + d + list.length) % list.length]); },
    nth(n) { activate(n === 9 ? list[list.length - 1] : list[n - 1]); },
  };
})();
