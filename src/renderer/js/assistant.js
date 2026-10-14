// "Ask about this page" — a Dia-style sidebar that can read the current tab.
S.assistant = (() => {
  let chat;
  const root = () => document.getElementById('assistant');

  async function getPage() {
    const t = S.tabs.active;
    if (!t || t.kind !== 'web' || !t.wvReady()) return { title: 'New tab', url: '', text: '(The user is on the Slice new tab page — no website is open.)' };
    try {
      const text = await t.webview.executeJavaScript(`(() => {
        const sel = String(getSelection());
        const main = document.querySelector('article, main, [role=main]') || document.body;
        const txt = (main.innerText || '').replace(/\\n{3,}/g, '\\n\\n');
        return (sel ? 'SELECTED TEXT:\\n' + sel + '\\n\\nPAGE:\\n' : '') + txt.slice(0, 16000);
      })()`, false);
      return { title: t.title, url: t.url, text };
    } catch {
      return { title: t.title, url: t.url, text: '(Could not read this page.)' };
    }
  }

  function init() {
    chat = new S.Chat({ thread: document.getElementById('as-thread'), kind: 'page', getPage, onFirstMessage: () => root().classList.add('has-chat') });
    const input = document.getElementById('as-input');
    const fit = S.autoGrow(input, 160);
    const go = () => { const v = input.value; input.value = ''; fit(); chat.send(v); };
    document.getElementById('as-form').addEventListener('submit', (e) => { e.preventDefault(); go(); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(); } });
    document.getElementById('as-close').addEventListener('click', () => toggle(false));
    document.getElementById('as-clear').addEventListener('click', () => { chat.reset(); root().classList.remove('has-chat'); });
    S.$$('#as-chips .chip').forEach((c) => c.addEventListener('click', () => chat.send(c.textContent)));
  }

  function isOpen() { return document.body.classList.contains('assistant-open'); }

  function toggle(force) {
    const open = force ?? !isOpen();
    document.body.classList.toggle('assistant-open', open);
    root().setAttribute('aria-hidden', String(!open));
    if (open) { syncTitle(); setTimeout(() => document.getElementById('as-input').focus(), 180); }
  }

  function syncTitle() {
    const t = S.tabs.active;
    document.getElementById('as-page').textContent = t?.kind === 'web' ? (t.title || S.host(t.url)) : 'new tab';
  }

  function ask(text) { toggle(true); chat.send(text); }

  return { init, toggle, ask, syncTitle, isOpen };
})();
