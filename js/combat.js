// combat.js — attacks, damage, experience, skills, spells, runes and death.
'use strict';

const SKILL_NAMES = { melee: 'melee fighting', distance: 'distance fighting', shielding: 'shielding', magic: 'magic level' };

function xpForLevel(L) {
  return Math.floor((50 / 3) * (L ** 3 - 6 * L ** 2 + 17 * L - 12));
}

function triesNeeded(p, skill) {
  const s = p.skills[skill];
  const mul = VOCATIONS[p.voc].mul[skill];
  return skill === 'magic' ? Math.floor(120 * mul ** s.lvl) : Math.floor(30 * mul ** (s.lvl - 10));
}

function train(p, skill, n) {
  const s = p.skills[skill];
  s.tries += n;
  let need = triesNeeded(p, skill);
  while (s.tries >= need) {
    s.tries -= need;
    s.lvl++;
    log(`You advanced to ${SKILL_NAMES[skill]} ${s.lvl}.`, 'adv');
    need = triesNeeded(p, skill);
  }
  ui.dirty = true;
}

function gainXp(p, n) {
  p.xp += n;
  const before = p.level;
  while (p.xp >= xpForLevel(p.level + 1)) p.level++;
  if (p.level > before) {
    const v = VOCATIONS[p.voc];
    p.hp = Math.min(maxHp(p), p.hp + (p.level - before) * v.hp);
    p.mana = Math.min(maxMana(p), p.mana + (p.level - before) * v.mana);
    log(`You advanced from Level ${before} to Level ${p.level}.`, 'adv');
    floatText(p.x, p.y, p.z, `LEVEL ${p.level}!`, '#ffe066', 1800);
    addEffect({ type: 'ring', x: p.x, y: p.y, z: p.z, color: '#ffe066', ms: 900 });
    sfx('level');
    saveGame();
  }
  ui.dirty = true;
}

function weapon(p) { return p.equip.weapon ? ITEMS[p.equip.weapon.id] : null; }

function totalArmor(p) {
  let a = 0;
  for (const s of Object.values(p.equip)) if (s && ITEMS[s.id].arm) a += ITEMS[s.id].arm;
  return a;
}

// Sums a numeric item stat (mreg, mpmax, ...) across everything worn.
function gearBonus(p, key) {
  let n = 0;
  for (const s of Object.values(p.equip)) if (s && ITEMS[s.id][key]) n += ITEMS[s.id][key];
  return n;
}

function manaRegen(p) {
  return VOCATIONS[p.voc].regen.mana + Math.floor(p.level / 10) + gearBonus(p, 'mreg');
}

function meleeRoll(p) {
  const w = weapon(p);
  const atk = w && w.kind === 'melee' ? w.atk : 5;
  const max = 0.12 * p.skills.melee.lvl * atk + p.level / 2;
  return randInt(0, Math.floor(max));
}

// Spell damage scaled by distance fighting (Spirit Arrow, Arrow Rain).
function distanceSpellRoll(p) {
  const ds = p.skills.distance.lvl;
  return randInt(Math.floor(ds * 1.0 + p.level * 0.5 + 8), Math.floor(ds * 2.0 + p.level * 0.8 + 16));
}

function attackRange(p) {
  const w = weapon(p);
  if (!w || w.kind === 'melee') return 1;
  return w.range;
}

// ---------- Player -> creature ----------

