// bughunt-report.mjs — 把 <view>.json 印成文字摘要: node bughunt-report.mjs desktop [scans]
import fs from 'node:fs';
const v = process.argv[2], j = JSON.parse(fs.readFileSync(`output/ui-audit/bughunt/${v}.json`));
console.log('ERRORS', j.errs.length); for (const e of j.errs) console.log(' E', e.type, '|', e.step, '|', e.msg.slice(0, 220));
console.log('FINDINGS', j.findings.length); for (const f of j.findings) console.log(' F', f.area, '|', f.title, '|', f.detail.slice(0, 230), '|', f.step);
if (process.argv[3] === 'scans') for (const s of j.scans) console.log(' S', JSON.stringify(s).slice(0, Number(process.argv[4]) || 700));
