// ui.js — chat log, floating text, effects, HUD panels, windows, NPC talk, item use.
'use strict';

const ui = { dirty: true, window: null, floats: [], effects: [], speeches: [], tradeTab: 'buy', dropMode: false };
const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// ---------- Log & overlays ----------

function log(msg, cls = '') {
  const el = $('log');
  const line = document.createElement('div');
  line.className = `msg ${cls}`;
  line.innerHTML = msg;
  el.appendChild(line);
  while (el.children.length > 150) el.removeChild(el.firstChild);
  el.scrollTop = el.scrollHeight;
}

function floatText(x, y, z, text, color, ms = 1000, dy = 0) {
  ui.floats.push({ x, y, z, text, color, born: performance.now(), ms, dy });
}

function addEffect(e) {
  ui.effects.push({ ...e, born: performance.now() });
}

function speech(ent, text, color = '#ffe066') {
  ui.speeches = ui.speeches.filter((s) => s.ent !== ent);
  ui.speeches.push({ ent, text, color, born: performance.now(), ms: 3500 });
}

function flashBanner(text) {
  const b = $('banner');
  b.textContent = text;
  b.classList.remove('show');
  void b.offsetWidth;
  b.classList.add('show');
}

function showDeath(info) {
  $('death-body').innerHTML = `
    <p>Killed by <b>${esc(info.killer)}</b>.</p>
    <p>You lost <b>${info.lostXp}</b> experience${info.newLevel < info.oldLevel ? ` and fell to level <b>${info.newLevel}</b>` : ''}.</p>
    <p>Half your skill progress is gone.</p>
    <p>${esc(info.bagMsg)}</p>`;
  $('death').classList.remove('hidden');
}

// ---------- Item helpers ----------

function itemTitle(id, count = 1) {
  const d = ITEMS[id];
  const bits = [count > 1 ? `${count} ${d.name}` : d.name];
  if (d.atk && d.slot === 'weapon') bits.push(`Atk ${d.atk}`);
  if (d.atk && d.slot === 'ammo') bits.push(`Atk +${d.atk}`);
  if (d.dmg) bits.push(`Dmg ${d.dmg[0]}-${d.dmg[1]}, ${d.mana} mana/shot`);
  if (d.def) bits.push(`Def ${d.def}`);
  if (d.arm) bits.push(`Arm ${d.arm}`);
  if (d.mreg) bits.push(`+${d.mreg} mana regen`);
  if (d.mpmax) bits.push(`+${d.mpmax} max mana`);
  if (d.range && d.slot === 'weapon') bits.push(`Range ${d.range}`);
  if (d.two) bits.push('two-handed');
  if (d.voc) bits.push(`${d.voc.map((v) => VOCATIONS[v].name).join('/')} only`);
  if (d.lvl) bits.push(`level ${d.lvl}+`);
  if (d.heal) bits.push(`heals ${d.heal[0]}-${d.heal[1]}`);
  if (d.restore) bits.push(`restores ${d.restore[0]}-${d.restore[1]} mana`);
  if (d.food) bits.push(`${Math.round(d.food / 60)} min of food`);
  if (d.desc) bits.push(d.desc);
  bits.push(`${(d.w * count).toFixed(1)} oz`);
  return bits.join(' · ');
}

function slotHtml(stack, attrs = '', placeholder = '') {
  if (!stack) return `<div class="slot empty" ${attrs}><span class="ph">${placeholder}</span></div>`;
  const d = ITEMS[stack.id];
  const bg = d.bg || TIER_COLORS[d.tier || 0];
  const n = stack.count > 1 ? `<span class="n">${stack.count}</span>` : '';
  return `<div class="slot" style="background:${bg}" title="${esc(itemTitle(stack.id, stack.count))}" ${attrs}><span class="g">${d.glyph}</span>${n}</div>`;
}

