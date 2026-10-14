// uBlock Origin's own filter lists, on by default, running in Ghostery's uBO-compatible engine.
// (Chrome extensions can't run fully inside Electron, so we run the same lists natively —
//  network blocking + cosmetic filtering + scriptlets, compiled and cached to disk.)
const path = require('path');
const fs = require('fs/promises');
const { app } = require('electron');
const { ElectronBlocker } = require('@ghostery/adblocker-electron');
const { httpFetch } = require('./http');

const UBO_LISTS = [
  'https://ublockorigin.github.io/uAssets/filters/filters.min.txt',
  'https://ublockorigin.github.io/uAssets/filters/badware.min.txt',
  'https://ublockorigin.github.io/uAssets/filters/privacy.min.txt',
  'https://ublockorigin.github.io/uAssets/filters/quick-fixes.min.txt',
  'https://ublockorigin.github.io/uAssets/filters/unbreak.min.txt',
  'https://ublockorigin.github.io/uAssets/filters/resource-abuse.txt',
  'https://easylist.to/easylist/easylist.txt',
  'https://easylist.to/easylist/easyprivacy.txt',
  'https://pgl.yoyo.org/adservers/serverlist.php?hostformat=adblockplus&showintro=0&mimetype=plaintext',
];

const WEEK = 7 * 24 * 3600 * 1000;

function createAdblock(onBlocked) {
  let blocker = null;
  const sessions = new Set();
  let enabled = false;

  async function load() {
    const cache = path.join(app.getPath('userData'), 'ublock-engine.bin');
    let fresh = false;
    try { fresh = Date.now() - (await fs.stat(cache)).mtimeMs < WEEK; } catch { /* no cache */ }
    if (fresh) {
      try { return ElectronBlocker.deserialize(new Uint8Array(await fs.readFile(cache))); } catch { /* rebuild */ }
    }
    try {
      const b = await ElectronBlocker.fromLists(httpFetch, UBO_LISTS, { enableCompression: true, loadNetworkFilters: true, loadCosmeticFilters: true });
      fs.writeFile(cache, b.serialize()).catch(() => {});
      return b;
    } catch {
      // offline first run: fall back to Ghostery's prebuilt ads+tracking engine (same list families)
      return ElectronBlocker.fromPrebuiltAdsAndTracking(httpFetch);
    }
  }

  const ready = load().then((b) => {
    blocker = b;
    blocker.on('request-blocked', (req) => onBlocked?.(req.tabId, req.url));
    if (enabled) for (const s of sessions) blocker.enableBlockingInSession(s);
    return blocker;
  }).catch((e) => { console.error('[adblock]', e); });

  return {
    ready,
    attach(session) { sessions.add(session); if (enabled && blocker) blocker.enableBlockingInSession(session); },
    setEnabled(on) {
      enabled = !!on;
      if (!blocker) return;
      for (const s of sessions) {
        const active = blocker.isBlockingEnabled(s);
        if (on && !active) blocker.enableBlockingInSession(s);
        if (!on && active) blocker.disableBlockingInSession(s);
      }
    },
    get enabled() { return enabled; },
  };
}

module.exports = { createAdblock, UBO_LISTS };
