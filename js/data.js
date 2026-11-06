// data.js — all game content lives here. Adding content = adding an entry.
'use strict';

const TILE = 32;
const VIEW_W = 15;
const VIEW_H = 11;
const ATTACK_TICK = 2000;
const SAVE_KEY = 'deepvale_save_v1';

// Ground tiles. walk = passable, cost = step-time multiplier, sight = blocks projectiles,
// safe = protection zone (monsters can't enter or attack into it, player can't attack out).
const TILES = {
  '.': { name: 'grass', walk: true, cost: 1.0 },
  ':': { name: 'dirt path', walk: true, cost: 0.85 },
  '=': { name: 'stone floor', walk: true, cost: 0.85, safe: true },
  's': { name: 'sand', walk: true, cost: 1.15 },
  'm': { name: 'mud', walk: true, cost: 1.8 },
  '_': { name: 'cave floor', walk: true, cost: 1.0 },
  '+': { name: 'open door', walk: true, cost: 0.9, safe: true },
  'A': { name: 'temple altar', walk: true, cost: 0.9, safe: true },
  'O': { name: 'dark hole', walk: true, cost: 1.0, down: true },
  'L': { name: 'ladder', walk: true, cost: 1.0, up: true },
  'T': { name: 'tree', walk: false },
  '#': { name: 'wall', walk: false, sight: true },
  'R': { name: 'boulder', walk: false, sight: true },
  '~': { name: 'water', walk: false },
  'D': { name: 'depot chest', walk: false, use: 'depot' },
  ',': { name: 'marsh grass', walk: true, cost: 1.05 },
  'b': { name: 'bog', walk: true, cost: 2.2, bog: true },
  '%': { name: 'boardwalk', walk: true, cost: 0.85 },
  'Y': { name: 'dead tree', walk: false },
  '>': { name: 'road sign', walk: true, cost: 0.85, road: true },
};

// Map markers: letter -> what spawns there and which ground goes under it.
const MARKERS = {
  r: { spawn: 'rat', ground: '.' },
  w: { spawn: 'wolf', ground: '.' },
  P: { npc: 'priestess', ground: '=' },
  N: { npc: 'merchant', ground: '=' },
  H: { npc: 'hermit', ground: '.' },
  t: { spawn: 'toad', ground: ',' },
  l: { spawn: 'lurker', ground: ',' },
  h: { spawn: 'hag', ground: ',' },
  k: { spawn: 'drowned', ground: ',' },
  C: { npc: 'captain', ground: '=' },
  E: { npc: 'herbalist', ground: '=' },
};

const SURFACE = [
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
  'T......T....T.........sss~~~~~~sss......T..T',
  'T.###########.........s~~~~~~~~~~~s........T',
  'T.#===#=====#..T......s~~~~~~~~~~~s..r.....T',
  'T.#=P=#==N==#.........ss~~~~~~~~~ss........T',
  'T.#===#=====#...........sss~~~sss.....T....T',
  'T.#=A=#=D===#....T.........................T',
  'T.#===#=====#..........r.........w.........T',
  'T.##+###+####...........................T..T',
  'T...:...:..........T.......T..........w....T',
  'T...::::::::::::::::::::::::::::::::::::::>T',
  'T.T.........T.....T........::.....T........T',
  'T......T.................mm::mm....r.......T',
  'T..T.......r.......T....mmm::mmm...........T',
  'T..........................::.......w....T.T',
  'T....T.....T.........T.....::.......T......T',
  'T.......r..................::..............T',
  'T..T..........T........w...::::::::........T',
  'T.......T...........T.............:........T',
  'T....T........r...................:....T...T',
  'T..........T.......T..........RRRR:RRRR....T',
  'T...T................w........R.....H.R....T',
  'T........T...............r....R...O...R....T',
  'T..T.............T............R.......R..w.T',
  'T......T.....r........T.......RRRRRRRRR....T',
  'T............T..............T..............T',
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
];

const MAP_W = 44;
const MAP_H = 27;
const TEMPLE = { x: 4, y: 6, z: 0 };
const SHOP_PORT = { x: 9, y: 5, z: 0 }; // just below Odran; where "portus" lands

// The Saltmarsh: a second outdoor region east of town, reached by road.
const SALTMARSH = [
  'YYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY',
  'Y,,,,,,,,,Y,,,,,bbbb,,,,,~~~~~~,,,,,,Y,,,,,Y',
  'Y,,,Y,,,,,,,,,,bbbbbb,,,~~~~~~~~,,,h,,,,,,,Y',
  'Y,,,,,,,,t,,,,,bbbbbb,,,~~~~~~~~,,,,,,,,k,,Y',
  'Y,,,,,,,,,,,,,,,bbbb,,,,,~~~~~~,,,,,,Y,,,,,Y',
  'Y,,Y,,,,,,,,l,,,,%,,,,,,,,,,,,,,,,,,,,,,,,,Y',
  'Y,,,,,,,,,,,,,,,,%,,,,Y,,,,,,,,bbbbb,,,,h,,Y',
  'Y,,,,,t,,,,,,,,,,%,,,,,,,,,,l,,bbbbbbb,,,,,Y',
  'Y,,,###########,,%,,,,,,,,,,,,,bbbbbbb,,Y,,Y',
  'Y,,,#===#=====#,,%%%%%%%%%%%%%%%%%%%%%%,,,,Y',
  'Y,,,#=C=#==E==#,,,,,,,,,,,,,,,,bbbbbbb,,,,,Y',
  'Y,,,#===+=====#,,,,l,,,,,,,,,,,bbbbb,,,,k,,Y',
  'Y,,,#=D=#=====+,,,,,,,,,Y,,,,,,,,,,,,,,,,,,Y',
  'Y>,,#===#=====#,,t,,,,,,,,,,,,,,,,,,,,,,,,,Y',
  'Y,,,#####+#####,,,,,,,,,,,,,,,,,,,,,,,,Y,,,Y',
  'Y,,,,,,,,%,,,,,,,,,,,bbbbbbbbb,,,,,,,,,,,,,Y',
  'Y,,Y,,,,,%,,,t,,,,,,bbbbbbbbbbb,,,,h,,,,,,,Y',
  'Y,,,,,,,,%%%%%%%%%%%%%%%%%%%%%%%%%%%,,,,,,,Y',
  'Y,,,,,t,,,,,,,,,,,,,bbbbbbbbbbb,,,,%,,,k,,,Y',
  'Y,,,,,,,,,,,,l,,,,,,,bbbbbbbbb,,,,,%,,,,,,,Y',
  'Y,,Y,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,%,,Y,,,,Y',
  'Y,,,,,,,,,Y,,,,,,,,,,,,,l,,,,,,,,,,%,,,,,,,Y',
  'Y,,,,~~~~,,,,,,,,,bbbb,,,,,,,,,,,bbbbb,,k,,Y',
  'Y,,,~~~~~~,,,,,l,,bbbbbb,,,,Y,,,,bbbbb,,,,,Y',
  'Y,,,,~~~~,,,,,,,,,,bbbb,,,,,,,,,,,,,,,,,h,,Y',
  'Y,,,,,,,,,,,Y,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,Y',
  'YYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY',
];

