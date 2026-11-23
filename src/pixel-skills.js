// Six core classes x 14 Academy archetypes x 4 skills + 11 status effects.
// Geometry (radius, band, impact delay, finisher crash beats, school colors) comes directly from
// pixelfx's Mistvale 2:1 isometric playground (sprites.html#playground).

export const SKILL_UNLOCK_LVS = Object.freeze([0, 2, 4, 5]);
export const SPEC_SWITCH_LV = 1;

export const SCHOOL_COLORS = Object.freeze({
  basic: '#d5d9e8',
  fire: '#ff7a45',
  frost: '#7fdcff',
  storm: '#ffe04a',
  arcane: '#c490ff',
  holy: '#6df2bd',
  shadow: '#a06cd0',
  status: '#8ce0c8',
  nature: '#9be15d',
  blade: '#cfd8ea',
});

export const STATUS_DEFS = Object.freeze({
  bleeding: { id: 'bleeding', name: '流血', fxId: 'status/bleeding', color: '#e45c5c', kind: 'dot', dotAtk: 0.28, maxStacks: 2, desc: '持續流血，每秒受到攻擊力 28% 傷害' },
  burning:  { id: 'burning',  name: '灼燒', fxId: 'status/burning',  color: '#ff9044', kind: 'dot', dotAtk: 0.32, defMult: 0.9, desc: '烈焰燃燒，每秒受到攻擊力 32% 傷害並略降防禦' },
  poisoned: { id: 'poisoned', name: '中毒', fxId: 'status/poisoned', color: '#7ee068', kind: 'dot', dotHp: 0.025, bossDotHp: 0.006, capAtk: 0.9, desc: '劇毒侵蝕，每秒扣除最大生命 2.5%（首領減弱）' },
  slowed:   { id: 'slowed',   name: '緩速', fxId: 'status/slowed',   color: '#7fdcff', kind: 'debuff', speedMult: 0.55, atkCdMult: 1.25, bossScale: 0.5, desc: '移速 −45%、攻擊間隔 +25%' },
  frozen:   { id: 'frozen',   name: '冰凍', fxId: 'status/frozen',   color: '#a8f0ff', kind: 'cc', stop: true, shatterBonus: 0.2, bossFallback: 'slowed', desc: '完全凍結無法行動，受重擊碎冰追加 20% 傷害' },
  stunned:  { id: 'stunned',  name: '暈眩', fxId: 'status/stunned',  color: '#ffe26a', kind: 'cc', stop: true, bossScale: 0.5, bossImmuneCd: 10, desc: '無法移動與攻擊' },
  cursed:   { id: 'cursed',   name: '詛咒', fxId: 'status/cursed',   color: '#b57cff', kind: 'debuff', atkMult: 0.8, defMult: 0.8, bossAtkMult: 0.88, bossDefMult: 0.88, desc: '攻擊與防禦下降 20%' },
  sleep:    { id: 'sleep',    name: '催眠', fxId: 'status/sleep',    color: '#9db4ff', kind: 'cc', stop: true, wakeBonus: 0.3, wakeOnHit: true, bossScale: 0.35, desc: '陷入沉睡，首次受擊立即醒來且該擊增傷 +30%' },
  charmed:  { id: 'charmed',  name: '魅惑', fxId: 'status/charmed',  color: '#ff8cc8', kind: 'cc', stop: true, bossAtkMult: 0.75, desc: '喪失敵意停止攻擊獵人' },
  confused: { id: 'confused', name: '混亂', fxId: 'status/confused', color: '#d89eff', kind: 'debuff', missChance: 0.4, bossMissChance: 0.2, desc: '攻擊有 40% 機率落空' },
  petrified:{ id: 'petrified',name: '霸體', fxId: 'status/petrified',color: '#c9c4b8', kind: 'buff', dr: 0.45, ccImmune: true, desc: '免疫控場並獲得 45% 減傷' },
});

const BEAT_FLAME = Object.freeze({ reach: 54, rings: 2, crackN: 12, dustN: 7, palette: ['#2a0c10', '#5c1414', '#a3241a', '#e0481c', '#ff8a2a', '#ffc23d', '#fff0a0'] });
const BEAT_EARTH = Object.freeze({ reach: 68, rings: 3, crackN: 15, dustN: 11, palette: ['#241d18', '#4a3a2c', '#7a6048', '#b09068', '#d8bc92', '#f0e0c0', '#fffaf0'] });
const BEAT_FROST = Object.freeze({ reach: 60, rings: 2, crackN: 7, dustN: 9, palette: ['#141a2a', '#2b3550', '#5a6b8c', '#96a8c4', '#c8d4e4', '#e8f0ff', '#ffffff'] });

