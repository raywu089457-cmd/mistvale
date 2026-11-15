// Copy PixelLab-composed monster sheets (output/heroloom-ext/monsters-pl/<id>/) into the
// engine pack dir assets/heroloom-monsters3/, and regenerate the lossless .webp siblings that
// build.mjs prefers over the .png (media() checks for a same-name .webp first).
//
// usage: node pipeline/scripts/heroloom/integrate-monsters-pl.mjs [--ids=mole,boar] [--dry-run]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const SRC = path.join(ROOT, 'output/heroloom-ext/monsters-pl');
const DEST = path.join(ROOT, 'assets/heroloom-monsters3');

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)=?(.*)$/);
  return [m[1], m[2] === '' ? true : m[2]];
}));
const dryRun = !!args['dry-run'];
const wanted = args.ids ? args.ids.split(',').map((s) => s.trim()).filter(Boolean) : null;
const ACTIONS = ['idle', 'walk', 'attack', 'hurt', 'death'];

const ids = fs.readdirSync(SRC).filter((d) => {
  const p = path.join(SRC, d);
  if (!fs.statSync(p).isDirectory()) return false;
  return ACTIONS.every((a) => fs.existsSync(path.join(p, 'raw', a)));
});

const report = [];
for (const id of ids) {
  if (wanted && !wanted.includes(id)) continue;
  const dir = path.join(SRC, id);
  const png = path.join(dir, 'sheet.png');
  const meta = path.join(dir, 'meta.json');
  if (!fs.existsSync(png) || !fs.existsSync(meta)) { report.push({ id, ok: false, error: 'not composed yet' }); continue; }
  const m = JSON.parse(fs.readFileSync(meta, 'utf8'));
  if (!m.hero || !ACTIONS.every((a) => m.actions?.[a])) { report.push({ id, ok: false, error: 'meta incomplete' }); continue; }
  if (!dryRun) {
    fs.copyFileSync(png, path.join(DEST, id + '.png'));
    fs.copyFileSync(meta, path.join(DEST, id + '.json'));
  }
  report.push({ id, ok: true, artSize: m.artSize });
}

// webp siblings (lossless) — build.mjs prefers <id>.webp over <id>.png
const webpTargets = report.filter((r) => r.ok).map((r) => path.join(DEST, r.id + '.png'));
if (!dryRun && webpTargets.length) {
  const py = [
    'import sys',
    'from PIL import Image',
    'for p in sys.argv[1:]:',
    '    Image.open(p).save(p[:-4] + ".webp", "WEBP", lossless=True, quality=100)',
  ].join('\n');
  execFileSync('python', ['-c', py, ...webpTargets], { stdio: 'inherit' });
}

const ok = report.filter((r) => r.ok).length;
console.log(JSON.stringify({ ok, total: report.length, dryRun, report }, null, 1));
process.exit(report.some((r) => !r.ok) ? 1 : 0);
