// Mistvale service worker — 讓遊戲能離線玩
// 2026-10-29:改成「網路優先、離線才用快取」，而且只快取成功的回應。
//   以前素材是 cache-first 而且什麼回應都存：Pages 偶爾回 503 時，那張圖的 503 會被永久存起來，
//   之後每次開遊戲都讀到 503 → 讀取畫面停在「素材載入失敗，請重新整理」
//   （桌機 Chrome 實際遇到：media/monsters3/ram.webp 在快取裡是 503）。
//   素材檔名固定、內容會更新，cache-first 也會一直給舊圖。
// 2026-11-16 perf-net (S3): repeat visits now come from Cache Storage.
//   * App shell ('./'): network-first. A rebuilt HTML therefore always reaches the player, and
//     the response is kept as the offline fallback.
//   * /media/*: cache-first inside a cache named after the build id. A returning player stops
//     re-downloading ~122 files / several MB (the old worker answered every image from the
//     network unconditionally).
//   * Invalidation: server.mjs sends `X-Mistvale-Build` (sha1 of the HTML bytes) on the HTML
//     response, and sw.js compares it with the stored id on every navigation. Any build rewrites
//     the HTML, so a changed id == a new build. On a change the old media/shell caches are
//     deleted *before* this navigation's subresources are requested, so the new page fetches
//     the new art from the network on that same reload (new art within one reload).
//     If a media file changes without the HTML changing (not a supported build path), the cached
//     copy stays until the next build id change. Offline, the last cached build keeps working.
const BUILD_STORE = 'mistvale-build';          // holds the current build id as a tiny text response
const SHELL_PREFIX = 'mistvale-shell-v5-';     // app shell cache, one per build id
const MEDIA_PREFIX = 'mistvale-media-v5-';     // /media/* cache, one per build id
const LEGACY = /^mistvale-v\d+$/;              // 2026-10 caches (v4 and older)
const SCOPED = /^mistvale-(?:shell|media)-v\d+-(.+)$/;

let buildId = null;   // in-memory copy of BUILD_STORE; avoids opening a cache on every image

// Build id: X-Mistvale-Build (server.mjs) → ETag (any host) → <meta name="mistvale-build">
// (build.mjs, for static hosts that send neither). Async because the meta fallback has to read
// the HTML body; the header path is still sync-fast.
function buildIdOf(res) {
  const h = (res.headers.get('x-mistvale-build') || res.headers.get('etag') || '')
    .replace(/[^a-z0-9]/gi, '').toLowerCase();
  return h.slice(0, 24);
}
async function buildIdFor(res) {
  const h = buildIdOf(res);
  if (h) return h;
  try {
    const t = await res.clone().text();
    const m = /<meta\s+name="mistvale-build"\s+content="([^"]+)"/.exec(t);
    if (m) return m[1].replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 24);
  } catch {}
  return 'unknown';
}
async function storedBuild() {
  try {
    const c = await caches.open(BUILD_STORE);
    const r = await c.match('./');
    return r ? (await r.text()).trim() || null : null;
  } catch { return null; }
}
async function setBuild(id) {
  buildId = id;
  try { const c = await caches.open(BUILD_STORE); await c.put('./', new Response(id)); } catch {}
}
// Drop caches that belong to a different build (and the pre-2026-11 caches). Never touches
// BUILD_STORE or caches owned by another game on the same origin (github.io shares one origin).
async function sweep(keepId) {
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => {
    if (k === BUILD_STORE) return false;
    const m = SCOPED.exec(k);
    if (m) return m[1] !== keepId;
    return LEGACY.test(k);
  }).map((k) => caches.delete(k)));
}

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    // Seed the build id + offline shell. `cache: 'default'` lets the HTTP cache (no-cache +
    // ETag on server.mjs) satisfy this fetch with a cheap 304 instead of a second 3 MB download.
    try {
      const res = await fetch(new Request('./', { cache: 'default' }));
      if (res && res.ok && res.type === 'basic') {
        const id = await buildIdFor(res);
        await setBuild(id);
        await sweep(id);
        const c = await caches.open(SHELL_PREFIX + id);
        await c.put('./', res.clone());
      }
    } catch {}
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    buildId = buildId || (await storedBuild());
    if (buildId) await sweep(buildId);
    await self.clients.claim();
  })());
});

async function currentBuild() {
  if (!buildId) buildId = (await storedBuild()) || 'unknown';
  return buildId;
}

// Navigation: always try the network first. If the build id changed, purge old caches before
// the page's images are requested, then store the new shell.
async function networkFirstDoc(req) {
  let res;
  try {
    res = await fetch(req);
  } catch {
    const hit = await caches.match('./', { ignoreSearch: true });
    return hit || Response.error();
  }
  if (!res || !res.ok || res.type !== 'basic') return res;
  const html = (res.headers.get('content-type') || '').includes('text/html');
  if (!html) return res;
  const id = await buildIdFor(res);
  if (id !== buildId) {
    await setBuild(id);
    await sweep(id);                 // old art caches are gone before this page bootstraps
  }
  try {
    const c = await caches.open(SHELL_PREFIX + id);
    if (!(await c.match('./'))) await c.put('./', res.clone());
  } catch {}
  return res;
}

// /media/*: answer from Cache Storage when we have it; otherwise fetch and store. Cache-first
// is safe because the cache name is the build id and a new build purges it (see header above).
async function cacheFirstMedia(req) {
  const id = await currentBuild();
  let cache;
  try { cache = await caches.open(MEDIA_PREFIX + id); } catch { cache = null; }
  const hit = cache && (await cache.match(req, { ignoreSearch: true }));
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (cache && res.ok && res.type === 'basic') cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch {
    return Response.error();
  }
}

// Everything else same-origin (manifest, icons, …): network-first, cache as offline fallback.
async function networkFirstOther(req) {
  try {
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') {
      const id = await currentBuild();
      caches.open(MEDIA_PREFIX + id).then((c) => c.put(req, res.clone())).catch(() => {});
    }
    return res;
  } catch {
    const hit = await caches.match(req, { ignoreSearch: true });
    return hit || Response.error();
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (!req.url.startsWith(self.location.origin)) return;   // other origins: plain network
  const isDoc = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (isDoc) { e.respondWith(networkFirstDoc(req)); return; }
  let pathname = '';
  try { pathname = new URL(req.url).pathname; } catch {}
  if (pathname.startsWith('/media/')) { e.respondWith(cacheFirstMedia(req)); return; }
  e.respondWith(networkFirstOther(req));
});
