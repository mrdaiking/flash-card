/* ── Theme (Light / Dark / System) ── */
const THEME_KEY = 'fc_theme';
const THEME_COLORS = { light: '#F6F4F0', dark: '#121110' }; // status bar = page ground

function getThemePref() {
  return localStorage.getItem(THEME_KEY) || 'system';
}

function resolvedTheme(pref = getThemePref()) {
  if (pref === 'dark' || pref === 'light') return pref;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme() {
  const isDark = resolvedTheme() === 'dark';
  document.documentElement.classList.toggle('dark', isDark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = isDark ? THEME_COLORS.dark : THEME_COLORS.light;
}

function setTheme(pref) {
  localStorage.setItem(THEME_KEY, pref);
  applyTheme();
  updateThemeButtons();
}

function updateThemeButtons() {
  const pref = getThemePref();
  document.querySelectorAll('.theme-btn').forEach(btn => {
    const active = btn.dataset.theme === pref;
    btn.classList.toggle('bg-surface', active);
    btn.classList.toggle('text-ink', active);
    btn.classList.toggle('shadow-sm', active);
    btn.classList.toggle('text-muted', !active);
    btn.setAttribute('aria-checked', active);
  });
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (getThemePref() === 'system') applyTheme();
});

applyTheme();

/* ── Markdown helper ── */
// breaks:true so a single Enter is a line break (marked's default needs a blank line).
// Obsidian-style ==highlight== → <mark>.
if (typeof marked !== 'undefined' && marked.use) {
  marked.use({ extensions: [{
    // LaTeX: $...$ inline, $$...$$ display (KaTeX). One inline extension handles both so marked
    // never sees the _ / \ inside the formula. "$5 and $6" is left alone (no space after the
    // opening $ or before the closing one, closing $ not followed by a digit).
    name: 'math',
    level: 'inline',
    start: src => src.search(/\$|\\[(\[]/),
    tokenizer(src) {
      // also \(...\) inline and \[...\] display (what ChatGPT-style answers emit)
      let m = /^\\\[([\s\S]+?)\\\]/.exec(src), display = !!m;
      if (!m) m = /^\\\(([\s\S]+?)\\\)/.exec(src);
      if (!m) { m = /^\$\$([\s\S]+?)\$\$/.exec(src); display = !!m; }
      if (!m) m = /^\$(?=\S)((?:\\\$|[^$\n])*?\S)\$(?!\d)/.exec(src);
      if (m) return { type: 'math', raw: m[0], tex: m[1].trim(), display };
    },
    renderer(t) {
      if (typeof katex === 'undefined') return escHtml(t.raw);
      return katex.renderToString(t.tex, { displayMode: t.display, throwOnError: false });
    },
  }, {
    name: 'highlight',
    level: 'inline',
    start: src => src.indexOf('=='),
    tokenizer(src) {
      const m = /^==(?=\S)([\s\S]*?\S)==/.exec(src);
      if (m) return { type: 'highlight', raw: m[0], tokens: this.lexer.inlineTokens(m[1]) };
    },
    renderer(token) { return `<mark>${this.parser.parseInline(token.tokens)}</mark>`; },
  }, {
    // Furigana → <ruby>. Two spellings:
    //   Anki:     漢字[かんじ]      (base = the kanji run right before the brackets)
    //   Obsidian: {漢字|かんじ}  or  {漢字|かん|じ}  (one reading per character)
    name: 'ruby',
    level: 'inline',
    start(src) {
      const i = [src.search(RUBY_ANKI), src.search(RUBY_CURLY)].filter(n => n >= 0);
      return i.length ? Math.min(...i) : undefined;
    },
    tokenizer(src) {
      let m = new RegExp('^' + RUBY_ANKI.source, 'u').exec(src);
      if (m) return { type: 'ruby', raw: m[0], pairs: [[m[1], m[2]]] };
      m = new RegExp('^' + RUBY_CURLY.source, 'u').exec(src);
      if (!m) return;
      const base = [...m[1]], readings = m[2].split('|');
      const pairs = readings.length > 1 && readings.length === base.length
        ? base.map((ch, i) => [ch, readings[i]])
        : [[m[1], readings.join('')]];
      return { type: 'ruby', raw: m[0], pairs };
    },
    renderer(token) {
      return `<ruby>${token.pairs.map(([b, r]) => `${escHtml(b)}<rp>(</rp><rt>${escHtml(r)}</rt><rp>)</rp>`).join('')}</ruby>`;
    },
  }] });
}
// Anki-style furigana: a run of kanji directly followed by [reading], not a [link](url).
const RUBY_ANKI = /([\p{Script=Han}々〆ヶ]+)\[([^\]\n]+)\](?!\()/u;
const RUBY_CURLY = /\{([^{}|\n]*[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}][^{}|\n]*)\|([^{}\n]+)\}/u;
const md = text => {
  if (!text) return '';
  // Anki separates a furigana word from preceding Japanese with a space ("この 本[ほん]"); drop that space.
  text = text.replace(new RegExp('(?<=[^\\x00-\\x7F]) (?=' + RUBY_ANKI.source + ')', 'gu'), '');
  if (typeof marked === 'function') return marked(text, { breaks: true });
  if (marked && marked.parse) return marked.parse(text, { breaks: true });
  return escHtml(text);
};

/* ── Card images: compress client-side, embed as base64 markdown ── */
function compressImageToDataUrl(file, maxDim = 1000, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function insertAtCursor(textarea, text) {
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  textarea.value = textarea.value.slice(0, start) + text + textarea.value.slice(end);
  textarea.selectionStart = textarea.selectionEnd = start + text.length;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

let imageUploadTargetId = null;
function pickImageFor(textareaId) {
  imageUploadTargetId = textareaId;
  document.getElementById('image-picker').click();
}

const IMAGE_URL_RE = /^(https?:|data:image\/)\S*\.(png|jpe?g|gif|webp|svg)(\?\S*)?$/i;

// Lets a copied screenshot/image or an image URL be pasted straight into a
// card field — anything else pastes through unchanged.
function wirePasteImage(textarea) {
  textarea.addEventListener('paste', async e => {
    const imageItem = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
    if (imageItem) {
      e.preventDefault();
      const dataUrl = await compressImageToDataUrl(imageItem.getAsFile());
      insertAtCursor(textarea, `\n![](${dataUrl})\n`);
      return;
    }
    const text = e.clipboardData?.getData('text/plain')?.trim();
    if (text && IMAGE_URL_RE.test(text)) {
      e.preventDefault();
      insertAtCursor(textarea, `![](${text})`);
    }
  });
}

/* ── Text-to-Speech ── */
const speakerOnSVG = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5L6 9H2v6h4l5 4V5z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/></svg>`;

let ttsEnabled = localStorage.getItem('fc_tts') !== 'false'; // default ON

const TTS_MODES = ['both', 'front', 'back']; // cycle order
let ttsMode = TTS_MODES.includes(localStorage.getItem('fc_tts_mode')) ? localStorage.getItem('fc_tts_mode') : 'both';

function cycleTTSMode() {
  const i = TTS_MODES.indexOf(ttsMode);
  ttsMode = TTS_MODES[(i + 1) % TTS_MODES.length];
  localStorage.setItem('fc_tts_mode', ttsMode);
  updateTTSModeButton();
}

const TTS_MODE_LABELS = { both: 'Question + answer', front: 'Question only', back: 'Answer only' };
function updateTTSModeButton() {
  const el = document.getElementById('menu-tts-mode');
  if (el) el.textContent = TTS_MODE_LABELS[ttsMode];
}

function stripHtml(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  // Furigana readings would otherwise be read aloud / previewed twice ("漢字かんじ").
  tmp.querySelectorAll('rt, rp').forEach(el => el.remove());
  return tmp.textContent || tmp.innerText || '';
}

// Splits a markdown field into a real thumbnail (if it has an image) plus a
// clean text preview, for compact list rows that need to show both instead
// of leaking raw "![](...)" syntax as text (a pasted image is a data URL
// thousands of characters long).
function previewParts(source) {
  if (!source) return { imageUrl: null, text: '' };
  const m = source.match(/!\[[^\]]*\]\(([^)]+)\)/);
  const withoutImg = source.replace(/!\[[^\]]*\]\([^)]+\)/g, '');
  return { imageUrl: m ? m[1] : null, text: stripHtml(md(withoutImg)).trim() };
}

// Per-deck card template: field labels, the cards' language (also the
// read-aloud voice), read-aloud on/off, and card font.
// Presets only pre-fill the template form; the deck stores the resulting values.
const TTS_LANGS = [['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['ja-JP', '日本語'], ['vi-VN', 'Tiếng Việt'],
  ['zh-CN', '中文'], ['ko-KR', '한국어'], ['fr-FR', 'Français'], ['de-DE', 'Deutsch'], ['es-ES', 'Español']];
const DECK_PRESETS = {
  blank:      { name: 'Blank',      front_label: 'Front',   back_label: 'Back',        example_label: 'Example',            tts_lang: 'en-US' },
  english:    { name: 'English',    front_label: 'Word',    back_label: 'Meaning',     example_label: 'Example sentence',   tts_lang: 'en-US' },
  tech:       { name: 'Tech',       front_label: 'Concept', back_label: 'Explanation', example_label: 'Code / use case',    tts_lang: 'en-US', read_aloud: false },
  philosophy: { name: 'Philosophy', front_label: 'Term',    back_label: 'Definition',  example_label: 'Quote / thinker',    tts_lang: 'en-US' },
  japanese:   { name: 'Japanese',   front_label: 'Question', back_label: 'Answer',     example_label: 'Rule / reason',      tts_lang: 'ja-JP' },
};
const DEFAULT_DECK = DECK_PRESETS.blank;
const deckById = {}; // filled by api() whenever /api/decks is fetched
const deckInfo = id => deckById[id] || DEFAULT_DECK;
const presetOptions = () => Object.entries(DECK_PRESETS).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('');
const langOptions = sel => TTS_LANGS.map(([v, l]) => `<option value="${v}"${v === sel ? ' selected' : ''}>${l}</option>`).join('');
// Small field caption on study cards, only once a deck's labels were customised.
const fieldLabel = (text, def) => text && text !== def
  ? `<p class="text-[11px] font-semibold uppercase text-muted mb-2">${escHtml(text)}</p>` : '';

// Language + font for card text, from the deck's template. The language comes
// from its read-aloud setting ('ja-JP' → lang="ja") so the phone draws Japanese
// kanji shapes (not Chinese ones) and picks the Japanese font. font 'serif' =
// Mincho, for seeing kanji stroke detail.
function cardText(info) {
  const l = info?.tts_lang ? info.tts_lang.split('-')[0] : '';
  return { attr: l ? ` lang="${l}"` : '', cls: info?.font === 'serif' ? ' card-serif' : '' };
}

// Voice for a deck, or 'off' when its read-aloud setting is off.
const speechLang = info => (info?.read_aloud === 0 ? 'off' : info?.tts_lang || 'en-US');

function speak(text, lang = 'en-US') {
  if (!ttsEnabled || lang === 'off' || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(stripHtml(md(text)));
  utt.lang = lang;
  utt.rate = 0.95;
  window.speechSynthesis.speak(utt);
}

function toggleTTS() {
  ttsEnabled = !ttsEnabled;
  localStorage.setItem('fc_tts', ttsEnabled);
  if (!ttsEnabled) window.speechSynthesis?.cancel();
  updateTTSButton();
}

function updateTTSButton() {
  const el = document.getElementById('menu-tts');
  if (el) el.textContent = ttsEnabled ? 'On' : 'Off';
}

/* ── Auth ── */
const TOKEN_KEY = 'fc_token';
let token = localStorage.getItem(TOKEN_KEY);

function showAuth() {
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('bottom-nav').classList.add('hidden');
}
function hideAuth() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('bottom-nav').classList.remove('hidden');
}
function logout() {
  localStorage.removeItem(TOKEN_KEY);
  token = null;
  showAuth();
}

document.getElementById('pin-submit').addEventListener('click', async () => {
  const pin = document.getElementById('pin-input').value;
  const errEl = document.getElementById('pin-error');
  errEl.classList.add('hidden');
  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    if (res.ok) {
      const data = await res.json();
      token = data.token;
      localStorage.setItem(TOKEN_KEY, token);
      hideAuth();
      router();
    } else {
      errEl.classList.remove('hidden');
      document.getElementById('pin-input').value = '';
    }
  } catch {
    errEl.textContent = 'Connection error. Try again.';
    errEl.classList.remove('hidden');
  }
});
document.getElementById('pin-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('pin-submit').click();
});

/* ── API helper ── */
// Network banner: 'ok' | 'slow' | 'offline'. The SW reports reachability
// (it knows when it fell back to cache); api() flags slow responses.
let netState = 'ok';
function setNet(state) {
  if (state === netState) return;
  const was = netState;
  netState = state;
  const el = document.getElementById('net-banner');
  clearTimeout(setNet.t);
  const ui = {
    offline: ['Offline — showing saved data. Reviews sync when you\u2019re back.', 'bg-rate-again'],
    slow: ['Slow connection — still trying\u2026', 'bg-rate-hard'],
    ok: ['Back online \u2713', 'bg-rate-easy'],
  }[state];
  el.className = el.className.replace(/\bbg-rate-\w+/g, '').replace('hidden', '').trim() + ' ' + ui[1];
  el.textContent = ui[0];
  if (state === 'ok') {
    if (was === 'slow') { el.classList.add('hidden'); return; }
    setNet.t = setTimeout(() => el.classList.add('hidden'), 2500);
  }
}
window.addEventListener('offline', () => setNet('offline'));
window.addEventListener('online', () => setNet('ok'));
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data && 'net' in e.data) setNet(e.data.net ? 'ok' : 'offline');
  });
}
window.addEventListener('load', () => { if (!navigator.onLine) setNet('offline'); });

async function api(path, opts = {}) {
  const slowTimer = setTimeout(() => { if (netState === 'ok') setNet('slow'); }, 4000);
  try {
    const data = await apiFetch(path, opts);
    if (path === '/api/decks' && Array.isArray(data)) data.forEach(d => { deckById[d.id] = d; });
    return data;
  } finally {
    clearTimeout(slowTimer);
    if (netState === 'slow') setNet('ok');
  }
}
async function apiFetch(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
  if (res.status === 401) { logout(); return null; }
  if (res.status === 204) return null;
  return res.json();
}

/* ── Router ── */
function navigate(hash) { window.location.hash = hash; }

function setActiveNav(route) {
  document.querySelectorAll('.nav-item').forEach(btn => {
    const isActive = btn.dataset.route === route;
    btn.classList.toggle('text-accent', isActive);
    btn.classList.toggle('text-muted', !isActive);
  });
}

function router() {
  if (!token) { showAuth(); return; }
  const hash = window.location.hash || '#/';
  const app = document.getElementById('app');
  if (!hash.startsWith('#/study/')) commitPendingRate();
  let m;

  // Study is a full-screen, one-handed flow with its own back button —
  // the bottom nav would only eat into the vertical space we need for
  // the pinned rating bar, so it's hidden for that route only.
  document.getElementById('bottom-nav').classList.toggle('hidden', hash.startsWith('#/study/'));

  if (hash === '#/' || hash === '') {
    setActiveNav('');
    renderHome(app);
  } else if ((m = hash.match(/^#\/decks\/(\d+)$/))) {
    setActiveNav('');
    renderDeckDetail(app, m[1]);
  } else if ((m = hash.match(/^#\/decks\/(\d+)\/import$/))) {
    setActiveNav('');
    renderImport(app, m[1]);
  } else if ((m = hash.match(/^#\/study\/([\w]+)/))) {
    const params = new URLSearchParams(hash.split('?')[1] || '');
    renderStudy(app, m[1], params.get('favorites') === '1', params.get('start'));
  } else if ((m = hash.match(/^#\/cards\/new/))) {
    setActiveNav('');
    const params = new URLSearchParams(hash.split('?')[1] || '');
    renderEditCard(app, null, params.get('deck'));
  } else if ((m = hash.match(/^#\/cards\/(\d+)\/edit/))) {
    setActiveNav('');
    const params = new URLSearchParams(hash.split('?')[1] || '');
    renderEditCard(app, m[1], params.get('deck'), params.get('ret'));
  } else if (hash === '#/recap') {
    setActiveNav('stats');
    renderRecap(app);
  } else if (hash === '#/stats') {
    setActiveNav('stats');
    renderStats(app);
  } else if (hash === '#/settings') {
    setActiveNav('settings');
    renderSettings(app);
  } else {
    navigate('#/');
  }
}

window.addEventListener('hashchange', router);

// Pull-to-refresh: installed iOS PWAs have no browser reload. Only on list-style
// screens — study uses taps/swipes and the edit forms hold unsaved text.
const PTR_ROUTES = /^(#\/|#\/decks\/\d+|#\/stats|#\/recap|#\/settings)?$/;
(function initPullToRefresh() {
  const THRESHOLD = 70;
  let startY = null, pull = 0, busy = false;
  const ind = document.createElement('div');
  ind.setAttribute('aria-hidden', 'true');
  ind.className = 'fixed left-1/2 z-50 pointer-events-none text-muted text-xl';
  ind.style.cssText = 'top:calc(env(safe-area-inset-top) + 8px);opacity:0;transform:translate(-50%,-40px)';
  ind.textContent = '↓';
  document.body.appendChild(ind);

  const show = (y, spin) => {
    ind.style.transition = spin ? 'none' : '';
    ind.style.opacity = Math.min(y / THRESHOLD, 1);
    ind.style.transform = `translate(-50%, ${y - 40}px) rotate(${y >= THRESHOLD ? 180 : 0}deg)`;
  };
  const hide = () => {
    ind.style.transition = 'opacity .2s, transform .2s';
    ind.style.opacity = 0;
    ind.style.transform = 'translate(-50%,-40px)';
  };

  document.addEventListener('touchstart', e => {
    const open = document.querySelector('.fixed.inset-0:not(.hidden)');
    startY = (!busy && !open && window.scrollY <= 0 && e.touches.length === 1 &&
      PTR_ROUTES.test(window.location.hash)) ? e.touches[0].clientY : null;
    pull = 0;
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (startY === null) return;
    const dy = e.touches[0].clientY - startY;
    if (dy <= 0 || window.scrollY > 0) { startY = null; hide(); return; }
    pull = Math.min(dy * 0.5, THRESHOLD * 1.4);
    show(pull, true);
  }, { passive: true });

  document.addEventListener('touchend', async () => {
    if (startY === null) return;
    startY = null;
    if (pull < THRESHOLD) { hide(); return; }
    busy = true;
    ind.textContent = '⟳';
    ind.style.transition = 'transform .2s';
    ind.style.transform = 'translate(-50%, 16px)';
    // Flush offline-queued reviews first so fresh counts include them.
    try { (await navigator.serviceWorker?.ready)?.active?.postMessage('replay-reviews'); } catch {}
    router();
    setTimeout(() => { hide(); ind.textContent = '↓'; busy = false; }, 600);
  });
})();
window.addEventListener('load', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(console.error);
    // iOS has no Background Sync: ask the SW to send offline-queued reviews
    // whenever there's a chance we're back online.
    const flushReviews = () => navigator.serviceWorker.ready.then(r => r.active?.postMessage('replay-reviews'));
    flushReviews();
    window.addEventListener('online', flushReviews);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') flushReviews(); });
  }
  if (token) { hideAuth(); router(); } else { showAuth(); }
});

/* ── Utilities ── */
// Deck subtitle on Today: when it was last reviewed (unix seconds).
function lastStudied(sec, total) {
  if (!total) return 'No cards yet';
  if (!sec) return 'Not studied yet';
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(sec * 1000).setHours(0, 0, 0, 0)) / 86400000);
  if (days <= 0) return 'Studied today';
  if (days === 1) return 'Studied yesterday';
  return days >= 21 ? `Quiet for ${days} days` : `${days} days ago`;
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Generic animated show/hide for the app's bottom-sheet/centered modals
// (new-deck-modal, deck-menu, rename-modal). The slide/fade
// itself is pure CSS (index.html), gated behind prefers-reduced-motion;
// these just sequence the class toggles so the transition has something
// to animate from.
function showModal(id) {
  const el = document.getElementById(id);
  el.classList.remove('hidden');
  el.offsetHeight; // force reflow so the transition below isn't skipped
  el.classList.add('modal-open');
}
function hideModalEl(id) {
  const el = document.getElementById(id);
  el.classList.remove('modal-open');
  setTimeout(() => el.classList.add('hidden'), 200);
}
/* ── Shared UI: iOS-style sheets, confirm sheet, toast ── */
const ICON = {
  chevronLeft: '<svg class="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  chevronRight: '<svg class="w-5 h-5 text-muted/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  plus: '<svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  more: '<svg class="w-6 h-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
};

// Bottom sheet with an iOS header: Cancel · Title · Save. `body` is markup.
function sheetHTML(id, title, body, { cancel, save, saveLabel = 'Save', saveId = '' }) {
  return `
    <div id="${id}" class="sheet hidden fixed inset-0 z-50 bg-black/40 flex items-end justify-center" onclick="if (event.target === this) ${cancel}">
      <div class="w-full max-w-md bg-paper rounded-t-[14px]" style="padding-bottom: calc(env(safe-area-inset-bottom) + 12px)">
        <div class="mx-auto mt-2 w-9 h-[5px] rounded-full bg-line"></div>
        <div class="flex items-center justify-between px-2 h-12">
          <button onclick="${cancel}" class="h-11 px-2 text-[17px] text-accent active:opacity-60">Cancel</button>
          <span class="text-[17px] font-semibold text-ink">${title}</span>
          <button ${saveId ? `id="${saveId}"` : ''} onclick="${save}" class="h-11 px-2 text-[17px] font-semibold text-accent active:opacity-60 disabled:opacity-40">${saveLabel}</button>
        </div>
        <div class="px-4 pt-1">${body}</div>
      </div>
    </div>`;
}

// Grouped-list text field used inside sheets and forms.
// Card text boxes grow with their content (up to ~half the screen, then scroll inside)
// so a long note isn't hidden behind a 3-line box. Opt in with data-grow.
const autoGrow = ta => {
  if (!ta || ta.offsetParent === null) return;
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight + 2, window.innerHeight * 0.55) + 'px';
};
document.addEventListener('input', e => { if (e.target.matches?.('textarea[data-grow]')) autoGrow(e.target); });
const fieldCls = 'w-full bg-surface rounded-[10px] px-4 text-[17px] text-ink placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-accent/40';

// Replaces window.confirm: resolves true when the action is chosen.
function confirmSheet({ title, message = '', confirm = 'Delete', destructive = true }) {
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.className = 'fixed inset-0 z-[70] bg-black/40 flex items-end';
    el.innerHTML = `
      <div class="w-full max-w-md mx-auto px-2" style="padding-bottom: calc(env(safe-area-inset-bottom) + 8px)">
        <div class="bg-surface rounded-[14px] overflow-hidden text-center">
          <div class="px-4 pt-4 pb-3 border-b border-line">
            <p class="text-[13px] font-semibold text-muted">${escHtml(title)}</p>
            ${message ? `<p class="mt-1 text-[13px] text-muted">${escHtml(message)}</p>` : ''}
          </div>
          <button data-ok class="w-full h-14 text-[20px] ${destructive ? 'text-rate-again' : 'text-accent'} active:bg-base">${escHtml(confirm)}</button>
        </div>
        <button data-cancel class="mt-2 w-full h-14 rounded-[14px] bg-surface text-[20px] font-semibold text-accent active:bg-base">Cancel</button>
      </div>`;
    const done = ok => { el.remove(); resolve(ok); };
    el.addEventListener('click', e => {
      if (e.target.closest('[data-ok]')) done(true);
      else if (e.target === el || e.target.closest('[data-cancel]')) done(false);
    });
    document.body.appendChild(el);
  });
}

// Replaces window.alert for short notices.
function showToast(text) {
  document.getElementById('app-toast')?.remove();
  const el = document.createElement('div');
  el.id = 'app-toast';
  el.setAttribute('role', 'status');
  el.className = 'fixed left-4 right-4 z-[80] max-w-md mx-auto bg-ink text-paper text-[15px] rounded-xl px-4 py-3 shadow-lg';
  el.style.bottom = 'calc(env(safe-area-inset-bottom) + 72px)';
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

// Section label above a grouped list.
const groupLabel = text => `<p class="mt-7 mb-1.5 px-4 text-[13px] text-muted uppercase">${text}</p>`;

function loading(app) {
  app.innerHTML = `<div class="p-4 pt-6 space-y-3 animate-pulse">
    <div class="h-8 bg-surface rounded w-1/3"></div>
    <div class="h-20 bg-surface rounded"></div>
    <div class="h-20 bg-surface rounded"></div>
    <div class="h-20 bg-surface rounded"></div>
  </div>`;
}

/* ════════════════════════════════════════
   Screen: Home
════════════════════════════════════════ */
async function renderHome(app) {
  loading(app);
  const [decks, stats] = await Promise.all([api('/api/decks'), api('/api/stats')]);
  if (!decks) return;

  const totalDue = decks.reduce((s, d) => s + (d.due_count || 0), 0);
  const totalNew = decks.reduce((s, d) => s + (d.new_due || 0), 0);
  // Home-screen icon badge; needs notification permission on iOS. ponytail: only refreshed on Home render/push.
  (totalDue ? navigator.setAppBadge?.(totalDue) : navigator.clearAppBadge?.())?.catch(() => {});
  const minutes = Math.max(1, Math.round((totalDue * (stats?.sec_per_card || 10)) / 60));
  const streak = stats?.streak_days || 0;
  const dateLine = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  const meta = (icon, text) => `<span class="flex items-center gap-1.5">${icon}${text}</span>`;
  const clockIcon = '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
  const pulseIcon = '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>';
  const newDot = '<span class="w-2 h-2 rounded-full bg-rate-good" aria-hidden="true"></span>';

  app.innerHTML = `
    <div class="px-4 pt-6 pb-8">
      <div class="flex items-center justify-between">
        <p class="px-1 text-[15px] text-muted">${dateLine}</p>
        <!-- New deck lives at the top (iOS nav-bar spot), not under the deck list -->
        <button onclick="showNewDeckModal()" aria-label="New deck" class="w-11 h-11 -mr-2 flex items-center justify-center text-accent active:opacity-60">${ICON.plus}</button>
      </div>
      <h1 class="px-1 text-[34px] leading-[41px] font-bold text-ink font-heading">Today</h1>

      <section class="mt-4 bg-surface rounded-[14px] p-[18px] flex flex-col gap-3.5">
        ${totalDue > 0 ? `
          <div class="flex items-baseline gap-2">
            <span class="text-[44px] leading-[48px] font-bold text-ink">${totalDue}</span>
            <span class="text-[17px] text-ink/80">card${totalDue === 1 ? '' : 's'} to review</span>
          </div>
          <div class="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted">
            ${meta(clockIcon, `about ${minutes} min`)}
            ${streak ? meta(pulseIcon, `${streak}-day streak`) : ''}
            ${totalNew ? meta(newDot, `${totalNew} new`) : ''}
          </div>
          <button onclick="navigate('#/study/all')"
            class="h-[50px] rounded-xl bg-accent text-on-accent text-[17px] font-semibold active:opacity-80 transition-opacity">Start review</button>
        ` : `
          <div>
            <p class="text-[22px] leading-7 font-bold text-ink">All done for today</p>
            <p class="mt-1 text-[15px] text-muted">${streak ? `${streak}-day streak. ` : ''}Cards come back when they’re due.</p>
          </div>
        `}
      </section>

      ${decks.length === 0 ? `
        <section class="mt-8 px-1">
          <p class="text-[17px] text-ink font-semibold">No decks yet</p>
          <p class="mt-1 text-[15px] text-muted">Tap + at the top to make a deck. Add a few cards and they’ll show up here when it’s time to review.</p>
        </section>` : `
        <div class="mt-8 mb-2 px-4 flex items-baseline justify-between text-[13px]">
          <span class="text-muted uppercase">Decks</span>
          <span class="flex gap-3"><span class="text-rate-good">New</span><span class="text-rate-hard">Relearn</span><span class="text-rate-easy">Due</span></span>
        </div>
        <section class="bg-surface rounded-[14px] overflow-hidden">
          ${decks.map((d, i) => {
            const newDue = d.new_due || 0, relearn = d.relearn_due || 0;
            const review = Math.max(0, (d.due_count || 0) - newDue - relearn);
            const count = (n, cls) => `<span class="w-7 text-right ${n ? cls : 'text-muted/40'}">${n}</span>`;
            return `
            <button onclick="navigate('#/decks/${d.id}')" class="w-full flex items-center pl-4 text-left active:bg-base transition-colors">
              <span class="flex-1 min-w-0 flex items-center min-h-[60px] pr-3 ${i < decks.length - 1 ? 'border-b border-line' : ''}">
                <span class="flex-1 min-w-0">
                  <span class="block text-[17px] leading-[22px] text-ink truncate">${escHtml(d.name)}</span>
                  <span class="block text-[13px] leading-[18px] text-muted">${lastStudied(d.last_reviewed, d.total_count)}</span>
                </span>
                <span class="flex gap-2 text-[15px] font-semibold">${count(newDue, 'text-rate-good')}${count(relearn, 'text-rate-hard')}${count(review, 'text-rate-easy')}</span>
                <svg class="w-5 h-5 ml-1.5 text-muted/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
              </span>
            </button>`;
          }).join('')}
        </section>`}

    </div>

    ${sheetHTML('new-deck-modal', 'New Deck', `
      <input id="new-deck-name" type="text" placeholder="Deck name" class="${fieldCls} h-12"/>
      <label for="new-deck-preset" class="block mt-5 mb-1.5 px-4 text-[13px] text-muted uppercase">Template</label>
      <select id="new-deck-preset" onchange="document.getElementById('new-deck-lang').value = (DECK_PRESETS[this.value] || DEFAULT_DECK).tts_lang"
        class="${fieldCls} h-12 appearance-none">${presetOptions()}</select>
      <label for="new-deck-lang" class="block mt-5 mb-1.5 px-4 text-[13px] text-muted uppercase">Card language</label>
      <select id="new-deck-lang" class="${fieldCls} h-12 appearance-none">${langOptions(DEFAULT_DECK.tts_lang)}</select>
      <p class="mt-1.5 px-4 text-[13px] text-muted">Picks the voice, the font and Japanese kanji shapes. Change it any time in the deck's ⋯ → Language and font.</p>
    `, { cancel: 'hideNewDeckModal()', save: 'createDeck()', saveLabel: 'Create' })}
  `;
}

function showNewDeckModal() {
  showModal('new-deck-modal');
  setTimeout(() => document.getElementById('new-deck-name').focus(), 80);
}
function hideNewDeckModal(e) {
  if (!e || e.target === document.getElementById('new-deck-modal')) hideModalEl('new-deck-modal');
}
async function createDeck() {
  const name = document.getElementById('new-deck-name').value.trim();
  if (!name) return;
  const { name: _n, ...template } = DECK_PRESETS[document.getElementById('new-deck-preset').value] || DEFAULT_DECK;
  template.tts_lang = document.getElementById('new-deck-lang').value;
  await api('/api/decks', { method: 'POST', body: JSON.stringify({ name, ...template }) });
  hideNewDeckModal();
  renderHome(document.getElementById('app'));
}

/* ════════════════════════════════════════
   Screen: Deck Detail
════════════════════════════════════════ */
async function renderDeckDetail(app, deckId) {
  loading(app);
  const [decks, cards] = await Promise.all([api('/api/decks'), api(`/api/decks/${deckId}/cards`)]);
  if (!decks || !cards) return;

  const deck = decks.find(d => d.id == deckId);
  if (!deck) { navigate('#/'); return; }

  const dueCount = cards.filter(c => c.next_review <= Date.now()).length;
  const favoriteCount = cards.filter(c => c.is_favorite).length;
  const typeList = typeDatalist('type-list', cards);
  const ct = cardText(deck);
  const menuRow = (onclick, label, cls = 'text-ink', last = false) => `
    <div class="pl-4"><button onclick="${onclick}" class="w-full min-h-[52px] pr-4 flex items-center text-left text-[17px] ${cls} ${last ? '' : 'border-b border-line'} active:opacity-60">${label}</button></div>`;

  app.innerHTML = `
    <div class="px-4 pt-1 pb-44">
      <button onclick="navigate('#/')" class="h-11 -ml-2 pr-2 flex items-center text-[17px] text-accent active:opacity-60">${ICON.chevronLeft}Today</button>
      <h1 class="px-1 text-[34px] leading-[41px] font-bold text-ink font-heading break-words">${escHtml(deck.name)}</h1>
      <p class="px-1 mt-1 text-[15px] text-muted">${cards.length} card${cards.length === 1 ? '' : 's'}${dueCount ? ` · ${dueCount} due` : ''}</p>

      <section id="study-fav-btn" class="${favoriteCount ? '' : 'hidden'} mt-6 bg-surface rounded-[14px] overflow-hidden">
        <button onclick="navigate('#/study/${deckId}?favorites=1')" class="w-full min-h-[52px] px-4 flex items-center gap-3 text-left active:bg-base">
          <span class="text-rate-hard">${starSVG(true)}</span>
          <span class="flex-1 text-[17px] text-ink">Study favorites</span>
          <span id="study-fav-count" class="text-[17px] text-muted">${favoriteCount}</span>${ICON.chevronRight}
        </button>
      </section>

      ${cards.length === 0 ? `
        <div class="mt-10 px-1">
          <p class="text-[17px] font-semibold text-ink">No cards yet</p>
          <p class="mt-1 text-[15px] text-muted">Tap + to add one, or import a list from the ⋯ menu.</p>
        </div>` : `
        ${groupLabel('Cards')}
        <section class="bg-surface rounded-[14px] overflow-hidden">
          ${cards.map((c, i) => {
            const front = previewParts(c.front);
            const back = previewParts(c.back);
            const thumb = front.imageUrl || back.imageUrl;
            return `
            <div class="pl-4"><div class="flex items-center min-h-[60px] ${i < cards.length - 1 ? 'border-b border-line' : ''}">
              <button onclick="navigate('#/cards/${c.id}/edit?deck=${deckId}')" class="flex-1 min-w-0 flex items-center gap-3 py-2 text-left active:opacity-60">
                ${thumb ? `<img src="${escHtml(thumb)}" alt="" loading="lazy" class="w-10 h-10 rounded-lg object-cover flex-shrink-0">` : ''}
                <span class="min-w-0"${ct.attr}>
                  <span class="block truncate text-[17px] leading-[22px] text-ink">${escHtml(front.text || (front.imageUrl ? 'Image' : ''))}</span>
                  <span class="block truncate text-[15px] leading-5 text-muted">${escHtml(back.text || (back.imageUrl ? 'Image' : ''))}</span>
                </span>
              </button>
              <button id="fav-btn-${c.id}" data-fav="${c.is_favorite ? '1' : '0'}" onclick="toggleFavoriteInList(${c.id}, 'fav-btn-${c.id}')"
                aria-label="${c.is_favorite ? 'Remove from favorites' : 'Add to favorites'}"
                class="w-11 h-11 mr-1 flex-shrink-0 flex items-center justify-center ${c.is_favorite ? 'text-rate-hard' : 'text-muted/50'}">${starSVG(c.is_favorite)}</button>
            </div></div>`;
          }).join('')}
        </section>`}
    </div>

    <!-- Thumb bar: sits just above #bottom-nav (49px + 1px border + safe area) -->
    <div class="fixed left-0 right-0 z-30 px-4 pt-2 pb-3 bg-paper/95 backdrop-blur border-t border-line flex gap-2"
      style="bottom: calc(50px + env(safe-area-inset-bottom))">
      <button onclick="${dueCount > 0 ? `navigate('#/study/${deckId}')` : 'void(0)'}" ${dueCount ? '' : 'aria-disabled="true"'}
        class="flex-1 h-[52px] rounded-[14px] text-[17px] font-semibold ${dueCount > 0 ? 'bg-accent text-on-accent active:opacity-80' : 'bg-base text-muted'}">
        ${dueCount > 0 ? `Study ${dueCount}` : 'Nothing due'}
      </button>
      <button onclick="showQuickAdd()" aria-label="Add card" class="w-[52px] h-[52px] rounded-[14px] bg-base text-ink flex items-center justify-center active:opacity-60">${ICON.plus}</button>
      <button onclick="showDeckMenu()" aria-label="Deck options" class="w-[52px] h-[52px] rounded-[14px] bg-base text-ink flex items-center justify-center active:opacity-60">${ICON.more}</button>
    </div>

    ${sheetHTML('quick-add', `Add card <span id="qa-count" class="text-[15px] font-normal text-muted"></span>`, `
      <div class="space-y-2">
        <textarea id="qa-front"${ct.attr} data-grow rows="3" placeholder="${escHtml(deck.front_label)}" class="${fieldCls} py-3 resize-none"></textarea>
        <textarea id="qa-back"${ct.attr} data-grow rows="3" placeholder="${escHtml(deck.back_label)}" class="${fieldCls} py-3 resize-none"></textarea>
        <textarea id="qa-example"${ct.attr} data-grow rows="2" placeholder="${escHtml(deck.example_label)} (optional)" class="${fieldCls} py-3 resize-none"></textarea>
        <input id="qa-type" list="type-list" maxlength="30" placeholder="Label (optional)" class="${fieldCls} h-11"/>
        ${typeList}
      </div>
      <button onclick="expandQuickAdd(${deckId})" class="mt-1 h-11 px-1 text-[15px] text-accent active:opacity-60">More options and images</button>
    `, { cancel: `closeQuickAdd(${deckId})`, save: `saveQuickAdd(${deckId})`, saveLabel: 'Add', saveId: 'qa-save' })}

    <div id="deck-menu" class="sheet hidden fixed inset-0 z-50 bg-black/40 flex items-end justify-center" onclick="hideDeckMenu(event)">
      <div class="w-full max-w-md px-2" style="padding-bottom: calc(env(safe-area-inset-bottom) + 8px)">
        <div class="bg-surface rounded-[14px] overflow-hidden">
          ${menuRow(`navigate('#/decks/${deckId}/import')`, 'Import cards')}
          ${menuRow('showTemplateModal()', 'Language and font')}
          ${menuRow('showRenameModal()', 'Rename deck')}
          <div class="pl-4"><label class="min-h-[60px] pr-4 py-2 flex items-center gap-3 border-b border-line">
            <span class="flex-1">
              <span class="block text-[17px] text-ink">Target retention</span>
              <span id="retention-hint" class="block text-[13px] text-muted">Higher means remembering more, with more reviews</span>
            </span>
            <select onchange="saveRetention(${deckId}, this.value)" class="h-9 bg-base rounded-lg px-2 text-[15px] text-ink focus:outline-none">
              ${[0.8, 0.85, 0.9, 0.95].map(r => `<option value="${r}"${Math.abs(r - deck.target_retention) < 1e-9 ? ' selected' : ''}>${Math.round(r * 100)}%</option>`).join('')}
            </select>
          </label></div>
          ${menuRow(`deleteDeck(${deckId})`, 'Delete deck', 'text-rate-again', true)}
        </div>
        <button onclick="hideDeckMenu()" class="mt-2 w-full h-14 rounded-[14px] bg-surface text-[17px] font-semibold text-accent active:bg-base">Done</button>
      </div>
    </div>

    ${sheetHTML('template-modal', 'Language and font', `
      <label for="tpl-lang" class="block mb-1.5 px-4 text-[13px] text-muted uppercase">Card language</label>
      <select id="tpl-lang" class="${fieldCls} h-11 appearance-none">${langOptions(deck.tts_lang)}</select>
      <p class="mt-1.5 px-4 text-[13px] text-muted">The language on the cards: picks the voice, the font, and Japanese kanji shapes.</p>
      <div class="mt-4 bg-surface rounded-[10px] overflow-hidden">
        <div class="pl-4"><label for="tpl-read" class="flex items-center justify-between gap-3 h-11 pr-4 border-b border-line">
          <span class="text-[17px] text-ink">Read aloud</span>
          <select id="tpl-read" class="h-8 bg-base rounded-lg px-2 text-[15px] text-ink focus:outline-none">
            <option value="on"${deck.read_aloud === 0 ? '' : ' selected'}>On</option>
            <option value="off"${deck.read_aloud === 0 ? ' selected' : ''}>Off</option>
          </select>
        </label></div>
        <div class="pl-4"><label for="tpl-font" class="flex items-center justify-between gap-3 h-11 pr-4">
          <span class="text-[17px] text-ink">Card font</span>
          <select id="tpl-font" class="h-8 bg-base rounded-lg px-2 text-[15px] text-ink focus:outline-none">
            <option value="sans"${deck.font === 'serif' ? '' : ' selected'}>Sans</option>
            <option value="serif"${deck.font === 'serif' ? ' selected' : ''}>Mincho (serif)</option>
          </select>
        </label></div>
      </div>
      <p class="mt-1.5 px-4 text-[13px] text-muted">Mincho shows kanji stroke detail; Sans is easier for long sentences.</p>
      ${groupLabel('Field names')}
      <div class="bg-surface rounded-[10px] overflow-hidden">
        ${[['tpl-front', deck.front_label, 'Front'], ['tpl-back', deck.back_label, 'Back'], ['tpl-example', deck.example_label, 'Example']].map(([id, v, ph], i) => `
        <div class="pl-4"><input id="${id}" maxlength="40" value="${escHtml(v)}" placeholder="${ph}" aria-label="${ph} label"
          class="w-full h-11 pr-4 bg-transparent text-[17px] text-ink focus:outline-none ${i < 2 ? 'border-b border-line' : ''}"/></div>`).join('')}
      </div>
      <select id="tpl-preset" onchange="applyPreset(this.value)" aria-label="Fill field names from a preset" class="mt-3 ${fieldCls} h-11 appearance-none">
        <option value="">Fill from a preset…</option>${presetOptions()}
      </select>
    `, { cancel: 'hideTemplateModal()', save: `saveTemplate(${deckId})` })}

    ${sheetHTML('rename-modal', 'Rename Deck', `
      <input id="rename-input" type="text" value="${escHtml(deck.name)}" aria-label="Deck name" class="${fieldCls} h-12"/>
    `, { cancel: 'hideRenameModal()', save: `renameDeck(${deckId})` })}
  `;
}

function showDeckMenu() { showModal('deck-menu'); }

// <datalist> of labels already used in a deck, so typing a label is usually one tap.
function typeDatalist(id, cards) {
  const used = [...new Set(cards.map(c => c.type).filter(t => t && t !== 'vocab'))];
  return `<datalist id="${id}">${used.map(t => `<option value="${escHtml(t)}">`).join('')}</datalist>`;
}

function showTemplateModal() { hideDeckMenu(); showModal('template-modal'); }
function hideTemplateModal() { hideModalEl('template-modal'); }
function applyPreset(key) {
  const p = DECK_PRESETS[key];
  if (!p) return;
  document.getElementById('tpl-front').value = p.front_label;
  document.getElementById('tpl-back').value = p.back_label;
  document.getElementById('tpl-example').value = p.example_label;
  document.getElementById('tpl-lang').value = p.tts_lang;
  document.getElementById('tpl-read').value = p.read_aloud === false ? 'off' : 'on';
}
async function saveTemplate(deckId) {
  const v = id => document.getElementById(id).value.trim();
  await api(`/api/decks/${deckId}/template`, { method: 'PUT', body: JSON.stringify({
    front_label: v('tpl-front'), back_label: v('tpl-back'), example_label: v('tpl-example'), tts_lang: v('tpl-lang'), read_aloud: v('tpl-read') === 'on', font: v('tpl-font'),
  }) });
  hideTemplateModal();
  renderDeckDetail(document.getElementById('app'), deckId);
}

// Quick-add sheet: stays open between saves; the list refreshes only when it
// closes (re-rendering the page per save would wipe the open sheet).
let quickAddCount = 0;
function showQuickAdd() {
  quickAddCount = 0;
  document.getElementById('qa-count').textContent = '';
  showModal('quick-add');
  setTimeout(() => document.getElementById('qa-front').focus(), 80);
}
// Hand what's typed in the sheet to the full editor so expanding doesn't lose it.
let pendingDraft = null;
function expandQuickAdd(deckId) {
  pendingDraft = Object.fromEntries(['front', 'back', 'example', 'type'].map(k => [k, document.getElementById(`qa-${k}`).value]));
  navigate(`#/cards/new?deck=${deckId}`);
}
function closeQuickAdd(deckId) {
  hideModalEl('quick-add');
  if (quickAddCount) renderDeckDetail(document.getElementById('app'), deckId);
}
async function saveQuickAdd(deckId) {
  const front = document.getElementById('qa-front').value.trim();
  const back = document.getElementById('qa-back').value.trim();
  const example = document.getElementById('qa-example').value.trim();
  const type = document.getElementById('qa-type').value;
  if (!front || !back) { showToast('Fill in both the first two fields.'); return; }

  const btn = document.getElementById('qa-save');
  btn.disabled = true;
  try {
    await api(`/api/decks/${deckId}/cards`, { method: 'POST', body: JSON.stringify({ front, back, example, type }) });
  } catch {
    // Offline: not queued (by design) — keep what was typed.
    btn.disabled = false;
    showToast('You’re offline. The card wasn’t saved.');
    return;
  }
  btn.disabled = false;
  quickAddCount++;
  document.getElementById('qa-count').textContent = `· ${quickAddCount} added`;
  for (const id of ['qa-front', 'qa-back', 'qa-example']) { const ta = document.getElementById(id); ta.value = ''; ta.style.height = ''; }
  document.getElementById('qa-front').focus();
}
function hideDeckMenu(e) {
  if (!e || e.target === document.getElementById('deck-menu')) hideModalEl('deck-menu');
}
function showRenameModal() {
  hideDeckMenu();
  showModal('rename-modal');
  setTimeout(() => { const i = document.getElementById('rename-input'); i.focus(); i.select(); }, 80);
}
function hideRenameModal() { hideModalEl('rename-modal'); }
async function renameDeck(deckId) {
  const name = document.getElementById('rename-input').value.trim();
  if (!name) return;
  await api(`/api/decks/${deckId}`, { method: 'PUT', body: JSON.stringify({ name }) });
  hideRenameModal();
  renderDeckDetail(document.getElementById('app'), deckId);
}
async function saveRetention(deckId, value) {
  const hint = document.getElementById('retention-hint');
  const res = await api(`/api/decks/${deckId}/retention`, { method: 'PUT', body: JSON.stringify({ targetRetention: Number(value) }) });
  if (hint) hint.textContent = res ? 'Saved. Applies from each card’s next review.' : 'Couldn’t save';
}
async function deleteDeck(deckId) {
  hideDeckMenu();
  const deck = deckById[deckId];
  if (!await confirmSheet({ title: `Delete “${deck?.name || 'this deck'}”?`, message: `Its ${deck?.total_count ?? ''} cards and their review history are deleted too. This can’t be undone.`, confirm: 'Delete Deck' })) return;
  await api(`/api/decks/${deckId}`, { method: 'DELETE' });
  navigate('#/');
}
async function deleteCard(cardId, backHash) {
  if (!await confirmSheet({ title: 'Delete this card?', message: 'Its review history is deleted too.', confirm: 'Delete Card' })) return;
  await api(`/api/cards/${cardId}`, { method: 'DELETE' });
  navigate(backHash);
}
/* ════════════════════════════════════════
   Screen: Import (CSV / TSV / "front | back")
   upload or paste → map columns → review rows (fix inline) → choose pacing → import
════════════════════════════════════════ */
let imp = null;
const HEADER_NAMES = ['front', 'back', 'example', 'question', 'answer', 'term', 'definition'];
const SPREAD_OPTIONS = [[0, 'All due now'], [7, 'Spread over 1 week'], [14, 'Spread over 2 weeks'], [28, 'Spread over 4 weeks']];

async function renderImport(app, deckId) {
  loading(app);
  const [decks, cards] = await Promise.all([api('/api/decks'), api(`/api/decks/${deckId}/cards`)]);
  if (!decks || !cards) return;
  const deck = decks.find(d => d.id == deckId);
  if (!deck) { navigate('#/'); return; }

  imp = { deckId, existing: new Set(cards.map(c => CSV.dedupKey(c.front))), table: [], width: 0, header: false, map: {}, rows: [], spreadDays: 0, onlyFlagged: false };

  app.innerHTML = `
    <div class="px-4 pt-1 pb-44">
      <button onclick="navigate('#/decks/${deckId}')" class="h-11 -ml-2 pr-2 flex items-center text-[17px] text-accent active:opacity-60 max-w-full">${ICON.chevronLeft}<span class="truncate">${escHtml(deck.name)}</span></button>
      <h1 class="px-1 text-[34px] leading-[41px] font-bold text-ink font-heading">Import</h1>
      <p class="px-1 mt-1 text-[15px] text-muted">Cards from a CSV / TSV file or pasted text.</p>

      ${groupLabel('Source')}
      <section class="bg-surface rounded-[14px] overflow-hidden">
        <div class="pl-4"><label class="min-h-12 pr-4 flex items-center justify-between border-b border-line cursor-pointer active:opacity-60">
          <span class="text-[17px] text-accent">Choose a file</span>${ICON.chevronRight}
          <input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" class="hidden" onchange="impLoadFile(this)">
        </label></div>
        <textarea id="imp-paste" rows="5" aria-label="Paste cards" placeholder="…or paste here, e.g.&#10;front,back,example&#10;put off,postpone,We put off the launch."
          class="w-full bg-transparent px-4 py-3 text-[15px] leading-6 text-ink font-mono placeholder:text-muted/70 resize-y focus:outline-none border-b border-line"></textarea>
        <button onclick="impLoadText(document.getElementById('imp-paste').value)" class="w-full min-h-12 px-4 text-left text-[17px] text-accent active:bg-base">Preview pasted text</button>
      </section>
      <p class="mt-1.5 px-4 text-[13px] text-muted">Header row: front, back, example (or question / answer, term / definition). Comma, tab or | between columns. Best results: one fact per card, short answers.</p>

      <div id="imp-body"></div>
    </div>
  `;
}

function impLoadFile(input) {
  const file = input.files[0];
  if (file) file.text().then(impLoadText);
}

function impLoadText(text) {
  text = text.replace(/^﻿/, '');
  imp.table = CSV.parseDelimited(text, CSV.detectDelimiter(text));
  if (!imp.table.length) {
    document.getElementById('imp-body').innerHTML = '<p class="mt-6 px-4 text-[15px] text-muted">Nothing to import: no rows found.</p>';
    return;
  }
  imp.width = Math.max(...imp.table.map(r => r.length));
  const first = imp.table[0].map(c => c.trim().toLowerCase());
  const find = (...names) => first.findIndex(c => names.includes(c));
  imp.header = first.some(c => HEADER_NAMES.includes(c));
  const back = imp.header ? find('back', 'answer', 'definition') : -1;
  imp.map = {
    front: imp.header ? Math.max(0, find('front', 'question', 'term')) : 0,
    back: back >= 0 ? back : Math.min(1, imp.width - 1),
    example: imp.header ? find('example') : (imp.width > 2 ? 2 : -1),
  };
  impBuildRows();
  imp.spreadDays = imp.rows.length > 30 ? 14 : 0;
  impRender();
}

// Rebuilds rows from the raw table using the current header/mapping choices.
function impBuildRows() {
  const cell = (r, i) => (i >= 0 ? (r[i] || '').trim() : '');
  imp.rows = imp.table.slice(imp.header ? 1 : 0).map(r => ({
    front: cell(r, imp.map.front), back: cell(r, imp.map.back), example: cell(r, imp.map.example), skip: false,
  }));
  impValidate();
}

function impValidate() {
  const seen = new Set();
  for (const r of imp.rows) {
    const key = CSV.dedupKey(r.front);
    r.error = !r.front || !r.back ? 'Missing front or back' : '';
    r.dup = !r.error && (imp.existing.has(key) ? 'Already in this deck' : seen.has(key) ? 'Duplicate in file' : '');
    if (!r.error) seen.add(key);
    r.warn = r.error ? [] : CSV.ideaWarnings(r.front, r.back);
  }
}

const impIncluded = r => !r.error && !r.dup && !r.skip;

function impRender() {
  const label = i => (imp.header && imp.table[0][i]?.trim()) || `Column ${i + 1}`;
  const options = (sel, optional) =>
    (optional ? `<option value="-1"${sel < 0 ? ' selected' : ''}>None</option>` : '') +
    Array.from({ length: imp.width }, (_, i) => `<option value="${i}"${i === sel ? ' selected' : ''}>${escHtml(label(i))}</option>`).join('');
  const select = (field, name, optional, last) => `
    <div class="pl-4"><label class="min-h-12 pr-4 flex items-center justify-between gap-3 ${last ? '' : 'border-b border-line'}">
      <span class="text-[17px] text-ink">${name}${optional ? ' <span class="text-muted">(optional)</span>' : ''}</span>
      <select onchange="imp.map.${field} = +this.value; impBuildRows(); impRender()"
        class="max-w-[55%] h-8 bg-base rounded-lg px-2 text-[15px] text-ink focus:outline-none">${options(imp.map[field], optional)}</select>
    </label></div>`;

  document.getElementById('imp-body').innerHTML = `
    ${groupLabel('Columns')}
    <section class="bg-surface rounded-[14px] overflow-hidden">
      <div class="pl-4"><label class="min-h-12 pr-4 flex items-center justify-between gap-3 border-b border-line">
        <span class="text-[17px] text-ink">First row is a header</span>
        <input type="checkbox" class="ios-switch" ${imp.header ? 'checked' : ''} onchange="imp.header = this.checked; impBuildRows(); impRender()">
      </label></div>
      ${select('front', 'Front')}${select('back', 'Back')}${select('example', 'Example', true, true)}
    </section>
    <div id="imp-review"></div>
  `;
  impRenderReview();
}

function impRenderReview() {
  const rows = imp.rows;
  const ready = rows.filter(impIncluded).length;
  const nWarn = rows.filter(r => impIncluded(r) && r.warn.length).length;
  const nDup = rows.filter(r => r.dup).length;
  const nBad = rows.filter(r => r.error).length;
  const perDay = imp.spreadDays ? Math.ceil(ready / imp.spreadDays) : ready;
  const shown = rows.map((r, i) => [r, i]).filter(([r]) => !imp.onlyFlagged || r.error || r.dup || r.warn.length);
  const flag = (cls, text) => `<p class="text-[13px] leading-[18px] ${cls}">${escHtml(text)}</p>`;
  const seg = (on, label, value) => `<button onclick="imp.onlyFlagged = ${value}; impRenderReview()" class="h-7 px-3 rounded-[7px] text-[13px] font-semibold ${on ? 'bg-surface text-ink shadow-sm' : 'text-muted'}">${label}</button>`;
  const summary = [
    `${ready} ready`,
    nWarn && `<span class="text-rate-hard">${nWarn} to double-check</span>`,
    nDup && `${nDup} duplicate${nDup > 1 ? 's' : ''} skipped`,
    nBad && `<span class="text-rate-again">${nBad} incomplete</span>`,
  ].filter(Boolean).join(' · ');

  document.getElementById('imp-review').innerHTML = `
    <div class="mt-7 mb-1.5 px-4 flex items-center justify-between">
      <span class="text-[13px] text-muted uppercase">Review · ${rows.length} row${rows.length === 1 ? '' : 's'}</span>
      <span class="flex p-0.5 rounded-[9px] bg-base">${seg(!imp.onlyFlagged, 'All', false)}${seg(imp.onlyFlagged, 'Flagged', true)}</span>
    </div>
    <p class="mb-2 px-4 text-[13px] text-muted">${summary}</p>

    ${shown.length === 0 ? '<p class="px-4 py-4 text-[15px] text-muted">Nothing flagged.</p>' : `
    <section class="bg-surface rounded-[14px] overflow-hidden">
      ${shown.map(([r, i], n) => `
        <div class="pl-3 ${r.dup ? 'opacity-55' : ''}"><div class="flex items-start gap-3 pr-4 py-2.5 ${n < shown.length - 1 ? 'border-b border-line' : ''}">
          <input type="checkbox" class="ios-check mt-2" aria-label="Include row ${i + 1}" ${impIncluded(r) ? 'checked' : ''} ${r.error || r.dup ? 'disabled' : ''}
            onchange="imp.rows[${i}].skip = !this.checked; impRenderReview()">
          <div class="flex-1 min-w-0">
            <textarea rows="1" aria-label="Front, row ${i + 1}" placeholder="Front" onchange="impEdit(${i}, 'front', this.value)"
              class="w-full bg-transparent py-1 text-[17px] leading-6 text-ink resize-none focus:outline-none focus:bg-base rounded">${escHtml(r.front)}</textarea>
            <textarea rows="1" aria-label="Back, row ${i + 1}" placeholder="Back" onchange="impEdit(${i}, 'back', this.value)"
              class="w-full bg-transparent py-1 text-[15px] leading-[22px] text-muted resize-none focus:outline-none focus:bg-base rounded">${escHtml(r.back)}</textarea>
            ${r.example ? `<p class="text-[13px] text-muted/80 italic truncate">${escHtml(previewParts(r.example).text)}</p>` : ''}
            ${r.error ? flag('text-rate-again', r.error) : ''}${r.dup ? flag('text-muted', r.dup) : ''}${r.warn.map(w => flag('text-rate-hard', w)).join('')}
          </div>
        </div></div>`).join('')}
    </section>`}

    ${groupLabel('Pacing')}
    <section class="bg-surface rounded-[14px] overflow-hidden">
      <div class="pl-4"><label class="min-h-12 pr-4 flex items-center justify-between gap-3">
        <span class="text-[17px] text-ink">New cards</span>
        <select onchange="imp.spreadDays = +this.value; impRenderReview()" class="h-8 bg-base rounded-lg px-2 text-[15px] text-ink focus:outline-none">
          ${SPREAD_OPTIONS.map(([d, l]) => `<option value="${d}"${d === imp.spreadDays ? ' selected' : ''}>${l}</option>`).join('')}
        </select>
      </label></div>
    </section>
    <p class="mt-1.5 px-4 text-[13px] text-muted">${imp.spreadDays ? `About ${perDay} new card${perDay !== 1 ? 's' : ''} a day, so a big import doesn’t land as one backlog.` : 'Every imported card is due right away.'}</p>

    <!-- Import stays reachable without scrolling past every row -->
    <div class="fixed left-0 right-0 z-30 px-4 pt-2 pb-3 bg-paper/95 backdrop-blur border-t border-line"
      style="bottom: calc(50px + env(safe-area-inset-bottom))">
      <button id="imp-submit" onclick="impSubmit()" ${ready ? '' : 'disabled'}
        class="w-full h-[52px] rounded-[14px] text-[17px] font-semibold ${ready ? 'bg-accent text-on-accent active:opacity-80' : 'bg-base text-muted'}">
        Import ${ready} card${ready !== 1 ? 's' : ''}
      </button>
    </div>
  `;
}

function impEdit(i, field, value) {
  imp.rows[i][field] = value.trim();
  impValidate();
  impRenderReview();
}

async function impSubmit() {
  const btn = document.getElementById('imp-submit');
  btn.disabled = true;
  btn.textContent = 'Importing…';
  const rows = imp.rows.filter(impIncluded).map(({ front, back, example }) => ({ front, back, example }));
  const res = await api(`/api/decks/${imp.deckId}/import-rows`, { method: 'POST', body: JSON.stringify({ rows, spreadDays: imp.spreadDays }) });
  if (res) navigate(`#/decks/${imp.deckId}`);
  else { btn.disabled = false; btn.textContent = 'Import failed — try again'; }
}

/* ════════════════════════════════════════
   Screen: Study
════════════════════════════════════════ */
let study = null;

async function renderStudy(app, deckId, favoritesOnly = false, startId = null) {
  app.innerHTML = `<div class="flex items-center justify-center h-64 text-muted">Loading cards...</div>`;
  const url = favoritesOnly
    ? (deckId === 'all' ? '/api/cards/favorites' : `/api/decks/${deckId}/favorites`)
    : (deckId === 'all' ? '/api/cards/due?ahead=3' : `/api/decks/${deckId}/due?ahead=3`);
  let cards = await api(url);
  if (!cards) return;
  // Deck templates (labels, language, font); refetch if a card's deck isn't known yet.
  if (cards.some(c => !deckById[c.deck_id])) await api('/api/decks');
  // The list includes the next 3 days so the SW's cached copy stays useful
  // offline; what's actually due is decided by this device's clock.
  if (!favoritesOnly) cards = cards.filter(c => c.next_review <= Date.now());
  // Coming back from editing a card mid-session: resume on that card.
  const at = cards.findIndex(c => c.id == startId);
  if (at > 0) cards.unshift(...cards.splice(at, 1));

  if (cards.length === 0) {
    app.innerHTML = `
      <div class="flex flex-col items-center justify-center min-h-[70vh] p-8 text-center">
        <h2 class="text-[28px] leading-[34px] font-bold text-ink mb-2 font-heading">${favoritesOnly ? 'No favorites yet' : 'Nothing due right now'}</h2>
        <p class="text-muted mb-8">${favoritesOnly ? 'Star a card while studying to collect it here.' : 'Cards come back when they\u2019re due. Check back later.'}</p>
        <button onclick="leaveStudy('#/')"
          class="h-12 px-8 bg-accent hover:bg-accent-dark rounded-xl text-on-accent font-semibold transition-colors">
          Back to Decks
        </button>
      </div>`;
    return;
  }

  study = { cards, index: 0, flipped: false, ratings: { 1: 0, 2: 0, 3: 0, 4: 0 }, deckId, favoritesOnly, pendingRate: null, startedAt: Date.now() };
  drawStudyCard();
}

function starSVG(filled) {
  return `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.27 5.82 21 7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
}

// Bounce only on the way IN to favorited — matches the "like" convention
// (unfavoriting is a plain, unceremonious state change).
function popFavorite(btn) {
  btn.classList.remove('animate-star-pop');
  void btn.offsetWidth; // reflow so the animation restarts if toggled repeatedly
  btn.classList.add('animate-star-pop');
}

async function toggleFavoriteInStudy() {
  const card = study.cards[study.index];
  card.is_favorite = card.is_favorite ? 0 : 1;
  document.getElementById('study-star')?.classList.toggle('hidden', !card.is_favorite);
  const label = document.getElementById('menu-fav');
  if (label) label.textContent = card.is_favorite ? 'Remove from favorites' : 'Add to favorites';
  trackWrite(api(`/api/cards/${card.id}/favorite`, { method: 'POST', body: JSON.stringify({ favorite: !!card.is_favorite }) }).catch(() => {}));
}

function toggleFavoriteInList(cardId, btnId) {
  const btn = document.getElementById(btnId);
  const favorite = btn.dataset.fav !== '1';
  btn.dataset.fav = favorite ? '1' : '0';
  btn.classList.toggle('text-rate-hard', favorite);
  btn.classList.toggle('text-muted/50', !favorite);
  btn.setAttribute('aria-label', favorite ? 'Remove from favorites' : 'Add to favorites');
  btn.innerHTML = starSVG(favorite);
  if (favorite) popFavorite(btn);
  api(`/api/cards/${cardId}/favorite`, { method: 'POST', body: JSON.stringify({ favorite }) }).catch(() => {});

  // Keep the "Study favorites" row in sync without a full re-fetch.
  const count = document.querySelectorAll('[id^="fav-btn-"][data-fav="1"]').length;
  document.getElementById('study-fav-btn')?.classList.toggle('hidden', count === 0);
  const countEl = document.getElementById('study-fav-count');
  if (countEl) countEl.textContent = count;
}

/* Study screen */
const studyIcon = {
  close: '<svg class="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  more: '<svg class="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>',
  star: '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.27 5.82 21 7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
};


function drawStudyCard() {
  const app = document.getElementById('app');
  const { cards, index, flipped, ratings, deckId } = study;
  const backHash = deckId === 'all' ? '#/' : `#/decks/${deckId}`;

  if (index >= cards.length) {
    const total = cards.filter(c => !c.practice).length;
    const minutes = Math.max(1, Math.round((Date.now() - study.startedAt) / 60000));
    const remembered = ratings[2] + ratings[3] + ratings[4];
    const row = (label, value, cls, last) => `
      <div class="pl-4"><div class="flex items-center justify-between min-h-12 pr-4 ${last ? '' : 'border-b border-line'}">
        <span class="text-[17px] text-ink">${label}</span><span class="text-[17px] font-medium ${cls}">${value}</span>
      </div></div>`;
    app.innerHTML = `
      <div class="min-h-screen flex flex-col px-4 pt-24 pb-44">
        <div class="px-2">
          <svg class="w-14 h-14 text-rate-easy" viewBox="0 0 56 56" fill="none" aria-hidden="true"><circle cx="28" cy="28" r="27" stroke="currentColor" stroke-width="2"/><path d="M17 29l7.5 7.5L40 21" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <h2 class="mt-5 text-[28px] leading-[34px] font-bold text-ink font-heading">Done for now</h2>
          <p class="mt-2 text-[17px] leading-6 text-ink/80">${total} card${total !== 1 ? 's' : ''} in ${minutes} min.</p>
        </div>
        <section class="mt-8 bg-surface rounded-[14px] overflow-hidden">
          ${row('Remembered', remembered, 'text-rate-easy')}
          ${row('Forgot', ratings[1], ratings[1] ? 'text-rate-again' : 'text-muted', true)}
        </section>
      </div>
      <div class="fixed left-0 right-0 bottom-0 px-4 pt-3 bg-paper" style="padding-bottom: calc(env(safe-area-inset-bottom) + 16px)">
        <button onclick="leaveStudy('${backHash}')" class="w-full h-14 rounded-[14px] bg-ink text-paper text-[17px] font-semibold active:opacity-80">${deckId === 'all' ? 'Back to Today' : 'Back to deck'}</button>
      </div>
      ${undoToastHTML()}`;
    return;
  }

  const card = cards[index];
  const total = cards.length;
  const progress = Math.round((index / total) * 100);
  const info = deckInfo(card.deck_id);
  const lang = speechLang(info);
  const speech = lang !== 'off';
  const ct = cardText(info);
  const backSpeak = card.example ? `${card.back}. ${card.example}` : card.back;
  const hasFurigana = /<ruby>/.test(md(`${card.front}\n${card.back}\n${card.example || ''}`));
  const label = card.type && card.type !== 'vocab' ? ({ phrasal: 'Phrasal verb' }[card.type] || card.type) : '';
  const speakBtn = (text, extra = '') => speech ? `
    <button onclick="event.stopPropagation(); speak(${escHtml(JSON.stringify(text))}, '${lang}')" aria-label="Play audio"
      class="w-11 h-11 -mr-2.5 flex-shrink-0 flex items-center justify-center text-muted active:opacity-50 ${extra}">${speakerOnSVG}</button>` : '';

  app.innerHTML = `
    <div class="min-h-screen flex flex-col">
      <div class="flex items-center gap-1 px-2 pt-2">
        <button onclick="leaveStudy('${backHash}')" aria-label="End session" class="w-11 h-11 flex items-center justify-center text-ink/70 active:opacity-50">${studyIcon.close}</button>
        <div class="flex-1 h-1 rounded-full bg-line overflow-hidden"><div class="h-1 bg-accent transition-all duration-300" style="width:${progress}%"></div></div>
        <span class="w-14 text-center text-[13px] text-muted">${index + 1} / ${total}</span>
        <button onclick="showStudyMenu()" aria-label="More" class="w-11 h-11 flex items-center justify-center text-ink/70 active:opacity-50">${studyIcon.more}</button>
      </div>

      <div id="study-body" onclick="studyTap(event)" class="flex-1 px-6 pb-44 cursor-pointer select-none animate-card-in">
        <div class="mt-5 flex items-center justify-between gap-3">
          <span class="min-w-0 truncate text-[13px] text-muted flex items-center gap-1.5">
            ${escHtml(deckById[card.deck_id]?.name || '')}${label ? ` · ${escHtml(label)}` : ''}
            <span id="study-star" class="text-rate-hard ${card.is_favorite ? '' : 'hidden'}">${studyIcon.star}</span>
          </span>
          <span class="flex items-center gap-1">${hasFurigana ? furiganaBtn() : ''}${speakBtn(card.front)}</span>
        </div>
        ${card.practice ? `<p class="mt-3 inline-block text-[13px] font-medium text-rate-again bg-accent-tint px-2.5 py-1 rounded-full">Practice round · won’t change its schedule</p>` : ''}
        <div class="mt-8 prose-content card-text${ct.cls} text-[28px] leading-[1.45] font-medium text-ink"${ct.attr}>${md(card.front)}</div>

        <div id="answer" class="${flipped ? '' : 'hidden'} mt-6 pt-5 border-t border-line">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 prose-content card-text${ct.cls} text-[20px] leading-7 font-semibold text-ink"${ct.attr}>${md(card.back)}</div>
            ${speakBtn(backSpeak, '-mt-2')}
          </div>
          ${card.example ? `<div class="mt-3 prose-content card-text text-[15px] leading-[22px] text-ink/75"${ct.attr}>${md(card.example)}</div>` : ''}
        </div>
      </div>
    </div>

    <div id="reveal-bar" class="${flipped ? 'hidden' : ''} fixed left-0 right-0 bottom-0 z-30 px-4 pt-3 bg-paper" style="padding-bottom: calc(env(safe-area-inset-bottom) + 12px)">
      <button onclick="flipCard()" class="w-full h-14 rounded-[14px] bg-ink text-paper text-[17px] font-semibold active:opacity-80">Show answer</button>
      <p class="mt-2 text-center text-[13px] text-muted">or tap anywhere</p>
    </div>

    <div id="rating-btns" class="${flipped ? '' : 'hidden'} fixed left-0 right-0 bottom-0 z-30 px-3 pt-2.5 bg-paper/95 backdrop-blur border-t border-line grid grid-cols-4 gap-2" style="padding-bottom: calc(env(safe-area-inset-bottom) + 12px)">
      ${[[1, 'Again', 'bg-accent-tint text-rate-again'], [2, 'Hard', 'bg-base text-ink'], [3, 'Good', 'bg-ink text-paper'], [4, 'Easy', 'bg-base text-ink']].map(([r, name, cls]) => `
      <button onclick="rate(${r})" class="h-[62px] rounded-xl ${cls} flex flex-col items-center justify-center gap-0.5 active:opacity-75 transition-opacity">
        <span class="text-[16px] font-semibold">${name}</span>
        ${!card.practice && card.preview ? `<span class="text-[12px] opacity-75">${fmtInterval(card.preview[r - 1])}</span>` : ''}
      </button>`).join('')}
    </div>

    <div id="study-menu" class="sheet hidden fixed inset-0 z-50 bg-black/40 flex items-end" onclick="hideStudyMenu(event)">
      <div class="w-full bg-surface rounded-t-[14px]" style="padding-bottom: calc(env(safe-area-inset-bottom) + 8px)" onclick="event.stopPropagation()">
        <div class="mx-auto mt-2 mb-1 w-9 h-[5px] rounded-full bg-line"></div>
        ${[
          ['editCurrentCard()', 'Edit card', ''],
          ['toggleFavoriteInStudy()', `<span id="menu-fav">${card.is_favorite ? 'Remove from favorites' : 'Add to favorites'}</span>`, ''],
          ...(speech ? [
            ['toggleTTS()', 'Read aloud', `<span id="menu-tts" class="text-muted">${ttsEnabled ? 'On' : 'Off'}</span>`],
            ['cycleTTSMode()', 'Read', `<span id="menu-tts-mode" class="text-muted">${TTS_MODE_LABELS[ttsMode]}</span>`],
          ] : []),
        ].map(([fn, text, value]) => `
        <div class="pl-4"><button onclick="${fn}" class="w-full flex items-center justify-between min-h-[52px] pr-4 border-b border-line text-[17px] text-ink text-left active:opacity-60">${text}${value}</button></div>`).join('')}
        <div class="px-4 pt-2"><button onclick="hideStudyMenu()" class="w-full h-[52px] text-[17px] font-semibold text-accent active:opacity-60">Done</button></div>
      </div>
    </div>
    ${undoToastHTML()}
  `;

  setupSwipe();
  if (ttsMode === 'both' || ttsMode === 'front') speak(card.front, lang);
}

// Study-screen furigana switch: hides readings (keeping their space so text doesn't jump)
// to test yourself; remembered on this device.
let furiganaOn = localStorage.getItem('fc_furigana') !== 'off';
document.documentElement.classList.toggle('furigana-off', !furiganaOn);
const furiganaBtn = () => `
  <button id="furigana-btn" onclick="event.stopPropagation(); toggleFurigana()" aria-label="Furigana" aria-pressed="${furiganaOn}"
    class="h-8 px-2.5 rounded-full text-[13px] font-medium active:opacity-60 ${furiganaOn ? 'bg-accent-tint text-accent' : 'bg-base text-muted'}">ふりがな</button>`;
function toggleFurigana() {
  furiganaOn = !furiganaOn;
  try { localStorage.setItem('fc_furigana', furiganaOn ? 'on' : 'off'); } catch {}
  document.documentElement.classList.toggle('furigana-off', !furiganaOn);
  document.getElementById('furigana-btn')?.replaceWith(document.createRange().createContextualFragment(furiganaBtn().trim()));
}

// With furigana off, tapping a word peeks at just its reading (tap again to hide);
// any other tap flips the card as before.
function studyTap(e) {
  const ruby = !furiganaOn && e.target.closest?.('ruby');
  if (ruby) return ruby.classList.toggle('peek');
  flipCard();
}

function showStudyMenu() { showModal('study-menu'); }
function hideStudyMenu(e) {
  if (!e || e.target === document.getElementById('study-menu')) hideModalEl('study-menu');
}

// Reveals the answer under the question (tapping again does nothing — the
// rating bar is the way forward).
function flipCard() {
  if (!study || study.flipped || study.index >= study.cards.length) return;
  study.flipped = true;
  document.getElementById('answer')?.classList.remove('hidden');
  document.getElementById('reveal-bar')?.classList.add('hidden');
  document.getElementById('rating-btns')?.classList.remove('hidden');
  const c = study.cards[study.index];
  if (ttsMode === 'both' || ttsMode === 'back') speak(c.example ? `${c.back}. ${c.example}` : c.back, speechLang(deckInfo(c.deck_id)));
}

// Fire a study-screen write (review or favorite) without blocking the UI,
// but track it so leaveStudy() can wait for it — otherwise whatever screen
// you land on can still reflect the pre-write state if it hasn't landed yet.
function trackWrite(promise) {
  (study.pending ||= []).push(promise);
  return promise;
}

// A rating is held for UNDO_MS before it's sent, so Undo is purely local (no
// server rollback). It's sent early by the next rating, leaving the session,
// or the app going to the background.
const UNDO_MS = 5000;
const RATING_NAMES = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' };

async function rate(rating) {
  if (!study || study.index >= study.cards.length) return;
  const card = study.cards[study.index];
  commitPendingRate();
  // Forgotten cards come back at the end of the session as practice only:
  // their first rating is the one FSRS sees.
  const requeued = rating === 1;
  if (requeued) study.cards.push({ ...card, practice: true });
  if (!card.practice) study.ratings[rating]++;
  study.pendingRate = { card, rating, at: Date.now(), requeued, timer: setTimeout(commitPendingRate, UNDO_MS) };
  study.index++;
  study.flipped = false;
  window.speechSynthesis?.cancel();
  drawStudyCard();
}

function commitPendingRate() {
  const p = study?.pendingRate;
  if (!p) return;
  clearTimeout(p.timer);
  study.pendingRate = null;
  document.getElementById('undo-toast')?.remove();
  if (p.card.practice) return;
  trackWrite(api(`/api/cards/${p.card.id}/review`, {
    method: 'POST', keepalive: true, body: JSON.stringify({ rating: p.rating, at: p.at }),
  }).catch(() => {}));
}

function undoRate() {
  const p = study?.pendingRate;
  if (!p) return;
  clearTimeout(p.timer);
  study.pendingRate = null;
  if (p.requeued) study.cards.pop();
  if (!p.card.practice) study.ratings[p.rating]--;
  study.index--;
  study.flipped = true;
  drawStudyCard();
}

function undoToastHTML() {
  const p = study?.pendingRate;
  if (!p) return '';
  return `
    <div id="undo-toast" class="fixed left-4 right-4 z-40 flex items-center justify-between gap-3 bg-ink text-paper rounded-xl pl-4 pr-2 h-12 shadow-lg"
      style="bottom: calc(env(safe-area-inset-bottom) + 9.5rem)">
      <span class="text-sm">Rated ${RATING_NAMES[p.rating]}${p.requeued ? ' · it comes back at the end' : ''}</span>
      <button onclick="undoRate()" class="h-10 px-4 font-semibold text-paper underline underline-offset-4">Undo</button>
    </div>`;
}

// Next-interval label under a rating button.
function fmtInterval(days) {
  if (days < 1) return '<1d';
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1).replace(/\.0$/, '')}y`;
}

// Leaving or backgrounding the app sends a held rating right away.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') commitPendingRate(); });
window.addEventListener('pagehide', commitPendingRate);

// Leaving study (back arrow or "Back to Decks") always routes through here so
// due-count/favorite state on the screen you land on is fresh immediately.
// Edit the card on screen; saving/cancelling returns to this session on the same card.
async function editCurrentCard() {
  const c = study.cards[study.index];
  const [path, query = ''] = window.location.hash.split('?');
  const params = new URLSearchParams(query);
  params.set('start', c.id);
  commitPendingRate();
  await Promise.all(study.pending || []);
  navigate(`#/cards/${c.id}/edit?deck=${c.deck_id}&ret=${encodeURIComponent(`${path}?${params}`)}`);
}
async function leaveStudy(hash) {
  commitPendingRate();
  await Promise.all(study?.pending || []);
  navigate(hash);
}

// Swipes rate, so they only work once the answer is showing:
// left = Again, right = Good.
function setupSwipe() {
  const body = document.getElementById('study-body');
  if (!body) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let startX = 0, startY = 0, dragging = false;

  body.addEventListener('touchstart', e => {
    if (!study.flipped) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    dragging = true;
    body.style.transition = 'none';
  }, { passive: true });

  body.addEventListener('touchmove', e => {
    if (!dragging || reduceMotion) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (Math.abs(dy) > Math.abs(dx) || Math.abs(dx) < 10) return; // vertical scroll or jitter
    body.style.transform = `translateX(${dx}px)`;
    body.style.opacity = Math.max(1 - Math.abs(dx) / 400, 0.4);
  }, { passive: true });

  body.addEventListener('touchend', e => {
    if (!dragging) return;
    dragging = false;
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    body.style.transition = 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s';
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx)) {
      body.style.transform = '';
      body.style.opacity = '';
      return;
    }
    if (!reduceMotion) {
      body.style.transform = `translateX(${dx < 0 ? -420 : 420}px)`;
      body.style.opacity = '0';
    }
    setTimeout(() => rate(dx < 0 ? 1 : 3), reduceMotion ? 0 : 220);
  }, { passive: true });
}

