// claude-usage.mjs — sum Claude token usage from a Claude Code transcript (.jsonl) between two timestamps.
// Usage: node tools/claude-usage.mjs <transcript.jsonl> <fromISO> <toISO> [label]
// Counts each assistant message id once (the transcript repeats usage on streamed chunks).
// "weighted" = input-equivalent tokens using Anthropic's relative prices:
//   uncached input ×1, cache write ×1.25, cache read ×0.1, output ×5.
// Also imported by tools/session-cost.mjs (finds the transcript itself).
import fs from 'node:fs';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

export async function usage(files, from, to) {
  const t0 = from ? Date.parse(from) : -Infinity, t1 = to ? Date.parse(to) : Infinity, seen = new Map();
  for (const file of [].concat(files)) {
    const rl = readline.createInterface({ input: fs.createReadStream(file, 'utf8'), crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.includes('"usage"')) continue;
      let e; try { e = JSON.parse(line); } catch { continue; }
      const t = Date.parse(e.timestamp || ''), m = e.message;
      if (!m?.usage || !(t >= t0 && t <= t1)) continue;
      seen.set(m.id || e.uuid, m.usage);   // the last chunk of a message has the final usage
    }
  }
  const sum = { calls: 0, input: 0, cacheWrite: 0, cacheRead: 0, output: 0 };
  for (const u of seen.values()) { sum.calls++; sum.input += u.input_tokens || 0; sum.cacheWrite += u.cache_creation_input_tokens || 0; sum.cacheRead += u.cache_read_input_tokens || 0; sum.output += u.output_tokens || 0; }
  sum.weighted = Math.round(sum.input + sum.cacheWrite * 1.25 + sum.cacheRead * 0.1 + sum.output * 5);
  return sum;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [file, from, to, label = ''] = process.argv.slice(2);
  if (!file || !from || !to) { console.error('usage: node tools/claude-usage.mjs <transcript.jsonl> <fromISO> <toISO> [label]'); process.exit(2); }
  console.log(JSON.stringify({ label, from, to, ...await usage(file, from, to) }));
}
