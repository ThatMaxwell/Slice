// Slice's memory: learns your taste from what you search, never what's personal.
//
// Every query lands in one of three buckets:
//   private   -> never stored, never shown to the AI (health, money, relationships, identity...)
//   discarded -> not useful for taste (greetings, "yo", bare site names, typos)
//   kept      -> stored locally and summarised into a taste profile at startup
const { createStore } = require('./store');

const PRIVATE_PATTERNS = [
  // health & body
  /\b(symptoms?|diagnos\w*|diseases?|cancer|tumou?rs?|std|stis?|hiv|herpes|pregnan\w*|abortion|miscarriage|period late|late period|contracepti\w*|birth control|erectile|viagra|rash(es)?|lumps?|blood tests?|prescriptions?|dosage|overdos\w*|medications?|meds|antidepress\w*|therap(y|ist)|psychiatr\w*|rehab|addict\w*|withdrawals?|infections?|sick|pain in|hurts when|throat|fever)\b/i,
  // mental health & crisis
  /\b(depress\w*|anxiety|panic attacks?|suicid\w*|self[- ]?harm|kill myself|want to die|eating disorders?|anorexi\w*|bulimi\w*|bipolar|adhd|lonely|loneliness)\b/i,
  // sex & dating
  /\b(sex|sexual\w*|porn\w*|nudes?|nsfw|onlyfans|hook ?ups?|fetish\w*|kinks?|dating apps?|tinder|grindr|bumble|cheating|cheated|divorc\w*|break ?up|my ex|my (boy|girl)friend)\b/i,
  // money & legal trouble
  /\b(debts?|bankrupt\w*|loan default|payday loans?|credit score|my salary|my bank|bank account|tax return|lawsuit|sued|arrested|criminal record|lawyer for|custody|eviction|immigration status|visa denied)\b/i,
  // identity & secrets
  /\b(passwords?|passcodes?|social security|ssn|passport number|credit card|cvv|pin code|routing number|iban|seed phrase|private key)\b/i,
  // beliefs & identity
  /\b(am i gay|coming out|gender identity|transitioning|my religion|pray(er)? for)\b/i,
  // raw personal data
  /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/,           // SSN-like
  /\b(?:\d[ -]?){13,19}\b/,                       // card-like numbers
  /[\w.+-]+@[\w-]+\.[\w.]+/,                      // email addresses
  /(?:\+\d{1,3}[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/, // phone numbers
  /\b\d{1,5}\s+\w+\s+(street|st|avenue|ave|road|rd|lane|ln|drive|dr|blvd)\b/i, // street addresses
];

const USELESS = /^(yo+|hey+|hi+|hello+|sup|wassup|ok(ay)?|k|thanks?|thx|ty|lol|lmao|bruh|test|asdf+|\?+|!+|hm+)[!.?\s]*$/i;
const NAV_ONLY = /^(youtube|yt|reddit|google|gmail|github|gh|twitter|x|instagram|insta|ig|tiktok|netflix|spotify|twitch|discord|amazon|facebook|fb|maps|drive|docs|wiki|wikipedia|chatgpt|gpt|claude|gemini|linkedin|outlook|whatsapp)\s*$/i;

const STOP = new Set(('a an the and or but of to in on for with at by from is are was were be been am do does did how what why who when where which can could should would will i me my you your u ur it its this that these those make get best good cool top new vs about into some any more most just like near me please pls tell show find give need want 2024 2025 2026 2027').split(' '));
const SLANG = ['asf', 'fr', 'ngl', 'lol', 'lmao', 'bro', 'bruh', 'yo', 'lowkey', 'highkey', 'tbh', 'idk', 'rn', 'u', 'ur', 'gonna', 'wanna', 'lemme', 'fire', 'goated', 'mid', 'deadass', 'fam', 'bet', 'imo', 'pls', 'thx'];

function classify(q) {
  const text = String(q || '').trim();
  if (!text) return 'discarded';
  if (PRIVATE_PATTERNS.some((re) => re.test(text))) return 'private';
  if (USELESS.test(text) || NAV_ONLY.test(text) || text.length < 3) return 'discarded';
  if (/^https?:\/\//i.test(text) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(text)) return 'discarded';
  return 'kept';
}

function createMemory() {
  const store = createStore('memory', { entries: [], facts: [], style: [], stats: { kept: 0, discarded: 0, private: 0 } });

  return {
    classify,

    record(q) {
      const kind = classify(q);
      const s = store.all;
      s.stats[kind] = (s.stats[kind] || 0) + 1;
      if (kind !== 'private') {
        // style samples: how the user talks (never private text)
        s.style.push(String(q).slice(0, 140));
        if (s.style.length > 120) s.style.splice(0, s.style.length - 120);
      }
      if (kind === 'kept') {
        s.entries.push({ q: String(q).slice(0, 200), t: Date.now() });
        if (s.entries.length > 400) s.entries.splice(0, s.entries.length - 400);
      }
      store.save();
      return kind;
    },

    remember(fact) {
      const f = String(fact || '').trim().slice(0, 240);
      if (!f || classify(f) === 'private') return false;
      const s = store.all;
      if (!s.facts.includes(f)) s.facts.push(f);
      if (s.facts.length > 60) s.facts.shift();
      store.save();
      return true;
    },

    forget(match) {
      const s = store.all;
      const m = String(match || '').toLowerCase();
      const before = s.entries.length + s.facts.length;
      s.entries = s.entries.filter((e) => !e.q.toLowerCase().includes(m));
      s.facts = s.facts.filter((f) => !f.toLowerCase().includes(m));
      store.save();
      return before - (s.entries.length + s.facts.length);
    },

    list() { return store.all; },

    removeEntry(t) {
      const s = store.all;
      s.entries = s.entries.filter((e) => e.t !== t);
      store.save();
    },

    removeFact(f) {
      const s = store.all;
      s.facts = s.facts.filter((x) => x !== f);
      store.save();
    },

    clear() {
      store.replace({ entries: [], facts: [], style: [], stats: { kept: 0, discarded: 0, private: 0 } });
    },

    // Compact taste profile, built once at startup and baked into the cached system prompt.
    profile() {
      const s = store.all;
      const counts = new Map();
      for (const e of s.entries.slice(-250)) {
        for (const w of e.q.toLowerCase().match(/[a-z0-9][a-z0-9+#.-]{1,}/g) || []) {
          if (STOP.has(w) || /^\d+$/.test(w)) continue;
          counts.set(w, (counts.get(w) || 0) + 1);
        }
      }
      const interests = [...counts.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 16).map(([w]) => w);
      const recent = s.entries.slice(-18).map((e) => e.q);

      const samples = s.style.slice(-80);
      let style = '';
      if (samples.length >= 5) {
        const joined = samples.join(' ');
        const letters = joined.replace(/[^a-zA-Z]/g, '');
        const lowerRatio = letters ? (letters.replace(/[^a-z]/g, '').length / letters.length) : 0;
        const words = joined.toLowerCase().split(/\s+/);
        const slang = SLANG.filter((w) => words.includes(w)).slice(0, 8);
        const emoji = (joined.match(/\p{Extended_Pictographic}/gu) || []).length;
        const avg = Math.round(words.length / samples.length);
        const notes = [];
        notes.push(lowerRatio > 0.93 ? 'writes almost entirely in lowercase' : 'uses normal capitalisation');
        if (slang.length) notes.push(`casual slang (${slang.join(', ')})`);
        if (emoji > samples.length / 4) notes.push('likes emoji');
        notes.push(avg <= 5 ? 'short, punchy messages' : avg >= 15 ? 'detailed messages' : 'medium-length messages');
        style = notes.join('; ');
      }
      return { interests, recent, facts: s.facts.slice(-30), style, stats: s.stats };
    },

    flush() { store.flushNow(); },
  };
}

module.exports = { createMemory, classify };
