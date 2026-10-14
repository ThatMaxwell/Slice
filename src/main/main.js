// Slice — main process.
const path = require('path');
const fs = require('fs');
const http = require('http');
const {
  app, BrowserWindow, ipcMain, session, Menu, shell, dialog, nativeTheme, clipboard, webContents,
} = require('electron');
const { DEFAULT_SETTINGS, AI_SETTABLE, AI_PROVIDERS } = require('../shared/config');
const { createStore } = require('./store');
const { createMemory } = require('./memory');
const { createAdblock } = require('./adblock');
const { createKeys } = require('./keys');
const search = require('./search');
const ai = require('./ai');

// Safety net: a failure in background work (a flaky site, a dropped connection, a bad API reply)
// must never put an error dialog in front of the user or take the browser down. Log it instead.
function logError(kind, err) {
  const line = `[${new Date().toISOString()}] ${kind}: ${err?.stack || err}\n`;
  console.error(line);
  try {
    const file = path.join(app.getPath('userData'), 'logs', 'main.log');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.existsSync(file) && fs.statSync(file).size > 1_000_000) fs.renameSync(file, `${file}.old`);
    fs.appendFileSync(file, line);
  } catch { /* logging must never throw */ }
}
process.on('uncaughtException', (e) => logError('uncaughtException', e));
process.on('unhandledRejection', (e) => logError('unhandledRejection', e));

const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';

// ---------------------------------------------------------------------------
// De-Googled Chromium: switch off the background phone-home features Chromium
// ships with. (Electron already excludes Google account sync, Safe Browsing
// pings, Google Update and crash upload; these cover what's left.)
// ---------------------------------------------------------------------------
const sw = app.commandLine;
sw.appendSwitch('disable-background-networking');
sw.appendSwitch('disable-breakpad');
sw.appendSwitch('disable-domain-reliability');
sw.appendSwitch('disable-component-update');
sw.appendSwitch('disable-sync');
sw.appendSwitch('no-pings');
sw.appendSwitch('no-default-browser-check');
sw.appendSwitch('disable-features', [
  'MediaRouter', 'DialMediaRouteProvider', 'OptimizationHints', 'OptimizationHintsFetching',
  'OptimizationGuideModelDownloading', 'Translate', 'InterestFeedContentSuggestions',
  'AutofillServerCommunication', 'CertificateTransparencyComponentUpdater', 'NetworkTimeServiceQuerying',
  'PrivacySandboxSettings4', 'BrowsingTopics', 'InterestGroupStorage', 'FledgeInterestGroups', 'AdInterestGroupAPI', 'Fledge',
].join(','));
sw.appendSwitch('enable-features', 'ParallelDownloading,BackForwardCache');
// Present as plain Chrome so sites don't break (and don't fingerprint "Electron").
app.userAgentFallback = app.userAgentFallback.replace(/\s(Electron|slice-browser|Slice)\/\S+/gi, '');

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

let win = null;
let settings, sessionStore, windowStore, memory, adblock, keys;
const pendingUrls = [];

const urlArg = (argv) => argv.slice(1).find((a) => /^(https?:|file:)/i.test(a) || /\.html?$/i.test(a));

function webSession() { return session.fromPartition('persist:slice'); }