/* ════════════════════════════════════════
   Screen: Edit / Add Card
════════════════════════════════════════ */
async function renderEditCard(app, cardId, deckId, ret = null) {
  loading(app);
  let card = null;

  if (cardId) {
    if (deckId) {
      const cards = await api(`/api/decks/${deckId}/cards`);
      if (cards) card = cards.find(c => c.id == cardId);
    }
    if (!card) {
      const decks = await api('/api/decks');
      if (decks) {
        for (const d of decks) {
          const cards = await api(`/api/decks/${d.id}/cards`);
          const found = cards?.find(c => c.id == cardId);
          if (found) { card = found; deckId = d.id; break; }
        }
      }
    }
  }

  if (!Object.keys(deckById).length) await api('/api/decks');
  const info = deckInfo(deckId);
  const siblings = deckId ? (await api(`/api/decks/${deckId}/cards`)) || [] : [];
  const isNew = !cardId;
  const draft = isNew ? pendingDraft : null;
  pendingDraft = null;
  const values = {
    front: card?.front || draft?.front || '',
    back: card?.back || draft?.back || '',
    example: card?.example || draft?.example || '',
  };
  const cardType = card?.type || draft?.type || 'vocab';
  const backHash = ret?.startsWith('#/study/') || ret === '#/recap' ? ret : deckId ? `#/decks/${deckId}` : '#/';

  const ct = cardText(info);
  const field = (key, label, rows, optional) => `
    ${groupLabel(`${escHtml(label)}${optional ? ' <span class="normal-case">(optional)</span>' : ''}`)}
    <div class="bg-surface rounded-[14px] overflow-hidden">
      <textarea id="edit-${key}" data-grow rows="${rows}" aria-label="${escHtml(label)}" placeholder="${escHtml(label)}"${ct.attr}
        class="edit-field card-text${key === 'example' ? '' : ct.cls} w-full bg-transparent px-4 py-3 text-[17px] leading-6 text-ink placeholder:text-muted/70 resize-none focus:outline-none">${escHtml(values[key])}</textarea>
      <div id="preview-${key}"${ct.attr} class="edit-preview card-text${key === 'example' ? '' : ct.cls} hidden px-4 py-3 min-h-12 prose-content text-[17px] leading-6 text-ink"></div>
      <div class="pl-4 border-t border-line">
        <button type="button" id="image-btn-edit-${key}" onclick="pickImageFor('edit-${key}')" class="h-11 text-[15px] text-accent active:opacity-60">Add image</button>
      </div>
    </div>`;

  app.innerHTML = `
    <div class="pb-16">
      <div class="sticky top-0 z-20 bg-paper/95 backdrop-blur border-b border-line flex items-center justify-between h-12 px-2">
        <button onclick="navigate('${backHash}')" class="h-11 px-2 text-[17px] text-accent active:opacity-60">Cancel</button>
        <span class="text-[17px] font-semibold text-ink">${isNew ? 'New Card' : 'Edit Card'}</span>
        <button id="save-btn" onclick="saveCard(${escHtml(JSON.stringify(cardId || ''))}, ${escHtml(JSON.stringify(deckId || ''))}, ${escHtml(JSON.stringify(backHash))})"
          class="h-11 px-2 text-[17px] font-semibold text-accent active:opacity-60 disabled:opacity-40">Save</button>
      </div>

      <div class="px-4 pt-4">
        <div class="grid grid-cols-2 p-0.5 rounded-[9px] bg-base" role="tablist" aria-label="Editor mode">
          <button id="mode-edit" onclick="setEditorMode(false)" role="tab" class="h-8 rounded-[7px] text-[13px] font-semibold bg-surface text-ink shadow-sm">Edit</button>
          <button id="mode-preview" onclick="setEditorMode(true)" role="tab" class="h-8 rounded-[7px] text-[13px] font-semibold text-muted">Preview</button>
        </div>

        ${field('front', info.front_label, 4)}
        ${field('back', info.back_label, 5)}
        ${field('example', info.example_label, 3, true)}

        ${groupLabel('Label <span class="normal-case">(optional)</span>')}
        <input id="edit-type" list="edit-type-list" maxlength="30" value="${escHtml(cardType === 'vocab' ? '' : cardType)}" placeholder="e.g. Idiom, Pattern, Rule" aria-label="Label"
          class="${fieldCls} h-12 rounded-[14px]"/>
        ${typeDatalist('edit-type-list', siblings)}
        <p class="mt-1.5 px-4 text-[13px] text-muted">Formatting: **bold**, *italic*. Paste a screenshot to add it as an image.</p>

        ${!isNew ? `
          <section class="mt-8 bg-surface rounded-[14px] overflow-hidden">
            <button onclick="deleteCard(${Number(cardId)}, ${escHtml(JSON.stringify(deckId ? `#/decks/${deckId}` : '#/'))})" class="w-full h-12 text-[17px] text-rate-again active:bg-base">Delete Card</button>
          </section>` : ''}
        <input type="file" id="image-picker" accept="image/*" class="hidden" />
      </div>
    </div>
  `;

  for (const key of ['front', 'back', 'example']) {
    const ta = document.getElementById(`edit-${key}`);
    wirePasteImage(ta);
    // After Tailwind's CDN styles the new markup, or the measured height is off.
    requestAnimationFrame(() => autoGrow(ta));
  }

  document.getElementById('image-picker').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file || !imageUploadTargetId) return;
    const btn = document.getElementById(`image-btn-${imageUploadTargetId}`);
    const originalLabel = btn.textContent;
    btn.textContent = 'Adding image…';
    btn.disabled = true;
    try {
      setEditorMode(false);
      const dataUrl = await compressImageToDataUrl(file);
      insertAtCursor(document.getElementById(imageUploadTargetId), `\n![](${dataUrl})\n`);
    } catch {
      showToast('That image couldn’t be added.');
    } finally {
      btn.textContent = originalLabel;
      btn.disabled = false;
    }
  });
}

