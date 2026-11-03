// pi-cost.mjs — sum pi token usage and dollar cost from a pi session log (output/pi-sessions/*.jsonl).
// Usage: node tools/pi-cost.mjs [session.jsonl | Txx]     (default: newest session; Txx = newest session named Txx-*)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'output/pi-sessions');
const arg = process.argv[2];
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.jsonl')).map(f => path.join(DIR, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
const nameOf = f => { try { return fs.readFileSync(f, 'utf8').match(/"type":"session_info"[^\n]*?"name":"([^"]*)"/)?.[1] || ''; } catch { return ''; } };
const file = arg && fs.existsSync(arg) ? arg : arg ? files.find(f => nameOf(f).toUpperCase().startsWith(arg.toUpperCase())) : files[0];
if (!file) { console.error('no matching pi session'); process.exit(2); }
const s = { session: path.basename(file), calls: 0, input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0, usd: 0 };
for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
  if (!line.includes('"usage"')) continue;
  let e; try { e = JSON.parse(line); } catch { continue; }
  const u = e.message?.usage; if (!u) continue;
  s.calls++; s.input += u.input || 0; s.cacheRead += u.cacheRead || 0; s.cacheWrite += u.cacheWrite || 0; s.output += u.output || 0; s.reasoning += u.reasoning || 0; s.usd += u.cost?.total || 0;
}
s.usd = +s.usd.toFixed(4);
console.log(JSON.stringify(s));
