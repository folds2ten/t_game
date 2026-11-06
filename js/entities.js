// entities.js — player, creatures, NPCs, inventory, movement and pathfinding.
'use strict';

const PACK_SLOTS = 20;
const HOTKEY_SLOTS = 9;
const SLOTS = ['amulet', 'head', 'armor', 'weapon', 'shield', 'legs', 'feet', 'ammo'];
const DIRS8 = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];

let player = null;
const creatures = [];
const npcs = [];
let nextId = 1;

function randInt(a, b) {
  return Math.floor(a + Math.random() * (b - a + 1));
}

// ---------- Player ----------

function newPlayer(name, voc) {
  const v = VOCATIONS[voc];
  const p = {
    name, voc, level: 1, xp: 0,
    x: TEMPLE.x, y: TEMPLE.y, z: TEMPLE.z,
    skills: {
      melee: { lvl: 10, tries: 0 }, distance: { lvl: 10, tries: 0 },
      shielding: { lvl: 10, tries: 0 }, magic: { lvl: 0, tries: 0 },
    },
    equip: {}, pack: [], depot: [], packSlots: PACK_SLOTS, portal: null,
    food: 300, lumen: 0, torch: 0, haste: 0,
    hotkeys: v.hotkeys.slice(),
    chase: voc === 'warden',
    kills: 0, deaths: 0,
  };
  for (const [slot, id] of Object.entries(v.gear)) {
    p.equip[slot] = Array.isArray(id) ? { id: id[0], count: id[1] } : { id, count: 1 };
  }
  for (const [id, n] of v.pack) addToStacks(p.pack, id, n, PACK_SLOTS);
  p.hp = maxHp(p);
  p.mana = maxMana(p);
  return p;
}

function hydratePlayer(p) {
  // transient runtime fields
  Object.assign(p, {
    kind: 'player', fromX: p.x, fromY: p.y, moveStart: 0, moveDur: 0, dir: 2,
    target: null, attackAt: 0, cd: {}, exhaust: 0, potionEx: 0, path: null, pending: null,
    talking: null, regenAt: 0, secAt: 0, dead: false, justMoved: false,
  });
  // additive fields for older saves
  p.hotkeys = Array.isArray(p.hotkeys) ? p.hotkeys.slice(0, HOTKEY_SLOTS) : [];
  while (p.hotkeys.length < HOTKEY_SLOTS) p.hotkeys.push(null);
  p.mshield = p.mshield || 0;
  p.packSlots = p.packSlots || PACK_SLOTS;
  p.portal = p.portal || null;
  p.quests = p.quests && typeof p.quests === 'object' ? p.quests : {};
  p.flags = Array.isArray(p.flags) ? p.flags : [];
  p.explored = p.explored && typeof p.explored === 'object' ? p.explored : {};
  return p;
}

function hasFlag(p, flag) { return p.flags.includes(flag); }

function maxHp(p) { return 150 + (p.level - 1) * VOCATIONS[p.voc].hp; }
function maxMana(p) { return 50 + (p.level - 1) * VOCATIONS[p.voc].mana + gearBonus(p, 'mpmax'); }
function maxCap(p) { return 400 + (p.level - 1) * VOCATIONS[p.voc].cap; }
function playerSpeed(p) { return (220 + 2 * (p.level - 1)) * (p.haste > 0 ? 1.35 : 1); }
function lightRadius(p) { return Math.max(1.6, p.lumen > 0 ? 6 : 0, p.torch > 0 ? 4.5 : 0); }

// ---------- Inventory ----------

function packSlots(p) { return p.packSlots || PACK_SLOTS; }

function addToStacks(list, id, count, slotLimit) {
  const def = ITEMS[id];
  let left = count;
  if (def.stack) {
    for (const s of list) {
      if (left <= 0) break;
      if (s.id === id && s.count < def.max) {
        const add = Math.min(def.max - s.count, left);
        s.count += add; left -= add;
      }
    }
    while (left > 0 && list.length < slotLimit) {
      const add = Math.min(def.max, left);
      list.push({ id, count: add }); left -= add;
    }
  } else {
    while (left > 0 && list.length < slotLimit) { list.push({ id, count: 1 }); left--; }
  }
  return left;
}

function countIn(list, id) {
  return list.reduce((n, s) => n + (s.id === id ? s.count : 0), 0);
}

function removeFrom(list, id, count) {
  let left = count;
  for (let i = list.length - 1; i >= 0 && left > 0; i--) {
    if (list[i].id !== id) continue;
    const take = Math.min(list[i].count, left);
    list[i].count -= take; left -= take;
    if (list[i].count <= 0) list.splice(i, 1);
  }
  return count - left;
}

function slotsNeeded(list, id, count) {
  const def = ITEMS[id];
  if (!def.stack) return count;
  let room = 0;
  for (const s of list) if (s.id === id) room += def.max - s.count;
  return Math.max(0, Math.ceil((count - room) / def.max));
}