function send(channel, payload) { if (win && !win.isDestroyed()) win.webContents.send(channel, payload); }

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
function sanitizePatch(patch, fromAI) {
  const out = {};
  for (const [k, v] of Object.entries(patch || {})) {
    if (!(k in DEFAULT_SETTINGS)) continue;
    if (fromAI && !(k in AI_SETTABLE)) continue;
    const rule = AI_SETTABLE[k];
    if (v === null && DEFAULT_SETTINGS[k] === null) { out[k] = null; continue; } // "back to theme default"
    if (Array.isArray(rule) && !rule.includes(v)) continue;
    if (rule === 'boolean') { if (typeof v === 'boolean' || v === 'true' || v === 'false') out[k] = v === true || v === 'true'; continue; }
    if (typeof rule === 'string' && rule.startsWith('number')) {
      const [lo, hi] = rule.match(/\d+/g).map(Number);
      const n = Number(v);
      if (Number.isFinite(n)) out[k] = Math.min(hi, Math.max(lo, n));
      continue;
    }
    if (rule === 'hex color') { if (v === '' || /^#[0-9a-f]{6}$/i.test(v)) out[k] = v; continue; }
    if (k === 'aiProvider' && fromAI) {
      // the AI may only switch to a provider that will actually work
      if (AI_PROVIDERS[v]?.needsKey && !keys.get(v)) continue;
    }
    if (k === 'profile') {
      if (v === null) { out[k] = null; continue; }
      if (!v || typeof v !== 'object') continue;
      const str = (x, n) => String(x || '').trim().slice(0, n);
      out[k] = { name: str(v.name, 60), givenName: str(v.givenName, 40), email: str(v.email, 120).toLowerCase() };
      continue;
    }
    if (k === 'aiModels' || k === 'aiBaseUrls') {
      if (!v || typeof v !== 'object') continue;
      out[k] = { ...settings.all[k] };
      for (const [p, val] of Object.entries(v)) if (AI_PROVIDERS[p] && typeof val === 'string') out[k][p] = val.trim().slice(0, 300);
      continue;
    }
    out[k] = v;
  }
  return out;
}

function applySettings(prev = {}) {
  const s = settings.all;
  adblock?.setEnabled(s.adblock);
  if (win && s.transparency !== prev.transparency) applyMaterial(s.transparency);
  nativeTheme.themeSource = s.mode === 'dark' || s.mode === 'light' ? s.mode : 'system';
}

function applyMaterial(mat) {
  if (!win) return;
  const on = mat && mat !== 'off';
  if (isWin && typeof win.setBackgroundMaterial === 'function') {
    try { win.setBackgroundMaterial(on ? mat : 'none'); } catch { /* pre-22H2 Windows */ }
  }
  if (isMac) win.setVibrancy(on ? 'under-window' : null);
  win.setBackgroundColor(on ? '#00000000' : '#0b0d12');
}

// ---------------------------------------------------------------------------
// The browser UI is served from a fixed loopback origin, not file://.
// Puter.js (the free AI) signs in per-origin and refuses file:// pages, and a
// stable origin keeps its login across launches.
// ---------------------------------------------------------------------------
const UI_ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
let uiOrigin = '';

function startUiServer() {
  const server = http.createServer((req, res) => {
    let rel;
    try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
    const file = path.normalize(path.join(UI_ROOT, rel));
    if (!file.startsWith(UI_ROOT + path.sep) || !/[\\/](renderer|shared)[\\/]/.test(file.slice(UI_ROOT.length))) { res.writeHead(404).end(); return; }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      res.end(buf);
    });
  });
  return new Promise((resolve) => {
    const ports = [41783, 41784, 41785, 41786, 0];
    const tryPort = (i) => {
      server.once('error', () => tryPort(i + 1));
      server.listen(ports[i], '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
    };
    tryPort(0);
  });
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------
function createWindow() {
  const s = settings.all;
  const bounds = windowStore.all;
  const transparent = s.transparency !== 'off';
  win = new BrowserWindow({
    width: bounds.width || 1360, height: bounds.height || 860, x: bounds.x, y: bounds.y,
    minWidth: 640, minHeight: 420,
    show: false,
    title: 'Slice',
    icon: path.join(__dirname, '../../assets/brand/slice-logo-256.png'),
    backgroundColor: transparent ? '#00000000' : '#0b0d12',
    ...(isWin && transparent ? { backgroundMaterial: s.transparency } : {}),
    ...(isMac ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 14, y: 14 }, vibrancy: transparent ? 'under-window' : undefined, visualEffectState: 'active' }
      : { titleBarStyle: 'hidden', titleBarOverlay: { color: '#00000000', symbolColor: '#e8ecf3', height: 40 } }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
      spellcheck: true,
    },
  });
  if (bounds.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.loadURL(`${uiOrigin}/renderer/index.html`);

  const saveBounds = () => {
    if (win.isDestroyed()) return;
    windowStore.patch({ ...(win.isMaximized() || win.isFullScreen() ? {} : win.getBounds()), maximized: win.isMaximized() });
  };
  win.on('resize', saveBounds);
  win.on('move', saveBounds);
  win.on('enter-full-screen', () => send('win:fullscreen', true));
  win.on('leave-full-screen', () => send('win:fullscreen', false));
  win.on('focus', () => send('win:focus', true));
  win.on('blur', () => send('win:focus', false));

  // The browser UI itself only opens popups for Puter's sign-in; everything else becomes a tab.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\/([\w-]+\.)?puter\.com\//.test(url)) {
      return { action: 'allow', overrideBrowserWindowOptions: { width: 520, height: 720, autoHideMenuBar: true, backgroundColor: '#ffffff' } };
    }
    send('tab:open', { url });
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.on('closed', () => { win = null; });
}

