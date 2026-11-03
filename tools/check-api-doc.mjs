// check-api-doc.mjs — does an API doc mention every export of the given src files? Usage: node tools/check-api-doc.mjs <doc.md> [file.js ...]  (default: all src/*.js)
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const [doc, ...only] = process.argv.slice(2);
if (!doc) { console.error('usage: node tools/check-api-doc.mjs <doc.md> [file.js ...]'); process.exit(2); }
const text = fs.readFileSync(doc, 'utf8');
const files = (only.length ? only : fs.readdirSync(path.join(ROOT, 'src')).filter(f => f.endsWith('.js'))).map(f => path.basename(f));
let total = 0, missing = [];
for (const f of files) {
  const src = fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
  const names = [...src.matchAll(/^export\s+(?:async\s+)?(?:const|let|var|function\*?|class)\s+([\w$]+)/gm)].map(m => m[1]);
  for (const m of src.matchAll(/^export\s*\{([^}]*)\}/gm)) for (const p of m[1].split(',')) names.push(p.trim().split(/\s+as\s+/).pop());
  for (const n of names.filter(Boolean)) { total++; if (!new RegExp(`(?<![\\w$])${n.replace(/\$/g, '\\$')}(?![\\w$])`).test(text)) missing.push(`${f}:${n}`); }
}
console.log(`exports ${total}, documented ${total - missing.length}, missing ${missing.length}`);
if (missing.length) console.log(missing.join('\n'));
process.exit(missing.length ? 1 : 0);
