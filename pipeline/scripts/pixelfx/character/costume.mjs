// Original per-class costumes drawn on the stock pixelfx rig.
//
// The user's directive (2026-11-13): the six classes must NOT reuse the pixelfx donor outfits (donor archer green
// hood, donor warrior steel helm + red tabard, donor mage violet hood + robe). The RENDERING stays the donor's:
// the stock rig solves the body, each body PART is recoloured through a P(shell4, core3) ramp, ink lines and the
// flat craft stay. What changes is the DESIGN: every class gets its own part->region table (which body part wears
// which garment) plus optional EXTRA GEOMETRY (fur mantle, helmet crest and visor, hat cone, quiver, mask, stole,
// shield, circlet) drawn through the rig's own depth pass, shaded with the same shell/core steps so the craft
// matches the stock renderer.
//
// Extra geometry is plotted as a TONE CODE instead of a colour: alpha 5 = shell step, alpha 6 = core step, byte 1 =
// region index, byte 0 = step. stockbody.paintStock() resolves it through the class's region ramps, so the geometry
// costs no extra palette entries and is shaded by the same ramp as the body it belongs to.
//
// Palette budget: Mistvale's hero audit allows 16 colours per sheet. Each class therefore uses a small number of
// shared ramps and expresses "darker cloth" with a tone SHIFT on the same ramp instead of a second ramp.

const BW = 300, OX = 150, OY = 180;

/** Tone code for the costume geometry pass. */
export const CSHELL = (region, tone) => ((5 << 24) | ((region & 255) << 8) | (tone & 255)) >>> 0;
export const CCORE = (region, tone) => ((6 << 24) | ((region & 255) << 8) | (tone & 255)) >>> 0;

const mv = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2],
  M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];

/** P(shell4, core3) with an optional tone shift, exactly like the donor ramp but reuseable across garments. */
export function R(ramp, shift = 0) {
  return { ...ramp, shift };
}

const rgb = (r, g, b, a = 0xff) => ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
const hex = (h) => {
  const n = parseInt(h.slice(1), 16);
  return rgb((n >> 16) & 255, (n >> 8) & 255, n & 255);
};
/** P(shell, core) from hex lists. */
export const ramp = (shell, core) => ({ shell: shell.map(hex), core: core.map(hex), shift: 0 });

// ---- palette discipline -----------------------------------------------------------------------------------
// Mistvale's hero audit allows 16 colours PER SHEET and every garment needs a ramp, so each class declares
// exactly 16 colours and builds its ramps as VIEWS into that list. Shell/core steps point at palette indices,
// which lets two materials share their darkest tones and keeps meta.palette identical to the sheet's real
// colours. `shift` reuses the same colours one step darker instead of spending a second ramp on a second cloth.
const PAL16 = (list) => list.map(hex);
const view = (hexes, shell, core) => ({ shell: shell.map((i) => hexes[i]), core: core.map((i) => hexes[i]), shift: 0 });

// =========================================================================================================
//  1. BERSERKER - bare chest + crossed harness, fur mantle over the near shoulder, war paint, wrapped shins
// =========================================================================================================
const BERSERK_HEX = [
  '#0e0c14', // 0  ink
  '#2e1a0e', // 1  darkest brown (hair shade / seams / shadow)
  '#8a5a38', // 2  auburn hair
  '#f0c8a0', // 3  skin lit
  '#d8a070', // 4  skin mid
  '#a86a48', // 5  skin shade
  '#e8e0cc', // 6  fur lit
  '#b9ab8e', // 7  fur mid
  '#8a7a58', // 8  fur shade
  '#6d5334', // 9  fur deep
  '#8a6440', // 10 leather lit
  '#6d4a2c', // 11 leather mid
  '#4f341e', // 12 leather dark (trousers too)
  '#b6bfcc', // 13 iron lit (buckle)
  '#8b96a6', // 14 iron mid
  '#5f6a7c', // 15 iron shade
];
const B_HEX = PAL16(BERSERK_HEX);
const BERSERK_FUR = view(B_HEX, [6, 7, 8, 9], [8, 9, 12]);
const BERSERK_LEATHER = view(B_HEX, [10, 11, 12, 1], [12, 1, 1]);
const BERSERK_IRON = view(B_HEX, [13, 14, 15, 12], [15, 12, 1]);
const BERSERK_TROUSER = view(B_HEX, [11, 12, 1, 1], [1, 1, 1]);
const BERSERK_WRAP = view(B_HEX, [7, 8, 9, 12], [9, 12, 1]);
const BERSERK_PAINT = view(B_HEX, [6, 6, 7, 8], [8, 9, 12]);
const BERSERK_SKIN = view(B_HEX, [3, 4, 5, 5], [5, 5, 5]);
const BERSERK_HAIR = view(B_HEX, [2, 1, 1, 1], [1, 1, 1]);

const BERSERK_REGIONS = [
  BERSERK_FUR, // 0
  BERSERK_LEATHER, // 1
  BERSERK_IRON, // 2
  BERSERK_TROUSER, // 3
  BERSERK_WRAP, // 4
  BERSERK_PAINT, // 5
  BERSERK_SKIN, // 6
  BERSERK_HAIR, // 7
];

const BERSERK_PART = {
  1: 'trouser', 2: 'leather', 3: 'skin', 4: 'skin', 5: 'hair', 6: 'skin',
  7: 'skin', 8: 'skin', 9: 'wrap', 10: 'leather', 11: 'skin', 12: 'skin', 13: 'wrap', 14: 'leather',
  15: 'trouser', 16: 'trouser', 17: 'wrap', 18: 'leather',
  19: 'trouser', 20: 'trouser', 21: 'wrap', 22: 'leather',
};
const BERSERK_PAL = {
  ink: '#0e0c14', seam: '#2e1a0e', mark: '#b6bfcc',
  fur: BERSERK_REGIONS[0], leather: BERSERK_REGIONS[1], iron: BERSERK_REGIONS[2],
  trouser: BERSERK_REGIONS[3], wrap: BERSERK_REGIONS[4], paint: BERSERK_REGIONS[5],
  skin: BERSERK_REGIONS[6], hair: BERSERK_REGIONS[7],
};

