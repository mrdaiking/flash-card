const CACHE = 'felix-cards-v1';
const SYNC_TAG = 'review-sync';
const IDB_NAME = 'felix-cards-sw';
const IDB_STORE = 'pending-reviews';

const PRECACHE = ['/', '/app.js', '/manifest.json'];

// --- IndexedDB helpers ---
function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = e =>
      e.target.result.createObjectStore(IDB_STORE, { keyPath: 'id', autoIncrement: true });
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = reject;
  });
}

async function enqueue(url, body, auth) {
  const idb = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).add({ url, body, auth });
    tx.oncomplete = resolve;
    tx.onerror = reject;
  });
}

async function replayQueue() {
  const idb = await openIDB();
  const items = await new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = reject;
  });

  for (const item of items) {
    try {
      const res = await fetch(item.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: item.auth },
        body: JSON.stringify(item.body),
      });
      if (res.ok) {
        await new Promise((resolve, reject) => {
          const tx = idb.transaction(IDB_STORE, 'readwrite');
          tx.objectStore(IDB_STORE).delete(item.id);
          tx.oncomplete = resolve;
          tx.onerror = reject;
        });
      }
    } catch {
      // Will retry on next sync
    }
  }
}

// --- Lifecycle ---
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// --- Fetch ---
self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);

  // Queue review submissions when offline
  if (request.method === 'POST' && /^\/api\/cards\/\d+\/review$/.test(url.pathname)) {
    e.respondWith(
      fetch(request.clone()).catch(async () => {
        const body = await request.clone().json();
        await enqueue(request.url, body, request.headers.get('Authorization'));
        if ('sync' in self.registration) {
          self.registration.sync.register(SYNC_TAG).catch(() => {});
        }
        return new Response(JSON.stringify({ queued: true }), {
          headers: { 'Content-Type': 'application/json' },
        });
      })
    );
    return;
  }

  // Stale-while-revalidate for GET API endpoints used offline
  if (request.method === 'GET' && ['/api/decks', '/api/cards/due'].includes(url.pathname)) {
    e.respondWith(
      caches.open(CACHE).then(cache =>
        cache.match(request).then(cached => {
          const fresh = fetch(request).then(res => {
            cache.put(request, res.clone());
            return res;
          });
          return cached || fresh;
        })
      )
    );
    return;
  }

  // Cache-first for static assets
  if (request.method === 'GET' && !url.pathname.startsWith('/api/')) {
    e.respondWith(
      caches.match(request).then(cached =>
        cached ||
        fetch(request).then(res => {
          if (res.ok) caches.open(CACHE).then(c => c.put(request, res.clone()));
          return res;
        }).catch(() => caches.match('/'))
      )
    );
  }
});

// --- Background sync ---
self.addEventListener('sync', e => {
  if (e.tag === SYNC_TAG) e.waitUntil(replayQueue());
});