// One Edit / Preview switch for the whole form (previews render on switch).
function setEditorMode(preview) {
  for (const key of ['front', 'back', 'example']) {
    const ta = document.getElementById(`edit-${key}`);
    const pv = document.getElementById(`preview-${key}`);
    if (!ta || !pv) return;
    if (preview) pv.innerHTML = ta.value.trim() ? md(ta.value) : '<span class="text-muted">Empty</span>';
    ta.classList.toggle('hidden', preview);
    pv.classList.toggle('hidden', !preview);
    if (!preview) autoGrow(ta);
  }
  const on = 'bg-surface text-ink shadow-sm', off = 'text-muted';
  const [edit, prev] = [document.getElementById('mode-edit'), document.getElementById('mode-preview')];
  edit.className = edit.className.replace(preview ? on : off, preview ? off : on);
  prev.className = prev.className.replace(preview ? off : on, preview ? on : off);
}

async function saveCard(cardId, deckId, backHash) {
  const front = document.getElementById('edit-front').value.trim();
  const back = document.getElementById('edit-back').value.trim();
  const example = document.getElementById('edit-example').value.trim();
  const type = document.getElementById('edit-type').value;
  const info = deckInfo(deckId);
  if (!front || !back) { showToast(`${info.front_label} and ${info.back_label} are both needed.`); return; }

  const btn = document.getElementById('save-btn');
  btn.disabled = true;
  const payload = JSON.stringify({ front, back, example, type });
  try {
    if (cardId) {
      await api(`/api/cards/${cardId}`, { method: 'PUT', body: payload });
    } else {
      await api(`/api/decks/${deckId}/cards`, { method: 'POST', body: payload });
    }
  } catch {
    // Offline: not queued (by design) — say so and keep what was typed.
    btn.disabled = false;
    showToast('You’re offline. The card wasn’t saved.');
    return;
  }
  navigate(backHash);
}

