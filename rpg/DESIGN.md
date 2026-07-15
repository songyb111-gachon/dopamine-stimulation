# 찰나 RPG — DESIGN

A small, complete 2D top-down JRPG built in Godot 3.5, seeded from the
MIT-licensed `godotengine/godot-demo-projects` "Role Playing Game" demo
(grid movement, turn-queue combat, JSON dialogue) — used with the repo
owner's explicit consent. See `LICENSE-godot-demo-projects.md` for the
original license.

**Why this exists:** the brand's whole identity (찰나 = "the instant/moment")
is a precision-timing dopamine hook — tap exactly on the gold band and get
rewarded. This RPG carries that same hook into a full JRPG's turn-based
combat instead of discarding it for a generic damage-roll system.

## 1. Signature mechanic — timed-hit combat

Every offensive/defensive action opens a **timing prompt**: a horizontal
gauge with a marker sweeping across it once, and two nested zones drawn in
the same visual language as the original 찰나 (cyan GOOD band containing a
gold PERFECT band). Player presses the confirm input while the marker is
inside a zone.

| Result | Window | Effect |
|---|---|---|
| **PERFECT** | inner gold band | ×1.5 damage (attack) / ×0.25 damage taken (defend), screen-shake + gold burst + rising chime |
| **GOOD** | outer cyan band | ×1.0 damage / ×0.6 damage taken, normal hit feedback |
| **MISS** | outside both | ×0.5 damage / ×1.0 damage taken (defend gives no reduction), muted thud |

Marker speed and PERFECT-band width scale with enemy tier — the boss fight
runs three distinct phases that narrow the band and speed the sweep as its
HP drops (see §3), echoing the original game's difficulty ramp — never
below a hard floor so it never becomes unfair-fast.

## 2. Progression

- **XP/Level**: defeating an enemy grants XP; level-up raises max HP,
  attack, and defense on a simple curve (`xpToNext(L) = 20 + 10*L`).
- **Inventory**: a flat list of item stacks (`{id, count}`). Potions heal
  HP and are usable from the combat menu (consumes the player's turn, no
  timing prompt — consumables are the "safe" option by design, same
  philosophy as CHALNA's GOOD-tier being deliberately less exciting than
  PERFECT).
- **Equipment**: a weapon and armor slot; each equippable item adds a flat
  attack/defense bonus, from two sources:
  - **Combat drops** — auto-equipped the first time a specific enemy is
    defeated (가시슬라임 drops armor, 돌골렘 drops stronger armor, 폐허의
    파수병 drops a weapon-slot trinket, 균열의 파수꾼 drops the best
    weapon); killing the same enemy again does not re-grant it.
  - **The village shop** — flat-priced, always-in-stock, deliberately
    weaker than any combat drop (§4) so field loot stays worth fighting for.

## 3. World structure

Four zones on **one continuous, camera-scrolled map** (no loading screens,
no separate scenes) — the player walks the whole distance rather than
transitioning between discrete screens:

1. **마을 (Village)** — the spawn point and only zone with zero combat
   encounters; every pawn here is `CellType.ACTOR`/`OBJECT` with no
   `combat_actor`, so there is no code path into a fight while inside its
   bounds. Houses the shop NPC (시계공 노인), a lore NPC (마을 원로) that
   doubles as a soft in-fiction tutorial, and a notice board.
2. **숲길 (Forest Path)** — the first combat zone: 슬라임 (weak) and
   가시슬라임 (medium, drops armor). Defeating 가시슬라임 sets the flag
   that unlocks the gate east into the Cave — the fight itself is the
   "proof," no separate fetch-quest.
3. **동굴 (Cave)** — darker/dimmer (a translucent tint overlay, not new
   tile art), tougher enemies: 동굴박쥐 (fast, low HP) and 돌골렘
   (mini-boss-tier, drops the strongest non-boss armor). A hidden chest
   (빛나는 수정 갑옷, the best pre-boss armor) sits behind a "this looks
   like a dead end but isn't" nudge; opening it is what unlocks the gate
   into the Ruins.
4. **폐허 (Ruins)** — 폐허의 파수병 guards the approach, then
   **균열의 파수꾼** (relocated here from its original Forest placement)
   in a **3-phase fight**: PERFECT-band width and sweep speed both tighten
   at 65% and 30% HP, with a one-line boss taunt (fading toast, non-
   blocking) marking each transition.

**Quest gates** are physical: the connecting corridor between Forest↔Cave
and Cave↔Ruins is TileMap wall until its flag is set, then
`Grid.open_gate()` clears it live — no separate "key" item, the qualifying
combat/loot event *is* the key. A sign at each gate shows blocked/unlocked
flavor text that swaps immediately when the flag flips (not just on
reload). Two post-boss NPC lines (elder + shop) unlock the same way,
turning the ending into an enrichment of a place you can revisit rather
than a wall or a credits screen — consistent with the no-punishing-walls
soft-defeat rule below.

Everything above — terrain, decorations, pawns, the camera, the gates —
was built by *programmatically* editing the live scene tree with a Godot
headless script (`TileMap.set_cellv()` in loops, `PackedScene.pack()` +
`ResourceSaver.save()` to write it back) rather than hand-typing the
binary-ish `tile_data` PoolIntArray format directly. That sidesteps the
corruption risk that scoped an earlier pass down to a single zone, and was
verified safe with a pack-and-reload round-trip test before any real edits.

## 4. Shop

One NPC (시계공 노인) in the Village opens a buy-only UI listing potions
and two modest equipment pieces, priced against the existing gold economy
(weak kill = 2g, medium = 6g, boss = 25g): a small potion (4g, +8 HP) is
affordable within the first minute of play, while the shop's weapon/armor
(+1 each, 15g apiece) are deliberately weaker than any combat drop — the
shop is a safety net for underleveled or unlucky runs, not a way to skip
the field-loot progression. Flat prices, no stock limits, no currency but
the same `gold` combat already grants.

## 5. Save system

Single JSON save at `user://savegame.json`: player position, level, XP, HP,
gold, inventory, equipment, and a `flags` dict for quest/story state (gate
unlocks, loot flags, epilogue triggers). Title screen shows **이어하기**
only if a save file exists.

## 6. Cut list

No microtransactions, no ads, no gacha loot — equipment/items are either
found in the world or bought at flat prices with in-world currency earned
from combat, same no-dark-patterns rule as the rest of this project. No
fast travel and no shortcuts between zones — the map is one linear corridor
by design, so there was nothing to cut there, just nothing extra added.
