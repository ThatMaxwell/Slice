// Bridge between the browser UI and the main process. Tabs (webviews) never see this.
const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (fn) => {
  const h = (_e, payload) => fn(payload);
  ipcRenderer.on(channel, h);
  return () => ipcRenderer.removeListener(channel, h);
};

contextBridge.exposeInMainWorld('slice', {
  platform: process.platform,
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch, fromAI = false) => ipcRenderer.invoke('settings:set', patch, fromAI),
    reset: () => ipcRenderer.invoke('settings:reset'),
    onChange: on('settings:changed'),
  },
  memory: {
    profile: () => ipcRenderer.invoke('memory:profile'),
    record: (q) => ipcRenderer.invoke('memory:record', q),
    classify: (q) => ipcRenderer.invoke('memory:classify', q),
    list: () => ipcRenderer.invoke('memory:list'),
    remember: (f) => ipcRenderer.invoke('memory:remember', f),
    forget: (m) => ipcRenderer.invoke('memory:forget', m),
    removeEntry: (t) => ipcRenderer.invoke('memory:removeEntry', t),
    removeFact: (f) => ipcRenderer.invoke('memory:removeFact', f),
    clear: () => ipcRenderer.invoke('memory:clear'),
  },
  search: {
    web: (q, opts) => ipcRenderer.invoke('search:web', q, opts),
    images: (q, opts) => ipcRenderer.invoke('search:images', q, opts),
    fetch: (url) => ipcRenderer.invoke('search:fetch', url),
  },
  ai: {
    stream: (req) => ipcRenderer.send('ai:stream', req),
    abort: (id) => ipcRenderer.send('ai:abort', id),
    warm: (system) => ipcRenderer.invoke('ai:warm', { system }),
    models: (provider) => ipcRenderer.invoke('ai:models', provider),
    test: (provider) => ipcRenderer.invoke('ai:test', provider),
    onEvent: on('ai:event'),
  },
  keys: {
    status: () => ipcRenderer.invoke('keys:status'),
    set: (provider, key) => ipcRenderer.invoke('keys:set', provider, key),
  },
  oauth: {
    signIn: () => ipcRenderer.invoke('oauth:signIn'),
    signOut: () => ipcRenderer.invoke('oauth:signOut'),
  },
  session: {
    get: () => ipcRenderer.invoke('session:get'),
    save: (tabs) => ipcRenderer.send('session:save', tabs),
  },
  app: {
    info: () => ipcRenderer.invoke('app:info'),
    pendingUrls: () => ipcRenderer.invoke('app:pendingUrls'),
    clearData: (what) => ipcRenderer.invoke('data:clear', what),
    setDefault: () => ipcRenderer.invoke('app:setDefault'),
  },
  win: {
    overlay: (colors) => ipcRenderer.invoke('win:overlay', colors),
    fullscreen: () => ipcRenderer.invoke('win:fullscreen'),
    onFullscreen: on('win:fullscreen'),
    onFocus: on('win:focus'),
  },
  downloads: {
    show: (file) => ipcRenderer.invoke('download:show', file),
    open: (file) => ipcRenderer.invoke('download:open', file),
    onUpdate: on('download'),
  },
  adblock: {
    onBlocked: on('adblock:blocked'),
    reset: (wcId) => ipcRenderer.send('adblock:reset', wcId),
  },
  events: {
    onOpenTab: on('tab:open'),
    onSearch: on('tab:search'),
    onShortcut: on('shortcut'),
    onAssistantAsk: on('assistant:ask'),
    onAssistantOpen: on('assistant:open'),
  },
});