// =========================================================================================================
//  2. PALADIN - closed great helm with a gold ridge + T visor, gold-trimmed pauldrons, ivory surcoat, shield
// =========================================================================================================
const PALADIN_HEX = [
  '#0e0c14', // 0  ink
  '#8a6f22', // 1  gold deep / seams
  '#cfd8e4', // 2  steel lit
  '#a3b0c2', // 3  steel mid
  '#74839a', // 4  steel base
  '#48525f', // 5  steel shade
  '#f6df9a', // 6  gold lit
  '#e0c266', // 7  gold mid
  '#f6f0e4', // 8  ivory lit
  '#ddd4c2', // 9  ivory mid
  '#b8ae9a', // 10 ivory base
  '#8a7f6c', // 11 ivory shade
  '#39404d', // 12 dark (visor slit / gorget)
  '#1c2128', // 13 darkest
  '#e8c49c', // 14 skin
  '#a97c54', // 15 skin shade
];
const P_HEX = PAL16(PALADIN_HEX);
const PAL_STEEL = view(P_HEX, [2, 3, 4, 5], [4, 5, 12]);
const PAL_STEEL_DK = view(P_HEX, [4, 5, 12, 13], [12, 13, 13]);
const PAL_GOLD = view(P_HEX, [6, 7, 1, 1], [1, 1, 1]);
const PAL_IVORY = view(P_HEX, [8, 9, 10, 11], [11, 12, 13]);
const PAL_DARK = view(P_HEX, [12, 12, 13, 13], [13, 13, 13]);
const PAL_SKIN2 = view(P_HEX, [14, 15, 15, 15], [15, 15, 15]);

const PAL_REGIONS = [PAL_STEEL, PAL_STEEL_DK, PAL_GOLD, PAL_IVORY, PAL_DARK, PAL_SKIN2];
const PAL_PART = {
  // ivory only on the surcoat front panel (chest); every limb is dark steel so the three values (dark steel,
  // ivory, gold) separate at 1x; the waist is the gold belt.
  1: 'steelDk', 2: 'gold', 3: 'ivory', 4: 'steelDk', 5: 'steel', 6: 'dark',
  7: 'steelDk', 8: 'steelDk', 9: 'steelDk', 10: 'steelDk', 11: 'steelDk', 12: 'steelDk', 13: 'steelDk', 14: 'steelDk',
  15: 'steelDk', 16: 'steelDk', 17: 'steelDk', 18: 'steelDk',
  19: 'steelDk', 20: 'steelDk', 21: 'steelDk', 22: 'steelDk',
};
const PAL_PAL = {
  ink: '#0e0c14', seam: '#48525f', mark: '#e0c266',
  steel: PAL_STEEL, steelDk: PAL_STEEL_DK, gold: PAL_GOLD, ivory: PAL_IVORY, dark: PAL_DARK, skin: PAL_SKIN2,
};

// =========================================================================================================
//  3. SORCERER - tall pointed hat with a wide brim, long robe with a pale star hem, sash + pouch
// =========================================================================================================
const SORCERER_HEX = [
  '#0e0c14', // 0  ink
  '#241634', // 1  violet deepest / seams
  '#f0c8a0', // 2  skin lit
  '#d8a070', // 3  skin mid
  '#a86a48', // 4  skin shade
  '#b9a2ea', // 5  violet lit
  '#8f6fd0', // 6  violet mid
  '#6547a0', // 7  violet base
  '#3d2a68', // 8  violet shade
  '#efe6ff', // 9  pale lit (hem trim / crystal)
  '#d9ccff', // 10 pale mid
  '#b3a2e0', // 11 pale base
  '#8a78b8', // 12 pale shade
  '#f0d68a', // 13 gold lit (cord)
  '#d8b85c', // 14 gold mid
  '#a88c38', // 15 gold base
];
const S_HEX = PAL16(SORCERER_HEX);
const SORC_VIOLET = view(S_HEX, [5, 6, 7, 8], [7, 8, 1]);
const SORC_VIOLET_DK = R(SORC_VIOLET, 1);
const SORC_PALE = view(S_HEX, [9, 10, 11, 12], [11, 12, 8]);
const SORC_GOLD = view(S_HEX, [13, 14, 15, 1], [15, 1, 1]);
const SORC_LEATHER = view(S_HEX, [7, 8, 1, 1], [1, 1, 1]);
const SORC_SKIN = view(S_HEX, [2, 3, 4, 4], [4, 4, 4]);

const SORC_REGIONS = [SORC_VIOLET, SORC_VIOLET_DK, SORC_PALE, SORC_GOLD, SORC_LEATHER, SORC_SKIN];
const SORC_PART = {
  1: 'robe', 2: 'gold', 3: 'robe', 4: 'robe', 5: 'hat', 6: 'skin',
  7: 'robe', 8: 'robe', 9: 'robe', 10: 'skin', 11: 'robe', 12: 'robe', 13: 'robe', 14: 'skin',
  15: 'robe', 16: 'robe', 17: 'trim', 18: 'leather',
  19: 'robe', 20: 'robe', 21: 'trim', 22: 'leather',
};
const SORC_PAL = {
  ink: '#0e0c14', seam: '#3d2a68', mark: '#b9a2ea',
  robe: SORC_REGIONS[0], hat: SORC_REGIONS[1], trim: SORC_REGIONS[2], gold: SORC_REGIONS[3],
  leather: SORC_REGIONS[4], skin: SORC_REGIONS[5],
};

