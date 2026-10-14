// Bring-your-own-key AI, streamed from the main process.
// Gemini (AQ. auth keys + AIza standard keys), Anthropic, and every OpenAI-compatible API.
// (Puter.js — the default, free provider — runs in the browser UI itself.)
const crypto = require('crypto');
const { AI_PROVIDERS } = require('../shared/config');
const { httpFetch, discard } = require('./http');

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
const running = new Map(); // id -> AbortController

// ---------------------------------------------------------------- helpers
async function* sse(res) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  // the finally block closes the stream even when we stop early ([DONE], abort, error)
  try { for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      try { yield JSON.parse(data); } catch { /* partial */ }
    }
  } } finally {
    reader.cancel().catch(() => {});
  }
}

async function errorText(res) {
  const t = await res.text().catch(() => '');
  let msg = t;
  try { const j = JSON.parse(t); msg = j.error?.message || j.message || (typeof j.error === 'string' ? j.error : '') || t; } catch { /* plain text */ }
  return msg || `HTTP ${res.status}`;
}

function friendly(provider, status, msg) {
  const name = AI_PROVIDERS[provider]?.name || provider;
  if (provider === 'gemini' && /OAuth 2 access token|API key not valid|API_KEY_INVALID/i.test(msg)) {
    return 'Google didn’t accept this Gemini key. Copy the whole key again from aistudio.google.com/apikey — new AQ. keys and older AIza keys both work in Slice.';
  }
  if (status === 401 || status === 403 || /api[_ ]?key|credential|unauthori[sz]ed|permission/i.test(msg)) return `${name} rejected the key: ${msg}`;
  if (status === 429) return `${name} says you're out of quota or going too fast: ${msg}`;
  if (status === 404) return `${name} doesn't know that model: ${msg}`;
  return `${name}: ${msg}`;
}

const isGeminiKey = (k) => /^(AQ\.|AIza)/.test(k);
const bareModel = (m) => String(m || '').replace(/^models\//, '').replace(/^google\//, '');

// ---------------------------------------------------------------- Gemini
// Auth keys (AQ.…) and standard keys (AIza…) both go to the native endpoint.
// The x-goog-api-key header is the documented way. If Google rejects that for a key,
// try ?key=, and for AQ. auth keys also a Bearer token (Google routes AQ. keys through its
// token-auth path), then remember which style that key likes.
const geminiAuthStyle = new Map(); // key hash -> 'header' | 'query' | 'bearer'
const keyId = (k) => crypto.createHash('sha256').update(k).digest('hex').slice(0, 16);

async function geminiFetch(path, key, init = {}) {
  const id = keyId(key);
  const known = geminiAuthStyle.get(id);
  const styles = known ? [known] : key.startsWith('AQ.') ? ['header', 'query', 'bearer'] : ['header', 'query'];
  let last;
  for (const style of styles) {
    const url = new URL(GEMINI + path);
    const headers = { 'Content-Type': 'application/json', ...(init.headers || {}) };
    if (style === 'header') headers['x-goog-api-key'] = key;
    else if (style === 'bearer') headers.Authorization = `Bearer ${key}`;
    else url.searchParams.set('key', key);
    const res = await httpFetch(url, { ...init, headers });
    if (res.ok) { geminiAuthStyle.set(id, style); return res; }
    // read the error fully (never leave a body hanging), keep it for the caller
    const body = await res.text().catch(() => '');
    last = new Response(body, { status: res.status, statusText: res.statusText });
    if (![400, 401, 403].includes(res.status)) break;
    if (!/key|credential|auth|unauthenticated|permission/i.test(body)) break;
  }
  return last;
}

// Explicit context cache for the system prompt: built once at startup, reused for every message.
const promptCache = { hash: '', name: '', expires: 0, unsupported: new Set() };

async function warmGeminiCache({ key, model, system }) {
  const id = keyId(key) + model;
  if (promptCache.unsupported.has(id)) return null;
  const hash = crypto.createHash('sha256').update(id + system).digest('hex');
  if (promptCache.hash === hash && promptCache.expires > Date.now() + 60_000) return promptCache.name;
  try {
    const res = await geminiFetch('/cachedContents', key, {
      method: 'POST',
      body: JSON.stringify({ model: `models/${model}`, systemInstruction: { parts: [{ text: system }] }, ttl: '3600s' }),
      signal: AbortSignal.timeout(8000),
    });
    // usually "too few tokens to cache" — implicit prefix caching still applies
    if (!res.ok) { await discard(res); promptCache.unsupported.add(id); return null; }
    const j = await res.json();
    Object.assign(promptCache, { hash, name: j.name, expires: Date.now() + 3500_000 });
    return j.name;
  } catch {
    return null;
  }
}

function toGeminiContents(messages) {
  return messages.filter((m) => m.role !== 'system').map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: String(m.content) }],
  }));
}