function playerAttackTick(now) {
  const p = player;
  const t = p.target;
  if (!t) return;
  if (!creatures.includes(t) || t.z !== p.z || dist(p, t) > 9) {
    p.target = null;
    log('Target lost.', 'dim');
    return;
  }
  if (isSafeTile(p.x, p.y, p.z)) {
    p.target = null;
    log("You can't attack from a protection zone.", 'dim');
    return;
  }
  if (now < p.attackAt) return;
  const w = weapon(p);
  const kind = w ? w.kind : 'melee';
  const d = dist(p, t);
  if (kind === 'melee') {
    if (d > 1) return;
    p.attackAt = now + ATTACK_TICK;
    train(p, 'melee', 1);
    hitCreature(t, meleeRoll(p), true, '#ff4040');
    return;
  }
  if (d > w.range || !lineOfSight(p.x, p.y, t.x, t.y, p.z)) return;
  if (kind === 'bow') {
    const ammo = p.equip.ammo;
    if (!ammo || ITEMS[ammo.id].slot !== 'ammo') {
      if (now > (p.noAmmoMsg || 0)) { log('You have no ammunition.', 'warn'); p.noAmmoMsg = now + 4000; }
      return;
    }
    p.attackAt = now + ATTACK_TICK;
    ammo.count--;
    const arrowAtk = ITEMS[ammo.id].atk;
    if (ammo.count <= 0) p.equip.ammo = null;
    train(p, 'distance', 1);
    addEffect({ type: 'proj', x: p.x, y: p.y, tx: t.x, ty: t.y, z: p.z, color: '#e8d8a8', ms: 220 });
    const hitChance = Math.min(0.95, 0.62 + p.skills.distance.lvl * 0.006);
    if (Math.random() > hitChance) { puff(t, 'miss'); return; }
    const max = 0.12 * p.skills.distance.lvl * (w.atk + arrowAtk) + p.level / 2;
    hitCreature(t, randInt(Math.floor(max * 0.15), Math.floor(max)), true, '#ff4040');
    ui.dirty = true;
    return;
  }
  if (kind === 'wand') {
    if (p.mana < w.mana) {
      if (now > (p.noAmmoMsg || 0)) { log('You do not have enough mana.', 'warn'); p.noAmmoMsg = now + 4000; }
      return;
    }
    p.attackAt = now + ATTACK_TICK;
    spendMana(p, w.mana);
    const col = p.voc === 'mender' ? '#7ad04a' : '#ff8a2a';
    addEffect({ type: 'proj', x: p.x, y: p.y, tx: t.x, ty: t.y, z: p.z, color: col, ms: 200, big: true });
    hitCreature(t, randInt(w.dmg[0], w.dmg[1]), false, col);
  }
}

function hitCreature(c, dmg, physical, color) {
  let d = dmg;
  if (physical) d -= randInt(0, c.def.arm);
  if (d <= 0) { puff(c, 'blocked'); return; }
  d = Math.min(d, c.hp);
  c.hp -= d;
  c.hitFlash = performance.now() + 150;
  floatText(c.x, c.y, c.z, String(d), color);
  addEffect({ type: 'burst', x: c.x, y: c.y, z: c.z, color, ms: 300 });
  sfx('hit');
  // Being hit makes anything retaliate, even if it was fleeing earlier.
  if (c.hp <= 0) killCreature(c);
}

function puff(e, text) {
  floatText(e.x, e.y, e.z, text, '#bbbbbb', 700);
  addEffect({ type: 'burst', x: e.x, y: e.y, z: e.z, color: '#9aa0aa', ms: 250 });
}

function killCreature(c) {
  const i = creatures.indexOf(c);
  if (i >= 0) creatures.splice(i, 1);
  c.sp.creature = null;
  c.sp.respawnAt = performance.now() + c.def.respawn * 1000;
  if (player.target === c) player.target = null;
  const loot = [];
  if (!c.sp.summoned) {
    for (const [id, lo, hi, chance] of c.def.loot) {
      if (Math.random() < chance) addToStacks(loot, id, randInt(lo, hi), 20);
    }
  }
  dropPile(c.x, c.y, c.z, loot, { kind: 'corpse', name: `dead ${c.def.name.replace(/^The /, '')}`, glyph: c.def.glyph, expires: Date.now() + 90000 });
  player.kills++;
  const lootText = loot.length ? loot.map((l) => `${l.count > 1 ? `${l.count} ` : ''}${ITEMS[l.id].name}${l.count > 1 && !l.id.endsWith('s') && l.id !== 'gold' ? 's' : ''}`).join(', ') : 'nothing';
  log(`Loot of a ${c.def.name.replace(/^The /, '')}: ${lootText}.`, 'loot');
  log(`You gained ${c.def.xp} experience points.`, 'dim');
  floatText(c.x, c.y, c.z, `+${c.def.xp} xp`, '#ffffff', 1200, -10);
  sfx('kill');
  gainXp(player, c.def.xp);
  questKill(c.type);
  if (c.def.boss) {
    if (c.def.bossMsg) log(c.def.bossMsg, 'adv');
    flashBanner(`${c.def.name} has fallen!`);
  }
}

