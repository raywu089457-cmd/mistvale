// TMW paper-doll puppet inside Mistvale.
// Loaded only when the page URL has ?tmw=1 (see pixel-ui.js hook).
//
// 素材：The Mana World（GPLv2+/CC），由 /media/tmw/graphics/sprites/ 提供。
// 架構：sprite XML → imageset(atlas) → action/direction → 逐格繪製，圖層合成。

const DATA_ROOT = "/media/tmw/";                 // imageset src 相對於 client-data 根
const ASSETS = DATA_ROOT + "graphics/sprites/";   // 道具 sprite / include 相對於 sprites/

const BASE = {
  id: -100, name: "Human",
  path: "model/male.xml",
  palette: "#53202b,7f4f45,9e6a43,d09459,fcd3a1,fefffc;#2f312f,727471,a4a6a3,dad5f5;#3a3a3a,d5d5d5",
};

const HAIR_COLOR = "#3a2418,#5a3a22,#7a5230,#9a6a42,#c08a5a";

const CATALOG = {
  head: {
    none:     { id: 0,   name: "none" },
    bandana:  { id: 604, name: "Pirate Bandana", path: "equipment/head/bandana.xml", palette: "#212121,555555" },
    fancyhat: { id: 524, name: "Fancy Hat",      path: "equipment/head/fancyhat.xml" },
  },
  chest: {
    none:      { id: 0,   name: "none" },
    chainmail: { id: 625, name: "Chainmail", path: "equipment/chest/chainmail.xml" },
  },
  hair: {
    short: { id: -1, name: "short", path: "hairstyles/hairstyle00-male.xml", palette: HAIR_COLOR },
    pony:  { id: -2, name: "ponytail", path: "hairstyles/hairstyle01-male.xml", palette: HAIR_COLOR },
    bowl:  { id: -3, name: "bowl", path: "hairstyles/hairstyle02-male.xml", palette: HAIR_COLOR },
  },
  legs: {
    none:   { id: 0,   name: "none" },
    shorts: { id: 586, name: "Cotton Shorts", path: "equipment/legs/shorts.xml", palette: "#a4b2b2,ffffff" },
  },
  feet: {
    none:  { id: 0,   name: "none" },
    boots: { id: 528, name: "Boots", path: "equipment/feet/boots.xml", palette: "#623a34,f0c2b4" },
  },
  hands: {
    none:   { id: 0,   name: "none" },
    gloves: { id: 531, name: "Gloves", path: "equipment/hands/generic.xml", palette: "#202020,505050" },
  },
  weapon: {
    none:   { id: 0,   name: "none" },
    dagger: { id: 521, name: "Dagger", path: "equipment/weapons/dagger.xml",
              palette: "#48488c,48488e,48488f,695c21,5f5fbe,827229,6e6edb,9493a4,a4adff,bab8c2,bcbbc6,e3eaff",
              action: "attack" },
    bow:    { id: 530, name: "Short Bow", path: "equipment/weapons/bow.xml",
              palette: "#48488c,48488e,48488f,695c21,5f5fbe,827229,6e6edb,9493a4,a4adff,bab8c2,bcbbc6,e3eaff;#332c19,443a20,453b1e,61532d,87733d,a58d4d",
              action: "attack_bow" },
  },
  shield: {
    none:    { id: 0,   name: "none" },
    leather: { id: 603, name: "Leather Shield", path: "equipment/shields/leather.xml" },
    wooden:  { id: 602, name: "Wooden Shield",  path: "equipment/shields/wooden.xml" },
  },
};

const LAYERS = [
  { i: 0,  key: "base" },
  { i: 1,  key: "feet" },
  { i: 2,  key: "legs" },
  { i: 3,  key: "chest" },
  { i: 6,  key: "hair" },
  { i: 7,  key: "head" },
  { i: 9,  key: "hands" },
  { i: 10, key: "weapon" },
  { i: 11, key: "shield" },
];

const FALLBACK = { stand: ["default"], walk: ["stand"], attack: ["stand"], attack_bow: ["attack"], magic: ["attack"], item: ["magic"], sit: ["stand"], dead: ["hurt"] };