function useItem(index, now) {
  const p = player;
  const s = p.pack[index];
  if (!s || p.dead) return;
  const d = ITEMS[s.id];
  if (d.slot) { equipFromPack(index); return; }
  if (d.food) {
    if (p.food + d.food > 1200) { log('You are full.', 'dim'); return; }
    p.food += d.food;
    removeFrom(p.pack, s.id, 1);
    speech(p, 'Munch.', '#ffb060');
  } else if (d.heal || d.restore) {
    if (now < p.potionEx) { log('You are exhausted.', 'warn'); return; }
    p.potionEx = now + 1000;
    removeFrom(p.pack, s.id, 1);
    if (d.heal) healPlayer(p, randInt(d.heal[0], d.heal[1]));
    else {
      const m = Math.min(randInt(d.restore[0], d.restore[1]), maxMana(p) - p.mana);
      p.mana += m;
      floatText(p.x, p.y, p.z, `+${m}`, '#6aa8ff');
      addEffect({ type: 'sparkle', x: p.x, y: p.y, z: p.z, color: '#6aa8ff', ms: 600 });
    }
    speech(p, 'Aaaah...', '#ffb060');
  } else if (d.rune) {
    useRune(p, s.id, now);
  } else if (d.light) {
    p.torch = d.light;
    removeFrom(p.pack, s.id, 1);
    log('You light a torch.', 'dim');
  } else if (d.bag) {
    if (d.lvl && p.level < d.lvl) { log(`You need level ${d.lvl} to use this.`, 'warn'); return; }
    if (d.bag <= packSlots(p)) { log('You already carry a bag that big.', 'dim'); return; }
    p.packSlots = d.bag;
    removeFrom(p.pack, s.id, 1);
    addEffect({ type: 'sparkle', x: p.x, y: p.y, z: p.z, color: '#ffd080', ms: 600 });
    log(`Your backpack now holds ${d.bag} items.`, 'loot');
    saveGame();
  } else {
    log(`You see ${itemTitle(s.id, s.count)}.`, 'dim');
  }
  ui.dirty = true;
}

function useItemById(id, now) {
  const i = player.pack.findIndex((s) => s.id === id);
  if (i < 0) { log(`You have no ${ITEMS[id].name}.`, 'warn'); return; }
  useItem(i, now);
}

function equipFromPack(index) {
  const p = player;
  const s = p.pack[index];
  const d = ITEMS[s.id];
  if (d.voc && !d.voc.includes(p.voc)) { log(`Only ${d.voc.map((v) => VOCATIONS[v].name).join('/')}s can use this.`, 'warn'); return; }
  if (d.lvl && p.level < d.lvl) { log(`You need level ${d.lvl} to use this.`, 'warn'); return; }
  const slot = d.slot;
  p.pack.splice(index, 1);
  const cur = p.equip[slot];
  if (cur && cur.id === s.id && d.stack) {
    cur.count += s.count;
  } else {
    if (cur) p.pack.splice(index, 0, cur);
    p.equip[slot] = s;
  }
  // two-handed rules
  if (slot === 'weapon' && d.two && p.equip.shield) { p.pack.push(p.equip.shield); p.equip.shield = null; }
  if (slot === 'shield' && p.equip.weapon && ITEMS[p.equip.weapon.id].two) { p.pack.push(p.equip.weapon); p.equip.weapon = null; }
  p.mana = Math.min(p.mana, maxMana(p));
  ui.dirty = true;
}

function unequip(slot) {
  const p = player;
  const s = p.equip[slot];
  if (!s) return;
  if (p.pack.length >= packSlots(p) && !(ITEMS[s.id].stack && p.pack.some((x) => x.id === s.id))) {
    log('Your backpack is full.', 'warn'); return;
  }
  p.equip[slot] = null;
  addToStacks(p.pack, s.id, s.count, packSlots(p) + 1);
  p.mana = Math.min(p.mana, maxMana(p));
  ui.dirty = true;
}

function dropFromPack(index) {
  const p = player;
  const s = p.pack.splice(index, 1)[0];
  if (!s) return;
  const what = `${s.count > 1 ? `${s.count} ` : ''}${ITEMS[s.id].name}`;
  // with a corpse/pile open, drop into it so you can swap junk for better loot
  const w = ui.window;
  if (w && w.kind === 'loot' && world.piles.includes(w.ref) && w.ref.items.length < 40) {
    addToStacks(w.ref.items, s.id, s.count, 40);
    log(`You put ${what} in the ${w.ref.name}.`, 'dim');
  } else {
    dropPile(p.x, p.y, p.z, [s]);
    log(`You drop ${what}.`, 'dim');
  }
  ui.dirty = true;
}

