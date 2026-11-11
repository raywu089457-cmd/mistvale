// bughunt-scans.mjs — 掃描結果摘要: node bughunt-scans.mjs <view> [cats=covered,off,small,overflow,overlap] [maxPer=3]
import fs from 'node:fs';
const v = process.argv[2], cats = (process.argv[3] || 'covered,off,small,overflow,overlap').split(','), mp = Number(process.argv[4] || 3);
const j = JSON.parse(fs.readFileSync(`output/ui-audit/bughunt/${v}.json`));
for (const s of j.scans) { const parts = []; for (const c of cats) if (s[c]?.length) parts.push(`${c}[${s[c].length}] ` + s[c].slice(0, mp).map(x => JSON.stringify(x)).join(' ')); if (parts.length) console.log(s.tag.padEnd(26), parts.join(' || ').slice(0, 900)); }