// =========================================================================================================
//  4. ARCHER - teal leather hood with a short back point, cowl, chest strap + quiver of three arrows, bracers
// =========================================================================================================
const ARCHER_HEX = [
  '#0e0c14', // 0  ink
  '#17494a', // 1  teal deepest / seams
  '#f0c8a0', // 2  skin lit
  '#d8a070', // 3  skin mid
  '#a86a48', // 4  skin shade
  '#7fd6cd', // 5  teal lit
  '#4fb3a9', // 6  teal mid
  '#2b7d78', // 7  teal base
  '#a8763e', // 8  leather lit
  '#83562a', // 9  leather mid
  '#5e3c1c', // 10 leather dark
  '#3e2610', // 11 leather darkest
  '#5f6b3e', // 12 tunic lit (dark leather-green-brown)
  '#48512e', // 13 tunic mid
  '#333a20', // 14 tunic base
  '#f2ecd8', // 15 pale (fletching / bow string)
];
const A_HEX = PAL16(ARCHER_HEX);
const ARC_TEAL = view(A_HEX, [5, 6, 7, 1], [7, 1, 1]);
const ARC_TEAL_DK = R(ARC_TEAL, 1);
const ARC_LEATHER = view(A_HEX, [8, 9, 10, 11], [10, 11, 11]);
const ARC_CLOTH = view(A_HEX, [12, 13, 14, 11], [14, 11, 11]);
const ARC_PALE = view(A_HEX, [15, 12, 13, 14], [13, 14, 10]);
const ARC_SKIN = view(A_HEX, [2, 3, 4, 4], [4, 4, 4]);

const ARC_REGIONS = [ARC_TEAL, ARC_TEAL_DK, ARC_LEATHER, ARC_CLOTH, ARC_PALE, ARC_SKIN];
const ARC_PART = {
  // teal is the hood + cowl accent; the body wears brown cloth with leather straps, bracers and boots
  1: 'clothes', 2: 'leather', 3: 'clothes', 4: 'cowl', 5: 'hood', 6: 'skin',
  7: 'clothes', 8: 'clothes', 9: 'leather', 10: 'skin', 11: 'clothes', 12: 'clothes', 13: 'leather', 14: 'skin',
  15: 'clothes', 16: 'clothes', 17: 'clothes', 18: 'leather',
  19: 'clothes', 20: 'clothes', 21: 'clothes', 22: 'leather',
};
const ARC_PAL = {
  ink: '#0e0c14', seam: '#17494a', mark: '#4fb3a9',
  tunic: ARC_REGIONS[0], hood: ARC_REGIONS[0], cowl: ARC_REGIONS[1], leather: ARC_REGIONS[2],
  clothes: ARC_REGIONS[3], pale: ARC_REGIONS[4], skin: ARC_REGIONS[5],
};

// =========================================================================================================
//  5. ASSASSIN - slate hood + lower-face mask (only the eye band is skin), sleeveless black vest, sash tail
// =========================================================================================================
const ASSASSIN_HEX = [
  '#08090d', // 0  ink
  '#181c22', // 1  near black / seams
  '#f4d6ae', // 2  skin lit (one step brighter than the other classes so the eye band reads through the mask)
  '#dcb184', // 3  skin mid
  '#b0855a', // 4  skin shade
  '#a8b0c6', // 5  slate lit
  '#7a8298', // 6  slate mid
  '#525a72', // 7  slate base
  '#333a4e', // 8  slate shade
  '#5a6172', // 9  mask lit
  '#434a5a', // 10 mask mid
  '#2f3543', // 11 mask shade
  '#4a505e', // 12 vest
  '#8a7aa8', // 13 accent (slate-violet, class accent)
  '#8a7a64', // 14 wrap (light grey-brown leather for forearm wraps / boots)
  '#e8f0f8', // 15 blade glint
];
const N_HEX = PAL16(ASSASSIN_HEX);
const ASN_SLATE = view(N_HEX, [5, 6, 7, 8], [7, 8, 11]);
const ASN_MASK = view(N_HEX, [9, 10, 11, 1], [11, 1, 1]);
const ASN_VEST = view(N_HEX, [12, 1, 1, 1], [1, 1, 1]);
const ASN_WRAP = view(N_HEX, [14, 9, 11, 1], [11, 1, 1]);
const ASN_GLINT = view(N_HEX, [15, 5, 6, 7], [7, 8, 11]);
const ASN_SKIN = view(N_HEX, [2, 3, 4, 4], [4, 4, 4]);
const ASN_ACCENT = view(N_HEX, [13, 6, 7, 8], [7, 8, 11]);

const ASN_REGIONS = [ASN_SLATE, ASN_MASK, ASN_VEST, ASN_WRAP, ASN_GLINT, ASN_SKIN, ASN_ACCENT];
const ASN_PART = {
  1: 'sash', 2: 'sash', 3: 'vest', 4: 'mask', 5: 'hood', 6: 'skin',
  7: 'skin', 8: 'skin', 9: 'wrap', 10: 'skin', 11: 'skin', 12: 'skin', 13: 'wrap', 14: 'skin',
  15: 'vest', 16: 'vest', 17: 'vest', 18: 'wrap',
  19: 'vest', 20: 'vest', 21: 'vest', 22: 'wrap',
};
const ASN_PAL = {
  ink: '#08090d', seam: '#181c22', mark: '#8a7aa8',
  hood: ASN_REGIONS[0], sash: ASN_REGIONS[6], mask: ASN_REGIONS[1], vest: ASN_REGIONS[2],
  wrap: ASN_REGIONS[3], glint: ASN_REGIONS[4], skin: ASN_REGIONS[5], accent: ASN_REGIONS[6],
};

// =========================================================================================================
//  6. PRIEST - ivory hooded robe, gold circlet, crimson stole with a gold mark, rope belt with a tassel
// =========================================================================================================
const PRIEST_HEX = [
  '#0e0c14', // 0  ink
  '#37301f', // 1  darkest / seams
  '#f0c8a0', // 2  skin lit
  '#d8a070', // 3  skin mid
  '#a86a48', // 4  skin shade
  '#f8f2e6', // 5  ivory lit
  '#e0d8c8', // 6  ivory mid
  '#bcb29e', // 7  ivory base
  '#8e8470', // 8  ivory shade
  '#d4676c', // 9  crimson lit
  '#b3434a', // 10 crimson mid
  '#7c2b31', // 11 crimson dark
  '#4e171c', // 12 crimson deepest
  '#f0d68a', // 13 gold lit
  '#d8b85c', // 14 gold mid
  '#a88c38', // 15 gold base
];
const R_HEX = PAL16(PRIEST_HEX);
const PRS_IVORY = view(R_HEX, [5, 6, 7, 8], [8, 1, 1]);
const PRS_IVORY_DK = R(PRS_IVORY, 1);
const PRS_CRIMSON = view(R_HEX, [9, 10, 11, 12], [11, 12, 1]);
const PRS_GOLD = view(R_HEX, [13, 14, 15, 1], [15, 1, 1]);
const PRS_ROPE = view(R_HEX, [7, 8, 1, 1], [1, 1, 1]);
const PRS_SKIN = view(R_HEX, [2, 3, 4, 4], [4, 4, 4]);

