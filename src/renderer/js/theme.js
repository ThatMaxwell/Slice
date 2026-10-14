// Turns settings into CSS variables + data attributes. Everything visual hangs off these.
S.theme = (() => {
  const root = document.documentElement;
  const media = matchMedia('(prefers-color-scheme: dark)');
  let last = null;

  function resolve(s) {
    const t = SliceConfig.THEMES[s.theme] || SliceConfig.THEMES.shore;
    const mode = s.mode === 'theme' ? t.mode : s.mode === 'system' ? (media.matches ? 'dark' : 'light') : s.mode;
    return {
      accent: s.accent || t.accent,
      accent2: s.accent2 || t.accent2,
      tint: s.tint ?? t.tint,
      mode,
    };
  }

  function contrastText(hex) {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? '#111316' : '#ffffff';
  }

  function apply(s) {
    last = s;
    const r = resolve(s);
    const d = root.dataset;
    d.mode = r.mode;
    d.layout = s.layout;
    d.compact = s.compact ? '1' : '0';
    d.transparent = s.transparency !== 'off' ? '1' : '0';
    d.density = s.density;
    d.font = s.font;
    d.motion = s.animations ? '1' : '0';
    d.platform = window.slice?.platform || 'web';
    d.home = s.showHomeButton ? '1' : '0';

    const st = root.style;
    st.setProperty('--accent', r.accent);
    st.setProperty('--accent-2', r.accent2);
    st.setProperty('--on-accent', contrastText(r.accent));
    st.setProperty('--tint', `${r.tint}%`);
    st.setProperty('--radius', `${s.radius}px`);
    st.setProperty('--glass', String(Math.max(0, Math.min(100, s.glass)) / 100));
    st.setProperty('--sidebar-w', `${s.sidebarWidth}px`);
    st.setProperty('--ui-scale', String(s.uiScale / 100));
    document.body.style.zoom = String(s.uiScale / 100);

    let css = document.getElementById('user-css');
    if (!css) { css = document.createElement('style'); css.id = 'user-css'; document.head.append(css); }
    if (css.textContent !== s.customCss) css.textContent = s.customCss || '';

    window.slice?.win.overlay({ color: '#00000000', symbolColor: r.mode === 'dark' ? '#e8ecf3' : '#1b1e24' });
  }

  media.addEventListener('change', () => last && last.mode === 'system' && apply(last));
  return { apply, resolve };
})();