// ---------- Side panel ----------

function bar(cls, cur, max, label) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (cur / max) * 100)) : 0;
  return `<div class="bar ${cls}"><div class="fill" style="width:${pct}%"></div><span>${label}</span></div>`;
}

function renderPanel() {
  const p = player;
  if (!p) return;
  const v = VOCATIONS[p.voc];
  const xpLo = xpForLevel(p.level);
  const xpHi = xpForLevel(p.level + 1);
  $('stats').innerHTML = `
    <div class="who"><span class="dot" style="background:${v.color}"></span><b>${esc(p.name)}</b>
      <span class="sub">Level ${p.level} ${v.name}</span></div>
    ${bar('hp', p.hp, maxHp(p), `HP ${p.hp} / ${maxHp(p)}`)}
    ${bar('mp', p.mana, maxMana(p), `Mana ${p.mana} / ${maxMana(p)}`)}
    ${bar('xp', p.xp - xpLo, xpHi - xpLo, `XP ${p.xp} · ${xpHi - p.xp} to next`)}
    <div class="kv"><span>Capacity</span><b>${Math.floor(freeCap(p))} oz</b></div>
    <div class="kv"><span>Food</span><b class="${p.food <= 0 ? 'bad' : ''}">${p.food > 0 ? `${Math.ceil(p.food / 60)} min` : 'hungry'}</b></div>
    <div class="kv"><span>Mana regen</span><b>${manaRegen(p)} / 2s</b></div>
    <div class="kv"><span>Speed</span><b>${Math.round(playerSpeed(p))}</b></div>
    <div class="buffs">${p.lumen > 0 ? `<span>☀ light ${Math.ceil(p.lumen)}s</span>` : ''}${p.torch > 0 ? `<span>🕯 torch ${Math.ceil(p.torch)}s</span>` : ''}${p.haste > 0 ? `<span>💨 haste ${Math.ceil(p.haste)}s</span>` : ''}${p.mshield > 0 ? `<span>🔮 mana shield ${Math.ceil(p.mshield)}s</span>` : ''}${p.portal ? '<span>🌀 portal set</span>' : ''}</div>`;

  $('skills').innerHTML = Object.keys(SKILL_NAMES).map((k) => {
    const s = p.skills[k];
    const need = triesNeeded(p, k);
    const pct = Math.floor((s.tries / need) * 100);
    return `<div class="skill"><span>${SKILL_NAMES[k]}</span><b>${s.lvl}</b>
      <div class="sbar"><div style="width:${pct}%"></div></div></div>`;
  }).join('');

  const labels = { amulet: 'neck', head: 'head', armor: 'body', weapon: 'hand', shield: 'hand', legs: 'legs', feet: 'feet', ammo: 'ammo' };
  $('equip').innerHTML = SLOTS.map((s) => `<div class="eq eq-${s}">${slotHtml(p.equip[s], `data-eq="${s}"`, labels[s])}</div>`).join('');

  let packHtml = '';
  for (let i = 0; i < packSlots(p); i++) packHtml += slotHtml(p.pack[i], `data-pack="${i}"`);
  $('pack').innerHTML = packHtml;
  $('gold').textContent = `${countIn(p.pack, 'gold')} gold`;
  $('dropmode').classList.toggle('on', ui.dropMode);
  $('pack').classList.toggle('dropping', ui.dropMode);

  $('hotbar').innerHTML = p.hotkeys.map((h, i) => {
    const key = `<span class="key">${i + 1}</span>`;
    const item = h && h.startsWith('item:') ? ITEMS[h.slice(5)] : null;
    const sp = h && !item ? SPELLS.find((s) => s.words === h) : null;
    if (item) {
      const id = h.slice(5);
      return `<div class="hk" data-hk="${i}" title="${esc(`${item.name} · right-click to change`)}">${key}<span class="g">${item.glyph}</span><span class="n">${countIn(p.pack, id)}</span><span class="lbl">${esc(item.name)}</span></div>`;
    }
    if (sp) {
      return `<div class="hk" data-hk="${i}" title="${esc(`${sp.name} (${sp.mana} mana) · right-click to change`)}">${key}<span class="g">✦</span><span class="lbl">${esc(h)}</span></div>`;
    }
    return `<div class="hk empty" data-hk="${i}" title="Empty · right-click to set">${key}<span class="lbl">—</span></div>`;
  }).join('');

  const qs = Object.entries(p.quests).filter(([id]) => QUESTS[id]);
  $('questsec').classList.toggle('hidden', !qs.length);
  $('quests').innerHTML = qs.map(([id, st]) => {
    const q = QUESTS[id];
    if (st.state === 'done') return `<div class="quest done"><span>${esc(q.name)}</span><b>✓</b></div>`;
    const have = q.type === 'fetch' ? Math.min(countIn(p.pack, q.item), q.n) : st.n;
    const what = q.type === 'fetch' ? ITEMS[q.item].name : CREATURES[q.creature].name;
    const ready = have >= q.n;
    return `<div class="quest ${ready ? 'ready' : ''}" title="${esc(`${q.type === 'fetch' ? 'Bring' : 'Kill'} ${q.n} ${what} · ${NPCS[q.npc].name}`)}">
      <span>${esc(q.name)}</span><b>${ready ? 'return' : `${have}/${q.n}`}</b></div>`;
  }).join('');

  $('chase').textContent = p.chase ? 'Chase: on' : 'Chase: off';
  $('mute').textContent = audio.muted ? '🔇' : '🔊';
  if (ui.window) renderWindow();
  ui.dirty = false;
}