// ---------- Creature -> player ----------

function creatureAttacks(now) {
  const p = player;
  if (p.dead) return;
  if (isSafeTile(p.x, p.y, p.z)) return;
  for (const c of creatures) {
    if (c.z !== p.z) continue;
    const d = dist(c, p);
    if (c.def.spell && d <= c.def.spell.radius && now >= c.spellAt) {
      c.spellAt = now + c.def.spell.every;
      const col = c.def.spell.color || '#ff4a1a';
      speech(c, c.def.spell.name, col);
      for (let dy = -c.def.spell.radius; dy <= c.def.spell.radius; dy++) {
        for (let dx = -c.def.spell.radius; dx <= c.def.spell.radius; dx++) {
          if (Math.random() < 0.6) addEffect({ type: 'burst', x: c.x + dx, y: c.y + dy, z: c.z, color: col, ms: 500 });
        }
      }
      hurtPlayer(randInt(c.def.spell.min, c.def.spell.max), c, false);
      if (p.dead) return;
    }
    if (c.def.summon && d <= 7 && now >= c.summonAt) summonMinions(c, now);
    if (now < c.attackAt) continue;
    if (c.def.ranged) {
      if (d > c.def.ranged || !lineOfSight(c.x, c.y, p.x, p.y, c.z)) continue;
      c.attackAt = now + ATTACK_TICK;
      addEffect({ type: 'proj', x: c.x, y: c.y, tx: p.x, ty: p.y, z: c.z, color: '#d8d0c0', ms: 220 });
      hurtPlayer(randInt(Math.floor(c.def.atk * 0.3), c.def.atk), c, true);
    } else {
      if (d > 1) continue;
      c.attackAt = now + ATTACK_TICK;
      hurtPlayer(randInt(Math.floor(c.def.atk * 0.3), c.def.atk), c, true);
    }
    if (p.dead) return;
  }
}

// Spawns def.summon.n minions next to c, capped at def.summon.max alive. Summons never respawn or drop loot.
function summonMinions(c, now) {
  const s = c.def.summon;
  c.summonAt = now + s.every;
  let n = Math.min(s.n, s.max - creatures.filter((k) => k.master === c).length);
  if (n <= 0) return;
  speech(c, s.name, '#7ad0d0');
  for (const [dx, dy] of DIRS8) {
    if (n <= 0) break;
    const x = c.x + dx;
    const y = c.y + dy;
    if (!canEnter(x, y, c.z)) continue;
    const k = spawnCreature({ type: s.type, x, y, z: c.z, summoned: true, creature: null, respawnAt: 0 });
    k.master = c;
    addEffect({ type: 'ring', x, y, z: c.z, color: '#7ad0d0', ms: 600 });
    n--;
  }
}

function hurtPlayer(dmg, src, physical) {
  const p = player;
  let d = dmg;
  if (physical) {
    const sh = p.equip.shield ? ITEMS[p.equip.shield.id] : null;
    if (sh) {
      const blockMax = Math.floor(sh.def * (0.4 + p.skills.shielding.lvl / 25));
      d -= randInt(0, blockMax);
      train(p, 'shielding', 1);
    }
    const arm = totalArmor(p);
    d -= randInt(Math.floor(arm / 2), arm);
  }
  if (d <= 0) { puff(p, 'blocked'); return; }
  if (p.mshield > 0 && p.mana > 0) {
    const absorbed = Math.min(d, p.mana);
    p.mana -= absorbed;
    d -= absorbed;
    floatText(p.x, p.y, p.z, String(absorbed), '#6aa8ff', 1000, d > 0 ? -10 : 0);
    addEffect({ type: 'burst', x: p.x, y: p.y, z: p.z, color: '#3a6aff', ms: 300 });
    log(`You lose ${absorbed} mana blocking an attack by ${src.def.boss ? '' : 'a '}${src.def.name}.`, 'hurt');
    ui.dirty = true;
    if (d <= 0) return;
  }
  d = Math.min(d, p.hp);
  p.hp -= d;
  p.hitFlash = performance.now() + 150;
  floatText(p.x, p.y, p.z, String(d), '#ff3030');
  addEffect({ type: 'burst', x: p.x, y: p.y, z: p.z, color: '#c01010', ms: 300 });
  sfx('hurt');
  log(`You lose ${d} hitpoint${d === 1 ? '' : 's'} due to an attack by ${src.def.boss ? '' : 'a '}${src.def.name}.`, 'hurt');
  ui.dirty = true;
  if (p.hp <= 0) playerDies(src);
}

