// world.js — map building, tile queries, line of sight, tile rendering, darkness.
'use strict';

const world = {
  floors: [],      // floors[z][y][x] = tile char
  spawnPoints: [], // { type, x, y, z, creature, respawnAt }
  npcSpots: [],    // { key, x, y, z }
  piles: [],       // corpses, bags and dropped items on the ground
};

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function isDark(z) {
  return !!(FLOOR_INFO[z] && FLOOR_INFO[z].dark);
}

function buildSurface(z, rows) {
  const grid = [];
  for (let y = 0; y < MAP_H; y++) {
    if (rows[y] !== undefined && rows[y].length !== MAP_W) console.warn(`Floor ${z} row ${y} is ${rows[y].length} wide, expected ${MAP_W}.`);
    const row = (rows[y] || '').padEnd(MAP_W, 'T').split('');
    for (let x = 0; x < MAP_W; x++) {
      const m = MARKERS[row[x]];
      if (!m) continue;
      if (m.spawn) world.spawnPoints.push({ type: m.spawn, x, y, z, creature: null, respawnAt: 0 });
      if (m.npc) world.npcSpots.push({ key: m.npc, x, y, z });
      row[x] = m.ground;
    }
    grid.push(row);
  }
  return grid;
}

function carveCave(z, def) {
  const rand = mulberry(def.seed);
  const grid = Array.from({ length: MAP_H }, () => Array(MAP_W).fill('#'));
  const open = (x, y) => {
    if (x > 0 && y > 0 && x < MAP_W - 1 && y < MAP_H - 1) grid[y][x] = '_';
  };
  for (const [rx, ry, rw, rh] of def.rooms) {
    for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) open(x, y);
  }
  const center = (r) => [Math.floor(r[0] + r[2] / 2), Math.floor(r[1] + r[3] / 2)];
  for (const [a, b] of def.links) {
    const [ax, ay] = center(def.rooms[a]);
    const [bx, by] = center(def.rooms[b]);
    const hline = (x0, x1, y) => { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) open(x, y); };
    const vline = (y0, y1, x) => { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) open(x, y); };
    if (rand() < 0.5) { hline(ax, bx, ay); vline(ay, by, bx); } else { vline(ay, by, ax); hline(ax, bx, by); }
  }
  // Roughen walls so caves look organic.
  for (let pass = 0; pass < 2; pass++) {
    const snapshot = grid.map((r) => r.slice());
    for (let y = 1; y < MAP_H - 1; y++) {
      for (let x = 1; x < MAP_W - 1; x++) {
        if (snapshot[y][x] !== '#') continue;
        const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => snapshot[y + dy][x + dx] === '_').length;
        if (n > 0 && rand() < 0.18 * n) grid[y][x] = '_';
      }
    }
  }
  for (const [type, x, y] of def.spawns) {
    open(x, y);
    world.spawnPoints.push({ type, x, y, z, creature: null, respawnAt: 0 });
  }
  return grid;
}

function buildWorld() {
  world.floors = [];
  for (const z of Object.keys(SURFACES).map(Number).sort((a, b) => a - b)) world.floors[z] = buildSurface(z, SURFACES[z]);
  for (const z of Object.keys(CAVES).map(Number).sort((a, b) => a - b)) world.floors[z] = carveCave(z, CAVES[z]);
  for (const l of LINKS) {
    world.floors[l.from][l.y][l.x] = 'O';
    world.floors[l.to][l.y][l.x] = 'L';
    // Guarantee a landing spot next to both ends.
    for (const z of [l.from, l.to]) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const c = world.floors[z][l.y + dy][l.x + dx];
        if (isDark(z) && c === '#') world.floors[z][l.y + dy][l.x + dx] = '_';
      }
    }
  }
  for (const r of ROADS) for (const e of [r.a, r.b]) world.floors[e.z][e.y][e.x] = '>';
}

function tileAt(x, y, z) {
  const f = world.floors[z];
  if (!f || y < 0 || y >= MAP_H || x < 0 || x >= MAP_W) return '#';
  return f[y][x];
}

function tileDef(x, y, z) {
  return TILES[tileAt(x, y, z)] || TILES['#'];
}

function isWalkableTile(x, y, z) {
  return tileDef(x, y, z).walk === true;
}

function isSafeTile(x, y, z) {
  return tileDef(x, y, z).safe === true;
}

function dist(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function lineOfSight(x0, y0, x1, y1, z) {
  let dx = Math.abs(x1 - x0);
  let dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  while (!(x === x1 && y === y1)) {
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
    if (x === x1 && y === y1) break;
    if (tileDef(x, y, z).sight) return false;
  }
  return true;
}

// ---------- Tile rendering (pre-rendered into a cache, 4 variants each) ----------

const tileCache = new Map();

function speckle(ctx, rand, n, colors, size = 2) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[Math.floor(rand() * colors.length)];
    ctx.fillRect(Math.floor(rand() * TILE), Math.floor(rand() * TILE), size, size);
  }
}

