"""make_ui_mockups.py — 產生 4 版遊戲 UI 風格稿（純 HTML，可直接開）。

    python ui-mockups/make_ui_mockups.py

共同結構：世界背景圖（遊戲實機截圖）＋ 上方資源列 ＋ 左側委託卡 ＋ 右側獵人卡 ＋ 下方動作列 ＋ 提示條；
點下方任一按鈕會開一個示範視窗，方便看 modal 的樣子。四版只換外觀，內容完全一樣，好比較。
"""
from __future__ import annotations

import pathlib

HERE = pathlib.Path(__file__).resolve().parent
BG = "world.jpg"

BASE = """
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:100%;height:100%;overflow:hidden;background:#11151a;
  font-family:'Noto Sans TC','Microsoft JhengHei','PingFang TC',system-ui,sans-serif;
  -webkit-font-smoothing:antialiased}
#stage{position:fixed;inset:0;background:url(__BG__) center/cover no-repeat;image-rendering:pixelated}
#stage:after{content:'';position:absolute;inset:0;pointer-events:none;__VIGNETTE__}
button{font:inherit;color:inherit;background:none;border:0;cursor:pointer}
.k{font-family:Consolas,Menlo,monospace;letter-spacing:.5px}
/* ---------- 上方資源列 ---------- */
#top{position:absolute;top:0;left:0;right:0;display:flex;align-items:center;gap:14px;padding:10px 18px;__TOPBAR__}
.badge{display:flex;align-items:center;gap:10px;padding:6px 14px 6px 8px;__BADGE__}
.crest{width:42px;height:42px;display:grid;place-items:center;__CREST__}
.crest svg{width:26px;height:26px;fill:currentColor}
.badge b{display:block;font-size:22px;letter-spacing:5px;__TITLE_COLOR__}
.badge small{display:block;font-size:9px;letter-spacing:2px;opacity:.72;margin-top:2px}
.purse{display:flex;gap:6px;margin-left:4px}
.chip{display:flex;align-items:center;gap:9px;padding:8px 14px;min-width:104px;__CHIP__}
.chip.gold{min-width:164px}
.chip i{display:grid;place-items:center;width:22px;height:22px;flex:none}
.chip i svg{width:22px;height:22px;fill:currentColor}
.chip>span{display:flex;flex-direction:column;gap:2px;line-height:1}
.chip span span{font-size:9px;letter-spacing:1.5px;opacity:.62}
.chip b{font-size:17px;letter-spacing:.5px;__NUM__}
.right{margin-left:auto;display:flex;align-items:center;gap:8px}
.mini{padding:8px 12px;display:flex;align-items:center;gap:7px;font-size:12px;__MINI__}
.sq{width:34px;height:34px;display:grid;place-items:center;__SQ__}
.sq svg{width:18px;height:18px;fill:currentColor}
/* ---------- 左側委託 ---------- */
#quest{position:absolute;left:18px;top:86px;width:246px;__PANEL__}
.ph{display:flex;align-items:center;gap:8px;padding:9px 12px;__PANEL_HEAD__}
.ph b{font-size:12px;letter-spacing:2px;flex:1}
.ph em{font-style:normal;font-size:16px;opacity:.6}
.pb{padding:14px}
.eyebrow{font-family:Consolas,monospace;font-size:9px;letter-spacing:2px;__ACCENT_TEXT__}
#quest h2{font-size:17px;letter-spacing:1px;margin:8px 0 7px;__HEADING__}
#quest p{font-size:11.5px;line-height:1.75;__BODY_TEXT__}
.bar{height:14px;margin:12px 0 6px;position:relative;__BAR__}
.bar span{position:absolute;inset:0 auto 0 0;width:50%;__BAR_FILL__}
.bar b{position:absolute;inset:0;display:grid;place-items:center;font-size:10px;font-family:Consolas,monospace}
.reward{display:flex;gap:14px;font-size:11px;align-items:center;__ACCENT_TEXT__;margin-top:4px}
.reward i{display:inline-grid;place-items:center;width:16px;height:16px;margin-right:4px;vertical-align:-3px}
.reward i svg{width:16px;height:16px;fill:currentColor}
.btn{display:flex;align-items:center;justify-content:center;gap:9px;width:100%;padding:13px;font-size:13.5px;letter-spacing:1.5px;margin-top:14px;__BTN_PRIMARY__}
.btn:after{content:'›';font-size:17px;line-height:0;opacity:.75}
/* ---------- 右側獵人 ---------- */
#hero{position:absolute;right:18px;top:86px;width:214px;__PANEL__}
.avatar{height:118px;display:grid;place-items:center;position:relative;__AVATAR__}
.avatar:before{content:'';position:absolute;inset:14px 34px;border:1px dashed currentColor;opacity:.12;border-radius:6px}
.avatar svg{width:80px;height:80px;fill:currentColor;opacity:.85}
.hn{text-align:center;padding:2px 12px 12px}
.hn b{font-size:15px;__HEADING__}
.hn small{display:block;font-size:9.5px;letter-spacing:1px;margin-top:4px;opacity:.66}
.stats{display:flex;gap:6px;padding:0 12px 12px}
.stats div{flex:1;text-align:center;padding:7px 3px;__STAT__}
.stats b{display:block;font-family:Consolas,monospace;font-size:14px}
.stats span{font-size:8px;letter-spacing:1px;opacity:.6}
/* ---------- 下方動作列 ---------- */
#dock{position:absolute;bottom:0;left:0;right:0;display:flex;justify-content:center;gap:8px;padding:12px 18px 16px;__DOCK__}
.act{width:96px;padding:10px 6px 9px;display:flex;flex-direction:column;align-items:center;gap:6px;position:relative;__ACT__}
.act svg{width:29px;height:29px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linejoin:round;stroke-linecap:round}
.act b{font-size:12px;letter-spacing:2px}
.act.on:after{content:'';position:absolute;left:50%;bottom:-6px;width:26px;height:3px;transform:translateX(-50%);background:currentColor;opacity:.9}
.act .t{position:absolute;top:5px;right:6px;font-family:Consolas,monospace;font-size:8px;opacity:.5}
.act:hover{__ACT_HOVER__}
.act.on{__ACT_ON__}
.play{display:flex;gap:6px;align-items:center;margin-left:10px;padding-left:12px;__PLAYWRAP__}
.play button{width:38px;height:32px;display:grid;place-items:center;font-size:13px;__PLAYBTN__}
/* ---------- toast ---------- */
#toast{position:absolute;left:50%;top:78px;transform:translateX(-50%);padding:10px 18px;font-size:12px;display:flex;gap:9px;align-items:center;__TOAST__}
#toast b{__ACCENT_TEXT__}
/* ---------- modal ---------- */
#veil{position:absolute;inset:0;background:rgba(8,10,12,.55);display:none;place-items:center;padding:24px}
#veil.open{display:grid}
#modal{width:min(760px,100%);max-height:86vh;display:flex;flex-direction:column;__PANEL__}
#modal .ph{padding:12px 16px}
#modal .ph b{font-size:16px;letter-spacing:3px}
#modal .pb{padding:20px;overflow:auto}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:11px}
.card{padding:12px;display:flex;gap:10px;align-items:center;__CARD__}
.card svg{width:34px;height:34px;flex:none;fill:currentColor;opacity:.9}
.card b{display:block;font-size:12.5px}
.card small{display:block;font-size:9.5px;opacity:.66;margin-top:3px}
.foot{display:flex;gap:9px;justify-content:flex-end;margin-top:18px}
.btn.ghost{__BTN_GHOST__}
.hint{position:absolute;left:50%;bottom:96px;transform:translateX(-50%);font-size:10px;letter-spacing:1px;opacity:.45}
@media(max-width:900px){#quest{width:190px;padding:0}#hero{display:none}.chip{min-width:70px;padding:6px 8px}.chip.gold{min-width:104px}}
"""