// ---------- Death ----------

function playerDies(src) {
  const p = player;
  p.dead = true;
  p.deaths++;
  sfx('death');
  const lostXp = Math.floor(p.xp * 0.1);
  p.xp -= lostXp;
  const oldLevel = p.level;
  while (p.level > 1 && p.xp < xpForLevel(p.level)) p.level--;
  for (const s of Object.values(p.skills)) s.tries = Math.floor(s.tries * 0.5);
  let bagMsg;
  if (p.equip.amulet && p.equip.amulet.id === 'ward_amulet') {
    p.equip.amulet = null;
    bagMsg = 'Your amulet of warding shattered, but your backpack is safe.';
  } else if (p.pack.length) {
    dropPile(p.x, p.y, p.z, p.pack, { kind: 'bag', name: `${p.name}'s backpack`, glyph: '🎒', expires: 0 });
    p.pack = [];
    bagMsg = 'Your backpack lies where you fell. Go get it back!';
  } else {
    bagMsg = 'Your backpack was empty.';
  }
  p.target = null; p.path = null; p.pending = null; p.talking = null;
  closeWindow();
  log(`You were killed by ${src.def.boss ? '' : 'a '}${src.def.name}.`, 'hurt');
  showDeath({
    killer: src.def.name, lostXp, oldLevel, newLevel: p.level, bagMsg,
  });
}

function respawnPlayer() {
  const p = player;
  p.dead = false;
  p.hp = maxHp(p);
  p.mana = maxMana(p);
  p.haste = 0;
  p.mshield = 0;
  placeAt(p, TEMPLE.x, TEMPLE.y, TEMPLE.z);
  if (entityAt(TEMPLE.x, TEMPLE.y, TEMPLE.z) !== p) {
    // something is standing on the altar; nudge
    for (const [dx, dy] of DIRS8) if (canEnter(TEMPLE.x + dx, TEMPLE.y + dy, 0)) { placeAt(p, TEMPLE.x + dx, TEMPLE.y + dy, 0); break; }
  }
  addEffect({ type: 'ring', x: p.x, y: p.y, z: p.z, color: '#ffffff', ms: 900 });
  ui.dirty = true;
  saveGame();
}

// ---------- Magic ----------

function spendMana(p, n) {
  p.mana -= n;
  train(p, 'magic', n);
  ui.dirty = true;
}

function magicRoll(p, f) {
  const ml = p.skills.magic.lvl;
  const base = p.level * 0.2;
  return randInt(Math.floor(base + ml * f[1] + f[0]), Math.floor(base + ml * f[3] + f[2]));
}

function healPlayer(p, amount, color = '#40ff70') {
  const h = Math.min(amount, maxHp(p) - p.hp);
  p.hp += h;
  floatText(p.x, p.y, p.z, `+${h}`, color);
  addEffect({ type: 'sparkle', x: p.x, y: p.y, z: p.z, color, ms: 600 });
  ui.dirty = true;
}

// The tile itself if free, else the first free neighbour. Null if boxed in.
function freeSpotNear(d) {
  if (canEnter(d.x, d.y, d.z)) return { x: d.x, y: d.y, z: d.z };
  for (const [dx, dy] of DIRS8) if (canEnter(d.x + dx, d.y + dy, d.z)) return { x: d.x + dx, y: d.y + dy, z: d.z };
  return null;
}