// ---------- Windows (loot, depot, trade) ----------

function openWindow(kind, ref) {
  ui.window = { kind, ref };
  if (kind === 'trade') ui.tradeTab = 'buy';
  renderWindow();
  $('win').classList.remove('hidden');
}

function closeWindow() {
  ui.window = null;
  $('win').classList.add('hidden');
}

function renderWindow() {
  const w = ui.window;
  const p = player;
  const title = $('win-title');
  const body = $('win-body');
  if (w.kind === 'loot') {
    const pile = w.ref;
    title.textContent = pile.kind === 'corpse' ? `You see a ${pile.name}` : pile.name;
    body.innerHTML = pile.items.length
      ? `<div class="grid">${pile.items.map((s, i) => slotHtml(s, `data-loot="${i}"`)).join('')}</div>
         <button data-act="lootall">Take all</button>`
      : '<p class="dim">Nothing left.</p>';
  } else if (w.kind === 'depot') {
    title.textContent = 'Depot chest';
    body.innerHTML = `<p class="dim">Click an item to move it. Items here are safe when you die.</p>
      <h4>Backpack</h4><div class="grid">${p.pack.map((s, i) => slotHtml(s, `data-store="${i}"`)).join('') || '<span class="dim">empty</span>'}</div>
      <h4>Depot (${p.depot.length})</h4><div class="grid">${p.depot.map((s, i) => slotHtml(s, `data-fetch="${i}"`)).join('') || '<span class="dim">empty</span>'}</div>`;
  } else if (w.kind === 'trade') {
    const gold = countIn(p.pack, 'gold');
    title.textContent = `Trade with ${w.ref.name}`;
    const tabs = `<div class="tabs"><button data-tab="buy" class="${ui.tradeTab === 'buy' ? 'on' : ''}">Buy</button><button data-tab="sell" class="${ui.tradeTab === 'sell' ? 'on' : ''}">Sell</button>
      <span class="gold-l">${gold} gold</span></div>`;
    let rows = '';
    if (ui.tradeTab === 'buy') {
      rows = (w.ref.def.shop || SHOP.sells).map((id) => {
        const d = ITEMS[id];
        return `<div class="row" title="${esc(itemTitle(id))}">${slotHtml({ id, count: 1 })}<span class="nm">${d.name}</span>
          <span class="pr ${gold < d.price ? 'bad' : ''}">${d.price}g</span>
          <button data-buy="${id}" data-n="1">1</button>${d.stack ? `<button data-buy="${id}" data-n="10">10</button>` : ''}</div>`;
      }).join('');
    } else {
      const ids = [...new Set(p.pack.map((s) => s.id))].filter((id) => ITEMS[id].sell > 0);
      rows = ids.map((id) => {
        const d = ITEMS[id];
        const n = countIn(p.pack, id);
        return `<div class="row">${slotHtml({ id, count: n })}<span class="nm">${d.name}</span><span class="pr">${d.sell}g</span>
          <button data-sell="${id}" data-n="1">1</button><button data-sell="${id}" data-n="${n}">all</button></div>`;
      }).join('') || '<p class="dim">You have nothing I want.</p>';
    }
    body.innerHTML = tabs + `<div class="rows">${rows}</div>`;
  } else if (w.kind === 'hotkey') {
    const slot = w.ref.slot;
    const cur = p.hotkeys[slot];
    title.textContent = `Hotkey ${slot + 1}`;
    const spells = SPELLS.filter((s) => (!s.voc || s.voc.includes(p.voc)) && (!s.quest || hasFlag(p, s.quest))).map((s) => {
      const locked = p.level < s.lvl;
      return `<div class="pick ${cur === s.words ? 'on' : ''} ${locked ? 'locked' : ''}" data-set="${esc(s.words)}">
        <span class="g">✦</span><span class="nm">${esc(s.name)} <i>${esc(s.words)}</i></span>
        <span class="pr">${s.mana} mp · lvl ${s.lvl}</span></div>`;
    }).join('');
    const items = Object.entries(ITEMS)
      .filter(([, d]) => d.food || d.heal || d.restore || d.rune || d.light)
      .map(([id, d]) => `<div class="pick ${cur === `item:${id}` ? 'on' : ''}" data-set="item:${id}">
        <span class="g">${d.glyph}</span><span class="nm">${esc(d.name)}</span>
        <span class="pr">${countIn(p.pack, id)} carried</span></div>`).join('');
    body.innerHTML = `<p class="dim">Pick what key ${slot + 1} does.</p>
      <h4>Spells</h4><div class="picks">${spells}</div>
      <h4>Items</h4><div class="picks">${items}</div>
      <button data-act="hkclear">Clear slot</button>`;
  }
}