BODY = """
<div id="stage">
  <header id="top">
    <button class="badge">
      <span class="crest"><svg viewBox="0 0 24 24"><path d="M12 2 4 6v6c0 5 3.4 8.4 8 10 4.6-1.6 8-5 8-10V6z"/></svg></span>
      <span><b>暮影村</b><small>村莊 Lv.3 · 平原聚落</small></span>
    </button>
    <div class="purse">
      <span class="chip gold"><i><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg></i><span><span>村莊金庫</span><b class="k">1,500</b></span></span>
      <span class="chip"><i><svg viewBox="0 0 24 24"><path d="M12 3 5 12l7 9 7-9z"/></svg></i><span><span>星晶</span><b class="k">20</b></span></span>
      <span class="chip"><i><svg viewBox="0 0 24 24"><rect x="4" y="8" width="16" height="8" rx="1"/></svg></i><span><span>木材</span><b class="k">160</b></span></span>
      <span class="chip"><i><svg viewBox="0 0 24 24"><path d="M6 18 12 4l6 14z"/></svg></i><span><span>鐵礦</span><b class="k">120</b></span></span>
    </div>
    <div class="right">
      <button class="mini"><span>初級</span><span style="opacity:.5">▼</span></button>
      <button class="mini"><span class="k">5 / 8</span><span style="opacity:.6;font-size:10px">獵人</span></button>
      <button class="sq"><svg viewBox="0 0 24 24"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm9 4-2.2-.9-.6-1.5 1.1-2.1-1.7-1.7-2.1 1.1-1.5-.6L13 4h-2l-.9 2.3-1.5.6-2.1-1.1-1.7 1.7 1.1 2.1-.6 1.5L3 12l2.2.9.6 1.5-1.1 2.1 1.7 1.7 2.1-1.1 1.5.6L11 20h2l.9-2.3 1.5-.6 2.1 1.1 1.7-1.7-1.1-2.1.6-1.5z"/></svg></button>
    </div>
  </header>

  <aside id="quest">
    <div class="ph"><b>村長委託</b><em>−</em></div>
    <div class="pb">
      <div class="eyebrow">CHAPTER 03 · 主線</div>
      <h2>第一次遠征</h2>
      <p>派出 2 位獵人到橡木密林，帶回 6 份皮革與 1 柄精鐵武器。</p>
      <div class="bar"><span></span><b>1 / 2</b></div>
      <div class="reward"><span><i><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/></svg></i>150</span><span><i><svg viewBox="0 0 24 24"><rect x="5" y="9" width="14" height="7" rx="1"/></svg></i>30</span></div>
      <button class="btn" onclick="openModal()">領取獎勵</button>
    </div>
  </aside>

  <aside id="hero">
    <div class="ph"><b>獵人</b><em>×</em></div>
    <div class="avatar"><svg viewBox="0 0 24 24"><path d="M12 3 6 7v5c0 4 2.6 6.8 6 8 3.4-1.2 6-4 6-8V7z"/></svg></div>
    <div class="hn"><b>狂戰士 · 阿爾文</b><small>Lv.14 · 稀有 · 狩獵中</small></div>
    <div class="stats">
      <div><b>312</b><span>HP</span></div>
      <div><b>38</b><span>ATK</span></div>
      <div><b>2.4</b><span>SPD</span></div>
    </div>
  </aside>

  <div id="toast">獵人 <b>阿爾文</b> 帶回 皮革 ×3 · 金幣 ×26</div>

  <nav id="dock">
    <button class="act on"><svg viewBox="0 0 24 24"><path d="M4 20h16M6 20V9l6-5 6 5v11"/></svg><b>建設</b><span class="t">1</span></button>
    <button class="act"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.4"/><path d="M5 20c0-4 3.2-6 7-6s7 2 7 6"/></svg><b>獵人</b><span class="t">2</span></button>
    <button class="act"><svg viewBox="0 0 24 24"><path d="M4 8h11l4 4-4 4H4z"/><path d="M8 8v8"/></svg><b>交易</b><span class="t">3</span></button>
    <button class="act"><svg viewBox="0 0 24 24"><path d="M5 19 19 5M9 5H5v4M15 19h4v-4"/></svg><b>製作</b><span class="t">4</span></button>
    <button class="act"><svg viewBox="0 0 24 24"><path d="M12 3v8M6 21v-4a6 6 0 0 1 12 0v4z"/></svg><b>地下城</b><span class="t">5</span></button>
    <button class="act"><svg viewBox="0 0 24 24"><path d="M6 4l4 16M18 4l-4 16M4 9h16"/></svg><b>競技場</b><span class="t">6</span></button>
    <button class="act"><svg viewBox="0 0 24 24"><path d="M7 3h10v18l-5-3-5 3z"/></svg><b>委託</b><span class="t">7</span></button>
    <div class="play">
      <button>Ⅱ</button><button>1×</button>
      <span style="font-size:8px;opacity:.5;width:100%;text-align:center;margin-top:3px">自動儲存</span>
    </div>
  </nav>

  <div class="hint">拖曳平移 · 滾輪縮放 · 點選建築／獵人</div>

  <div id="veil" onclick="if(event.target.id==='veil')closeModal()">
    <section id="modal">
      <div class="ph"><b>委託獎勵</b><em onclick="closeModal()">×</em></div>
      <div class="pb">
        <p style="font-size:12px;line-height:1.8;opacity:.8;margin-bottom:16px">完成「第一次遠征」可獲得下列獎勵，領取後委託會推進到下一章。</p>
        <div class="grid">
          <div class="card"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/></svg><div><b>金幣 ×150</b><small>村莊金庫</small></div></div>
          <div class="card"><svg viewBox="0 0 24 24"><rect x="5" y="9" width="14" height="7" rx="1"/></svg><div><b>麵粉 ×30</b><small>生活物資</small></div></div>
          <div class="card"><svg viewBox="0 0 24 24"><path d="M12 3 5 12l7 9 7-9z"/></svg><div><b>星晶 ×3</b><small>稀有</small></div></div>
        </div>
        <div class="foot"><button class="btn ghost" style="width:auto;margin:0;padding:11px 20px" onclick="closeModal()">稍後再說</button><button class="btn" style="width:auto;margin:0;padding:11px 26px" onclick="closeModal()">確認領取</button></div>
      </div>
    </section>
  </div>
</div>
<script>
function openModal(){document.getElementById('veil').classList.add('open')}
function closeModal(){document.getElementById('veil').classList.remove('open')}
document.querySelectorAll('#dock .act').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('#dock .act').forEach(x=>x.classList.remove('on'));b.classList.add('on');openModal();}));
</script>
"""