// ---------- palette / dye ----------
const parsePalette = (s) => s.split(",").map(x => {
  x = x.trim().replace(/^#/, "");
  if (x.length !== 6) return null;
  const v = parseInt(x, 16);
  return isNaN(v) ? null : { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}).filter(Boolean);

function instantiate(src, palettes) {
  const i = src.indexOf("|");
  if (i < 0) return { path: src, dyes: [] };
  const spec = src.slice(i + 1).split(";");
  const pal = palettes ? palettes.split(";").filter(Boolean) : [];
  const dyes = [];
  let pi = 0;
  for (const seg of spec) {
    if (seg.length === 1) {
      if (pi < pal.length) dyes.push({ ch: seg, colors: parsePalette(pal[pi]) });
      pi++;
    } else {
      const [ch, val] = seg.split(":");
      const colors = val ? parsePalette(val) : [];
      if (colors.length) dyes.push({ ch, colors });
    }
  }
  return { path: src.slice(0, i), dyes: dyes.filter(d => d.colors.length) };
}

function ramp(colors, intensity) {
  const n = colors.length;
  if (!n) return null;
  const i = Math.floor(intensity * n / 255);
  const t = (intensity * n) % 255;
  const j = t !== 0 ? i : i - 1;
  const c2 = colors[Math.min(Math.max(j, 0), n - 1)];
  if (t === 0) return c2;
  const c1 = i > 0 ? colors[Math.min(i - 1, n - 1)] : { r: 0, g: 0, b: 0 };
  return {
    r: ((255 - t) * c1.r + t * c2.r) / 255,
    g: ((255 - t) * c1.g + t * c2.g) / 255,
    b: ((255 - t) * c1.b + t * c2.b) / 255,
  };
}

const CH = { 1: "R", 2: "G", 3: "Y", 4: "B", 5: "M", 6: "C", 7: "W" };

function dyeImage(img, dyes) {
  if (!dyes.length) return img;
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height);
  const px = data.data;
  const map = {};
  for (const d of dyes) map[d.ch] = d.colors;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], gg = px[i + 1], b = px[i + 2], a = px[i + 3];
    if (!a) continue;
    const cmax = Math.max(r, gg, b);
    if (!cmax) continue;
    const cmin = Math.min(r, gg, b);
    const inten = r + gg + b;
    if (cmin !== cmax && (cmin !== 0 || (inten !== cmax && inten !== 2 * cmax))) continue;
    const idx = (r !== 0) | ((gg !== 0) << 1) | ((b !== 0) << 2);
    const colors = map[CH[idx]];
    if (!colors) continue;
    const col = ramp(colors, cmax);
    if (!col) continue;
    px[i] = col.r; px[i + 1] = col.g; px[i + 2] = col.b;
  }
  g.putImageData(data, 0, 0);
  return c;
}

// ---------- sprite XML ----------
const loadImage = (src) => new Promise((res, rej) => {
  const im = new Image();
  im.onload = () => res(im);
  im.onerror = () => rej(new Error(src));
  im.src = src;
});

async function buildSprite(path, palettes, processed) {
  const full = ASSETS + path;
  if (processed.has(full)) return null;
  processed.add(full);
  const res = await fetch(full);
  if (!res.ok) throw new Error("404 " + full);
  const doc = new DOMParser().parseFromString(await res.text(), "text/xml");
  const root = doc.documentElement;
  const def = { imagesets: {}, actions: {}, path };
  const variants = +(root.getAttribute("variants") || 0);
  const vOff = 0;

  for (const node of Array.from(root.children)) {
    if (node.nodeName === "imageset") await addImageset(def, node, palettes);
    else if (node.nodeName === "action") addAction(def, node, vOff);
    else if (node.nodeName === "include") {
      const f = node.getAttribute("file");
      if (f) {
        try {
          const inc = await buildSprite(f, "", processed);
          if (inc) {
            for (const [k, v] of Object.entries(inc.imagesets)) if (!def.imagesets[k]) def.imagesets[k] = v;
            for (const [k, v] of Object.entries(inc.actions)) def.actions[k] = v;
          }
        } catch {}
      }
    }
  }
  return def;
}

async function addImageset(def, node, palettes) {
  const name = node.getAttribute("name") || "";
  if (def.imagesets[name]) return;
  const spec = instantiate(node.getAttribute("src") || "", palettes);
  let img;
  try { img = await loadImage(DATA_ROOT + spec.path); } catch { return; }
  const w = +(node.getAttribute("width") || img.width);
  const h = +(node.getAttribute("height") || img.height);
  def.imagesets[name] = {
    img: dyeImage(img, spec.dyes), w, h,
    cols: Math.max(1, Math.floor(img.width / w)),
    offX: +(node.getAttribute("offsetX") || 0),
    offY: +(node.getAttribute("offsetY") || 0),
  };
}