export const SPECS = Object.freeze([
  // ── 1. 狂戰士 berserker (2 archetypes) ──
  {
    id: 'berserker_fury', classId: 'berserker', name: '血怒巨刃', school: 'blade', color: '#e66c55',
    tag: '流血・吸血・殘血斬裂', desc: '越戰越狂的重刃流派，靠流血與吸血硬拚，奧義依已損生命暴增傷害。',
    skills: [
      { id: 'whirlwind', slot: 0, unlockLv: 0, name: '旋風斬', school: 'blade', fxId: 'melee/whirlwind-iso', kind: 'selfAoe', cd: 9, mult: 1.5, radius: 2.4, delay: 0.1, lock: 0.7, release: 0.22, impact: 'slash', status: 'bleeding', statusDur: 3, shapeTag: '周身', desc: '揮舞巨刃橫掃周圍魔物，造成 150% 傷害並附加 3 秒流血。' },
      { id: 'double_slash', slot: 1, unlockLv: 2, name: '二連狂斬', school: 'blade', fxId: 'melee/double-slash-iso', kind: 'single', cd: 8, mult: 1.9, radius: 1.5, delay: 0.08, lock: 0.65, release: 0.18, impact: 'slash', selfHealPct: 0.08, shapeTag: '單體', desc: '雙段重斬目標造成 190% 傷害，並回復自身 8% 最大生命。' },
      { id: 'uppercut', slot: 2, unlockLv: 4, name: '上挑破陣', school: 'blade', fxId: 'melee/uppercut-iso', kind: 'single', cd: 11, mult: 1.8, radius: 1.4, delay: 0.06, lock: 0.65, release: 0.18, impact: 'slash', status: 'stunned', statusDur: 1.2, shapeTag: '控場', desc: '猛力上挑造成 180% 傷害並暈眩目標 1.2 秒。' },
      { id: 'heavy_cleave', slot: 3, unlockLv: 5, name: '血怒裂空斬', school: 'blade', fxId: 'melee/heavy-cleave-iso', kind: 'aoe', cd: 20, mult: 2.8, radius: 2.5, delay: 0.32, lock: 0.9, release: 0.25, impact: 'heavy', finisher: true, beat: BEAT_FLAME, lowHpScale: 0.8, shapeTag: '終結技', desc: '紅焰裂地終結斬，造成 280% 傷害；自身每少 1% 生命再增傷 +0.8%。' },
    ],
  },
  {
    id: 'berserker_quake', classId: 'berserker', name: '熔岩震地', school: 'fire', color: '#ff7a45',
    tag: '範圍震暈・烈焰破甲', desc: '以大地猛擊與烈焰火環撕裂怪群，大範圍震波破防助全隊輸出。',
    skills: [
      { id: 'whirlwind_q', slot: 0, unlockLv: 0, name: '旋風斬', school: 'blade', fxId: 'melee/whirlwind-iso', kind: 'selfAoe', cd: 9, mult: 1.5, radius: 2.4, delay: 0.1, lock: 0.7, release: 0.22, impact: 'slash', shapeTag: '周身', desc: '橫掃周圍敵人造成 150% 傷害。' },
      { id: 'ground_slam', slot: 1, unlockLv: 2, name: '大地猛擊', school: 'blade', fxId: 'impacts/ground-slam-iso', kind: 'aoe', cd: 12, mult: 1.75, radius: 3.25, delay: 0.14, lock: 0.8, release: 0.24, impact: 'heavy', finisher: true, beat: BEAT_EARTH, status: 'stunned', statusDur: 1.2, shapeTag: '終結技', desc: '重砸地面震裂 3.25 格內敵人造成 175% 傷害並暈眩 1.2 秒。' },
      { id: 'berserk_fire_ring', slot: 2, unlockLv: 4, name: '烈焰戰環', school: 'fire', fxId: 'fire/fire-ring-iso', kind: 'selfAoe', cd: 14, mult: 1.4, radius: 4.3, delay: 0.16, lock: 0.75, release: 0.2, status: 'burning', statusDur: 4, trigger: 'nearEnemy', shapeTag: '周身', desc: '自腳下炸開 4.3 格烈焰環，造成 140% 傷害並全體灼燒 4 秒。' },
      { id: 'quake', slot: 3, unlockLv: 5, name: '破滅大地震', school: 'nature', fxId: 'nature/quake-iso', kind: 'selfAoe', cd: 22, mult: 2.6, radius: 4.7, delay: 0.3, lock: 0.95, release: 0.25, impact: 'earth', finisher: true, beat: BEAT_EARTH, status: 'cursed', statusDur: 5, shapeTag: '大範圍', desc: '震裂 4.7 格內所有魔物造成 260% 傷害，並削弱攻防 5 秒。' },
    ],
  },

  // ── 2. 聖騎士 paladin (2 archetypes) ──
  {
    id: 'paladin_aegis', classId: 'paladin', name: '聖盾守護', school: 'holy', color: '#daaf48',
    tag: '群體聖盾・挑釁・力場', desc: '以團隊減傷聖盾與折射力場守護後排，關鍵時刻化為霸體坦住首領。',
    skills: [
      { id: 'divine_shield', slot: 0, unlockLv: 0, name: '聖盾祈禱', school: 'holy', fxId: 'holy/divine-shield-iso', kind: 'allyShield', cd: 12, heal: 0.25, shieldDr: 0.3, shieldDur: 4, radius: 4.0, delay: 0.1, lock: 0.7, release: 0.2, shapeTag: '群盾', desc: '回復自身 25% 生命，並替 4 格內友軍套上 4 秒減傷 30% 聖盾。' },
      { id: 'smite_taunt', slot: 1, unlockLv: 2, name: '聖光審判', school: 'holy', fxId: 'holy/smite-iso', kind: 'aoe', cd: 10, mult: 1.65, radius: 1.9, delay: 0.22, lock: 0.7, release: 0.2, tauntRadius: 3.5, shapeTag: '挑釁', desc: '落下光錘造成 165% 傷害，並強制吸引 3.5 格內魔物攻擊自己。' },
      { id: 'force_field', slot: 2, unlockLv: 4, name: '折射力場', school: 'arcane', fxId: 'scifi/force-field-iso', kind: 'selfBuff', cd: 15, rangedDr: 0.5, buffDur: 4, delay: 0.08, lock: 0.6, release: 0.18, trigger: 'nearEnemy', shapeTag: '防禦', desc: '展開 4 秒全方位折射力場，遠程與法術傷害減免 50%。' },
      { id: 'holy_pillar', slot: 3, unlockLv: 5, name: '天罰聖柱', school: 'holy', fxId: 'holy/holy-pillar-iso', kind: 'aoe', cd: 22, mult: 2.6, radius: 2.1, delay: 0.28, lock: 0.9, release: 0.25, selfStatus: 'petrified', selfStatusDur: 4, shapeTag: '終結技', desc: '召喚聖光巨柱轟炸 260% 傷害，並賦予自身 4 秒霸體（減傷 45%）。' },
    ],
  },
  {
    id: 'paladin_crusader', classId: 'paladin', name: '雷錘先鋒', school: 'blade', color: '#f0c65a',
    tag: '荊棘反傷・重錘群暈', desc: '兼具坦度與前排破陣力，靠荊棘聖甲反傷流血、審判巨錘砸暈全場。',
    skills: [
      { id: 'divine_shield_c', slot: 0, unlockLv: 0, name: '聖盾祈禱', school: 'holy', fxId: 'holy/divine-shield-iso', kind: 'allyShield', cd: 12, heal: 0.2, shieldDr: 0.25, shieldDur: 4, radius: 4.0, delay: 0.1, lock: 0.7, release: 0.2, shapeTag: '群盾', desc: '回復自身 20% 生命，替 4 格內友軍套上 4 秒減傷 25% 聖盾。' },
      { id: 'spear_sweep', slot: 1, unlockLv: 2, name: '長槍橫掃', school: 'blade', fxId: 'melee/spear-sweep-iso', kind: 'aoe', cd: 9, mult: 1.6, radius: 2.0, delay: 0.08, lock: 0.65, release: 0.18, impact: 'slash', knockback: 1.0, shapeTag: '擊退', desc: '大弧度橫掃 160% 傷害並擊退逼近後排的敵人。' },
      { id: 'thorns_armor', slot: 2, unlockLv: 4, name: '荊棘聖甲', school: 'nature', fxId: 'nature/thorns-iso', kind: 'selfAoe', cd: 14, mult: 1.25, radius: 3.6, delay: 0.25, lock: 0.7, release: 0.2, impact: 'thorn', thornsPct: 0.3, thornsDur: 5, status: 'bleeding', statusDur: 3, shapeTag: '反傷', desc: '3.6 格荊棘爆發 125% 傷害並附加流血，5 秒內反彈 30% 近戰傷害。' },
      { id: 'hammer_smash', slot: 3, unlockLv: 5, name: '審判巨錘', school: 'blade', fxId: 'melee/hammer-smash-iso', kind: 'aoe', cd: 21, mult: 2.9, radius: 3.3, delay: 0.3, lock: 0.95, release: 0.28, impact: 'heavy', finisher: true, beat: BEAT_EARTH, status: 'stunned', statusDur: 1.5, tauntRadius: 4.0, shapeTag: '終結技', desc: '巨錘砸落造成 290% 傷害、範圍暈眩 1.5 秒並強制吸怪。' },
    ],
  },

  // ── 3. 魔法師 sorcerer (4 archetypes: fire / frost / storm / arcane) ──
  {
    id: 'sorcerer_fire', classId: 'sorcerer', name: '烈焰災厄', school: 'fire', color: '#ff7a45',
    tag: '灼燒・大範圍轟炸', desc: '極致毀滅的火元素流派，火龍捲接隕星天降清空整片戰場。',
    skills: [
      { id: 'cinder_cyclone', slot: 0, unlockLv: 0, name: '火龍捲', school: 'fire', fxId: 'fire/cinder-cyclone-iso', castCircle: true, kind: 'aoe', cd: 14, mult: 1.55, radius: 3.0, delay: 0.3, lock: 1.0, release: 0.55, status: 'burning', statusDur: 3, shapeTag: '範圍', desc: '詠唱雙層火龍捲造成 155% 範圍傷害，附加 3 秒灼燒。' },
      { id: 'fire_blast', slot: 1, unlockLv: 2, name: '爆炎彈', school: 'fire', fxId: 'explosions/ground-blast', kind: 'aoe', cd: 8, mult: 1.45, radius: 2.6, delay: 0.12, lock: 0.7, release: 0.25, status: 'burning', statusDur: 3, shapeTag: '快發', desc: '迅速引爆目標區域造成 145% 傷害與 3 秒灼燒。' },
      { id: 'mage_fire_ring', slot: 2, unlockLv: 4, name: '抗拒火環', school: 'fire', fxId: 'fire/fire-ring-iso', kind: 'selfAoe', cd: 13, mult: 1.5, radius: 4.3, delay: 0.16, lock: 0.7, release: 0.2, knockback: 1.6, status: 'burning', statusDur: 3, trigger: 'nearEnemy', shapeTag: '周身', desc: '敵人貼近時自腳下擴散火環，造成 150% 傷害並震退。' },
      { id: 'meteor', slot: 3, unlockLv: 5, name: '隕星天降', school: 'fire', fxId: 'fire/meteor-iso', nukeChance: 0.2, nukeFxId: 'explosions/nuke-iso', castCircle: true, kind: 'aoe', cd: 24, mult: 3.2, radius: 5.5, delay: 0.6, lock: 1.05, release: 0.35, finisher: true, beat: BEAT_FLAME, status: 'burning', statusDur: 4, shapeTag: '終結技', desc: '鎖定大範圍降下毀滅隕石造成 320% 傷害（1 轉起 20% 進化為終極核爆 400%）。' },
    ],
  },
  {
    id: 'sorcerer_frost', classId: 'sorcerer', name: '寒冰控制', school: 'frost', color: '#7fdcff',
    tag: '直線穿透・凍結拉打', desc: '結合 6 格直線冰刺帶與周身冰環凍結，讓魔物根本摸不到後排。',
    skills: [
      { id: 'icicle_fall', slot: 0, unlockLv: 0, name: '冰錐墜落', school: 'frost', fxId: 'ice/icicle-fall-iso', kind: 'single', cd: 7, mult: 1.7, radius: 1.4, delay: 0.35, lock: 0.65, release: 0.2, status: 'slowed', statusDur: 3, shapeTag: '單體', desc: '降下巨型冰錐造成 170% 傷害並緩速 3 秒。' },
      { id: 'ice_spikes', slot: 1, unlockLv: 2, name: '寒冰穿刺', school: 'frost', fxId: 'ice/ice-spikes-iso', kind: 'band', band: [6.0, 1.2], cd: 11, mult: 1.6, radius: 6.0, delay: 0.18, lock: 0.75, release: 0.25, status: 'slowed', statusDur: 3, shapeTag: '直線穿透', desc: '朝目標方向貫穿 6 格冰刺帶，沿途敵人吃 160% 傷害並緩速 3 秒。' },
      { id: 'frost_nova', slot: 2, unlockLv: 4, name: '極凍新星', school: 'frost', fxId: 'ice/frost-nova-iso', secondaryFxId: 'ice/freeze-iso', kind: 'selfAoe', cd: 14, mult: 1.4, radius: 5.1, delay: 0.18, lock: 0.7, release: 0.2, status: 'frozen', statusDur: 2.0, trigger: 'nearEnemy', shapeTag: '周身', desc: '敵人近身時爆發 5.1 格冰環，造成 140% 傷害並冰凍 2 秒。' },
      { id: 'blizzard_vortex', slot: 3, unlockLv: 5, name: '極地暴風雪', school: 'frost', fxId: 'ice/blizzard-vortex-iso', castCircle: true, kind: 'aoe', cd: 22, mult: 2.9, radius: 3.4, delay: 0.55, lock: 1.0, release: 0.3, finisher: true, beat: BEAT_FROST, status: 'frozen', statusDur: 2.5, shapeTag: '大範圍', desc: '捲起極地暴風雪造成 290% 傷害並大範圍凍結 2.5 秒。' },
    ],
  },
  {
    id: 'sorcerer_storm', classId: 'sorcerer', name: '雷霆風暴', school: 'storm', color: '#ffe04a',
    tag: '蓄電必暴・連鎖清群', desc: '高爆發雷電專家，蓄電增傷接連鎖閃電在怪海間瞬間跳殺。',
    skills: [
      { id: 'lightning_strike', slot: 0, unlockLv: 0, name: '天雷落擊', school: 'storm', fxId: 'lightning/lightning-strike-iso', kind: 'single', cd: 8, mult: 1.85, radius: 1.7, delay: 0.28, lock: 0.7, release: 0.22, status: 'stunned', statusDur: 0.8, shapeTag: '單體', desc: '召喚落雷劈擊目標造成 185% 傷害並短暫暈眩 0.8 秒。' },
      { id: 'charge_up', slot: 1, unlockLv: 2, name: '超載蓄電', school: 'storm', fxId: 'lightning/charge-up-iso', kind: 'selfBuff', cd: 13, chargeBonus: 0.5, buffDur: 5, delay: 0.1, lock: 0.55, release: 0.15, shapeTag: '增益', desc: '聚集雷能 5 秒，下一次技能傷害提高 50% 並必定暴擊。' },
      { id: 'mana_burst', slot: 2, unlockLv: 4, name: '秘法魔爆', school: 'arcane', fxId: 'arcane/mana-burst-iso', kind: 'aoe', cd: 11, mult: 1.65, radius: 2.55, delay: 0.22, lock: 0.7, release: 0.2, knockback: 1.3, shapeTag: '範圍', desc: '釋放高壓雷能震爆 165% 傷害並擊退近身敵人。' },
      { id: 'chain_lightning', slot: 3, unlockLv: 5, name: '連鎖閃電', school: 'storm', fxId: 'lightning/chain-lightning-iso', kind: 'chain', targets: 5, falloff: 0.85, cd: 18, mult: 2.4, radius: 5.5, delay: 0.2, lock: 0.85, release: 0.24, status: 'stunned', statusDur: 0.8, shapeTag: '連鎖', desc: '電弧自動跳躍最多 5 隻敵人（首擊 240%，每跳 ×0.85）並麻痺暈眩。' },
    ],
  },
  {
    id: 'sorcerer_arcane', classId: 'sorcerer', name: '秘法時空', school: 'arcane', color: '#c490ff',
    tag: '追蹤彈幕・時間靜止', desc: '掌控時空與星辰的秘法師，能讓整片戰場時間停滯再降下星雨。',
    skills: [
      { id: 'magic_missile', slot: 0, unlockLv: 0, name: '秘法飛彈', school: 'arcane', fxId: 'projectiles/magic-missile-iso', kind: 'single', cd: 6, mult: 1.5, radius: 2.0, delay: 0.18, lock: 0.55, release: 0.18, shapeTag: '追蹤', desc: '發射必中的秘法追蹤彈，造成 150% 傷害且冷卻極短。' },
      { id: 'arcane_missiles', slot: 1, unlockLv: 2, name: '奧術彈幕', school: 'arcane', fxId: 'arcane/arcane-missiles-iso', kind: 'multi', targets: 3, cd: 10, mult: 1.15, radius: 6.5, delay: 0.18, lock: 0.7, release: 0.22, shapeTag: '彈幕', desc: '齊射追蹤奧術飛彈，同時打擊 3 個目標各造成 115% 傷害。' },
      { id: 'time_stop', slot: 2, unlockLv: 4, name: '時間靜止', school: 'arcane', fxId: 'arcane/time-stop-iso', kind: 'timeStop', cd: 18, mult: 0.9, radius: 2.8, delay: 0.18, lock: 0.75, release: 0.2, stopDur: 2.5, vulnBonus: 0.2, shapeTag: '時停', desc: '凍結 2.8 格內時間 2.5 秒：魔物完全定格且承受傷害 +20%。' },
      { id: 'star_fall', slot: 3, unlockLv: 5, name: '群星殞落', school: 'arcane', fxId: 'arcane/star-fall-iso', castCircle: true, kind: 'aoe', cd: 23, mult: 3.0, radius: 3.4, delay: 0.4, lock: 0.95, release: 0.3, finisher: true, beat: BEAT_FROST, shapeTag: '終結技', desc: '召喚星雨轟炸 3.4 格區域，造成 300% 毀滅性奧術傷害。' },
    ],
  },

  // ── 4. 弓箭手 archer (2 archetypes: nature ranger) ──
  {
    id: 'archer_gale', classId: 'archer', name: '嵐風遊俠', school: 'nature', color: '#3fa7a0',
    tag: '箭雨・根鬚定身・貫穿', desc: '結合疾風箭雨與自然根鬚定身，遠程拉打與直線貫穿兼備。',
    skills: [
      { id: 'gale_volley', slot: 0, unlockLv: 0, name: '疾風箭雨', school: 'nature', fxId: 'nature/leaf-storm-iso', kind: 'multi', targets: 3, cd: 8, mult: 1.3, radius: 3.0, delay: 0.2, lock: 0.8, release: 0.32, impact: 'leaf', galeShots: true, shapeTag: '連射', desc: '捲起落葉疾風同時射出 3 支風箭，各造成 130% 傷害。' },
      { id: 'root_snare', slot: 1, unlockLv: 2, name: '樹根纏繞', school: 'nature', fxId: 'nature/root-snare-iso', kind: 'aoe', cd: 11, mult: 1.35, radius: 1.9, delay: 0.2, lock: 0.65, release: 0.2, impact: 'vine', status: 'slowed', statusDur: 3.0, rootDur: 2.0, shapeTag: '控場', desc: '召喚樹根纏住敵人造成 135% 傷害並定身緩速，拉開安全距離。' },
      { id: 'earth_spike', slot: 2, unlockLv: 4, name: '地刺貫穿', school: 'nature', fxId: 'nature/earth-spike-iso', kind: 'band', band: [4.4, 0.9], cd: 13, mult: 1.75, radius: 4.4, delay: 0.3, lock: 0.75, release: 0.22, impact: 'earth', shapeTag: '直線穿透', desc: '向前方轟出 4.4 格地刺直線帶，穿透整排目標造成 175% 傷害。' },
      { id: 'nature_tornado', slot: 3, unlockLv: 5, name: '自然颶風', school: 'nature', fxId: 'nature/tornado-iso', secondaryFxId: 'nature/boulder-iso', kind: 'aoe', cd: 20, mult: 2.55, radius: 2.4, delay: 0.35, lock: 0.9, release: 0.28, impact: 'stone', status: 'stunned', statusDur: 1.2, shapeTag: '終結技', desc: '捲起風龍捲並砸落巨岩，造成 255% 範圍傷害與 1.2 秒暈眩。' },
    ],
  },
  {
    id: 'archer_venom', classId: 'archer', name: '劇毒獵手', school: 'nature', color: '#8ad44c',
    tag: '破防・催眠・百分比毒霧', desc: '擅長酸液破甲、催眠孢子與持續毒霧，專剋高血量首領與高難度魔物。',
    skills: [
      { id: 'acid_splash', slot: 0, unlockLv: 0, name: '酸液箭陣', school: 'nature', fxId: 'nature/acid-splash-iso', kind: 'aoe', cd: 9, mult: 1.35, radius: 2.4, delay: 0.24, lock: 0.7, release: 0.22, impact: 'acid', status: 'cursed', statusDur: 4, shapeTag: '破防', desc: '酸液炸裂造成 135% 傷害並侵蝕目標攻防 4 秒。' },
      { id: 'vine_whip', slot: 1, unlockLv: 2, name: '藤鞭抽打', school: 'nature', fxId: 'nature/vine-whip-iso', kind: 'aoe', cd: 10, mult: 1.5, radius: 3.0, delay: 0.15, lock: 0.65, release: 0.2, impact: 'vine', knockback: 1.5, shapeTag: '擊退', desc: '甩出長距離藤鞭抽打 150% 傷害並擊退逼近的魔物。' },
      { id: 'spore_burst', slot: 2, unlockLv: 4, name: '催眠孢子', school: 'nature', fxId: 'nature/spore-burst-iso', kind: 'aoe', cd: 14, mult: 1.25, radius: 3.2, delay: 0.5, lock: 0.75, release: 0.25, impact: 'spore', status: 'sleep', statusDur: 2.5, shapeTag: '催眠', desc: '散播 3.2 格催眠孢子，使魔物沉睡 2.5 秒（首次受擊增傷 +30%）。' },
      { id: 'poison_cloud', slot: 3, unlockLv: 5, name: '腐蝕毒霧', school: 'nature', fxId: 'nature/poison-cloud-iso', secondaryFxId: 'nature/toxic-puddle-iso', kind: 'aoe', cd: 22, mult: 2.1, radius: 3.4, delay: 0.45, lock: 0.9, release: 0.26, impact: 'toxic', status: 'poisoned', statusDur: 6, shapeTag: '毒霧', desc: '鋪開 4 秒劇毒雲霧與毒沼，造成 210% 傷害並附加 6 秒百分比劇毒。' },
    ],
  },

  // ── 5. 刺客 assassin (2 archetypes: blade reaper / void shadow) ──
  {
    id: 'assassin_reaper', classId: 'assassin', name: '影鐮閃擊', school: 'blade', color: '#8f7cc4',
    tag: '瞬移・穿甲・擊殺刷新', desc: '高機動瞬移刺殺，奧義死神鐮割斬殺敵人後自動抽魂並返還冷卻。',
    skills: [
      { id: 'shadow_dash', slot: 0, unlockLv: 0, name: '暗影衝刺', school: 'blade', fxId: 'melee/dagger-flurry-iso', warpFxId: 'scifi/warp-iso', kind: 'single', cd: 8, mult: 2.4, radius: 1.3, delay: 0.15, lock: 0.6, release: 0.2, impact: 'pierce', warp: 4, shapeTag: '位移', desc: '瞬移切入並以匕首連刺重創單一目標，造成 240% 傷害。' },
      { id: 'shadow_thrust', slot: 1, unlockLv: 2, name: '疾影穿刺', school: 'blade', fxId: 'melee/thrust-iso', kind: 'single', cd: 9, mult: 1.75, radius: 1.95, delay: 0.07, lock: 0.6, release: 0.16, impact: 'pierce', armorPen: 0.4, status: 'bleeding', statusDur: 3, shapeTag: '破甲', desc: '無視 40% 防禦直刺目標造成 175% 傷害並附加流血 3 秒。' },
      { id: 'claw_whip', slot: 2, unlockLv: 4, name: '影爪亂襲', school: 'blade', fxId: 'melee/claw-swipe-iso', secondaryFxId: 'melee/whip-crack-iso', kind: 'aoe', cd: 12, mult: 1.6, radius: 1.9, delay: 0.06, lock: 0.65, release: 0.18, impact: 'slash', status: 'confused', statusDur: 2.5, shapeTag: '擾亂', desc: '連環撕裂 160% 傷害並讓目標陷入 2.5 秒混亂（高機率攻擊落空）。' },
      { id: 'scythe_reap', slot: 3, unlockLv: 5, name: '死神鐮割', school: 'blade', fxId: 'melee/scythe-reap-iso', killFxId: 'spawn/soul-rise-iso', kind: 'aoe', cd: 19, mult: 2.9, radius: 2.0, delay: 0.12, lock: 0.85, release: 0.22, impact: 'slash', finisher: true, beat: BEAT_FROST, killsReset: 0.5, shapeTag: '終結技', desc: '冷藍裂地死神鐮斬 290% 傷害；斬殺敵人時抽魂並返還一技 50% 冷卻。' },
    ],
  },
  {
    id: 'assassin_void', classId: 'assassin', name: '虛空暗殺', school: 'shadow', color: '#a06cd0',
    tag: '影鬚劇毒・殘血斬殺', desc: '駕馭虛空影蝕的處決刺客，對血量低於 40% 的強敵爆發 380% 斬殺傷害。',
    skills: [
      { id: 'void_dash', slot: 0, unlockLv: 0, name: '暗影衝刺', school: 'shadow', fxId: 'melee/dagger-flurry-iso', warpFxId: 'scifi/warp-iso', kind: 'single', cd: 8, mult: 2.2, radius: 1.3, delay: 0.15, lock: 0.6, release: 0.2, impact: 'pierce', warp: 4, shapeTag: '位移', desc: '瞬移貼身連刺造成 220% 傷害。' },
      { id: 'shadow_tendrils', slot: 1, unlockLv: 2, name: '影鬚突襲', school: 'shadow', fxId: 'shadow/shadow-tendrils-iso', kind: 'aoe', cd: 10, mult: 1.65, radius: 2.1, delay: 0.24, lock: 0.65, release: 0.2, status: 'poisoned', statusDur: 4, shapeTag: '毒蝕', desc: '暗影觸鬚穿刺 165% 傷害並附加 4 秒劇毒。' },
      { id: 'void_orb', slot: 2, unlockLv: 4, name: '虛空裂球', school: 'shadow', fxId: 'shadow/void-orb-iso', kind: 'aoe', cd: 12, mult: 1.9, radius: 2.2, delay: 0.3, lock: 0.7, release: 0.22, status: 'cursed', statusDur: 4, shapeTag: '破防', desc: '投出虛空球炸裂 190% 傷害並施加 4 秒降防詛咒。' },
      { id: 'eclipse_exec', slot: 3, unlockLv: 5, name: '暗蝕終結', school: 'shadow', fxId: 'shadow/eclipse-iso', secondaryFxId: 'shadow/dark-explosion-iso', kind: 'aoe', cd: 21, mult: 2.6, execBelow: 0.4, execMult: 3.8, radius: 3.3, delay: 0.35, lock: 0.9, release: 0.26, finisher: true, beat: BEAT_FROST, shapeTag: '斬殺', desc: '降下日蝕暗爆造成 260% 傷害；目標血量低於 40% 時暴增為 380% 斬殺！' },
    ],
  },

  // ── 6. 祭司 priest (2 archetypes: holy light / shadow oracle) ──
  {
    id: 'priest_light', classId: 'priest', name: '聖光大祭司', school: 'holy', color: '#6df2bd',
    tag: '群補・淨化・戰場復活', desc: '全村最強續航核心，兼具群體補血、驅散負面狀態與戰場直接復活。',
    skills: [
      { id: 'heal_aoe', slot: 0, unlockLv: 0, name: '暗癒禱言', school: 'holy', fxId: 'holy/heal-aoe-iso', kind: 'allyHeal', singleTarget: true, cd: 10, heal: 0.28, below: 0.9, radius: 3.4, delay: 0.25, lock: 0.7, release: 0.25, shapeTag: '治療', desc: '於傷員腳下展開聖癒環，精準回復最危急隊友 28% 最大生命。' },
      { id: 'healing_bloom', slot: 1, unlockLv: 2, name: '治癒綻放', school: 'nature', fxId: 'nature/healing-bloom-iso', kind: 'allyHeal', cd: 12, heal: 0.18, cleanse: true, below: 0.96, radius: 3.4, delay: 0.22, lock: 0.7, release: 0.22, shapeTag: '淨化', desc: '綻放自然之花群補 18% 生命，並立即清除範圍內友軍所有負面狀態。' },
      { id: 'holy_charm', slot: 2, unlockLv: 4, name: '神聖魅語', school: 'holy', fxId: 'holy/smite-iso', kind: 'single', cd: 14, mult: 1.4, radius: 2.0, delay: 0.22, lock: 0.65, release: 0.2, status: 'charmed', statusDur: 2.0, shapeTag: '魅惑', desc: '以聖光威懾目標造成 140% 傷害並魅惑 2 秒，阻止其攻擊隊友。' },
      { id: 'resurrection', slot: 3, unlockLv: 5, name: '聖光復甦', school: 'holy', fxId: 'holy/resurrection-iso', kind: 'revive', cd: 30, heal: 0.35, reviveHp: 0.5, cleanse: true, radius: 4.5, delay: 0.3, lock: 0.95, release: 0.3, shapeTag: '復活', desc: '直接拉起 4.5 格內倒地隊友（回復 50% 血）；無人倒地時全隊大補 35% 並淨化。' },
    ],
  },
  {
    id: 'priest_shadow', classId: 'priest', name: '暗影神官', school: 'shadow', color: '#b56fd6',
    tag: '詛咒・吸血奶・黑洞聚怪', desc: '光暗雙修的戰術神官，以詛咒削弱敵人、吸血轉補隊友、黑洞聚怪做球。',
    skills: [
      { id: 'heal_aoe_s', slot: 0, unlockLv: 0, name: '暗癒禱言', school: 'holy', fxId: 'holy/heal-aoe-iso', kind: 'allyHeal', cd: 10, heal: 0.24, below: 0.9, radius: 3.4, delay: 0.25, lock: 0.7, release: 0.25, shapeTag: '群補', desc: '替範圍內受傷友軍回復 24% 生命。' },
      { id: 'hex_sigil', slot: 1, unlockLv: 2, name: '厄運咒印', school: 'shadow', fxId: 'shadow/hex-sigil-iso', secondaryFxId: 'shadow/grasping-hands-iso', kind: 'aoe', cd: 11, mult: 1.35, radius: 2.1, delay: 0.35, lock: 0.7, release: 0.22, status: 'cursed', statusDur: 5, rootDur: 1.5, shapeTag: '詛咒', desc: '刻下厄運咒印並召喚鬼手，造成 135% 傷害、定身並降敵攻防 20%（5 秒）。' },
      { id: 'life_steal', slot: 2, unlockLv: 4, name: '生命汲取', school: 'shadow', fxId: 'shadow/life-steal-iso', secondaryFxId: 'shadow/soul-drain-iso', kind: 'aoe', cd: 12, mult: 1.7, radius: 3.55, delay: 0.2, lock: 0.75, release: 0.22, allyLifesteal: 0.6, shapeTag: '吸血奶', desc: '汲取敵方生命造成 170% 傷害，並將 60% 傷害轉為治療最殘血的隊友。' },
      { id: 'black_hole', slot: 3, unlockLv: 5, name: '深淵黑洞', school: 'shadow', fxId: 'shadow/black-hole-iso', secondaryFxId: 'shadow/necro-skulls-iso', kind: 'pull', cd: 24, mult: 2.5, radius: 3.8, delay: 0.35, lock: 0.95, release: 0.28, pullStrength: 2.2, status: 'slowed', statusDur: 3.5, shapeTag: '聚怪', desc: '展開 3.8 格深淵黑洞將周圍魔物拉向中心，造成 250% 傷害並緩速，替隊友做球清場。' },
    ],
  },
]);