const PRS_REGIONS = [PRS_IVORY, PRS_CRIMSON, PRS_GOLD, PRS_ROPE, PRS_SKIN];
const PRS_PART = {
  1: 'robe', 2: 'rope', 3: 'robe', 4: 'cowl', 5: 'hood', 6: 'skin',
  7: 'robe', 8: 'robe', 9: 'robe', 10: 'skin', 11: 'robe', 12: 'robe', 13: 'robe', 14: 'skin',
  15: 'robe', 16: 'robe', 17: 'robe', 18: 'rope',
  19: 'robe', 20: 'robe', 21: 'robe', 22: 'rope',
};
const PRS_PAL = {
  ink: '#0e0c14', seam: '#8e8470', mark: '#b3434a',
  robe: PRS_REGIONS[0], hood: PRS_REGIONS[0], cowl: PRS_IVORY_DK, stole: PRS_REGIONS[1],
  gold: PRS_REGIONS[2], rope: PRS_REGIONS[3], skin: PRS_REGIONS[4],
};

// ---- geometry helpers ------------------------------------------------------------------------------------
function ctxOf({ S, PART, plot }) {
  const SC = S.sc ?? 1;
  const R0 = S.B.chest.R;
  const fwd = mv(R0, [1, 0, 0]);
  const sid = mv(R0, [0, 0, 1]);
  const chest = S.B.chest.t;
  const pelvis = S.B.pelvis.t;
  const head = S.B.head.t;
  const HR = S.B.head.R;
  const hfwd = mv(HR, [1, 0, 0]);
  const hsid = mv(HR, [0, 0, 1]);
  const yaw = S.whole ?? 0;
  const putCode = (x, y, z, region, tone, core = false, part = PART.offWeapon) => {
    const wx = Math.round(x), wy = Math.round(y);
    plot((OY - wy) * BW + (OX + wx), z, 2, part, 2, wx, wy, core ? CCORE(region, tone) : CSHELL(region, tone));
  };
  /** point on a vertical cylinder around chest->pelvis: a = 0 straight behind, +a toward the near side */
  const at = (a, y, r, t = 0) => {
    const ca = Math.cos(a), sa = Math.sin(a);
    return [
      chest[0] + (pelvis[0] - chest[0]) * t + (ca * -fwd[0] + sa * sid[0]) * r,
      chest[1] + (pelvis[1] - chest[1]) * t,
      chest[2] + (pelvis[2] - chest[2]) * t + (ca * -fwd[2] + sa * sid[2]) * r,
    ];
  };
  const line = (a, b, z, region, tone, core = false) => {
    const n = Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1])));
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      // shade by screen position: the upper-left of a stroke catches the light
      const shade = u > 0.5 || (a[1] + (b[1] - a[1]) * u) < Math.min(a[1], b[1]) ? 0 : 1;
      putCode(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, z, region, tone + shade, core);
    }
  };
  return { S, SC, R0, fwd, sid, chest, pelvis, head, HR, hfwd, hsid, yaw, putCode, at, line };
}

/** Cheap directional shade: pixels left of the figure's centre are lit, right side is core-shaded. */
const shadeOf = (x, cx) => (x <= cx - 1 ? 0 : x >= cx + 1 ? 2 : 1);

// =========================================================================================================
//  per-class geometry
// =========================================================================================================
function drawBerserker(ctx) {
  const { SC, chest, pelvis, head, fwd, sid, putCode, at, line } = ctx;
  // Fur mantle: two ragged lumps riding on the shoulders, behind the arms so the silhouette grows outward.
  // The lump top sits at the shoulder line (never at head height) and its shell steps are the fur's two light
  // tones, so it reads as pale pelt against the bare skin.
  const lumps = [
    [0.62, 1.0, 1.0, -1.6], // near shoulder, biggest lobe
    [-0.62, 0.85, 0.7, -1.4], // far shoulder, smaller
  ];
  for (const [a, big, hgt, dz] of lumps) {
    const c = at(a, chest[1] + 0.9 * SC, 6.6 * SC, 0);
    const rows = Math.max(4, Math.round(5 * big));
    for (let ri = 0; ri <= rows; ri++) {
      const v = ri / rows;
      const y = c[1] + (2.6 * SC) * (1 - v) - 0.4 * SC;
      const w = (3.4 - 2.1 * v) * big * SC;
      for (let xi = -Math.ceil(w); xi <= Math.ceil(w); xi++) {
        // ragged lower edge: skip every third pixel of the bottom row
        if (ri === rows && (xi & 1)) continue;
        // the outer column is a dark fur edge: the ladle may sit inside the body silhouette, where the rig's
        // ink ring cannot outline it, so the pelt carries its own outline against the bare skin next to it.
        const rim = Math.abs(xi) >= Math.ceil(w) - 0;
        const tone = rim ? 3 : Math.min(2, shadeOf(xi, 0) + (ri < 2 ? 0 : 1));
        putCode(c[0] + xi, y + (xi > 0 ? -0.4 : 0.4) * v, c[2] + dz, 0, tone, rim || tone >= 2);
      }
    }
  }
  // Crossed harness: two leather bands over the bare chest, meeting at the sternum.
  const torsoR = 6.0 * SC;
  const sN = at(0.9, chest[1] + 3.0 * SC, torsoR, 0);
  const sF = at(-0.9, chest[1] + 3.0 * SC, torsoR, 0);
  const hipN = at(0.7, pelvis[1] + 1.0 * SC, torsoR, 0.2);
  const hipF = at(-0.7, pelvis[1] + 1.0 * SC, torsoR, 0.2);
  line(sN, hipF, chest[2] + torsoR * 0.9, 1, 0);
  line(sF, hipN, chest[2] + torsoR * 0.9, 1, 1);
  // Iron buckle where the bands cross on the chest, plus a 2x3 brass-iron belt buckle at the front of the waist
  // so the belt line reads at 1x.
  const bx = Math.round(chest[0]), by = Math.round(chest[1] + 0.6 * SC);
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [-1, 1]]) putCode(bx + dx, by + dy, chest[2] + torsoR, 2, dy ? 2 : 1, dy === 1);
  const beltF = at(Math.PI, pelvis[1] + 1.6 * SC, torsoR * 0.92, 0.1);
  for (const [dx, dy] of [[-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1], [0, 2]]) {
    putCode(beltF[0] + dx, beltF[1] + dy, beltF[2] + 1.6, 2, dx === 0 ? 0 : 1, dy >= 1);
  }
  // War paint: two cheek stripes, only when the face turns toward the camera.
  const faceFront = Math.sin(S_yaw(ctx)) > 0.25;
  if (faceFront) {
    const hx = head[0] + ctx.hfwd[0] * 3.0 * SC, hy = head[1] + 0.6 * SC;
    for (let i = 0; i < 2; i++) {
      putCode(hx + i * 0.9, hy - i * 0.9, head[2] + 4.4 * SC, 5, i, false);
      putCode(hx + 2.2 + i * 0.9, hy - 0.4 - i * 0.9, head[2] + 4.4 * SC, 5, i, false);
    }
  }
  // A couple of wild hair tufts on the crown so the head is not a helmet shape.
  for (const [dx, dy] of [[0, 4], [1, 4], [-1, 3]]) putCode(head[0] + dx, head[1] + dy * SC, head[2] - 1.0, 7, 0, false);
}