function addAction(def, node, vOff) {
  const name = node.getAttribute("name") || "";
  const isetName = node.getAttribute("imageset") || "";
  if (!def.imagesets[isetName]) return;
  const dirs = {};
  for (const anim of Array.from(node.children)) {
    if (anim.nodeName !== "animation") continue;
    const dir = anim.getAttribute("direction") || "down";
    const frames = [];
    for (const ch of Array.from(anim.children)) {
      if (ch.nodeName === "end") break;
      if (ch.nodeName === "frame") {
        frames.push({
          index: +(ch.getAttribute("index") || 0) + vOff,
          ox: +(ch.getAttribute("offsetX") || 0),
          oy: +(ch.getAttribute("offsetY") || 0),
          delay: +(ch.getAttribute("delay") || 120),
        });
      } else if (ch.nodeName === "sequence") {
        const s = +(ch.getAttribute("start") || 0), e = +(ch.getAttribute("end") || 0);
        const d = +(ch.getAttribute("delay") || 120);
        const ox = +(ch.getAttribute("offsetX") || 0), oy = +(ch.getAttribute("offsetY") || 0);
        for (let i = s; i <= e; i++) frames.push({ index: i + vOff, ox, oy, delay: d });
      }
    }
    if (frames.length) dirs[dir] = frames;
  }
  if (Object.keys(dirs).length) def.actions[name] = { dirs, isetName };
}

function getAction(def, name) {
  const seen = new Set();
  let cur = name;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    if (def.actions[cur]) return def.actions[cur];
    const fb = FALLBACK[cur];
    cur = fb ? fb[0] : null;
  }
  return def.actions.stand || def.actions.default || null;
}