/* ════════════════════════════════════════
   Screen: Stats
════════════════════════════════════════ */
async function renderStats(app) {
  loading(app);
  const [stats, weekly, growth, heatmap] = await Promise.all([
    api('/api/stats'),
    api('/api/stats/weekly'),
    api('/api/stats/vocab-growth?days=90'),
    api('/api/stats/heatmap?weeks=12'),
  ]);
  if (!stats) return;

  const maturePct = stats.total_cards ? Math.round((stats.mature_cards / stats.total_cards) * 100) : 0;
  const rows = [
    ['Due now', stats.due_today],
    ['Reviewed today', stats.reviewed_today],
    ['Streak', `${stats.streak_days} day${stats.streak_days === 1 ? '' : 's'}`],
    ['Cards', stats.total_cards],
    ['Mature <span class="text-muted">· interval 21+ days</span>', `${stats.mature_cards} <span class="text-muted">(${maturePct}%)</span>`],
  ];
  // The growth line only says something once cards were added on 2+ days in the window.
  const showGrowth = growth && new Set(growth.map(d => d.total)).size > 2;

  app.innerHTML = `
    <div class="px-4 pt-6 pb-10">
      <h1 class="px-1 text-[34px] leading-[41px] font-bold text-ink font-heading">Progress</h1>

      <section class="mt-5 bg-surface rounded-[14px] overflow-hidden">
        ${rows.map(([label, value], i) => `
          <div class="pl-4"><div class="flex items-center justify-between min-h-12 pr-4 ${i < rows.length - 1 ? 'border-b border-line' : ''}">
            <span class="text-[17px] text-ink">${label}</span><span class="text-[17px] text-ink">${value}</span>
          </div></div>`).join('')}
      </section>

      <section class="mt-5 bg-surface rounded-[14px] overflow-hidden">
        <button onclick="navigate('#/recap')" class="w-full min-h-12 px-4 flex items-center justify-between text-[17px] text-ink active:bg-base">This week${ICON.chevronRight}</button>
      </section>

      ${groupLabel('Reviews · last 7 days')}
      <section class="bg-surface rounded-[14px] p-4"><div id="weekly-chart"></div></section>

      ${groupLabel('Activity · last 12 weeks')}
      <section class="bg-surface rounded-[14px] p-4"><div id="heatmap"></div></section>

      ${showGrowth ? `
        ${groupLabel('Cards added · last 90 days')}
        <section class="bg-surface rounded-[14px] p-4"><div id="growth-chart"></div></section>` : ''}
    </div>
  `;

  if (showGrowth) renderGrowthChart(growth);
  if (heatmap) renderHeatmap(heatmap);
  if (weekly) renderWeeklyChart(weekly);
}

