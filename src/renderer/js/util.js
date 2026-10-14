// Small DOM + string helpers shared by the whole UI.
window.S = window.S || {};

S.$ = (sel, root = document) => root.querySelector(sel);
S.$$ = (sel, root = document) => [...root.querySelectorAll(sel)];

S.el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') for (const [p, val] of Object.entries(v)) { if (p.startsWith('--')) node.style.setProperty(p, val); else node.style[p] = val; }
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) node.append(c.nodeType ? c : document.createTextNode(String(c)));
  return node;
};

S.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

S.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

S.host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

S.favicon = (u) => {
  const h = S.host(u);
  return h ? `https://icons.duckduckgo.com/ip3/${h}.ico` : '';
};

S.looksLikeUrl = (text) => {
  const t = text.trim();
  if (/\s/.test(t)) return false;
  if (/^(https?|file|about|chrome|view-source):/i.test(t)) return true;
  if (/^localhost(:\d+)?(\/|$)/i.test(t)) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/.test(t)) return true;
  return /^[\w-]+(\.[\w-]+)*\.[a-z]{2,24}(:\d+)?(\/\S*)?$/i.test(t);
};

S.normalizeUrl = (text) => {
  const t = text.trim();
  if (/^[a-z][\w+.-]*:/i.test(t) && !/^localhost:/i.test(t)) return t;
  return (/^(localhost|\d{1,3}(\.\d{1,3}){3})/i.test(t) ? 'http://' : 'https://') + t;
};

S.searchUrl = (q, settings) => {
  const { SEARCH_ENGINES } = SliceConfig;
  let tpl = SEARCH_ENGINES[settings.searchEngine]?.url;
  if (settings.searchEngine === 'custom') tpl = settings.customSearchUrl;
  if (!tpl || !tpl.includes('%s')) tpl = SEARCH_ENGINES.google.url;
  return tpl.replace('%s', encodeURIComponent(q));
};

S.greeting = (name) => {
  const h = new Date().getHours();
  const part = h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  return name ? `${part}, ${name}` : part;
};

S.uid = () => Math.random().toString(36).slice(2, 10);

S.toast = (msg, { icon = '', actions = [], timeout = 3200, id } = {}) => {
  const root = document.getElementById('toasts');
  let t = id && root.querySelector(`[data-id="${id}"]`);
  const body = S.el('div', { class: 'toast-body' }, icon ? S.el('span', { class: 'toast-icon', html: icon }) : null, S.el('span', { class: 'toast-msg', text: msg }),
    ...actions.map((a) => S.el('button', { class: 'toast-act', text: a.label, onclick: () => { a.onClick(); close(); } })));
  if (t) { t.replaceChildren(body); } else {
    t = S.el('div', { class: 'toast', 'data-id': id || '' }, body);
    root.append(t);
    requestAnimationFrame(() => t.classList.add('in'));
  }
  clearTimeout(t._timer);
  function close() { t.classList.remove('in'); setTimeout(() => t.remove(), 300); }
  if (timeout) t._timer = setTimeout(close, timeout);
  return { close };
};

S.autoGrow = (ta, max = 220) => {
  const fit = () => {
    if (!ta.isConnected || !ta.offsetParent) return; // not laid out yet
    ta.style.height = 'auto';
    ta.style.height = Math.min(max, ta.scrollHeight) + 'px';
  };
  ta.addEventListener('input', fit);
  ta.addEventListener('focus', fit);
  requestAnimationFrame(fit);
  return fit;
};

S.bytes = (n) => {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
};