const S_yaw = (ctx) => ctx.yaw ?? 0;

function drawPaladin(ctx) {
  const { SC, chest, head, hfwd, putCode, at, line, fwd, sid } = ctx;
  const yaw = S_yaw(ctx);
  const torsoR = 6.0 * SC;
  // Helm ridge: a 2-px gold band over the crown running front to back, plus a gold brow line so the gold reads
  // as three separate marks (ridge, pauldron trim, belt/cross) at 1x.
  const crownY = head[1] + 3.4 * SC;
  for (let k = 0; k < 2; k++) line([head[0] - 1.2, crownY - k], [head[0] + 1.2, crownY - 0.6 - k], head[2] + 1.2, 2, 0);
  putCode(head[0], head[1] + 2.4 * SC, head[2] + 5.0 * SC, 0, 0, false);
  // T visor: horizontal slit + vertical nose bar, dark, on the front of the helm.
  if (Math.sin(yaw) > 0.2) {
    const vx = head[0] + hfwd[0] * 4.2 * SC, vy = head[1] + 1.0 * SC;
    for (let i = -2; i <= 2; i++) putCode(vx, vy + i, head[2] + 6.6 * SC, 4, 1, true);
    for (let i = 0; i <= 2; i++) putCode(vx + i * 0.6, vy - 0.6 - i, head[2] + 6.6 * SC, 4, 1, true);
  }
  // Pauldrons: a dark-steel cap with a 2-px gold trim band on the outer rim (near one bigger than the far one).
  for (const [a, s, dz] of [[0.95, 1.0, -0.8], [-0.95, 0.75, -0.6]]) {
    const p = at(a, chest[1] + 4.4 * SC, 5.4 * SC, 0);
    const w = Math.max(2, Math.round(3.2 * s * SC));
    for (let i = -w; i <= w; i++) {
      putCode(p[0] + i, p[1] + 1.2 - Math.abs(i) * 0.35, p[2] + dz, 1, shadeOf(i, 0), shadeOf(i, 0) >= 2);
      putCode(p[0] + i, p[1] + 0.2 - Math.abs(i) * 0.35, p[2] + dz, 1, shadeOf(i, 0) + 1, shadeOf(i, 0) + 1 >= 2);
    }
    for (let i = -w; i <= w; i++) putCode(p[0] + i, p[1] + 2.3, p[2] + dz, 2, 0, false); // gold trim
    putCode(p[0], p[1] + 3.2, p[2] + dz, 2, 1, false);
  }
  // Gold cross on the surcoat, 3 px tall and 3 px wide so it survives downscaling.
  const cx = Math.round(chest[0]), cy = Math.round(chest[1] + 0.2 * SC);
  for (const [dx, dy] of [[0, 2], [0, 1], [0, 0], [1, 1], [-1, 1], [0, -1], [1, 0], [-1, 0]]) {
    putCode(cx + dx, cy + dy, chest[2] + torsoR, 2, Math.abs(dx) + Math.abs(dy) > 1 ? 1 : 0, false);
  }
  // Kite shield on the FAR arm: face-on when the figure faces the camera, edge-on in profile.
  const face = Math.abs(Math.sin(yaw));
  const shW = Math.max(2, Math.round(9 * face));
  const edge = at(-1.25, chest[1] + 0.4 * SC, torsoR + 1.2 * SC, 0.1);
  for (let dy = -5; dy <= 4; dy++) {
    const taper = dy > 2 ? (4 - dy) / 2 : 1;
    const w = Math.round((shW / 2) * Math.min(1, 0.45 + taper));
    for (let dx = -w; dx <= w; dx++) {
      const tone = shadeOf(dx, 0) + (dy < -2 ? 1 : 0);
      putCode(edge[0] + dx, edge[1] + dy, edge[2] + 1.4, 0, Math.min(3, tone), tone >= 2);
    }
  }
  // Gold boss in the middle of the shield.
  putCode(edge[0], edge[1], edge[2] + 2.0, 2, 0, false);
  putCode(edge[0], edge[1] - 1, edge[2] + 2.0, 2, 1, false);
}

