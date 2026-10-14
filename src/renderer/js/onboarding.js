// First launch: Google account → pick a fine-tune → go. Three clicks.
S.onboarding = (() => {
  const { FINE_TUNES } = SliceConfig;
  let root = null;
  let picked = ['bestie'];

  async function google() {
    const r = await window.slice.oauth.signIn();
    if (r.ok) { S.toast(`Signed in as ${r.profile.name || r.profile.email}`, { icon: '✓' }); return r.profile; }
    if (r.code === 'NO_CLIENT_ID') S.toast('Google sign-in isn’t configured in this build — you can add it later in Settings → Account.', { timeout: 5000 });
    else S.toast(`Google sign-in: ${r.message}`, { timeout: 4500 });
    return null;
  }

  function step(n) {
    S.$$('.ob-step', root).forEach((s, i) => s.classList.toggle('on', i === n));
    S.$$('.ob-dots i', root).forEach((d, i) => d.classList.toggle('on', i === n));
  }

  function open() {
    if (root) return;
    const gBtn = S.el('button', { class: 'btn google big' },
      S.el('span', { class: 'g-logo', html: '<svg viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>' }),
      S.el('span', { text: 'Continue with Google' }));
    gBtn.addEventListener('click', async () => {
      gBtn.classList.add('waiting');
      gBtn.lastChild.textContent = 'Waiting for Google…';
      const p = await google();
      gBtn.classList.remove('waiting');
      if (p) S.$('.ob-hello', root).textContent = `Nice to meet you, ${p.givenName || p.name}.`;
      step(1);
    });

    // bring-your-own-key, tucked away
    const byok = S.el('details', { class: 'ob-byok' },
      S.el('summary', { text: 'Have your own AI key?' }),
      S.el('div', { class: 'row gap' },
        S.el('input', { type: 'password', placeholder: 'Paste any key — Gemini (AQ. or AIza), OpenAI, Claude, Grok…', id: 'ob-key', spellcheck: 'false' })),
      S.el('p', { class: 'dim', text: 'By default Slice runs Gemini 3.5 Flash-Lite free through Puter.js. Paste a key and Slice figures out which AI it belongs to.' }));

    const tunes = S.el('div', { class: 'tune-grid ob-tunes' });
    const paintTunes = () => S.$$('.tune', tunes).forEach((b) => b.classList.toggle('on', picked.includes(b.dataset.k)));
    for (const [k, t] of Object.entries(FINE_TUNES)) {
      tunes.append(S.el('button', {
        class: 'tune', 'data-k': k,
        onclick: () => { picked = picked.includes(k) ? picked.filter((x) => x !== k) : [...picked, k]; if (!picked.length) picked = [k]; paintTunes(); },
      }, S.el('span', { class: 'tune-icon', text: t.icon }), S.el('b', { text: t.name }), S.el('span', { text: t.blurb })));
    }
    paintTunes();

    const finish = async () => {
      const patch = { onboarded: true, fineTunes: picked };
      for (const k of picked) Object.assign(patch, FINE_TUNES[k].settings || {});
      const key = S.$('#ob-key', root)?.value.trim();
      const provider = key && SliceConfig.detectProvider(key);
      if (provider) { await window.slice.keys.set(provider, key); patch.aiProvider = provider; }
      else if (key) S.toast('Couldn’t tell which AI that key is for — set it in Settings → AI.', { timeout: 5000 });
      const { settings } = await window.slice.settings.set(patch);
      await S.ai.init(settings);
      root.classList.add('out');
      setTimeout(() => { root.remove(); root = null; S.tabs.active?.ntp?.focus(); }, 650);
    };

    root = S.el('div', { class: 'onboarding' },
      S.el('div', { class: 'ob-glow' }),
      S.el('div', { class: 'ob-step on' },
        S.el('img', { class: 'ob-logo', src: 'assets/slice-logo-256.png', alt: '' }),
        S.el('h1', { text: 'Welcome to Slice' }),
        S.el('p', { class: 'ob-sub', text: 'The browser that gets you. Say it — Slice searches, answers, opens and restyles itself.' }),
        gBtn,
        S.el('button', { class: 'link', text: 'Skip for now', onclick: () => step(1) }),
        byok),
      S.el('div', { class: 'ob-step' },
        S.el('p', { class: 'ob-hello', text: 'Almost there.' }),
        S.el('h1', { text: 'Pick your Slice' }),
        S.el('p', { class: 'ob-sub', text: 'Pre-set fine-tunes for how Slice talks and looks. Mix a few — change them anytime.' }),
        tunes,
        S.el('button', { class: 'btn primary big', text: 'Start browsing', onclick: finish })),
      S.el('div', { class: 'ob-dots' }, S.el('i', { class: 'on' }), S.el('i')));
    document.getElementById('overlay-root').append(root);
    requestAnimationFrame(() => root.classList.add('in'));
  }

  return { open, google };
})();
