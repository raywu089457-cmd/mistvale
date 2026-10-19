// 素材載入計數:每一張圖都經過 trackImage,讀取畫面才能顯示真實進度,
// 並確認全部載完之後才進村莊。載入失敗的圖記在 failed,讀取畫面就不進村、改顯示錯誤。
//
// 進度分母用 "已建立" 的圖數。v2 曾把世界的圖排隊延後放行,結果沒放行的圖變成 broken
// (drawImage 報錯、遊戲卡住),所以世界的圖一律維持建立時就載入。
let total = 0, done = 0, failed = 0;
let phase = '', queued = 0;
export function trackImage(im) {
  total++;
  im.addEventListener('load', () => { done++; });
  im.addEventListener('error', () => { done++; failed++; });
  return im;
}
// 少數來源(目前是像素圖示)的 .src 先收著,由進度輪詢放行;loaded() 用原生 setter 真正開始載入。
export function deferSrc(im) {
  let allow = false, url = '';
  Object.defineProperty(im, 'src', {
    configurable: true,
    get() { return url; },
    set(v) { url = v; if (allow) loaded(im, url); },
  });
  queued++;
  return function release() {
    if (allow) return;
    allow = true; queued--;
    if (url) loaded(im, url);
  };
}
function loaded(im, url) { Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src').set.call(im, url); }
export function markPhase(text) { phase = text; }
export function assetProgress() { return { total, done, failed, phase, queued }; }
