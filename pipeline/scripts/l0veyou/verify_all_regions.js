// verify_all_regions.js — 全地圖對齊驗收：8 個區域 × 3 種縮放，逐一量測，不靠目測。
// 用法：遊戲開始後（按過「開始/繼續村長生活」），在 console 貼上執行；約 80 秒。
//
// 每一格輸出：
//   conform  畫面像素有多少比例落在「概念圖色票」附近（RGB 距離 < 32）。色票＝title.png k-means 48 色。
//            概念圖自己量約 0.91（48 色量化的上限）；比例越高＝畫面用的顏色越都是概念圖的顏色。
//   dE       每個像素到最近色票色的平均距離（越小越好）。
//   gamut    畫面像素的顏色（每通道 32 階量化，容許相鄰一階）在原尺寸概念圖裡至少出現 10 次的比例。
//            k-means 會把炊煙、羊毛這種少量的白吃掉；gamut 不會，所以延伸區（雪地）用它比較公平。
//   proc     這一格畫面上退回程序繪製的物件（必須是 {}）。
// 最後一列是概念圖對自己的量測，當作上限參考。
(async()=>{
  const V=globalThis.__mistvaleView;if(!V)throw new Error('先進入遊戲畫面');
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  // 1) 概念圖色票（k-means，固定初始化，結果可重現）
  const im=new Image();im.src=PIXEL_ASSETS.title;await im.decode();
  const N=96,c0=new OffscreenCanvas(N,N),x0=c0.getContext('2d');x0.drawImage(im,0,0,N,N);
  const src=x0.getImageData(0,0,N,N).data,pts=[];for(let i=0;i<src.length;i+=4)pts.push([src[i],src[i+1],src[i+2]]);
  const K=48;let cen=Array.from({length:K},(_,k)=>pts[Math.floor((k+.5)*pts.length/K)].slice());
  for(let it=0;it<10;it++){const sum=cen.map(()=>[0,0,0,0]);
    for(const p of pts){let b=0,bd=1e9;for(let k=0;k<K;k++){const c=cen[k],d=(p[0]-c[0])**2+(p[1]-c[1])**2+(p[2]-c[2])**2;if(d<bd){bd=d;b=k;}}const s=sum[b];s[0]+=p[0];s[1]+=p[1];s[2]+=p[2];s[3]++;}
    cen=cen.map((c,k)=>sum[k][3]?[sum[k][0]/sum[k][3],sum[k][1]/sum[k][3],sum[k][2]/sum[k][3]]:c);}
  // 原尺寸概念圖的顏色佔用表（16 階 → 4096 格），再往相鄰一階膨脹當容差
  const cf=new OffscreenCanvas(im.width,im.height),xf=cf.getContext('2d');xf.drawImage(im,0,0);const full=xf.getImageData(0,0,im.width,im.height).data;
  const Q=32,cnt=new Uint32Array(Q*Q*Q),bin=(r,g,b)=>(r>>3)*Q*Q+(g>>3)*Q+(b>>3);for(let i=0;i<full.length;i+=4)cnt[bin(full[i],full[i+1],full[i+2])]++;
  const occ=new Uint8Array(Q*Q*Q);for(let r=0;r<Q;r++)for(let g=0;g<Q;g++)for(let b=0;b<Q;b++){if(cnt[r*Q*Q+g*Q+b]<10)continue;
    for(let dr=-1;dr<=1;dr++)for(let dg=-1;dg<=1;dg++)for(let db=-1;db<=1;db++){const R=r+dr,G=g+dg,B=b+db;if(R>=0&&R<Q&&G>=0&&G<Q&&B>=0&&B<Q)occ[R*Q*Q+G*Q+B]=1;}}
  const gamut=data=>{let ok=0,n=0;for(let i=0;i<data.length;i+=4){ok+=occ[bin(data[i],data[i+1],data[i+2])];n++;}return +(ok/n).toFixed(3);};
  const measure=data=>{let ok=0,de=0,n=0;for(let i=0;i<data.length;i+=4){const r=data[i],g=data[i+1],b=data[i+2];let bd=1e9;for(const c of cen){const d=(r-c[0])**2+(g-c[1])**2+(b-c[2])**2;if(d<bd)bd=d;}const d=Math.sqrt(bd);de+=d;if(d<32)ok++;n++;}return{conform:+(ok/n).toFixed(3),dE:+(de/n).toFixed(1)};};
  const cv=[...document.querySelectorAll('canvas')].sort((a,b)=>b.width*b.height-a.width*a.height)[0];
  const frame=()=>{const w=cv.width,h=cv.height,c=new OffscreenCanvas(160,Math.round(160*h/w)),x=c.getContext('2d');x.drawImage(cv,0,0,c.width,c.height);return x.getImageData(0,0,c.width,c.height).data;};
  // 2) 8 區域 × 3 縮放
  const regions=['village','meadow','forest','taiga','snow','mountain','desert','birch'],zooms={far:.9,mid:1.8,close:3.4},rows=[];
  for(const id of regions)for(const [zn,z] of Object.entries(zooms)){
    V.focus(id==='village'?'home':'region:'+id);V.zoomTo(z);await sleep(2500);  // 鏡頭會滑過去,太早量會量到半路(實測 1.6 秒不夠)
    __mistvaleResetProc();await sleep(700);
    const f=frame();rows.push({region:id,zoom:zn,...measure(f),gamut:gamut(f),proc:JSON.stringify(__mistvaleDetails().proc)});
  }
  rows.push({region:'(概念圖自身)',zoom:'-',...measure(src),gamut:gamut(src),proc:'-'});
  V.focus('home');console.table(rows);return rows;
})();
