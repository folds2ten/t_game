// render.js — draws the world, entities, effects and text onto the game canvas.
'use strict';

const cam = { x: 0, y: 0 };

function hpColor(frac) {
  if (frac > 0.75) return '#20c020';
  if (frac > 0.5) return '#80c020';
  if (frac > 0.25) return '#e0c020';
  if (frac > 0.1) return '#e06020';
  return '#c01010';
}

function toScreen(x, y) {
  return [(x - cam.x) * TILE, (y - cam.y) * TILE];
}

function drawHumanoid(ctx, sx, sy, color, dir, now, moving, flash) {
  const bob = moving ? Math.sin(now / 70) * 1.5 : 0;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(sx + 16, sy + 28, 9, 4, 0, 0, Math.PI * 2); ctx.fill();
  // legs
  ctx.fillStyle = '#3a2e24';
  const step = moving ? Math.sin(now / 70) * 2 : 0;
  ctx.fillRect(sx + 11, sy + 20 + step, 4, 8);
  ctx.fillRect(sx + 17, sy + 20 - step, 4, 8);
  // body
  ctx.fillStyle = color;
  ctx.fillRect(sx + 9, sy + 11 + bob, 14, 11);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(sx + 9, sy + 19 + bob, 14, 3);
  // head
  ctx.fillStyle = '#e0b890';
  ctx.beginPath(); ctx.arc(sx + 16, sy + 8 + bob, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3a2618';
  ctx.beginPath(); ctx.arc(sx + 16, sy + 6 + bob, 6, Math.PI, Math.PI * 2); ctx.fill();
  // eyes show facing
  ctx.fillStyle = '#111';
  const ex = [0, 3, 0, -3][dir];
  if (dir !== 0) { ctx.fillRect(sx + 13 + ex, sy + 8 + bob, 2, 2); ctx.fillRect(sx + 17 + ex, sy + 8 + bob, 2, 2); }
  if (flash) { ctx.fillStyle = 'rgba(255,60,60,0.45)'; ctx.fillRect(sx + 8, sy + 1, 16, 27); }
}

function drawNameBar(ctx, sx, sy, name, frac, color) {
  ctx.font = 'bold 10px Verdana, sans-serif';
  ctx.textAlign = 'center';
  const c = color || hpColor(frac);
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#000';
  ctx.strokeText(name, sx + 16, sy - 9);
  ctx.fillStyle = c;
  ctx.fillText(name, sx + 16, sy - 9);
  if (frac !== null) {
    ctx.fillStyle = '#000';
    ctx.fillRect(sx + 2, sy - 6, 28, 4);
    ctx.fillStyle = c;
    ctx.fillRect(sx + 3, sy - 5, Math.max(0, 26 * frac), 2);
  }
}

function drawPile(ctx, pile, sx, sy, now) {
  if (pile.kind === 'corpse') {
    const age = (Date.now() - pile.born) / 1000;
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.filter = 'grayscale(0.8) brightness(0.6)';
    ctx.translate(sx + 16, sy + 20);
    ctx.rotate(Math.PI / 2);
    ctx.font = `${age > 60 ? 14 : 20}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000';
    ctx.fillText(pile.glyph || '💀', 0, 0);
    ctx.restore();
    ctx.fillStyle = 'rgba(120,10,10,0.35)';
    ctx.beginPath(); ctx.ellipse(sx + 16, sy + 24, 9, 4, 0, 0, Math.PI * 2); ctx.fill();
  } else {
    const g = pile.glyph || (pile.items[0] ? ITEMS[pile.items[0].id].glyph : '');
    ctx.font = '18px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000';
    ctx.fillText(g, sx + 16, sy + 18);
    ctx.textBaseline = 'alphabetic';
  }
}

function drawEffect(ctx, e, now) {
  const t = (now - e.born) / e.ms;
  const [sx, sy] = toScreen(e.x, e.y);
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - t);
  if (e.type === 'burst') {
    ctx.fillStyle = e.color;
    const r = 4 + t * 12;
    ctx.beginPath(); ctx.arc(sx + 16, sy + 16, r, 0, Math.PI * 2); ctx.fill();
  } else if (e.type === 'ring') {
    ctx.strokeStyle = e.color; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(sx + 16, sy + 16, 6 + t * 30, 0, Math.PI * 2); ctx.stroke();
  } else if (e.type === 'sparkle') {
    ctx.fillStyle = e.color;
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9 + e.born;
      ctx.fillRect(sx + 16 + Math.cos(a) * 10, sy + 22 - t * 22 + Math.sin(a) * 4, 3, 3);
    }
  } else if (e.type === 'proj') {
    const [tx, ty] = toScreen(e.tx, e.ty);
    const k = Math.min(1, t);
    const px = sx + (tx - sx) * k + 16;
    const py = sy + (ty - sy) * k + 16;
    ctx.globalAlpha = 1;
    ctx.fillStyle = e.color;
    ctx.beginPath(); ctx.arc(px, py, e.big ? 5 : 2.5, 0, Math.PI * 2); ctx.fill();
    if (!e.big) {
      ctx.strokeStyle = e.color; ctx.lineWidth = 2;
      const ang = Math.atan2(ty - sy, tx - sx);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - Math.cos(ang) * 9, py - Math.sin(ang) * 9); ctx.stroke();
    }
  }
  ctx.restore();
}

function drawText(ctx, text, x, y, color, size = 11) {
  ctx.font = `bold ${size}px Verdana, sans-serif`;
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#000';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function wrap(text, max) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max) { if (cur) lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines;
}

function render(ctx, now) {
  const p = player;
  const W = VIEW_W * TILE;
  const H = VIEW_H * TILE;
  const pr = renderPos(p, now);
  cam.x = pr.x - (VIEW_W - 1) / 2;
  cam.y = pr.y - (VIEW_H - 1) / 2;
  const z = p.z;

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  const x0 = Math.floor(cam.x) - 1;
  const y0 = Math.floor(cam.y) - 1;
  for (let y = y0; y <= y0 + VIEW_H + 2; y++) {
    for (let x = x0; x <= x0 + VIEW_W + 2; x++) {
      const [sx, sy] = toScreen(x, y);
      drawTile(ctx, x, y, z, Math.round(sx), Math.round(sy), now);
    }
  }

  for (const pile of world.piles) {
    if (pile.z !== z) continue;
    const [sx, sy] = toScreen(pile.x, pile.y);
    if (sx < -TILE || sy < -TILE || sx > W || sy > H) continue;
    drawPile(ctx, pile, sx, sy, now);
  }

  // target square
  if (p.target) {
    const tp = renderPos(p.target, now);
    const [sx, sy] = toScreen(tp.x, tp.y);
    ctx.strokeStyle = '#ff2020'; ctx.lineWidth = 2;
    ctx.strokeRect(sx + 1, sy + 1, TILE - 2, TILE - 2);
  }
  // walk destination marker
  if (p.path && p.path.length) {
    const [dx, dy] = p.path[p.path.length - 1];
    const [sx, sy] = toScreen(dx, dy);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
    ctx.strokeRect(sx + 8.5, sy + 8.5, 15, 15);
  }

  const ents = [...creatures.filter((c) => c.z === z), ...npcs.filter((n) => n.z === z)];
  if (!p.dead) ents.push(p);
  ents.sort((a, b) => renderPos(a, now).y - renderPos(b, now).y);
  const labels = [];
  for (const e of ents) {
    const rp = renderPos(e, now);
    const [sx, sy] = toScreen(rp.x, rp.y);
    if (sx < -TILE * 2 || sy < -TILE * 2 || sx > W + TILE || sy > H + TILE) continue;
    const moving = isMoving(e, now);
    if (e.kind === 'creature') {
      const big = e.def.boss ? 34 : 24;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(sx + 16, sy + 27, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.save();
      ctx.font = `${big}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const bob = moving ? Math.sin(now / 60) * 1.5 : 0;
      if (e.dir === 1) { ctx.translate(sx + 16, 0); ctx.scale(-1, 1); ctx.translate(-(sx + 16), 0); }
      if (now < e.hitFlash) ctx.filter = 'brightness(2.2)';
      ctx.fillStyle = '#000';
      ctx.fillText(e.def.glyph, sx + 16, sy + 16 + bob - (e.def.boss ? 4 : 0));
      ctx.restore();
      labels.push(() => drawNameBar(ctx, sx, sy, e.def.name, e.hp / e.maxHp));
    } else if (e.kind === 'npc') {
      drawHumanoid(ctx, sx, sy, e.def.color, e.dir, now, moving, false);
      labels.push(() => drawNameBar(ctx, sx, sy, e.name, null, '#7ad0ff'));
    } else {
      if (p.cloak) { ctx.save(); ctx.globalAlpha = 0.4; } // cloaked: translucent
      drawHumanoid(ctx, sx, sy, VOCATIONS[p.voc].color, e.dir, now, moving, now < (p.hitFlash || 0));
      if (p.cloak) ctx.restore();
      labels.push(() => drawNameBar(ctx, sx, sy, p.name, p.hp / maxHp(p)));
    }
  }

  ui.effects = ui.effects.filter((e) => now - e.born < e.ms);
  for (const e of ui.effects) if (e.z === z) drawEffect(ctx, e, now);

  // darkness on cave floors
  if (isDark(z)) {
    const lights = [];
    const [px, py] = toScreen(pr.x, pr.y);
    if (!p.dead) lights.push({ x: px + 16, y: py + 16, r: lightRadius(p) });
    for (const c of creatures) {
      if (c.z !== z || !c.def.glow) continue;
      const cp = renderPos(c, now);
      const [cx, cy] = toScreen(cp.x, cp.y);
      lights.push({ x: cx + 16, y: cy + 16, r: c.def.glow, a: 0.8 });
    }
    for (const e of ui.effects) {
      if (e.z !== z || e.type !== 'burst') continue;
      const [ex, ey] = toScreen(e.x, e.y);
      lights.push({ x: ex + 16, y: ey + 16, r: 1.2, a: 0.6 });
    }
    for (const l of LINKS) {
      if (l.to !== z) continue;
      const [lx, ly] = toScreen(l.x, l.y);
      lights.push({ x: lx + 16, y: ly + 16, r: 1.6, a: 0.5 });
    }
    drawDarkness(ctx, lights, W, H, 0.95);
  }

  for (const fn of labels) fn();

  ui.speeches = ui.speeches.filter((s) => now - s.born < s.ms);
  for (const s of ui.speeches) {
    if (s.ent.z !== z) continue;
    const rp = renderPos(s.ent, now);
    const [sx, sy] = toScreen(rp.x, rp.y);
    const lines = wrap(s.text, 30).slice(0, 4);
    lines.forEach((ln, i) => drawText(ctx, ln, sx + 16, sy - 22 - (lines.length - 1 - i) * 13, s.color, 11));
  }

  ui.floats = ui.floats.filter((f) => now - f.born < f.ms);
  for (const f of ui.floats) {
    if (f.z !== z) continue;
    const t = (now - f.born) / f.ms;
    const [sx, sy] = toScreen(f.x, f.y);
    ctx.globalAlpha = Math.min(1, 2 - t * 2);
    drawText(ctx, f.text, sx + 16, sy + 4 - t * 22 + f.dy, f.color, 12);
    ctx.globalAlpha = 1;
  }

  // floor indicator
  ctx.font = 'bold 11px Verdana, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText(FLOOR_INFO[z] ? FLOOR_INFO[z].name : `Floor ${z}`, 6, H - 6);
}
