// touch-targets.mjs — T52：手機（寬 ≤430）每個按得到的控制項都要夠大，而且不能互相重疊。
// 用法：
//   node tools/checks/touch-targets.mjs                 實測 390x844／430x932／320x720 手機視窗（需要遊戲伺服器；TARGET= 可換網址）
//   SHOT=before node tools/checks/touch-targets.mjs     另外存 output/ui-audit/T52-before-phone-{hud,trade}.png
//   結束碼：0 全過；1 有 FIX；2 連不上伺服器／開不了 Chrome（不算通過）。
//
// 2026-11-11 改寫（獵魔村風格第三階段）：
//   舊版有一道「靜態閘門」：讀 src/pixel-style.css，要求 T52 標記之後的所有規則都掛在 @media(pointer:coarse) 底下，
//   並用「最後一個宣告」推算每個控制項的 min-width/min-height >= 40。新版面把手機規則改放在 ui-hv.css（最後載入、全部 !important、
//   選取器是 `html body #modal-content …` 這類長選取器），觸控層改用 @media(max-width:760px),(max-height:520px)；
//   舊閘門讀 pixel-style.css 的宣告值已經預測不了實際畫面（423 條規則被誤判成「漏到桌機」），所以整段拿掉。
//   使用者看得到的不變量是「手機上每個按得到的東西都夠大、互不重疊」，直接在真的 DOM 上量就是它，所以改成預設就跑實測：
//     * 門檻從 40px 提高到規格（UI-REF §5.5）的 44px（容許 0.5px 的小數誤差）；
//     * 重疊改用未取整的 getBoundingClientRect 量，並容許 <=0.5px 的次像素相接（舊版先四捨五入再比，底欄相鄰頁籤會被算成 1px 重疊）；
//     * 連不上伺服器不再 SKIP 當作通過，改成結束碼 2。
//   桌機沒有被手機規則影響這件事，由 hv-measure（桌機熱區）與 build-grid／panel-headers 的桌機斷言各自守住。
// 實測畫面：390x844 / 430x932 / 320x720，逐一開 hud／左側委託面板／settings／build／hunters／派遣／trade／craft／
//   difficulty／委託／新手說明／招募／地下城／競技場／首領／建築資訊抽屜／移動建築放置列／手動操控面板，
//   列出小於 44 的 [data-action]/[data-pilot] 與同一層互相重疊的可見按鈕。幾何重疊全量計算，其中「一顆是 sticky/fixed
//   橫條、另一顆是捲到它下面的列」的另列成 COVERED（會印出來並計數，不算失敗：那是黏在底部的固定鈕，不是兩顆都按得到）。
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const MIN = 44;
const TOL = 0.5;

