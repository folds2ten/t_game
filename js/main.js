// main.js — boot, game loop, input, interaction and save/load.
'use strict';

const KEY_DIRS = {
  arrowup: [0, -1], arrowdown: [0, 1], arrowleft: [-1, 0], arrowright: [1, 0],
  w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
  q: [-1, -1], e: [1, -1], z: [-1, 1], c: [1, 1],
};
const held = [];
let canvas;
let ctx;
let lastSecond = 0;
let lastSave = 0;
let lastMap = 0;

// ---------- Save / load ----------

const SAVED_FIELDS = ['name', 'voc', 'level', 'xp', 'hp', 'mana', 'x', 'y', 'z', 'skills', 'equip', 'pack', 'depot',
  'food', 'lumen', 'torch', 'haste', 'mshield', 'hotkeys', 'chase', 'kills', 'deaths', 'packSlots', 'portal',
  'quests', 'flags', 'explored', 'focus', 'lastAmmo'];

function saveGame() {
  if (!player) return;
  const now = performance.now();
  // Dead spawn points and their remaining respawn seconds, so a reload can't instantly revive a boss.
  const spawns = [];
  world.spawnPoints.forEach((sp, i) => {
    if (!sp.creature && sp.respawnAt > now) spawns.push({ i, t: sp.type, left: Math.ceil((sp.respawnAt - now) / 1000) });
  });
  const data = { v: 1, player: {}, bags: world.piles.filter((p) => p.kind === 'bag'), spawns };
  for (const k of SAVED_FIELDS) data.player[k] = player[k];
  if (player.dead) Object.assign(data.player, { x: TEMPLE.x, y: TEMPLE.y, z: TEMPLE.z, hp: maxHp(player), mana: maxMana(player) });
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { /* storage unavailable */ }
}

function readSave() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { return null; }
}

// ---------- Boot ----------

function restoreSpawnTimers(spawns) {
  const now = performance.now();
  for (const s of spawns) {
    const sp = world.spawnPoints[s.i];
    if (!sp || sp.type !== s.t) continue;
    if (sp.creature) {
      const i = creatures.indexOf(sp.creature);
      if (i >= 0) creatures.splice(i, 1);
      sp.creature = null;
    }
    sp.respawnAt = now + s.left * 1000;
  }
}

function startGame(p, bags = [], spawns = []) {
  player = hydratePlayer(p);
  if (!isWalkableTile(p.x, p.y, p.z) || p.hp <= 0) {
    Object.assign(p, { x: TEMPLE.x, y: TEMPLE.y, z: TEMPLE.z, hp: maxHp(p), mana: maxMana(p) });
  }
  placeAt(p, p.x, p.y, p.z);
  for (const b of bags) world.piles.push({ ...b, id: nextId++ });
  restoreSpawnTimers(spawns);
  $('start').classList.add('hidden');
  $('game').classList.remove('hidden');
  log(`Welcome to Deepvale, ${esc(p.name)}.`, 'adv');
  log('Move with WASD / arrows (QEZC diagonals) or click the ground. Click a creature to attack it.', 'dim');
  log('Press Enter to talk. Say <span class="kw">hi</span> near people, or speak spell words like <span class="kw">vita lux</span>.', 'dim');
  log('Keys 1–9 fire your hotkeys. Right-click a hotkey to change what is on it.', 'dim');
  ui.dirty = true;
  saveGame();
}