// ---------------------------------------------------------------------------
// Web content (every tab is a <webview> in the persist:slice session)
// ---------------------------------------------------------------------------
const SHORTCUT_KEYS = new Set(['t', 'w', 'n', 'l', 'r', 'f', 'j', 'k', 'd', 'e', 'b', 'tab', '=', '+', '-', '0', ',', '1', '2', '3', '4', '5', '6', '7', '8', '9', 's', 'c', 'p']);

function wireWebview(wc) {
  wc.setWindowOpenHandler(({ url, disposition }) => {
    if (disposition === 'new-window') {
      // real popups (sign-in windows, payments) keep window.opener so sign-ins work
      return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, webPreferences: { partition: 'persist:slice' } } };
    }
    send('tab:open', { url, background: disposition === 'background-tab', opener: wc.id });
    return { action: 'deny' };
  });

  wc.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const mod = isMac ? input.meta : input.control;
    const key = input.key.toLowerCase();
    let forward = false;
    if (mod && SHORTCUT_KEYS.has(key)) {
      // let pages keep plain copy / print; only steal Ctrl+Shift+C / Ctrl+Shift+S / Ctrl+P combos we own
      if ((key === 'c' || key === 's') && !input.shift) forward = false;
      else if (key === 'p') forward = false;
      else forward = true;
    }
    if (['F5', 'F6', 'F11', 'F12'].includes(input.key)) forward = true;
    if (input.alt && !mod && (input.key === 'ArrowLeft' || input.key === 'ArrowRight' || input.key === 'Home')) forward = true;
    if (input.key === 'Escape') send('shortcut', { key: 'escape', ctrl: false, shift: false, alt: false, passive: true });
    if (forward) {
      event.preventDefault();
      send('shortcut', { key, rawKey: input.key, ctrl: mod, shift: input.shift, alt: input.alt });
    }
  });

  wc.on('context-menu', (_e, p) => {
    const items = [];
    if (p.linkURL) {
      items.push(
        { label: 'Open link in new tab', click: () => send('tab:open', { url: p.linkURL, background: true }) },
        { label: 'Open link in private tab', click: () => send('tab:open', { url: p.linkURL, private: true }) },
        { label: 'Copy link address', click: () => clipboard.writeText(p.linkURL) },
        { type: 'separator' },
      );
    }
    if (p.mediaType === 'image' && p.srcURL) {
      items.push(
        { label: 'Open image in new tab', click: () => send('tab:open', { url: p.srcURL, background: true }) },
        { label: 'Copy image', click: () => wc.copyImageAt(p.x, p.y) },
        { label: 'Copy image address', click: () => clipboard.writeText(p.srcURL) },
        { label: 'Save image as…', click: () => wc.downloadURL(p.srcURL) },
        { type: 'separator' },
      );
    }
    if (p.selectionText) {
      const sel = p.selectionText.trim().slice(0, 500);
      items.push(
        { label: `Ask Slice about “${sel.slice(0, 28)}${sel.length > 28 ? '…' : ''}”`, click: () => send('assistant:ask', { text: sel }) },
        { label: 'Search the web', click: () => send('tab:search', { text: sel }) },
        { role: 'copy' },
        { type: 'separator' },
      );
    }
    if (p.isEditable) {
      for (const s of (p.dictionarySuggestions || []).slice(0, 4)) items.push({ label: s, click: () => wc.replaceMisspelling(s) });
      if (p.dictionarySuggestions?.length) items.push({ type: 'separator' });
      items.push({ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }, { type: 'separator' });
    }
    if (!p.linkURL && !p.selectionText && !p.isEditable && p.mediaType === 'none') {
      items.push(
        { label: 'Back', enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() },
        { label: 'Forward', enabled: wc.navigationHistory.canGoForward(), click: () => wc.navigationHistory.goForward() },
        { label: 'Reload', click: () => wc.reload() },
        { type: 'separator' },
        { label: 'Ask Slice about this page', click: () => send('assistant:open', {}) },
        { label: 'Save page as…', click: () => wc.downloadURL(wc.getURL()) },
        { type: 'separator' },
      );
    }
    items.push({ label: 'Inspect', click: () => wc.inspectElement(p.x, p.y) });
    Menu.buildFromTemplate(items).popup({ window: win });
  });
}