// Every floor. dark = needs light and draws as cave. Outdoor floors come from SURFACES.
const FLOOR_INFO = {
  0: { name: 'Deepvale', dark: false },
  1: { name: 'Cave −1', dark: true },
  2: { name: 'Cave −2', dark: true },
  3: { name: 'Sunken Vault', dark: true },
  10: { name: 'Saltmarsh', dark: false },
};
const SURFACES = { 0: SURFACE, 10: SALTMARSH };

// Hole on floor `from` drops to a ladder on floor `to` at the same x,y.
// gate = a player flag needed before the hole lets you through.
const LINKS = [
  { x: 34, y: 22, from: 0, to: 1 },
  { x: 8, y: 6, from: 1, to: 2 },
  { x: 37, y: 22, from: 2, to: 3, gate: 'vault' },
];

// Road signs: step on one end, arrive next to the other.
const ROADS = [
  { a: { x: 42, y: 10, z: 0 }, b: { x: 1, y: 13, z: 10 } },
];

// Cave floors are carved from rooms [x, y, w, h] joined by corridors (room index pairs).
const CAVES = {
  1: {
    seed: 11,
    rooms: [[31, 19, 7, 5], [19, 17, 8, 6], [21, 7, 10, 6], [35, 5, 7, 7], [4, 3, 8, 7], [7, 15, 8, 6]],
    links: [[0, 1], [1, 2], [2, 3], [2, 4], [1, 5], [5, 4]],
    spawns: [
      ['rat', 33, 20], ['rat', 22, 19], ['grub', 24, 20], ['grub', 21, 21],
      ['archer', 25, 9], ['archer', 28, 11], ['grub', 38, 8], ['rat', 37, 10],
      ['grub', 39, 6], ['rat', 9, 17], ['grub', 11, 19], ['archer', 6, 4],
    ],
  },
  2: {
    seed: 23,
    rooms: [[4, 3, 8, 7], [16, 9, 9, 7], [5, 16, 9, 6], [28, 4, 9, 7], [27, 15, 13, 9]],
    links: [[0, 1], [1, 2], [1, 3], [3, 4], [2, 4]],
    spawns: [
      ['golem', 19, 11], ['golem', 22, 14], ['archer', 8, 18], ['golem', 11, 20],
      ['archer', 30, 6], ['archer', 34, 9], ['golem', 33, 5], ['king', 34, 20],
    ],
  },
  // Sunken Vault: below the King's hall, sealed until Brann breaks the seal.
  3: {
    seed: 37,
    rooms: [[33, 19, 8, 6], [20, 18, 9, 7], [6, 17, 10, 8], [5, 4, 10, 8], [19, 3, 10, 8], [32, 3, 10, 10]],
    links: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [1, 4]],
    spawns: [
      ['sentinel', 23, 20], ['wraith', 26, 23], ['wraith', 9, 19], ['sentinel', 13, 22],
      ['sentinel', 8, 6], ['wraith', 12, 9], ['wraith', 22, 5], ['sentinel', 27, 8],
      ['mother', 37, 7],
    ],
  },
};

