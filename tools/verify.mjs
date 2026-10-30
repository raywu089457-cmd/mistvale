// verify.mjs — 一個指令跑完驗收,只印一小段摘要(給 pi / Claude 看結果用,不用讀幾百行輸出)。
// 用法:
//   npm run verify          建置 + npm test + 按鈕巡檢(桌機＋手機同時跑,約 5–8 分鐘)
//   npm run verify:quick    建置 + npm test(約 2 分鐘)
// 按鈕巡檢需要本機遊戲伺服器(node server.mjs,預設 http://100.79.149.0:5024)在跑;它每次請求都重讀 outputs/暮影村.html,建置完就是新版。
// 詳細輸出寫在 output/ui-audit/(不進 git):build.log、test.log、buttons-desktop.txt、buttons-phone.txt、verify-summary.md。
// 結束碼:全部通過 0;有任何一項失敗 1。
import { spawn } from 'node:child_process';
process.noDeprecation = true;   // Windows 上 spawn 要 shell:true,不要讓 DEP0190 警告洗版
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'output/ui-audit'); fs.mkdirSync(OUT, { recursive: true });
const QUICK = process.argv.includes('--quick');
const TARGET = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';

function run(cmd, args, logFile, env = {}) {
  return new Promise(resolve => {
    const t0 = Date.now(), out = fs.createWriteStream(path.join(OUT, logFile));
    const p = spawn(cmd, args, { cwd: ROOT, shell: process.platform === 'win32', env: { ...process.env, ...env } });
    let text = '';
    p.stdout.on('data', d => { text += d; out.write(d); }); p.stderr.on('data', d => { text += d; out.write(d); });
    p.on('close', code => { out.end(); resolve({ code, text, sec: Math.round((Date.now() - t0) / 1000) }); });
  });
}
const lines = [], fail = [];
const say = (ok, msg) => { lines.push(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fail.push(msg); };

// 1) 建置
const b = await run('node', ['build.mjs'], 'build.log');
const built = b.text.match(/Built .*?\((\d+\.\d+ MB)\)/);
say(b.code === 0 && !!built, `build ${built ? built[1] : '失敗'} (${b.sec}s)`);

// 2) 測試
const t = await run('npm', ['test'], 'test.log');
const passes = (t.text.match(/^PASS/gm) || []).length, errLine = t.text.split('\n').find(l => /AssertionError|Error:/.test(l));
say(t.code === 0 && passes >= 11, `npm test ${passes} 項 PASS${t.code ? ' — ' + (errLine || '').trim().slice(0, 120) : ''} (${t.sec}s)`);

// 3) 按鈕巡檢(桌機＋手機同時)
if (!QUICK) {
  let up = false; try { up = (await fetch(TARGET.replace(/\?.*/, ''), { signal: AbortSignal.timeout(5000) })).ok; } catch { }
  if (!up) say(false, `遊戲伺服器沒在跑(${TARGET});先 node server.mjs 再跑 npm run verify`);
  else {
    const crawl = mode => run('node', ['pipeline/scripts/ui-audit/buttons.mjs', mode], `buttons-${mode}.txt`, { TARGET });
    const [d, ph] = await Promise.all([crawl('desktop'), crawl('phone')]);
    for (const [mode, r] of [['desktop', d], ['phone', ph]]) {
      const total = (r.text.match(/"total": (\d+)/) || [])[1] || '?';
      const errs = (r.text.match(/"errors": \[([\s\S]*?)\]/) || [])[1]?.trim();
      const bad = r.text.split('\n').filter(l => /NO REACTION|ERROR|click-failed|COVERED|OFFSCREEN|NO-LABEL/.test(l));
      say(r.code === 0 && !errs && !bad.length, `按鈕巡檢 ${mode}:${total} 次點擊,問題 ${bad.length} 個${errs ? '、頁面錯誤' : ''} (${r.sec}s)`);
      for (const l of bad.slice(0, 5)) lines.push('      ' + l.replace(/\s+/g, ' ').slice(0, 150));
    }
  }
}
const summary = [`verify ${new Date().toISOString().slice(0, 16).replace('T', ' ')}${QUICK ? '(quick)' : ''}: ${fail.length ? `${fail.length} 項失敗` : '全部通過'}`, ...lines,
  `詳細輸出:output/ui-audit/`].join('\n');
fs.writeFileSync(path.join(OUT, 'verify-summary.md'), summary + '\n');
console.log(summary);
process.exit(fail.length ? 1 : 0);