async function renderSettings(app) {
  const row = (label, control, last = false, id = '') => `
    <div class="pl-4"><label ${id ? `for="${id}"` : ''} class="flex items-center justify-between gap-3 min-h-12 pr-4 py-1.5 ${last ? '' : 'border-b border-line'}">
      <span class="text-[17px] text-ink">${label}</span>${control}
    </label></div>`;
  const action = (onclick, label, last = false) => `
    <div class="pl-4"><button onclick="${onclick}" class="w-full min-h-12 pr-4 text-left text-[17px] text-accent ${last ? '' : 'border-b border-line'} active:opacity-60">${label}</button></div>`;
  const inputCls = 'h-9 bg-base rounded-lg px-2 text-[17px] text-ink focus:outline-none focus:ring-2 focus:ring-accent/40';

  app.innerHTML = `
    <div class="px-4 pt-6 pb-10">
      <h1 class="px-1 text-[34px] leading-[41px] font-bold text-ink font-heading">Settings</h1>

      ${groupLabel('Appearance')}
      <div class="grid grid-cols-3 p-0.5 rounded-[9px] bg-base" role="radiogroup" aria-label="Appearance">
        ${[['light', 'Light'], ['dark', 'Dark'], ['system', 'Automatic']].map(([v, l]) => `
          <button data-theme="${v}" onclick="setTheme('${v}')" role="radio" class="theme-btn h-8 rounded-[7px] text-[13px] font-semibold">${l}</button>`).join('')}
      </div>

      ${groupLabel('Reminders')}
      <section class="bg-surface rounded-[14px] overflow-hidden">
        ${row('Notifications', `<button id="push-enable-btn" onclick="enablePush()" class="h-9 px-3 rounded-lg bg-base text-[15px] font-semibold text-accent disabled:text-muted">Enable</button>`)}
        ${row('Daily reminder', `<input id="reminder-time" type="time" onchange="saveReminderTime()" class="${inputCls}"/>`, false, 'reminder-time')}
        ${row('Quiet deck nudge after', `<span class="flex items-center gap-2"><input id="silence-days" type="number" min="1" max="365" inputmode="numeric" onchange="saveSilenceDays()" class="${inputCls} w-16 text-center"/><span class="text-[17px] text-muted">days</span></span>`, true, 'silence-days')}
      </section>
      <p class="mt-1.5 px-4 text-[13px] text-muted">Notifications only work in the app added to your Home Screen (iOS 16.4 or later).</p>

      ${groupLabel('Email')}
      <section class="bg-surface rounded-[14px] overflow-hidden">
        ${row('End-of-day digest', `<input id="digest-time" type="time" onchange="saveDigestTime()" class="${inputCls}"/>`, true, 'digest-time')}
      </section>

      ${groupLabel('Test')}
      <section class="bg-surface rounded-[14px] overflow-hidden">
        ${action('sendTestPush()', 'Send a test notification')}
        ${action('sendTestSilence()', 'Send a quiet-deck nudge')}
        ${action('sendTestDigest()', 'Send a test email', true)}
      </section>
      <p id="push-status" role="status" class="mt-1.5 px-4 text-[13px] text-muted min-h-5"></p>

      <p id="app-version" class="mt-8 text-center text-[13px] text-muted"></p>
    </div>
  `;

  updateThemeButtons();
  updatePushButton();
  loadReminderTime();
  api('/api/settings/silence').then(s => {
    const el = document.getElementById('silence-days');
    if (el && s) el.value = s.thresholdDays;
  });
  api('/api/settings/digest').then(s => {
    const el = document.getElementById('digest-time');
    if (el && s) el.value = utcToLocalTimeStr(s.hour, s.minute);
  });
  // Server version + cached app files (SW cache); if the cache lags the server, the phone is on stale files.
  Promise.all([api('/api/version'), caches?.keys() ?? []]).then(([v, ks]) => {
    const el = document.getElementById('app-version');
    const c = ks.find(k => k.startsWith('felix-cards-'))?.replace('felix-cards-', '');
    if (el && v) el.innerHTML = `Felix Cards ${v.version} · ${v.commit}${v.date ? ` · ${v.date}` : ''}${c ? `<br>app files ${c}` : ''}`;
  });
}