function paintGround(ctx, kind, rand) {
  const T = TILE;
  const fills = {
    grass: ['#3f6b2e', ['#4b7a34', '#365f27', '#5a8a3c']],
    path: ['#7a6340', ['#8a7350', '#6a5636', '#94805c']],
    stone: ['#6c6a66', ['#7a7874', '#5e5c58']],
    sand: ['#c8b27a', ['#d6c08a', '#b8a26a']],
    mud: ['#4d3c26', ['#5a4830', '#3e301e', '#2f4a2a']],
    cave: ['#3e352c', ['#4a4036', '#332b23', '#55493c']],
    marsh: ['#4a5a32', ['#56683a', '#3e4c2a', '#5e6a3c']],
    bog: ['#2e3e30', ['#3a4e3a', '#24322a', '#45583a']],
  };
  const [base, dots] = fills[kind];
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, T, T);
  speckle(ctx, rand, kind === 'stone' ? 6 : 14, dots);
  if (kind === 'stone') {
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, T - 1, T - 1);
    ctx.beginPath();
    ctx.moveTo(0, T / 2 + 0.5); ctx.lineTo(T, T / 2 + 0.5);
    ctx.moveTo(T / 2 + 0.5, 0); ctx.lineTo(T / 2 + 0.5, T / 2);
    ctx.stroke();
  }
  if (kind === 'bog') {
    ctx.fillStyle = 'rgba(120,170,150,0.25)';
    for (let i = 0; i < 3; i++) ctx.fillRect(Math.floor(rand() * 26), Math.floor(rand() * 30), 6, 1);
  }
  if (kind === 'marsh' && rand() < 0.6) {
    ctx.strokeStyle = '#6a7a3c';
    for (let i = 0; i < 4; i++) {
      const gx = rand() * T;
      const gy = rand() * T;
      ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + 1, gy - 6); ctx.stroke();
    }
  }
  if (kind === 'grass' && rand() < 0.5) {
    ctx.strokeStyle = '#5c9440';
    for (let i = 0; i < 3; i++) {
      const gx = rand() * T;
      const gy = rand() * T;
      ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + 1, gy - 4); ctx.stroke();
    }
  }
}

