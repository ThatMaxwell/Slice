// API keys live only in the main process, encrypted with the OS keychain when available
// (DPAPI on Windows). The browser UI only ever sees "set / not set" and a short hint.
const { safeStorage } = require('electron');
const { createStore } = require('./store');

// People paste keys with quotes, spaces, newlines or a "Bearer " prefix. Strip all of it.
function cleanKey(k) {
  return String(k || '')
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/^Bearer\s+/i, '')
    .replace(/^(GEMINI|GOOGLE|OPENAI|ANTHROPIC)_API_KEY\s*=\s*/i, '')
    .replace(/\s+/g, '');
}

function keyType(k) {
  if (k.startsWith('AQ.')) return 'Gemini auth key (AQ.)';
  if (k.startsWith('AIza')) return 'Gemini standard key (AIza)';
  if (k.startsWith('sk-ant-')) return 'Anthropic key';
  if (k.startsWith('sk-or-')) return 'OpenRouter key';
  if (k.startsWith('xai-')) return 'xAI key';
  if (k.startsWith('gsk_')) return 'Groq key';
  if (k.startsWith('sk-')) return 'Secret key';
  return 'Key';
}

function createKeys() {
  const store = createStore('keys', { keys: {} });
  const canEncrypt = () => { try { return safeStorage.isEncryptionAvailable(); } catch { return false; } };

  const api = {
    get(provider) {
      const v = store.all.keys[provider];
      if (!v) return '';
      try {
        return v.enc ? safeStorage.decryptString(Buffer.from(v.data, 'base64')) : v.data;
      } catch { return ''; }
    },
    set(provider, raw) {
      const key = cleanKey(raw);
      if (!key) { delete store.all.keys[provider]; store.save(); return api.status()[provider] || { set: false }; }
      store.all.keys[provider] = canEncrypt()
        ? { enc: true, data: safeStorage.encryptString(key).toString('base64') }
        : { enc: false, data: key };
      store.save();
      return api.status()[provider];
    },
    status() {
      const out = {};
      for (const p of Object.keys(store.all.keys)) {
        const k = api.get(p);
        if (k) out[p] = { set: true, type: keyType(k), hint: `${k.slice(0, 4)}…${k.slice(-4)}` };
      }
      return out;
    },
    flush() { store.flushNow(); },
  };
  return api;
}

module.exports = { createKeys, cleanKey, keyType };
