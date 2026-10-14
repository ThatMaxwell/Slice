// Fast sanity checks: every JS file parses, and the privacy filter / router behave.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const files = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git'].includes(f.name)) continue;
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p);
    else if (p.endsWith('.js')) files.push(p);
  }
})(root);

let failed = 0;
for (const f of files) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
  catch (e) { failed++; console.error(`✗ ${path.relative(root, f)}\n${e.stderr}`); }
}
console.log(`syntax: ${files.length - failed}/${files.length} files OK`);

// memory privacy filter (stub electron so the module loads under plain node)
const Module = require('module');
const load = Module._load;
Module._load = function (req, ...rest) { return req === 'electron' ? { app: { getPath: () => root } } : load.call(this, req, ...rest); };
const { classify } = require('../src/main/memory');
const cases = {
  'symptoms of strep throat': 'private', 'my password reset': 'private', 'i feel lonely': 'private', 'call me at 555-123-4567': 'private',
  'cool esp32 projects': 'kept', 'best synthwave albums 2026': 'kept', '2024 vs 2025 macbook': 'kept',
  yo: 'discarded', reddit: 'discarded', 'hey!': 'discarded',
};
for (const [q, want] of Object.entries(cases)) {
  const got = classify(q);
  if (got !== want) { failed++; console.error(`✗ classify("${q}") = ${got}, want ${want}`); }
}
console.log(`memory filter: ${Object.keys(cases).length} cases checked`);
process.exit(failed ? 1 : 0);