function drawSorcerer(ctx) {
  const { SC, head, putCode, chest, at } = ctx;
  const yaw = S_yaw(ctx);
  // Wide brim: an ellipse ring around the crown with a shaded underside row. The brim + cone are deliberately
  // short (the cone tops out at the crown) so the pointed-hat silhouette does not eat the 72 px cell budget and
  // force the whole body to render smaller than the other five classes; the read comes from the violet disc and
  // the narrowing cone over the skull instead of from extra height.
  const brimY = head[1] + 1.9 * SC;
  for (let a = -Math.PI; a <= Math.PI; a += 0.06) {
    const ca = Math.cos(a), sa = Math.sin(a);
    const x = head[0] + sa * 4.6 * SC, z = head[2] + ca * 4.6 * SC;
    const tone = ca > 0.2 ? 0 : ca < -0.2 ? 2 : 1;
    putCode(x, brimY, z, 1, tone, tone >= 2);
    putCode(x, brimY - 0.9, z, 1, 2, true);
  }
  // Cone: rings shrinking to the tip, alternating violet and darker violet so the hat reads as fabric.
  const rows = Math.max(3, Math.round(2.1 * SC));
  for (let i = 1; i <= rows; i++) {
    const u = i / rows;
    const r = 3.4 * SC * (1 - u) + 0.15;
    const y = brimY + 0.4 + i * 0.58;
    for (let a = -Math.PI; a <= Math.PI; a += Math.max(0.2, 1.2 / Math.max(1, r))) {
      const ca = Math.cos(a), sa = Math.sin(a);
      const x = head[0] + sa * r, z = head[2] + ca * r;
      const lit = ca > 0;
      putCode(x, y, z, 1, lit ? (u > 0.6 ? 1 : 0) : 2 + (u > 0.6 ? 0 : 1), !lit);
    }
  }
  // A pale band around the base of the cone and a tiny star on the front.
  for (let a = -Math.PI; a <= Math.PI; a += 0.12) {
    const ca = Math.cos(a), sa = Math.sin(a);
    putCode(head[0] + sa * 3.6 * SC, brimY + 0.5, head[2] + ca * 3.6 * SC, 2, ca > 0 ? 0 : 1, ca <= 0);
  }
  // Sash knot + pouch at the waist, on the near side.
  const knot = at(0.7, chest[1] - 9.8 * SC, 6.2 * SC, 0.85);
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1], [2, 0]]) putCode(knot[0] + dx, knot[1] + dy, knot[2] + 1.0, 3, dy, dy > 0);
  const pouch = at(0.85, chest[1] - 11.0 * SC, 6.4 * SC, 0.9);
  for (const [dx, dy] of [[0, 0], [1, 0], [0, -1], [1, -1]]) putCode(pouch[0] + dx, pouch[1] + dy, pouch[2] + 1.2, 4, dy < 0 ? 0 : 1, false);
}

function drawArcher(ctx) {
  const { SC, chest, head, hfwd, putCode, at, line } = ctx;
  const yaw = S_yaw(ctx);
  const torsoR = 6.0 * SC;
  // Hood point: a short spike off the back of the hood, one tone darker than the hood. Four pixels so the
  // profile silhouette clearly reads "leather hood" instead of a knit cap.
  const back = at(0, head[1] + 2.2 * SC, 4.4 * SC, 0);
  for (let i = 0; i < 4; i++) putCode(back[0] - 1.0 - i * 0.95, back[1] + 1.8 - i * 0.95, back[2] - 1.6, 1, i >= 3 ? 2 : 1, i >= 3);
  // Cowl: a narrow scarf band at the neck, front only when facing camera (kept tight so the torso is not widened).
  if (Math.sin(yaw) > -0.2) {
    for (let i = -2; i <= 2; i++) putCode(chest[0] + i, chest[1] + 5.2 * SC, chest[2] + torsoR * 0.85, 1, shadeOf(i, 0), shadeOf(i, 0) >= 2);
  }
  // Chest strap: leather band from the near shoulder down to the far hip, with three teal pixels so the class
  // accent is carried down the body instead of sitting only on the hood.
  const sTop = at(0.9, chest[1] + 3.6 * SC, torsoR, 0);
  const sBot = at(-0.8, chest[1] - 5.0 * SC, torsoR, 0.7);
  line(sTop, sBot, chest[2] + torsoR, 2, 0);
  for (const u of [0.18, 0.44, 0.7]) {
    const x = sTop[0] + (sBot[0] - sTop[0]) * u, y = sTop[1] + (sBot[1] - sTop[1]) * u;
    putCode(x, y, chest[2] + torsoR + 1.0, 0, 1, false);
  }
  // Teal band on both bracers (one on the near forearm, one on the far forearm).
  for (const [pt, dz] of [[ctx.S.armN.end, 0.5], [ctx.S.armF.end, -0.5]]) {
    if (!pt) continue;
    for (let i = -1; i <= 1; i++) putCode(pt[0] + i, pt[1] + 1.4, pt[2] + dz, 0, i === 0 ? 0 : 1, false);
  }
  // Quiver on the back: the tube runs from the far hip up past the far shoulder, and three arrow shafts with
  // pale fletching stick up ABOVE the shoulder line so the profile view still reads as an archer.
  const qTop = at(-0.85, chest[1] + 5.6 * SC, torsoR + 1.7 * SC, 0);
  const qBot = at(-0.7, chest[1] - 2.6 * SC, torsoR + 1.7 * SC, 0.35);
  const qn = Math.max(4, Math.round(qTop[1] - qBot[1]));
  for (let i = 0; i <= qn; i++) {
    const u = i / qn;
    const x = qTop[0] + (qBot[0] - qTop[0]) * u, y = qTop[1] + (qBot[1] - qTop[1]) * u;
    const z = qTop[2] + (qBot[2] - qTop[2]) * u - 0.6;
    putCode(x, y, z, 2, u < 0.5 ? 1 : 2, false);
  }
  for (const [k, dy] of [[-0.85, 0.0], [-1.05, 0.6], [-0.65, 1.2]]) {
    const p = at(k, chest[1] + 5.6 * SC + dy * SC, torsoR + 1.7 * SC, 0);
    for (let i = 0; i <= 3; i++) putCode(p[0], p[1] + i, p[2] - 0.6, 4, i >= 3 ? 1 : 0, false);
    putCode(p[0] + 1, p[1] + 4, p[2] - 0.6, 4, 0, false);
    putCode(p[0] - 1, p[1] + 4, p[2] - 0.6, 4, 1, false);
    putCode(p[0], p[1] + 4, p[2] - 0.6, 4, 0, false);
  }
}