// ---- 瀏覽器實測（BROWSER=1；只給工作用，不在接受線上）-------------------------
const runBrowser = true;
if (runBrowser) {
  const { createRequire } = await import('node:module');
  const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
  let chromium;
  try { ({ chromium } = require('playwright')); }
  catch { console.log('FAIL browser: playwright is not installed under %APPDATA%/npm/node_modules'); chromium = null; process.exit(2); }
  if (chromium) {
    const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
    const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1';
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    // 390x844 / 430x932 / 320x720：介面縮放分別是 0.85／1／0.75，320 那台是 slot 最容易黏在一起的
    const VIEWPORTS = [
      { name: '390x844', w: 390, h: 844, dpr: 3 },
      { name: '430x932', w: 430, h: 932, dpr: 3 },
      { name: '320x720', w: 320, h: 720, dpr: 2 },
    ];
    // 給人眼對照的 before/after 只存一份（390x844）
    const SHOT_SCREENS = new Set(['hud', 'trade']);
    let bad = 0, unreachable = false, coveredPairs = 0;
    for (const dev of VIEWPORTS) {
      let browser;
      try { browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new'] }); }
      catch (e) { unreachable = true; console.log(`FAIL browser: cannot launch Chrome (${String(e.message).slice(0, 90)})`); break; }
      try {
        const ctx = await browser.newContext({
          viewport: { width: dev.w, height: dev.h }, deviceScaleFactor: dev.dpr,
          isMobile: true, hasTouch: true, locale: 'zh-TW', userAgent: IOS_UA,
        });
        const page = await ctx.newPage();
        try { await page.goto(URL, { waitUntil: 'commit', timeout: 120000 }); }
        catch (e) { unreachable = true; console.log(`FAIL ${dev.name}: cannot load ${URL} (${String(e.message).slice(0, 90)})`); continue; }
        await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#game-ui')?.classList.contains('hidden'), null, { timeout: 180000 }).catch(() => {});
        await sleep(2500);
        // 有錢、每棟建築至少一級，畫面才會把所有按鈕長出來（跟 pipeline/scripts/ui-audit/buttons.mjs 一樣）
        await page.evaluate(() => {
          const g = globalThis.__mistvaleGame;
          Object.assign(g.state, { gold: 99999, wood: 9999, ore: 9999, herb: 9999, cloth: 9999, flour: 9999, leather: 9999, gems: 999 });
          for (const id of Object.keys(g.state.buildings)) g.state.buildings[id] = Math.max(1, g.state.buildings[id]);
        });
        const buildingId = await page.evaluate(() => Object.keys(globalThis.__mistvaleGame.state.buildings)[0] || 'hall');
        const act = (a, data = {}) => page.evaluate(([a, data]) => {
          const el = document.createElement('button'); el.dataset.action = a;
          for (const [k, v] of Object.entries(data)) el.dataset[k] = v;
          el.style.display = 'none'; document.body.append(el); el.click(); el.remove();
        }, [a, data]);
        // 回到乾淨的村莊 HUD：關彈窗／收資訊抽屜／離開放置模式與手動操控／收起左側面板
        const reset = async () => {
          await page.evaluate(() => {
            document.querySelector('#modal-backdrop:not(.hidden) [data-action=close]')?.click();
            document.querySelector('#inspector:not(.hidden) [data-action=closeInspector]')?.click();
            document.querySelector('#pilotlab [data-pilot=stop],#pilotlab [data-pilot=close]')?.click();
            document.querySelector('#placement:not(.hidden) [data-action=cancelMove]')?.click();
            const lp = document.querySelector('#left-panel');
            if (lp && !lp.classList.contains('hidden')) lp.querySelector('[data-action=toggleLeft]')?.click();
          });
          await page.keyboard.press('Escape').catch(() => {});
          await sleep(220);
        };
        // 每一個畫面一格：goal 說「HUD、下方選單、所有彈窗」，所以連資訊抽屜、放置列、手動操控都要量
        const SCREENS = [
          { name: 'hud' },
          { name: 'left', run: () => act('toggleLeft') },                 // 村長委託面板展開（panel-title 收合鍵＋任務鍵）
          { name: 'settings', run: () => act('settings') },
          { name: 'build', run: () => act('build') },
          { name: 'hunters', run: () => act('hunters') },
          { name: 'dispatch', run: () => act('dispatchHunters') },        // 派遣：區域列 rp-body 就在這
          { name: 'trade', run: () => act('trade') },
          { name: 'craft', run: () => act('craft') },
          { name: 'difficulty', run: () => act('difficulty') },
          { name: 'quests', run: () => act('quests') },
          { name: 'help', run: () => act('help') },
          { name: 'recruit', run: () => act('recruit') },
          { name: 'dungeon', run: () => act('dungeon') },
          { name: 'arena', run: () => act('arena') },
          { name: 'boss', run: () => act('boss') },
          { name: 'inspect', run: () => act('selectBuilding', { id: buildingId }) },   // 建築資訊抽屜
          { name: 'placement', run: () => act('moveBuilding', { id: buildingId }) },   // 移動建築放置列
          { name: 'pilotlab', run: () => act('pilotLab') },                            // 手動操控面板
        ];
        for (const screen of SCREENS) {
          await reset();
          if (screen.run) { await screen.run(); await sleep(500); }
          const m = await page.evaluate(() => {
            // 開著視窗時 backdrop 蓋住底下的 HUD／下方選單（點不到），所以只量視窗裡的東西
            const modalOpen = !document.querySelector('#modal-backdrop')?.classList.contains('hidden');
            const inScope = e => !modalOpen || !!e.closest('#modal');
            const vis = e => {
              const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
              return inScope(e) && r.width > 0.5 && r.height > 0.5 && cs.visibility !== 'hidden' && cs.display !== 'none' && !e.closest('.hidden');
            };
            // 浮在上面的面板（彈窗／手動操控／放置列／資訊抽屜）蓋住底下的 HUD 是設計，不算重疊
            const layer = e => (e.closest('#modal') ? 'modal' : e.closest('#pilotlab') ? 'pilotlab'
              : e.closest('#placement') ? 'placement' : e.closest('#inspector') ? 'inspector' : 'hud');
            // 黏在捲動區底部的鈕（派遣視窗的 .dispatch-go 是 position:sticky）會蓋住捲到它下面的列。那是設計，
            // 但卡上寫的是「no two hit areas overlap」，所以這種「釘住的橫條蓋住捲動內容」不能安靜跳過：
            // 全部分開算，只是單獨列成 COVERED 並計數，跟真正兩顆都按得到的 OVERLAP 分開看。
            const pinned = e => {
              for (let n = e; n && n !== document.body; n = n.parentElement) {
                const p = getComputedStyle(n).position;
                if (p === 'sticky' || p === 'fixed') return true;
                if (p === 'absolute' || p === 'relative') return false;   // 換了定位基準，再上面的東西不會蓋到這顆
              }
              return false;
            };
            const items = [...document.querySelectorAll('[data-action],[data-pilot]')].filter(vis).map(e => {
              const r = e.getBoundingClientRect();
              const sel = Object.entries(e.dataset).map(([k, v]) => `[data-${k.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}="${v}"]`).join('');
              return {
                sel, action: e.dataset.action || `pilot:${e.dataset.pilot}`, layer: layer(e), pinned: pinned(e),
                x: r.left, y: r.top, w: r.width, h: r.height,
                label: ((e.textContent || '').trim() || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').slice(0, 14),
              };
            });
            // 全部幾何重疊都量，不再先過濾；covered = 其中一顆是釘住的橫條（蓋住捲到它下面的內容）
            const overlaps = [];
            for (let i = 0; i < items.length; i++) {
              for (let j = i + 1; j < items.length; j++) {
                const a = items[i], b = items[j];
                if (a.layer !== b.layer) continue;
                const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
                const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
                if (ox > 0.5 && oy > 0.5) overlaps.push({
                  text: `${a.action}(${a.label}) <-> ${b.action}(${b.label}) ${Math.round(ox * 10) / 10}x${Math.round(oy * 10) / 10}`,
                  covered: a.pinned !== b.pinned,
                  pinned: a.pinned !== b.pinned ? (a.pinned ? a.action : b.action) : null,
                });
              }
            }
            return { items, overlaps, modal: !document.querySelector('#modal-backdrop')?.classList.contains('hidden') };
          });
          if (process.env.SHOT && SHOT_SCREENS.has(screen.name) && dev.w === 390) {
            await page.screenshot({ path: path.join(ROOT, `output/ui-audit/T52-${process.env.SHOT}-phone-${screen.name}.png`) }).catch(() => {});
          }
          const small = m.items.filter(i => i.w < MIN - TOL || i.h < MIN - TOL);
          const real = m.overlaps.filter(o => !o.covered);
          const covered = m.overlaps.filter(o => o.covered);
          coveredPairs += covered.length;
          if (small.length || real.length) {
            bad++;
            console.log(`FIX ${dev.name} ${screen.name}: ${small.length} under ${MIN}x${MIN}, ${real.length} overlapping (modal ${m.modal})`);
            for (const s of small) console.log(`  ${String(Math.round(s.w) + 'x' + Math.round(s.h)).padEnd(9)} ${s.action.padEnd(18)} "${s.label}" ${s.sel}`);
            for (const o of real) console.log(`  OVERLAP ${o.text}`);
          } else {
            console.log(`OK  ${dev.name} ${screen.name}: ${m.items.length} visible controls, all >= ${MIN}x${MIN}, none overlapping`);
          }
          // 不算失敗，但一定要看得到：哪一顆釘住的橫條蓋住幾顆捲動中的列
          for (const o of covered) console.log(`  COVERED ${o.text} — ${o.pinned} 是 sticky/fixed 橫條，蓋住捲到它下面的列`);
        }
      } catch (e) {
        unreachable = true;
        console.log(`FAIL ${dev.name}: ${String(e.message).slice(0, 120)}`);
      } finally { await browser.close(); }
    }
    if (bad) { console.log(`\n${bad} screen/device pair(s) still have small or overlapping touch targets`); process.exit(1); }
    if (unreachable) { console.log('browser measurement could not run (Chrome or game server not available)'); process.exit(2); }
    console.log(`\nall screens hold the phone touch-target check (${coveredPairs} COVERED pair(s): sticky/fixed bar over scrolled rows, counted and listed above, not silently skipped)`);
  }
}