function renderTileImage(c, cave, variant) {
  const cv = document.createElement('canvas');
  cv.width = TILE; cv.height = TILE;
  const ctx = cv.getContext('2d');
  const rand = mulberry(variant * 97 + c.charCodeAt(0) * 13 + (cave ? 7 : 0));
  const T = TILE;
  const groundOf = {
    '.': 'grass', ':': 'path', '=': 'stone', 's': 'sand', 'm': 'mud', '_': 'cave', 'T': 'grass', 'R': 'grass',
    ',': 'marsh', 'b': 'bog', '%': 'bog', 'Y': 'marsh', '>': 'path',
  };
  const under = cave ? 'cave' : (groundOf[c] || 'stone');
  if (c !== '#' && c !== '~') paintGround(ctx, under, rand);

  switch (c) {
    case '#':
      if (cave) {
        ctx.fillStyle = '#1e1914'; ctx.fillRect(0, 0, T, T);
        speckle(ctx, rand, 10, ['#2a231c', '#15110d', '#33291f'], 3);
        ctx.fillStyle = 'rgba(120,100,80,0.18)'; ctx.fillRect(0, 0, T, 3);
      } else {
        ctx.fillStyle = '#5a554e'; ctx.fillRect(0, 0, T, T);
        ctx.fillStyle = '#6e6860';
        for (let row = 0; row < 4; row++) {
          const off = row % 2 ? 8 : 0;
          for (let col = -1; col < 3; col++) ctx.fillRect(col * 16 + off + 1, row * 8 + 1, 14, 6);
        }
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, T - 4, T, 4);
      }
      break;
    case '~': {
      ctx.fillStyle = '#245a8a'; ctx.fillRect(0, 0, T, T);
      speckle(ctx, rand, 6, ['#2c6898', '#1e4e7a'], 3);
      break;
    }
    case 'T': {
      ctx.fillStyle = '#5a3a1e'; ctx.fillRect(13, 18, 6, 12);
      ctx.fillStyle = '#1f4a1c';
      ctx.beginPath(); ctx.arc(16, 13, 13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2d6426';
      ctx.beginPath(); ctx.arc(13, 10, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3c7a30';
      ctx.beginPath(); ctx.arc(11, 8, 3, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'R': {
      ctx.fillStyle = '#5e5a54';
      ctx.beginPath(); ctx.ellipse(16, 18, 14, 11, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7a756d';
      ctx.beginPath(); ctx.ellipse(12, 14, 7, 5, -0.4, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case '+':
      ctx.fillStyle = '#5a3c1e'; ctx.fillRect(0, 0, 4, T); ctx.fillRect(T - 4, 0, 4, T);
      break;
    case 'A':
      ctx.fillStyle = '#d8d0b8'; ctx.fillRect(4, 6, 24, 20);
      ctx.fillStyle = '#c8a040'; ctx.fillRect(4, 6, 24, 3); ctx.fillRect(14, 11, 4, 12); ctx.fillRect(10, 15, 12, 4);
      break;
    case 'D':
      ctx.fillStyle = '#6a4424'; ctx.fillRect(4, 9, 24, 18);
      ctx.fillStyle = '#8a5c30'; ctx.fillRect(4, 9, 24, 6);
      ctx.fillStyle = '#d0a840'; ctx.fillRect(14, 14, 4, 5);
      ctx.strokeStyle = '#3a2410'; ctx.strokeRect(4.5, 9.5, 23, 17);
      break;
    case 'O':
      ctx.fillStyle = '#0a0806';
      ctx.beginPath(); ctx.ellipse(16, 17, 12, 9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#2a2018'; ctx.lineWidth = 2; ctx.stroke();
      break;
    case '%':
      ctx.fillStyle = '#7a5a34'; ctx.fillRect(0, 3, T, T - 6);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      for (let i = 3; i < T - 3; i += 6) ctx.fillRect(0, i, T, 1);
      ctx.fillStyle = '#4a3420'; ctx.fillRect(3, 1, 3, 3); ctx.fillRect(T - 6, 1, 3, 3);
      ctx.fillRect(3, T - 4, 3, 3); ctx.fillRect(T - 6, T - 4, 3, 3);
      break;
    case 'Y':
      ctx.strokeStyle = '#4a4034'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(16, 30); ctx.lineTo(16, 8); ctx.moveTo(16, 16); ctx.lineTo(7, 7);
      ctx.moveTo(16, 13); ctx.lineTo(25, 5); ctx.moveTo(16, 21); ctx.lineTo(24, 15); ctx.stroke();
      ctx.lineWidth = 1;
      break;
    case '>':
      ctx.fillStyle = '#5a3c1e'; ctx.fillRect(14, 10, 4, 20);
      ctx.fillStyle = '#c8a060';
      ctx.beginPath(); ctx.moveTo(5, 5); ctx.lineTo(23, 5); ctx.lineTo(28, 10); ctx.lineTo(23, 15); ctx.lineTo(5, 15); ctx.fill();
      ctx.strokeStyle = '#5a3c1e'; ctx.stroke();
      break;
    case 'L':
      ctx.fillStyle = '#8a6438'; ctx.fillRect(8, 1, 3, 30); ctx.fillRect(21, 1, 3, 30);
      for (let i = 4; i < T; i += 7) ctx.fillRect(8, i, 16, 3);
      ctx.fillStyle = 'rgba(255,240,200,0.12)'; ctx.fillRect(0, 0, T, T);
      break;
    default:
      break;
  }
  return cv;
}

function drawTile(ctx, x, y, z, px, py, now) {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return;
  const c = tileAt(x, y, z);
  const variant = Math.floor(hash2(x, y, z) * 4);
  const dark = isDark(z);
  const key = `${c}|${dark ? 1 : 0}|${variant}`;
  let img = tileCache.get(key);
  if (!img) { img = renderTileImage(c, dark, variant); tileCache.set(key, img); }
  ctx.drawImage(img, px, py);
  if (c === '~') {
    const t = now / 900 + hash2(x, y) * 6;
    ctx.strokeStyle = 'rgba(180,220,255,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const wy = py + 10 + Math.sin(t) * 3;
    ctx.moveTo(px + 4, wy); ctx.quadraticCurveTo(px + 10, wy - 3, px + 16, wy);
    ctx.moveTo(px + 14, wy + 12); ctx.quadraticCurveTo(px + 20, wy + 9, px + 27, wy + 12);
    ctx.stroke();
  }
}

// ---------- Darkness ----------

let darkCanvas = null;

function drawDarkness(ctx, lights, w, h, ambient) {
  if (ambient <= 0) return;
  if (!darkCanvas) { darkCanvas = document.createElement('canvas'); }
  darkCanvas.width = w; darkCanvas.height = h;
  const d = darkCanvas.getContext('2d');
  d.fillStyle = `rgba(4,3,8,${ambient})`;
  d.fillRect(0, 0, w, h);
  d.globalCompositeOperation = 'destination-out';
  for (const l of lights) {
    const r = l.r * TILE;
    const g = d.createRadialGradient(l.x, l.y, r * 0.25, l.x, l.y, r);
    g.addColorStop(0, `rgba(0,0,0,${l.a ?? 1})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    d.fillStyle = g;
    d.beginPath(); d.arc(l.x, l.y, r, 0, Math.PI * 2); d.fill();
  }
  d.globalCompositeOperation = 'source-over';
  ctx.drawImage(darkCanvas, 0, 0);
}