// loot rows: [itemId, minCount, maxCount, chance]
const CREATURES = {
  rat: {
    name: 'Field Rat', glyph: '🐀', hp: 20, atk: 5, arm: 0, xp: 6, step: 450, flee: 0.2,
    loot: [['gold', 1, 4, 0.6], ['rat_tail', 1, 1, 0.5], ['cheese', 1, 1, 0.25],
      ['soft_slippers', 1, 1, 0.03], ['leather_helmet', 1, 1, 0.03]], respawn: 30,
  },
  wolf: {
    name: 'Grey Wolf', glyph: '🐺', hp: 50, atk: 9, arm: 1, xp: 20, step: 300, flee: 0.12,
    loot: [['meat', 1, 2, 0.4], ['wolf_pelt', 1, 1, 0.35], ['leather_boots', 1, 1, 0.05],
      ['leather_legs', 1, 1, 0.04]], respawn: 45,
  },
  grub: {
    name: 'Cave Grub', glyph: '🐛', hp: 90, atk: 13, arm: 3, xp: 35, step: 600,
    loot: [['gold', 4, 18, 0.7], ['grub_silk', 1, 1, 0.4], ['meat', 1, 1, 0.2],
      ['spun_leggings', 1, 1, 0.05], ['silk_robe', 1, 1, 0.04], ['root_rod', 1, 1, 0.04],
      ['iron_shield', 1, 1, 0.03]], respawn: 60,
  },
  archer: {
    name: 'Bone Archer', glyph: '💀', hp: 70, atk: 14, arm: 2, xp: 50, step: 500, ranged: 4, keep: 3,
    loot: [['gold', 6, 25, 0.8], ['bone', 1, 2, 0.6], ['arrow', 5, 15, 0.5], ['longbow', 1, 1, 0.03],
      ['cinder_wand', 1, 1, 0.04], ['grove_tome', 1, 1, 0.05], ['fletcher_cowl', 1, 1, 0.05],
      ['iron_helmet', 1, 1, 0.03]],
    respawn: 60,
  },
  golem: {
    name: 'Ember Golem', glyph: '🗿', hp: 200, atk: 26, arm: 6, xp: 150, step: 750, glow: 1.8,
    loot: [['gold', 20, 60, 0.9], ['golem_core', 1, 1, 0.3], ['iron_helmet', 1, 1, 0.05],
      ['chain_legs', 1, 1, 0.05], ['health_potion', 1, 1, 0.15], ['ember_tome', 1, 1, 0.06],
      ['ember_robe', 1, 1, 0.04], ['mossweave_robe', 1, 1, 0.04]], respawn: 90,
  },
  king: {
    name: 'The Hollow King', glyph: '👹', hp: 1000, atk: 42, arm: 8, xp: 1500, step: 520, boss: true, glow: 3,
    bossMsg: 'The Hollow King crumbles to dust. The caves fall silent... for now.',
    spell: { every: 6000, radius: 3, min: 20, max: 60, name: 'GRAVE FLAME!' },
    loot: [['hollow_crown', 1, 1, 1], ['gold', 200, 400, 1], ['plate_armor', 1, 1, 0.3],
      ['tower_shield', 1, 1, 0.3], ['war_axe', 1, 1, 0.25], ['hollow_staff', 1, 1, 0.3]], respawn: 300,
  },
  // ---- Saltmarsh (lvl 15-25) ----
  toad: {
    name: 'Mire Toad', glyph: '🐸', hp: 150, atk: 20, arm: 2, xp: 90, step: 280, flee: 0.15,
    loot: [['gold', 5, 20, 0.7], ['meat', 1, 1, 0.3], ['health_potion', 1, 1, 0.08],
      ['wader_boots', 1, 1, 0.03]], respawn: 40,
  },
  lurker: {
    name: 'Bog Lurker', glyph: '🐊', hp: 380, atk: 34, arm: 5, xp: 260, step: 500,
    loot: [['gold', 15, 45, 0.8], ['lurker_hide', 1, 1, 0.45], ['bogsteel_helmet', 1, 1, 0.03],
      ['drowned_greaves', 1, 1, 0.02], ['wader_boots', 1, 1, 0.03]], respawn: 45,
  },
  hag: {
    name: 'Fen Hag', glyph: '🧙', hp: 300, atk: 30, arm: 3, xp: 320, step: 450, ranged: 4, keep: 3, glow: 1.5,
    spell: { every: 7000, radius: 3, min: 15, max: 35, name: 'BOG CURSE!', color: '#7ad04a' },
    loot: [['gold', 20, 50, 0.8], ['hag_charm', 1, 1, 0.5], ['great_mana_potion', 1, 1, 0.1],
      ['fenweave_robe', 1, 1, 0.02], ['mire_rod', 1, 1, 0.02], ['tidecaller_wand', 1, 1, 0.02]], respawn: 60,
  },
  drowned: {
    name: 'Drowned Knight', glyph: '🧟', hp: 650, atk: 44, arm: 10, xp: 450, step: 800,
    loot: [['gold', 30, 80, 0.9], ['bogsteel_sword', 1, 1, 0.03], ['drowned_plate', 1, 1, 0.02],
      ['bogsteel_helmet', 1, 1, 0.04], ['great_health_potion', 1, 1, 0.12]], respawn: 75,
  },
  // ---- Sunken Vault (lvl 25+) ----
  wraith: {
    name: 'Silt Wraith', glyph: '👻', hp: 700, atk: 50, arm: 4, xp: 600, step: 450, ranged: 4, keep: 2, glow: 1.5,
    loot: [['gold', 40, 100, 0.9], ['silt_pearl', 1, 1, 0.3], ['great_mana_potion', 1, 1, 0.15],
      ['tidecaller_wand', 1, 1, 0.03], ['mire_rod', 1, 1, 0.03], ['fenwood_bow', 1, 1, 0.03],
      ['fenweave_robe', 1, 1, 0.03]], respawn: 80,
  },
  sentinel: {
    name: 'Vault Sentinel', glyph: '🗿', hp: 1100, atk: 58, arm: 14, xp: 800, step: 700,
    loot: [['gold', 60, 140, 0.9], ['silt_pearl', 1, 1, 0.4], ['sentinel_shield', 1, 1, 0.04],
      ['drowned_plate', 1, 1, 0.04], ['bogsteel_sword', 1, 1, 0.04], ['great_health_potion', 1, 1, 0.2]],
    respawn: 90,
  },
  mother: {
    name: 'The Mother of Silt', glyph: '🐙', hp: 4500, atk: 70, arm: 10, xp: 6000, step: 600, boss: true, glow: 3,
    bossMsg: 'The Mother of Silt sinks into the mud with a long, wet sigh. The vault goes still.',
    spell: { every: 6000, radius: 3, min: 50, max: 120, name: 'SILT TIDE!', color: '#5ab0a8' },
    summon: { every: 15000, type: 'wraith', n: 2, max: 4, name: 'RISE, MY CHILDREN!' },
    loot: [['gold', 600, 1000, 1], ['silt_pearl', 3, 6, 1], ['sentinel_shield', 1, 1, 0.35],
      ['drowned_plate', 1, 1, 0.35], ['fenweave_robe', 1, 1, 0.35], ['fenwood_bow', 1, 1, 0.3],
      ['tidecaller_wand', 1, 1, 0.2], ['mire_rod', 1, 1, 0.2]], respawn: 600,
  },
};