THEMES = {
    "v1-木牌金箔": dict(
        name="木牌 · 金箔（Wood & Brass）",
        desc="沿用現在的暖木質感，把邊框做成木牌加黃銅釘、標題壓成金箔刻字；最接近現有風格、改動風險最低。",
        css="""
          --vignette:background:radial-gradient(ellipse at 50% 45%,transparent 45%,rgba(12,10,6,.55) 100%);
          --top:background:repeating-linear-gradient(90deg,rgba(0,0,0,.07) 0 2px,transparent 2px 13px),linear-gradient(#6b5236,#4a3521 70%,#3a2917);border-bottom:3px solid #20150c;box-shadow:inset 0 2px #c9a468,0 3px 0 rgba(0,0,0,.45);
          --badge:background:linear-gradient(#4c3620,#33230f);border:2px solid #c9a468;box-shadow:inset 0 0 0 2px #20150c,2px 3px 0 rgba(0,0,0,.4);
          --crest:background:radial-gradient(#8a6a3a,#3d2a14);border:2px solid #e2c07a;color:#f7e3b4;
          --title-color:color:#f4dea6;text-shadow:1px 2px 0 #2a1a0a;
          --chip:background:linear-gradient(#43301b,#2c1e0f);border:2px solid #20150c;box-shadow:inset 1px 1px #8a6a3a,inset -1px -1px #1a1108;color:#e9d09a;
          --num:color:#ffe9ad;
          --mini:background:linear-gradient(#453220,#2c1e0f);border:2px solid #20150c;box-shadow:inset 1px 1px #7a5c34;color:#e7cf9b;
          --sq:background:linear-gradient(#5d4426,#3a2814);border:2px solid #20150c;box-shadow:inset 1px 1px #b08a4e;color:#f0d79c;
          --panel:background:radial-gradient(circle at 6px 6px,#e2c07a 0 1.6px,transparent 1.7px) 0 0/100% 100% no-repeat,linear-gradient(160deg,rgba(58,40,22,.97),rgba(40,27,14,.98));border:3px solid #1c130a;box-shadow:inset 0 0 0 1px #c8a463,0 0 0 1px #8a6a36,4px 6px 0 rgba(0,0,0,.35);border-radius:3px;
          --panel-head:background:linear-gradient(#7d5c33,#5a3f21);border-bottom:2px solid #1c130a;box-shadow:inset 0 1px #d8b478;color:#ffe7ac;text-shadow:1px 1px #35200c;
          --accent-text:color:#e8c479;
          --heading:color:#fbe6b6;text-shadow:1px 1px 0 #2b1c0c;
          --body-text:color:#d6c6a4;
          --bar:background:#1b120a;border:2px solid #2a1c0e;box-shadow:inset 0 0 0 1px #7d5f33;border-radius:2px;
          --bar-fill:background:linear-gradient(#a8c47a,#6f9149);box-shadow:inset 0 1px #d6e8b0;
          --btn-primary:background:linear-gradient(#f0cf7d,#c9a24f);border:2px solid #20150c;box-shadow:inset 1px 1px #ffeeb0,inset -2px -2px #8f6c2e,0 2px 0 #16100a;color:#3a2a11;text-shadow:0 1px #ffeeb8;border-radius:2px;font-weight:700;
          --avatar:background:radial-gradient(ellipse at 50% 65%,rgba(190,150,80,.3),transparent 70%);
          --stat:background:rgba(20,13,7,.55);border:1px solid #6d5028;border-radius:2px;color:#f0d59b;
          --dock:background:repeating-linear-gradient(90deg,rgba(0,0,0,.07) 0 2px,transparent 2px 13px),linear-gradient(#6b5236,#412d19 60%,#2e1f10);border-top:3px solid #1c130a;box-shadow:inset 0 2px #c9a468;
          --act:background:linear-gradient(#6b4e2c,#46301a);border:2px solid #1c130a;box-shadow:inset 1px 1px #a8844e,inset -1px -1px #2a1a0c;color:#e9d3a1;border-radius:3px;
          --act-hover:background:linear-gradient(#8a663a,#5a3f21);color:#fff0c8;
          --act-on:background:linear-gradient(#f0cf7d,#c9a24f);color:#3a2a11;box-shadow:inset 1px 1px #ffeeb0,inset -2px -2px #8f6c2e;
          --playwrap:border-left:2px solid #2a1c0c;
          --playbtn:background:#24180c;border:1px solid #8a6a36;color:#e8cf9a;border-radius:2px;
          --toast:background:rgba(52,34,16,.95);border:2px solid #d5b273;box-shadow:0 0 0 2px #20150c,0 6px 16px rgba(0,0,0,.45);color:#f4e2bb;border-radius:3px;
          --card:background:rgba(24,16,8,.55);border:1px solid #6d5028;border-radius:2px;
          --btn-ghost:background:linear-gradient(#4c3620,#33230f);border:2px solid #20150c;box-shadow:inset 1px 1px #8a6a3a;color:#ecd6a5;border-radius:2px;
        """),
    "v2-石板苔痕": dict(
        name="石板 · 苔痕（Slate & Moss）",
        desc="把介面做成村裡那些石碑：冷灰石材、刻線凹槽、苔綠點綴；數字用等寬字，資訊密度高也好讀。",
        css="""
          --vignette:background:radial-gradient(ellipse at 50% 40%,transparent 40%,rgba(10,14,18,.6) 100%);
          --top:background:linear-gradient(#4b5158,#343940 65%,#262b31);border-bottom:2px solid #14171b;box-shadow:inset 0 1px #7d858e,0 2px 0 rgba(0,0,0,.5);
          --badge:background:linear-gradient(#3f454c,#2a2f35);border:2px solid #171b1f;box-shadow:inset 0 0 0 1px #6c757e;
          --crest:background:radial-gradient(#5d666f,#2b3137);border:2px solid #8b959f;color:#dfe8ee;
          --title-color:color:#eef4f7;letter-spacing:5px;text-shadow:0 2px 0 #14181c;
          --chip:background:linear-gradient(#3a4047,#272c32);border:2px solid #14181c;box-shadow:inset 0 1px #5f6870,inset 0 -1px #1b1f23;color:#cfd9e0;border-radius:2px;
          --num:color:#a9e0c2;
          --mini:background:linear-gradient(#3a4047,#272c32);border:2px solid #14181c;box-shadow:inset 0 1px #5f6870;color:#cbd6dd;border-radius:2px;
          --sq:background:linear-gradient(#454c54,#2b3137);border:2px solid #14181c;box-shadow:inset 0 1px #6d767e;color:#d3dde3;
          --panel:background:linear-gradient(155deg,rgba(50,55,61,.97),rgba(33,37,42,.98));border:2px solid #131619;box-shadow:inset 0 0 0 1px #5d666e,0 0 0 1px #0d1013,5px 7px 0 rgba(0,0,0,.32);
          --panel-head:background:linear-gradient(#454c54,#2f343a);border-bottom:2px solid #131619;box-shadow:inset 0 1px #78818a;color:#dfe8ee;letter-spacing:3px;
          --accent-text:color:#9ed6ac;
          --heading:color:#f1f6f8;
          --body-text:color:#b9c3ca;
          --bar:background:#14181c;border:2px solid #0e1114;box-shadow:inset 0 0 0 1px #4d555d;border-radius:2px;
          --bar-fill:background:linear-gradient(#8fc7a0,#5b9273);box-shadow:inset 0 1px #c6ecd3;
          --btn-primary:background:linear-gradient(#8fc7a0,#5b9273);border:2px solid #131619;box-shadow:inset 1px 1px #c9efd6,inset -2px -2px #3d6b52,0 2px 0 #0f1417;color:#12211a;font-weight:700;letter-spacing:2px;
          --avatar:background:radial-gradient(ellipse at 50% 60%,rgba(120,170,140,.22),transparent 70%);
          --stat:background:rgba(18,22,26,.6);border:1px solid #495159;color:#c9d6dd;
          --dock:background:linear-gradient(#464d54,#2b3036 70%,#1f2429);border-top:2px solid #14181c;box-shadow:inset 0 1px #79828b;
          --act:background:linear-gradient(#454c54,#2c3137);border:2px solid #131619;box-shadow:inset 0 1px #6d767e,inset 0 -2px #1a1e22;color:#cbd6dd;
          --act-hover:background:linear-gradient(#59626b,#3a4047);color:#eef4f7;
          --act-on:background:linear-gradient(#8fc7a0,#5b9273);color:#12211a;box-shadow:inset 1px 1px #c9efd6;
          --playwrap:border-left:2px solid #1c2126;
          --playbtn:background:#1a1f24;border:1px solid #586169;color:#c9d6dd;
          --toast:background:rgba(34,39,45,.96);border:2px solid #8fc7a0;box-shadow:0 6px 18px rgba(0,0,0,.5);color:#dfe8ee;
          --card:background:rgba(20,24,28,.55);border:1px solid #495159;
          --btn-ghost:background:linear-gradient(#3f454c,#2a2f35);border:2px solid #131619;box-shadow:inset 0 1px #6c757e;color:#cfd9e0;
        """),
    "v3-絹本墨印": dict(
        name="絹本 · 墨印（Paper & Ink）",
        desc="把介面做成村里的紙本與印記：米白絹紙、墨線框、朱紅印章；在深色場景上最跳、字最清楚，也最有繪本感。",
        css="""
          --vignette:background:radial-gradient(ellipse at 50% 45%,transparent 50%,rgba(30,22,12,.42) 100%);
          --top:background:linear-gradient(#f7f1e2,#e8dfc9);border-bottom:3px solid #2a2218;box-shadow:0 3px 10px rgba(20,14,6,.35);
          --badge:background:linear-gradient(#fffdf5,#efe7d3);border:2px solid #2a2218;box-shadow:2px 3px 0 rgba(20,14,6,.28);color:#2a2218;
          --crest:background:#b4402f;color:#fff6e2;border:2px solid #7d2b1f;
          --title-color:color:#241d14;letter-spacing:5px;
          --chip:background:linear-gradient(#fffdf6,#efe7d3);border:2px solid #2a2218;color:#3a3126;box-shadow:1px 2px 0 rgba(20,14,6,.22);
          --num:color:#8c3a2a;
          --mini:background:#fffdf6;border:2px solid #2a2218;color:#3a3126;box-shadow:1px 2px 0 rgba(20,14,6,.2);
          --sq:background:#fffdf6;border:2px solid #2a2218;color:#3a3126;box-shadow:1px 2px 0 rgba(20,14,6,.2);
          --panel:background:linear-gradient(160deg,rgba(252,248,238,.98),rgba(240,232,214,.98));border:2px solid #2a2218;box-shadow:3px 5px 0 rgba(18,12,4,.3),inset 0 0 0 3px rgba(255,255,255,.5);color:#2a2218;
          --panel-head:background:linear-gradient(#efe6d0,#e0d4b8);border-bottom:2px solid #2a2218;color:#241d14;letter-spacing:3px;
          --accent-text:color:#b4402f;
          --heading:color:#241d14;
          --body-text:color:#4a4034;
          --bar:background:#e6dcc4;border:2px solid #2a2218;box-shadow:inset 0 0 0 1px #fff;
          --bar-fill:background:#b4402f;
          --btn-primary:background:#b4402f;border:2px solid #6f2418;color:#fff6e6;box-shadow:2px 3px 0 rgba(18,12,4,.3);letter-spacing:2px;font-weight:700;
          --avatar:background:radial-gradient(ellipse at 50% 65%,rgba(180,64,47,.14),transparent 70%);
          --stat:background:rgba(255,255,255,.55);border:1px solid #2a2218;color:#3a3126;
          --dock:background:linear-gradient(#f7f1e2,#e6dcc4);border-top:3px solid #2a2218;box-shadow:0 -3px 12px rgba(20,14,6,.3);
          --act:background:#fffdf6;border:2px solid #2a2218;color:#3a3126;box-shadow:2px 3px 0 rgba(20,14,6,.22);
          --act-hover:background:#f3ead6;color:#241d14;
          --act-on:background:#b4402f;border-color:#6f2418;color:#fff6e6;
          --playwrap:border-left:2px solid #2a2218;
          --playbtn:background:#efe6d0;border:2px solid #2a2218;color:#3a3126;
          --toast:background:rgba(252,248,238,.98);border:2px solid #2a2218;color:#2a2218;box-shadow:3px 5px 0 rgba(18,12,4,.3);
          --card:background:rgba(255,255,255,.6);border:1px solid #2a2218;
          --btn-ghost:background:#fffdf6;border:2px solid #2a2218;color:#3a3126;box-shadow:2px 3px 0 rgba(18,12,4,.22);
        """),
    "v4-夜色火光": dict(
        name="夜色 · 火光（Night & Ember）",
        desc="近乎全黑的半透明面板＋營火橘光，適合野外狩獵／遠征畫面；資訊用細線分層，畫面最不擋世界。",
        css="""
          --vignette:background:radial-gradient(ellipse at 50% 55%,transparent 30%,rgba(4,6,10,.72) 100%);
          --top:background:linear-gradient(rgba(14,16,20,.92),rgba(10,12,16,.88));border-bottom:1px solid rgba(240,162,74,.28);box-shadow:0 6px 24px rgba(0,0,0,.5);
          --badge:background:rgba(30,22,14,.72);border:1px solid rgba(240,162,74,.4);box-shadow:inset 0 0 12px rgba(240,162,74,.12);
          --crest:background:radial-gradient(#f0a24a,#7a3f12);color:#1a0f04;border:1px solid #ffca8a;box-shadow:0 0 14px rgba(240,162,74,.5);
          --title-color:color:#ffd9a3;text-shadow:0 0 12px rgba(240,162,74,.55);
          --chip:background:rgba(20,22,26,.72);border:1px solid rgba(240,162,74,.22);color:#f0e2cd;box-shadow:inset 0 0 10px rgba(240,162,74,.08);
          --num:color:#ffcf8f;
          --mini:background:rgba(20,22,26,.72);border:1px solid rgba(240,162,74,.22);color:#f0e2cd;
          --sq:background:rgba(20,22,26,.72);border:1px solid rgba(240,162,74,.22);color:#ffcf8f;
          --panel:background:linear-gradient(160deg,rgba(16,18,22,.9),rgba(10,12,15,.94));border:1px solid rgba(240,162,74,.26);box-shadow:0 10px 30px rgba(0,0,0,.55),inset 0 0 24px rgba(240,162,74,.06);backdrop-filter:blur(6px);border-radius:4px;
          --panel-head:background:linear-gradient(rgba(46,30,14,.9),rgba(24,16,9,.9));border-bottom:1px solid rgba(240,162,74,.22);color:#ffd9a3;letter-spacing:3px;
          --accent-text:color:#f0a24a;
          --heading:color:#fff1dc;
          --body-text:color:#c9bda9;
          --bar:background:rgba(0,0,0,.55);border:1px solid rgba(240,162,74,.25);border-radius:99px;overflow:hidden;
          --bar-fill:background:linear-gradient(90deg,#f0a24a,#c9622a);box-shadow:0 0 12px rgba(240,162,74,.6);
          --btn-primary:background:linear-gradient(#f0a24a,#c9622a);border:1px solid #ffca8a;color:#20120a;box-shadow:0 0 18px rgba(240,162,74,.35);letter-spacing:2px;font-weight:700;border-radius:3px;
          --avatar:background:radial-gradient(ellipse at 50% 60%,rgba(240,162,74,.22),transparent 68%);
          --stat:background:rgba(0,0,0,.35);border:1px solid rgba(240,162,74,.18);color:#ffd9a3;border-radius:3px;
          --dock:background:linear-gradient(rgba(12,14,18,.9),rgba(6,8,11,.95));border:1px solid rgba(240,162,74,.28);border-radius:12px;box-shadow:0 -8px 26px rgba(0,0,0,.5),inset 0 0 20px rgba(240,162,74,.08);margin:0 90px 14px;backdrop-filter:blur(6px);
          --act:background:rgba(24,20,16,.78);border:1px solid rgba(240,162,74,.2);color:#e8d8c2;border-radius:3px;
          --act-hover:background:rgba(48,32,16,.9);border-color:rgba(240,162,74,.55);color:#ffd9a3;box-shadow:0 0 16px rgba(240,162,74,.3);
          --act-on:background:linear-gradient(#f0a24a,#c9622a);color:#20120a;box-shadow:0 0 20px rgba(240,162,74,.5);
          --playwrap:border-left:1px solid rgba(240,162,74,.18);
          --playbtn:background:rgba(0,0,0,.5);border:1px solid rgba(240,162,74,.3);color:#ffd9a3;border-radius:3px;
          --toast:background:rgba(10,12,16,.94);border:1px solid rgba(240,162,74,.5);color:#ffe7c8;box-shadow:0 0 24px rgba(240,162,74,.25);
          --card:background:rgba(0,0,0,.35);border:1px solid rgba(240,162,74,.22);border-radius:3px;
          --btn-ghost:background:rgba(24,20,16,.8);border:1px solid rgba(240,162,74,.3);color:#e8d8c2;border-radius:3px;
        """),
}


