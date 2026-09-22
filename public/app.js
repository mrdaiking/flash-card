/* ── Markdown helper ── */
const md = text => {
  if (!text) return '';
  if (typeof marked === 'function') return marked(text);
  if (marked && marked.parse) return marked.parse(text);
  return escHtml(text);
};

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
  btn.classList.toggle('text-indigo-400', ttsEnabled);
  btn.classList.toggle('text-slate-600', !ttsEnabled);
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
    btn.classList.toggle('text-indigo-400', isActive);
    btn.classList.toggle('text-slate-400', !isActive);
  });
}

function router() {
  if (!token) { showAuth(); return; }
  const hash = window.location.hash || '#/';
  const app = document.getElementById('app');
  let m;

  if (hash === '#/' || hash === '') {
    setActiveNav('');
    renderHome(app);
  } else if ((m = hash.match(/^#\/decks\/(\d+)$/))) {
    setActiveNav('');
    renderDeckDetail(app, m[1]);
  } else if ((m = hash.match(/^#\/study\/([\w]+)/))) {
    setActiveNav('study');
    renderStudy(app, m[1]);
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
  }
  if (token) { hideAuth(); router(); } else { showAuth(); }
});

/* ── Utilities ── */
function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
        <h1 class="text-2xl font-bold text-white">My Decks</h1>
        ${totalDue > 0 ? `
          <button onclick="navigate('#/study/all')"
            class="bg-indigo-600 hover:bg-indigo-500 text-white px-4 h-10 rounded-xl text-sm font-semibold transition-colors">
            Study All (${totalDue})
          </button>` : ''}
      </div>

      ${hasRecap ? `
        <div onclick="navigate('#/recap')"
          class="bg-gradient-to-r from-indigo-600/20 to-indigo-500/10 border border-indigo-700/40 rounded-2xl p-4 mb-5 cursor-pointer active:scale-[0.99] transition-transform">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-xs font-semibold text-indigo-300 uppercase tracking-wider mb-1">This week</p>
              <p class="text-sm text-slate-200">
                <span class="font-bold text-white">${recap.new_word_count}</span> new words ·
                <span class="font-bold text-white">${recap.reviews_done}</span> reviews ·
                <span class="font-bold text-white">${recap.journal_count}</span> journal
              </p>
            </div>
            <svg class="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
            </svg>
          </div>
        </div>` : ''}

      ${decks.length === 0 ? `
        <div class="text-center py-20 text-slate-500">
          <div class="text-5xl mb-4">📚</div>
          <p class="text-lg font-medium text-slate-400">No decks yet</p>
          <p class="text-sm mt-1">Tap + to create your first deck</p>
        </div>` : `
        <div class="space-y-3">
          ${decks.map(d => `
            <div onclick="navigate('#/decks/${d.id}')"
              class="bg-surface rounded-2xl p-4 flex items-center justify-between cursor-pointer active:scale-[0.98] transition-transform">
              <div>
                <h2 class="font-semibold text-white">${escHtml(d.name)}</h2>
                <p class="text-sm text-slate-400 mt-0.5">${d.total_count || 0} cards</p>
              </div>
              <div class="flex items-center gap-3">
                ${(d.due_count || 0) > 0
                  ? `<span class="bg-indigo-600 text-white text-xs font-bold px-2.5 py-1 rounded-full">${d.due_count}</span>`
                  : `<span class="text-slate-600 text-xs">Up to date</span>`}
                <svg class="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                </svg>
              </div>
            </div>`).join('')}
        </div>`}
    </div>

    <!-- FAB -->
    <button onclick="showNewDeckModal()"
      class="fixed bottom-24 right-5 w-14 h-14 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 rounded-full shadow-lg shadow-indigo-900/50 flex items-center justify-center text-white text-3xl font-light transition-colors z-30">
      +
    </button>

    <!-- New Deck Modal -->
    <div id="new-deck-modal" class="hidden fixed inset-0 bg-black/70 flex items-end justify-center z-50 p-4" onclick="hideNewDeckModal(event)">
      <div class="bg-surface rounded-2xl p-6 w-full max-w-sm mb-2" onclick="event.stopPropagation()">
        <h2 class="text-lg font-semibold text-white mb-4">New Deck</h2>
        <input id="new-deck-name" type="text" placeholder="Deck name"
          class="w-full bg-base border border-slate-700 rounded-xl px-4 h-12 text-white focus:outline-none focus:border-indigo-500 mb-4"/>
        <div class="flex gap-3">
          <button onclick="hideNewDeckModal()"
            class="flex-1 h-12 border border-slate-700 rounded-xl text-slate-400 hover:text-white transition-colors">Cancel</button>
          <button onclick="createDeck()"
            class="flex-1 h-12 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white font-semibold transition-colors">Create</button>
        </div>
      </div>
    </div>
  `;
}

function showNewDeckModal() {
  document.getElementById('new-deck-modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('new-deck-name').focus(), 80);
}
function hideNewDeckModal(e) {
  if (!e || e.target === document.getElementById('new-deck-modal')) {
    document.getElementById('new-deck-modal').classList.add('hidden');
  }
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

  app.innerHTML = `
    <div class="p-4 pt-6">
      <div class="flex items-center gap-2 mb-5">
        <button onclick="navigate('#/')"
          class="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-white transition-colors -ml-2 flex-shrink-0">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <div class="flex-1 min-w-0">
          <h1 class="text-xl font-bold text-white truncate">${escHtml(deck.name)}</h1>
          <p class="text-sm text-slate-400">${cards.length} cards${dueCount > 0 ? ` · ${dueCount} due` : ''}</p>
        </div>
        <button onclick="showDeckMenu()"
          class="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-white transition-colors flex-shrink-0">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"/>
          </svg>
        </button>
      </div>

      <div class="flex gap-2 mb-5">
        <button
          onclick="${dueCount > 0 ? `navigate('#/study/${deckId}')` : 'void(0)'}"
          class="flex-1 h-12 ${dueCount > 0 ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-surface text-slate-600 cursor-not-allowed'} rounded-xl font-semibold transition-colors">
          ${dueCount > 0 ? `Study (${dueCount})` : 'No cards due'}
        </button>
        <button onclick="navigate('#/cards/new?deck=${deckId}')"
          class="h-12 px-4 border border-slate-700 rounded-xl text-slate-300 hover:text-white hover:border-slate-500 transition-colors whitespace-nowrap">
          + Add
        </button>
        <button onclick="showImportModal()"
          class="h-12 px-4 border border-slate-700 rounded-xl text-slate-300 hover:text-white hover:border-slate-500 transition-colors">
          Import
        </button>
      </div>

      ${cards.length === 0 ? `
        <div class="text-center py-14 text-slate-500">
          <div class="text-4xl mb-3">🃏</div>
          <p class="font-medium text-slate-400">No cards yet</p>
          <p class="text-sm mt-1">Add cards or use Import</p>
        </div>` : `
        <div class="space-y-2">
          ${cards.map(c => `
            <div class="bg-surface rounded-xl p-4 flex items-center gap-3">
              <div class="flex-1 min-w-0">
                <p class="text-white truncate text-sm font-medium">${escHtml(c.front)}</p>
                <p class="text-slate-400 text-xs truncate mt-0.5">${escHtml(c.back)}</p>
              </div>
              <div class="flex gap-1 flex-shrink-0">
                <button onclick="navigate('#/cards/${c.id}/edit?deck=${deckId}')"
                  class="w-9 h-9 flex items-center justify-center text-slate-500 hover:text-white transition-colors rounded-lg hover:bg-slate-700">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                  </svg>
                </button>
                <button onclick="deleteCard(${c.id}, ${deckId})"
                  class="w-9 h-9 flex items-center justify-center text-slate-500 hover:text-red-400 transition-colors rounded-lg hover:bg-slate-700">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                  </svg>
                </button>
              </div>
            </div>`).join('')}
        </div>`}
    </div>

    <!-- Deck Menu -->
    <div id="deck-menu" class="hidden fixed inset-0 bg-black/70 flex items-end justify-center z-50 p-4" onclick="hideDeckMenu(event)">
      <div class="bg-surface rounded-2xl p-3 w-full max-w-sm mb-2" onclick="event.stopPropagation()">
        <button onclick="showRenameModal()"
          class="w-full h-12 flex items-center gap-3 px-4 rounded-xl text-slate-300 hover:text-white hover:bg-slate-700 transition-colors">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
          </svg>
          Rename Deck
        </button>
        <button onclick="deleteDeck(${deckId})"
          class="w-full h-12 flex items-center gap-3 px-4 rounded-xl text-red-400 hover:text-red-300 hover:bg-slate-700 transition-colors">
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
        <h2 class="text-lg font-semibold text-white mb-4">Rename Deck</h2>
        <input id="rename-input" type="text" value="${escHtml(deck.name)}"
          class="w-full bg-base border border-slate-700 rounded-xl px-4 h-12 text-white focus:outline-none focus:border-indigo-500 mb-4"/>
        <div class="flex gap-3">
          <button onclick="hideRenameModal()"
            class="flex-1 h-12 border border-slate-700 rounded-xl text-slate-400 hover:text-white transition-colors">Cancel</button>
          <button onclick="renameDeck(${deckId})"
            class="flex-1 h-12 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white font-semibold transition-colors">Save</button>
        </div>
      </div>
    </div>

    <!-- Import Modal -->
    <div id="import-modal" class="hidden fixed inset-0 bg-black/70 flex items-end justify-center z-50 p-4" onclick="hideImportModal(event)">
      <div class="bg-surface rounded-2xl p-6 w-full max-w-sm mb-2" onclick="event.stopPropagation()">
        <h2 class="text-lg font-semibold text-white mb-1">Import Cards</h2>
        <p class="text-slate-400 text-sm mb-3">One per line: <code class="text-indigo-400 bg-base px-1 rounded">front | back</code></p>
        <textarea id="import-text" rows="7"
          placeholder="apple | A red or green fruit&#10;hello | A greeting"
          class="w-full bg-base border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 mb-4 resize-none text-sm font-mono"></textarea>
        <div class="flex gap-3">
          <button onclick="hideImportModal()"
            class="flex-1 h-12 border border-slate-700 rounded-xl text-slate-400 hover:text-white transition-colors">Cancel</button>
          <button onclick="doImport(${deckId})"
            class="flex-1 h-12 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white font-semibold transition-colors">Import</button>
        </div>
      </div>
    </div>
  `;
}

function showDeckMenu() { document.getElementById('deck-menu').classList.remove('hidden'); }
function hideDeckMenu(e) {
  if (!e || e.target === document.getElementById('deck-menu'))
    document.getElementById('deck-menu').classList.add('hidden');
}
function showRenameModal() {
  hideDeckMenu();
  document.getElementById('rename-modal').classList.remove('hidden');
  setTimeout(() => { const i = document.getElementById('rename-input'); i.focus(); i.select(); }, 80);
}
function hideRenameModal() { document.getElementById('rename-modal').classList.add('hidden'); }
async function renameDeck(deckId) {
  const name = document.getElementById('rename-input').value.trim();
  if (!name) return;
  await api(`/api/decks/${deckId}`, { method: 'PUT', body: JSON.stringify({ name }) });
  hideRenameModal();
  renderDeckDetail(document.getElementById('app'), deckId);
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
function showImportModal() { document.getElementById('import-modal').classList.remove('hidden'); }
function hideImportModal(e) {
  if (!e || e.target === document.getElementById('import-modal'))
    document.getElementById('import-modal').classList.add('hidden');
}
async function doImport(deckId) {
  const text = document.getElementById('import-text').value;
  const res = await fetch(`/api/decks/${deckId}/import`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
    body: text,
  });
  if (res.ok) {
    const data = await res.json();
    hideImportModal();
    alert(`Imported ${data.imported} card${data.imported !== 1 ? 's' : ''}`);
    renderDeckDetail(document.getElementById('app'), deckId);
  }
}

/* ════════════════════════════════════════
   Screen: Study
════════════════════════════════════════ */
let study = null;

async function renderStudy(app, deckId) {
  app.innerHTML = `<div class="flex items-center justify-center h-64 text-slate-500">Loading cards...</div>`;
  const cards = await api(deckId === 'all' ? '/api/cards/due' : `/api/decks/${deckId}/due`);
  if (!cards) return;

  if (cards.length === 0) {
    app.innerHTML = `
      <div class="flex flex-col items-center justify-center min-h-[70vh] p-8 text-center">
        <div class="text-6xl mb-4">🎉</div>
        <h2 class="text-2xl font-bold text-white mb-2">All caught up!</h2>
        <p class="text-slate-400 mb-8">No cards due right now.</p>
        <button onclick="navigate('#/')"
          class="h-12 px-8 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white font-semibold transition-colors">
          Back to Decks
        </button>
      </div>`;
    return;
  }

  study = { cards, index: 0, flipped: false, ratings: { 1: 0, 2: 0, 3: 0, 4: 0 }, deckId };
  drawStudyCard();
}

function drawStudyCard() {
  const app = document.getElementById('app');
  const { cards, index, flipped, ratings, deckId } = study;

  if (index >= cards.length) {
    const total = cards.length;
    app.innerHTML = `
      <div class="flex flex-col items-center justify-center min-h-[70vh] p-6 text-center">
        <div class="text-6xl mb-4">✅</div>
        <h2 class="text-2xl font-bold text-white mb-1">Session Complete!</h2>
        <p class="text-slate-400 mb-8">Reviewed ${total} card${total !== 1 ? 's' : ''}</p>
        <div class="grid grid-cols-2 gap-3 w-full max-w-xs mb-8">
          <div class="bg-red-950/60 border border-red-800/50 rounded-xl p-3">
            <div class="text-2xl font-bold text-red-400">${ratings[1]}</div>
            <div class="text-sm text-red-300/70">Again</div>
          </div>
          <div class="bg-orange-950/60 border border-orange-800/50 rounded-xl p-3">
            <div class="text-2xl font-bold text-orange-400">${ratings[2]}</div>
            <div class="text-sm text-orange-300/70">Hard</div>
          </div>
          <div class="bg-blue-950/60 border border-blue-800/50 rounded-xl p-3">
            <div class="text-2xl font-bold text-blue-400">${ratings[3]}</div>
            <div class="text-sm text-blue-300/70">Good</div>
          </div>
          <div class="bg-green-950/60 border border-green-800/50 rounded-xl p-3">
            <div class="text-2xl font-bold text-green-400">${ratings[4]}</div>
            <div class="text-sm text-green-300/70">Easy</div>
          </div>
        </div>
        <button onclick="navigate('#/')"
          class="h-12 px-8 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white font-semibold transition-colors">
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
    <div class="flex flex-col min-h-screen p-4 pt-5">
      <!-- Progress bar -->
      <div class="flex items-center gap-3 mb-5">
        <button onclick="navigate('${backHash}')"
          class="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-white transition-colors -ml-2 flex-shrink-0">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
        <div class="flex-1 bg-slate-800 rounded-full h-1.5">
          <div class="bg-indigo-500 h-1.5 rounded-full transition-all duration-300" style="width:${progress}%"></div>
        </div>
        <span class="text-slate-500 text-sm flex-shrink-0">${index + 1} / ${total}</span>
        <button id="tts-btn" onclick="toggleTTS()"
          class="w-9 h-9 flex items-center justify-center ${ttsEnabled ? 'text-indigo-400' : 'text-slate-600'} hover:text-white transition-colors flex-shrink-0"
          title="${ttsEnabled ? 'Mute TTS' : 'Unmute TTS'}">
          ${ttsEnabled ? speakerOnSVG : speakerOffSVG}
        </button>
      </div>

      ${ttsEnabled ? `
        <div class="flex justify-end -mt-3 mb-3">
          <button id="tts-mode-btn" onclick="cycleTTSMode()"
            class="text-xs text-indigo-400/80 hover:text-indigo-300 bg-indigo-500/10 px-3 py-1 rounded-full transition-colors"
            title="Tap to change what gets spoken">
            ${{ both: 'Front + Back', front: 'Front only', back: 'Back only' }[ttsMode]}
          </button>
        </div>` : ''}

      <!-- Card -->
      <div class="flex-1 flex items-center justify-center">
        <div class="card-scene w-full" style="height:260px" id="card-scene" onclick="flipCard()">
          <div class="card-inner w-full h-full${flipped ? ' flipped' : ''}" id="card-inner">
            <div class="card-front absolute inset-0 bg-surface rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer shadow-xl select-none">
              <div class="prose-content text-white text-xl text-center leading-relaxed">${md(card.front)}</div>
              <p class="text-slate-600 text-xs mt-4">tap to reveal</p>
              <button onclick="event.stopPropagation(); speak(${escHtml(JSON.stringify(card.front))})"
                class="absolute bottom-3 right-3 w-8 h-8 flex items-center justify-center text-slate-600 hover:text-slate-300 transition-colors"
                title="Replay">
                ${speakerOnSVG}
              </button>
            </div>
            <div class="card-back absolute inset-0 bg-indigo-950/60 border border-indigo-800/40 rounded-2xl p-5 flex flex-col items-center justify-center cursor-pointer shadow-xl select-none overflow-y-auto">
              ${badge ? `<div class="mb-2">${badge}</div>` : ''}
              <div class="prose-content text-white text-lg text-center leading-relaxed">${md(card.back)}</div>
              ${card.example ? `
                <div class="mt-3 pt-3 border-t border-indigo-800/40 w-full">
                  <div class="prose-content text-indigo-200/80 text-sm text-center italic leading-relaxed">${md(card.example)}</div>
                </div>` : ''}
              <button onclick="event.stopPropagation(); speak(${escHtml(JSON.stringify(backSpeak))})"
                class="absolute bottom-3 right-3 w-8 h-8 flex items-center justify-center text-indigo-400/40 hover:text-indigo-300 transition-colors"
                title="Replay">
                ${speakerOnSVG}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Rating buttons -->
      <div id="rating-btns" class="${flipped ? '' : 'invisible'} grid grid-cols-4 gap-2 mt-5">
        <button onclick="rate(1)"
          class="h-14 bg-red-950/70 border border-red-800/60 rounded-xl text-red-300 font-semibold hover:bg-red-900/70 active:scale-95 transition-all text-sm">
          Again
        </button>
        <button onclick="rate(2)"
          class="h-14 bg-orange-950/70 border border-orange-800/60 rounded-xl text-orange-300 font-semibold hover:bg-orange-900/70 active:scale-95 transition-all text-sm">
          Hard
        </button>
        <button onclick="rate(3)"
          class="h-14 bg-blue-950/70 border border-blue-800/60 rounded-xl text-blue-300 font-semibold hover:bg-blue-900/70 active:scale-95 transition-all text-sm">
          Good
        </button>
        <button onclick="rate(4)"
          class="h-14 bg-green-950/70 border border-green-800/60 rounded-xl text-green-300 font-semibold hover:bg-green-900/70 active:scale-95 transition-all text-sm">
          Easy
        </button>
      </div>

      ${!flipped ? `
        <p class="text-center text-slate-700 text-xs mt-4">swipe left = Again &nbsp;·&nbsp; swipe right = Easy</p>` : ''}
    </div>
  `;

  setupSwipe();
  if (ttsMode === 'both' || ttsMode === 'front') speak(card.front);
}

function flipCard() {
  if (!study || study.flipped) return;
  study.flipped = true;
  document.getElementById('card-inner')?.classList.add('flipped');
  document.getElementById('rating-btns')?.classList.remove('invisible');
  if (ttsMode !== 'both' && ttsMode !== 'back') return;
  const c = study.cards[study.index];
  speak(c.example ? `${c.back}. ${c.example}` : c.back);
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
  return `<span class="inline-block bg-indigo-500/20 text-indigo-300 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full">${labels[type]}</span>`;
}

async function rate(rating) {
  if (!study) return;
  const card = study.cards[study.index];
  study.ratings[rating]++;
  study.index++;
  study.flipped = false;
  window.speechSynthesis?.cancel();
  api(`/api/cards/${card.id}/review`, { method: 'POST', body: JSON.stringify({ rating }) }).catch(() => {});
  drawStudyCard();
}

function setupSwipe() {
  const scene = document.getElementById('card-scene');
  if (!scene) return;
  let startX = 0, startY = 0;
  scene.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });
  scene.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx)) return; // not a horizontal swipe
    if (study.flipped) return;
    flipCard();
    setTimeout(() => rate(dx < 0 ? 1 : 4), 460);
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
          class="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-white transition-colors -ml-2">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <h1 class="text-xl font-bold text-white">${isNew ? 'Add Card' : 'Edit Card'}</h1>
      </div>

      <div class="space-y-5">
        <div>
          <label class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Front</label>
          <textarea id="edit-front" rows="4" placeholder="Question or term..."
            class="w-full bg-surface border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 resize-none">${escHtml(front)}</textarea>
          <div class="mt-2 p-3 bg-base rounded-xl text-white text-sm prose-content min-h-10" id="preview-front">
            ${front ? md(front) : '<span class="text-slate-600">Preview...</span>'}
          </div>
        </div>

        <div>
          <label class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Back</label>
          <textarea id="edit-back" rows="4" placeholder="Answer or definition..."
            class="w-full bg-surface border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 resize-none">${escHtml(back)}</textarea>
          <div class="mt-2 p-3 bg-base rounded-xl text-white text-sm prose-content min-h-10" id="preview-back">
            ${back ? md(back) : '<span class="text-slate-600">Preview...</span>'}
          </div>
        </div>

        <div>
          <label class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Example / chunk in context</label>
          <textarea id="edit-example" rows="2" placeholder="e.g. leverage our existing data to improve UX"
            class="w-full bg-surface border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 resize-none">${escHtml(example)}</textarea>
          <div class="mt-2 p-3 bg-base rounded-xl text-slate-300 text-sm italic prose-content min-h-10" id="preview-example">
            ${example ? md(example) : '<span class="text-slate-600">Preview...</span>'}
          </div>
        </div>

        <div>
          <label class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Type</label>
          <select id="edit-type"
            class="w-full h-12 bg-surface border border-slate-700 rounded-xl px-4 text-white focus:outline-none focus:border-indigo-500">
            ${typeOpts.map(([v, l]) => `<option value="${v}"${v === cardType ? ' selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>

        <div class="flex gap-3 pt-2 pb-4">
          <button onclick="navigate('${backHash}')"
            class="flex-1 h-12 border border-slate-700 rounded-xl text-slate-400 hover:text-white transition-colors">Cancel</button>
          <button id="save-btn" onclick="saveCard(${escHtml(JSON.stringify(cardId || ''))}, ${escHtml(JSON.stringify(deckId || ''))})"
            class="flex-1 h-12 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white font-semibold transition-colors">Save</button>
        </div>
      </div>
    </div>
  `;

  const updatePreview = (id, previewId) => {
    document.getElementById(id).addEventListener('input', e => {
      const val = e.target.value;
      document.getElementById(previewId).innerHTML = val ? md(val) : '<span class="text-slate-600">Preview...</span>';
    });
  };
  updatePreview('edit-front', 'preview-front');
  updatePreview('edit-back', 'preview-back');
  updatePreview('edit-example', 'preview-example');
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
  if (cardId) {
    await api(`/api/cards/${cardId}`, { method: 'PUT', body: payload });
  } else {
    await api(`/api/decks/${deckId}/cards`, { method: 'POST', body: payload });
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
      <h1 class="text-2xl font-bold text-white mb-6">Statistics</h1>

      <div class="grid grid-cols-2 gap-3 mb-5">
        <div class="bg-surface rounded-2xl p-4">
          <div class="text-3xl font-bold text-indigo-400 mb-1">${stats.due_today}</div>
          <div class="text-sm text-slate-400">Due Today</div>
        </div>
        <div class="bg-surface rounded-2xl p-4">
          <div class="text-3xl font-bold text-white mb-1">${stats.total_cards}</div>
          <div class="text-sm text-slate-400">Total Words</div>
        </div>
        <div class="bg-surface rounded-2xl p-4">
          <div class="text-3xl font-bold text-orange-400 mb-1">${stats.streak_days} 🔥</div>
          <div class="text-sm text-slate-400">Day Streak</div>
        </div>
        <div class="bg-surface rounded-2xl p-4">
          <div class="text-3xl font-bold text-green-400 mb-1">${stats.mature_cards}</div>
          <div class="text-sm text-slate-400">Mature <span class="text-slate-600">(${maturePct}%)</span></div>
        </div>
      </div>

      <div class="bg-surface rounded-2xl p-4 mb-5">
        <h2 class="text-sm font-semibold text-slate-400 mb-1">Vocabulary Growth</h2>
        <p class="text-xs text-slate-600 mb-3">Total words known — last 90 days</p>
        <div id="growth-chart"></div>
      </div>

      <div class="bg-surface rounded-2xl p-4 mb-5">
        <h2 class="text-sm font-semibold text-slate-400 mb-3">Activity — Last 12 Weeks</h2>
        <div id="heatmap"></div>
      </div>

      <div class="bg-surface rounded-2xl p-4 mb-5">
        <h2 class="text-sm font-semibold text-slate-400 mb-4">Reviews — Last 7 Days</h2>
        <div id="weekly-chart"></div>
      </div>

      <div class="bg-surface rounded-2xl p-4">
        <h2 class="text-sm font-semibold text-slate-400 mb-1">Notifications</h2>
        <p class="text-xs text-slate-600 mb-3">Add to Home Screen first (iOS 16.4+) — push only works in the installed app.</p>
        <div class="flex gap-2">
          <button id="push-enable-btn" onclick="enablePush()" class="flex-1 h-12 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 rounded-xl font-semibold text-white transition-colors">Enable</button>
          <button onclick="sendTestPush()" class="flex-1 h-12 bg-slate-700 hover:bg-slate-600 active:bg-slate-800 rounded-xl font-semibold text-white transition-colors">Send Test</button>
        </div>
        <p id="push-status" class="text-xs text-slate-500 mt-2"></p>
      </div>
    </div>
  `;

  if (growth) renderGrowthChart(growth);
  if (heatmap) renderHeatmap(heatmap);
  if (weekly) renderWeeklyChart(weekly);
  updatePushButton();
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
    el.innerHTML = '<p class="text-slate-600 text-sm text-center py-4">No words yet</p>';
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
          <stop offset="0%" stop-color="#6366f1" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="#6366f1" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${area}" fill="url(#growthGrad)"/>
      <path d="${line}" fill="none" stroke="#6366f1" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${pts[pts.length - 1][0].toFixed(1)}" cy="${pts[pts.length - 1][1].toFixed(1)}" r="3.5" fill="#818cf8"/>
      <text x="${pad}" y="12" fill="#475569" font-size="9" font-family="sans-serif">${min}</text>
      <text x="${(W - pad).toFixed(0)}" y="12" text-anchor="end" fill="#94a3b8" font-size="10" font-family="sans-serif" font-weight="bold">${max} words</text>
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
    if (!c) return '#1e293b';
    const t = c / max;
    if (t > 0.66) return '#6366f1';
    if (t > 0.33) return '#4f46e5';
    return '#3730a3';
  };

  // data[0] is oldest; align first column's weekday offset
  const firstDay = new Date(data[0].day + 'T12:00:00').getDay();
  const rects = data.map((d, i) => {
    const idx = i + firstDay;
    const col = Math.floor(idx / 7);
    const row = idx % 7;
    const x = col * (cell + gap);
    const y = topPad + row * (cell + gap);
    return `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2.5" fill="${shade(d.count)}"><title>${d.day}: ${d.count}</title></rect>`;
  }).join('');

  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="w-full" style="max-width:${W}px">${rects}</svg>`;
}

function renderWeeklyChart(data) {
  const el = document.getElementById('weekly-chart');
  if (!el) return;
  if (!data || data.every(d => d.count === 0)) {
    el.innerHTML = '<p class="text-slate-600 text-sm text-center py-4">No reviews yet</p>';
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
      <rect x="${x}" y="${y}" width="${barW}" height="${bh}" rx="4" fill="${d.count ? '#6366f1' : '#1e293b'}"/>
      <text x="${x + barW / 2}" y="${H - 5}" text-anchor="middle" fill="#475569" font-size="9" font-family="sans-serif">${day}</text>
      ${d.count ? `<text x="${x + barW / 2}" y="${y - 4}" text-anchor="middle" fill="#94a3b8" font-size="9" font-family="sans-serif">${d.count}</text>` : ''}
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
        <h1 class="text-2xl font-bold text-white">Journal</h1>
        <button onclick="navigate('#/journal/new')"
          class="bg-indigo-600 hover:bg-indigo-500 text-white px-4 h-10 rounded-xl text-sm font-semibold transition-colors">
          + New Entry
        </button>
      </div>
      <p class="text-sm text-slate-400 mb-6">Write with your new words. Paste ChatGPT's correction to keep a record.</p>

      ${entries.length === 0 ? `
        <div class="text-center py-16 text-slate-500">
          <div class="text-5xl mb-4">✍️</div>
          <p class="text-lg font-medium text-slate-400">No entries yet</p>
          <p class="text-sm mt-1">Write a few sentences using this week's words</p>
        </div>` : `
        <div class="space-y-3">
          ${entries.map(e => `
            <div onclick="navigate('#/journal/${e.id}/edit')"
              class="bg-surface rounded-2xl p-4 cursor-pointer active:scale-[0.99] transition-transform">
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs font-semibold text-indigo-400 uppercase tracking-wider">${fmtDate(e.created_at)}</span>
                ${e.correction ? '<span class="text-[10px] text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">corrected</span>' : '<span class="text-[10px] text-slate-500 bg-slate-500/10 px-2 py-0.5 rounded-full">draft</span>'}
              </div>
              <p class="text-slate-200 text-sm line-clamp-3 whitespace-pre-wrap">${escHtml(e.content).slice(0, 240)}</p>
              ${e.words ? `<p class="text-xs text-slate-500 mt-2">words: ${escHtml(e.words)}</p>` : ''}
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
          class="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-white transition-colors -ml-2">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <h1 class="text-xl font-bold text-white flex-1">${isNew ? 'New Entry' : 'Edit Entry'}</h1>
        ${!isNew ? `<button onclick="deleteJournalEntry(${entryId})"
          class="w-10 h-10 flex items-center justify-center text-slate-500 hover:text-red-400 transition-colors">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
          </svg>
        </button>` : ''}
      </div>

      <div class="space-y-5">
        <div>
          <label class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Your writing</label>
          <textarea id="journal-content" rows="7" placeholder="Write a few sentences using the words you're learning..."
            class="w-full bg-surface border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 resize-none">${escHtml(content)}</textarea>
        </div>

        <div>
          <label class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">ChatGPT correction <span class="text-slate-600 normal-case font-normal">(optional — paste later)</span></label>
          <textarea id="journal-correction" rows="7" placeholder="Paste the corrected version + feedback here"
            class="w-full bg-surface border border-slate-700 rounded-xl px-4 py-3 text-green-200/90 focus:outline-none focus:border-green-600 resize-none">${escHtml(correction)}</textarea>
        </div>

        <div>
          <label class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Words practiced <span class="text-slate-600 normal-case font-normal">(optional)</span></label>
          <input id="journal-words" type="text" value="${escHtml(words)}" placeholder="leverage, iterate, pivot"
            class="w-full bg-surface border border-slate-700 rounded-xl px-4 h-12 text-white focus:outline-none focus:border-indigo-500"/>
        </div>

        <div class="flex gap-3 pt-2 pb-4">
          <button onclick="navigate('#/journal')"
            class="flex-1 h-12 border border-slate-700 rounded-xl text-slate-400 hover:text-white transition-colors">Cancel</button>
          <button id="save-journal-btn" onclick="saveJournal(${escHtml(JSON.stringify(entryId || ''))})"
            class="flex-1 h-12 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white font-semibold transition-colors">Save</button>
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
  if (entryId) {
    await api(`/api/journal/${entryId}`, { method: 'PUT', body: payload });
  } else {
    await api('/api/journal', { method: 'POST', body: payload });
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
          class="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-white transition-colors -ml-2">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <h1 class="text-xl font-bold text-white">This Week</h1>
      </div>

      <div class="grid grid-cols-3 gap-3 mb-6">
        <div class="bg-surface rounded-2xl p-4 text-center">
          <div class="text-2xl font-bold text-indigo-400">${recap.new_word_count}</div>
          <div class="text-xs text-slate-400 mt-1">New words</div>
        </div>
        <div class="bg-surface rounded-2xl p-4 text-center">
          <div class="text-2xl font-bold text-green-400">${recap.reviews_done}</div>
          <div class="text-xs text-slate-400 mt-1">Reviews</div>
        </div>
        <div class="bg-surface rounded-2xl p-4 text-center">
          <div class="text-2xl font-bold text-orange-400">${recap.journal_count}</div>
          <div class="text-xs text-slate-400 mt-1">Journal</div>
        </div>
      </div>

      <h2 class="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">New words this week</h2>
      ${recap.new_words.length === 0 ? `
        <p class="text-slate-600 text-sm mb-6">No new words added this week.</p>` : `
        <div class="space-y-2 mb-6">
          ${recap.new_words.map(w => `
            <div class="bg-surface rounded-xl p-3 flex items-center justify-between">
              <span class="text-white text-sm font-medium">${escHtml(w.front)}</span>
              <div class="flex items-center gap-2">
                ${typeBadge(w.type)}
                <span class="text-xs text-slate-500">${fmtDate(w.created_at)}</span>
              </div>
            </div>`).join('')}
        </div>`}

      <h2 class="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Journal this week</h2>
      ${recap.journal_entries.length === 0 ? `
        <p class="text-slate-600 text-sm">No journal entries this week.</p>` : `
        <div class="space-y-2">
          ${recap.journal_entries.map(e => `
            <div onclick="navigate('#/journal/${e.id}/edit')"
              class="bg-surface rounded-xl p-3 cursor-pointer active:scale-[0.99] transition-transform">
              <div class="flex items-center justify-between mb-1">
                <span class="text-xs text-indigo-400">${fmtDate(e.created_at)}</span>
                ${e.correction ? '<span class="text-[10px] text-green-400">✓ corrected</span>' : ''}
              </div>
              <p class="text-slate-300 text-sm line-clamp-2 whitespace-pre-wrap">${escHtml(e.content).slice(0, 160)}</p>
            </div>`).join('')}
        </div>`}
    </div>
  `;
}