// tier tints the inventory slot. price = shop buy price, sell = what the shop pays.
const ITEMS = {
  gold: { name: 'gold coin', glyph: '🪙', w: 0, stack: true, max: 100000 },
  short_sword: { name: 'short sword', glyph: '🗡️', w: 35, slot: 'weapon', kind: 'melee', atk: 12, sell: 10, tier: 0 },
  iron_sword: { name: 'iron sword', glyph: '🗡️', w: 40, slot: 'weapon', kind: 'melee', atk: 18, price: 300, sell: 90, tier: 1 },
  war_axe: { name: 'war axe', glyph: '🪓', w: 60, slot: 'weapon', kind: 'melee', atk: 26, lvl: 12, price: 1500, sell: 450, tier: 3 },
  hunting_bow: { name: 'hunting bow', glyph: '🏹', w: 30, slot: 'weapon', kind: 'bow', atk: 2, range: 6, two: true, sell: 10, tier: 0 },
  longbow: { name: 'longbow', glyph: '🏹', w: 35, slot: 'weapon', kind: 'bow', atk: 8, range: 6, two: true, lvl: 8, price: 600, sell: 180, tier: 2 },
  arrow: { name: 'arrow', glyph: '➶', w: 0.7, slot: 'ammo', atk: 16, stack: true, max: 100, price: 2, sell: 0 },
  ember_wand: { name: 'ember wand', glyph: '🪄', w: 20, slot: 'weapon', kind: 'wand', dmg: [8, 18], mana: 2, range: 4, voc: ['invoker'], sell: 10, tier: 0 },
  storm_wand: { name: 'storm wand', glyph: '🪄', w: 20, slot: 'weapon', kind: 'wand', dmg: [22, 40], mana: 5, range: 4, voc: ['invoker'], lvl: 10, price: 1200, sell: 350, tier: 2 },
  thorn_rod: { name: 'thorn rod', glyph: '🌿', w: 20, slot: 'weapon', kind: 'wand', dmg: [8, 18], mana: 2, range: 4, voc: ['mender'], sell: 10, tier: 0 },
  briar_rod: { name: 'briar rod', glyph: '🌵', w: 20, slot: 'weapon', kind: 'wand', dmg: [22, 40], mana: 5, range: 4, voc: ['mender'], lvl: 10, price: 1200, sell: 350, tier: 2 },
  wooden_shield: { name: 'wooden shield', glyph: '🛡️', w: 40, slot: 'shield', def: 8, sell: 5, tier: 0 },
  iron_shield: { name: 'iron shield', glyph: '🛡️', w: 60, slot: 'shield', def: 14, price: 250, sell: 75, tier: 1 },
  tower_shield: { name: 'tower shield', glyph: '🛡️', w: 85, slot: 'shield', def: 22, lvl: 10, price: 1200, sell: 400, tier: 3 },
  leather_armor: { name: 'leather armor', glyph: '👕', w: 60, slot: 'armor', arm: 3, sell: 5, tier: 0 },
  chain_armor: { name: 'chain armor', glyph: '🧥', w: 100, slot: 'armor', arm: 6, price: 400, sell: 120, tier: 1 },
  plate_armor: { name: 'plate armor', glyph: '🥋', w: 120, slot: 'armor', arm: 10, lvl: 10, price: 2000, sell: 600, tier: 3 },
  leather_helmet: { name: 'leather helmet', glyph: '🧢', w: 20, slot: 'head', arm: 1, price: 20, sell: 4, tier: 0 },
  iron_helmet: { name: 'iron helmet', glyph: '⛑️', w: 30, slot: 'head', arm: 3, price: 200, sell: 60, tier: 1 },
  leather_legs: { name: 'leather legs', glyph: '👖', w: 18, slot: 'legs', arm: 1, price: 20, sell: 4, tier: 0 },
  chain_legs: { name: 'chain legs', glyph: '👖', w: 35, slot: 'legs', arm: 3, price: 250, sell: 75, tier: 1 },
  leather_boots: { name: 'leather boots', glyph: '👢', w: 9, slot: 'feet', arm: 1, price: 30, sell: 6, tier: 0 },
  // Cloth: little armor, faster mana regen (mreg = mana per 2s tick, mpmax = max mana).
  apprentice_robe: { name: 'apprentice robe', glyph: '🥻', w: 25, slot: 'armor', arm: 1, mreg: 1, voc: ['invoker', 'mender'], price: 150, sell: 40, tier: 1 },
  cloth_hood: { name: 'cloth hood', glyph: '🧣', w: 8, slot: 'head', mreg: 1, voc: ['invoker', 'mender'], price: 60, sell: 15, tier: 1 },
  soft_slippers: { name: 'soft slippers', glyph: '🩴', w: 6, slot: 'feet', mreg: 1, sell: 40, tier: 1 },
  spun_leggings: { name: 'spun leggings', glyph: '👖', w: 12, slot: 'legs', arm: 1, mreg: 1, mpmax: 15, voc: ['invoker', 'mender'], lvl: 5, sell: 120, tier: 2 },
  silk_robe: { name: 'silk robe', glyph: '🥻', w: 22, slot: 'armor', arm: 2, mreg: 2, mpmax: 30, voc: ['invoker', 'mender'], lvl: 8, sell: 250, tier: 2 },
  ember_robe: { name: 'ember robe', glyph: '🥻', bg: '#4a2a10', w: 25, slot: 'armor', arm: 3, mreg: 3, mpmax: 50, voc: ['invoker'], lvl: 12, sell: 700, tier: 3 },
  mossweave_robe: { name: 'mossweave robe', glyph: '🥻', bg: '#173d20', w: 25, slot: 'armor', arm: 3, mreg: 3, mpmax: 50, voc: ['mender'], lvl: 12, sell: 700, tier: 3 },
  fletcher_cowl: { name: "fletcher's cowl", glyph: '🎩', w: 15, slot: 'head', arm: 1, mreg: 1, mpmax: 10, voc: ['ranger'], lvl: 6, sell: 150, tier: 2 },
  // Vocation focus items
  cinder_wand: { name: 'cinder wand', glyph: '🪄', w: 20, slot: 'weapon', kind: 'wand', dmg: [14, 28], mana: 3, range: 4, voc: ['invoker'], lvl: 6, sell: 200, tier: 1 },
  root_rod: { name: 'root rod', glyph: '🌿', w: 20, slot: 'weapon', kind: 'wand', dmg: [14, 28], mana: 3, range: 4, voc: ['mender'], lvl: 6, sell: 200, tier: 1 },
  ember_tome: { name: 'ember tome', glyph: '📕', w: 18, slot: 'shield', def: 4, mreg: 1, mpmax: 20, voc: ['invoker'], lvl: 8, sell: 300, tier: 2 },
  grove_tome: { name: 'grove tome', glyph: '📗', w: 18, slot: 'shield', def: 4, mreg: 1, mpmax: 20, voc: ['mender'], lvl: 8, sell: 300, tier: 2 },
  hollow_staff: { name: 'hollow staff', glyph: '🦯', w: 35, slot: 'weapon', kind: 'wand', dmg: [35, 60], mana: 7, range: 4, mreg: 2, voc: ['invoker', 'mender'], lvl: 15, sell: 1500, tier: 4,
    desc: "Still hums with the Hollow King's cold." },
  ward_amulet: { name: 'amulet of warding', glyph: '📿', w: 4, slot: 'amulet', price: 1500, sell: 300, tier: 3,
    desc: 'Protects your backpack once when you die.' },
  // Bags: use one to permanently grow your backpack to `bag` slots.
  traveler_pack: { name: "traveler's pack", glyph: '🎒', w: 10, bag: 30, price: 400, sell: 0, tier: 1,
    desc: 'Use it to grow your backpack to 30 slots.' },
  delver_pack: { name: "delver's pack", glyph: '🎒', bg: '#3a2a14', w: 10, bag: 40, lvl: 8, price: 1500, sell: 0, tier: 2,
    desc: 'Use it to grow your backpack to 40 slots.' },
  bread: { name: 'bread', glyph: '🍞', w: 5, stack: true, max: 100, food: 120, price: 3, sell: 1 },
  meat: { name: 'meat', glyph: '🍖', w: 13, stack: true, max: 100, food: 180, price: 5, sell: 2 },
  cheese: { name: 'cheese', glyph: '🧀', w: 4, stack: true, max: 100, food: 90, sell: 1 },
  health_potion: { name: 'health potion', glyph: '🧪', bg: '#5a1a1a', w: 2, stack: true, max: 100, heal: [70, 110], price: 45, sell: 10 },
  mana_potion: { name: 'mana potion', glyph: '🧪', bg: '#1a2a5a', w: 2, stack: true, max: 100, restore: [50, 90], price: 50, sell: 10 },
  blaze_rune: { name: 'blaze rune', glyph: '🔥', bg: '#4a2a10', w: 1.2, stack: true, max: 100, rune: 'attack', price: 25, sell: 5 },
  mending_rune: { name: 'mending rune', glyph: '💚', bg: '#173d20', w: 1.2, stack: true, max: 100, rune: 'heal', price: 30, sell: 5 },
  torch: { name: 'torch', glyph: '🕯️', w: 5, stack: true, max: 100, light: 600, price: 10, sell: 1 },
  rat_tail: { name: 'rat tail', glyph: '🐁', w: 1, stack: true, max: 100, sell: 3 },
  wolf_pelt: { name: 'wolf pelt', glyph: '🐾', w: 8, stack: true, max: 100, sell: 15 },
  grub_silk: { name: 'grub silk', glyph: '🕸️', w: 2, stack: true, max: 100, sell: 25 },
  bone: { name: 'bone', glyph: '🦴', w: 5, stack: true, max: 100, sell: 5 },
  golem_core: { name: 'golem core', glyph: '🔶', w: 15, stack: true, max: 100, sell: 90 },
  hollow_crown: { name: 'hollow crown', glyph: '👑', w: 20, sell: 2500, tier: 4,
    desc: 'Taken from the Hollow King himself.' },
  // ---- Saltmarsh & Sunken Vault ----
  lurker_hide: { name: 'lurker hide', glyph: '🟫', w: 10, stack: true, max: 100, sell: 40 },
  hag_charm: { name: 'hag charm', glyph: '🧿', w: 1, stack: true, max: 100, sell: 30 },
  silt_pearl: { name: 'silt pearl', glyph: '⚪', w: 1, stack: true, max: 100, sell: 150 },
  bogsteel_sword: { name: 'bogsteel sword', glyph: '⚔️', w: 50, slot: 'weapon', kind: 'melee', atk: 32, lvl: 20, sell: 900, tier: 3 },
  fenwood_bow: { name: 'fenwood bow', glyph: '🏹', bg: '#2a3a20', w: 32, slot: 'weapon', kind: 'bow', atk: 12, range: 6, two: true, lvl: 20, sell: 900, tier: 3 },
  barbed_arrow: { name: 'barbed arrow', glyph: '➶', bg: '#3a2a20', w: 0.8, slot: 'ammo', atk: 24, stack: true, max: 100, price: 6, sell: 0 },
  tidecaller_wand: { name: 'tidecaller wand', glyph: '🪄', bg: '#1a3a4a', w: 20, slot: 'weapon', kind: 'wand', dmg: [40, 70], mana: 8, range: 4, voc: ['invoker'], lvl: 20, sell: 1100, tier: 3 },
  mire_rod: { name: 'mire rod', glyph: '🌿', bg: '#1a3a2a', w: 20, slot: 'weapon', kind: 'wand', dmg: [40, 70], mana: 8, range: 4, voc: ['mender'], lvl: 20, sell: 1100, tier: 3 },
  fenweave_robe: { name: 'fenweave robe', glyph: '🥻', bg: '#2a3a2a', w: 24, slot: 'armor', arm: 4, mreg: 4, mpmax: 80, voc: ['invoker', 'mender'], lvl: 20, sell: 1200, tier: 3 },
  drowned_plate: { name: 'drowned plate', glyph: '🥋', bg: '#1d3a40', w: 125, slot: 'armor', arm: 12, lvl: 20, sell: 1300, tier: 3 },
  sentinel_shield: { name: 'sentinel shield', glyph: '🛡️', bg: '#2a3040', w: 90, slot: 'shield', def: 28, lvl: 22, sell: 1300, tier: 3 },
  bogsteel_helmet: { name: 'bogsteel helmet', glyph: '⛑️', bg: '#2a3a30', w: 32, slot: 'head', arm: 5, lvl: 18, sell: 500, tier: 2 },
  drowned_greaves: { name: 'drowned greaves', glyph: '👖', bg: '#1d3a40', w: 38, slot: 'legs', arm: 5, lvl: 18, sell: 500, tier: 2 },
  wader_boots: { name: 'wader boots', glyph: '🥾', w: 12, slot: 'feet', arm: 2, wade: 1, price: 800, sell: 200, tier: 2,
    desc: 'Walk through bog and mud at full speed.' },
  great_health_potion: { name: 'great health potion', glyph: '🧪', bg: '#7a1010', w: 3, stack: true, max: 100, heal: [160, 240], price: 110, sell: 25 },
  great_mana_potion: { name: 'great mana potion', glyph: '🧪', bg: '#10207a', w: 3, stack: true, max: 100, restore: [120, 200], price: 120, sell: 25 },
  tear_of_silt: { name: 'tear of silt', glyph: '💧', w: 4, slot: 'amulet', mreg: 3, mpmax: 60, sell: 3000, tier: 4,
    desc: 'All that was left of the Mother of Silt.' },
};

