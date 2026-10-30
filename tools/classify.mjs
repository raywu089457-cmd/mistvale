// classify.mjs — route work items to pi / sonnet / opus with a cheap classifier model (OpenRouter typesafe/jev-router via pi),
// so Claude does not spend tokens on triage. Rules: docs/pi-tasks/ROUTING-RULES.md.
// Usage:
//   node tools/classify.mjs "item one" "item two" ...
//   node tools/classify.mjs --file items.txt          (one item per line; English preferred)
//   CLASSIFY_MODEL=<pi model pattern> to override (default openrouter/typesafe/jev-router)
// Prints one line per item: "<n> <tier> <item> — <why>", and writes output/pi-results/classify.json. Exit 1 if the reply is not valid JSON.
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), fi = args.indexOf('--file');
const items = (fi >= 0 ? fs.readFileSync(args[fi + 1], 'utf8').split(/\r?\n/) : args).map(s => s.trim()).filter(Boolean);
if (!items.length) { console.error('usage: node tools/classify.mjs "item" ... | --file items.txt'); process.exit(2); }
const rules = fs.readFileSync(path.join(ROOT, 'docs/pi-tasks/ROUTING-RULES.md'), 'utf8');
const prompt = `${rules}\n\nItems:\n${items.map((t, i) => `${i + 1}) ${t}`).join('\n')}`;
const npmRoot = (() => { try { return execSync('npm root -g').toString().trim(); } catch { return ''; } })();
const PI_CLI = process.env.PI_CLI || path.join(npmRoot, '@earendil-works/pi-coding-agent/dist/bundle/cli.js');
const model = process.env.CLASSIFY_MODEL || 'openrouter/typesafe/jev-router';
const piArgs = ['-p', '--model', model, '--no-tools', '--no-session', '--no-context-files', '--no-skills', prompt];
// stdin must be closed: in -p mode pi waits for piped stdin to end before it starts
const SP = { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] };
const p = fs.existsSync(PI_CLI) ? spawn(process.execPath, [PI_CLI, ...piArgs], SP) : spawn('pi', piArgs, SP);
let out = ''; p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
const timer = setTimeout(() => p.kill(), 4 * 60e3);
p.on('close', () => {
  clearTimeout(timer);
  // tolerant parse: the router sometimes drops the closing "]" → read each {...} object on its own
  const res = (out.match(/\{[^{}]*\}/g) || []).map(t => { try { return JSON.parse(t); } catch { return null; } }).filter(r => r && r.i != null && r.tier);
  if (!res.length) { console.error('classifier reply had no usable items:\n' + out.slice(-800)); process.exit(1); }
  if (!Array.isArray(res)) { console.error('classifier reply was not JSON:\n' + out.slice(-800)); process.exit(1); }
  const rows = items.map((t, i) => ({ i: i + 1, item: t, ...(res.find(r => Number(r.i) === i + 1) || { tier: '?', why: 'missing' }) }));
  fs.mkdirSync(path.join(ROOT, 'output/pi-results'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'output/pi-results/classify.json'), JSON.stringify(rows, null, 1));
  for (const r of rows) console.log(`${r.i} ${String(r.tier).padEnd(6)} ${r.item} — ${r.why}`);
});