function setupSession(ses) {
  ses.setUserAgent(app.userAgentFallback);
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    const auto = ['fullscreen', 'clipboard-sanitized-write', 'pointerLock', 'window-management'];
    if (auto.includes(permission)) return callback(true);
    const ask = ['media', 'geolocation', 'notifications', 'midi', 'clipboard-read', 'display-capture', 'openExternal'];
    if (!ask.includes(permission) || !win) return callback(false);
    let origin = '';
    try { origin = new URL(details.requestingUrl || wc.getURL()).host; } catch { /* ignore */ }
    const what = permission === 'media' ? (details.mediaTypes || []).join(' & ') || 'camera/microphone' : permission;
    dialog.showMessageBox(win, {
      type: 'question', buttons: ['Allow', 'Block'], defaultId: 1, cancelId: 1,
      title: 'Permission', message: `${origin} wants to use your ${what}.`,
    }).then(({ response }) => callback(response === 0));
  });

  ses.webRequest.onBeforeSendHeaders((details, cb) => {
    const h = details.requestHeaders;
    if (settings.all.gpc) { h['Sec-GPC'] = '1'; h.DNT = '1'; }
    // drop the client-hint that would advertise Electron
    for (const k of Object.keys(h)) if (/^sec-ch-ua$/i.test(k)) h[k] = h[k].replace(/,?\s*"Electron";v="[^"]*"/i, '');
    cb({ requestHeaders: h });
  });

  ses.on('will-download', (_e, item) => {
    const dir = app.getPath('downloads');
    let name = item.getFilename();
    const ext = path.extname(name);
    const base = name.slice(0, name.length - ext.length);
    for (let i = 1; fs.existsSync(path.join(dir, name)); i++) name = `${base} (${i})${ext}`;
    const file = path.join(dir, name);
    item.setSavePath(file);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const report = (state) => send('download', {
      id, name, file, state, received: item.getReceivedBytes(), total: item.getTotalBytes(),
    });
    report('progressing');
    item.on('updated', (_ev, state) => report(state));
    item.once('done', (_ev, state) => report(state));
  });
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------
function registerIpc() {
  ipcMain.handle('settings:get', () => settings.all);
  ipcMain.handle('settings:set', (_e, patch, fromAI) => {
    const prev = { ...settings.all };
    const clean = sanitizePatch(patch, fromAI);
    settings.patch(clean);
    applySettings(prev);
    send('settings:changed', settings.all);
    return { applied: clean, settings: settings.all };
  });
  ipcMain.handle('settings:reset', () => {
    const keep = { onboarded: true, profile: settings.all.profile };
    settings.replace({ ...structuredClone(DEFAULT_SETTINGS), ...keep });
    applySettings({});
    send('settings:changed', settings.all);
    return settings.all;
  });

  ipcMain.handle('memory:profile', () => memory.profile());
  ipcMain.handle('memory:record', (_e, q) => (settings.all.memoryEnabled ? memory.record(q) : 'paused'));
  ipcMain.handle('memory:classify', (_e, q) => memory.classify(q));
  ipcMain.handle('memory:list', () => memory.list());
  ipcMain.handle('memory:remember', (_e, f) => memory.remember(f));
  ipcMain.handle('memory:forget', (_e, m) => memory.forget(m));
  ipcMain.handle('memory:removeEntry', (_e, t) => memory.removeEntry(t));
  ipcMain.handle('memory:removeFact', (_e, f) => memory.removeFact(f));
  ipcMain.handle('memory:clear', () => memory.clear());

  ipcMain.handle('search:web', (_e, q, opts = {}) => search.web(q, { ...opts, braveKey: keys.get('brave') }));
  ipcMain.handle('search:images', (_e, q, opts) => search.images(q, opts));
  ipcMain.handle('search:fetch', (_e, url) => search.fetchPage(url, { timeout: 5000, maxChars: 9000 }));

  ipcMain.handle('session:get', () => sessionStore.all);
  ipcMain.on('session:save', (_e, tabs) => sessionStore.patch({ tabs, savedAt: Date.now() }));

  ipcMain.handle('app:info', () => ({
    version: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome,
    node: process.versions.node, platform: process.platform, userData: app.getPath('userData'),
    adblock: !!adblock?.enabled,
  }));
  ipcMain.handle('app:pendingUrls', () => pendingUrls.splice(0));
  ipcMain.handle('data:clear', async (_e, what = 'all') => {
    const ses = webSession();
    if (what === 'cache') await ses.clearCache();
    else { await ses.clearStorageData(); await ses.clearCache(); }
    return true;
  });
  ipcMain.handle('download:show', (_e, file) => shell.showItemInFolder(file));
  ipcMain.handle('download:open', (_e, file) => shell.openPath(file));
  ipcMain.handle('win:overlay', (_e, { color, symbolColor }) => {
    if (win && !isMac && typeof win.setTitleBarOverlay === 'function') {
      try { win.setTitleBarOverlay({ color, symbolColor, height: 40 }); } catch { /* linux w/o overlay */ }
    }
  });
  ipcMain.handle('win:fullscreen', () => win?.setFullScreen(!win.isFullScreen()));
  ipcMain.handle('app:setDefault', () => {
    app.setAsDefaultProtocolClient('http');
    app.setAsDefaultProtocolClient('https');
    if (isWin) shell.openExternal('ms-settings:defaultapps');
    return app.isDefaultProtocolClient('https');
  });
  ai.register(ipcMain, () => settings.all, keys);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
// Older builds kept API keys inside settings.json. Move them into the encrypted key vault.
function migrateSettings() {
  const s = settings.all;
  if (s.geminiKey) { keys.set('gemini', s.geminiKey); }
  if (s.braveSearchKey) keys.set('brave', s.braveSearchKey);
  if (s.openaiKey) {
    const p = /openrouter\.ai/.test(s.openaiBaseUrl || '') ? 'openrouter' : 'custom';
    keys.set(p, s.openaiKey);
    s.aiModels = { ...(s.aiModels || {}), [p]: s.openaiModel || '' };
    if (p === 'custom') s.aiBaseUrls = { ...(s.aiBaseUrls || {}), custom: s.openaiBaseUrl || '' };
    if (s.aiProvider === 'openai') s.aiProvider = p;
  }
  if (s.googleProfile && !s.profile) s.profile = { name: s.googleProfile.name || '', givenName: s.googleProfile.givenName || '', email: s.googleProfile.email || '' };
  if (s.aiModel && s.aiModel !== DEFAULT_SETTINGS.aiModel) s.aiModels = { ...(s.aiModels || {}), gemini: s.aiModel };
  for (const k of Object.keys(s)) if (!(k in DEFAULT_SETTINGS)) delete s[k];
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) if (!(k in s)) s[k] = structuredClone(v);
  if (!AI_PROVIDERS[s.aiProvider]) s.aiProvider = 'puter';
  settings.save();
}