def build(slug: str, theme: dict) -> None:
    # 主題用 `--panel: ...` 這種寫法，對到 BASE 裡的 __PANEL__ 佔位
    body_css = BASE.replace("__BG__", BG)
    for line in theme["css"].strip().splitlines():
        line = line.strip()
        if not line.startswith("--"):
            continue
        key, _, val = line.partition(":")
        ph = "__" + key[2:].strip().upper().replace("-", "_") + "__"
        body_css = body_css.replace(ph, val.strip())
    html = f"""<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">
<title>{theme['name']} — 暮影村 UI 風格稿</title>
<style>{body_css}</style></head><body>
{BODY}
<div style="position:fixed;left:12px;bottom:104px;font-size:10px;letter-spacing:1px;opacity:.55;pointer-events:none">風格稿：{theme['name']}</div>
</body></html>"""
    (HERE / f"{slug}.html").write_text(html, encoding="utf-8")


def index() -> None:
    cards = "".join(
        f"""<a class="c" href="{s}.html" target="_blank">
              <div class="thumb"><iframe src="{s}.html" loading="lazy" scrolling="no"></iframe></div>
              <b>{t['name']}</b><p>{t['desc']}</p></a>"""
        for s, t in THEMES.items())
    html = f"""<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">
<title>暮影村 UI 風格稿</title><style>
*{{box-sizing:border-box;margin:0}}
body{{background:#0d1014;color:#e8e3d6;font-family:'Noto Sans TC','Microsoft JhengHei',sans-serif;padding:28px}}
h1{{font-size:22px;letter-spacing:6px;margin-bottom:6px}}
p.sub{{font-size:12px;opacity:.6;margin-bottom:22px;line-height:1.7}}
.grid{{display:grid;grid-template-columns:1fr 1fr;gap:20px}}
.c{{display:block;text-decoration:none;color:inherit;border:1px solid #2b3138;border-radius:8px;overflow:hidden;background:#141a20;transition:.15s}}
.c:hover{{border-color:#c9a468;transform:translateY(-3px)}}
.thumb{{height:250px;overflow:hidden;background:#000;position:relative}}
.thumb iframe{{width:1440px;height:900px;transform:scale(.35);transform-origin:0 0;border:0;pointer-events:none}}
.c b{{display:block;padding:12px 14px 4px;font-size:14px;letter-spacing:2px}}
.c p{{padding:0 14px 14px;font-size:11px;line-height:1.7;opacity:.66}}
</style></head><body>
<h1>暮影村 · UI 風格稿</h1>
<p class="sub">四版外觀不同、內容與版面完全一樣，方便直接比較。點縮圖開整頁（可點下方按鈕看視窗樣式）。</p>
<div class="grid">{cards}</div>
</body></html>"""
    (HERE / "index.html").write_text(html, encoding="utf-8")


if __name__ == "__main__":
    for slug, theme in THEMES.items():
        build(slug, theme)
    index()
    print("wrote", len(THEMES), "themes + index ->", HERE)