async function streamGemini({ key, model, system, messages, grounding, signal, onText, onMeta, retried }) {
  model = bareModel(model);
  const body = { contents: toGeminiContents(messages), generationConfig: { temperature: 0.7 } };
  let usedCache = false;
  if (grounding) {
    // tools can't be combined with a cached prompt, so grounded calls send the prompt inline
    body.systemInstruction = { parts: [{ text: system }] };
    body.tools = [{ google_search: {} }];
  } else {
    const cached = await warmGeminiCache({ key, model, system });
    if (cached) { body.cachedContent = cached; usedCache = true; } else body.systemInstruction = { parts: [{ text: system }] };
  }
  const res = await geminiFetch(`/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, key, { method: 'POST', body: JSON.stringify(body), signal });
  if (!res.ok) {
    const msg = await errorText(res);
    if (usedCache && !retried) { promptCache.unsupported.add(keyId(key) + model); return streamGemini({ key, model, system, messages, grounding, signal, onText, onMeta, retried: true }); }
    throw new Error(friendly('gemini', res.status, msg));
  }
  const sources = new Map();
  for await (const chunk of sse(res)) {
    const cand = chunk.candidates?.[0];
    const text = (cand?.content?.parts || []).map((p) => (p.thought ? '' : p.text || '')).join('');
    if (text) onText(text);
    for (const g of cand?.groundingMetadata?.groundingChunks || []) {
      if (g.web?.uri) sources.set(g.web.uri, { url: g.web.uri, title: g.web.title || '', host: g.web.title || '' });
    }
  }
  if (sources.size) onMeta({ sources: [...sources.values()] });
}

// ---------------------------------------------------------------- Anthropic
async function streamAnthropic({ key, model, system, messages, signal, onText }) {
  const msgs = messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content) }));
  const res = await httpFetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    // the system prompt is marked cacheable, so it's only processed in full once
    body: JSON.stringify({ model, max_tokens: 2048, stream: true, system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }], messages: msgs }),
    signal,
  });
  if (!res.ok) throw new Error(friendly('anthropic', res.status, await errorText(res)));
  for await (const ev of sse(res)) {
    if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') onText(ev.delta.text);
    if (ev.type === 'error') throw new Error(friendly('anthropic', 0, ev.error?.message || 'stream error'));
  }
}

// ---------------------------------------------------------------- OpenAI-compatible
async function streamOpenAI({ provider, baseUrl, key, model, system, messages, signal, onText }) {
  const headers = { 'Content-Type': 'application/json' };
  if (key) headers.Authorization = `Bearer ${key}`;
  if (provider === 'openrouter') Object.assign(headers, { 'HTTP-Referer': 'https://thatmaxwell.github.io/Slice/', 'X-Title': 'Slice Browser' });
  const res = await httpFetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, stream: true, messages: [{ role: 'system', content: system }, ...messages.filter((m) => m.role !== 'system')] }),
    signal,
  });
  if (!res.ok) throw new Error(friendly(provider, res.status, await errorText(res)));
  for await (const chunk of sse(res)) {
    const t = chunk.choices?.[0]?.delta?.content;
    if (t) onText(t);
  }
}

// ---------------------------------------------------------------- routing
function resolve(provider, settings, keys) {
  const def = AI_PROVIDERS[provider];
  if (!def) throw new Error(`Unknown AI provider “${provider}”.`);
  const key = keys.get(provider);
  const model = settings.aiModels?.[provider] || def.default;
  const baseUrl = String(settings.aiBaseUrls?.[provider] || def.base || '').replace(/\/+$/, '');
  if (def.needsKey && !key) throw new Error(`Add your ${def.name} key in Settings → AI.`);
  if (!model) throw new Error(`Pick a model for ${def.name} in Settings → AI.`);
  if (def.kind === 'openai' && !baseUrl) throw new Error(`Set the base URL for ${def.name} in Settings → AI.`);
  // A Gemini key pointed at Google's OpenAI-compatible endpoint: AQ. keys don't work there,
  // so quietly use the native Gemini API instead.
  const kind = def.kind === 'openai' && isGeminiKey(key) && /generativelanguage\.googleapis\.com/.test(baseUrl) ? 'gemini' : def.kind;
  return { def, kind, key, model, baseUrl };
}

// "fetch failed" means nothing answered — usually a local server that isn't running.
function unreachable(provider, settings, e) {
  if (!/fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN/i.test(String(e?.message || e) + String(e?.cause?.code || ''))) return e;
  const def = AI_PROVIDERS[provider];
  const base = settings.aiBaseUrls?.[provider] || def?.base || '';
  return new Error(def?.tag === 'Local' ? `Couldn’t reach ${def.name} at ${base} — is it running?` : `Couldn’t reach ${def?.name || provider}${base ? ` at ${base}` : ''} — check your connection.`);
}

async function streamAny(provider, settings, keys, opts) {
  try { return await streamAnyInner(provider, settings, keys, opts); } catch (e) { throw unreachable(provider, settings, e); }
}

async function streamAnyInner(provider, settings, keys, { system, messages, grounding, signal, onText, onMeta }) {
  const r = resolve(provider, settings, keys);
  if (r.kind === 'gemini') return streamGemini({ key: r.key, model: r.model, system, messages, grounding, signal, onText, onMeta });
  if (r.kind === 'anthropic') return streamAnthropic({ key: r.key, model: r.model, system, messages, signal, onText });
  if (r.kind === 'openai') return streamOpenAI({ provider, baseUrl: r.baseUrl, key: r.key, model: r.model, system, messages, signal, onText });
  throw new Error(`${r.def.name} runs inside the browser UI, not here.`);
}

async function listModels(provider, settings, keys) {
  const def = AI_PROVIDERS[provider];
  const key = keys.get(provider);
  const sig = AbortSignal.timeout(10000);
  if (def.kind === 'gemini' || (def.kind === 'openai' && isGeminiKey(key))) {
    const res = await geminiFetch('/models?pageSize=200', key, { signal: sig });
    if (!res.ok) throw new Error(friendly('gemini', res.status, await errorText(res)));
    const j = await res.json();
    return (j.models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => [bareModel(m.name), m.displayName || bareModel(m.name)]);
  }
  if (def.kind === 'anthropic') {
    const res = await httpFetch('https://api.anthropic.com/v1/models?limit=100', { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, signal: sig });
    if (!res.ok) throw new Error(friendly(provider, res.status, await errorText(res)));
    return ((await res.json()).data || []).map((m) => [m.id, m.display_name || m.id]);
  }
  const base = String(settings.aiBaseUrls?.[provider] || def.base || '').replace(/\/+$/, '');
  const res = await httpFetch(`${base}/models`, { headers: key ? { Authorization: `Bearer ${key}` } : {}, signal: sig });
  if (!res.ok) throw new Error(friendly(provider, res.status, await errorText(res)));
  return ((await res.json()).data || []).map((m) => [m.id, m.name || m.id]).sort((a, b) => a[0].localeCompare(b[0]));
}

function register(ipcMain, getSettings, keys) {
  ipcMain.on('ai:stream', async (event, req) => {
    const { id } = req;
    const ctrl = new AbortController();
    running.set(id, ctrl);
    const send = (payload) => { if (!event.sender.isDestroyed()) event.sender.send('ai:event', { id, ...payload }); };
    try {
      await streamAny(req.provider, getSettings(), keys, {
        system: req.system, messages: req.messages, grounding: req.grounding, signal: ctrl.signal,
        onText: (text) => send({ text }), onMeta: (meta) => send({ meta }),
      });
      send({ done: true });
    } catch (e) {
      send(ctrl.signal.aborted ? { done: true, aborted: true } : { error: String(e.message || e) });
    } finally {
      running.delete(id);
    }
  });
  ipcMain.on('ai:abort', (_e, id) => running.get(id)?.abort());

  ipcMain.handle('ai:warm', async (_e, { system }) => {
    const s = getSettings();
    try {
      const r = resolve(s.aiProvider, s, keys);
      if (r.kind === 'gemini') return !!(await warmGeminiCache({ key: r.key, model: bareModel(r.model), system }));
    } catch { /* not configured yet */ }
    return false;
  });

  ipcMain.handle('ai:models', async (_e, provider) => {
    try { return { ok: true, models: await listModels(provider, getSettings(), keys) }; }
    catch (e) { return { ok: false, error: String(unreachable(provider, getSettings(), e).message || e) }; }
  });

  // "Test" button: a tiny real request, so people know their key works before they need it.
  ipcMain.handle('ai:test', async (_e, provider) => {
    const t0 = Date.now();
    let text = '';
    try {
      await streamAny(provider, getSettings(), keys, {
        system: 'Reply with exactly: OK', messages: [{ role: 'user', content: 'ping' }], grounding: false,
        signal: AbortSignal.timeout(20000), onText: (t) => { text += t; }, onMeta: () => {},
      });
      return { ok: true, ms: Date.now() - t0, reply: text.trim().slice(0, 60) };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('keys:status', () => keys.status());
  ipcMain.handle('keys:set', (_e, provider, key) => (AI_PROVIDERS[provider] || provider === 'brave' ? keys.set(provider, key) : null));
}

module.exports = { register };