const TIER_COLORS = ['#2a2620', '#1f3a24', '#1d2c48', '#3a2048', '#4a3410'];

// hp/mana/cap are per-level gains. regen is per 2s while fed. mul = skill-training multipliers.
const VOCATIONS = {
  warden: {
    name: 'Warden', color: '#b8473a', hp: 15, mana: 5, cap: 25, regen: { hp: 3, mana: 1 },
    mul: { melee: 1.1, distance: 1.4, shielding: 1.1, magic: 3.0 },
    desc: 'Heavy melee fighter. Most health, trains sword and shield fast.',
    gear: { weapon: 'short_sword', shield: 'wooden_shield', armor: 'leather_armor', legs: 'leather_legs' },
    pack: [['bread', 5], ['health_potion', 3], ['torch', 2], ['gold', 20]],
    hotkeys: ['vita lux', 'vis ruptor', 'item:health_potion', 'item:mana_potion', 'item:blaze_rune'],
  },
  ranger: {
    name: 'Ranger', color: '#4f8a3a', hp: 10, mana: 15, cap: 20, regen: { hp: 2, mana: 2 },
    mul: { melee: 1.2, distance: 1.1, shielding: 1.1, magic: 1.4 },
    desc: 'Kills from range with bow and arrows. Conjures arrows, slips into the shadows. Balanced health and mana.',
    gear: { weapon: 'hunting_bow', ammo: ['arrow', 80], armor: 'leather_armor', head: 'leather_helmet' },
    pack: [['bread', 5], ['health_potion', 3], ['torch', 2], ['gold', 20]],
    hotkeys: ['vita lux', 'arcus vis', 'item:health_potion', 'item:mana_potion', 'panis', 'sagitta', 'umbra',
      'saltus', 'arcus ictus'],
  },
  invoker: {
    name: 'Invoker', color: '#7a4bc2', hp: 5, mana: 30, cap: 10, regen: { hp: 1, mana: 4 },
    mul: { melee: 2.0, distance: 2.0, shielding: 1.5, magic: 1.1 },
    desc: 'Fragile fire caster. Huge mana pool and the strongest attack spells.',
    gear: { weapon: 'ember_wand', shield: 'wooden_shield', armor: 'leather_armor' },
    pack: [['bread', 5], ['mana_potion', 4], ['health_potion', 1], ['torch', 2], ['gold', 20]],
    hotkeys: ['vita lux', 'ignis', 'ignis orbis', 'item:mana_potion', 'item:health_potion', 'fulgur',
      'ignis unda', 'ignis magna', 'arcanum scutum'],
  },
  mender: {
    name: 'Mender', color: '#3a8a8a', hp: 5, mana: 30, cap: 10, regen: { hp: 1, mana: 4 },
    mul: { melee: 1.8, distance: 1.8, shielding: 1.5, magic: 1.1 },
    desc: 'Earth caster and healer. Best healing spells and can conjure food.',
    gear: { weapon: 'thorn_rod', shield: 'wooden_shield', armor: 'leather_armor' },
    pack: [['bread', 5], ['mana_potion', 4], ['health_potion', 1], ['torch', 2], ['gold', 20]],
    hotkeys: ['vita lux', 'vita magna', 'terra spina', 'item:mana_potion', 'item:health_potion'],
  },
};

