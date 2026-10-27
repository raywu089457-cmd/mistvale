// Mistvale service worker — 讓遊戲能離線玩（cache-first）
const CACHE = 'mistvale-v3';   // 2026-10-27:大張圖改成 media/ 外部檔,改版號讓舊快取作廢   // 2026-10-15:改版號讓舊快取作廢(以前 cache-first 會一直吐舊素材)
const ASSETS = ['./', './index.html', './manifest.webmanifest', './apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(ASSETS.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // 只快取同源的 app shell；其他（外部資源）走網路
  if (!req.url.startsWith(self.location.origin)) return;
  // 2026-10-15:HTML 導覽改成 network-first（先拿新版，離線才用快取）。
  // 以前全部 cache-first，更新過的素材永遠不會出現 —— 開遊戲永遠看到舊素材。
  const isDoc = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (isDoc) {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('./index.html')))
    );
    return;
  }
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
