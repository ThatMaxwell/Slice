// One fetch for the whole main process.
// Inside Slice it's Chromium's own network stack (electron.net.fetch): the same code path
// Chrome uses for pages, which also follows the system proxy. Node's built-in fetch (undici)
// can crash the whole process with "assert(!this.paused)" when a server hangs up on a
// response nobody read, so Slice doesn't use it at runtime. Plain Node (tests) falls back to it.
let net = null;
try {
  const electron = require('electron');
  if (electron && typeof electron === 'object' && electron.net) net = electron.net;
} catch { /* not running inside Electron */ }

function httpFetch(url, init) {
  return net ? net.fetch(String(url), init) : fetch(url, init);
}

// Always finish with a response: read it or close it. Never leave a body hanging.
async function discard(res) {
  try { await res?.body?.cancel(); } catch { /* already closed */ }
}

module.exports = { httpFetch, discard };
