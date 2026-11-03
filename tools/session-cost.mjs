// session-cost.mjs — Claude 端成本,不用自己找逐字稿:自動找本專案最新(或指定)的 session,含它的子代理。
// 用法:node tools/session-cost.mjs [--session <id 前綴>] [--from ISO] [--to ISO] [--label 名稱] [--log] [--list]
//   預設:最新的 session,從頭算到現在。--log 追加一行到 docs/pi-tasks/claude-cost.csv。--list 列出最近 8 個 session。
//   weighted 算法同 tools/claude-usage.mjs(未快取×1、快取寫×1.25、快取讀×0.1、輸出×5)。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { usage } from './claude-usage.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null; };
const flag = k => args.includes('--' + k);

// Claude Code stores transcripts under ~/.claude/projects/<cwd with : \ / . turned into ->
const DIR = path.join(os.homedir(), '.claude/projects', ROOT.replace(/[:\\/.]/g, '-'));
if (!fs.existsSync(DIR)) { console.error(`找不到逐字稿資料夾:${DIR}`); process.exit(2); }
const sessions = fs.readdirSync(DIR).filter(f => f.endsWith('.jsonl'))
  .map(f => ({ id: f.slice(0, -6), mtime: fs.statSync(path.join(DIR, f)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime);
if (flag('list')) { for (const s of sessions.slice(0, 8)) console.log(`${s.id}  ${new Date(s.mtime).toISOString().slice(0, 16)}`); process.exit(0); }

const want = opt('session');
const s = want ? sessions.find(x => x.id.startsWith(want)) : sessions[0];
if (!s) { console.error(`找不到 session:${want}`); process.exit(2); }
const sub = path.join(DIR, s.id, 'subagents');
const files = [path.join(DIR, s.id + '.jsonl'), ...(fs.existsSync(sub) ? fs.readdirSync(sub).filter(f => f.endsWith('.jsonl')).map(f => path.join(sub, f)) : [])];
const from = opt('from') || '', to = opt('to') || new Date().toISOString(), label = opt('label') || '';
const sum = await usage(files, from, to);
console.log(JSON.stringify({ label, session: s.id, from, to, ...sum }));
if (flag('log')) {
  const csv = path.join(ROOT, 'docs/pi-tasks/claude-cost.csv');
  if (!fs.existsSync(csv)) fs.writeFileSync(csv, 'date,label,session,from,to,calls,input,cache_write,cache_read,output,weighted\n');
  fs.appendFileSync(csv, [new Date().toISOString().slice(0, 16), label.replace(/,/g, ' '), s.id, from, to, sum.calls, sum.input, sum.cacheWrite, sum.cacheRead, sum.output, sum.weighted].join(',') + '\n');
}
