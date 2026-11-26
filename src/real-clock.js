// 2026-11-26 拿掉遊戲內的白天黑夜與「第 N 天」(使用者:需要白天黑夜作為條件的機制一律改用真實世界時間)。
// 這裡只放「看玩家本機的真實時間」的小工具,全部是純函式:時間一律由呼叫端傳進來(遊戲核心用 game.realNow(),測試可以注入時鐘)。
//   ・isRealNight:真實的晚上(本機時區 19:00–05:59)——英雄夜晚台詞、環境音的蟲鳴/貓頭鷹、標題畫面的夜景
//   ・localDayIndex:本機日曆日的序號(「昨天」「N 天前」用;跨午夜就換日,跟遊戲速度無關)
//   ・agoText / waitText / playTimeText:介面上的「多久以前」「還要多久」「遊戲時間」文字
export const REAL_NIGHT = Object.freeze({ from: 19, to: 6 });   // 時:from 點起到隔天 to 點前算晚上

export function isRealNight(ms = Date.now()) {
  const h = new Date(ms).getHours();
  return h >= REAL_NIGHT.from || h < REAL_NIGHT.to;
}

// 本機日曆日序號(1970-01-01 = 0)。用本機的年月日組回 UTC 再除一天,夏令時間切換那天也不會差一。
export function localDayIndex(ms) {
  const d = new Date(ms);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

// 「多久以前」的前綴(含結尾空白):不到 1 分鐘 → ''(就是剛剛);同一天內 → N 分鐘前 / N 小時前;前一個日曆日 → 昨天;更早 → N 天前。
// at 或 now 不是有限數字 → ''(不顯示時間,只顯示內容)。
export function agoText(at, now) {
  if (!Number.isFinite(at) || !Number.isFinite(now)) return '';
  const ms = Math.max(0, now - at);
  const days = localDayIndex(now) - localDayIndex(Math.min(at, now));
  if (days >= 2) return `${days} 天前 `;
  if (days === 1 && ms >= 3600e3) return '昨天 ';
  if (ms < 60e3) return '';
  if (ms < 3600e3) return `${Math.floor(ms / 60e3)} 分鐘前 `;
  return `${Math.floor(ms / 3600e3)} 小時前 `;
}

// 「還要多久」:≥ 1 分鐘以分鐘無條件進位(畫面不是每秒重畫,寧可說久一點);不到 1 分鐘以秒進位。
export function waitText(ms) {
  if (!(ms > 0)) return '0 秒';
  return ms >= 60e3 ? `${Math.ceil(ms / 60e3)} 分鐘` : `${Math.ceil(ms / 1e3)} 秒`;
}

// 遊戲時間(state.time,模擬秒;倍速時比真實時間快)→「N 小時 M 分」/「M 分鐘」
export function playTimeText(sec) {
  const m = Math.floor(Math.max(0, Number(sec) || 0) / 60), h = Math.floor(m / 60);
  return h ? `${h} 小時 ${m % 60} 分` : `${m} 分鐘`;
}
