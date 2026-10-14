// First launch, three clicks: your Gmail → sign in to Puter → pick your Slice.
// Puter is the only sign-in (it powers the free AI). Your name comes from the Gmail you type.
S.onboarding = (() => {
  const { FINE_TUNES } = SliceConfig;
  let root = null;
  let picked = ['bestie'];
  let profile = null;

  function step(n) {
    S.$$('.ob-step', root).forEach((s, i) => s.classList.toggle('on', i === n));
    S.$$('.ob-dots i', root).forEach((d, i) => d.classList.toggle('on', i === n));
    const focus = S.$('.ob-step.on input, .ob-step.on .btn.primary', root);
    setTimeout(() => focus?.focus(), 350);
  }

  function open() {
    if (root) return;
    S.ai.loadPuter().catch(() => {}); // ready before the click, so the sign-in popup isn't blocked

    // ---------- 1. who are you
    const email = S.el('input', { type: 'email', class: 'ob-email', placeholder: 'you@gmail.com', autocomplete: 'email', spellcheck: 'false' });
    const hello = S.el('div', { class: 'ob-hello-card' });
    const next1 = S.el('button', { class: 'btn primary big', text: 'Continue', disabled: true });
    const paintHello = () => {
      const ok = S.isEmail(email.value);
      next1.disabled = !ok;
      profile = ok ? S.profileFromEmail(email.value) : null;
      hello.replaceChildren(...(profile ? [S.avatar(profile, 40), S.el('div', {}, S.el('b', { text: profile.givenName ? `Hi, ${profile.givenName}` : 'Hi there' }), S.el('span', { text: profile.email }))] : []));
      hello.classList.toggle('on', !!profile);
    };
    email.addEventListener('input', paintHello);
    email.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !next1.disabled) next1.click(); });
    next1.addEventListener('click', () => { if (profile) step(1); });

    // ---------- 2. sign in to Puter
    const puterStatus = S.el('p', { class: 'ob-status' });
    const puterBtn = S.el('button', { class: 'btn primary big' }, S.el('span', { class: 'puter-mark', text: 'P' }), S.el('span', { text: 'Sign in with Puter' }));
    puterBtn.addEventListener('click', async () => {
      puterStatus.textContent = 'A Puter window just opened — sign in or create a free account there.';
      puterBtn.disabled = true;
      try {
        await S.ai.puterAuth.signIn();
        const u = await S.ai.puterAuth.user();
        puterStatus.textContent = `Signed in to Puter${u?.username ? ` as @${u.username}` : ''}.`;
        step(2);
      } catch (e) {
        const why = String(e?.error || e?.message || e);
        puterStatus.textContent = /closed/.test(why) ? 'The Puter window was closed. Try again whenever you’re ready.' : `Couldn’t sign in: ${why}`;
      } finally {
        puterBtn.disabled = false;
      }
    });
    const byok = S.el('details', { class: 'ob-byok' },
      S.el('summary', { text: 'Use my own AI key instead' }),
      S.el('input', { type: 'password', id: 'ob-key', placeholder: 'Gemini (AQ. or AIza), OpenAI, Claude, Grok…', spellcheck: 'false' }),
      S.el('button', { class: 'btn', text: 'Use this key', onclick: () => { if (S.$('#ob-key', root).value.trim()) step(2); } }));

    // ---------- 3. pick your Slice
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
      const patch = { onboarded: true, fineTunes: picked, profile };
      for (const k of picked) Object.assign(patch, FINE_TUNES[k].settings || {});
      const key = S.$('#ob-key', root)?.value.trim();
      const provider = key && SliceConfig.detectProvider(key);
      if (provider) { await window.slice.keys.set(provider, key); patch.aiProvider = provider; }
      else if (key) S.toast('Couldn’t tell which AI that key is for — set it in Settings → AI.', { timeout: 5000 });
      const { settings } = await window.slice.settings.set(patch);
      await S.ai.init(settings);
      S.$$('.ntp-greet').forEach((h) => { h.textContent = S.greeting(settings.profile?.givenName); });
      root.classList.add('out');
      setTimeout(() => { root.remove(); root = null; S.tabs.active?.ntp?.focus(); }, 600);
    };

    root = S.el('div', { class: 'onboarding' },
      S.el('div', { class: 'ob-horizon' }),
      S.el('div', { class: 'ob-step on' },
        S.el('img', { class: 'ob-logo', src: 'assets/slice-logo-256.png', alt: '' }),
        S.el('h1', { text: 'Welcome to Slice' }),
        S.el('p', { class: 'ob-sub', text: 'Say it, Slice does it. First, what’s your Gmail? Slice uses it to know your name — nothing gets sent anywhere.' }),
        S.el('div', { class: 'ob-field' }, email, next1),
        hello),
      S.el('div', { class: 'ob-step' },
        S.el('img', { class: 'ob-logo sm', src: 'assets/slice-logo-256.png', alt: '' }),
        S.el('h1', { text: 'Sign in to Puter' }),
        S.el('p', { class: 'ob-sub', text: 'Puter runs Slice’s AI for free — Gemini 3.5 Flash-Lite, Claude, GPT and more. It’s the only account Slice needs.' }),
        puterBtn,
        puterStatus,
        byok),
      S.el('div', { class: 'ob-step wide' },
        S.el('h1', { text: 'Pick your Slice' }),
        S.el('p', { class: 'ob-sub', text: 'How Slice talks and looks. Mix a few — change them anytime in Settings.' }),
        tunes,
        S.el('button', { class: 'btn primary big', text: 'Start browsing', onclick: finish })),
      S.el('div', { class: 'ob-dots' }, S.el('i', { class: 'on' }), S.el('i'), S.el('i')));
    document.getElementById('overlay-root').append(root);
    requestAnimationFrame(() => root.classList.add('in'));
    setTimeout(() => email.focus(), 400);
  }

  return { open };
})();
