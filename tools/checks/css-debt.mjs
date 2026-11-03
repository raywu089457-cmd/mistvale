// css-debt.mjs — 量 src/pixel-style.css 的樣式債,分前後兩半(實驗 5 的對照組切點),可當 Accept。
// 用法:node tools/checks/css-debt.mjs [--track color|font] [--range A|B|all] [--max-hex N] [--max-fs N] [--max-dup N]
//   A = 檔頭到切點註解之前;B = 切點到檔尾。色彩軌切在 `/* @split color`,字級軌切在 `/* @split font`(兩軌各自 50/50;用註解切,改檔後不漂)。
//   hex:`:root{}` 以外出現的色碼次數;fs:寫死的 `font-size:Npx` 次數(var(--fs-*) 不算);
//   dup:同一個選擇器在兩個以上地方(base / 各 @media)宣告 font-size 的選擇器數。任何一項超過上限 → exit 1。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null; };
const css = fs.readFileSync(path.join(ROOT, 'src/pixel-style.css'), 'utf8');
const MARK = `/* @split ${opt('track') || 'color'}`;
const cut = css.indexOf(MARK);
if (cut < 0) { console.error(`css-debt: split marker not found: ${MARK}`); process.exit(2); }
const range = (opt('range') || 'all').toUpperCase();
const text = range === 'A' ? css.slice(0, cut) : range === 'B' ? css.slice(cut) : css;

// walk rules with a brace counter: collects [mediaPrefix, selector, declarations]; :root blocks are where tokens live
const rules = [];
const walk = (s, media) => {
  let i = 0;
  while (i < s.length) {
    const open = s.indexOf('{', i); if (open < 0) break;
    const head = s.slice(i, open).replace(/\/\*[\s\S]*?\*\//g, '').trim();
    let depth = 1, j = open + 1;
    for (; j < s.length && depth; j++) { if (s[j] === '{') depth++; else if (s[j] === '}') depth--; }
    const body = s.slice(open + 1, j - 1);
    if (head.startsWith('@media') || head.startsWith('@supports')) walk(body, media + head.replace(/\s+/g, ''));
    else if (!head.startsWith('@')) rules.push([media, head.replace(/\s+/g, ' '), body]);
    i = j;
  }
};
walk(text, '');

let hex = 0; const distinct = new Set(); let fsPx = 0; const fsAt = new Map();
for (const [media, sel, body] of rules) {
  if (/^:root\b/.test(sel)) continue;
  for (const m of body.matchAll(/#[0-9a-f]{3,8}\b/gi)) { hex++; distinct.add(m[0].toLowerCase()); }
  const px = body.match(/font-size\s*:\s*[\d.]+px/gi) || []; fsPx += px.length;
  if (/font-size\s*:/i.test(body)) for (const one of sel.split(',')) { const k = one.trim(); fsAt.set(k, (fsAt.get(k) || new Set()).add(media || 'base')); }
}
const dup = [...fsAt.values()].filter(v => v.size > 1).length;
const tokens = (css.match(/^\s*:root\s*\{[^}]*\}/m)?.[0].match(/--[\w-]+\s*:/g) || []).length;
console.log(`css-debt range ${range}: hex ${hex} (distinct ${distinct.size}) | font-size px ${fsPx} | dup font-size selectors ${dup} | :root tokens ${tokens}`);
const over = [['hex', hex], ['fs', fsPx], ['dup', dup]].filter(([k, v]) => opt('max-' + k) != null && v > Number(opt('max-' + k)));
for (const [k, v] of over) console.log(`  FAIL ${k} ${v} > max ${opt('max-' + k)}`);
process.exit(over.length ? 1 : 0);