// Spells are cast by typing the words in chat (or via hotkeys).
const SPELLS = [
  { words: 'vita lux', name: 'Light Healing', mana: 20, lvl: 1, cd: 1000, kind: 'heal', f: [8, 1.4, 20, 1.8] },
  { words: 'vita magna', name: 'Greater Healing', mana: 70, lvl: 8, cd: 1000, kind: 'heal', voc: ['mender'], f: [30, 3.0, 60, 5.6] },
  { words: 'lumen', name: 'Light', mana: 20, lvl: 1, cd: 2000, kind: 'light', secs: 180 },
  { words: 'vigor', name: 'Haste', mana: 40, lvl: 3, cd: 2000, kind: 'haste', secs: 30 },
  { words: 'panis', name: 'Conjure Bread', mana: 40, lvl: 2, cd: 2000, kind: 'food', voc: ['mender', 'ranger'] },
  { words: 'ignis', name: 'Fire Strike', mana: 20, lvl: 2, cd: 2000, kind: 'strike', range: 4, voc: ['invoker', 'mender'], f: [8, 1.2, 16, 2.0], color: '#ff7a1a' },
  { words: 'terra spina', name: 'Thorn Strike', mana: 20, lvl: 4, cd: 2000, kind: 'strike', range: 4, voc: ['mender'], f: [10, 1.3, 18, 2.1], color: '#6ad04a' },
  { words: 'ignis orbis', name: 'Fire Ring', mana: 90, lvl: 8, cd: 4000, kind: 'area', radius: 2, voc: ['invoker'], f: [15, 1.5, 30, 3.0], color: '#ff5a10' },
  { words: 'fulgur', name: 'Lightning Bolt', mana: 30, lvl: 5, cd: 2000, kind: 'strike', range: 5, voc: ['invoker'], f: [12, 1.5, 22, 2.4], color: '#bfe4ff' },
  { words: 'runa ignis', name: 'Conjure Blaze Runes', mana: 100, lvl: 6, cd: 2000, kind: 'conjure', item: 'blaze_rune', count: 3, voc: ['invoker'] },
  { words: 'ignis unda', name: 'Flame Wave', mana: 80, lvl: 10, cd: 4000, kind: 'wave', depth: 4, voc: ['invoker'], f: [18, 1.6, 34, 3.0], color: '#ff6a1a' },
  { words: 'ignis magna', name: 'Great Fireball', mana: 60, lvl: 12, cd: 2000, kind: 'strike', range: 4, voc: ['invoker'], f: [25, 2.2, 45, 3.6], color: '#ff4a10' },
  { words: 'arcanum scutum', name: 'Mana Shield', mana: 50, lvl: 14, cd: 2000, kind: 'mshield', secs: 180, voc: ['invoker'] },
  { words: 'portus', name: 'Shop Portal', mana: 60, lvl: 6, cd: 10000, kind: 'portal', voc: ['invoker'] },
  { words: 'ignis pluvia', name: 'Firestorm', mana: 220, lvl: 20, cd: 6000, kind: 'area', radius: 3, voc: ['invoker'], f: [30, 2.0, 60, 4.0], color: '#ff3a00' },
  { words: 'vis ruptor', name: 'Cleave', mana: 50, lvl: 5, cd: 4000, kind: 'cleave', voc: ['warden'] },
  { words: 'arcus vis', name: 'Spirit Arrow', mana: 25, lvl: 5, cd: 2000, kind: 'pierce', range: 5, voc: ['ranger'], color: '#d0f0ff' },
  // Ranger kit. shot/snare fire a real arrow from your bow; cloak drains 1 mana/s until you attack or recast.
  { words: 'sagitta', name: 'Conjure Arrows', mana: 35, lvl: 2, cd: 2000, kind: 'conjure', item: 'arrow', count: 15, voc: ['ranger'] },
  { words: 'umbra', name: 'Cloak', mana: 20, lvl: 6, cd: 2000, kind: 'cloak', voc: ['ranger'] },
  { words: 'saltus', name: 'Disengage', mana: 30, lvl: 7, cd: 6000, kind: 'leap', voc: ['ranger'] },
  { words: 'arcus ictus', name: 'Power Shot', mana: 40, lvl: 8, cd: 4000, kind: 'shot', mult: 1.8, voc: ['ranger'], color: '#ffe8a0' },
  { words: 'venator', name: "Hunter's Focus", mana: 60, lvl: 10, cd: 2000, kind: 'focus', secs: 30, voc: ['ranger'] },
  { words: 'arcus nodus', name: 'Snare Shot', mana: 50, lvl: 12, cd: 6000, kind: 'snare', mult: 1.0, slow: 5000, voc: ['ranger'], color: '#9ad87a' },
  { words: 'sagitta magna', name: 'Conjure Barbed Arrows', mana: 80, lvl: 14, cd: 2000, kind: 'conjure', item: 'barbed_arrow', count: 10, voc: ['ranger'] },
  // Taught by Wend in the Saltmarsh (quest flag 'marsh_rite'). stat = area damage from a weapon skill.
  { words: 'vis tremor', name: 'Earthquake', mana: 120, lvl: 20, cd: 4000, kind: 'area', radius: 2, stat: 'melee', voc: ['warden'], quest: 'marsh_rite', color: '#c8a060' },
  { words: 'arcus pluvia', name: 'Arrow Rain', mana: 110, lvl: 20, cd: 4000, kind: 'area', radius: 2, stat: 'distance', voc: ['ranger'], quest: 'marsh_rite', color: '#d0f0ff' },
  { words: 'tempestas', name: 'Tempest', mana: 110, lvl: 20, cd: 2000, kind: 'strike', range: 5, voc: ['invoker'], quest: 'marsh_rite', f: [40, 2.6, 70, 4.2], color: '#8ad8ff' },
  { words: 'terra unda', name: 'Earth Wave', mana: 90, lvl: 20, cd: 4000, kind: 'wave', depth: 4, voc: ['mender'], quest: 'marsh_rite', f: [22, 1.8, 40, 3.2], color: '#6ad04a' },
];

