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

Marker speed and PERFECT-band width both come from `TimingConfig` and
scale with enemy tier (later/tougher fights narrow the band, exactly like
the original game's difficulty ramp) — never below a hard floor so it
never becomes unfair-fast.

## 2. Progression

- **XP/Level**: defeating an enemy grants XP; level-up raises max HP,
  attack, and defense on a simple curve (`xpToNext(L) = 20 + 10*L`).
- **Inventory**: a flat list of item stacks (`{id, count}`). Potions heal
  HP and are usable from the combat menu (consumes the player's turn, no
  timing prompt — consumables are the "safe" option by design, same
  philosophy as CHALNA's GOOD-tier being deliberately less exciting than
  PERFECT).
- **Equipment**: a weapon and armor slot; each equippable item adds a flat
  attack/defense bonus. Dropped and auto-equipped the first time a specific
  enemy is defeated (the medium-tier enemy drops armor, the boss drops a
  weapon) — killing the same enemy again does not re-grant it.

## 3. World structure

The shipped build is one densely-populated exploration area rather than the
original four-zone plan — hand-authoring several more Godot TileMaps by
directly editing the binary-ish `tile_data` text format (no GUI editor in
this environment) was assessed as too high-risk for corruption relative to
the payoff, so scope was deliberately narrowed to keep everything verified
and working end to end. A three-tier enemy roster gives it a real
difficulty curve without more geography:

- **슬라임 (Slime)** — weak, low HP/damage, the first fight players meet.
- **가시슬라임 (Thorn Slime)** — medium tier, tougher stats, drops the
  first piece of armor on defeat.
- **균열의 파수꾼 (Rift Guardian)** — boss-tier: distinct sprite (not a
  recolor), highest HP/damage, drops a weapon on defeat.

A lore object (readable sign) rounds out the scene. Multi-area traversal
(village → forest → cave → ruins) remains documented here as the intended
direction for a future pass, not something to claim as shipped.

## 4. Save system

Single JSON save at `user://savegame.json`: player position/area, level,
XP, HP, inventory, equipment, and a `flags` dict for story/quest state.
Title screen shows **이어하기** only if a save file exists.

## 5. Cut list

No microtransactions, no ads, no gacha loot — equipment/items are either
found in the world or bought with in-world currency earned from combat,
same no-dark-patterns rule as the rest of this project.
