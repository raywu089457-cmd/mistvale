// check-api-lines.mjs — do the "(line N)" / "(N)" numbers in an API doc point at the line that defines the name?
// Usage: node tools/check-api-lines.mjs <doc.md> [file.js ...]
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const [doc, ...only] = process.argv.slice(2);
let file = null, ok = 0, tot = 0; const bad = [];
for (const l of fs.readFileSync(doc, 'utf8').split('\n')) {
  const h = l.match(/^##\s+(?:src\/)?([\w.-]+\.js)/); if (h) { file = h[1]; continue; }
  const m = l.match(/^\s*-\s+(`[^:]*?)\s*\((?:line\s*)?(\d+)\)/); if (!m || !file || (only.length && !only.includes(file))) continue;
  const names = [...m[1].matchAll(/[\w$]+/g)].map(x => x[0]), n = +m[2];
  const src = fs.readFileSync(path.join(ROOT, 'src', file), 'utf8').split('\n'), win = src.slice(Math.max(0, n - 2), n + 1).join('\n');
  tot++; names.some(x => win.includes(x)) ? ok++ : bad.push(`${file}:${m[1]}@${n}`);
}
console.log(JSON.stringify({ doc, withLine: tot, ok, bad: bad.length, sample: bad.slice(0, 6) }));
