import fs from 'node:fs';
const d = 'output/ui-audit/round3-mobile/primary/';
const f = fs.readdirSync(d).filter(x => x.startsWith('primary-') && x.endsWith('.json')).sort().pop();
const j = JSON.parse(fs.readFileSync(d + f));
for (const [vn, { R, errs }] of Object.entries(j)) {
  const bad = [];
  for (const [sc, r] of Object.entries(R)) {
    if (r.error) { bad.push(sc + ' ERR ' + r.error); continue; }
    for (const [k, v] of Object.entries(r.keys)) { if (!v) { continue; } const p = []; if (!v.inV) p.push(`需捲動/出界 top${v.top} bot${v.bottom} vh${r.vh}`); if (!v.hit) p.push('點不到→' + v.hitSel); if (v.aboveBar === false) p.push('壓到頁籤列 bar' + r.barTop); if (v.h < 44) p.push('高' + v.h); if (p.length) bad.push(`${sc}:${k} ${p.join(' ')}`); }
    if (r.x && (!r.x.hit || r.x.h < 44 || r.x.w < 44)) bad.push(`${sc}:X ${r.x.w}x${r.x.h} hit=${r.x.hit} ${r.x.hitSel || ''}`);
    const t = r.tabs.map((h, i) => (h ? '' : i)).filter(x => x !== ''); if (t.length && !(r.modal && /^l/.test(vn) )) bad.push(`${sc}:頁籤列第${t.join(',')}顆被蓋`);
    if (r.modal && r.barTop && r.modal.bottom > r.barTop + 1) bad.push(`${sc}: 面板底 ${r.modal.bottom} > 頁籤列頂 ${r.barTop}`);
  }
  console.log(`== ${vn} errs=${errs.length}\n  ` + (bad.join('\n  ') || 'clean'));
}