app.on('second-instance', (_e, argv) => {
  const u = urlArg(argv);
  if (u) send('tab:open', { url: u });
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});

app.on('web-contents-created', (_e, wc) => {
  if (wc.getType() === 'webview') wireWebview(wc);
  wc.on('will-attach-webview', (_ev, prefs, params) => {
    // tabs never get Node or custom preloads, whatever the UI asks for
    delete prefs.preload;
    prefs.nodeIntegration = false;
    prefs.nodeIntegrationInSubFrames = false;
    prefs.contextIsolation = true;
    prefs.sandbox = true;
    if (!['persist:slice', 'slice-private'].includes(params.partition)) params.partition = 'persist:slice';
  });
});

app.whenReady().then(async () => {
  settings = createStore('settings', DEFAULT_SETTINGS);
  keys = createKeys();
  migrateSettings();
  sessionStore = createStore('session', { tabs: [], googleRefresh: '' });
  windowStore = createStore('window', {});
  memory = createMemory();

  const first = urlArg(process.argv);
  if (first) pendingUrls.push(first);

  const tabsByWc = new Map();
  adblock = createAdblock((wcId) => {
    const n = (tabsByWc.get(wcId) || 0) + 1;
    tabsByWc.set(wcId, n);
    send('adblock:blocked', { wcId, count: n });
  });
  ipcMain.on('adblock:reset', (_e, wcId) => tabsByWc.delete(wcId));
  for (const ses of [webSession(), session.fromPartition('slice-private')]) {
    setupSession(ses);
    adblock.attach(ses);
  }
  adblock.setEnabled(settings.all.adblock);

  registerIpc();
  applySettings({});
  uiOrigin = await startUiServer();
  Menu.setApplicationMenu(isMac ? Menu.buildFromTemplate([
    { role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' },
  ]) : null);
  createWindow();

  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});

app.on('open-url', (e, url) => { e.preventDefault(); if (win) send('tab:open', { url }); else pendingUrls.push(url); });
app.on('window-all-closed', () => { if (!isMac) app.quit(); });
app.on('before-quit', () => {
  memory?.flush();
  keys?.flush();
  settings?.flushNow();
  sessionStore?.flushNow();
  windowStore?.flushNow();
});