function onWindowClick(e) {
  const t = e.target.closest('[data-loot],[data-act],[data-store],[data-fetch],[data-tab],[data-buy],[data-sell],[data-set]');
  if (!t || !ui.window) return;
  const p = player;
  const w = ui.window;
  if (w.kind === 'hotkey') {
    if (t.dataset.set === undefined && t.dataset.act !== 'hkclear') return;
    p.hotkeys[w.ref.slot] = t.dataset.act === 'hkclear' ? null : t.dataset.set;
    closeWindow();
    ui.dirty = true;
    saveGame();
    return;
  }
  if (t.dataset.loot !== undefined) takeFromPile(w.ref, Number(t.dataset.loot));
  else if (t.dataset.act === 'lootall') { while (w.ref.items.length && takeFromPile(w.ref, 0)); }
  else if (t.dataset.store !== undefined) {
    const s = p.pack.splice(Number(t.dataset.store), 1)[0];
    if (s) addToStacks(p.depot, s.id, s.count, 999);
  } else if (t.dataset.fetch !== undefined) {
    const i = Number(t.dataset.fetch);
    const s = p.depot[i];
    const why = canTake(p, s.id, s.count);
    if (why) log(why, 'warn');
    else { p.depot.splice(i, 1); addToStacks(p.pack, s.id, s.count, packSlots(p)); }
  } else if (t.dataset.tab) ui.tradeTab = t.dataset.tab;
  else if (t.dataset.buy) buy(t.dataset.buy, Number(t.dataset.n));
  else if (t.dataset.sell) sell(t.dataset.sell, Number(t.dataset.n));
  ui.dirty = true;
}

function takeFromPile(pile, i) {
  const p = player;
  const s = pile.items[i];
  if (!s) return false;
  const why = canTake(p, s.id, s.count);
  if (why) { log(why, 'warn'); return false; }
  pile.items.splice(i, 1);
  addToStacks(p.pack, s.id, s.count, packSlots(p));
  sfx('loot');
  if (!pile.items.length && pile.kind !== 'corpse') {
    world.piles.splice(world.piles.indexOf(pile), 1);
    closeWindow();
  }
  ui.dirty = true;
  return true;
}