function showStart() {
  const save = readSave();
  const cont = $('continue');
  if (save && save.player) {
    const sp = save.player;
    cont.innerHTML = `<button id="btn-continue">Continue as ${esc(sp.name)} — level ${sp.level} ${VOCATIONS[sp.voc].name}</button>
      <p class="dim">Creating a new character below replaces this save.</p>`;
    $('btn-continue').onclick = () => startGame(save.player, save.bags || [], save.spawns || []);
  }
  $('vocs').innerHTML = Object.entries(VOCATIONS).map(([k, v]) => `
    <button class="voc" data-voc="${k}" style="--c:${v.color}">
      <b>${v.name}</b><span>${v.desc}</span>
      <small>+${v.hp} HP · +${v.mana} mana · +${v.cap} cap per level</small>
    </button>`).join('');
  $('vocs').onclick = (e) => {
    const b = e.target.closest('[data-voc]');
    if (!b) return;
    const name = ($('name').value.trim() || 'Wanderer').slice(0, 16);
    startGame(newPlayer(name, b.dataset.voc));
  };
}

// ---------- Interaction ----------

function walkTo(x, y, pending = null) {
  const p = player;
  const goal = pending ? (gx, gy) => Math.max(Math.abs(gx - x), Math.abs(gy - y)) <= 1
    : (gx, gy) => gx === x && gy === y;
  const path = findPath(p.x, p.y, p.z, goal, 1500);
  p.pending = pending;
  p.dest = { x, y };
  p.path = path;
  if (!path) { log('There is no way.', 'dim'); p.pending = null; }
}

function interact(target, now) {
  const p = player;
  if (target.kind === 'pile') {
    if (world.piles.includes(target.ref)) openWindow('loot', target.ref);
  } else if (target.kind === 'depot') {
    openWindow('depot', { x: target.x, y: target.y });
  } else if (target.kind === 'npc') {
    if (p.talking !== target.ref) handleChat('hi', now);
  }
}

function onCanvasClick(ev, right) {
  const p = player;
  if (!p || p.dead) return;
  const now = performance.now();
  const r = canvas.getBoundingClientRect();
  const mx = ((ev.clientX - r.left) / r.width) * canvas.width;
  const my = ((ev.clientY - r.top) / r.height) * canvas.height;
  const tx = Math.floor(mx / TILE + cam.x);
  const ty = Math.floor(my / TILE + cam.y);
  const ent = entityAt(tx, ty, p.z);
  const pile = pileAt(tx, ty, p.z);
  const tile = tileDef(tx, ty, p.z);

  if (right) {
    if (ent && ent.kind === 'creature') log(`You see a ${ent.def.name}. It looks ${ent.hp / ent.maxHp > 0.6 ? 'healthy' : ent.hp / ent.maxHp > 0.25 ? 'wounded' : 'nearly dead'}.`, 'dim');
    else if (ent && ent.kind === 'npc') log(`You see ${ent.name}.`, 'dim');
    else if (ent === p) log(`You see yourself. You are a ${VOCATIONS[p.voc].name}. Kills: ${p.kills}, deaths: ${p.deaths}.`, 'dim');
    else if (pile) log(`You see ${pile.kind === 'corpse' ? `a ${pile.name}` : pile.name}.`, 'dim');
    else log(`You see ${tile.name}.`, 'dim');
    return;
  }
  if (ent && ent.kind === 'creature') {
    p.target = p.target === ent ? null : ent;
    if (p.target) p.attackAt = Math.max(p.attackAt, now + 150);
    return;
  }
  if (ent && ent.kind === 'npc') {
    if (dist(p, ent) <= 3) interact({ kind: 'npc', ref: ent }, now);
    else walkTo(ent.x, ent.y, { kind: 'npc', ref: ent, x: ent.x, y: ent.y });
    return;
  }
  if (pile) {
    const target = { kind: 'pile', ref: pile, x: tx, y: ty };
    if (dist(p, pile) <= 1) interact(target, now); else walkTo(tx, ty, target);
    return;
  }
  if (tile.use === 'depot') {
    const target = { kind: 'depot', x: tx, y: ty };
    if (dist(p, { x: tx, y: ty }) <= 1) interact(target, now); else walkTo(tx, ty, target);
    return;
  }
  if (tile.walk) walkTo(tx, ty);
}

