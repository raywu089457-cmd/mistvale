// 素材載入計數:世界與圖示建立的每一張圖都經過 trackImage,讀取畫面才能顯示真實進度,
// 並確認全部載完之後才進村莊。載入失敗的圖記在 failed,讀取畫面就不進村、改顯示錯誤。
let finished=0,created=0,failed=0;
export function trackImage(im){
  created++;
  im.addEventListener('load',()=>{finished++;});
  im.addEventListener('error',()=>{finished++;failed++;});
  return im;
}
export function assetProgress(){return {done:finished,total:created,failed};}