function carriedWeight(p) {
  let w = 0;
  for (const s of p.pack) w += ITEMS[s.id].w * s.count;
  for (const s of Object.values(p.equip)) if (s) w += ITEMS[s.id].w * s.count;
  return w;
}

function freeCap(p) { return maxCap(p) - carriedWeight(p); }

// Returns '' on success or a reason string.
function canTake(p, id, count) {
  if (ITEMS[id].w * count > freeCap(p) + 1e-6) return 'You do not have enough capacity.';
  if (p.pack.length + slotsNeeded(p.pack, id, count) > packSlots(p)) return 'Your backpack is full.';
  return '';
}

function giveOrDrop(p, id, count) {
  if (!canTake(p, id, count)) { addToStacks(p.pack, id, count, packSlots(p)); return true; }
  dropPile(p.x, p.y, p.z, [{ id, count }]);
  log(`You cannot carry the ${ITEMS[id].name}. It falls to the ground.`, 'warn');
  return false;
}

function dropPile(x, y, z, items, opts = {}) {
  const existing = !opts.kind && world.piles.find((pl) => pl.kind === 'pile' && pl.x === x && pl.y === y && pl.z === z);
  if (existing) {
    for (const it of items) addToStacks(existing.items, it.id, it.count, 40);
    existing.expires = Date.now() + 300000;
    return existing;
  }
  const pile = {
    id: nextId++, x, y, z, items: items.map((i) => ({ ...i })), kind: opts.kind || 'pile',
    name: opts.name || 'items', glyph: opts.glyph || null, born: Date.now(),
    expires: opts.expires === undefined ? Date.now() + 300000 : opts.expires,
  };
  world.piles.push(pile);
  return pile;
}

function pileAt(x, y, z) {
  for (let i = world.piles.length - 1; i >= 0; i--) {
    const pl = world.piles[i];
    if (pl.x === x && pl.y === y && pl.z === z) return pl;
  }
  return null;
}

// ---------- Creatures & NPCs ----------

function spawnCreature(sp) {
  const def = CREATURES[sp.type];
  const c = {
    id: nextId++, kind: 'creature', type: sp.type, def, hp: def.hp, maxHp: def.hp,
    x: sp.x, y: sp.y, z: sp.z, fromX: sp.x, fromY: sp.y, moveStart: 0, moveDur: 0, dir: 2,
    sp, nextThink: 0, attackAt: performance.now() + 1000, spellAt: performance.now() + 3000, hitFlash: 0,
    summonAt: performance.now() + 8000,
  };
  creatures.push(c);
  sp.creature = c;
  return c;
}

function spawnNpcs() {
  npcs.length = 0;
  for (const s of world.npcSpots) {
    const def = NPCS[s.key];
    npcs.push({
      id: nextId++, kind: 'npc', key: s.key, def, name: def.name, x: s.x, y: s.y, z: s.z,
      home: { x: s.x, y: s.y }, fromX: s.x, fromY: s.y, moveStart: 0, moveDur: 0, dir: 2, nextThink: 0,
    });
  }
}

function entityAt(x, y, z) {
  if (player && !player.dead && player.x === x && player.y === y && player.z === z) return player;
  for (const c of creatures) if (c.x === x && c.y === y && c.z === z) return c;
  for (const n of npcs) if (n.x === x && n.y === y && n.z === z) return n;
  return null;
}

function canEnter(x, y, z) {
  return isWalkableTile(x, y, z) && !entityAt(x, y, z);
}

// ---------- Movement ----------

function isMoving(e, now) {
  return now < e.moveStart + e.moveDur;
}

function dirIndex(dx, dy) {
  if (dy < 0 && dx === 0) return 0;
  if (dx > 0 && dy === 0) return 1;
  if (dy > 0 && dx === 0) return 2;
  if (dx < 0 && dy === 0) return 3;
  return dx > 0 ? 1 : 3;
}

function stepEntity(e, dx, dy, now, baseMs) {
  const nx = e.x + dx;
  const ny = e.y + dy;
  if (!canEnter(nx, ny, e.z)) return false;
  if (e.kind === 'creature' && isSafeTile(nx, ny, e.z)) return false;
  const diag = dx !== 0 && dy !== 0 ? 1.45 : 1;
  const td = tileDef(nx, ny, e.z);
  const wading = e === player && (td.bog || td.name === 'mud') && gearBonus(player, 'wade') > 0;
  const cost = wading ? 1 : (td.cost || 1);
  e.fromX = e.x; e.fromY = e.y;
  e.x = nx; e.y = ny;
  e.moveStart = now;
  e.moveDur = baseMs * cost * diag;
  e.dir = dirIndex(dx, dy);
  return true;
}

function playerStepMs(p) {
  return 260 * (220 / playerSpeed(p));
}

function renderPos(e, now) {
  if (!e.moveDur) return { x: e.x, y: e.y };
  const t = Math.min(1, Math.max(0, (now - e.moveStart) / e.moveDur));
  return { x: e.fromX + (e.x - e.fromX) * t, y: e.fromY + (e.y - e.fromY) * t };
}

