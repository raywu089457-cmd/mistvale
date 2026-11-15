// Paper-doll character runtime (browser, no dependencies).
//
//   const doll = new PaperDoll(spec, { base: "path/to/core/" });      // spec = parsed character.json
//   doll.addPack(packJson, "path/to/pack/");                          // optional add-on packs
//   const sheet = await doll.bake({ parts: { hair: "bob", top: "tunic" }, colors: { hair: "red" } });
//   const f = doll.frame("walk", 2);                                  // { x, y, w, h, ms }
//   ctx.drawImage(sheet, f.x, f.y, f.w, f.h, px - doll.foot[0], py - doll.foot[1], f.w, f.h);
//
// A character is a "recipe": { parts: { slot: partId }, colors: { slot: variantName } }.
// bake() stacks every chosen part's sheet in spec.layers order into ONE sheet with the same grid
// (cell = spec.cell, one row per action), recolouring each part by exact-colour palette swap.
// Sprites face right; mirror horizontally for left.
(function (root) {
  "use strict";

  const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

  class PaperDoll {
    /**
     * @param spec  parsed character.json of the core pack
     * @param opts  { base: url prefix of the core pack ("" or ends with "/"),
     *                loadImage: async (url) => drawable  — override to load from somewhere else }
     */
    constructor(spec, opts = {}) {
      this.spec = JSON.parse(JSON.stringify(spec));
      this.loadImage = opts.loadImage || PaperDoll.loadImage;
      this.cell = this.spec.cell;
      this.foot = this.spec.foot;
      this.columns = this.spec.columns;
      this.rows = Object.keys(this.spec.actions).length;
      this._images = new Map(); // url → drawable
      this._tinted = new Map(); // url|ramp|variant → canvas
      for (const slot of Object.values(this.spec.slots)) for (const part of Object.values(slot.parts)) part.base = opts.base || "";
    }

    /** Merge an add-on pack (its pack.json) into this doll. base = url prefix of the pack folder. */
    addPack(pack, base = "") {
      for (const [slot, def] of Object.entries(pack.slots || {})) {
        if (!this.spec.slots[slot]) continue;
        for (const [id, part] of Object.entries(def.parts)) this.spec.slots[slot].parts[id] = { ...part, base };
      }
      Object.assign(this.spec.looks, pack.looks || {});
      return this;
    }

    /** Slot names in a sensible UI order (draw order, duplicates removed). */
    get slots() {
      return [...new Set(this.spec.layers.map((l) => l.slot))].filter((s) => this.spec.slots[s]);
    }
    partIds(slot) {
      return Object.keys(this.spec.slots[slot].parts);
    }
    /** Colour variant names a slot can take (empty if the slot is not recolourable). */
    colorNames(slot) {
      const ramp = this.spec.slots[slot].color;
      return ramp ? Object.keys(this.spec.palettes[ramp].variants) : [];
    }
    /** A ready-made recipe from spec.looks (themed sets live here too). */
    look(name) {
      const l = this.spec.looks[name];
      return l ? { parts: { ...l.parts }, colors: { ...l.colors } } : null;
    }
    /** A random recipe. keep = probability that an optional slot is filled. */
    random(rng = Math.random, keep = { hair: 0.95, top: 1, bottom: 0.9, shoes: 0.95, weapon: 0.8, hat: 0.45, acc: 0.35, cape: 0.3, back: 0.25, shield: 0.35 }) {
      const pick = (a) => a[Math.floor(rng() * a.length)];
      const r = { parts: {}, colors: {} };
      for (const slot of this.slots) {
        const def = this.spec.slots[slot];
        if (!def.required && rng() < (keep[slot] ?? 0.5)) r.parts[slot] = pick(this.partIds(slot));
        const names = this.colorNames(slot);
        if (names.length) r.colors[slot] = pick(names);
      }
      return r;
    }

    /** { x, y, w, h, ms } of one frame in a baked sheet (i wraps for looping actions, clamps otherwise). */
    frame(action, i) {
      const a = this.spec.actions[action], [w, h] = this.cell;
      const n = a.loop ? ((i % a.frames) + a.frames) % a.frames : Math.max(0, Math.min(a.frames - 1, i));
      return { x: n * w, y: a.row * h, w, h, ms: a.ms, index: n };
    }
    /** Frame index at time t (ms since the action started); done = a non-looping action has finished. */
    frameAt(action, t) {
      const a = this.spec.actions[action], n = Math.floor(t / a.ms);
      return { ...this.frame(action, n), done: !a.loop && n >= a.frames };
    }
    /** Head / hand anchor of a frame in cell pixels (for attaching effects, name tags, …). */
    anchor(action, i) {
      return this.spec.anchors[action][this.frame(action, i).index];
    }

    /** Compose a recipe into one sheet. Returns a canvas (width = columns × cell width, one row per action). */
    async bake(recipe) {
      const spec = this.spec, [cw, ch] = this.cell;
      const out = PaperDoll.canvas(this.columns * cw, this.rows * ch), ctx = out.getContext("2d");
      const chosen = {};
      for (const [slot, def] of Object.entries(spec.slots)) if (def.required) chosen[slot] = Object.keys(def.parts)[0];
      Object.assign(chosen, recipe.parts || {});
      const hat = chosen.hat && spec.slots.hat && spec.slots.hat.parts[chosen.hat];
      const covered = !!(hat && hat.coversHair); // a hat that covers the head → hair uses its "under" layer
      for (const { slot, layer } of spec.layers) {
        const def = spec.slots[slot], id = chosen[slot];
        const part = def && id && def.parts[id];
        if (!part) continue;
        const rel = part.layers[covered && slot === "hair" && layer === "main" ? "under" : layer];
        if (!rel) continue;
        const colorSlot = part.colorFrom || slot; // e.g. a beard follows the hair colour
        const ramp = spec.slots[colorSlot] && spec.slots[colorSlot].color;
        ctx.drawImage(await this._tint(part.base + rel, ramp, (recipe.colors || {})[colorSlot]), 0, 0);
      }
      return out;
    }

    async _tint(url, ramp, variant) {
      if (!this._images.has(url)) this._images.set(url, await this.loadImage(url));
      const img = this._images.get(url), pal = ramp && this.spec.palettes[ramp];
      if (!pal || !variant || !pal.variants[variant] || pal.variants[variant].join() === pal.base.join()) return img;
      const key = url + "|" + ramp + "|" + variant;
      if (this._tinted.has(key)) return this._tinted.get(key);
      const c = PaperDoll.canvas(img.width, img.height), x = c.getContext("2d");
      x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height), a = d.data, from = pal.base.map(hexToRgb), to = pal.variants[variant].map(hexToRgb);
      for (let i = 0; i < a.length; i += 4) {
        if (!a[i + 3]) continue;
        for (let k = 0; k < from.length; k++)
          if (a[i] === from[k][0] && a[i + 1] === from[k][1] && a[i + 2] === from[k][2]) {
            a[i] = to[k][0]; a[i + 1] = to[k][1]; a[i + 2] = to[k][2];
            break;
          }
      }
      x.putImageData(d, 0, 0);
      this._tinted.set(key, c);
      return c;
    }

    static canvas(w, h) {
      if (typeof document !== "undefined") {
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        return c;
      }
      return new OffscreenCanvas(w, h);
    }
    static loadImage(url) {
      return new Promise((ok, fail) => {
        const i = new Image();
        i.onload = () => ok(i);
        i.onerror = () => fail(new Error("cannot load " + url));
        i.src = url;
      });
    }
  }

  root.PaperDoll = PaperDoll;
  if (typeof module !== "undefined" && module.exports) module.exports = { PaperDoll };
})(typeof globalThis !== "undefined" ? globalThis : this);
