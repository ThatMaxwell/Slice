// Tiny JSON stores in the user data folder. Writes are debounced and atomic.
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function createStore(name, defaults) {
  const file = path.join(app.getPath('userData'), `${name}.json`);
  let data;
  try {
    data = { ...structuredClone(defaults), ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch {
    data = structuredClone(defaults);
  }
  let timer = null;
  const flush = () => {
    timer = null;
    const tmp = file + '.tmp';
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file);
  };
  return {
    file,
    get all() { return data; },
    get(key) { return data[key]; },
    set(key, value) { data[key] = value; this.save(); },
    patch(obj) { Object.assign(data, obj); this.save(); },
    replace(obj) { data = obj; this.save(); },
    save() { if (!timer) timer = setTimeout(flush, 150); },
    flushNow() { if (timer) { clearTimeout(timer); flush(); } },
  };
}

module.exports = { createStore };