// NPC dialog: keyword -> reply. [brackets] mark keywords. Special keys handled in ui.js.
const NPCS = {
  priestess: {
    name: 'Sister Vell', color: '#e8e0c8',
    dialog: {
      hi: 'Peace be with you, {name}. I can [heal] you, or tell you about [death] and [vocations].',
      heal: '@heal',
      death: 'If you fall, you wake at this altar. But you lose some experience, and your backpack stays where you fell. An [amulet] of warding protects it.',
      amulet: 'Odran sells them. Wear it around your neck.',
      vocations: 'Wardens fight up close, Rangers shoot from afar, Invokers burn, and Menders heal. Each trains differently.',
      spells: 'Speak the words aloud. "vita lux" heals everyone. "lumen" lights the dark. "vigor" quickens your step.',
      saltmarsh: 'The road east leads to the Saltmarsh. Captain Maren keeps an outpost there. Strong hunters go.',
      bye: 'Go in light, {name}.',
    },
  },
  merchant: {
    name: 'Odran', color: '#c8a060', trader: true,
    dialog: {
      hi: 'Welcome, {name}! Say [trade] to see my wares. I buy loot too. The [depot] chest keeps your things safe. I might have a [task] for you, too.',
      trade: '@trade',
      task: '@quest',
      quest: '@quest',
      depot: 'Anything in the depot chest stays safe even if you die. Just walk up and click it.',
      road: 'Follow the dirt road east out of town. It ends at the Saltmarsh outpost.',
      bye: 'Come back with gold!',
    },
  },
  hermit: {
    name: 'Old Brann', color: '#a0a090',
    dialog: {
      hi: 'Hm. Another one. That hole leads to the [caves]. Bring a [torch].',
      caves: 'Grubs and bone archers on the first level. Deeper still, golems... and the [king].',
      king: 'The Hollow King sits in the deepest hall. Bring potions. Lots of potions. And if you take his [crown], bring it to me.',
      crown: '@quest',
      quest: '@quest',
      task: '@quest',
      seal: 'Under the King\'s hall is a hole sealed with cold iron. Something old sleeps below it. The crown is the key.',
      torch: 'It\'s dark down there. Light a torch from your backpack, or say "lumen" if you know magic.',
      bye: 'Don\'t die. Or do, it\'s your hide.',
    },
  },
  captain: {
    name: 'Captain Maren', color: '#5a7a9a',
    dialog: {
      hi: 'Saltmarsh outpost. State your business, {name}. If you can fight, I have a [task] for you. Mind the [bog].',
      task: '@quest',
      quest: '@quest',
      bog: 'Bog water slows you to a crawl. Stick to the boardwalks, or get wader boots from Wend.',
      marsh: 'Toads near the walls, lurkers in the reeds, hags and drowned knights out east. It gets worse the further you go.',
      vault: 'Brann says there is a vault under the King\'s hall. If you get in, kill whatever lives there.',
      bye: 'Keep your blade dry.',
    },
  },
  herbalist: {
    name: 'Wend', color: '#8aa060', trader: true,
    shop: ['bread', 'meat', 'torch', 'arrow', 'barbed_arrow', 'health_potion', 'mana_potion',
      'great_health_potion', 'great_mana_potion', 'mending_rune', 'blaze_rune', 'wader_boots'],
    dialog: {
      hi: 'Oh! A visitor. I brew things. Say [trade] if you need potions. I could also teach you a [rite].',
      trade: '@trade',
      rite: 'Every fighter has one marsh rite in them. Bring me hag charms and I will draw it out. Ask for a [task].',
      task: '@quest',
      quest: '@quest',
      bye: 'Mind the hags. They bite.',
    },
  },
};