function teleportPlayer(p, to) {
  addEffect({ type: 'ring', x: p.x, y: p.y, z: p.z, color: '#b07aff', ms: 700 });
  placeAt(p, to.x, to.y, to.z);
  p.target = null; p.path = null; p.pending = null; p.talking = null;
  closeWindow();
  addEffect({ type: 'ring', x: p.x, y: p.y, z: p.z, color: '#b07aff', ms: 700 });
  ui.dirty = true;
  saveGame();
}

function castSpell(words, now) {
  const p = player;
  const spell = SPELLS.find((s) => s.words === words);
  if (!spell) return false;
  speech(p, words, '#ffe066');
  const fail = (msg) => { log(msg, 'warn'); puff(p, ''); return true; };
  if (spell.voc && !spell.voc.includes(p.voc)) return fail(`Your vocation cannot use this spell.`);
  if (spell.quest && !hasFlag(p, spell.quest)) return fail('You have not learned this spell yet.');
  if (p.level < spell.lvl) return fail(`You need level ${spell.lvl} to cast ${spell.name}.`);
  if (now < p.exhaust || now < (p.cd[spell.words] || 0)) return fail('You are exhausted.');
  if (p.mana < spell.mana) return fail('You do not have enough mana.');

  const needsTarget = ['strike', 'pierce'].includes(spell.kind);
  const offensive = needsTarget || ['area', 'cleave', 'wave'].includes(spell.kind);
  if (offensive && isSafeTile(p.x, p.y, p.z)) return fail("You can't attack from a protection zone.");
  const t = p.target;
  if (needsTarget) {
    if (!t) return fail('You need a target for this spell.');
    if (dist(p, t) > spell.range) return fail('Your target is too far away.');
    if (!lineOfSight(p.x, p.y, t.x, t.y, p.z)) return fail('You cannot throw there.');
  }
  let portTo = null;
  if (spell.kind === 'portal') {
    if (!p.portal && p.z === SHOP_PORT.z && dist(p, SHOP_PORT) <= 4) return fail('You are already at the shop.');
    portTo = freeSpotNear(p.portal || SHOP_PORT);
    if (!portTo) return fail('Something blocks the rift.');
  }

  switch (spell.kind) {
    case 'heal': healPlayer(p, magicRoll(p, spell.f)); break;
    case 'light': p.lumen = spell.secs; addEffect({ type: 'ring', x: p.x, y: p.y, z: p.z, color: '#fff4c0', ms: 700 }); break;
    case 'haste': p.haste = spell.secs; addEffect({ type: 'ring', x: p.x, y: p.y, z: p.z, color: '#a0e0ff', ms: 700 }); break;
    case 'food': giveOrDrop(p, 'bread', 1); addEffect({ type: 'sparkle', x: p.x, y: p.y, z: p.z, color: '#ffd080', ms: 600 }); break;
    case 'strike':
      addEffect({ type: 'proj', x: p.x, y: p.y, tx: t.x, ty: t.y, z: p.z, color: spell.color, ms: 180, big: true });
      hitCreature(t, magicRoll(p, spell.f), false, spell.color);
      break;
    case 'pierce':
      addEffect({ type: 'proj', x: p.x, y: p.y, tx: t.x, ty: t.y, z: p.z, color: spell.color, ms: 160, big: true });
      hitCreature(t, distanceSpellRoll(p), false, spell.color);
      break;
    case 'area': {
      const r = spell.radius;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx || dy) addEffect({ type: 'burst', x: p.x + dx, y: p.y + dy, z: p.z, color: spell.color, ms: 450 });
        }
      }
      const roll = () => {
        if (spell.stat === 'melee') return Math.floor(meleeRoll(p) + 10);
        if (spell.stat === 'distance') return distanceSpellRoll(p);
        return magicRoll(p, spell.f);
      };
      for (const c of creatures.slice()) {
        if (c.z === p.z && dist(p, c) <= r && lineOfSight(p.x, p.y, c.x, c.y, p.z)) hitCreature(c, roll(), spell.stat === 'melee', spell.color);
      }
      break;
    }
    case 'wave': {
      const [fx, fy] = DIRS8[p.dir] || [0, 1];
      const inWave = (dx, dy) => {
        const along = dx * fx + dy * fy;
        const across = Math.abs(-dx * fy + dy * fx);
        return along > 0 && across <= Math.floor(along / 2) && Math.max(Math.abs(dx), Math.abs(dy)) <= spell.depth
          && lineOfSight(p.x, p.y, p.x + dx, p.y + dy, p.z);
      };
      for (let dy = -spell.depth; dy <= spell.depth; dy++) {
        for (let dx = -spell.depth; dx <= spell.depth; dx++) {
          if (inWave(dx, dy)) addEffect({ type: 'burst', x: p.x + dx, y: p.y + dy, z: p.z, color: spell.color, ms: 450 });
        }
      }
      for (const c of creatures.slice()) {
        if (c.z === p.z && inWave(c.x - p.x, c.y - p.y)) hitCreature(c, magicRoll(p, spell.f), false, spell.color);
      }
      break;
    }
    case 'conjure':
      giveOrDrop(p, spell.item, spell.count);
      addEffect({ type: 'sparkle', x: p.x, y: p.y, z: p.z, color: '#ff9a40', ms: 600 });
      log(`You conjure ${spell.count} ${ITEMS[spell.item].name}s.`, 'dim');
      break;
    case 'mshield':
      p.mshield = spell.secs;
      addEffect({ type: 'ring', x: p.x, y: p.y, z: p.z, color: '#6aa8ff', ms: 800 });
      log('You are protected by a mana shield.', 'dim');
      break;
    case 'portal':
      if (p.portal) {
        p.portal = null;
        teleportPlayer(p, portTo);
        log('The rift closes behind you.', 'dim');
      } else {
        p.portal = { x: p.x, y: p.y, z: p.z };
        teleportPlayer(p, portTo);
        log('A rift opens. You step into Odran\'s shop. Say <span class="kw">portus</span> again to return.', 'dim');
      }
      break;
    case 'cleave': {
      for (const [dx, dy] of DIRS8) addEffect({ type: 'burst', x: p.x + dx, y: p.y + dy, z: p.z, color: '#ff4040', ms: 350 });
      for (const c of creatures.slice()) {
        if (c.z === p.z && dist(p, c) === 1) hitCreature(c, Math.floor(meleeRoll(p) * 1.3 + 5), true, '#ff4040');
      }
      break;
    }
    default: break;
  }
  sfx('spell');
  spendMana(p, spell.mana);
  p.exhaust = now + 1000;
  p.cd[spell.words] = now + spell.cd;
  if (offensive) p.attackAt = Math.max(p.attackAt, now + 500);
  return true;
}

function useRune(p, id, now) {
  const def = ITEMS[id];
  if (now < p.exhaust) { log('You are exhausted.', 'warn'); return; }
  const ml = p.skills.magic.lvl;
  const base = p.level * 0.2;
  if (def.rune === 'attack') {
    if (isSafeTile(p.x, p.y, p.z)) { log("You can't attack from a protection zone.", 'warn'); return; }
    const t = p.target;
    if (!t) { log('You need a target to use this rune.', 'warn'); return; }
    if (dist(p, t) > 5 || !lineOfSight(p.x, p.y, t.x, t.y, p.z)) { log('You cannot throw there.', 'warn'); return; }
    addEffect({ type: 'proj', x: p.x, y: p.y, tx: t.x, ty: t.y, z: p.z, color: '#ff7a1a', ms: 180, big: true });
    hitCreature(t, randInt(Math.floor(ml * 1.0 + base + 12), Math.floor(ml * 1.8 + base + 26)), false, '#ff7a1a');
  } else {
    healPlayer(p, randInt(Math.floor(ml * 1.5 + base + 20), Math.floor(ml * 2.5 + base + 40)));
  }
  removeFrom(p.pack, id, 1);
  p.exhaust = now + 1000;
  ui.dirty = true;
}
