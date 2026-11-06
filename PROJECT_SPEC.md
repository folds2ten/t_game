# PROJECT_SPEC: t_game (Deepvale)

> Last updated: 2026-11-05
> Category: personal
> Status: active
> Stage: build

---

## Purpose
A small single-player, tile-based RPG you play in the browser. It uses classic tile-RPG mechanics, and all content is original: names, map, creatures, items, spell words and procedurally drawn art. You play solo for fun.

---

## Stack
| Layer | Choice | Notes |
|-------|--------|-------|
| Language | JavaScript (vanilla) | classic `<script>` tags that share globals, no modules |
| Framework | none | HTML5 Canvas 2D + DOM side panel |
| Database / Storage | localStorage | key `deepvale_save_v1` |
| AI / LLM | none | |
| Auth | none | |
| Deployment | local | double-click `index.html` |
| Key Libraries | none | |

---

## Project Location
- Code: `C:\Users\Caleb\Desktop\claude_projects\personal\projects\t_game\`
- Repo: https://github.com/folds2ten/t_game (public, personal account)

---

## Architecture Overview
- `js/data.js` holds all content: tiles, surface map, cave room layouts, creatures, items, vocations, spells, NPC dialogue and the shop.
- `js/world.js` builds the floors (the surface from strings, caves carved from rooms and corridors with a seeded RNG). It also handles LOS, tile rendering with a variant cache, and the darkness overlay.
- `js/entities.js` covers the player, creatures, NPCs, inventory/capacity, step movement and BFS pathfinding.
- `js/combat.js` runs the 2s attack tick, damage formulas, skill-by-use, XP curve, spells, runes and death.
- `js/ui.js` handles the log, floating text, effects, side panel, loot/depot/trade windows, NPC keyword chat and item use.
- `js/render.js` draws the canvas. `js/main.js` does boot, the game loop, input, road/hole travel and save/load.
- `js/audio.js` makes synthesized WebAudio sound effects (`sfx(name)`) and handles the mute toggle (`deepvale_mute`).
- Quests (`QUESTS` in data.js) run through `handleQuest`/`questKill` in ui.js. The minimap is `drawMinimap` in ui.js.

---

## Key Decisions
| Date | Decision | Reason |
|------|----------|--------|
| 2026-11-03 | Vanilla canvas + classic scripts, no build | Opens by double-click, same as the Hawaii project |
| 2026-11-03 | Original content only; classic tile-RPG mechanics, no references to other games | Stands on its own; nothing borrowed |
| 2026-11-03 | Emoji for creatures and items, canvas shapes for tiles and humanoids | Fast to make; real sprites can come later |
| 2026-11-03 | Caves are generated from room/corridor data, not hand-drawn strings | Hand-aligning strings is error-prone |
| 2026-11-03 | Quick Flow, not the full BMAD pipeline | Weekend-sized game |
| 2026-11-03 | Save format changes are additive only; `hydratePlayer` back-fills new fields | Keep `deepvale_save_v1` saves loading |
| 2026-11-03 | Invoker gets 6 more spells (fulgur, runa ignis, ignis unda, ignis magna, arcanum scutum, ignis pluvia) | Invoker had too few spells; new kinds: `wave`, `conjure`, `mshield` |
| 2026-11-03 | Cloth gear: low armor, new `mreg` (mana per 2s tick) / `mpmax` item stats; vocation magic items (wands, tomes, robes, cowl, hollow staff) are drop-only except apprentice robe + cloth hood | Gives casters an armor-vs-mana trade-off and makes monster loot worth checking |
| 2026-11-03 | Bigger bags (traveler's pack 30, delver's pack 40) are consumed on use and set a permanent `packSlots`; death drops contents, never the upgrade | 20 slots ended hunts early; keeps the death penalty unchanged |
| 2026-11-04 | Floors are described by `FLOOR_INFO` (name, dark) and outdoor maps live in `SURFACES`. Never test `z > 0`; use `isDark(z)` | A second outdoor region (Saltmarsh, z=10) broke the "z>0 = cave" assumption |
| 2026-11-04 | Regions connect through `ROADS` (`>` sign tiles). Holes can be gated by a player flag (`LINKS[].gate`) | The Sunken Vault (z=3) under the King's hall opens only after the Hollow Crown quest |
| 2026-11-04 | Data-driven quests: an NPC dialog value `@quest`, fetch/kill types, `req` chains, and rewards of xp/gold/items/flag. State lives in `p.quests` + `p.flags` | Gives post-King goals without per-quest code |
| 2026-11-04 | Marsh-rite spells (one per vocation, lvl 20) need the `marsh_rite` flag. Area spells can scale off `stat: 'melee'/'distance'` | Gives Wardens and Rangers an AoE that uses their own skill |
| 2026-11-04 | Boss summons use a throwaway spawn point (`summoned: true`): they never respawn and drop no loot | Avoids loot farming and permanent extra spawns |
| 2026-11-04 | Save stores dead spawn points' remaining seconds (`spawns`), checked by index + type | A reload can't instantly respawn a boss |
| 2026-11-04 | Gold weighs 0. Dropping from the pack (Shift+click or the 🗑 drop-mode toggle) goes into the open corpse/pile when a loot window is open, otherwise onto your tile | Gold made capacity punishing; you can now swap junk for better loot mid-corpse |
| 2026-11-05 | Building tiles (`=`, `+`, `A`) are protection zones (`safe: true`, `isSafeTile`). Monsters can't enter or attack into them and drop aggro; the player can't melee, cast attack spells or use attack runes from inside | Town needed safe spaces; blocking attacks both ways stops doorway cheese |
| 2026-11-05 | GitHub repo on `folds2ten` (personal), public. `README.md` + `GUIDE.md` for players; screenshots regenerated by `scripts/screenshots.py` (Playwright, stages scenes through game globals) | Shareable repo with a player guide that can be refreshed when content changes |
| 2026-11-05 | Public-facing docs never name or compare Deepvale to another game | Don't step on toes |
| 2026-11-03 | Invoker `portus`: first cast saves your tile as `p.portal` and ports you to `SHOP_PORT`; second cast returns you and clears it. Survives death and reloads | Lets casters restock and sell without walking back |

---

## Current Status
Playable end to end:
- 4 vocations
- Deepvale town plus 2 cave floors, with the Hollow King boss
- Saltmarsh region east of town via road: outpost (Captain Maren, Wend the herbalist with her own shop and a depot), toads, lurkers, fen hags and drowned knights (lvl 15–25)
- Sunken Vault (lvl 25+) under the King's hall, behind a seal: wraiths, sentinels, and the Mother of Silt boss, who summons minions
- 5 quests (Brann, Odran, Maren ×2, Wend) and a quest panel; 4 quest-taught marsh-rite spells
- Minimap (dark floors reveal as explored), synthesized sound effects with a mute toggle, and spawn timers that survive a reload
- Skills improve by use
- Typed spells, runes and potions
- NPC trade, depot and food regen
- Monsters drop usable gear, including cloth/caster items that trade armor for mana regen and max mana
- Death penalty: lose 10% XP and half your skill progress, and your backpack drops where you died
- Buildings are protection zones: monsters can't follow you inside
- Saves to localStorage

---

## Open Questions / Ideas
- [x] Minimap
- [x] Sound effects
- [x] Quests beyond the boss
- [ ] More quests / repeatable dailies
- [ ] A Saltmarsh dungeon or a third region
- [ ] Real sprite art
- [x] Hotkey rebinding UI (9 slots, right-click a slot to pick a spell/item)
- [x] Persist creature state across reloads (spawn timers only; live creature HP/positions are not saved)

---

## How to Run
```bash
# Run: double-click index.html, or serve it:
python -m http.server 8765   # then open http://127.0.0.1:8765
```

---

## Context for Claude
- Every script shares one global scope (classic scripts). Load order lives in `index.html`.
- Content changes belong in `data.js`. Floors link through `LINKS` (a hole on `from`, a ladder on `to` at the same x,y) and `ROADS` (sign to sign). A new floor needs a `FLOOR_INFO` entry.
- Spawn timers are saved by spawn-point index. Appending floors is safe; reordering spawns just drops old timers (a type check guards it).
- Panel DOM is rebuilt only when `ui.dirty` is set. Clicks use `pointerdown` so a rebuild can't swallow them.
- Draw emoji on the canvas with an opaque `fillStyle`. Chrome applies the fill alpha to color glyphs.
