#!/usr/bin/env node
// Paparazzi for Slice: snapshot the website and the browser UI on every device we care about.
// (Cash App's Paparazzi is Android-only. This is the same idea for the web: real renders,
// named shots, a contact sheet, and a hard failure if anything scrolls sideways on a phone.)
//
//   npm run paparazzi                 # every shot
//   npm run paparazzi -- duo          # only shots whose name contains "duo"
//
// Needs Playwright's Chromium:  npx playwright install chromium
// (or point PAPARAZZI_CHROME at any Chromium/Chrome executable)
const http = require('http');
const fs = require('fs');
const path = require('path');

let chromium;
try { ({ chromium } = require('playwright')); } catch {
  console.error('Paparazzi needs Playwright: npm i -D playwright && npx playwright install chromium');
  process.exit(1);
}

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'paparazzi');
const only = process.argv[2] || '';

// CSS viewports. iPhone Duo numbers are the published panel resolutions ÷ 3.
const DEVICES = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  'iphone-17': { viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  'iphone-17-pro-max': { viewport: { width: 440, height: 956 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  'iphone-duo-folded': { viewport: { width: 466, height: 678 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  'iphone-duo-unfolded': { viewport: { width: 890, height: 626 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  'iphone-duo-split-view': { viewport: { width: 445, height: 626 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  ipad: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

const SITE_SECTIONS = ['top', 'features', 'any-ai', 'customize', 'glass', 'privacy', 'lineup', 'download'];

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.json': 'application/json' };
function serve() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.normalize(path.join(ROOT, p));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' }).end(buf);
    });
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, base: `http://127.0.0.1:${server.address().port}` })));
}

async function overflow(page) {
  return page.evaluate(() => {
    const W = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth <= W + 1) return null;
    const bad = [...document.querySelectorAll('body *')].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width && r.right > W + 1 && getComputedStyle(e).position !== 'fixed' && !e.closest('.marquee, .mock, .waves');
    }).slice(0, 6).map((e) => `${e.tagName.toLowerCase()}.${[...e.classList].join('.')} → ${Math.round(e.getBoundingClientRect().right)}px`);
    return { scrollWidth: document.documentElement.scrollWidth, width: W, bad };
  });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const { server, base } = await serve();
  // let the intro's chime autoplay so the boot sequence runs straight through (no skipping on the real site)
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'], ...(process.env.PAPARAZZI_CHROME ? { executablePath: process.env.PAPARAZZI_CHROME } : {}) });
  const waitForIntro = (page) => page.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 30000 });
  const shots = [];
  const problems = [];
  const snap = async (page, name) => {
    if (only && !name.includes(only)) return;
    const file = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: file });
    shots.push({ name, file });
    process.stdout.write(`  📸 ${name}\n`);
  };

  // ---- the website on every device
  for (const [device, opts] of Object.entries(DEVICES)) {
    if (only && !device.includes(only) && !'site'.includes(only)) continue;
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${base}/docs/`);
    await waitForIntro(page);
    await page.waitForTimeout(1500);
    await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
    for (const id of SITE_SECTIONS) {
      await page.evaluate((s) => { const el = s === 'top' ? null : document.getElementById(s); window.scrollTo(0, el ? el.getBoundingClientRect().top + scrollY - 70 : 0); }, id);
      await page.waitForTimeout(id === 'top' ? 2500 : 1300);
      await snap(page, `site-${device}-${id}`);
    }
    const o = await overflow(page);
    if (o) problems.push(`${device}: page is ${o.scrollWidth}px wide in a ${o.width}px viewport\n      ${o.bad.join('\n      ')}`);
    if (errors.length) problems.push(`${device}: ${errors.join('; ')}`);
    await ctx.close();
  }

  // ---- unfolding an iPhone Duo mid-visit: the page must reflow, not break
  if (!only || 'iphone-duo-unfold-live'.includes(only) || only === 'duo') {
    const ctx = await browser.newContext(DEVICES['iphone-duo-folded']);
    const page = await ctx.newPage();
    await page.goto(`${base}/docs/`);
    await waitForIntro(page);
    await page.waitForTimeout(800);
    await page.setViewportSize(DEVICES['iphone-duo-unfolded'].viewport);
    await page.waitForTimeout(1500);
    await snap(page, 'site-iphone-duo-unfold-live');
    const o = await overflow(page);
    if (o) problems.push(`duo unfold: ${o.scrollWidth}px wide in ${o.width}px`);
    await ctx.close();
  }

  // ---- the browser UI itself (renderer with its dev bridge)
  const ui = [
    ['ui-new-tab', ''],
    ['ui-ai-answer', '?aiProvider=gemini', 'best beaches in portugal'],
    ['ui-lemon-sidebar', '?aiProvider=gemini&theme=lemon&layout=sidebar&tabs=github.com,reddit.com', 'make my browser lemon colored'],
    ['ui-daylight', '?theme=daylight'],
    ['ui-settings-ai', '?aiProvider=gemini', null, "S.settingsUI.open('ai')"],
    ['ui-onboarding', '?onboarding=1'],
  ];
  for (const [name, q, prompt, js] of ui) {
    if (only && !name.includes(only)) continue;
    const ctx = await browser.newContext(DEVICES.desktop);
    const page = await ctx.newPage();
    await page.goto(`${base}/src/renderer/index.html${q}`);
    await page.waitForTimeout(900);
    if (prompt) { await page.fill('.view.active .ntp-composer textarea', prompt); await page.keyboard.press('Enter'); await page.waitForTimeout(2800); }
    if (js) { await page.evaluate(js); await page.waitForTimeout(900); }
    await snap(page, name);
    await ctx.close();
  }

  // ---- contact sheet
  if (shots.length) {
    const html = `<!doctype html><body style="margin:0;background:#f4f5f8;font:13px system-ui;padding:24px">
      <h1 style="font:700 22px system-ui;margin:0 0 16px">Slice · paparazzi · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}</h1>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px;align-items:start">
      ${shots.map((s) => `<figure style="margin:0;background:#fff;border-radius:10px;padding:8px;box-shadow:0 1px 3px rgba(0,0,0,.08)"><img src="file://${s.file}" style="width:100%;border-radius:6px;display:block"><figcaption style="margin-top:6px;color:#556">${s.name}</figcaption></figure>`).join('')}
      </div></body>`;
    const sheet = path.join(OUT, 'contact-sheet.html');
    fs.writeFileSync(sheet, html);
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await page.goto(`file://${sheet}`);
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, 'contact-sheet.png'), fullPage: true });
  }

  await browser.close();
  server.close();
  console.log(`\n${shots.length} shots → ${path.relative(ROOT, OUT)}/`);
  if (problems.length) {
    console.error(`\n✗ layout problems:\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  console.log('✓ no sideways scrolling on any device');
}

main().catch((e) => { console.error(e); process.exit(1); });
