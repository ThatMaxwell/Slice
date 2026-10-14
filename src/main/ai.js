// Bring-your-own-key AI providers, streamed from the main process.
// (Puter.js — the default, free provider — runs in the browser UI itself.)
const crypto = require('crypto');

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
const running = new Map(); // id -> AbortController

// Explicit context cache for the system prompt. Built once at startup, reused for every message.
const promptCache = { hash: '', name: '', expires: 0, unsupported: false };

async function* sse(res) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
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
  }
}

async function errorText(res) {
  const t = await res.text().catch(() => '');
  try { return JSON.parse(t).error?.message || t; } catch { return t || `HTTP ${res.status}`; }
}

async function warmGeminiCache({ key, model, system }) {
  const hash = crypto.createHash('sha256').update(model + system).digest('hex');
  if (promptCache.unsupported) return null;
  if (promptCache.hash === hash && promptCache.expires > Date.now() + 60_000) return promptCache.name;
  try {
    const res = await fetch(`${GEMINI}/cachedContents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ model: `models/${model}`, systemInstruction: { parts: [{ text: system }] }, ttl: '3600s' }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      // Usually "too few tokens to cache" — implicit caching still kicks in on the shared prefix.
      promptCache.unsupported = true;
      return null;
    }
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

async function streamGemini({ key, model, system, messages, grounding, signal, onText, onMeta }) {
  const body = { contents: toGeminiContents(messages), generationConfig: { temperature: 0.7 } };
  if (grounding) {
    // tools can't be combined with a cached prompt, so grounded calls send the prompt inline
    body.systemInstruction = { parts: [{ text: system }] };
    body.tools = [{ google_search: {} }];
  } else {
    const cached = await warmGeminiCache({ key, model, system });
    if (cached) body.cachedContent = cached;
    else body.systemInstruction = { parts: [{ text: system }] };
  }
  const res = await fetch(`${GEMINI}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const msg = await errorText(res);
    if (body.cachedContent && /cache/i.test(msg)) { promptCache.unsupported = true; return streamGemini({ key, model, system, messages, grounding, signal, onText, onMeta }); }
    throw new Error(msg);
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

async function streamOpenAI({ baseUrl, key, model, system, messages, signal, onText }) {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, 'HTTP-Referer': 'https://thatmaxwell.github.io/Slice/', 'X-Title': 'Slice Browser' },
    body: JSON.stringify({ model, stream: true, messages: [{ role: 'system', content: system }, ...messages.filter((m) => m.role !== 'system')] }),
    signal,
  });
  if (!res.ok) throw new Error(await errorText(res));
  for await (const chunk of sse(res)) {
    const t = chunk.choices?.[0]?.delta?.content;
    if (t) onText(t);
  }
}

function register(ipcMain, getSettings) {
  ipcMain.on('ai:stream', async (event, req) => {
    const { id } = req;
    const ctrl = new AbortController();
    running.set(id, ctrl);
    const send = (payload) => { if (!event.sender.isDestroyed()) event.sender.send('ai:event', { id, ...payload }); };
    const s = getSettings();
    try {
      if (req.provider === 'gemini') {
        if (!s.geminiKey) throw new Error('Add your Gemini API key in Settings → AI.');
        await streamGemini({ key: s.geminiKey, model: s.aiModel, system: req.system, messages: req.messages, grounding: req.grounding, signal: ctrl.signal, onText: (text) => send({ text }), onMeta: (meta) => send({ meta }) });
      } else if (req.provider === 'openai') {
        if (!s.openaiKey) throw new Error('Add your API key in Settings → AI.');
        await streamOpenAI({ baseUrl: s.openaiBaseUrl, key: s.openaiKey, model: s.openaiModel, system: req.system, messages: req.messages, signal: ctrl.signal, onText: (text) => send({ text }) });
      } else {
        throw new Error(`Unknown provider ${req.provider}`);
      }
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
    if (s.aiProvider === 'gemini' && s.geminiKey) return !!(await warmGeminiCache({ key: s.geminiKey, model: s.aiModel, system }));
    return false;
  });
}

module.exports = { register };
