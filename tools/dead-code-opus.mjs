// dead-code-opus.mjs — exports in src/*.js that no other file uses, and src files nothing imports. Report only.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
const walk = (d, out = []) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) {
  if (['node_modules', 'output', '.git', 'outputs', 'media'].includes(f.name)) continue;
  const p = path.join(d, f.name); f.isDirectory() ? walk(p, out) : /\.(m?js|cjs|html|json)$/.test(f.name) && out.push(p); } return out; };
const srcFiles = fs.readdirSync(path.join(ROOT, 'src')).filter(f => f.endsWith('.js')).map(f => path.join(ROOT, 'src', f));
const all = walk(ROOT).filter(f => !f.endsWith('package-lock.json')).map(f => ({ f, text: strip(fs.readFileSync(f, 'utf8')) }));
const word = n => new RegExp(`(?<![\\w$])${n.replace(/\$/g, '\\$')}(?![\\w$])`);

const unused = [], internal = [], unref = [];
for (const file of srcFiles) {
  const self = all.find(a => a.f === file).text, base = path.basename(file);
  const names = [...self.matchAll(/export\s+(?:async\s+)?(?:const|let|var|function\*?|class)\s+([\w$]+)/g)].map(m => m[1]);
  for (const m of self.matchAll(/export\s*\{([^}]*)\}/g)) for (const part of m[1].split(',')) names.push(part.trim().split(/\s+as\s+/).pop());
  for (const n of names.filter(Boolean)) {
    const others = all.filter(a => a.f !== file && word(n).test(a.text));
    if (others.length) continue;
    const uses = (self.match(new RegExp(word(n).source, 'g')) || []).length;
    (uses > 1 ? internal : unused).push(`${base} | ${n}`);
  }
  const ref = new RegExp(`['"/]${base.replace('.', '\\.')}['"]`);
  if (!all.some(a => a.f !== file && ref.test(a.text))) unref.push(base);
}
const out = ['## unused exports', ...unused, '', '## internal-only exports', ...internal, '', '## unreferenced files', ...unref].join('\n');
console.log(out); fs.writeFileSync(path.join(ROOT, 'output/dead-code-opus.md'), out + '\n');
