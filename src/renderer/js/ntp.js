// The new tab: a mini logo, one input, and a results panel that slides in from the right.
S.ntp = (() => {
  const DEFAULT_CHIPS = ['yo', '2026 news', 'make my browser lemon colored', 'cool esp32 projects', 'is it true that bananas are berries?', 'reddit'];

  function chipsFor(profile) {
    const out = [];
    const interests = profile?.interests || [];
    if (interests[0]) out.push(`more ${interests[0]} ideas`);
    if (interests[1]) out.push(`what's new in ${interests[1]}`);
    return [...out, ...DEFAULT_CHIPS].slice(0, 6);
  }

  function create(tab) {
    const el = document.getElementById('tpl-ntp').content.firstElementChild.cloneNode(true);
    const thread = S.$('.ntp-thread', el);
    const form = S.$('.ntp-composer', el);
    const input = S.$('textarea', form);
    const panel = S.$('.ntp-panel', el);
    const imagesPane = S.$('.pane-images', el);
    const sourcesPane = S.$('.pane-sources', el);
    const segBtns = S.$$('.seg button', el);
    const fit = S.autoGrow(input, 200);
    const name = S.app.settings.googleProfile?.givenName;
    S.$('.ntp-greet', el).textContent = tab.private ? 'Private tab — nothing here is remembered' : S.greeting(name);
    if (tab.private) el.classList.add('private');

    const chips = S.$('.ntp-chips', el);
    for (const c of chipsFor(S.ai.profile)) chips.append(S.el('button', { class: 'chip', text: c, onclick: () => ask(c) }));

    const showPane = (which) => {
      segBtns.forEach((b) => b.classList.toggle('on', b.dataset.pane === which));
      imagesPane.hidden = which !== 'images';
      sourcesPane.hidden = which !== 'sources';
    };
    segBtns.forEach((b) => b.addEventListener('click', () => showPane(b.dataset.pane)));
    S.$('.panel-close', el).addEventListener('click', () => { el.classList.remove('panel-open'); panel.setAttribute('aria-hidden', 'true'); });

    const chat = new S.Chat({
      thread,
      kind: 'ntp',
      onFirstMessage: () => el.classList.add('chatting'),
      onTurn(q) {
        el.classList.add('panel-open');
        panel.setAttribute('aria-hidden', 'false');
        S.$('.panel-q', el).textContent = q;
        showPane('images');
        segBtns[1].textContent = 'Sources';
        imagesPane.replaceChildren(S.el('div', { class: 'masonry skeleton' },
          ...Array.from({ length: 10 }, (_, i) => S.el('div', { class: 'sk', style: { height: `${[150, 210, 120, 180, 240, 140, 200, 160, 130, 220][i]}px`, animationDelay: `${i * 60}ms` } }))));
        sourcesPane.replaceChildren(S.el('p', { class: 'pane-empty', text: 'No web search needed for this one.' }));
      },
      onImages(imgs) {
        if (!imgs.length) { imagesPane.replaceChildren(S.el('p', { class: 'pane-empty', text: 'No images found.' })); return; }
        const grid = S.el('div', { class: 'masonry' });
        imgs.forEach((im, i) => {
          const img = S.el('img', { src: im.thumb, alt: im.title || '', loading: 'lazy', referrerpolicy: 'no-referrer' });
          const fig = S.el('figure', { class: 'shot', style: { animationDelay: `${Math.min(i, 14) * 35}ms` }, title: im.title || '' }, img,
            S.el('figcaption', {}, S.el('span', { text: S.host(im.page) })));
          img.addEventListener('load', () => fig.classList.add('ready'));
          img.addEventListener('error', () => fig.remove());
          fig.addEventListener('click', (e) => S.app.openTab(im.page || im.full, { background: e.ctrlKey || e.metaKey }));
          grid.append(fig);
        });
        imagesPane.replaceChildren(grid);
      },
      onSources(list) {
        segBtns[1].textContent = `Sources · ${list.length}`;
        sourcesPane.replaceChildren(...list.map((r, i) => S.el('a', { class: 'source', href: r.url, onclick: (e) => { e.preventDefault(); S.app.openTab(r.url, { background: e.ctrlKey || e.metaKey }); } },
          S.el('div', { class: 'source-top' },
            S.el('span', { class: 'source-n', text: String(i + 1) }),
            S.el('img', { src: S.favicon(r.url), alt: '', onerror: (e) => { e.target.style.visibility = 'hidden'; } }),
            S.el('span', { class: 'source-host', text: r.host || S.host(r.url) })),
          S.el('div', { class: 'source-title', text: r.title || r.url }),
          r.snippet ? S.el('div', { class: 'source-snippet', text: r.snippet }) : null)));
      },
    });

    function ask(text) {
      if (!text.trim()) return;
      if (tab.title === 'New tab' || tab.title === 'Private tab') { tab.title = text.slice(0, 60); S.tabs.render(); }
      chat.send(text);
      input.value = '';
      fit();
    }

    form.addEventListener('submit', (e) => { e.preventDefault(); ask(input.value); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(input.value); }
      if (e.key === 'Escape' && chat.busy) chat.stop();
    });

    return {
      el,
      ask,
      focus: () => input.focus(),
      destroy: () => chat.stop(),
    };
  }

  return { create };
})();