function travelRoad(p) {
  const at = (e) => e.x === p.x && e.y === p.y && e.z === p.z;
  const r = ROADS.find((k) => at(k.a) || at(k.b));
  if (!r) return false;
  const to = at(r.a) ? r.b : r.a;
  for (const [dx, dy] of DIRS8) {
    const nx = to.x + dx;
    const ny = to.y + dy;
    if (canEnter(nx, ny, to.z) && !tileDef(nx, ny, to.z).road) {
      placeAt(p, nx, ny, to.z);
      log(`You follow the road to ${FLOOR_INFO[to.z].name}.`, 'dim');
      return true;
    }
  }
  log('Something is blocking the road.', 'warn');
  return false;
}

function changeFloor(p, now) {
  const c = tileAt(p.x, p.y, p.z);
  if (c === '>') {
    if (!travelRoad(p)) return;
  } else if (c === 'O') {
    const l = LINKS.find((k) => k.from === p.z && k.x === p.x && k.y === p.y);
    if (!l) return;
    if (l.gate && !hasFlag(p, l.gate)) {
      log('A seal of cold iron covers the hole. Old Brann might know something about it.', 'warn');
      return;
    }
    if (entityAt(l.x, l.y, l.to)) { log('Something is blocking the way below.', 'warn'); return; }
    placeAt(p, l.x, l.y, l.to);
    log(`You drop into the darkness. ${p.torch <= 0 && p.lumen <= 0 ? 'Light a torch (click it in your backpack) or say "lumen".' : ''}`, 'dim');
  } else if (c === 'L') {
    const l = LINKS.find((k) => k.to === p.z && k.x === p.x && k.y === p.y);
    if (!l) return;
    for (const [dx, dy] of DIRS8) {
      const nx = l.x + dx;
      const ny = l.y + dy;
      if (canEnter(nx, ny, l.from) && tileAt(nx, ny, l.from) !== 'O') {
        placeAt(p, nx, ny, l.from);
        log('You climb the ladder.', 'dim');
        break;
      }
    }
  } else return;
  p.target = null; p.path = null; p.pending = null;
  closeWindow();
  addEffect({ type: 'ring', x: p.x, y: p.y, z: p.z, color: '#ffffff', ms: 500 });
  markExplored();
  drawMinimap();
}

function heldDir() {
  for (let i = held.length - 1; i >= 0; i--) {
    if (document.activeElement === $('chat') && !held[i].startsWith('arrow')) continue;
    if (KEY_DIRS[held[i]]) return KEY_DIRS[held[i]];
  }
  return null;
}

function updatePlayer(now) {
  const p = player;
  if (p.dead || isMoving(p, now)) return;
  if (p.justMoved) {
    p.justMoved = false;
    changeFloor(p, now);
    if (isMoving(p, now)) return;
  }
  const ms = playerStepMs(p);
  const d = heldDir();
  if (d) {
    p.path = null; p.pending = null;
    if (stepEntity(p, d[0], d[1], now, ms)) p.justMoved = true;
    else p.dir = dirIndex(d[0], d[1]);
    return;
  }
  if (p.path && p.path.length) {
    const [nx, ny] = p.path[0];
    if (canEnter(nx, ny, p.z) && Math.max(Math.abs(nx - p.x), Math.abs(ny - p.y)) === 1) {
      p.path.shift();
      stepEntity(p, nx - p.x, ny - p.y, now, ms);
      p.justMoved = true;
    } else {
      walkTo(p.dest.x, p.dest.y, p.pending);
    }
    return;
  }
  p.path = null;
  if (p.pending) {
    const t = p.pending;
    p.pending = null;
    if (Math.max(Math.abs(t.x - p.x), Math.abs(t.y - p.y)) <= 1 || t.kind === 'npc') interact(t, now);
    return;
  }
  const t = p.target;
  const w = weapon(p);
  if (p.chase && t && t.z === p.z && dist(p, t) > 1 && (!w || w.kind === 'melee')) {
    const path = findPath(p.x, p.y, p.z, (x, y) => x === t.x && y === t.y, 600);
    if (path && path.length && !(path[0][0] === t.x && path[0][1] === t.y)) {
      stepEntity(p, path[0][0] - p.x, path[0][1] - p.y, now, ms);
      p.justMoved = true;
    }
  }
}