function drawAssassin(ctx) {
  const { SC, head, hfwd, putCode, at, chest } = ctx;
  const yaw = S_yaw(ctx);
  // Lower-face mask over the mouth and nose: two rows under the eyes, core-shaded cloth.
  if (Math.sin(yaw) > -0.35) {
    const front = Math.sin(yaw) > 0.15;
    const mw = front ? 3 : 2;
    const mx = head[0] + hfwd[0] * 3.6 * SC, my = head[1] + 2.2 * SC;
    for (let dx = -mw; dx <= mw; dx++) {
      putCode(mx + dx, my, head[2] + 4.8 * SC, 1, shadeOf(dx, 0), shadeOf(dx, 0) >= 2);
      putCode(mx + dx, my + 1, head[2] + 4.8 * SC, 1, Math.min(3, shadeOf(dx, 0) + 1), true);
    }
    // Eye band: the only skin on the face, two pale-lit pixels and a dark eye each.
    const ey = head[1] + 1.2 * SC;
    for (let dx = -2; dx <= 2; dx++) {
      const face = Math.abs(dx) <= (front ? 2 : 1);
      putCode(mx + dx, ey, head[2] + 5.0 * SC, face ? 5 : 1, 0, false);
    }
    putCode(mx - 1, ey, head[2] + 5.2 * SC, 1, 2, true);
    putCode(mx + 1, ey, head[2] + 5.2 * SC, 1, 2, true);
  }
  // Sash tail: two accent strips hanging off the hip on the side away from the camera.
  const side = yaw >= 0 ? -0.8 : 0.8;
  const hipP = at(side, chest[1] - 7.4 * SC, 6.2 * SC, 0.9);
  for (let i = 0; i < 4; i++) {
    putCode(hipP[0] + (i & 1 ? 1 : 0), hipP[1] - i, hipP[2] - 0.6, 6, i >= 2 ? 2 : 1, i >= 2);
  }
  // Slate-violet rim band on the hood brow so the head does not merge into one black shape.
  const rimY = head[1] + 3.0 * SC;
  const rimW = Math.max(2, Math.round(3.2 * Math.max(0.5, Math.abs(Math.sin(yaw))) * SC));
  for (let i = -rimW; i <= rimW; i++) {
    putCode(head[0] + i, rimY - (Math.abs(i) === rimW ? 1 : 0), head[2] + 4.6 * SC, 6, i < 0 ? 0 : 1, false);
  }
  // Forearm wraps: a lighter grey-brown band per forearm.
  for (const [pt, dz] of [[ctx.S.armN.end, 0.4], [ctx.S.armF.end, -0.4]]) {
    if (!pt) continue;
    for (let i = -1; i <= 1; i++) putCode(pt[0] + i, pt[1] - 1, pt[2] + dz, 3, i < 0 ? 0 : 1, i > 0);
  }
}

function drawPriest(ctx) {
  const { SC, chest, head, hfwd, putCode, at, line } = ctx;
  const yaw = S_yaw(ctx);
  const torsoR = 6.0 * SC;
  // Gold circlet: an arc across the brow of the raised hood, sitting in FRONT of the hood so it does not merge.
  if (Math.sin(yaw) > -0.3) {
    const cy = head[1] + 2.0 * SC;
    const w = Math.max(2, Math.round(3.4 * Math.max(0.5, Math.abs(Math.sin(yaw))) * SC));
    for (let i = -w; i <= w; i++) {
      const lift = Math.abs(i) === w ? -1 : 0;
      putCode(head[0] + i, cy + lift, head[2] + 6.0 * SC, 2, i < 0 ? 0 : 1, i > 0);
    }
    putCode(head[0], cy + 1, head[2] + 6.2 * SC, 2, 0, false); // pendant
  }
  // Crimson stole: a vertical band down the CENTRE FRONT of the robe (at() measures from the back, so the front
  // is a = PI) with a gold leaf mark, from just under the cowl to the belt.
  const face = Math.max(0.35, Math.abs(Math.sin(yaw)));
  const half = Math.max(1, Math.round(1.35 * face * SC));
  const top = at(Math.PI - 0.12, chest[1] + 3.2 * SC, torsoR + 0.9 * SC, 0.0);
  const bot = at(Math.PI, chest[1] - 9.6 * SC, torsoR + 1.1 * SC, 0.85);
  const rows = Math.max(6, Math.round(top[1] - bot[1]));
  for (let i = 0; i <= rows; i++) {
    const u = i / rows;
    const x = top[0] + (bot[0] - top[0]) * u, y = top[1] + (bot[1] - top[1]) * u;
    const z = top[2] + (bot[2] - top[2]) * u + 1.0;
    for (let dx = -half; dx <= half; dx++) putCode(x + dx, y, z, 1, shadeOf(dx, 0), shadeOf(dx, 0) >= 2);
  }
  // Gold leaf mark on the stole at chest height.
  const mx = Math.round(top[0] + (bot[0] - top[0]) * 0.35), my = Math.round(chest[1] - 0.6 * SC);
  for (const [dx, dy] of [[0, 1], [0, 0], [1, 0], [-1, 0], [0, -1]]) putCode(mx + dx, my + dy, top[2] + 1.6, 2, dy >= 0 ? 0 : 1, false);
  // Gold rim on the sleeve cuffs.
  for (const [pt, dz] of [[ctx.S.armN.end, 0.5], [ctx.S.armF.end, -0.5]]) {
    if (!pt) continue;
    for (let i = -1; i <= 1; i++) putCode(pt[0] + i, pt[1] + 1.2, pt[2] + dz, 2, i === 0 ? 0 : 1, false);
  }
  // Rope belt knot with a hanging tassel.
  const knot = at(0.25, chest[1] - 9.6 * SC, 6.2 * SC, 0.85);
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1], [0, -1]]) putCode(knot[0] + dx, knot[1] + dy, knot[2] + 1.1, 3, dy < 0 ? 0 : 1, dy > 0);
  for (let i = 1; i <= 3; i++) putCode(knot[0] + 0.5, knot[1] - i, knot[2] + 0.9, 3, i > 1 ? 2 : 1, i > 1);
}

