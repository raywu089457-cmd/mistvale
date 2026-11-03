// classify.mjs — route work items to pi / sonnet / opus with a cheap classifier,
// so Claude does not spend tokens on triage. Rules: docs/pi-tasks/ROUTING-RULES.md.
//
// Two-stage by default: Jev (the TypeSafe decision layer opencode already runs) answers the
// whole batch in one call in under a second. Anything it is not sure about
// (probability below CLASSIFY_JEV_MIN) is re-judged by the pi classifier model, which also
// writes the one-line reason. If Jev has no key or fails, everything goes to that model.
//
// Usage:
//   node tools/classify.mjs "item one" "item two" ...
//   node tools/classify.mjs --file items.txt          (one item per line; English preferred)
//
// Env:
//   CLASSIFY_BACKEND=auto|jev|flash   auto (default) = Jev first, flash for unsure items
//   CLASSIFY_JEV_MIN=0.85             accept a Jev answer at or above this probability
//   CLASSIFY_MODEL=<pi model pattern> fallback model (default opencode-go/deepseek-v4.1-flash)
//   JEV_CORE=<path>                   override ~/.config/opencode/plugin/lib/jev-core.js
//
// Prints one line per item: "<n> <tier> <item> — <why>", and writes output/pi-results/classify.json
// (each row also carries "source": jev | flash). Exit 1 if nothing could be classified.
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), fi = args.indexOf('--file');
const items = (fi >= 0 ? fs.readFileSync(args[fi + 1], 'utf8').split(/\r?\n/) : args).map(s => s.trim()).filter(Boolean);
if (!items.length) { console.error('usage: node tools/classify.mjs "item" ... | --file items.txt'); process.exit(2); }
const rules = fs.readFileSync(path.join(ROOT, 'docs/pi-tasks/ROUTING-RULES.md'), 'utf8');

const TIERS = ['pi', 'sonnet', 'opus'];
const BACKEND = (process.env.CLASSIFY_BACKEND || 'auto').toLowerCase();   // auto | jev | flash
const JEV_MIN = Number.isFinite(Number(process.env.CLASSIFY_JEV_MIN)) ? Number(process.env.CLASSIFY_JEV_MIN) : 0.85;
const JEV_CORE = process.env.JEV_CORE || path.join(os.homedir(), '.config', 'opencode', 'plugin', 'lib', 'jev-core.js');
const model = process.env.CLASSIFY_MODEL || 'opencode-go/deepseek-v4.1-flash';

// ---- stage 1: Jev (one request for the whole batch) -------------------------------------
async function jevPass() {
  if (BACKEND === 'flash' || !fs.existsSync(JEV_CORE)) return null;
  let core;
  try { core = await import(pathToFileURL(JEV_CORE).href); } catch (err) { console.error(`[classify] jev skipped: ${err.message}`); return null; }
  if (!core.enabled || !core.enabled()) { console.error('[classify] jev skipped: no OpenRouter / gateway key'); return null; }
  const state = `${rules}\n\nItems:\n${items.map((t, i) => `${i + 1}) ${t}`).join('\n')}`;
  const questions = {};
  items.forEach((_, i) => {
    questions[`i${i + 1}`] = { type: 'choice', instructions: `Item ${i + 1}: which tier should do this work?`, criteria: { pi: 'pi', sonnet: 'sonnet', opus: 'opus' } };
  });
  const t0 = Date.now();
  const res = await core.evaluate({ state }, questions);
  if (res.error) { console.error(`[classify] jev failed: ${res.error}`); return null; }
  const rows = items.map((t, i) => {
    const a = res.answers?.[`i${i + 1}`] || {};
    const tier = TIERS.includes(a.choice) ? a.choice : '?';
    return { i: i + 1, item: t, tier, p: Number(a.probabilities?.[tier] ?? a.confidence ?? 0) };
  });
  const confident = rows.filter(r => r.tier !== '?' && r.p >= JEV_MIN).length;
  console.error(`[classify] jev: ${confident}/${rows.length} confident in ${((Date.now() - t0) / 1000).toFixed(2)}s, cost $${res.usage?.cost ?? '?'}`);
  return rows;
}

// ---- stage 2: the pi classifier model (also writes the reason) --------------------------
function flashPass(list) {
  return new Promise(resolve => {
    const prompt = `${rules}\n\nItems:\n${list.map(r => `${r.i}) ${r.item}`).join('\n')}`;
    const npmRoot = (() => { try { return execSync('npm root -g').toString().trim(); } catch { return ''; } })();
    const PI_CLI = process.env.PI_CLI || path.join(npmRoot, '@earendil-works/pi-coding-agent/dist/bundle/cli.js');
    const piArgs = ['-p', '--model', model, '--no-tools', '--no-session', '--no-context-files', '--no-skills', prompt];
    // stdin must be closed: in -p mode pi waits for piped stdin to end before it starts
    const SP = { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] };
    const t0 = Date.now();
    const p = fs.existsSync(PI_CLI) ? spawn(process.execPath, [PI_CLI, ...piArgs], SP) : spawn('pi', piArgs, SP);
    let out = ''; p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
    const timer = setTimeout(() => p.kill(), 4 * 60e3);
    p.on('close', () => {
      clearTimeout(timer);
      // tolerant parse: the router sometimes drops the closing "]" → read each {...} object on its own
      const res = (out.match(/\{[^{}]*\}/g) || []).map(t => { try { return JSON.parse(t); } catch { return null; } }).filter(r => r && r.i != null && r.tier);
      if (!res.length) { console.error(`[classify] ${model} reply had no usable items:\n` + out.slice(-800)); return resolve(null); }
      const map = {};
      for (const r of res) map[Number(r.i)] = { tier: String(r.tier), why: r.why ?? '' };
      console.error(`[classify] ${model}: ${res.length}/${list.length} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      resolve(map);
    });
  });
}

// ---- main -------------------------------------------------------------------------------
const rows = items.map((t, i) => ({ i: i + 1, item: t, tier: '?', why: 'missing', source: '' }));
const jev = await jevPass();
if (jev) {
  for (const r of rows) {
    const j = jev[r.i - 1];
    const accept = j.tier !== '?' && (BACKEND === 'jev' || j.p >= JEV_MIN);
    if (accept) { r.tier = j.tier; r.why = `jev p=${j.p.toFixed(2)}`; r.source = 'jev'; }
  }
}
const open = BACKEND === 'jev' ? [] : rows.filter(r => r.source !== 'jev');
if (open.length) {
  const got = await flashPass(open);
  if (got) for (const r of open) {
    const g = got[r.i];
    if (g && TIERS.includes(g.tier)) { r.tier = g.tier; r.why = g.why; r.source = 'flash'; }
  }
}

if (!rows.some(r => r.tier !== '?')) { console.error('[classify] no tier could be decided'); process.exit(1); }
fs.mkdirSync(path.join(ROOT, 'output/pi-results'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'output/pi-results/classify.json'), JSON.stringify(rows, null, 1));
for (const r of rows) console.log(`${r.i} ${String(r.tier).padEnd(6)} ${r.item} — ${r.why}`);
if (rows.some(r => r.tier === '?')) process.exit(1);