function everySecond(now) {
  const p = player;
  if (p.dead) return;
  const wasFed = p.food > 0;
  p.food = Math.max(0, p.food - 1);
  if (wasFed && p.food === 0) log('You are hungry. Eat something to keep regenerating.', 'warn');
  p.lumen = Math.max(0, p.lumen - 1);
  p.torch = Math.max(0, p.torch - 1);
  p.haste = Math.max(0, p.haste - 1);
  const hadShield = p.mshield > 0;
  p.mshield = Math.max(0, p.mshield - 1);
  if (hadShield && p.mshield === 0) log('Your mana shield fades.', 'warn');
  const hadFocus = p.focus > 0;
  p.focus = Math.max(0, (p.focus || 0) - 1);
  if (hadFocus && p.focus === 0) log('Your focus fades.', 'warn');
  if (p.cloak) {
    // Cloak drains 1 mana a second (no magic training) and fails when you run dry.
    p.mana = Math.max(0, p.mana - 1);
    if (p.mana === 0) { p.cloak = 0; log('Your cloak fails. You are visible again.', 'warn'); }
  }
  if (p.food > 0 && now >= p.regenAt) {
    p.regenAt = now + 2000;
    const v = VOCATIONS[p.voc].regen;
    const bonus = Math.floor(p.level / 10);
    p.hp = Math.min(maxHp(p), p.hp + v.hp + bonus);
    p.mana = Math.min(maxMana(p), p.mana + manaRegen(p));
  }
  const t = Date.now();
  world.piles = world.piles.filter((pl) => !pl.expires || pl.expires > t);
  if (ui.window && ui.window.kind === 'loot' && !world.piles.includes(ui.window.ref)) closeWindow();
  ui.dirty = true;
}

function update(now) {
  const p = player;
  updatePlayer(now);
  const pz = !p.dead && isSafeTile(p.x, p.y, p.z);
  if (pz !== !!p.inPz) {
    p.inPz = pz;
    if (!p.dead) log(pz ? 'You enter a protection zone.' : 'You leave the protection zone.', 'dim');
  }
  for (const c of creatures) creatureThink(c, now);
  for (const n of npcs) npcThink(n, now);
  if (!p.dead) {
    playerAttackTick(now);
    creatureAttacks(now);
  }
  updateSpawns(now);
  if (now - lastSecond >= 1000) { lastSecond = now; everySecond(now); }
  if (now - lastSave >= 30000) { lastSave = now; saveGame(); }
  if (now - lastMap >= 250) { lastMap = now; markExplored(); drawMinimap(); }

  // close windows when walking away
  const w = ui.window;
  if (w && w.kind !== 'hotkey') {
    const ref = w.ref;
    const max = w.kind === 'trade' ? 4 : 1;
    if (!p.dead && Math.max(Math.abs(ref.x - p.x), Math.abs(ref.y - p.y)) > max) closeWindow();
  }
  if (p.talking && dist(p.talking, p) > 5) { p.talking = null; }
}

function loop() {
  const now = performance.now();
  if (player) {
    update(now);
    render(ctx, now);
    if (ui.dirty) renderPanel();
  }
  requestAnimationFrame(loop);
}

// ---------- Input wiring ----------

function nearestTargets() {
  const p = player;
  return creatures
    .filter((c) => c.z === p.z && dist(c, p) <= 7 && lineOfSight(p.x, p.y, c.x, c.y, p.z))
    .sort((a, b) => dist(a, p) - dist(b, p));
}

function runHotkey(i, now) {
  const h = player.hotkeys[i];
  if (!h || player.dead) return;
  if (h.startsWith('item:')) useItemById(h.slice(5), now);
  else if (castSpell(h, now)) log(`<span class="me">${esc(player.name)}:</span> ${esc(h)}`, 'say');
}

