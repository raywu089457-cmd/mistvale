// ui-tip.js — 迷你視窗 tooltip(圖鑑規格 i,Z2A)。觸控點一下顯示、點別處或 Esc 關閉;桌機滑鼠 hover 與鍵盤焦點用同一個元件。
// 給任何面板用:在要顯示 tooltip 的元素上加 `data-tip`(用 tipAttr(spec) 產生,內容是 JSON),元素本身要夠大(觸控 ≥44px)、最好是 <button>。
//   spec = { name:'精鐵武器', grade:'normal|rare|superior|heroic|legendary'(名稱依品級上色), icon:'swords'(圖示名,可省略), stars:0–5(圖示格下方的金星), level:'+3'(圖示格角標),
//            stats:[['品質','稀有'],['道具等級','+3']](右上的標籤／數值列), lines:[['pos'|'neg'|'note', '文字'], …](正面藍／負面紅／備註金) }
// 用法:import {tipAttr} from './ui-tip.js';  `<button class="…" ${tipAttr({name:'…',lines:[['pos','攻擊 +7']]})}>…</button>`;initTips() 由 pixel-ui.js 啟動一次。
let tipEl=null,anchor=null,pinned=false,deps={esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),iconHTML:null,setIcons:null};
const GRADE_NAME={normal:'普通',rare:'稀有',superior:'超級稀有',heroic:'英雄',legendary:'傳說'};
const LINE_CLS={pos:'pos',neg:'neg',note:'note'};
export const tipAttr=spec=>` data-tip="${deps.esc(JSON.stringify(spec))}"`;
export const tipGradeName=g=>GRADE_NAME[g]||GRADE_NAME.normal;
function build(spec){
  const e=deps.esc,g=GRADE_NAME[spec.grade]?spec.grade:'normal';
  const stars=Math.max(0,Math.min(5,spec.stars|0));
  const ic=spec.icon&&deps.iconHTML?deps.iconHTML(spec.icon,true):'';
  const head=(ic||spec.stats?.length)?`<div class="ui-tip-head"><span class="ui-tip-ic" data-grade="${g}">${ic}${stars?`<span class="ui-tip-stars" aria-hidden="true">${'<i></i>'.repeat(stars)}</span>`:''}${spec.level?`<small class="ui-tip-lv">${e(spec.level)}</small>`:''}</span><dl class="ui-tip-stats">${(spec.stats||[]).map(([k,v])=>`<div><dt>${e(k)}</dt><dd>${e(v)}</dd></div>`).join('')}</dl></div>`:'';
  const lines=(spec.lines||[]).filter(Boolean).map(([k,t])=>`<li class="${LINE_CLS[k]||'note'}">${e(t)}</li>`).join('');
  return `<b class="ui-tip-name" data-grade="${g}">${e(spec.name)}</b>${head}${lines?`<ul class="ui-tip-lines">${lines}</ul>`:''}`;
}
function place(){
  if(!tipEl||!anchor)return;
  const m=8,vw=document.documentElement.clientWidth,vh=document.documentElement.clientHeight;
  tipEl.style.maxWidth=Math.min(272,vw-2*m)+'px';tipEl.style.left='0px';tipEl.style.top='0px';
  const a=anchor.getBoundingClientRect(),t=tipEl.getBoundingClientRect();
  let left=a.left+a.width/2-t.width/2;left=Math.max(m,Math.min(vw-m-t.width,left));
  let top=a.top-t.height-6;if(top<m)top=Math.min(vh-m-t.height,a.bottom+6);   // 上面放不下就放下面
  tipEl.style.left=Math.round(left)+'px';tipEl.style.top=Math.round(Math.max(m,top))+'px';
}
export function hideTip(){
  if(anchor){anchor.removeAttribute('aria-describedby');anchor.classList.remove('tip-on');}
  anchor=null;pinned=false;if(tipEl){tipEl.hidden=true;tipEl.innerHTML='';}
}
export function showTip(el,hover=false){
  let spec;try{spec=JSON.parse(el.dataset.tip);}catch{return;}
  if(!tipEl)return;
  if(anchor&&anchor!==el){anchor.removeAttribute('aria-describedby');anchor.classList.remove('tip-on');}
  anchor=el;pinned=!hover;tipEl.innerHTML=build(spec);tipEl.hidden=false;if(deps.setIcons)deps.setIcons(tipEl);
  el.setAttribute('aria-describedby','ui-tip');el.classList.add('tip-on');place();
  requestAnimationFrame(watch);
}
function watch(){if(!anchor)return;if(!anchor.isConnected||!document.contains(anchor)){hideTip();return;}requestAnimationFrame(watch);}
export function tipVisible(){return !!anchor;}
export function initTips(d={}){
  if(tipEl)return;Object.assign(deps,d);
  tipEl=document.createElement('div');tipEl.id='ui-tip';tipEl.className='ui-tip';tipEl.setAttribute('role','tooltip');tipEl.hidden=true;document.body.append(tipEl);
  const tipOf=t=>t&&t.closest?t.closest('[data-tip]'):null;
  // 點擊(觸控、滑鼠、鍵盤 Enter/Space 都會產生 click):同一個再點一次收起;滑鼠 hover 出來的點一下就釘住
  document.addEventListener('click',e=>{const el=tipOf(e.target);if(!el)return;if(anchor===el&&pinned)hideTip();else showTip(el,false);});
  document.addEventListener('pointerover',e=>{if(e.pointerType!=='mouse')return;const el=tipOf(e.target);if(el&&el!==anchor)showTip(el,true);},true);
  document.addEventListener('pointerout',e=>{if(e.pointerType!=='mouse'||pinned||!anchor)return;const el=tipOf(e.target);if(el===anchor&&!(e.relatedTarget&&el.contains(e.relatedTarget)))hideTip();},true);
  document.addEventListener('pointerdown',e=>{if(anchor&&tipOf(e.target)!==anchor)hideTip();},true);   // 點別處關閉(這一下仍照常送給底下的按鈕)
  document.addEventListener('focusin',e=>{const el=tipOf(e.target);if(el&&el.matches(':focus-visible')&&el!==anchor)showTip(el,true);});
  document.addEventListener('focusout',e=>{if(anchor&&tipOf(e.target)===anchor&&!pinned)hideTip();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&anchor){hideTip();e.stopImmediatePropagation();e.preventDefault();}},true);   // 先關 tooltip,再按一次才關視窗
  addEventListener('resize',hideTip);document.addEventListener('scroll',()=>{if(anchor)hideTip();},true);
  globalThis.__mistvaleTip={show:showTip,hide:hideTip,visible:tipVisible,attr:tipAttr};
}
