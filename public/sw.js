const CACHE = 'felix-cards-v22';
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
      // Still offline — stays queued for the next trigger.
    }
  }
}

// Several triggers can fire at once (page load, 'online', a successful review,
// Background Sync where supported); single-flight so no review is sent twice.
let replaying = null;
function replayOnce() {
  return (replaying ||= replayQueue().finally(() => { replaying = null; }));
}

// A review queued offline must also leave the cached due lists, or reopening
// Study before reconnecting would serve (and re-rate) the same card again.
async function dropFromCachedDueLists(cardId) {
  const cache = await caches.open(CACHE);
  for (const req of await cache.keys()) {
    if (!/^\/api\/(cards|decks\/\d+)\/due$/.test(new URL(req.url).pathname)) continue;
    const cards = (await (await cache.match(req)).json()).filter(c => c.id !== cardId);
    await cache.put(req, new Response(JSON.stringify(cards), { headers: { 'Content-Type': 'application/json' } }));
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

// Must clone synchronously: once `res` is handed back to the page its body
// gets consumed, and a clone taken later (e.g. after caches.open resolves)
// throws — the put then silently never happens.
function putInCache(e, request, res) {
  const copy = res.clone();
  e.waitUntil(caches.open(CACHE).then(cache => cache.put(request, copy)));
}

// --- Fetch ---
self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);

  // Queue reviews and favorite toggles when offline (both replay safely later;
  // replay keeps queue order, so a card starred then unstarred ends unstarred).
  // Any one that does go through is also a good moment to flush the queue.
  const queueable = url.pathname.match(/^\/api\/cards\/(\d+)\/(review|favorite)$/);
  if (request.method === 'POST' && queueable) {
    e.respondWith(
      fetch(request.clone()).then(res => {
        e.waitUntil(replayOnce());
        return res;
      }).catch(async () => {
        const body = await request.clone().json();
        await enqueue(request.url, body, request.headers.get('Authorization'));
        if (queueable[2] === 'review') await dropFromCachedDueLists(Number(queueable[1]));
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

  // Network-first for every same-origin GET API call, falling back to the last
  // cached copy only when the network fails — fresh data while online (never
  // stale-while-revalidate: that showed pre-mutation data right after a
  // delete/rate/favorite), and every screen still opens offline.
  if (request.method === 'GET' && url.origin === self.location.origin && url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(request).then(res => {
        if (res.ok) putInCache(e, request, res);
        return res;
      }).catch(() => caches.match(request))
    );
    return;
  }

  // Cache-first for static assets, including the CDN scripts/styles (Tailwind,
  // marked, Google Fonts). Those load no-cors and come back opaque (ok=false),
  // so they must be cached explicitly or an offline cold start is unstyled.
  if (request.method === 'GET') {
    e.respondWith(
      caches.match(request).then(cached =>
        cached ||
        fetch(request).then(res => {
          if (res.ok || res.type === 'opaque') putInCache(e, request, res);
          return res;
        }).catch(() => (request.mode === 'navigate' ? caches.match('/') : Response.error()))
      )
    );
  }
});

// --- Replaying queued reviews ---
// Background Sync doesn't exist on iOS Safari, so the page also asks for a
// flush on load, on 'online', and whenever the app comes back to foreground.
self.addEventListener('sync', e => {
  if (e.tag === SYNC_TAG) e.waitUntil(replayOnce());
});

self.addEventListener('message', e => {
  if (e.data === 'replay-reviews') e.waitUntil(replayOnce());
});

// --- Push notifications ---
self.addEventListener('push', e => {
  const data = e.data?.json() ?? { title: 'Felix Cards', body: 'You have new activity.' };
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clients => {
      const existing = clients.find(c => 'focus' in c);
      return existing ? existing.focus() : self.clients.openWindow('/');
    })
  );
});
