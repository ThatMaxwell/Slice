// Dev-only stand-in for the Electron bridge, so the UI can be previewed in a normal browser
// (npx serve src  →  /renderer/index.html). Does nothing inside Slice itself.
if (!window.slice) {
  const listeners = {};
  const emit = (ch, p) => (listeners[ch] || []).forEach((f) => f(p));
  const on = (ch) => (fn) => { (listeners[ch] = listeners[ch] || []).push(fn); return () => {}; };
  const params = new URLSearchParams(location.search);
  let settings = { ...SliceConfig.DEFAULT_SETTINGS, onboarded: !params.has('onboarding'), googleProfile: { name: 'Max', givenName: 'Max', email: 'max@example.com' } };
  for (const [k, v] of params) if (k in settings) settings[k] = v === 'true' ? true : v === 'false' ? false : isNaN(+v) || v === '' ? v : +v;
  const svgImg = (h, a, b, label) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="300" height="${h}" fill="url(#g)"/><text x="16" y="${h - 18}" font-family="system-ui" font-size="15" fill="rgba(255,255,255,.85)">${label}</text></svg>`)}`;
  const PAL = [['#1e3c72', '#2a5298'], ['#ff7e5f', '#feb47b'], ['#43cea2', '#185a9d'], ['#614385', '#516395'], ['#f7971e', '#ffd200'], ['#00c6ff', '#0072ff'], ['#ee0979', '#ff6a00'], ['#3a1c71', '#d76d77']];
  window.slice = {
    platform: params.get('platform') || 'win32',
    settings: {
      get: async () => settings,
      set: async (patch) => { settings = { ...settings, ...patch }; setTimeout(() => emit('settings:changed', settings)); return { applied: patch, settings }; },
      reset: async () => settings,
      onChange: on('settings:changed'),
    },
    memory: {
      profile: async () => ({ interests: ['esp32', 'synthwave', 'keyboards'], recent: ['cool esp32 projects'], facts: [], style: 'writes almost entirely in lowercase; casual slang (asf, u, ur)' }),
      record: async () => 'kept', classify: async () => 'kept',
      list: async () => ({ entries: [{ q: 'cool esp32 projects', t: Date.now() }, { q: 'best mechanical keyboard switches 2026', t: Date.now() - 9e7 }], facts: ['I’m vegetarian'], stats: { kept: 214, discarded: 61, private: 9 } }),
      remember: async () => true, forget: async () => 0, removeEntry: async () => {}, removeFact: async () => {}, clear: async () => {},
    },
    search: {
      web: async (q) => { await new Promise((r) => setTimeout(r, 700)); return { query: q, results: [
        { title: '40+ ESP32 projects you can build this weekend', url: 'https://randomnerdtutorials.com/projects-esp32/', host: 'randomnerdtutorials.com', snippet: 'Step-by-step builds with schematics and code — weather stations, cameras, LED matrices.' },
        { title: 'ESP32 Projects — Hackster.io', url: 'https://www.hackster.io/esp32/projects', host: 'hackster.io', snippet: 'Community builds: robots, smart home, wearables and more.' },
        { title: 'r/esp32 — what are you building?', url: 'https://www.reddit.com/r/esp32/', host: 'reddit.com', snippet: 'Show off your latest ESP32 creations.' },
      ], pages: [{}, {}] }; },
      images: async (q) => { await new Promise((r) => setTimeout(r, 900)); return Array.from({ length: 14 }, (_, i) => ({ thumb: svgImg([180, 240, 150, 210, 260, 170][i % 6], ...PAL[i % PAL.length], `${q} ${i + 1}`), page: 'https://example.com', title: q })); },
      fetch: async (url) => ({ url, title: 'Example', text: 'Example page' }),
    },
    ai: {
      stream: (req) => {
        const reply = params.get('reply') || 'Here are some **cool ESP32 builds** people love right now [1]:\n\n- **E-ink weather station** — deep-sleeps for months on a single 18650 [1]\n- **Pocket synth** with I²S DAC + a few buttons [2]\n- **LED matrix clock** that pulls live data over Wi-Fi\n- **Mini security cam** using the ESP32-CAM [3]\n\nWant a parts list for one of these?';
        let i = 0;
        const tick = () => {
          if (i >= reply.length) { emit('ai:event', { id: req.id, done: true }); return; }
          emit('ai:event', { id: req.id, text: reply.slice(i, i + 6) }); i += 6; setTimeout(tick, 12);
        };
        setTimeout(tick, 300);
      },
      abort: () => {}, warm: async () => false, onEvent: on('ai:event'),
    },
    oauth: { signIn: async () => ({ ok: false, code: 'NO_CLIENT_ID', message: 'mock' }), signOut: async () => {} },
    session: { get: async () => ({ tabs: (params.get('tabs') || '').split(',').filter(Boolean).map((u) => ({ url: `https://${u}` })) }), save: () => {} },
    app: { info: async () => ({ version: '0.1.0', electron: '44.7.2', chrome: '144', platform: 'win32' }), pendingUrls: async () => [], clearData: async () => {}, setDefault: async () => true },
    win: { overlay: async () => {}, fullscreen: async () => {}, onFullscreen: on('fs'), onFocus: on('focus') },
    downloads: { show: async () => {}, open: async () => {}, onUpdate: on('dl') },
    adblock: { onBlocked: on('blocked'), reset: () => {} },
    events: { onOpenTab: on('open'), onSearch: on('search'), onShortcut: on('shortcut'), onAssistantAsk: on('ask'), onAssistantOpen: on('aopen') },
  };
  window.__mockEmit = emit;
}