// ---------- mount ----------
export async function mountTmwPuppet(world) {
  if (!world || typeof world.project !== "function") return;

  const ov = document.createElement("canvas");
  ov.id = "tmw-puppet";
  ov.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:6;image-rendering:pixelated";
  document.body.appendChild(ov);
  const ctx = ov.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const touchLike = matchMedia("(pointer:coarse)").matches || Math.min(innerWidth, innerHeight) < 820;

  let dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  const resize = () => {
    dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    ov.width = Math.round(innerWidth * dpr);
    ov.height = Math.round(innerHeight * dpr);
    ov.style.width = innerWidth + "px";
    ov.style.height = innerHeight + "px";
    ctx.imageSmoothingEnabled = false;
  };
  resize();
  addEventListener("resize", resize);

  const state = {
    x: 0, z: 0, dir: "down", action: "stand", t: 0,
    moving: false, attackUntil: 0, attacking: false,
  };
  const equip = {
    head: "bandana", chest: "chainmail", legs: "shorts",
    feet: "boots", hands: "gloves", weapon: "dagger", shield: "none",
    hair: "short",
  };

  const cache = new Map();
  let baseDef = null;

  const jobs = [buildSprite(BASE.path, BASE.palette, new Set()).then(d => { baseDef = d; }).catch(e => { console.warn("TMW base failed", e); })];
  for (const cat of Object.values(CATALOG)) {
    for (const item of Object.values(cat)) {
      if (!item.path) continue;
      jobs.push(buildSprite(item.path, item.palette || "", new Set()).then(d => cache.set(item.path, d)).catch(() => {}));
    }
  }
  await Promise.all(jobs);

  // 找一個「畫面內」的出生點，避免角色在鏡頭外
  function pickSpawn() {
    const g = globalThis.__mistvaleGame;
    const hall = g?.state?.layout?.hall;
    const bx = hall?.x ?? 0, bz = hall?.z ?? 0;
    const cands = [{ x: bx, z: bz + 2 }];
    for (let r = 3; r <= 40; r += 4) {
      for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]]) {
        cands.push({ x: bx + dx, z: bz + dz });
      }
    }
    for (const c of cands) {
      try {
        const p = world.project(c.x, 0, c.z);
        if (p && p.visible && p.x > 50 && p.x < innerWidth - 50 && p.y > 120 && p.y < innerHeight - 160) return c;
      } catch {}
    }
    return cands[0];
  }
  const spawn = pickSpawn();
  state.x = spawn.x; state.z = spawn.z;

  // ---------- 輸入 ----------
  const keys = new Set();
  const isTyping = (e) => e.target?.closest?.("input,textarea,select,[contenteditable]");
  addEventListener("keydown", (e) => {
    if (isTyping(e)) return;
    keys.add(e.key.toLowerCase());
    if (e.key === " ") { e.preventDefault(); attack(); }
    if (e.key === "1") setWeapon("dagger");
    if (e.key === "2") setWeapon("bow");
    if (e.key === "3") setWeapon("none");
    if (e.key.toLowerCase() === "h") { equip.head = equip.head === "none" ? "bandana" : "none"; hud(); }
    if (e.key.toLowerCase() === "j") { equip.head = equip.head === "fancyhat" ? "bandana" : "fancyhat"; hud(); }
    if (e.key.toLowerCase() === "k") {
      const list = Object.keys(CATALOG.hair);
      equip.hair = list[(list.indexOf(equip.hair) + 1) % list.length];
      hud();
    }
  });
  addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
  addEventListener("blur", () => keys.clear());

  function setWeapon(w) { equip.weapon = w; hud(); }

  function attack() {
    const now = performance.now();
    if (now < state.attackUntil) return;
    state.attacking = true;
    state.action = "attack";
    state.t = 0;
    const dur = 520;
    state.attackUntil = now + dur;
    setTimeout(() => { state.attacking = false; if (!state.moving) state.action = "stand"; }, dur);
  }

  // ---------- HUD ----------
  const hudEl = document.createElement("div");
  hudEl.style.cssText = [
    "position:fixed", "left:12px", "bottom:12px", "z-index:7",
    "font:11px/1.5 ui-monospace,Consolas,monospace",
    "color:#d9e6d2", "background:rgba(18,26,20,.72)",
    "border:1px solid rgba(255,255,255,.14)", "border-radius:8px",
    "padding:8px 10px", "pointer-events:none", "max-width:min(64vw,320px)",
    "white-space:pre", "backdrop-filter:blur(4px)",
  ].join(";");
  document.body.appendChild(hudEl);
  if (touchLike) {
    hudEl.style.left = "10px";
    hudEl.style.bottom = "auto";
    hudEl.style.top = "188px";
    hudEl.style.font = "10px/1.45 ui-monospace,Consolas,monospace";
    hudEl.style.maxWidth = "46vw";
  }

  function hud() {
    const w = CATALOG.weapon[equip.weapon];
    const h = CATALOG.head[equip.head];
    const hair = CATALOG.hair[equip.hair];
    hudEl.textContent =
      "TMW puppet v3 · WASD / 方向鍵移動  Space 攻擊\n" +
      `武器 ${w.name}${w.id ? " #" + w.id : ""}  [1]匕首 [2]弓 [3]空手\n` +
      `頭飾 ${h.name}  [H] 切換  [J] 禮帽\n` +
      `髮型 ${hair ? hair.name : "-"}  [K] 切換`;
  }
  hud();

  // ---------- 觸控（手機） ----------
  if (touchLike) {
    const wrap = document.createElement("div");
    wrap.style.cssText = "position:fixed;right:92px;bottom:104px;z-index:8;display:flex;gap:12px;align-items:flex-end;touch-action:none;user-select:none";
    const pad = document.createElement("div");
    pad.style.cssText = "display:grid;grid-template-columns:repeat(3,56px);grid-template-rows:repeat(3,56px);gap:4px";
    const mk = (label, area, key) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.style.cssText = `grid-area:${area};border:1px solid rgba(255,255,255,.22);border-radius:12px;background:rgba(20,30,24,.62);color:#e8f0e2;font:20px/1 system-ui;backdrop-filter:blur(4px);touch-action:none;padding:0`;
      const on = (e) => { e.preventDefault(); keys.add(key); b.style.background = "rgba(90,140,100,.55)"; };
      const off = (e) => { e.preventDefault(); keys.delete(key); b.style.background = "rgba(20,30,24,.62)"; };
      b.addEventListener("pointerdown", on);
      b.addEventListener("pointerup", off);
      b.addEventListener("pointercancel", off);
      b.addEventListener("pointerleave", off);
      b.addEventListener("contextmenu", (e) => e.preventDefault());
      return b;
    };
    pad.append(mk("▲", "1 / 2", "w"), mk("◀", "2 / 1", "a"), mk("▼", "2 / 2", "s"), mk("▶", "2 / 3", "d"));

    const atk = document.createElement("button");
    atk.textContent = "攻擊";
    atk.style.cssText = "width:76px;height:76px;border-radius:50%;border:1px solid rgba(220,180,120,.5);background:rgba(120,70,40,.65);color:#ffe9c9;font:14px/1.2 system-ui;backdrop-filter:blur(4px);touch-action:none;padding:0";
    atk.addEventListener("pointerdown", (e) => { e.preventDefault(); atk.style.background = "rgba(190,110,60,.8)"; attack(); });
    atk.addEventListener("pointerup", () => { atk.style.background = "rgba(120,70,40,.65)"; });
    atk.addEventListener("pointercancel", () => { atk.style.background = "rgba(120,70,40,.65)"; });
    wrap.append(pad, atk);
    document.body.appendChild(wrap);
  }

  // ---------- 移動 ----------
  const SPEED = 3.2;
  let last = performance.now();

  function update(dt) {
    let dx = 0, dz = 0;
    if (keys.has("w") || keys.has("arrowup")) { dx -= 1; dz -= 1; }
    if (keys.has("s") || keys.has("arrowdown")) { dx += 1; dz += 1; }
    if (keys.has("a") || keys.has("arrowleft")) { dx -= 1; dz += 1; }
    if (keys.has("d") || keys.has("arrowright")) { dx += 1; dz -= 1; }

    const moving = dx !== 0 || dz !== 0;
    state.moving = moving;
    if (moving) {
      const len = Math.hypot(dx, dz) || 1;
      state.x += (dx / len) * SPEED * dt;
      state.z += (dz / len) * SPEED * dt;
      const sx = dx - dz, sy = dx + dz;
      if (Math.abs(sx) > Math.abs(sy)) state.dir = sx > 0 ? "right" : "left";
      else state.dir = sy > 0 ? "down" : "up";
      if (!state.attacking) state.action = "walk";
    } else if (!state.attacking) {
      state.action = "stand";
    }
    state.t += dt * 1000;
  }

  function pickFrame(action, dir, t) {
    const frames = action.dirs[dir] || action.dirs.down || Object.values(action.dirs)[0];
    if (!frames || !frames.length) return null;
    let total = 0;
    for (const f of frames) total += f.delay || 120;
    let tt = t % total, acc = 0, pick = frames[0];
    for (const f of frames) {
      const d = f.delay || 120;
      if (tt < acc + d) { pick = f; break; }
      acc += d;
    }
    return pick;
  }

  // ---------- 繪製 ----------
  const SCALE = 1.55;

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ov.width, ov.height);

    let p;
    try { p = world.project(state.x, 0, state.z); } catch { return; }
    if (!p || !Number.isFinite(p.x)) return;

    const gx = p.x * dpr, gy = p.y * dpr;

    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.beginPath();
    ctx.ellipse(gx, gy - 1 * dpr, 11 * dpr, 3.4 * dpr, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.setTransform(dpr * SCALE, 0, 0, dpr * SCALE, gx, gy);

    const list = [{ def: baseDef, key: "base", item: BASE }];
    for (const L of LAYERS.slice(1)) {
      const id = equip[L.key] || "none";
      const item = CATALOG[L.key][id];
      const def = item?.path ? cache.get(item.path) : null;
      list.push({ def, key: L.key, item });
    }

    for (const L of list) {
      if (!L.def) continue;
      const actName = (L.key === "weapon" && L.item?.action) ? L.item.action : state.action;
      const act = getAction(L.def, actName);
      if (!act) continue;
      const f = pickFrame(act, state.dir, state.t);
      if (!f) continue;
      const iset = L.def.imagesets[act.isetName];
      if (!iset) continue;
      const sx = (f.index % iset.cols) * iset.w;
      const sy = Math.floor(f.index / iset.cols) * iset.h;
      const dx = -iset.w / 2 + iset.offX + f.ox;
      const dy = -iset.h + iset.offY + f.oy;
      ctx.drawImage(iset.img, sx, sy, iset.w, iset.h, dx, dy, iset.w, iset.h);
    }

    // 腳下光環 + 頭頂標記 + 名稱
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 260);
    ctx.globalAlpha = 0.25 + 0.35 * pulse;
    ctx.strokeStyle = "#ffe08a";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(0, 0, 13, 5, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = 0.55 + 0.45 * pulse;
    ctx.fillStyle = "#ffe08a";
    ctx.beginPath();
    ctx.moveTo(-7, -58 - pulse * 3);
    ctx.lineTo(7, -58 - pulse * 3);
    ctx.lineTo(0, -48 - pulse * 3);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 0.95;
    ctx.font = "bold 7px ui-monospace,monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff3cf";
    ctx.fillText("TMW", 0, -61 - pulse * 3);
    ctx.textAlign = "left";
    ctx.globalAlpha = 1;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  globalThis.__tmwPuppet = { state, equip, attack, setWeapon, cache, CATALOG, LAYERS };
  console.log("[TMW] puppet mounted");
}
