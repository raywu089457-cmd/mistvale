// round3-mobile-analyze.mjs — 彙整 gap 資料:每尺寸、每種問題、哪些場景。 用法: node ... <dataDir> [tag...]
import fs from 'node:fs';
const dir = process.argv[2] || 'output/ui-audit/round3-mobile/gap/data';
const only = process.argv.slice(3);
const KEEP = new Set(['small-text', 'tap-target', 'covered', 'offscreen-partial', 'overlap', 'text-overflow-x', 'text-clipped-y', 'hud-text-overlap', 'hud-box-overlap', 'page-hscroll', 'ellipsis-truncated']);
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.includes('loading'))) {
  const j = JSON.parse(fs.readFileSync(dir + '/' + f));
  if (only.length && !only.includes(j.tag)) continue;
  const g = new Map();
  for (const r of j.results) {
    if (r.error) { console.log('ERR', j.tag, r.name, r.error.slice(0, 100)); continue; }
    if (r.name === 'cmdk' && !/^(768|1024)x/.test(j.tag)) continue;
    for (const i of r.issues) { if (!KEEP.has(i.kind)) continue; if (i.kind === 'offscreen-partial' && i.scope === '#modal') continue; if (r.modal && ['covered','overlap'].includes(i.kind) && !/^(#modal|#toasts)/.test(i.scope)) continue; if (i.kind==='offscreen-partial' && /pixel-button|party-pick|hv-btn|hv-sec/.test(i.sel) && r.endCheck?.scrollable) continue; const k = `${i.kind}|${i.sel}|${i.detail.replace(/\(\d+,\d+\)/, '')}`; if (!g.has(k)) g.set(k, { i, sc: [] }); g.get(k).sc.push(r.name); }
    const e = r.endCheck; if (e) {
      if (e.last && (!e.last.hit || e.last.bottom > e.last.cBottom + 1 || e.last.bottom > e.vh)) { const k = `endcheck|${r.name}`; g.set(k, { i: { kind: 'end-not-reachable', sel: r.name, detail: JSON.stringify(e.last) }, sc: [r.name] }); }
      if (e.modalBottom > e.barTop + 1 && e.barTop) { g.set(`modalbar|${r.name}`, { i: { kind: 'modal-over-bar', sel: r.name, detail: `modal ${e.modalTop}-${e.modalBottom} bar ${e.barTop}` }, sc: [r.name] }); }
    }
  }
  console.log(`\n=== ${j.tag} errors=${j.errors.length} ${j.errors.slice(0, 3).join(' | ')}`);
  for (const [k, v] of [...g].sort((a, b) => a[1].i.kind.localeCompare(b[1].i.kind))) console.log(`${v.i.kind.padEnd(16)} ${v.i.sel.slice(0, 50).padEnd(50)} ${v.i.detail.slice(0, 110)} [${[...new Set(v.sc)].slice(0, 6).join(',')}${v.sc.length > 6 ? '…' + v.sc.length : ''}]`);
}