/* ── Daily reminder time (stored in UTC, edited in the browser's local time) ── */
function utcToLocalTimeStr(hour, minute) {
  const d = new Date();
  d.setUTCHours(hour, minute, 0, 0);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function localTimeStrToUtc(timeStr) {
  const [hour, minute] = timeStr.split(':').map(Number);
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return { hour: d.getUTCHours(), minute: d.getUTCMinutes() };
}

async function loadReminderTime() {
  const input = document.getElementById('reminder-time');
  if (!input) return;
  const { hour, minute } = await api('/api/settings/reminder');
  input.value = utcToLocalTimeStr(hour, minute);
}

async function saveReminderTime() {
  const input = document.getElementById('reminder-time');
  const status = document.getElementById('push-status');
  const { hour, minute } = localTimeStrToUtc(input.value);
  await api('/api/settings/reminder', { method: 'PUT', body: JSON.stringify({ hour, minute }) });
  if (status) status.textContent = `Reminder set for ${input.value} your time.`;
}

/* ── Push notifications ── */
function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64Safe);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function updatePushButton() {
  const btn = document.getElementById('push-enable-btn');
  if (!btn) return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    btn.textContent = 'Not supported';
    btn.disabled = true;
    return;
  }
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  btn.textContent = sub ? 'Enabled' : 'Enable';
}

