// measure_alignment.js — 在遊戲頁面 console 貼上執行（先按「村莊」再按 3 次「+」，跟量測基準同一個構圖）。
// 把畫面中央的村莊區跟 title.png（登入概念圖）比色彩分佈：
//   bhattacharyya / histIntersection：512 格 RGB 直方圖相似度，1 = 完全相同分佈
//   lum / sat：平均亮度與飽和度
// 另外 __mistvaleDetails().proc 必須是 {}（畫面上沒有任何退回程序繪製的裝飾或魔物）。
(async()=>{
  __mistvaleResetProc();await new Promise(r=>setTimeout(r,2000));  // 丟掉圖集載完前那幾幀的計數
  const hist=d=>{const h=new Float64Array(512);let n=0;for(let i=0;i<d.length;i+=4){if(d[i+3]<255)continue;h[(d[i]>>5)*64+(d[i+1]>>5)*8+(d[i+2]>>5)]++;n++;}for(let i=0;i<512;i++)h[i]/=n;return h;};
  const stats=d=>{let s=0,l=0,n=0;for(let i=0;i<d.length;i+=4){const r=d[i],g=d[i+1],b=d[i+2],mx=Math.max(r,g,b),mn=Math.min(r,g,b);s+=mx?(mx-mn)/mx:0;l+=.299*r+.587*g+.114*b;n++;}return{sat:+(s/n).toFixed(3),lum:+(l/n).toFixed(1)};};
  const im=new Image();im.src=PIXEL_ASSETS.title;await im.decode();
  const c1=new OffscreenCanvas(256,256),x1=c1.getContext('2d');x1.drawImage(im,0,0,256,256);const ref=x1.getImageData(0,0,256,256).data;
  const cv=[...document.querySelectorAll('canvas')].sort((a,b)=>b.width*b.height-a.width*a.height)[0];
  const w=cv.width,h=cv.height,s=Math.min(w,h)*.62,c2=new OffscreenCanvas(256,256),x2=c2.getContext('2d');
  x2.drawImage(cv,(w-s)/2,(h-s)/2+h*.02,s,s,0,0,256,256);const game=x2.getImageData(0,0,256,256).data;
  const a=hist(ref),b=hist(game);let inter=0,bc=0;for(let i=0;i<512;i++){inter+=Math.min(a[i],b[i]);bc+=Math.sqrt(a[i]*b[i]);}
  const out={bhattacharyya:+bc.toFixed(3),histIntersection:+inter.toFixed(3),ref:stats(ref),game:stats(game),proc:__mistvaleDetails().proc};
  console.log(out);return out;
})();
