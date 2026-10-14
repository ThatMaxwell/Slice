// Small, safe markdown renderer for AI replies (escapes everything first).
S.md = (() => {
  const inline = (s, sources) => {
    let out = S.esc(s);
    const codes = [];
    out = out.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
    out = out
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, t, u) => `<a href="${u}" data-ext>${t}</a>`)
      .replace(/(^|[\s(])(https?:\/\/[^\s<)]+[^\s<).,!?;:'"])/g, (_, p, u) => `${p}<a href="${u}" data-ext>${S.host(u) || u}</a>`)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>')
      .replace(/(^|[^_\w])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>')
      .replace(/\[(\d{1,2})\]/g, (m, n) => {
        const src = sources?.[+n - 1];
        return src ? `<a class="cite" href="${S.esc(src.url)}" data-ext title="${S.esc(src.title || src.host || '')}">${n}</a>` : m;
      });
    return out.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[+i]}</code>`);
  };

  function render(src, sources) {
    const lines = String(src || '').replace(/\r/g, '').split('\n');
    const html = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const fence = line.match(/^```\s*([\w+-]*)/);
      if (fence) {
        const buf = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
        i++;
        html.push(`<pre data-lang="${S.esc(fence[1])}"><button class="copy" title="Copy">Copy</button><code>${S.esc(buf.join('\n'))}</code></pre>`);
        continue;
      }
      const h = line.match(/^(#{1,4})\s+(.*)/);
      if (h) { html.push(`<h${h[1].length + 2}>${inline(h[2], sources)}</h${h[1].length + 2}>`); i++; continue; }
      if (/^\s*(---|\*\*\*)\s*$/.test(line)) { html.push('<hr>'); i++; continue; }
      if (/^\s*>/.test(line)) {
        const buf = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
        html.push(`<blockquote>${inline(buf.join(' '), sources)}</blockquote>`);
        continue;
      }
      if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) {
        const row = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        const head = row(line);
        i += 2;
        const body = [];
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) body.push(row(lines[i++]));
        html.push(`<div class="table"><table><thead><tr>${head.map((c) => `<th>${inline(c, sources)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c, sources)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
        continue;
      }
      if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
        const ordered = /^\s*\d/.test(line);
        const items = [];
        while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, ''));
          i++;
          while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) items[items.length - 1] += ' ' + lines[i++].trim();
        }
        const tag = ordered ? 'ol' : 'ul';
        html.push(`<${tag}>${items.map((it) => `<li>${inline(it, sources)}</li>`).join('')}</${tag}>`);
        continue;
      }
      if (!line.trim()) { i++; continue; }
      const buf = [line];
      i++;
      while (i < lines.length && lines[i].trim() && !/^(```|#{1,4}\s|\s*>|\s*([-*+]|\d+[.)])\s+|\s*\|)/.test(lines[i])) buf.push(lines[i++]);
      html.push(`<p>${buf.map((b) => inline(b, sources)).join('<br>')}</p>`);
    }
    return html.join('');
  }

  return { render };
})();