function wireInput() {
  const chat = $('chat');
  window.addEventListener('keydown', (e) => {
    if (!player || $('game').classList.contains('hidden')) return;
    const k = e.key.toLowerCase();
    const now = performance.now();
    const typing = document.activeElement === chat;
    if (KEY_DIRS[k] && (!typing || k.startsWith('arrow'))) {
      e.preventDefault();
      if (!held.includes(k)) held.push(k);
      return;
    }
    if (typing) {
      if (k === 'enter') {
        e.preventDefault();
        const v = chat.value;
        chat.value = '';
        chat.blur();
        handleChat(v, now);
      } else if (k === 'escape') { chat.value = ''; chat.blur(); }
      return;
    }
    if (k === 'enter') { e.preventDefault(); chat.focus(); return; }
    if (k === 'escape') { if (ui.window) closeWindow(); else player.target = null; return; }
    if (k === ' ' || k === 'tab') {
      e.preventDefault();
      const list = nearestTargets();
      if (!list.length) return;
      const i = list.indexOf(player.target);
      player.target = k === ' ' ? list[0] : list[(i + 1) % list.length];
      return;
    }
    if (/^[1-9]$/.test(k)) { runHotkey(Number(k) - 1, now); }
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    const i = held.indexOf(k);
    if (i >= 0) held.splice(i, 1);
  });
  window.addEventListener('blur', () => { held.length = 0; });

  canvas.addEventListener('mousedown', (e) => { onCanvasClick(e, e.button === 2); });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  $('pack').addEventListener('pointerdown', (e) => {
    const s = e.target.closest('[data-pack]');
    if (!s) return;
    const i = Number(s.dataset.pack);
    const it = player.pack[i];
    if (!it) return;
    if (e.button === 2) log(`You see ${itemTitle(it.id, it.count)}.`, 'dim');
    else if (e.shiftKey || ui.dropMode) dropFromPack(i);
    else useItem(i, performance.now());
  });
  $('pack').addEventListener('contextmenu', (e) => e.preventDefault());
  $('dropmode').addEventListener('click', () => { ui.dropMode = !ui.dropMode; ui.dirty = true; });
  $('equip').addEventListener('pointerdown', (e) => {
    const s = e.target.closest('[data-eq]');
    if (s && e.button === 0) unequip(s.dataset.eq);
  });
  $('hotbar').addEventListener('pointerdown', (e) => {
    const s = e.target.closest('[data-hk]');
    if (!s) return;
    if (e.button === 2) openWindow('hotkey', { slot: Number(s.dataset.hk) });
    else runHotkey(Number(s.dataset.hk), performance.now());
  });
  $('hotbar').addEventListener('contextmenu', (e) => e.preventDefault());
  $('win').addEventListener('pointerdown', onWindowClick);
  $('win-close').addEventListener('pointerdown', (e) => { e.stopPropagation(); closeWindow(); });
  $('chase').onclick = () => { player.chase = !player.chase; ui.dirty = true; };
  $('mute').onclick = () => { toggleMute(); ui.dirty = true; };
  $('respawn').onclick = () => { $('death').classList.add('hidden'); respawnPlayer(); };
  let armed = 0;
  $('newgame').onclick = () => {
    if (Date.now() - armed > 3000) { armed = Date.now(); $('newgame').textContent = 'Click again to confirm'; return; }
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
    window.removeEventListener('beforeunload', saveGame);
    location.reload();
  };
  window.addEventListener('beforeunload', saveGame);
}

window.addEventListener('DOMContentLoaded', () => {
  canvas = $('view');
  canvas.width = VIEW_W * TILE;
  canvas.height = VIEW_H * TILE;
  ctx = canvas.getContext('2d');
  buildWorld();
  spawnNpcs();
  updateSpawns(0);
  wireInput();
  showStart();
  requestAnimationFrame(loop);
});