// Quests are offered by `npc` when you say "quest"/"task". type: 'fetch' (bring n of item) or 'kill'.
// req = another quest that must be done first. reward: { xp, gold, items: [[id, n]], flag }.
const QUESTS = {
  hollow_crown: {
    npc: 'hermit', name: 'The Hollow Crown', type: 'fetch', item: 'hollow_crown', n: 1,
    reward: { xp: 2000, flag: 'vault' },
    offer: 'The King\'s crown is the key to the [seal] under his hall. Bring it to me and I\'ll break it.',
    progress: 'No crown, no seal.',
    done: 'There. The seal is broken. Whatever is down there is awake now. Your problem.',
  },
  silk_loom: {
    npc: 'merchant', name: 'Silk for the Loom', type: 'fetch', item: 'grub_silk', n: 15,
    reward: { gold: 800, items: [['great_health_potion', 3]] },
    offer: 'My weaver wants grub silk. Bring me 15 and I\'ll pay well.',
    progress: 'Still need that silk.',
    done: 'Lovely, lovely. Here, gold and something for the road.',
  },
  bog_clearing: {
    npc: 'captain', name: 'Bog Clearing', type: 'kill', creature: 'lurker', n: 20,
    reward: { xp: 3000, gold: 1000 },
    offer: 'Bog lurkers keep dragging off my scouts. Kill 20 of them.',
    progress: 'The lurkers are still out there.',
    done: 'Good work. The reeds are quieter. Here is your pay.',
  },
  hag_charms: {
    npc: 'herbalist', name: 'Hag Charms', type: 'fetch', item: 'hag_charm', n: 8,
    reward: { xp: 2500, flag: 'marsh_rite' },
    offer: 'Bring me 8 hag charms from the fen hags. I will use them to teach you your rite.',
    progress: 'I need more charms.',
    done: 'Hold still... there. You know your marsh rite now. It needs level 20 to cast.',
  },
  mother_silt: {
    npc: 'captain', name: 'The Mother of Silt', type: 'kill', creature: 'mother', n: 1, req: 'hollow_crown',
    reward: { xp: 6000, items: [['tear_of_silt', 1]] },
    offer: 'Brann broke the seal. Scouts say something huge lives in that vault. They call it the Mother of Silt. Kill it.',
    progress: 'The Mother of Silt still lives.',
    done: 'You actually did it. Take this. It was found where she fell.',
    locked: 'Talk to Old Brann in Deepvale about the King\'s crown first. Then come back.',
  },
};

const SHOP = {
  sells: ['bread', 'meat', 'torch', 'arrow', 'health_potion', 'mana_potion', 'blaze_rune', 'mending_rune',
    'leather_helmet', 'leather_legs', 'leather_boots', 'iron_sword', 'iron_shield', 'chain_armor',
    'iron_helmet', 'chain_legs', 'longbow', 'storm_wand', 'briar_rod', 'war_axe', 'tower_shield',
    'plate_armor', 'ward_amulet', 'apprentice_robe', 'cloth_hood', 'traveler_pack', 'delver_pack'],
};
