// Mistvale service worker — 讓遊戲能離線玩
// 2026-10-29:改成「網路優先、離線才用快取」，而且只快取成功的回應。
//   以前素材是 cache-first 而且什麼回應都存：Pages 偶爾回 503 時，那張圖的 503 會被永久存起來，
//   之後每次開遊戲都讀到 503 → 讀取畫面停在「素材載入失敗，請重新整理」
//   （桌機 Chrome 實際遇到：media/monsters3/ram.webp 在快取裡是 503）。
//   素材檔名固定、內容會更新，cache-first 也會一直給舊圖。
const CACHE = 'mistvale-v4';   // 改版號：啟用時清掉舊快取（含已經存進去的錯誤回應與舊素材）
const OWN = /^mistvale-v\d+$/; // 同一個網域（github.io/帳號）還有別的遊戲：只刪自己的舊快取，不要刪別人的
const ASSETS = ['./', './index.html', './manifest.webmanifest', './apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(ASSETS.map((u) => c.add(u).catch(() => {}))))   // add() 遇到非 2xx 會失敗，不會存錯誤回應
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE && OWN.test(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // 只處理同源的 app shell 與素材；其他（外部資源）走網路
  if (!req.url.startsWith(self.location.origin)) return;
  const isDoc = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  e.respondWith(
    fetch(req).then((res) => {
      // 只存成功的同源回應：503／404 這種錯誤不能存，存了就會一直讀到錯誤
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true })
      // 離線：用快取；頁面找不到就給首頁，圖片找不到就回網路錯誤（不要把 HTML 當圖片回）
      .then((hit) => hit || (isDoc ? caches.match('./index.html') : Response.error())))
  );
});