export const SPEC_BY_ID = Object.freeze(Object.fromEntries(SPECS.map(sp => [sp.id, sp])));

export const CLASS_SPECS = Object.freeze(
  SPECS.reduce((acc, sp) => { (acc[sp.classId] ||= []).push(sp); return acc; }, {})
);

export const CLASS_DEFAULT_SPEC = Object.freeze(
  Object.fromEntries(Object.entries(CLASS_SPECS).map(([cid, list]) => [cid, list[0].id]))
);

export const defaultSpecOf = classId => CLASS_DEFAULT_SPEC[classId] || CLASS_DEFAULT_SPEC.berserker;
export const specsOf = classId => CLASS_SPECS[classId] || CLASS_SPECS.berserker;

export function specOf(h) {
  const cid = h?.classId || 'berserker';
  const sp = h?.spec && SPEC_BY_ID[h.spec];
  return (sp && sp.classId === cid) ? sp : SPEC_BY_ID[defaultSpecOf(cid)];
}

export function unlockedSkills(h) {
  const sp = specOf(h), lv = Math.max(0, Math.floor(h?.skillLevel || 0));
  return sp.skills.filter(sk => lv >= sk.unlockLv);
}

export function skillSlotMult(h, sk) {
  let m = sk.mult || 1;
  const lv = h?.skillLevel || 0;
  if (lv >= 3 && sk.slot <= 1) m *= 1.15;
  if ((h?.rebirths || 0) >= 1 && sk.slot === 3) m *= 1.15;
  return m;
}

export function skillSlotCd(h, sk) {
  let cd = sk.cd || 10;
  if ((h?.rebirths || 0) >= 1 && sk.slot === 3) cd *= 0.85;
  return Math.max(2, Math.round(cd * 10) / 10);
}