async function enablePush() {
  const status = document.getElementById('push-status');
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    status.textContent = 'Push not supported in this browser. On iPhone: Share → Add to Home Screen, then open the app from your Home Screen.';
    return;
  }
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      status.textContent = 'Notification permission denied.';
      return;
    }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const { key } = await api('/api/push/vapid-public-key');
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
    }
    await api('/api/push/subscribe', { method: 'POST', body: JSON.stringify(sub.toJSON()) });
    status.textContent = 'Notifications enabled on this device.';
    updatePushButton();
  } catch (err) {
    status.textContent = `Failed: ${err.message}`;
  }
}

async function saveSilenceDays() {
  const input = document.getElementById('silence-days');
  const status = document.getElementById('push-status');
  const res = await api('/api/settings/silence', { method: 'PUT', body: JSON.stringify({ thresholdDays: Number(input.value) }) });
  if (status) status.textContent = res?.thresholdDays ? `You'll be nudged about decks untouched for ${res.thresholdDays} days.` : 'Enter a number of days between 1 and 365.';
}

async function sendTestSilence() {
  const status = document.getElementById('push-status');
  status.textContent = 'Checking…';
  const r = await api('/api/push/test-silence', { method: 'POST' });
  if (!r) { status.textContent = 'Failed to send.'; return; }
  status.textContent = r.decks.length
    ? `Quiet: ${r.decks.map(d => `${d.name} (${d.quietDays}d)`).join(', ')} — sent to ${r.sent}/${r.total} device(s).`
    : 'No deck is quiet past the threshold right now.';
}