function buy(id, n) {
  const p = player;
  const d = ITEMS[id];
  const cost = d.price * n;
  if (countIn(p.pack, 'gold') < cost) { npcSay(ui.window.ref, 'You don\'t have enough gold.'); return; }
  // pay first so the freed gold weight counts toward capacity
  removeFrom(p.pack, 'gold', cost);
  const why = canTake(p, id, n);
  if (why) { addToStacks(p.pack, 'gold', cost, packSlots(p) + 5); log(why, 'warn'); return; }
  addToStacks(p.pack, id, n, packSlots(p));
  log(`Bought ${n}x ${d.name} for ${cost} gold.`, 'loot');
}

function sell(id, n) {
  const p = player;
  const got = removeFrom(p.pack, id, n);
  const gold = got * ITEMS[id].sell;
  addToStacks(p.pack, 'gold', gold, packSlots(p) + 5);
  log(`Sold ${got}x ${ITEMS[id].name} for ${gold} gold.`, 'loot');
}

// ---------- Chat & NPCs ----------

function npcSay(n, text) {
  const html = esc(text.replace('{name}', player.name)).replace(/\[(.+?)\]/g, '<span class="kw">$1</span>');
  speech(n, text.replace(/[[\]]/g, '').replace('{name}', player.name), '#7ad0ff');
  log(`<span class="npc">${esc(n.name)}:</span> ${html}`, 'npcline');
}

function nearestNpc(p, range) {
  let best = null;
  for (const n of npcs) {
    if (n.z === p.z && dist(n, p) <= range && (!best || dist(n, p) < dist(best, p))) best = n;
  }
  return best;
}

function handleChat(raw, now) {
  const text = raw.trim().toLowerCase();
  if (!text || player.dead) return;
  if (castSpell(text, now)) { log(`<span class="me">${esc(player.name)}:</span> ${esc(text)}`, 'say'); return; }
  speech(player, raw.trim());
  log(`<span class="me">${esc(player.name)}:</span> ${esc(raw.trim())}`, 'say');
  const p = player;
  if (p.talking && dist(p.talking, p) > 4) p.talking = null;
  const n = p.talking || nearestNpc(p, 4);
  if (!n) return;
  const greet = /^(hi|hello|hey|greetings)\b/.test(text);
  if (!p.talking && !greet) return;
  if (greet) { p.talking = n; npcSay(n, n.def.dialog.hi); return; }
  if (/\b(bye|farewell)\b/.test(text)) { npcSay(n, n.def.dialog.bye); p.talking = null; if (ui.window?.kind === 'trade') closeWindow(); return; }
  const key = Object.keys(n.def.dialog).find((k) => k !== 'hi' && new RegExp(`\\b${k}`).test(text));
  if (!key) { npcSay(n, 'Hm? I don\'t know about that.'); return; }
  const reply = n.def.dialog[key];
  if (reply === '@trade') { npcSay(n, 'Take a look.'); openWindow('trade', n); return; }
  if (reply === '@quest') { handleQuest(n); return; }
  if (reply === '@heal') {
    if (p.hp < maxHp(p)) { healPlayer(p, maxHp(p) - p.hp, '#ffffff'); npcSay(n, 'You are healed. Be more careful.'); } else npcSay(n, 'You look healthy to me.');
    return;
  }
  npcSay(n, reply);
}

// ---------- Quests ----------

// One NPC can hold several quests: turn in the active one, else offer the next unlocked one.
function handleQuest(n) {
  const p = player;
  const list = Object.entries(QUESTS).filter(([, q]) => q.npc === n.key);
  if (!list.length) { npcSay(n, 'I have no work for you.'); return; }
  const active = list.find(([id]) => p.quests[id] && p.quests[id].state === 'active');
  if (active) {
    const [id, q] = active;
    const have = q.type === 'fetch' ? countIn(p.pack, q.item) : p.quests[id].n;
    if (have < q.n) { npcSay(n, `${q.progress} (${Math.min(have, q.n)}/${q.n})`); return; }
    if (q.type === 'fetch') removeFrom(p.pack, q.item, q.n);
    completeQuest(n, id, q);
    return;
  }
  const next = list.find(([id, q]) => !p.quests[id] && (!q.req || (p.quests[q.req] && p.quests[q.req].state === 'done')));
  if (!next) {
    const locked = list.find(([id]) => !p.quests[id]);
    npcSay(n, locked ? (locked[1].locked || 'Come back later.') : 'You have done everything I asked. Thank you.');
    return;
  }
  const [id, q] = next;
  p.quests[id] = { state: 'active', n: 0 };
  npcSay(n, `${q.offer} Say [quest] again when it is done.`);
  log(`Quest started: <b>${esc(q.name)}</b>.`, 'adv');
  sfx('quest');
  ui.dirty = true;
  saveGame();
}

