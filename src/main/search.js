// Fast web + image search for the AI, run from the main process (no CORS, no tracking cookies).
// Only reads what's needed: a handful of results and a short slice of the top pages.
const { httpFetch, discard } = require('./http');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const HEADERS = { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' };

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
function decode(s) {
  return String(s || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&([a-z0-9#]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}
const stripTags = (s) => decode(String(s || '').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

async function get(url, { timeout = 4000, headers = {} } = {}) {
  const res = await httpFetch(url, { headers: { ...HEADERS, ...headers }, signal: AbortSignal.timeout(timeout), redirect: 'follow' });
  if (!res.ok) { await discard(res); throw new Error(`HTTP ${res.status}`); }
  return res;
}

// ---------- web results ----------
async function braveWeb(q, key, count) {
  const res = await get(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=${count}`,
    { headers: { 'X-Subscription-Token': key, Accept: 'application/json' } });
  const j = await res.json();
  return (j.web?.results || []).map((r) => ({ title: stripTags(r.title), url: r.url, snippet: stripTags(r.description) }));
}

async function bingWeb(q, count) {
  const xml = await (await get(`https://www.bing.com/search?format=rss&count=${count}&q=${encodeURIComponent(q)}`)).text();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
  return items.map((it) => ({
    title: stripTags((it.match(/<title>([\s\S]*?)<\/title>/) || [])[1]),
    url: decode((it.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '').trim(),
    snippet: stripTags((it.match(/<description>([\s\S]*?)<\/description>/) || [])[1]),
    date: (it.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '',
  })).filter((r) => /^https?:/.test(r.url));
}

async function ddgWeb(q) {
  const html = await (await get(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`)).text();
  const out = [];
  const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:class="result__snippet"[^>]*>([\s\S]*?)<\/a>)?/g;
  for (const m of html.matchAll(re)) {
    let url = decode(m[1]);
    const uddg = url.match(/[?&]uddg=([^&]+)/);
    if (uddg) url = decodeURIComponent(uddg[1]);
    if (url.startsWith('//')) url = 'https:' + url;
    out.push({ title: stripTags(m[2]), url, snippet: stripTags(m[3]) });
  }
  return out;
}

// ---------- page reading ----------
function readable(html, maxChars) {
  let h = String(html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe|canvas)[\s\S]*?<\/\1>/gi, ' ');
  const title = stripTags((h.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
  const main = h.match(/<(article|main)[^>]*>([\s\S]*?)<\/\1>/i);
  if (main && main[2].length > 800) h = main[2];
  h = h.replace(/<(nav|header|footer|aside|form|button|select)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|br)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n');
  const text = decode(h.replace(/<[^>]+>/g, ' '))
    .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l.length > 30).join('\n');
  return { title, text: text.slice(0, maxChars) };
}

async function fetchPage(url, { timeout = 3500, maxChars = 6000 } = {}) {
  const res = await get(url, { timeout, headers: { Accept: 'text/html,application/xhtml+xml,text/plain' } });
  const type = res.headers.get('content-type') || '';
  if (!/text\/html|text\/plain|xml/.test(type)) { await discard(res); return { url, title: host(url), text: `[${type || 'binary'} content]` }; }
  // never download giant pages: cap at ~1.5MB
  const reader = res.body.getReader();
  const chunks = []; let size = 0;
  try {
    while (size < 1_500_000) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); size += value.length;
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  const html = Buffer.concat(chunks).toString('utf8');
  const r = /text\/plain/.test(type) ? { title: host(url), text: html.slice(0, maxChars) } : readable(html, maxChars);
  return { url, ...r };
}

// Search, then read the top few pages in parallel with a hard deadline.
async function web(q, { count = 6, read = 3, braveKey = '', deadline = 3200 } = {}) {
  let results = [];
  const tries = [];
  if (braveKey) tries.push(() => braveWeb(q, braveKey, count));
  // DuckDuckGo first (best quality on home connections), Bing RSS as the always-on fallback
  tries.push(() => ddgWeb(q), () => bingWeb(q, count));
  for (const t of tries) {
    try { results = await t(); if (results.length) break; } catch { /* next backend */ }
  }
  results = results.slice(0, count).map((r) => ({ ...r, host: host(r.url) }));

  const pages = [];
  if (read > 0 && results.length) {
    const jobs = results.slice(0, read).map((r) =>
      fetchPage(r.url, { timeout: deadline, maxChars: 2200 }).then((p) => pages.push(p)).catch(() => {}));
    await Promise.race([Promise.allSettled(jobs), new Promise((r) => setTimeout(r, deadline))]);
  }
  return { query: q, results, pages };
}

// ---------- images ----------
async function bingImages(q, count) {
  const html = await (await get(`https://www.bing.com/images/async?q=${encodeURIComponent(q)}&first=0&count=${count}&mmasync=1&adlt=strict`)).text();
  const out = [];
  for (const m of html.matchAll(/\sm="(\{[^"]+\})"/g)) {
    try {
      const j = JSON.parse(decode(m[1]));
      if (j.turl && j.murl) out.push({ thumb: j.turl, full: j.murl, page: j.purl, title: decode(j.t || '').replace(/[-]/g, '') });
    } catch { /* skip */ }
  }
  // thumbnail sizes live in the img tags; good enough to keep aspect ratios roughly right
  return out;
}

async function ddgImages(q, count) {
  const page = await (await get(`https://duckduckgo.com/?q=${encodeURIComponent(q)}&iax=images&ia=images`)).text();
  const vqd = (page.match(/vqd=["']?([\d-]+)["']?/) || [])[1];
  if (!vqd) throw new Error('no vqd');
  const j = await (await get(`https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(q)}&vqd=${vqd}&f=,,,&p=1`,
    { headers: { Referer: 'https://duckduckgo.com/' } })).json();
  return (j.results || []).slice(0, count).map((r) => ({ thumb: r.thumbnail, full: r.image, page: r.url, title: r.title, w: r.width, h: r.height }));
}

async function images(q, { count = 24 } = {}) {
  for (const t of [() => bingImages(q, count), () => ddgImages(q, count)]) {
    try { const r = await t(); if (r.length) return r.slice(0, count); } catch { /* next */ }
  }
  return [];
}

module.exports = { web, images, fetchPage, readable, host };
