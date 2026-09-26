/* ── Theme (Light / Dark / System) ── */
const THEME_KEY = 'fc_theme';
const THEME_COLORS = { light: '#C2410C', dark: '#E2662E' };

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
    btn.classList.toggle('bg-accent', active);
    btn.classList.toggle('border-accent', active);
    btn.classList.toggle('text-on-accent', active);
    btn.classList.toggle('border-line', !active);
    btn.classList.toggle('text-muted', !active);
  });
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (getThemePref() === 'system') applyTheme();
});

applyTheme();

/* ── Markdown helper ── */
const md = text => {
  if (!text) return '';
  if (typeof marked === 'function') return marked(text);
  if (marked && marked.parse) return marked.parse(text);
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
  textarea.dispatchEvent(new Event('input'));
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
const speakerOffSVG = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5L6 9H2v6h4l5 4V5z"/><line stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="23" y1="9" x2="17" y2="15"/><line stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="17" y1="9" x2="23" y2="15"/></svg>`;

let ttsEnabled = localStorage.getItem('fc_tts') !== 'false'; // default ON

const TTS_MODES = ['both', 'front', 'back']; // cycle order
let ttsMode = TTS_MODES.includes(localStorage.getItem('fc_tts_mode')) ? localStorage.getItem('fc_tts_mode') : 'both';

function cycleTTSMode() {
  const i = TTS_MODES.indexOf(ttsMode);
  ttsMode = TTS_MODES[(i + 1) % TTS_MODES.length];
  localStorage.setItem('fc_tts_mode', ttsMode);
  updateTTSModeButton();
}

function updateTTSModeButton() {
  const btn = document.getElementById('tts-mode-btn');
  if (!btn) return;
  const labels = { both: 'Front + Back', front: 'Front only', back: 'Back only' };
  btn.textContent = labels[ttsMode];
  btn.title = 'Tap to change what gets spoken';
}

function stripHtml(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
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

function speak(text) {
  if (!ttsEnabled || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(stripHtml(md(text)));
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
  const btn = document.getElementById('tts-btn');
  if (!btn) return;
  btn.title = ttsEnabled ? 'Mute TTS' : 'Unmute TTS';
  btn.innerHTML = ttsEnabled ? speakerOnSVG : speakerOffSVG;
  btn.classList.toggle('text-accent', ttsEnabled);
  btn.classList.toggle('text-muted', !ttsEnabled);
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
async function api(path, opts = {}) {
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
    renderStudy(app, m[1], params.get('favorites') === '1');
  } else if ((m = hash.match(/^#\/cards\/new/))) {
    setActiveNav('');
    const params = new URLSearchParams(hash.split('?')[1] || '');
    renderEditCard(app, null, params.get('deck'));
  } else if ((m = hash.match(/^#\/cards\/(\d+)\/edit/))) {
    setActiveNav('');
    const params = new URLSearchParams(hash.split('?')[1] || '');
    renderEditCard(app, m[1], params.get('deck'));
  } else if (hash === '#/journal') {
    setActiveNav('journal');
    renderJournal(app);
  } else if ((m = hash.match(/^#\/journal\/new/))) {
    setActiveNav('journal');
    renderJournalEntry(app, null);
  } else if ((m = hash.match(/^#\/journal\/(\d+)\/edit/))) {
    setActiveNav('journal');
    renderJournalEntry(app, m[1]);
  } else if (hash === '#/recap') {
    setActiveNav('');
    renderRecap(app);
  } else if (hash === '#/stats') {
    setActiveNav('stats');
    renderStats(app);
  } else {
    navigate('#/');
  }
}

window.addEventListener('hashchange', router);
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
  const [decks, recap] = await Promise.all([api('/api/decks'), api('/api/recap')]);
  if (!decks) return;

  const totalDue = decks.reduce((s, d) => s + (d.due_count || 0), 0);
  const hasRecap = recap && (recap.new_word_count || recap.reviews_done || recap.journal_count);

  app.innerHTML = `
    <div class="p-4 pt-6">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold text-ink font-heading">My Decks</h1>
        ${totalDue > 0 ? `
          <button onclick="navigate('#/study/all')"
            class="bg-accent hover:bg-accent-dark text-on-accent px-4 h-10 rounded-xl text-sm font-semibold transition-colors">
            Study All (${totalDue})
          </button>` : ''}
      </div>

      ${hasRecap ? `
        <div onclick="navigate('#/recap')"
          class="bg-gradient-to-r from-accent/15 to-accent/5 border border-accent/30 rounded-2xl p-4 mb-5 cursor-pointer active:scale-[0.99] transition-transform">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-xs font-semibold text-accent-dark uppercase tracking-wider mb-1">This week</p>
              <p class="text-sm text-ink/80">
                <span class="font-bold text-ink">${recap.new_word_count}</span> new words ·
                <span class="font-bold text-ink">${recap.reviews_done}</span> reviews ·
                <span class="font-bold text-ink">${recap.journal_count}</span> journal
              </p>
            </div>
            <svg class="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
            </svg>
          </div>
        </div>` : ''}

      ${decks.length === 0 ? `
        <div class="text-center py-20 text-muted">
          <div class="text-5xl mb-4">📚</div>
          <p class="text-lg font-medium text-muted">No decks yet</p>
          <p class="text-sm mt-1">Tap + to create your first deck</p>
        </div>` : `
        <div class="space-y-3">
          ${decks.map(d => `
            <div onclick="navigate('#/decks/${d.id}')"
              class="bg-surface rounded-2xl p-4 flex items-center justify-between cursor-pointer active:scale-[0.98] transition-transform">
              <div>
                <h2 class="font-semibold text-ink">${escHtml(d.name)}</h2>
                <p class="text-sm text-muted mt-0.5">${d.total_count || 0} cards</p>
              </div>
              <div class="flex items-center gap-3">
                ${(d.due_count || 0) > 0
                  ? `<span class="bg-accent text-on-accent text-xs font-bold px-2.5 py-1 rounded-full">${d.due_count}</span>`
                  : `<span class="text-muted text-xs">Up to date</span>`}
                <svg class="w-5 h-5 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                </svg>
              </div>
            </div>`).join('')}
        </div>`}
    </div>

    <!-- FAB -->
    <button onclick="showNewDeckModal()"
      class="fixed bottom-24 right-5 w-14 h-14 bg-accent hover:bg-accent-dark active:bg-accent-dark rounded-full shadow-lg shadow-ink/20 flex items-center justify-center text-on-accent text-3xl font-light transition-colors z-30">
      +
    </button>

    <!-- New Deck Modal -->
    <div id="new-deck-modal" class="hidden fixed inset-0 bg-black/70 flex items-end justify-center z-50 p-4" onclick="hideNewDeckModal(event)">
      <div class="bg-surface rounded-2xl p-6 w-full max-w-sm mb-2" onclick="event.stopPropagation()">
        <h2 class="text-lg font-semibold text-ink mb-4 font-heading">New Deck</h2>
        <input id="new-deck-name" type="text" placeholder="Deck name"
          class="w-full bg-base border border-line rounded-xl px-4 h-12 text-ink focus:outline-none focus:border-accent mb-4"/>
        <div class="flex gap-3">
          <button onclick="hideNewDeckModal()"
            class="flex-1 h-12 border border-line rounded-xl text-muted hover:text-ink transition-colors">Cancel</button>
          <button onclick="createDeck()"
            class="flex-1 h-12 bg-accent hover:bg-accent-dark rounded-xl text-on-accent font-semibold transition-colors">Create</button>
        </div>
      </div>
    </div>
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
  await api('/api/decks', { method: 'POST', body: JSON.stringify({ name }) });
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

  app.innerHTML = `
    <div class="p-4 pt-6">
      <div class="flex items-center gap-2 mb-5">
        <button onclick="navigate('#/')"
          class="w-10 h-10 flex items-center justify-center text-muted hover:text-ink transition-colors -ml-2 flex-shrink-0">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <div class="flex-1 min-w-0">
          <h1 class="text-xl font-bold text-ink truncate font-heading">${escHtml(deck.name)}</h1>
          <p class="text-sm text-muted">${cards.length} cards${dueCount > 0 ? ` · ${dueCount} due` : ''}</p>
        </div>
        <button onclick="showDeckMenu()"
          class="w-10 h-10 flex items-center justify-center text-muted hover:text-ink transition-colors flex-shrink-0">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"/>
          </svg>
        </button>
      </div>

      <div class="flex gap-2 mb-5">
        <button
          onclick="${dueCount > 0 ? `navigate('#/study/${deckId}')` : 'void(0)'}"
          class="flex-1 h-12 ${dueCount > 0 ? 'bg-accent hover:bg-accent-dark text-on-accent' : 'bg-surface text-muted cursor-not-allowed'} rounded-xl font-semibold transition-colors">
          ${dueCount > 0 ? `Study (${dueCount})` : 'No cards due'}
        </button>
        <button onclick="navigate('#/cards/new?deck=${deckId}')"
          class="h-12 px-4 border border-line rounded-xl text-ink/80 hover:text-ink hover:border-accent/50 transition-colors whitespace-nowrap">
          + Add
        </button>
        <button onclick="navigate('#/decks/${deckId}/import')"
          class="h-12 px-4 border border-line rounded-xl text-ink/80 hover:text-ink hover:border-accent/50 transition-colors">
          Import
        </button>
      </div>

      <button id="study-fav-btn" onclick="navigate('#/study/${deckId}?favorites=1')"
        class="${favoriteCount > 0 ? '' : 'hidden'} w-full h-11 mb-5 border border-rate-hard/40 text-rate-hard rounded-xl font-semibold text-sm hover:bg-rate-hard/10 transition-colors flex items-center justify-center gap-2">
        ${starSVG(true)} <span id="study-fav-count">Study Favorites (${favoriteCount})</span>
      </button>

      ${cards.length === 0 ? `
        <div class="text-center py-14 text-muted">
          <div class="text-4xl mb-3">🃏</div>
          <p class="font-medium text-muted">No cards yet</p>
          <p class="text-sm mt-1">Add cards or use Import</p>
        </div>` : `
        <div class="space-y-2">
          ${cards.map(c => {
            const front = previewParts(c.front);
            const back = previewParts(c.back);
            const thumb = front.imageUrl || back.imageUrl;
            return `
            <div class="bg-surface rounded-xl p-4 flex items-center gap-3">
              ${thumb ? `<img src="${escHtml(thumb)}" loading="lazy" class="w-11 h-11 rounded-lg object-cover flex-shrink-0">` : ''}
              <div class="flex-1 min-w-0">
                <p class="text-ink truncate text-sm font-medium">${escHtml(front.text || (front.imageUrl ? '🖼 Image' : ''))}</p>
                <p class="text-muted text-xs truncate mt-0.5">${escHtml(back.text || (back.imageUrl ? '🖼 Image' : ''))}</p>
              </div>
              <div class="flex gap-1 flex-shrink-0">
                <button id="fav-btn-${c.id}" data-fav="${c.is_favorite ? '1' : '0'}" onclick="toggleFavoriteInList(${c.id}, 'fav-btn-${c.id}')"
                  class="w-9 h-9 flex items-center justify-center ${c.is_favorite ? 'text-rate-hard' : 'text-muted'} hover:text-rate-hard transition-colors rounded-lg hover:bg-base">
                  ${starSVG(c.is_favorite)}
                </button>
                <button onclick="navigate('#/cards/${c.id}/edit?deck=${deckId}')"
                  class="w-9 h-9 flex items-center justify-center text-muted hover:text-ink transition-colors rounded-lg hover:bg-base">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                  </svg>
                </button>
                <button onclick="deleteCard(${c.id}, ${deckId})"
                  class="w-9 h-9 flex items-center justify-center text-muted hover:text-rate-again transition-colors rounded-lg hover:bg-base">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                  </svg>
                </button>
              </div>
            </div>`;
          }).join('')}
        </div>`}
    </div>

    <!-- Deck Menu -->
    <div id="deck-menu" class="hidden fixed inset-0 bg-black/70 flex items-end justify-center z-50 p-4" onclick="hideDeckMenu(event)">
      <div class="bg-surface rounded-2xl p-3 w-full max-w-sm mb-2" onclick="event.stopPropagation()">
        <button onclick="showRenameModal()"
          class="w-full h-12 flex items-center gap-3 px-4 rounded-xl text-ink/80 hover:text-ink hover:bg-base transition-colors">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
          </svg>
          Rename Deck
        </button>
        <label class="w-full min-h-12 flex items-center gap-3 px-4 py-2 rounded-xl text-ink/80">
          <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
          </svg>
          <span class="flex-1">
            Target retention
            <span id="retention-hint" class="block text-xs text-muted">Higher = remember more, review more often</span>
          </span>
          <select onchange="saveRetention(${deckId}, this.value)"
            class="h-10 bg-base border border-line rounded-lg px-2 text-ink text-sm focus:outline-none focus:border-accent">
            ${[0.8, 0.85, 0.9, 0.95].map(r => `<option value="${r}"${Math.abs(r - deck.target_retention) < 1e-9 ? ' selected' : ''}>${Math.round(r * 100)}%</option>`).join('')}
          </select>
        </label>
        <button onclick="deleteDeck(${deckId})"
          class="w-full h-12 flex items-center gap-3 px-4 rounded-xl text-rate-again hover:text-rate-again hover:bg-base transition-colors">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
          </svg>
          Delete Deck
        </button>
      </div>
    </div>

    <!-- Rename Modal -->
    <div id="rename-modal" class="hidden fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div class="bg-surface rounded-2xl p-6 w-full max-w-sm">
        <h2 class="text-lg font-semibold text-ink mb-4 font-heading">Rename Deck</h2>
        <input id="rename-input" type="text" value="${escHtml(deck.name)}"
          class="w-full bg-base border border-line rounded-xl px-4 h-12 text-ink focus:outline-none focus:border-accent mb-4"/>
        <div class="flex gap-3">
          <button onclick="hideRenameModal()"
            class="flex-1 h-12 border border-line rounded-xl text-muted hover:text-ink transition-colors">Cancel</button>
          <button onclick="renameDeck(${deckId})"
            class="flex-1 h-12 bg-accent hover:bg-accent-dark rounded-xl text-on-accent font-semibold transition-colors">Save</button>
        </div>
      </div>
    </div>

  `;
}

function showDeckMenu() { showModal('deck-menu'); }
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
  if (hint) hint.textContent = res ? `Saved — applies from each card's next review` : 'Could not save';
}
async function deleteDeck(deckId) {
  hideDeckMenu();
  if (!confirm('Delete this deck and all its cards? This cannot be undone.')) return;
  await api(`/api/decks/${deckId}`, { method: 'DELETE' });
  navigate('#/');
}
async function deleteCard(cardId, deckId) {
  if (!confirm('Delete this card?')) return;
  await api(`/api/cards/${cardId}`, { method: 'DELETE' });
  renderDeckDetail(document.getElementById('app'), deckId);
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
    <div class="p-4 pt-6">
      <div class="flex items-center gap-2 mb-5">
        <button onclick="navigate('#/decks/${deckId}')"
          class="w-10 h-10 flex items-center justify-center text-muted hover:text-ink transition-colors -ml-2 flex-shrink-0">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <div class="flex-1 min-w-0">
          <h1 class="text-xl font-bold text-ink font-heading">Import Cards</h1>
          <p class="text-sm text-muted truncate">into ${escHtml(deck.name)}</p>
        </div>
      </div>

      <p class="text-sm text-muted mb-3">A CSV/TSV file, or one card per line as <code class="text-accent bg-base px-1 rounded">front | back</code>.</p>
      <label class="flex items-center justify-center h-12 border border-dashed border-line rounded-xl text-ink/80 hover:border-accent/50 cursor-pointer mb-3">
        <input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" class="hidden" onchange="impLoadFile(this)">
        Choose a file…
      </label>
      <textarea id="imp-paste" rows="4" placeholder="…or paste here"
        class="w-full bg-surface border border-line rounded-xl px-4 py-3 text-ink text-sm font-mono focus:outline-none focus:border-accent resize-y"></textarea>
      <button onclick="impLoadText(document.getElementById('imp-paste').value)"
        class="w-full h-11 mt-2 border border-line rounded-xl text-ink/80 hover:text-ink hover:border-accent/50 transition-colors">Preview pasted text</button>

      <div id="imp-body" class="mt-6"></div>
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
    document.getElementById('imp-body').innerHTML = '<p class="text-muted text-sm text-center py-6">Nothing to import.</p>';
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
    (optional ? `<option value="-1"${sel < 0 ? ' selected' : ''}>— none —</option>` : '') +
    Array.from({ length: imp.width }, (_, i) => `<option value="${i}"${i === sel ? ' selected' : ''}>${escHtml(label(i))}</option>`).join('');
  const select = (field, optional) => `
    <label class="block">
      <span class="text-xs font-semibold text-muted uppercase tracking-wider">${field}${optional ? ' (optional)' : ''}</span>
      <select onchange="imp.map.${field} = +this.value; impBuildRows(); impRender()"
        class="mt-1 w-full h-11 bg-surface border border-line rounded-xl px-3 text-ink text-sm focus:outline-none focus:border-accent">${options(imp.map[field], optional)}</select>
    </label>`;

  document.getElementById('imp-body').innerHTML = `
    <h2 class="text-sm font-semibold text-muted uppercase tracking-wider mb-3">Columns</h2>
    <label class="flex items-center gap-2 text-sm text-ink mb-3">
      <input type="checkbox" class="w-4 h-4 accent-accent" ${imp.header ? 'checked' : ''} onchange="imp.header = this.checked; impBuildRows(); impRender()">
      First row is a header
    </label>
    <div class="grid grid-cols-3 gap-2 mb-6">${select('front')}${select('back')}${select('example', true)}</div>
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
  const chip = (cls, text) => `<span class="text-[11px] px-2 py-0.5 rounded-full ${cls}">${text}</span>`;

  document.getElementById('imp-review').innerHTML = `
    <div class="flex items-center justify-between mb-3">
      <h2 class="text-sm font-semibold text-muted uppercase tracking-wider">Review · ${ready} of ${rows.length}</h2>
      <label class="flex items-center gap-2 text-xs text-muted">
        <input type="checkbox" class="accent-accent" ${imp.onlyFlagged ? 'checked' : ''} onchange="imp.onlyFlagged = this.checked; impRenderReview()">
        Flagged only
      </label>
    </div>
    <div class="flex flex-wrap gap-2 mb-3">
      ${nWarn ? chip('bg-rate-hard/10 text-rate-hard', `${nWarn} to double-check`) : ''}
      ${nDup ? chip('bg-line/60 text-muted', `${nDup} duplicate${nDup > 1 ? 's' : ''} skipped`) : ''}
      ${nBad ? chip('bg-rate-again/10 text-rate-again', `${nBad} incomplete`) : ''}
    </div>

    <div class="space-y-2 mb-6">
      ${shown.length === 0 ? '<p class="text-muted text-sm text-center py-6">Nothing flagged.</p>' : shown.map(([r, i]) => `
        <div class="bg-surface rounded-xl p-3 border ${r.error ? 'border-rate-again/40' : r.dup ? 'border-line opacity-60' : r.warn.length ? 'border-rate-hard/40' : 'border-transparent'}">
          <div class="flex items-start gap-3">
            <input type="checkbox" class="mt-2.5 w-5 h-5 accent-accent flex-shrink-0" ${impIncluded(r) ? 'checked' : ''} ${r.error || r.dup ? 'disabled' : ''}
              onchange="imp.rows[${i}].skip = !this.checked; impRenderReview()">
            <div class="flex-1 min-w-0 space-y-1.5">
              <textarea rows="1" placeholder="Front" onchange="impEdit(${i}, 'front', this.value)"
                class="w-full bg-base border border-line rounded-lg px-3 py-2 text-sm text-ink font-medium resize-y focus:outline-none focus:border-accent">${escHtml(r.front)}</textarea>
              <textarea rows="1" placeholder="Back" onchange="impEdit(${i}, 'back', this.value)"
                class="w-full bg-base border border-line rounded-lg px-3 py-2 text-sm text-ink resize-y focus:outline-none focus:border-accent">${escHtml(r.back)}</textarea>
              ${r.example ? `<p class="text-xs text-muted italic truncate">${escHtml(previewParts(r.example).text)}</p>` : ''}
              ${r.error || r.dup || r.warn.length ? `<div class="flex flex-wrap gap-1.5">
                ${r.error ? chip('bg-rate-again/10 text-rate-again', r.error) : ''}
                ${r.dup ? chip('bg-line/60 text-muted', r.dup) : ''}
                ${r.warn.map(w => chip('bg-rate-hard/10 text-rate-hard', w)).join('')}
              </div>` : ''}
            </div>
          </div>
        </div>`).join('')}
    </div>

    <h2 class="text-sm font-semibold text-muted uppercase tracking-wider mb-2">Pacing</h2>
    <select onchange="imp.spreadDays = +this.value; impRenderReview()"
      class="w-full h-11 bg-surface border border-line rounded-xl px-3 text-ink text-sm focus:outline-none focus:border-accent">
      ${SPREAD_OPTIONS.map(([d, l]) => `<option value="${d}"${d === imp.spreadDays ? ' selected' : ''}>${l}</option>`).join('')}
    </select>
    <p class="text-xs text-muted mt-1.5 mb-6">${imp.spreadDays ? `≈ ${perDay} new card${perDay !== 1 ? 's' : ''} per day, so a big import doesn't pile up as one backlog.` : 'Every imported card is due right away.'}</p>

    <button id="imp-submit" onclick="impSubmit()" ${ready ? '' : 'disabled'}
      class="w-full h-12 rounded-xl font-semibold transition-colors ${ready ? 'bg-accent hover:bg-accent-dark text-on-accent' : 'bg-surface text-muted cursor-not-allowed'}">
      Import ${ready} card${ready !== 1 ? 's' : ''}
    </button>
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

async function renderStudy(app, deckId, favoritesOnly = false) {
  app.innerHTML = `<div class="flex items-center justify-center h-64 text-muted">Loading cards...</div>`;
  const url = favoritesOnly
    ? (deckId === 'all' ? '/api/cards/favorites' : `/api/decks/${deckId}/favorites`)
    : (deckId === 'all' ? '/api/cards/due?ahead=3' : `/api/decks/${deckId}/due?ahead=3`);
  let cards = await api(url);
  if (!cards) return;
  // The list includes the next 3 days so the SW's cached copy stays useful
  // offline; what's actually due is decided by this device's clock.
  if (!favoritesOnly) cards = cards.filter(c => c.next_review <= Date.now());

  if (cards.length === 0) {
    app.innerHTML = `
      <div class="flex flex-col items-center justify-center min-h-[70vh] p-8 text-center">
        <div class="text-6xl mb-4">${favoritesOnly ? '⭐' : '🎉'}</div>
        <h2 class="text-2xl font-bold text-ink mb-2 font-heading">${favoritesOnly ? 'No favorites yet' : 'All caught up!'}</h2>
        <p class="text-muted mb-8">${favoritesOnly ? 'Star a card to add it here.' : 'No cards due right now.'}</p>
        <button onclick="leaveStudy('#/')"
          class="h-12 px-8 bg-accent hover:bg-accent-dark rounded-xl text-on-accent font-semibold transition-colors">
          Back to Decks
        </button>
      </div>`;
    return;
  }

  study = { cards, index: 0, flipped: false, ratings: { 1: 0, 2: 0, 3: 0, 4: 0 }, deckId, favoritesOnly };
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
  ['fav-btn-front', 'fav-btn-back'].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.classList.toggle('text-rate-hard', !!card.is_favorite);
    btn.classList.toggle('text-muted', !card.is_favorite);
    btn.innerHTML = starSVG(card.is_favorite);
    btn.title = card.is_favorite ? 'Remove from favorites' : 'Add to favorites';
    if (card.is_favorite) popFavorite(btn);
  });
  trackWrite(api(`/api/cards/${card.id}/favorite`, { method: 'POST', body: JSON.stringify({ favorite: !!card.is_favorite }) }).catch(() => {}));
}

function toggleFavoriteInList(cardId, btnId) {
  const btn = document.getElementById(btnId);
  const favorite = btn.dataset.fav !== '1';
  btn.dataset.fav = favorite ? '1' : '0';
  btn.classList.toggle('text-rate-hard', favorite);
  btn.classList.toggle('text-muted', !favorite);
  btn.innerHTML = starSVG(favorite);
  if (favorite) popFavorite(btn);
  api(`/api/cards/${cardId}/favorite`, { method: 'POST', body: JSON.stringify({ favorite }) }).catch(() => {});

  // Keep the "Study Favorites" button in sync without a full re-fetch —
  // it was previously computed once at render and never touched again.
  const count = document.querySelectorAll('[id^="fav-btn-"][data-fav="1"]').length;
  const favBtn = document.getElementById('study-fav-btn');
  if (favBtn) {
    favBtn.classList.toggle('hidden', count === 0);
    document.getElementById('study-fav-count').textContent = `Study Favorites (${count})`;
  }
}

function drawStudyCard() {
  const app = document.getElementById('app');
  const { cards, index, flipped, ratings, deckId } = study;

  if (index >= cards.length) {
    const total = cards.length;
    app.innerHTML = `
      <div class="flex flex-col items-center justify-center min-h-[70vh] p-6 text-center">
        <div class="text-6xl mb-4">✅</div>
        <h2 class="text-2xl font-bold text-ink mb-1 font-heading">Session Complete!</h2>
        <p class="text-muted mb-8">Reviewed ${total} card${total !== 1 ? 's' : ''}</p>
        <div class="grid grid-cols-2 gap-3 w-full max-w-xs mb-8">
          <div class="bg-rate-again/10 border border-rate-again/30 rounded-xl p-3">
            <div class="text-2xl font-bold text-rate-again">${ratings[1]}</div>
            <div class="text-sm text-rate-again/70">Again</div>
          </div>
          <div class="bg-rate-hard/10 border border-rate-hard/30 rounded-xl p-3">
            <div class="text-2xl font-bold text-rate-hard">${ratings[2]}</div>
            <div class="text-sm text-rate-hard/70">Hard</div>
          </div>
          <div class="bg-rate-good/10 border border-rate-good/30 rounded-xl p-3">
            <div class="text-2xl font-bold text-rate-good">${ratings[3]}</div>
            <div class="text-sm text-rate-good/70">Good</div>
          </div>
          <div class="bg-rate-easy/10 border border-rate-easy/30 rounded-xl p-3">
            <div class="text-2xl font-bold text-rate-easy">${ratings[4]}</div>
            <div class="text-sm text-rate-easy/70">Easy</div>
          </div>
        </div>
        <button onclick="leaveStudy('#/')"
          class="h-12 px-8 bg-accent hover:bg-accent-dark rounded-xl text-on-accent font-semibold transition-colors">
          Back to Decks
        </button>
      </div>`;
    return;
  }

  const card = cards[index];
  const total = cards.length;
  const progress = Math.round((index / total) * 100);
  const backHash = deckId === 'all' ? '#/' : `#/decks/${deckId}`;
  const badge = typeBadge(card.type);
  const backSpeak = card.example ? `${card.back}. ${card.example}` : card.back;

  app.innerHTML = `
    <div class="flex flex-col min-h-screen p-4 pt-5 pb-32">
      <!-- Progress bar -->
      <div class="flex items-center gap-3 mb-5">
        <button onclick="leaveStudy('${backHash}')"
          class="w-10 h-10 flex items-center justify-center text-muted hover:text-ink transition-colors -ml-2 flex-shrink-0">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
        <div class="flex-1 bg-line rounded-full h-1.5">
          <div class="bg-accent h-1.5 rounded-full transition-all duration-300" style="width:${progress}%"></div>
        </div>
        <span class="text-muted text-sm flex-shrink-0">${index + 1} / ${total}</span>
        <button id="tts-btn" onclick="toggleTTS()"
          class="w-9 h-9 flex items-center justify-center ${ttsEnabled ? 'text-accent' : 'text-muted'} hover:text-ink transition-colors flex-shrink-0"
          title="${ttsEnabled ? 'Mute TTS' : 'Unmute TTS'}">
          ${ttsEnabled ? speakerOnSVG : speakerOffSVG}
        </button>
      </div>

      ${ttsEnabled ? `
        <div class="flex justify-end -mt-3 mb-3">
          <button id="tts-mode-btn" onclick="cycleTTSMode()"
            class="text-xs text-accent/80 hover:text-accent bg-accent/10 px-3 py-1 rounded-full transition-colors"
            title="Tap to change what gets spoken">
            ${{ both: 'Front + Back', front: 'Front only', back: 'Back only' }[ttsMode]}
          </button>
        </div>` : ''}

      <!-- Card -->
      <div class="flex-1 flex items-center justify-center">
        <div class="card-scene w-full animate-card-in" style="height:260px" id="card-scene" onclick="flipCard()">
          <div class="card-inner w-full h-full${flipped ? ' flipped' : ''}" id="card-inner">
            <div class="card-front absolute inset-0 bg-surface rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer shadow-lg shadow-ink/10 select-none">
              <div class="prose-content text-ink text-xl text-center leading-relaxed">${md(card.front)}</div>
              <p class="text-muted text-xs mt-4">tap to reveal</p>
              <button id="fav-btn-front" onclick="event.stopPropagation(); toggleFavoriteInStudy()"
                class="absolute bottom-3 left-3 w-8 h-8 flex items-center justify-center ${card.is_favorite ? 'text-rate-hard' : 'text-muted'} hover:text-rate-hard transition-colors"
                title="${card.is_favorite ? 'Remove from favorites' : 'Add to favorites'}">
                ${starSVG(card.is_favorite)}
              </button>
              <button onclick="event.stopPropagation(); speak(${escHtml(JSON.stringify(card.front))})"
                class="absolute bottom-3 right-3 w-8 h-8 flex items-center justify-center text-muted hover:text-ink transition-colors"
                title="Replay">
                ${speakerOnSVG}
              </button>
            </div>
            <div class="card-back absolute inset-0 bg-accent/5 border border-accent/20 rounded-2xl p-5 flex flex-col items-center justify-center cursor-pointer shadow-lg shadow-ink/10 select-none overflow-y-auto">
              ${badge ? `<div class="mb-2">${badge}</div>` : ''}
              <div class="prose-content text-ink text-lg text-center leading-relaxed">${md(card.back)}</div>
              ${card.example ? `
                <div class="mt-3 pt-3 border-t border-accent/20 w-full">
                  <div class="prose-content text-muted text-sm text-center italic leading-relaxed">${md(card.example)}</div>
                </div>` : ''}
              <button id="fav-btn-back" onclick="event.stopPropagation(); toggleFavoriteInStudy()"
                class="absolute bottom-3 left-3 w-8 h-8 flex items-center justify-center ${card.is_favorite ? 'text-rate-hard' : 'text-muted'} hover:text-rate-hard transition-colors"
                title="${card.is_favorite ? 'Remove from favorites' : 'Add to favorites'}">
                ${starSVG(card.is_favorite)}
              </button>
              <button onclick="event.stopPropagation(); speak(${escHtml(JSON.stringify(backSpeak))})"
                class="absolute bottom-3 right-3 w-8 h-8 flex items-center justify-center text-accent/50 hover:text-accent transition-colors"
                title="Replay">
                ${speakerOnSVG}
              </button>
            </div>
          </div>
        </div>
      </div>

      ${!flipped ? `
        <p class="text-center text-muted text-xs mt-4">swipe left = Again &nbsp;·&nbsp; swipe right = Easy</p>` : ''}
    </div>

    <!-- Rating buttons: pinned to the bottom of the viewport so they're always
         reachable without scrolling, no matter how long the card content is. -->
    <div id="rating-btns" class="${flipped ? '' : 'invisible'} fixed bottom-0 left-0 right-0 z-30 bg-paper/95 backdrop-blur border-t border-line/60 px-4 pt-3 safe-bottom grid grid-cols-2 gap-2">
      <button onclick="rate(1)"
        class="h-14 bg-rate-again/10 border border-rate-again/40 rounded-xl text-rate-again font-semibold hover:bg-rate-again/20 active:scale-95 transition-all text-sm">
        Again
      </button>
      <button onclick="rate(2)"
        class="h-14 bg-rate-hard/10 border border-rate-hard/40 rounded-xl text-rate-hard font-semibold hover:bg-rate-hard/20 active:scale-95 transition-all text-sm">
        Hard
      </button>
      <button onclick="rate(3)"
        class="h-14 bg-rate-good/10 border border-rate-good/40 rounded-xl text-rate-good font-semibold hover:bg-rate-good/20 active:scale-95 transition-all text-sm">
        Good
      </button>
      <button onclick="rate(4)"
        class="h-14 bg-rate-easy/10 border border-rate-easy/40 rounded-xl text-rate-easy font-semibold hover:bg-rate-easy/20 active:scale-95 transition-all text-sm">
        Easy
      </button>
      <div class="col-span-2 h-3"></div>
    </div>
  `;

  setupSwipe();
  if (ttsMode === 'both' || ttsMode === 'front') speak(card.front);
}

function flipCard() {
  if (!study) return;
  study.flipped = !study.flipped;
  document.getElementById('card-inner')?.classList.toggle('flipped', study.flipped);
  document.getElementById('rating-btns')?.classList.toggle('invisible', !study.flipped);

  const c = study.cards[study.index];
  if (study.flipped) {
    if (ttsMode === 'both' || ttsMode === 'back') speak(c.example ? `${c.back}. ${c.example}` : c.back);
  } else {
    if (ttsMode === 'both' || ttsMode === 'front') speak(c.front);
  }
}

/* Small pill showing the card's chunk type (hidden for plain vocab) */
function typeBadge(type) {
  const labels = {
    collocation: 'Collocation',
    phrasal: 'Phrasal verb',
    idiom: 'Idiom',
    sentence: 'Sentence',
  };
  if (!labels[type]) return '';
  return `<span class="inline-block bg-accent/15 text-accent-dark text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full">${labels[type]}</span>`;
}

// Fire a study-screen write (review or favorite) without blocking the UI,
// but track it so leaveStudy() can wait for it — otherwise whatever screen
// you land on can still reflect the pre-write state if it hasn't landed yet.
function trackWrite(promise) {
  (study.pending ||= []).push(promise);
  return promise;
}

async function rate(rating) {
  if (!study) return;
  const card = study.cards[study.index];
  study.ratings[rating]++;
  study.index++;
  study.flipped = false;
  window.speechSynthesis?.cancel();
  trackWrite(api(`/api/cards/${card.id}/review`, { method: 'POST', body: JSON.stringify({ rating, at: Date.now() }) }).catch(() => {}));
  drawStudyCard();
}

// Leaving study (back arrow or "Back to Decks") always routes through here so
// due-count/favorite state on the screen you land on is fresh immediately.
async function leaveStudy(hash) {
  await Promise.all(study?.pending || []);
  navigate(hash);
}

function setupSwipe() {
  const scene = document.getElementById('card-scene');
  if (!scene) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let startX = 0, startY = 0, dragging = false;

  scene.addEventListener('touchstart', e => {
    if (study.flipped) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    dragging = true;
    scene.style.transition = 'none';
  }, { passive: true });

  scene.addEventListener('touchmove', e => {
    if (!dragging || study.flipped || reduceMotion) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (Math.abs(dy) > Math.abs(dx) || Math.abs(dx) < 10) return; // vertical scroll or jitter — leave taps crisp
    scene.style.transform = `translateX(${dx}px) rotate(${dx / 20}deg)`;
    scene.style.opacity = Math.max(1 - Math.abs(dx) / 400, 0.4);
  }, { passive: true });

  scene.addEventListener('touchend', e => {
    dragging = false;
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    scene.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s';

    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) || study.flipped) {
      scene.style.transform = '';
      scene.style.opacity = '';
      return;
    }
    const dir = dx < 0 ? -1 : 1;
    if (!reduceMotion) {
      scene.style.transform = `translateX(${dir * 500}px) rotate(${dir * 20}deg)`;
      scene.style.opacity = '0';
    }
    flipCard();
    setTimeout(() => rate(dx < 0 ? 1 : 4), reduceMotion ? 0 : 300);
  }, { passive: true });
}

/* ════════════════════════════════════════
   Screen: Edit / Add Card
════════════════════════════════════════ */
async function renderEditCard(app, cardId, deckId) {
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

  const isNew = !cardId;
  const front = card?.front || '';
  const back = card?.back || '';
  const example = card?.example || '';
  const cardType = card?.type || 'vocab';
  const backHash = deckId ? `#/decks/${deckId}` : '#/';
  const typeOpts = [
    ['vocab', 'Vocabulary'],
    ['collocation', 'Collocation'],
    ['phrasal', 'Phrasal verb'],
    ['idiom', 'Idiom'],
    ['sentence', 'Sentence'],
  ];

  app.innerHTML = `
    <div class="p-4 pt-6">
      <div class="flex items-center gap-2 mb-6">
        <button onclick="navigate('${backHash}')"
          class="w-10 h-10 flex items-center justify-center text-muted hover:text-ink transition-colors -ml-2">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <h1 class="text-xl font-bold text-ink font-heading">${isNew ? 'Add Card' : 'Edit Card'}</h1>
      </div>

      <div class="space-y-5">
        <div>
          <label class="text-xs font-semibold text-muted uppercase tracking-wider mb-2 block">Front</label>
          <textarea id="edit-front" rows="4" placeholder="Question or term..."
            class="w-full bg-surface border border-line rounded-xl px-4 py-3 text-ink focus:outline-none focus:border-accent resize-none">${escHtml(front)}</textarea>
          <button type="button" id="image-btn-edit-front" onclick="pickImageFor('edit-front')" class="mt-2 text-xs text-accent hover:text-accent-dark">+ Add image</button>
          <div class="mt-2 p-3 bg-base rounded-xl text-ink text-sm prose-content min-h-10" id="preview-front">
            ${front ? md(front) : '<span class="text-muted">Preview...</span>'}
          </div>
        </div>

        <div>
          <label class="text-xs font-semibold text-muted uppercase tracking-wider mb-2 block">Back</label>
          <textarea id="edit-back" rows="4" placeholder="Answer or definition..."
            class="w-full bg-surface border border-line rounded-xl px-4 py-3 text-ink focus:outline-none focus:border-accent resize-none">${escHtml(back)}</textarea>
          <button type="button" id="image-btn-edit-back" onclick="pickImageFor('edit-back')" class="mt-2 text-xs text-accent hover:text-accent-dark">+ Add image</button>
          <div class="mt-2 p-3 bg-base rounded-xl text-ink text-sm prose-content min-h-10" id="preview-back">
            ${back ? md(back) : '<span class="text-muted">Preview...</span>'}
          </div>
        </div>

        <div>
          <label class="text-xs font-semibold text-muted uppercase tracking-wider mb-2 block">Example / chunk in context</label>
          <textarea id="edit-example" rows="2" placeholder="e.g. leverage our existing data to improve UX"
            class="w-full bg-surface border border-line rounded-xl px-4 py-3 text-ink focus:outline-none focus:border-accent resize-none">${escHtml(example)}</textarea>
          <button type="button" id="image-btn-edit-example" onclick="pickImageFor('edit-example')" class="mt-2 text-xs text-accent hover:text-accent-dark">+ Add image</button>
          <div class="mt-2 p-3 bg-base rounded-xl text-muted text-sm italic prose-content min-h-10" id="preview-example">
            ${example ? md(example) : '<span class="text-muted">Preview...</span>'}
          </div>
        </div>

        <input type="file" id="image-picker" accept="image/*" class="hidden" />

        <div>
          <label class="text-xs font-semibold text-muted uppercase tracking-wider mb-2 block">Type</label>
          <select id="edit-type"
            class="w-full h-12 bg-surface border border-line rounded-xl px-4 text-ink focus:outline-none focus:border-accent">
            ${typeOpts.map(([v, l]) => `<option value="${v}"${v === cardType ? ' selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>

        <div class="flex gap-3 pt-2 pb-4">
          <button onclick="navigate('${backHash}')"
            class="flex-1 h-12 border border-line rounded-xl text-muted hover:text-ink transition-colors">Cancel</button>
          <button id="save-btn" onclick="saveCard(${escHtml(JSON.stringify(cardId || ''))}, ${escHtml(JSON.stringify(deckId || ''))})"
            class="flex-1 h-12 bg-accent hover:bg-accent-dark rounded-xl text-on-accent font-semibold transition-colors">Save</button>
        </div>
      </div>
    </div>
  `;

  const updatePreview = (id, previewId) => {
    document.getElementById(id).addEventListener('input', e => {
      const val = e.target.value;
      document.getElementById(previewId).innerHTML = val ? md(val) : '<span class="text-muted">Preview...</span>';
    });
  };
  updatePreview('edit-front', 'preview-front');
  updatePreview('edit-back', 'preview-back');
  updatePreview('edit-example', 'preview-example');
  wirePasteImage(document.getElementById('edit-front'));
  wirePasteImage(document.getElementById('edit-back'));
  wirePasteImage(document.getElementById('edit-example'));

  document.getElementById('image-picker').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file || !imageUploadTargetId) return;
    const btn = document.getElementById(`image-btn-${imageUploadTargetId}`);
    const originalLabel = btn.textContent;
    btn.textContent = 'Compressing...';
    btn.disabled = true;
    try {
      const dataUrl = await compressImageToDataUrl(file);
      insertAtCursor(document.getElementById(imageUploadTargetId), `\n![](${dataUrl})\n`);
    } catch {
      alert('Could not process that image.');
    } finally {
      btn.textContent = originalLabel;
      btn.disabled = false;
    }
  });
}

async function saveCard(cardId, deckId) {
  const front = document.getElementById('edit-front').value.trim();
  const back = document.getElementById('edit-back').value.trim();
  const example = document.getElementById('edit-example').value.trim();
  const type = document.getElementById('edit-type').value;
  if (!front || !back) { alert('Both front and back are required.'); return; }

  const btn = document.getElementById('save-btn');
  btn.disabled = true;
  btn.textContent = 'Saving...';

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
    btn.textContent = 'Offline — not saved. Tap to retry';
    return;
  }
  navigate(deckId ? `#/decks/${deckId}` : '#/');
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

  app.innerHTML = `
    <div class="p-4 pt-6">
      <h1 class="text-2xl font-bold text-ink mb-6 font-heading">Statistics</h1>

      <div class="grid grid-cols-2 gap-3 mb-5">
        <div class="bg-surface rounded-2xl p-4">
          <div class="text-3xl font-bold text-accent mb-1">${stats.due_today}</div>
          <div class="text-sm text-muted">Due Today</div>
        </div>
        <div class="bg-surface rounded-2xl p-4">
          <div class="text-3xl font-bold text-ink mb-1">${stats.total_cards}</div>
          <div class="text-sm text-muted">Total Words</div>
        </div>
        <div class="bg-surface rounded-2xl p-4">
          <div class="text-3xl font-bold text-rate-hard mb-1">${stats.streak_days} 🔥</div>
          <div class="text-sm text-muted">Day Streak</div>
        </div>
        <div class="bg-surface rounded-2xl p-4">
          <div class="text-3xl font-bold text-rate-easy mb-1">${stats.mature_cards}</div>
          <div class="text-sm text-muted">Mature <span class="text-muted">(${maturePct}%)</span></div>
        </div>
      </div>

      <div class="bg-surface rounded-2xl p-4 mb-5">
        <h2 class="text-sm font-semibold text-muted mb-1">Vocabulary Growth</h2>
        <p class="text-xs text-muted mb-3">Total words known — last 90 days</p>
        <div id="growth-chart"></div>
      </div>

      <div class="bg-surface rounded-2xl p-4 mb-5">
        <h2 class="text-sm font-semibold text-muted mb-3">Activity — Last 12 Weeks</h2>
        <div id="heatmap"></div>
      </div>

      <div class="bg-surface rounded-2xl p-4 mb-5">
        <h2 class="text-sm font-semibold text-muted mb-4">Reviews — Last 7 Days</h2>
        <div id="weekly-chart"></div>
      </div>

      <div class="bg-surface rounded-2xl p-4 mb-5">
        <h2 class="text-sm font-semibold text-muted mb-3">Appearance</h2>
        <div class="grid grid-cols-3 gap-2">
          <button data-theme="light" onclick="setTheme('light')" class="theme-btn h-11 rounded-xl text-sm font-semibold border border-line text-muted transition-colors">Light</button>
          <button data-theme="dark" onclick="setTheme('dark')" class="theme-btn h-11 rounded-xl text-sm font-semibold border border-line text-muted transition-colors">Dark</button>
          <button data-theme="system" onclick="setTheme('system')" class="theme-btn h-11 rounded-xl text-sm font-semibold border border-line text-muted transition-colors">By Device</button>
        </div>
      </div>

      <div class="bg-surface rounded-2xl p-4">
        <h2 class="text-sm font-semibold text-muted mb-1">Notifications</h2>
        <p class="text-xs text-muted mb-3">Add to Home Screen first (iOS 16.4+) — push only works in the installed app.</p>
        <div class="flex gap-2 mb-3">
          <button id="push-enable-btn" onclick="enablePush()" class="flex-1 h-12 bg-accent hover:bg-accent-dark active:bg-accent-dark rounded-xl font-semibold text-on-accent transition-colors">Enable</button>
          <button onclick="sendTestPush()" class="flex-1 h-12 border border-line text-ink hover:bg-base active:bg-line rounded-xl font-semibold transition-colors">Send Test</button>
        </div>
        <label class="flex items-center justify-between gap-3">
          <span class="text-sm text-muted">Daily reminder time</span>
          <input id="reminder-time" type="time" onchange="saveReminderTime()"
            class="bg-base border border-line rounded-lg px-3 h-10 text-ink focus:outline-none focus:border-accent" />
        </label>
        <label class="flex items-center justify-between gap-3 mt-3">
          <span class="text-sm text-muted">Nudge me about a deck untouched for</span>
          <span class="flex items-center gap-2 flex-shrink-0">
            <input id="silence-days" type="number" min="1" max="365" inputmode="numeric" onchange="saveSilenceDays()"
              class="w-16 bg-base border border-line rounded-lg px-2 h-10 text-ink text-center focus:outline-none focus:border-accent" />
            <span class="text-sm text-muted">days</span>
          </span>
        </label>
        <button onclick="sendTestSilence()" class="mt-2 text-xs text-accent hover:text-accent-dark">Test quiet-deck nudge</button>
        <label class="flex items-center justify-between gap-3 mt-4 pt-4 border-t border-line">
          <span class="text-sm text-muted">End-of-day email digest</span>
          <input id="digest-time" type="time" onchange="saveDigestTime()"
            class="bg-base border border-line rounded-lg px-3 h-10 text-ink focus:outline-none focus:border-accent" />
        </label>
        <button onclick="sendTestDigest()" class="mt-2 text-xs text-accent hover:text-accent-dark">Send test email</button>
        <p id="push-status" class="text-xs text-muted mt-2"></p>
      </div>

      <p id="app-version" class="text-center text-xs text-muted mt-6 mb-2"></p>
    </div>
  `;

  if (growth) renderGrowthChart(growth);
  if (heatmap) renderHeatmap(heatmap);
  if (weekly) renderWeeklyChart(weekly);
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
  updateThemeButtons();
  api('/api/version').then(v => {
    const el = document.getElementById('app-version');
    if (el && v) el.textContent = `Felix Cards · ${v.commit}`;
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
  const status = document.getElementById('push-status');
  if (!btn) return;

  const diag = [
    `standalone=${window.navigator.standalone ?? matchMedia('(display-mode: standalone)').matches}`,
    `serviceWorker=${'serviceWorker' in navigator}`,
    `PushManager=${'PushManager' in window}`,
    `Notification=${'Notification' in window}`,
    `permission=${window.Notification?.permission ?? 'n/a'}`,
  ].join(' ');
  if (status) status.textContent = diag;

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    btn.textContent = 'Not supported';
    btn.disabled = true;
    return;
  }
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  btn.textContent = sub ? 'Enabled ✓' : 'Enable';
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
   Screen: Writing Journal
════════════════════════════════════════ */
async function renderJournal(app) {
  loading(app);
  const entries = await api('/api/journal');
  if (!entries) return;

  app.innerHTML = `
    <div class="p-4 pt-6">
      <div class="flex items-center justify-between mb-1">
        <h1 class="text-2xl font-bold text-ink font-heading">Journal</h1>
        <button onclick="navigate('#/journal/new')"
          class="bg-accent hover:bg-accent-dark text-on-accent px-4 h-10 rounded-xl text-sm font-semibold transition-colors">
          + New Entry
        </button>
      </div>
      <p class="text-sm text-muted mb-6">Write with your new words. Paste ChatGPT's correction to keep a record.</p>

      ${entries.length === 0 ? `
        <div class="text-center py-16 text-muted">
          <div class="text-5xl mb-4">✍️</div>
          <p class="text-lg font-medium text-muted">No entries yet</p>
          <p class="text-sm mt-1">Write a few sentences using this week's words</p>
        </div>` : `
        <div class="space-y-3">
          ${entries.map(e => `
            <div onclick="navigate('#/journal/${e.id}/edit')"
              class="bg-surface rounded-2xl p-4 cursor-pointer active:scale-[0.99] transition-transform">
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs font-semibold text-accent uppercase tracking-wider">${fmtDate(e.created_at)}</span>
                ${e.correction ? '<span class="text-[10px] text-rate-easy bg-rate-easy/10 px-2 py-0.5 rounded-full">corrected</span>' : '<span class="text-[10px] text-muted bg-line/50 px-2 py-0.5 rounded-full">draft</span>'}
              </div>
              <p class="text-ink/80 text-sm line-clamp-3 whitespace-pre-wrap break-words">${escHtml(e.content).slice(0, 240)}</p>
              ${e.words ? `<p class="text-xs text-muted mt-2">words: ${escHtml(e.words)}</p>` : ''}
            </div>`).join('')}
        </div>`}
    </div>
  `;
}

async function renderJournalEntry(app, entryId) {
  loading(app);
  let entry = null;
  if (entryId) {
    entry = await api(`/api/journal/${entryId}`);
    if (!entry) { navigate('#/journal'); return; }
  }

  const isNew = !entryId;
  const content = entry?.content || '';
  const correction = entry?.correction || '';
  const words = entry?.words || '';

  app.innerHTML = `
    <div class="p-4 pt-6">
      <div class="flex items-center gap-2 mb-6">
        <button onclick="navigate('#/journal')"
          class="w-10 h-10 flex items-center justify-center text-muted hover:text-ink transition-colors -ml-2">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <h1 class="text-xl font-bold text-ink flex-1 font-heading">${isNew ? 'New Entry' : 'Edit Entry'}</h1>
        ${!isNew ? `<button onclick="deleteJournalEntry(${entryId})"
          class="w-10 h-10 flex items-center justify-center text-muted hover:text-rate-again transition-colors">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
          </svg>
        </button>` : ''}
      </div>

      <div class="space-y-5">
        <div>
          <label class="text-xs font-semibold text-muted uppercase tracking-wider mb-2 block">Your writing</label>
          <textarea id="journal-content" rows="7" placeholder="Write a few sentences using the words you're learning..."
            class="w-full bg-surface border border-line rounded-xl px-4 py-3 text-ink focus:outline-none focus:border-accent resize-none">${escHtml(content)}</textarea>
        </div>

        <div>
          <label class="text-xs font-semibold text-muted uppercase tracking-wider mb-2 block">ChatGPT correction <span class="text-muted normal-case font-normal">(optional — paste later)</span></label>
          <textarea id="journal-correction" rows="7" placeholder="Paste the corrected version + feedback here"
            class="w-full bg-surface border border-line rounded-xl px-4 py-3 text-rate-easy focus:outline-none focus:border-rate-easy resize-none">${escHtml(correction)}</textarea>
        </div>

        <div>
          <label class="text-xs font-semibold text-muted uppercase tracking-wider mb-2 block">Words practiced <span class="text-muted normal-case font-normal">(optional)</span></label>
          <input id="journal-words" type="text" value="${escHtml(words)}" placeholder="leverage, iterate, pivot"
            class="w-full bg-surface border border-line rounded-xl px-4 h-12 text-ink focus:outline-none focus:border-accent"/>
        </div>

        <div class="flex gap-3 pt-2 pb-4">
          <button onclick="navigate('#/journal')"
            class="flex-1 h-12 border border-line rounded-xl text-muted hover:text-ink transition-colors">Cancel</button>
          <button id="save-journal-btn" onclick="saveJournal(${escHtml(JSON.stringify(entryId || ''))})"
            class="flex-1 h-12 bg-accent hover:bg-accent-dark rounded-xl text-on-accent font-semibold transition-colors">Save</button>
        </div>
      </div>
    </div>
  `;
}

async function saveJournal(entryId) {
  const content = document.getElementById('journal-content').value.trim();
  const correction = document.getElementById('journal-correction').value.trim();
  const words = document.getElementById('journal-words').value.trim();
  if (!content) { alert('Write something first.'); return; }

  const btn = document.getElementById('save-journal-btn');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  const payload = JSON.stringify({ content, correction, words });
  try {
    if (entryId) {
      await api(`/api/journal/${entryId}`, { method: 'PUT', body: payload });
    } else {
      await api('/api/journal', { method: 'POST', body: payload });
    }
  } catch {
    btn.disabled = false;
    btn.textContent = 'Offline — not saved. Tap to retry';
    return;
  }
  navigate('#/journal');
}

async function deleteJournalEntry(entryId) {
  if (!confirm('Delete this entry?')) return;
  await api(`/api/journal/${entryId}`, { method: 'DELETE' });
  navigate('#/journal');
}

/* ════════════════════════════════════════
   Screen: This Week recap
════════════════════════════════════════ */
async function renderRecap(app) {
  loading(app);
  const recap = await api('/api/recap');
  if (!recap) return;

  app.innerHTML = `
    <div class="p-4 pt-6">
      <div class="flex items-center gap-2 mb-6">
        <button onclick="navigate('#/')"
          class="w-10 h-10 flex items-center justify-center text-muted hover:text-ink transition-colors -ml-2">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <h1 class="text-xl font-bold text-ink font-heading">This Week</h1>
      </div>

      <div class="grid grid-cols-3 gap-3 mb-6">
        <div class="bg-surface rounded-2xl p-4 text-center">
          <div class="text-2xl font-bold text-accent">${recap.new_word_count}</div>
          <div class="text-xs text-muted mt-1">New words</div>
        </div>
        <div class="bg-surface rounded-2xl p-4 text-center">
          <div class="text-2xl font-bold text-rate-easy">${recap.reviews_done}</div>
          <div class="text-xs text-muted mt-1">Reviews</div>
        </div>
        <div class="bg-surface rounded-2xl p-4 text-center">
          <div class="text-2xl font-bold text-rate-hard">${recap.journal_count}</div>
          <div class="text-xs text-muted mt-1">Journal</div>
        </div>
      </div>

      <h2 class="text-sm font-semibold text-muted uppercase tracking-wider mb-3">New words this week</h2>
      ${recap.new_words.length === 0 ? `
        <p class="text-muted text-sm mb-6">No new words added this week.</p>` : `
        <div class="space-y-2 mb-6">
          ${recap.new_words.map(w => {
            const p = previewParts(w.front);
            return `
            <div class="bg-surface rounded-xl p-3 flex items-center gap-3">
              ${p.imageUrl ? `<img src="${escHtml(p.imageUrl)}" loading="lazy" class="w-11 h-11 rounded-lg object-cover flex-shrink-0">` : ''}
              <span class="text-ink text-sm font-medium truncate flex-1 min-w-0">${escHtml(p.text || (p.imageUrl ? '' : '🖼 Image'))}</span>
              <div class="flex items-center gap-2 flex-shrink-0">
                ${typeBadge(w.type)}
                <span class="text-xs text-muted">${fmtDate(w.created_at)}</span>
              </div>
            </div>`;
          }).join('')}
        </div>`}

      <h2 class="text-sm font-semibold text-muted uppercase tracking-wider mb-3">Journal this week</h2>
      ${recap.journal_entries.length === 0 ? `
        <p class="text-muted text-sm">No journal entries this week.</p>` : `
        <div class="space-y-2">
          ${recap.journal_entries.map(e => `
            <div onclick="navigate('#/journal/${e.id}/edit')"
              class="bg-surface rounded-xl p-3 cursor-pointer active:scale-[0.99] transition-transform">
              <div class="flex items-center justify-between mb-1">
                <span class="text-xs text-accent">${fmtDate(e.created_at)}</span>
                ${e.correction ? '<span class="text-[10px] text-rate-easy">✓ corrected</span>' : ''}
              </div>
              <p class="text-ink/80 text-sm line-clamp-2 whitespace-pre-wrap break-words">${escHtml(e.content).slice(0, 160)}</p>
            </div>`).join('')}
        </div>`}
    </div>
  `;
}
