// One conversation thread (used by the new-tab page and the page assistant).
S.Chat = class Chat {
  constructor(opts) {
    this.o = opts;               // { thread, kind: 'ntp'|'page', getPage, onTurn, onImages, onSources, onFirstMessage }
    this.history = [];
    this.busy = null;
    this.thread = opts.thread;
    this.thread.addEventListener('click', (e) => this.onClick(e));
  }

  onClick(e) {
    const a = e.target.closest('a[data-ext]');
    if (a) { e.preventDefault(); S.app.openTab(a.href, { background: e.ctrlKey || e.metaKey || e.button === 1 }); return; }
    const copy = e.target.closest('pre .copy');
    if (copy) {
      navigator.clipboard.writeText(copy.nextElementSibling.textContent);
      copy.textContent = 'Copied'; setTimeout(() => { copy.textContent = 'Copy'; }, 1200);
    }
  }

  reset() {
    this.stop();
    this.history = [];
    S.$$('.msg', this.thread).forEach((m) => m.remove());
  }

  stop() { this.busy?.abort(); this.busy = null; }

  scroll(force) {
    const t = this.thread;
    if (force || t.scrollHeight - t.scrollTop - t.clientHeight < 140) t.scrollTop = t.scrollHeight;
  }

  addUser(text) {
    const m = S.el('div', { class: 'msg user' }, S.el('div', { class: 'bubble', text }));
    this.thread.append(m);
    this.scroll(true);
  }

  addAI() {
    const status = S.el('div', { class: 'msg-status' });
    const body = S.el('div', { class: 'msg-body md' }, S.el('span', { class: 'typing' }, S.el('i'), S.el('i'), S.el('i')));
    const done = S.el('div', { class: 'msg-done' });
    const m = S.el('div', { class: 'msg ai' }, S.el('div', { class: 'avatar mini-logo' }), S.el('div', { class: 'msg-col' }, status, body, done));
    this.thread.append(m);
    this.scroll(true);
    const ui = {
      el: m, body, done,
      status(html, cls = '') {
        const chip = S.el('div', { class: `status-chip ${cls}`, html });
        status.append(chip);
        return chip;
      },
      clearStatus() { status.replaceChildren(); },
      render: (() => {
        let pending = null; let raf = 0;
        return (text, sources) => {
          pending = [text, sources];
          if (raf) return;
          raf = requestAnimationFrame(() => {
            raf = 0;
            const [t, src] = pending;
            body.innerHTML = t ? S.md.render(t, src) : '';
            body.classList.toggle('streaming', true);
            this.scroll();
          });
        };
      })(),
      finish(text, sources) {
        body.innerHTML = S.md.render(text, sources) || '<p class="dim">…</p>';
        body.classList.remove('streaming');
      },
    };
    return ui;
  }

  compose(text, ctx) {
    const parts = [];
    const state = S.app.stateLine?.();
    if (state) parts.push(`<state>${state}</state>`);
    if (ctx.page) {
      parts.push(`<page title="${ctx.page.title || ''}" url="${ctx.page.url || ''}">\n${(ctx.page.text || '').slice(0, 14000)}\n</page>`);
    }
    if (ctx.web?.results?.length) {
      const pages = new Map((ctx.web.pages || []).map((p) => [p.url, p]));
      const rows = ctx.web.results.map((r, i) => {
        const ex = pages.get(r.url)?.text;
        return `[${i + 1}] ${r.title} (${r.host})\n${r.snippet || ''}${ex ? `\nExcerpt: ${ex.slice(0, 1800)}` : ''}`;
      });
      parts.push(`<web_results query="${ctx.web.query}">\n${rows.join('\n\n')}\n</web_results>`);
    }
    if (ctx.read) parts.push(`<fetched url="${ctx.read.url}" title="${ctx.read.title || ''}">\n${(ctx.read.text || '').slice(0, 9000)}\n</fetched>`);
    parts.push(text);
    return parts.join('\n\n');
  }

  sourcesChip(ui, web) {
    const icons = web.results.slice(0, 4).map((r) => `<img src="${S.esc(S.favicon(r.url))}" alt="">`).join('');
    ui.status(`<span class="favs">${icons}</span> Read ${web.pages?.length || 0} of ${web.results.length} results`, 'ok');
  }

  async send(text) {
    text = text.trim();
    if (!text) return;
    this.stop();
    const ctrl = new AbortController();
    this.busy = ctrl;
    const settings = S.app.settings;
    const kind = this.o.kind;
    this.o.onFirstMessage?.();
    this.addUser(text);
    if (kind === 'ntp') window.slice.memory.record(text).catch(() => {});

    // 1) "yo", "reddit", URLs: just go.
    if (kind === 'ntp') {
      const r = S.ai.route(text);
      if (r) {
        const ui = this.addAI();
        ui.finish(`Opening **${S.esc(r.label)}**…`);
        setTimeout(() => S.app.navigate(r.url), 260);
        this.busy = null;
        return;
      }
    }

    // 2) the right-hand panel: images for every prompt, fetched in parallel
    if (kind === 'ntp' && settings.imagesPanel) {
      const q = S.ai.imageQuery(text);
      this.o.onTurn?.(q);
      window.slice.search.images(q, { count: 24 }).then((imgs) => { if (!ctrl.signal.aborted) this.o.onImages?.(imgs, q); }).catch(() => this.o.onImages?.([], q));
    }

    const ui = this.addAI();
    const ctx = {};
    let sources = null;
    const grounding = settings.aiProvider === 'gemini' && settings.geminiGrounding;

    try {
      if (kind === 'page') {
        const chip = ui.status('<span class="spin"></span> Reading this page');
        ctx.page = await this.o.getPage();
        chip.remove();
      } else if (S.ai.needsWeb(text, settings.aiWebSearch) && !grounding) {
        const chip = ui.status('<span class="spin"></span> Searching the web');
        ctx.web = await window.slice.search.web(text, { count: 6, read: 3 });
        chip.remove();
        if (ctx.web.results.length) {
          sources = ctx.web.results;
          this.sourcesChip(ui, ctx.web);
          this.o.onSources?.(sources);
        }
      }

      let acc = '';
      for (let round = 0; round < 3; round++) {
        if (ctrl.signal.aborted) return;
        const messages = [...this.history.slice(-12), { role: 'user', content: this.compose(text, ctx) }];
        acc = '';
        const useGrounding = grounding && kind === 'ntp' && (S.ai.needsWeb(text, settings.aiWebSearch) || round > 0);
        if (useGrounding && round === 0) ui.status('<span class="g">G</span> Grounded with Google Search', 'ok');
        for await (const part of S.ai.stream({ settings, messages, grounding: useGrounding, signal: ctrl.signal })) {
          if (ctrl.signal.aborted) return;
          if (part.text) { acc += part.text; ui.render(S.ai.visibleText(acc), sources); }
          if (part.meta?.sources) { sources = part.meta.sources; this.o.onSources?.(sources); }
        }
        const actions = S.ai.parseActions(acc);
        const fetchAct = actions.find((a) => a.do === 'search' || a.do === 'read');
        if (fetchAct && round < 2) {
          ui.render('', sources);
          if (fetchAct.do === 'search') {
            const q = String(fetchAct.query || text).slice(0, 200);
            const chip = ui.status(`<span class="spin"></span> Searching “${S.esc(q)}”`);
            if (grounding) { ctx.web = null; chip.remove(); continue; }
            ctx.web = await window.slice.search.web(q, { count: 6, read: 3 });
            chip.remove();
            if (ctx.web.results.length) { sources = ctx.web.results; this.sourcesChip(ui, ctx.web); this.o.onSources?.(sources); }
          } else {
            const chip = ui.status(`<span class="spin"></span> Reading ${S.esc(S.host(fetchAct.url))}`);
            ctx.read = await window.slice.search.fetch(fetchAct.url).catch(() => ({ url: fetchAct.url, text: '(could not load page)' }));
            chip.remove();
            ui.status(`<img class="fav1" src="${S.esc(S.favicon(fetchAct.url))}" alt=""> Read ${S.esc(S.host(fetchAct.url))}`, 'ok');
          }
          continue;
        }
        const visible = S.ai.visibleText(acc);
        ui.finish(visible, sources);
        for (const a of actions) {
          const label = await S.app.runAction(a);
          if (label) ui.done.append(S.el('span', { class: 'done-chip', html: `<svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg>${S.esc(label)}` }));
        }
        this.history.push({ role: 'user', content: kind === 'page' ? this.compose(text, { page: ctx.page && { ...ctx.page, text: ctx.page.text.slice(0, 3000) } }) : text });
        this.history.push({ role: 'assistant', content: visible || '(done)' });
        break;
      }
    } catch (e) {
      if (ctrl.signal.aborted) return;
      const msg = String(e.message || e);
      const hint = settings.aiProvider === 'puter'
        ? 'Slice’s free AI runs on Puter.js — a sign-in window may need you to log in once. You can also add your own Gemini key in Settings → AI.'
        : 'Check your API key in Settings → AI.';
      ui.finish(`**Couldn’t reach the AI.** ${msg}\n\n${hint}`);
      ui.el.classList.add('error');
      ui.done.append(S.el('button', { class: 'done-chip btn-retry', text: 'Try again', onclick: () => { ui.el.remove(); this.thread.lastElementChild?.classList.contains('user') && this.thread.lastElementChild.remove(); this.send(text); } }));
    } finally {
      if (this.busy === ctrl) this.busy = null;
      this.scroll();
    }
  }
};