// ---- class table -----------------------------------------------------------------------------------------
// shadowOf: hook so the exporter can resolve a region name to its index for the toner.
const regionIndex = (regions, name) => {
  const i = regions.findIndex((r) => r === name);
  return i >= 0 ? i : 0;
};

const wrap = (fn) => (args) => fn(ctxOf(args));

export const COSTUMES = {
  berserker: { part: BERSERK_PART, palette: BERSERK_PAL, regions: BERSERK_REGIONS, draw: wrap(drawBerserker), title: '狂戰士' },
  paladin: { part: PAL_PART, palette: PAL_PAL, regions: PAL_REGIONS, draw: wrap(drawPaladin), title: '聖騎士' },
  sorcerer: { part: SORC_PART, palette: SORC_PAL, regions: SORC_REGIONS, draw: wrap(drawSorcerer), title: '魔法師' },
  archer: { part: ARC_PART, palette: ARC_PAL, regions: ARC_REGIONS, draw: wrap(drawArcher), title: '弓箭手' },
  assassin: { part: ASN_PART, palette: ASN_PAL, regions: ASN_REGIONS, draw: wrap(drawAssassin), title: '刺客' },
  priest: { part: PRS_PART, palette: PRS_PAL, regions: PRS_REGIONS, draw: wrap(drawPriest), title: '祭司' },
};

/** Region ramp for a class region name (used by the exporter to build meta.palette / groups.outfit). */
export function regionRamp(cls, name) {
  const c = COSTUMES[cls];
  if (!c) return null;
  const v = c.palette[name];
  return v && v.shell ? v : null;
}
export { regionIndex };

const hexOf = (v) => {
  const c = v >>> 0;
  return '#' + [c & 255, (c >>> 8) & 255, (c >>> 16) & 255].map((n) => n.toString(16).padStart(2, '0')).join('');
};

/** Every colour a costume can produce: ink/seam/mark plus every region ramp's shell+core steps. */
export function costumePalette(cls) {
  const c = COSTUMES[cls];
  const out = [];
  const add = (h) => { if (!out.includes(h)) out.push(h); };
  for (const [k, v] of Object.entries(c.palette)) {
    if (typeof v === 'string') add(v);
    else { for (const x of v.shell) add(hexOf(x)); for (const x of v.core) add(hexOf(x)); }
  }
  return out;
}

/** The garment ramps a rarity recolour may shift (groups.outfit must be non-empty). */
export function costumeOutfit(cls) {
  const c = COSTUMES[cls];
  const order = ['robe', 'tunic', 'vest', 'hood', 'cowl', 'hat', 'steel', 'ivory', 'stole', 'sash', 'mask', 'fur', 'leather', 'trouser', 'clothes'];
  const out = [];
  for (const n of order) {
    const v = c.palette[n];
    if (!v || !v.shell) continue;
    for (const x of v.shell) {
      const h = hexOf(x);
      if (!out.includes(h)) out.push(h);
    }
  }
  return out.slice(0, 9);
}

// Armour variant: one 16-colour plate palette shared by every class, built as views like the costumes are.
const ARMOUR_HEX = [
  '#0e0c14', // 0  ink
  '#48525f', // 1  steel shade / seams
  '#8a6f22', // 2  gold deep
  '#cfd8e4', // 3  steel lit
  '#a3b0c2', // 4  steel mid
  '#74839a', // 5  steel base
  '#f6f0e4', // 6  ivory lit
  '#ddd4c2', // 7  ivory mid
  '#b8ae9a', // 8  ivory base
  '#f0d68a', // 9  gold lit
  '#c9a94e', // 10 gold mid
  '#94762a', // 11 gold base
  '#1c2128', // 12 darkest
  '#f0c8a0', // 13 skin lit
  '#d8a070', // 14 skin mid
  '#a86a48', // 15 skin shade
];
const AH = PAL16(ARMOUR_HEX);
const ARMOUR_STEEL = view(AH, [3, 4, 5, 1], [5, 1, 12]);
const ARMOUR_CLOTH = view(AH, [6, 7, 8, 8], [8, 12, 12]);
const ARMOUR_GOLD = view(AH, [9, 10, 11, 2], [11, 2, 2]);
const ARMOUR_SKIN = view(AH, [13, 14, 15, 15], [15, 15, 15]);
const ARMOUR_HEXES = ARMOUR_HEX;
const GOLD_RAMPS = new Set([PAL_GOLD, SORC_GOLD, PRS_GOLD]);

/** Armour variant regions: the same costume geometry/part table, but garments wear steel + ivory plate.
 *  Skin is kept so the hands/face still read as a person inside the armour. */
export function armourRegions(cls) {
  const c = COSTUMES[cls];
  const skin = c.palette.skin;
  return c.regions.map((r, i) => {
    if (r === skin) return ARMOUR_SKIN;
    if (GOLD_RAMPS.has(r)) return ARMOUR_GOLD;
    return i === 0 ? ARMOUR_STEEL : ARMOUR_CLOTH;
  });
}

/** Armour variant palette object (part-name -> plate ramp), matching the costume palette's key set. */
export function armourPaletteObj(cls) {
  const c = COSTUMES[cls];
  const skin = c.palette.skin;
  const first = c.regions[0];
  const out = {};
  for (const [k, v] of Object.entries(c.palette)) {
    if (typeof v === 'string') out[k] = v;
    else if (v === skin) out[k] = ARMOUR_SKIN;
    else if (GOLD_RAMPS.has(v)) out[k] = ARMOUR_GOLD;
    else out[k] = v === first ? ARMOUR_STEEL : ARMOUR_CLOTH;
  }
  out.ink = '#0e0c14';
  out.seam = '#48525f';
  out.mark = '#daaf48';
  return out;
}

/** Armour variant palette hex list: the shared plate palette above (always exactly 16 slots). */
export function armourPalette(cls) {
  return ARMOUR_HEXES.slice();
}
