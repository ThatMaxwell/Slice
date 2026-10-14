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
    daylight: { name: 'Daylight', accent: '#2f7bff', accent2: '#ff9a4d', tint: 4,  mode: 'light' },
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

  // Every AI Slice can talk to. kind: puter (in-browser, free) | gemini | anthropic | openai (OpenAI-compatible).
  // Model lists are suggestions — Settings → AI → "Load models" pulls the live list from the provider.
  const AI_PROVIDERS = {
    puter: {
      name: 'Puter.js', tag: 'Free', kind: 'puter', needsKey: false, default: 'google/gemini-3.5-flash-lite',
      blurb: 'Free, no key. Sign in to Puter once.',
      models: [
        ['google/gemini-3.5-flash-lite', 'Gemini 3.5 Flash-Lite'], ['google/gemini-3.6-flash', 'Gemini 3.6 Flash'],
        ['anthropic/claude-haiku-5-5', 'Claude Haiku 5.5'], ['anthropic/claude-sonnet-5-5', 'Claude Sonnet 5.5'],
        ['openai/gpt-6-luna', 'GPT-6 Luna'], ['openai/gpt-6-sol', 'GPT-6 Sol'], ['x-ai/grok-4.7', 'Grok 4.7'],
        ['deepseek/deepseek-v4.1-flash', 'DeepSeek V4.1 Flash'], ['mistralai/mistral-large-4', 'Mistral Large 4'], ['qwen/qwen3.8-max', 'Qwen3.8 Max'],
      ],
    },
    gemini: {
      name: 'Google Gemini', kind: 'gemini', needsKey: true, default: DEFAULT_MODEL, keyHint: 'AQ.… or AIza…', keyUrl: 'https://aistudio.google.com/apikey',
      blurb: 'Your Gemini key — new AQ. keys and classic AIza keys. Google Search grounding.',
      models: [['gemini-3.5-flash-lite', 'Gemini 3.5 Flash-Lite'], ['gemini-3.6-flash', 'Gemini 3.6 Flash'], ['gemini-3.1-flash-lite', 'Gemini 3.1 Flash-Lite']],
    },
    openai: {
      name: 'OpenAI', kind: 'openai', needsKey: true, base: 'https://api.openai.com/v1', default: 'gpt-6-luna', keyHint: 'sk-…', keyUrl: 'https://platform.openai.com/api-keys',
      blurb: 'GPT-6 Luna, Sol and Astra.',
      models: [['gpt-6-luna', 'GPT-6 Luna'], ['gpt-6-sol', 'GPT-6 Sol'], ['gpt-6.1-sol', 'GPT-6.1 Sol'], ['gpt-6-astra', 'GPT-6 Astra']],
    },
    anthropic: {
      name: 'Anthropic', kind: 'anthropic', needsKey: true, default: 'claude-haiku-5-5', keyHint: 'sk-ant-…', keyUrl: 'https://console.anthropic.com/settings/keys',
      blurb: 'Claude Haiku, Sonnet and Opus — with prompt caching.',
      models: [['claude-haiku-5-5', 'Claude Haiku 5.5'], ['claude-sonnet-5-5', 'Claude Sonnet 5.5'], ['claude-opus-5-5', 'Claude Opus 5.5']],
    },
    xai: {
      name: 'xAI Grok', kind: 'openai', needsKey: true, base: 'https://api.x.ai/v1', default: 'grok-4.7', keyHint: 'xai-…', keyUrl: 'https://console.x.ai',
      blurb: 'Grok 4.7.', models: [['grok-4.7', 'Grok 4.7']],
    },
    deepseek: {
      name: 'DeepSeek', kind: 'openai', needsKey: true, base: 'https://api.deepseek.com', default: 'deepseek-flash', keyHint: 'sk-…', keyUrl: 'https://platform.deepseek.com/api_keys',
      blurb: 'V4.1 Flash and V4 Pro.', models: [['deepseek-flash', 'DeepSeek V4.1 Flash'], ['deepseek-v4-pro', 'DeepSeek V4 Pro']],
    },
    mistral: {
      name: 'Mistral', kind: 'openai', needsKey: true, base: 'https://api.mistral.ai/v1', default: 'mistral-small-latest', keyHint: 'key', keyUrl: 'https://console.mistral.ai/api-keys',
      blurb: 'Mistral Small, Medium and Large.', models: [['mistral-small-latest', 'Mistral Small'], ['mistral-medium-latest', 'Mistral Medium'], ['mistral-large-latest', 'Mistral Large']],
    },
    groq: {
      name: 'Groq', kind: 'openai', needsKey: true, base: 'https://api.groq.com/openai/v1', default: 'openai/gpt-oss-120b', keyHint: 'gsk_…', keyUrl: 'https://console.groq.com/keys',
      blurb: 'Ridiculously fast open models.', models: [['openai/gpt-oss-120b', 'GPT-OSS 120B'], ['openai/gpt-oss-20b', 'GPT-OSS 20B'], ['llama-3.3-70b-versatile', 'Llama 3.3 70B'], ['llama-3.1-8b-instant', 'Llama 3.1 8B']],
    },
    openrouter: {
      name: 'OpenRouter', kind: 'openai', needsKey: true, base: 'https://openrouter.ai/api/v1', default: 'google/gemini-3.5-flash-lite', keyHint: 'sk-or-…', keyUrl: 'https://openrouter.ai/keys',
      blurb: 'Hundreds of models behind one key.', models: [['google/gemini-3.5-flash-lite', 'Gemini 3.5 Flash-Lite'], ['anthropic/claude-haiku-5.5', 'Claude Haiku 5.5'], ['openai/gpt-6-luna', 'GPT-6 Luna']],
    },
    ollama: {
      name: 'Ollama', tag: 'Local', kind: 'openai', needsKey: false, base: 'http://localhost:11434/v1', default: 'llama3.2', keyHint: 'not needed',
      blurb: 'Run models on your own PC.', models: [],
    },
    lmstudio: {
      name: 'LM Studio', tag: 'Local', kind: 'openai', needsKey: false, base: 'http://localhost:1234/v1', default: '', keyHint: 'not needed',
      blurb: 'Whatever model you have loaded.', models: [],
    },
    custom: {
      name: 'Custom', kind: 'openai', needsKey: false, base: '', default: '', keyHint: 'optional',
      blurb: 'Any OpenAI-compatible endpoint.', models: [],
    },
  };

  // Paste any key, Slice works out who it belongs to.
  function detectProvider(key) {
    const k = String(key || '').trim();
    if (/^(AQ\.|AIza)/.test(k)) return 'gemini';
    if (/^sk-ant-/.test(k)) return 'anthropic';
    if (/^sk-or-/.test(k)) return 'openrouter';
    if (/^xai-/.test(k)) return 'xai';
    if (/^gsk_/.test(k)) return 'groq';
    if (/^sk-/.test(k)) return 'openai';
    return '';
  }

  const DEFAULT_SETTINGS = {
    onboarded: false,
    // search & startup
    searchEngine: 'google',
    customSearchUrl: '',
    restoreTabs: true,
    // AI
    aiProvider: 'puter',           // any key of AI_PROVIDERS
    aiModels: {},                  // provider -> model id (falls back to the provider default)
    aiBaseUrls: {},                // provider -> base URL override (ollama, lmstudio, custom…)
    geminiGrounding: true,         // Gemini key only: answer with Google Search grounding
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
    aiProvider: Object.keys(AI_PROVIDERS),
    memoryEnabled: 'boolean',
    showHomeButton: 'boolean',
  };

  const api = { SEARCH_ENGINES, THEMES, FINE_TUNES, DEFAULT_SETTINGS, DEFAULT_MODEL, AI_SETTABLE, AI_PROVIDERS, detectProvider };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SliceConfig = api;
})(typeof window !== 'undefined' ? window : globalThis);