async function saveDigestTime() {
  const input = document.getElementById('digest-time');
  const status = document.getElementById('push-status');
  const { hour, minute } = localTimeStrToUtc(input.value);
  await api('/api/settings/digest', { method: 'PUT', body: JSON.stringify({ hour, minute }) });
  if (status) status.textContent = `Digest email set for ${input.value} your time.`;
}

async function sendTestDigest() {
  const status = document.getElementById('push-status');
  status.textContent = 'Sending…';
  try {
    const r = await api('/api/digest/test', { method: 'POST' });
    status.textContent = r?.sent ? `Digest sent to ${r.to}.` : (r?.reason || 'Failed to send.');
  } catch { status.textContent = 'Failed to send.'; }
}

async function sendTestPush() {
  const status = document.getElementById('push-status');
  status.textContent = 'Sending…';
  const result = await api('/api/push/test', { method: 'POST' });
  status.textContent = result ? `Sent to ${result.sent}/${result.total} device(s).` : 'Failed to send.';
}

function renderGrowthChart(data) {
  const el = document.getElementById('growth-chart');
  if (!el) return;
  if (!data || data.length === 0 || data[data.length - 1].total === 0) {
    el.innerHTML = '<p class="text-muted text-sm text-center py-4">No words yet</p>';
    return;
  }

  const W = 300, H = 120, pad = 6;
  const max = Math.max(...data.map(d => d.total), 1);
  const min = Math.min(...data.map(d => d.total), 0);
  const range = Math.max(1, max - min);
  const stepX = (W - pad * 2) / Math.max(1, data.length - 1);
  const pts = data.map((d, i) => {
    const x = pad + i * stepX;
    const y = H - pad - ((d.total - min) / range) * (H - pad * 2);
    return [x, y];
  });
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${H - pad} L${pad},${H - pad} Z`;

  el.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="w-full">
      <defs>
        <linearGradient id="growthGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style="stop-color:rgb(var(--color-accent))" stop-opacity="0.25"/>
          <stop offset="100%" style="stop-color:rgb(var(--color-accent))" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${area}" fill="url(#growthGrad)"/>
      <path d="${line}" fill="none" style="stroke:rgb(var(--color-accent))" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${pts[pts.length - 1][0].toFixed(1)}" cy="${pts[pts.length - 1][1].toFixed(1)}" r="3.5" style="fill:rgb(var(--color-accent-dark))"/>
      <text x="${pad}" y="12" style="fill:rgb(var(--color-muted))" font-size="9" font-family="sans-serif">${min}</text>
      <text x="${(W - pad).toFixed(0)}" y="12" text-anchor="end" style="fill:rgb(var(--color-ink))" font-size="10" font-family="sans-serif" font-weight="bold">${max} words</text>
    </svg>`;
}

function renderHeatmap(data) {
  const el = document.getElementById('heatmap');
  if (!el) return;
  const max = Math.max(...data.map(d => d.count), 1);
  const weeks = Math.ceil(data.length / 7);
  const cell = 13, gap = 3, topPad = 4;
  const W = weeks * (cell + gap);
  const H = 7 * (cell + gap) + topPad;

  const shade = c => {
    if (!c) return 'rgb(var(--color-line))';
    const t = c / max;
    if (t > 0.66) return 'rgb(var(--color-accent-dark))';
    if (t > 0.33) return 'rgb(var(--color-accent))';
    return 'rgb(var(--color-accent-soft))';
  };

  // data[0] is oldest; align first column's weekday offset
  const firstDay = new Date(data[0].day + 'T12:00:00').getDay();
  const rects = data.map((d, i) => {
    const idx = i + firstDay;
    const col = Math.floor(idx / 7);
    const row = idx % 7;
    const x = col * (cell + gap);
    const y = topPad + row * (cell + gap);
    return `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2.5" style="fill:${shade(d.count)}"><title>${d.day}: ${d.count}</title></rect>`;
  }).join('');

  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="w-full" style="max-width:${W}px">${rects}</svg>`;
}

function renderWeeklyChart(data) {
  const el = document.getElementById('weekly-chart');
  if (!el) return;
  if (!data || data.every(d => d.count === 0)) {
    el.innerHTML = '<p class="text-muted text-sm text-center py-4">No reviews yet</p>';
    return;
  }

  const max = Math.max(...data.map(d => d.count), 1);
  const W = 280, H = 110, barW = 28, gap = 12;
  const totalW = data.length * (barW + gap) - gap;
  const sx = (W - totalW) / 2;
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const bars = data.map((d, i) => {
    const x = sx + i * (barW + gap);
    const bh = Math.max(4, ((d.count / max) * (H - 28)));
    const y = H - 20 - bh;
    const day = dayNames[new Date(d.day + 'T12:00:00').getDay()];
    return `
      <rect x="${x}" y="${y}" width="${barW}" height="${bh}" rx="4" style="fill:${d.count ? 'rgb(var(--color-accent))' : 'rgb(var(--color-line))'}"/>
      <text x="${x + barW / 2}" y="${H - 5}" text-anchor="middle" style="fill:rgb(var(--color-muted))" font-size="9" font-family="sans-serif">${day}</text>
      ${d.count ? `<text x="${x + barW / 2}" y="${y - 4}" text-anchor="middle" style="fill:rgb(var(--color-ink))" font-size="9" font-family="sans-serif">${d.count}</text>` : ''}
    `;
  }).join('');

  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="w-full">${bars}</svg>`;
}

/* ── Date helper (created_at stored as unix SECONDS) ── */
function fmtDate(sec) {
  const d = new Date(sec * 1000);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yest = new Date(today); yest.setDate(yest.getDate() - 1);
  const dOnly = new Date(d); dOnly.setHours(0, 0, 0, 0);
  if (dOnly.getTime() === today.getTime()) return 'Today';
  if (dOnly.getTime() === yest.getTime()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
}

/* ════════════════════════════════════════
   Screen: This Week recap
════════════════════════════════════════ */
async function renderRecap(app) {
  loading(app);
  const [recap] = await Promise.all([api('/api/recap'), api('/api/decks')]); // decks: language tag per card
  if (!recap) return;

  const start = new Date(); start.setDate(start.getDate() - 6);
  const fmt = d => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const remembered = recap.reviews_done ? Math.round(((recap.reviews_done - recap.forgot) / recap.reviews_done) * 100) : null;
  const rows = [
    ['New cards', recap.new_word_count],
    ['Reviews', recap.reviews_done],
    ['Days studied', `${recap.days_studied} <span class="text-muted">of 7</span>`],
    ['Remembered', remembered === null ? '<span class="text-muted">–</span>' : `${remembered}%`],
    ['Forgot', recap.forgot ? `<span class="text-rate-again">${recap.forgot}</span>` : '0'],
  ];

  // New cards grouped by the day they were added (Today, Yesterday, Thu, Oct 1…).
  const byDay = new Map();
  for (const w of recap.new_words) {
    const day = fmtDate(w.created_at);
    (byDay.get(day) || byDay.set(day, []).get(day)).push(w);
  }

  app.innerHTML = `
    <div class="px-4 pt-1 pb-10">
      <button onclick="navigate('#/stats')" class="h-11 -ml-2 pr-2 flex items-center text-[17px] text-accent active:opacity-60">${ICON.chevronLeft}Progress</button>
      <h1 class="px-1 text-[34px] leading-[41px] font-bold text-ink font-heading">This Week</h1>
      <p class="px-1 mt-1 text-[15px] text-muted">${fmt(start)} – ${fmt(new Date())}</p>

      <section class="mt-5 bg-surface rounded-[14px] overflow-hidden">
        ${rows.map(([label, value], i) => `
          <div class="pl-4"><div class="flex items-center justify-between min-h-12 pr-4 ${i < rows.length - 1 ? 'border-b border-line' : ''}">
            <span class="text-[17px] text-ink">${label}</span><span class="text-[17px] text-ink">${value}</span>
          </div></div>`).join('')}
      </section>

      ${byDay.size === 0 ? `
        ${groupLabel('New cards')}
        <p class="px-4 text-[15px] text-muted">No cards added this week.</p>` : [...byDay].map(([day, words]) => `
        ${groupLabel(escHtml(day))}
        <section class="bg-surface rounded-[14px] overflow-hidden">
          ${words.map((w, i) => {
            const front = previewParts(w.front), back = previewParts(w.back);
            const ct = cardText(deckById[w.deck_id]);
            const label = w.type && w.type !== 'vocab' ? ({ phrasal: 'Phrasal verb' }[w.type] || w.type) : '';
            return `
            <div class="pl-4"><button onclick="navigate('#/cards/${w.id}/edit?deck=${w.deck_id}&ret=${encodeURIComponent('#/recap')}')"
              class="w-full flex items-center gap-3 min-h-[60px] py-2 pr-4 text-left active:opacity-60 ${i < words.length - 1 ? 'border-b border-line' : ''}">
              ${front.imageUrl ? `<img src="${escHtml(front.imageUrl)}" alt="" loading="lazy" class="w-10 h-10 rounded-lg object-cover flex-shrink-0">` : ''}
              <span class="flex-1 min-w-0"${ct.attr}>
                <span class="block truncate text-[17px] leading-[22px] text-ink">${escHtml(front.text || 'Image')}</span>
                <span class="block truncate text-[15px] leading-5 text-muted">${escHtml(back.text || (back.imageUrl ? 'Image' : ''))}</span>
              </span>
              <span class="flex-shrink-0 max-w-[35%] truncate text-[13px] text-muted">${escHtml(w.deck_name)}${label ? ` · ${escHtml(label)}` : ''}</span>
            </button></div>`;
          }).join('')}
        </section>`).join('')}
    </div>
  `;
}