function placeAt(e, x, y, z) {
  e.x = x; e.y = y; e.z = z; e.fromX = x; e.fromY = y; e.moveDur = 0;
}

// BFS over 8 directions. goal(x, y) decides arrival. Returns list of [x, y] steps or null.
function findPath(sx, sy, z, goal, maxNodes = 900, ignoreBlocker = null) {
  if (goal(sx, sy)) return [];
  const key = (x, y) => y * MAP_W + x;
  const prev = new Map([[key(sx, sy), null]]);
  const q = [[sx, sy]];
  let qi = 0;
  while (qi < q.length && prev.size < maxNodes) {
    const [x, y] = q[qi++];
    for (const [dx, dy] of DIRS8) {
      const nx = x + dx;
      const ny = y + dy;
      const k = key(nx, ny);
      if (prev.has(k)) continue;
      if (!isWalkableTile(nx, ny, z)) continue;
      const occ = entityAt(nx, ny, z);
      const isGoal = goal(nx, ny);
      if (occ && occ !== ignoreBlocker && !isGoal) continue;
      prev.set(k, [x, y]);
      if (isGoal) {
        if (occ && occ !== ignoreBlocker) { return pathBack(prev, x, y, key); }
        return pathBack(prev, nx, ny, key);
      }
      q.push([nx, ny]);
    }
  }
  return null;
}

function pathBack(prev, x, y, key) {
  const out = [];
  let cur = [x, y];
  while (cur) {
    out.push(cur);
    cur = prev.get(key(cur[0], cur[1]));
  }
  out.pop(); // start tile
  return out.reverse();
}

function stepAwayFrom(e, from, now, ms) {
  let best = null;
  let bestD = dist(e, from);
  for (const [dx, dy] of DIRS8) {
    const nx = e.x + dx;
    const ny = e.y + dy;
    if (!canEnter(nx, ny, e.z)) continue;
    const d = Math.max(Math.abs(nx - from.x), Math.abs(ny - from.y));
    if (d > bestD) { bestD = d; best = [dx, dy]; }
  }
  return best ? stepEntity(e, best[0], best[1], now, ms) : false;
}

function creatureThink(c, now) {
  if (isMoving(c, now) || now < c.nextThink) return;
  const def = c.def;
  const p = player;
  const sameFloor = p && !p.dead && p.z === c.z && !isSafeTile(p.x, p.y, p.z);
  const d = sameFloor ? dist(c, p) : 99;
  const fromSpawn = Math.max(Math.abs(c.x - c.sp.x), Math.abs(c.y - c.sp.y));
  c.nextThink = now + 120;

  if (d <= 7 && fromSpawn < 14) {
    if (def.flee && c.hp < c.maxHp * def.flee) { stepAwayFrom(c, p, now, def.step * 1.2); return; }
    if (def.ranged) {
      const los = lineOfSight(c.x, c.y, p.x, p.y, c.z);
      if (d < def.keep) { if (stepAwayFrom(c, p, now, def.step)) return; }
      if (d <= def.ranged && los) return;
    } else if (d <= 1) {
      return;
    }
    const path = findPath(c.x, c.y, c.z, (x, y) => x === p.x && y === p.y, 500);
    if (path && path.length > 0) {
      const [nx, ny] = path[0];
      if (!(nx === p.x && ny === p.y)) stepEntity(c, nx - c.x, ny - c.y, now, def.step);
    }
    return;
  }
  // idle: drift back home or wander
  c.nextThink = now + 800 + Math.random() * 1800;
  if (fromSpawn > 4) {
    const path = findPath(c.x, c.y, c.z, (x, y) => x === c.sp.x && y === c.sp.y, 600);
    if (path && path.length) stepEntity(c, path[0][0] - c.x, path[0][1] - c.y, now, def.step * 1.3);
    return;
  }
  const [dx, dy] = DIRS8[Math.floor(Math.random() * 4)];
  stepEntity(c, dx, dy, now, def.step * 1.3);
}

function npcThink(n, now) {
  if (isMoving(n, now) || now < n.nextThink) return;
  n.nextThink = now + 3000 + Math.random() * 4000;
  if (player && player.talking === n) return;
  const [dx, dy] = DIRS8[Math.floor(Math.random() * 4)];
  const nx = n.x + dx;
  const ny = n.y + dy;
  if (Math.abs(nx - n.home.x) <= 1 && Math.abs(ny - n.home.y) <= 1) stepEntity(n, dx, dy, now, 500);
}

function updateSpawns(now) {
  for (const sp of world.spawnPoints) {
    if (sp.creature) continue;
    if (now < sp.respawnAt) continue;
    const near = player && player.z === sp.z && dist(player, sp) <= 8;
    if (near && sp.respawnAt !== 0) continue;
    if (entityAt(sp.x, sp.y, sp.z)) continue;
    spawnCreature(sp);
  }
}
