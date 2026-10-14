// Shared between the main process (require) and the browser UI (<script>).
(function (root) {
  const SEARCH_ENGINES = {
    google:     { name: 'Google',     url: 'https://www.google.com/search?q=%s' },
    brave:      { name: 'Brave Search', url: 'https://search.brave.com/search?q=%s' },
    duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
    bing:       { name: 'Bing',       url: 'https://www.bing.com/search?q=%s' },
    startpage:  { name: 'Startpage',  url: 'https://www.startpage.com/do/search?q=%s' },
    ecosia:     { name: 'Ecosia',     url: 'https://www.ecosia.org/search?q=%s' },
    kagi:       { name: 'Kagi',       url: 'https://kagi.com/search?q=%s' },
    perplexity: { name: 'Perplexity', url: 'https://www.perplexity.ai/search?q=%s' },
    qwant:      { name: 'Qwant',      url: 'https://www.qwant.com/?q=%s' },
    mojeek:     { name: 'Mojeek',     url: 'https://www.mojeek.com/search?q=%s' },
    yahoo:      { name: 'Yahoo',      url: 'https://search.yahoo.com/search?p=%s' },
    custom:     { name: 'Custom',     url: '' },
  };

  // accent / accent2 drive the whole UI. tint = how much the accent bleeds into the window.
  const THEMES = {
    shore:    { name: 'Shore',    accent: '#2f8cff', accent2: '#ffad5c', tint: 6,  mode: 'dark' },
    lemon:    { name: 'Lemon',    accent: '#f2cf1d', accent2: '#c6e04a', tint: 22, mode: 'light' },
    midnight: { name: 'Midnight', accent: '#7c8cff', accent2: '#b38cff', tint: 8,  mode: 'dark' },
    sakura:   { name: 'Sakura',   accent: '#ff7eb6', accent2: '#ffc2d9', tint: 14, mode: 'light' },
    forest:   { name: 'Forest',   accent: '#3fbf7f', accent2: '#a6d96a', tint: 12, mode: 'dark' },
    sunset:   { name: 'Sunset',   accent: '#ff7a45', accent2: '#ffc46b', tint: 12, mode: 'dark' },
    ocean:    { name: 'Ocean',    accent: '#00b8d9', accent2: '#5ad1ff', tint: 14, mode: 'dark' },
    grape:    { name: 'Grape',    accent: '#a259ff', accent2: '#ff6bd6', tint: 12, mode: 'dark' },
    mint:     { name: 'Mint',     accent: '#2ec4b6', accent2: '#cbf3f0', tint: 16, mode: 'light' },
    mono:     { name: 'Mono',     accent: '#d4d4d8', accent2: '#71717a', tint: 0,  mode: 'dark' },
    paper:    { name: 'Paper',    accent: '#3d3d3d', accent2: '#9b8b74', tint: 8,  mode: 'light' },
  };

  // "Fine-tunes": personality + defaults picked during setup.
  const FINE_TUNES = {
    bestie: {
      name: 'Bestie', icon: '✌️', blurb: 'Casual, hype, talks like you.',
      prompt: 'Be a warm, casual partner. Mirror the user\'s slang and energy, keep it fun, light emoji is fine. Never cringe, never preachy.',
    },
    researcher: {
      name: 'Researcher', icon: '🔎', blurb: 'Facts first, always cites.',
      prompt: 'Be precise and evidence-driven. Prefer searching the web for anything factual or time-sensitive, cite sources inline as [1], [2], and flag uncertainty.',
      settings: { aiWebSearch: 'eager' },
    },
    maker: {
      name: 'Maker', icon: '🛠️', blurb: 'Code, hardware, DIY builds.',
      prompt: 'The user likes building things: code, electronics, ESP32/Arduino, 3D printing. Give concrete steps, parts lists and code blocks when useful.',
      settings: { theme: 'sunset' },
    },
    minimal: {
      name: 'Minimalist', icon: '◽', blurb: 'Short answers, quiet UI.',
      prompt: 'Answer in as few words as possible. No filler, no preamble. Bullet points over paragraphs.',
      settings: { compact: true, theme: 'mono' },
    },
    creative: {
      name: 'Creative', icon: '🎨', blurb: 'Ideas, names, vibes.',
      prompt: 'Be playful and imaginative. Offer bold ideas and a few alternatives. Great at names, captions, moodboards and brainstorming.',
      settings: { theme: 'grape' },
    },
    student: {
      name: 'Student', icon: '📚', blurb: 'Explains things simply.',
      prompt: 'Explain like a great tutor: simple first, then deeper. Use examples and quick checks for understanding. Help study, never just do homework blindly.',
      settings: { theme: 'ocean' },
    },
  };

  const DEFAULT_MODEL = 'gemini-3.5-flash-lite';

  const DEFAULT_SETTINGS = {
    onboarded: false,
    // search & startup
    searchEngine: 'google',
    customSearchUrl: '',
    restoreTabs: true,
    // AI
    aiProvider: 'puter',           // puter | gemini | openai
    aiModel: DEFAULT_MODEL,
    geminiKey: '',
    openaiBaseUrl: 'https://openrouter.ai/api/v1',
    openaiKey: '',
    openaiModel: 'google/gemini-3.5-flash-lite',
    geminiGrounding: true,         // Gemini key only: answer with Google Search grounding
    braveSearchKey: '',
    aiWebSearch: 'auto',           // auto | eager | off
    imagesPanel: true,
    fineTunes: ['bestie'],
    customInstructions: '',
    memoryEnabled: true,
    // look
    theme: 'shore',
    accent: '',                    // overrides theme accent when set
    accent2: '',
    tint: null,                    // overrides theme tint when set (0-40)
    mode: 'theme',                 // theme | dark | light | system
    layout: 'top',                 // top | sidebar
    compact: false,
    transparency: 'off',           // off | mica | acrylic | tabbed
    glass: 55,                     // opacity of UI surfaces when transparent (0-100)
    radius: 12,
    density: 'cozy',               // compact | cozy | roomy
    font: 'system',                // system | inter | rounded | mono | serif
    uiScale: 100,
    animations: true,
    siteTint: true,
    showHomeButton: false,
    sidebarWidth: 260,
    customCss: '',
    // privacy
    adblock: true,
    gpc: true,
    blockThirdPartyCookies: false,
    // account
    googleProfile: null,
    oauthClientId: '',
  };

  // Keys the AI is allowed to change on the user's behalf.
  const AI_SETTABLE = {
    searchEngine: Object.keys(SEARCH_ENGINES).filter((k) => k !== 'custom'),
    theme: Object.keys(THEMES),
    accent: 'hex color', accent2: 'hex color', tint: 'number 0-40',
    mode: ['theme', 'dark', 'light', 'system'],
    layout: ['top', 'sidebar'],
    compact: 'boolean',
    transparency: ['off', 'mica', 'acrylic', 'tabbed'],
    glass: 'number 0-100',
    radius: 'number 0-24',
    density: ['compact', 'cozy', 'roomy'],
    font: ['system', 'inter', 'rounded', 'mono', 'serif'],
    uiScale: 'number 80-130',
    animations: 'boolean',
    siteTint: 'boolean',
    adblock: 'boolean',
    aiWebSearch: ['auto', 'eager', 'off'],
    imagesPanel: 'boolean',
    geminiGrounding: 'boolean',
    memoryEnabled: 'boolean',
    showHomeButton: 'boolean',
  };

  const api = { SEARCH_ENGINES, THEMES, FINE_TUNES, DEFAULT_SETTINGS, DEFAULT_MODEL, AI_SETTABLE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SliceConfig = api;
})(typeof window !== 'undefined' ? window : globalThis);