function completeQuest(n, id, q) {
  const p = player;
  p.quests[id].state = 'done';
  npcSay(n, q.done);
  log(`Quest complete: <b>${esc(q.name)}</b>.`, 'adv');
  flashBanner(`Quest complete: ${q.name}`);
  sfx('quest');
  const r = q.reward;
  if (r.gold) { giveOrDrop(p, 'gold', r.gold); log(`You receive ${r.gold} gold.`, 'loot'); }
  for (const [itemId, count] of r.items || []) { giveOrDrop(p, itemId, count); log(`You receive ${count}x ${ITEMS[itemId].name}.`, 'loot'); }
  if (r.flag && !hasFlag(p, r.flag)) p.flags.push(r.flag);
  if (r.xp) { log(`You gained ${r.xp} experience points.`, 'dim'); gainXp(p, r.xp); }
  ui.dirty = true;
  saveGame();
}

function questKill(type) {
  const p = player;
  for (const [id, st] of Object.entries(p.quests)) {
    const q = QUESTS[id];
    if (!q || st.state !== 'active' || q.type !== 'kill' || q.creature !== type || st.n >= q.n) continue;
    st.n++;
    if (st.n >= q.n) log(`${q.name}: done! Return to ${NPCS[q.npc].name}.`, 'adv');
    else log(`${q.name}: ${st.n}/${q.n}.`, 'dim');
    ui.dirty = true;
  }
}

// ---------- Minimap ----------

const MINIMAP_COLORS = {
  '.': '#3f6b2e', ':': '#7a6340', '=': '#6c6a66', 's': '#c8b27a', 'm': '#4d3c26', '_': '#5a4c3e',
  '+': '#8a5c30', 'A': '#e8e0c8', 'O': '#000000', 'L': '#e8c060', 'T': '#1f4a1c', 'R': '#5e5a54',
  '~': '#245a8a', 'D': '#c8a040', ',': '#4a5a32', 'b': '#2a3a2e', '%': '#9a7a48', 'Y': '#2e2a22', '>': '#ffe066',
};
const MM = 3; // px per tile

function markExplored() {
  const p = player;
  if (!p || p.dead || !isDark(p.z)) return;
  const r = Math.ceil(lightRadius(p)) + 1;
  const cells = (p.explored[p.z] || '0'.repeat(MAP_W * MAP_H)).split('');
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = p.x + dx;
      const y = p.y + dy;
      if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H) cells[y * MAP_W + x] = '1';
    }
  }
  p.explored[p.z] = cells.join('');
}

function drawMinimap() {
  const p = player;
  const cv = $('minimap');
  if (!p || !cv) return;
  const m = cv.getContext('2d');
  const z = p.z;
  const seen = isDark(z) ? (p.explored[z] || '') : null;
  m.fillStyle = '#000';
  m.fillRect(0, 0, cv.width, cv.height);
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (seen !== null && seen[y * MAP_W + x] !== '1') continue;
      const c = tileAt(x, y, z);
      m.fillStyle = c === '#' ? (isDark(z) ? '#1e1914' : '#5a554e') : (MINIMAP_COLORS[c] || '#444');
      m.fillRect(x * MM, y * MM, MM, MM);
    }
  }
  const dot = (e, color) => { m.fillStyle = color; m.fillRect(e.x * MM, e.y * MM, MM, MM); };
  for (const n of npcs) if (n.z === z) dot(n, '#7ad0ff');
  for (const c of creatures) if (c.z === z && dist(c, p) <= 7) dot(c, c.def.boss ? '#ff40ff' : '#ff3030');
  m.fillStyle = '#fff';
  m.fillRect(p.x * MM - 1, p.y * MM - 1, MM + 2, MM + 2);
  $('mm-label').textContent = FLOOR_INFO[z] ? FLOOR_INFO[z].name : '';
}
