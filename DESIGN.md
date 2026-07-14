# 찰나 (CHALNA) — FINAL DESIGN SPECIFICATION v1.0

**One-line pitch:** A needle sweeps around a dial toward a glowing arc. One tap. Three verdicts. Every miss tells you *exactly* how many milliseconds you were from glory.

**Basis for selection:** CHALNA won all three judge verdicts (46 / 47 / 44 — first place unanimously). This spec is CHALNA's core, unchanged, plus the six "steal" ideas that appeared in two or more judge verdicts. Ideas that would dilute the core (e.g. the "만회" multiplier-restore, extra golden-miss punishment) are explicitly cut.

---

## 1. Hard Constraints (restated, binding)

- ONE self-contained HTML file. Inline CSS + vanilla JS. Zero network requests. Canvas 2D rendering, WebAudio-generated sound only.
- One input for everything. Works identically on desktop (mouse/keyboard) and mobile (touch), portrait-first.
- Run length ~30s–3min. Restart = one tap, < 500ms to gameplay.
- No currency, no gambling, no dark patterns. All dopamine from game feel.
- Korean UI. Persistent records via localStorage.
- Target: 800–1200 lines total, high polish.

---

## 2. Core Loop (one cycle ≈ 0.25–1.3 seconds)

1. **ANTICIPATE** — The needle rotates around the dial toward a glowing target arc (cyan GOOD zone with a gold PERFECT band at its center). The band pulses faster as the needle approaches; a quiet click-accelerando plays in the ears.
2. **COMMIT** — Player taps once. Verdict is computed against the needle angle at that exact frame.
3. **VERDICT** —
   - **PERFECT**: gold explosion, hit-stop, rising chime, +25 × multiplier, streak +1.
   - **GOOD**: blue spark, muted thud, +10 × multiplier, **perfect streak and multiplier reset to ×1** — alive, but it stings. A gray "−75 놓침" shows what the perfect would have paid.
   - **MISS**: run ends. Time slows to 0.25×, the ghost needle freezes at the tap angle, and the screen prints the exact delta: "0.017초 늦었어요!"
4. **RESET** — On any hit: needle reverses direction, speed ticks up, a new arc spawns 100°–260° ahead in the new travel direction. Loop repeats immediately. 8–15 verdicts per 15 seconds.

---

## 3. Game States & Transitions

| State | Contents | Exit |
|---|---|---|
| **TITLE** | "찰나" title (drawn as if by a brush stroke), tagline, idle needle slowly sweeping the dial (no arcs), 최고 점수 / 최고 연속 퍼펙트 / 누적 퍼펙트 lines, pulsing "탭해서 시작". First-ever visit shows one hint line: "바늘이 금색 띠를 지날 때, 탭!" | Any input → PLAYING (this input also unlocks/resumes AudioContext). The first arc spawns immediately; needle is live within 1 frame. |
| **PLAYING** | Dial, needle, arc, HUD (score top-center, multiplier chip, streak text, best-score notch on progress ring). | MISS → DYING. |
| **DYING** | 600ms at 0.25× timescale: gray desaturation overlay fades in, ghost needle blinks at tap angle, real needle drifts, delta text punches in at 3× scale with overshoot ease. Falling detuned saw (400→80Hz). Input locked. | Auto after 600ms → GAMEOVER. |
| **GAMEOVER** | Panel slams up from bottom (250ms, back-ease). Score counts up over 700ms with rising click pitch. Lines: 점수 (large), 최고 점수, 최고 연속 퍼펙트, 누적 퍼펙트 — each with a gold "NEW!" flare + confetti (40 particles) if beaten. Contextual taunt line (section 11). "탭해서 다시 시작" pulses. **400ms input lockout from panel appearance.** | Any input after lockout → PLAYING (full state reset is one function; needle spinning in < 500ms). A tap during count-up (after lockout) skips the count-up first, second tap restarts. |

Pause: on `visibilitychange` hidden, freeze the loop and suspend AudioContext; resume on return (during PLAYING, resume with a 500ms un-tappable grace so the player can re-orient — the needle holds still, then eases to speed over 300ms).

---

## 4. Input Mapping

| Action | Desktop | Mobile |
|---|---|---|
| Tap (everything) | `pointerdown` anywhere, or `keydown` Space / Enter (ignore key repeat) | `pointerdown` / `touchstart` anywhere |
| Mute toggle | M key, or 32px speaker icon top-right | Speaker icon top-right (the ONLY tappable UI element; taps on it never count as game input) |

Rules:
- Read on **press**, never release. Verdict compares against the needle angle at the input event's frame — never "next frame".
- One `pointerdown` handler; `touch-action: none`, `user-select: none`, `preventDefault` on touchstart; viewport meta disables zoom. No double-tap zoom, no scroll, no long-press callout.
- First input ever creates/resumes the AudioContext.
- `navigator.vibrate(10)` on PERFECT, `vibrate(20)` on MISS (Android; silently no-op elsewhere).

---

## 5. Core Mechanics — Exact Rules

**Geometry.** Dial: circle centered on screen, radius R = 0.36 × min(viewportW, viewportH). Needle: white line from center to rim. Arc: drawn on the rim as a thick stroke (cyan), with the gold perfect band centered inside it.

**Definitions.** Let `n` = hits landed this run (0-based at run start). Let `g = max(0, n − 3)` (3-hit ramp-in grace: the first 3 hits of every run behave as n = 0).

**Needle speed:** `ω(n) = min(200 + 7g, 460)` °/s. Direction reverses on every hit.

**GOOD arc full width:** `A(n) = max(42 − 0.5g, ω(n) × 0.070)` degrees.
(The second term is a **70ms hard time-floor** on the crossing window — resolves to 32.2° at cap speed. The GOOD window shrinks 210ms → 70ms; this is what kills you.)

**PERFECT band full width:** `P(n) = max(A(n) × 0.28, ω(n) × 0.030)` degrees.
(A **30ms hard time-floor** — the perfect window goes ~59ms → exactly 30ms and never below. During FEVER, multiply P by 1.2.)

**Verdict.** At tap, let Δ = signed angular distance from needle to the perfect-band center (positive = past center, i.e. late):
- `|Δ| ≤ P/2` → PERFECT
- `|Δ| ≤ A/2` → GOOD
- else → MISS. Ms-delta for messaging: `ms = |Δ| / ω × 1000`, sign gives 늦었어요/빨랐어요.

**Arc spawn.** After any hit: new arc center = needle angle + newDirection × random(100°, 260°). Never overlapping the needle's current position.

**Golden arc (variable-ratio jackpot — judge-consensus steal).** From hit 10 onward, each new arc has a **1-in-8** chance to be GOLD (never two in a row). The whole arc renders gold with a sparkle shimmer. PERFECT on a gold arc pays **×3** on that hit and the chime gains octave + bell harmonics. GOOD on gold = normal GOOD (normal streak reset — no extra punishment). MISS on gold = normal miss. Pure skill shot, higher stakes, zero dice-feel.

**FEVER.** Triggered at perfect-streak 8, and re-triggered at 16, 24, … Lasts 6 seconds: all points ×2, perfect band +20%, magenta/orange palette shift, needle light-trail, wet delay on hit sounds. Fever ending fades everything back over 500ms (the loss is felt).

---

## 6. Scoring & Combo Math (exact)

**Multiplier** is a pure function of current consecutive-perfect streak:

| Streak | 0–2 | 3–5 | 6–9 | 10–14 | 15+ |
|---|---|---|---|---|---|
| Multiplier | ×1 | ×2 | ×3 | ×4 | ×5 (max) |

**Per-hit points:**
- GOOD: `10 × mult × (fever ? 2 : 1)` — then streak → 0, mult → ×1 (score kept, momentum lost).
- PERFECT: `25 × mult × (fever ? 2 : 1) × (goldArc ? 3 : 1)` — then streak +1.
- Max single hit: 25 × 5 × 2 × 3 = **750**.

**Milestone bonus:** every 10th hit (10, 20, 30, …): flat **+50**, banner "10타!" with chord stab.

**Foregone-loss display on GOOD (steal from 불장난):** alongside "+10", show the perfect payout you missed as fading gray text: `−(25 × preResetMult − 10 × preResetMult) 놓침` (e.g. streak was 6, "−75 놓침"). Display only — no score change.

**MISS:** run over. Final score = accumulated score.

**Worked example:** 10 straight perfects from streak 0: hits pay 25, 25, 25, 50, 50, 50, 75, 75(fever starts → ×2 from here), 150, 150 = **675**, plus the +50 ten-hit milestone = 725. Ten GOODs = 100. Perfects chained are worth ~7× goods — that ratio is the entire psychology; do not retune it casually.

**Persistence — localStorage.** Single key `chalna_save_v1`, JSON:
```json
{ "bestScore": 0, "bestStreak": 0, "lifetimePerfects": 0, "totalRuns": 0 }
```
`lifetimePerfects` increments on every perfect (a number that only ever goes up — even bad runs feed it). `totalRuns` increments on each death. Write on death and on record-cross (so a closed tab mid-run keeps the record). Wrap reads in try/catch with defaults (private-mode safe).

---

## 7. Difficulty Ramp — Resulting Curve (for tuning validation)

| Hits landed (n) | ω (°/s) | GOOD window | PERFECT window |
|---|---|---|---|
| 0–3 (grace) | 200 | 210ms | 59ms |
| 10 | 249 | ~141ms | ~40ms |
| 20 | 319 | ~104ms | ~31ms |
| 30 | 389 | ~82ms | 30ms (floor) |
| 41+ (cap) | 460 | 70ms (floor) | 30ms (floor) |

Targets: average players die at 20–40 hits (~45–90s); experts at 60–90 hits (~2.5–3min). Perfect rate ~25–30% average, ~55% expert. If playtests deviate more than ±30% from these, adjust the `+7g` speed slope first, never the time floors.

---

## 8. Audiovisual Feedback — Every Event

All audio from one AudioContext. Chain: `sounds → DelayNode (feedback 0.3, wet gain 0 normally / 0.35 in fever) → DynamicsCompressor → masterGain → destination`. All envelopes ≤ 500ms. Mute toggles masterGain.

### PERFECT
- **Feel:** 40ms hit-stop (full freeze), then 12px screen shake decaying over 120ms.
- **Visual:** 24 gold particles burst radially from the hit point (gravity 200px/s², 600ms fade, additive `lighter` blending); white ring shockwave expands from the dial (0→1.4R, 300ms fade); the arc shatters into 3 spinning fading fragments; "퍼펙트!" + streak counter "퍼펙트 x7" scale-punches (1.0→1.3→1.0, 150ms).
- **Sound:** sine+triangle dual-osc chime, 8ms attack / 200ms exp decay. **Pitch ladder:** frequency = C5 (523.25Hz) + 1 semitone per current streak, capped at C7. Every 5th consecutive perfect adds a quiet (−16dB) fifth-interval oscillator — deep streaks get *richer*, not just higher. Plus a 30ms noise-burst "snap". Gold arc perfect: add +1 octave sine and a 1320Hz bell partial.
- **Haptic:** vibrate(10).

### GOOD (deliberately underwhelming)
- **Visual:** 8 cool-blue sparks, no shake. "+10" popup floats up 40px/600ms. Gray "−75 놓침" fades over 800ms beneath it. Streak counter deflates to "x1" with a 100ms shrink.
- **Sound:** muted 150Hz thud — short low-pass-filtered square, 80ms.
- **Quantified near-perfect (steal):** if the tap was within 15ms of the perfect band edge, print "퍼펙트까지 6ms!" in white-gold, rate-limited to once per 3s. Runs the game's strongest engine on every tap, not just death.

### MISS (death)
- **Feel:** timescale 0.25× for 600ms; canvas desaturates via gray overlay fading to 55% alpha.
- **Visual:** ghost needle blinks (2Hz) frozen at the tap angle while the real needle drifts in slow-mo. Delta text "0.017초 늦었어요!" punches in at 3× scale, settles with overshoot ease. If the tap landed within 1.5× the arc width, the missed arc edge flashes white — you see exactly which edge you shaved.
- **Sound:** detuned falling saw, 400→80Hz over 500ms; low noise burst.
- **Haptic:** vibrate(20).

### Anticipation (continuous, between taps)
- **Visual tension pulse:** the gold perfect band's brightness pulses at frequency proportional to 1/time-to-arrival (clamped 1–12Hz) — a visual accelerando before every tap.
- **Audio accelerando (steal from 불장난):** quiet filtered-noise clicks (−22dB, 20ms) at the same 1/tta rate, clamped 2–16Hz. Cross-modal tension, ~15 lines.

### FEVER entry / during
- **Entry:** 80Hz sine bass drop (400ms) + 300ms rising white-noise sweep; background radial gradient navy → deep magenta over 400ms; giant "피버!" stamp with overshoot.
- **During:** needle grows a 10-segment additive fading polyline trail; delay wet gain → 0.35 so all hits echo; timer shown as a draining thin ring around the dial.

### Milestone (every 10 hits)
- "20타!" banner slides across (300ms, back-ease), root+fifth square-wave chord stab (110Hz root, 300ms), "+50" popup.

### Record systems (steals — all three judges demanded these)
- **Goal-gradient notch:** a thin progress ring around the dial's outside fills with score, scaled so the gold notch at 12 o'clock = `bestScore`. When current score ≥ 85% of best: HUD line "최고까지 85점" appears under the score, and a heartbeat treatment starts — master low-pass cutoff pumps at ~100bpm (or a 55Hz double-thump every 600ms), vignette darkens 10%. Escalates until…
- **Live record break:** the instant score > bestScore mid-run: gold "신기록!" banner with 200ms shimmer (two detuned sines, 1567/1568Hz beat), 40 gold confetti, and the score counter renders gold for the rest of the run. Heartbeat stops (release). `bestScore` is updated immediately.
- First run ever (bestScore 0): notch/heartbeat suppressed.

### Game-over panel
- Score count-up over 700ms, per-tick blips rising in pitch. "NEW!" flares + confetti on any beaten record. Then near-silence — the quiet makes the restart tap feel like starting a drumbeat.

---

## 9. Art Direction / Color System

- **Background:** near-black navy `#0A0E1A`, subtle radial gradient (center +6% lightness). Fever: deep magenta `#2A0A2E`.
- **Needle:** white `#F5F7FA`, 3px, glow shadow. Ghost needle: 40% alpha.
- **GOOD zone:** cyan `#39C5E8`. **PERFECT band:** gold `#FFC940`. **Gold arc:** whole arc `#FFC940` + sparkle.
- **Score/HUD:** white; gold after record break. GOOD feedback: cool blue `#5A8DEE`. Loss/death text: red `#FF5A5A` only for the delta message. Gray `#8A93A6` for foregone-loss text.
- Meaning is always triple-encoded (position + color + sound) — colorblind-safe by construction.
- **Typography:** system font stack (`-apple-system, "Malgun Gothic", sans-serif`), `font-variant-numeric: tabular-nums` (or monospace digits on canvas) so counters never jitter. Score 48px, streak 24px growing with streak, delta message 40px.
- Canvas sized to `devicePixelRatio`, re-laid-out on resize/orientation change. Portrait-first; on wide desktop the dial stays centered with generous margins.

---

## 10. Korean UI Copy (exact strings)

| Context | String |
|---|---|
| Title | `찰나` / tagline `0.03초의 완벽을 쫓아라` |
| Start / restart prompt | `탭해서 시작` / `탭해서 다시 시작` |
| First-run hint | `바늘이 금색 띠를 지날 때, 탭!` |
| Perfect / streak | `퍼펙트!` / `퍼펙트 x{n}` |
| Good | `굿` (+points popup `+{n}`) |
| Foregone loss | `-{n} 놓침` |
| Near-perfect on GOOD | `퍼펙트까지 {n}ms!` |
| Miss — late / early | `{0.017}초 늦었어요!` / `{0.017}초 빨랐어요!` (3 decimal places, seconds) |
| Fever | `피버!` |
| Gold arc perfect | `골드 x3!` |
| Milestone | `{n}타!` |
| Record proximity | `최고까지 {n}점` |
| New record (live + panel) | `신기록!` / panel flare `NEW!` |
| Panel labels | `점수` / `최고 점수` / `최고 연속 퍼펙트` / `누적 퍼펙트` |
| Mute | speaker icon only (no text) |

**Contextual death taunts (steal from 불장난)** — panel shows exactly one, chosen by the first matching rule:
1. Died 1 hit before a 10-hit milestone → `한 타만 더 하면 {n}타였는데...`
2. Died at streak ≥ 6 (fever near) → `피버 직전이었는데!`
3. Miss delta ≤ 20ms → `한 끗 차이... 겨우 {n}ms!`
4. Died on a gold arc → `골드 욕심이 과했나?`
5. Score within 10% of best → `최고 기록까지 단 {n}점!`
6. Streak ≥ 10 at death → `연속 퍼펙트 {n}에서... 아깝다!`
7. Died within first 5 hits → `워밍업은 끝났죠?`
8. Default → `다시 하면 넘길 수 있어요`

---

## 11. Implementation Architecture (guidance, not law)

- One `requestAnimationFrame` loop, delta-time physics, `timescale` variable for hit-stop/slow-mo (clamp dt at 50ms to survive tab-switch spikes). Verdict math is a pure function `(needleAngle, arcCenter, A, P) → verdict` — unit-testable in the console.
- ~15 state variables; one particle pool (300, pre-allocated); one input handler; one `playSound(type, params)` audio module (~120 lines); one `strings` object holding every Korean string.
- Popup texts, banners, shake, and flashes as small timed-entity lists — no DOM during play (DOM only for game-over panel if convenient).
- Budget: core loop + verdict ~150 lines, rendering ~250, audio ~120, particles/juice ~200, states/UI/panel ~200, records/persistence ~60, input ~50. **Total ~1030 lines.**
- **Cut list (do NOT implement):** 만회 multiplier-restore, extra gold-miss punishment, multiple dials, difficulty modes, share buttons, pause menu, settings beyond mute.

---

## 12. Game Feel Checklist (developer must verify every item before calling it done)

**Input integrity**
- [ ] Verdict uses needle angle at the input event's frame; tapping at identical visual positions gives identical verdicts at 60Hz and 120Hz displays.
- [ ] Input read on pointerdown/touchstart/keydown — never on release. No key-repeat double fires.
- [ ] No scroll, zoom, text-select, or long-press callout is possible on mobile during play.
- [ ] Death → restart requires exactly one tap; new needle is moving in < 500ms; 400ms lockout prevents panic-tap restarts.

**Juice integrity**
- [ ] PERFECT hit-stop is a real full freeze (40ms) and the shake decays smoothly — no lingering wobble.
- [ ] GOOD feels *audibly and visually cheaper* than PERFECT in a blind test.
- [ ] Every miss shows a millisecond delta and the frozen ghost needle; the number is plausible when self-checked against the slow-mo replay.
- [ ] Pitch ladder is audibly climbing by streak 3; a broken streak audibly resets; every 5th perfect is audibly richer.
- [ ] The pre-tap pulse + click accelerando are perceptible but never louder than verdict sounds.
- [ ] Fever entry is unmistakable within 200ms (sound + palette + trail all land together).
- [ ] Live 신기록 moment fires mid-run with gold counter persisting; heartbeat builds beforehand when within 15% of best.

**Performance & robustness**
- [ ] Steady 60fps on a mid-range Android phone with 300 live particles + fever trail.
- [ ] Fully playable muted; AudioContext resumes correctly after backgrounding; no autoplay warnings.
- [ ] Score/streak digits never cause layout jitter (tabular figures).
- [ ] localStorage failures (private mode) degrade silently to session-only records.
- [ ] Resize / rotate mid-run re-centers the dial without breaking state.
- [ ] 30-minute soak: no memory growth (pools, no per-frame allocation in hot paths).

**Tuning sign-off (playtest on real touch hardware)**
- [ ] Average tester dies at 20–40 hits with a 25–30% perfect rate; at least 2–3 perfects tasted per run from run one.
- [ ] Perfects on mobile are not dramatically rarer than desktop; if they are, apply a hidden constant +20ms verdict offset on coarse pointers and re-test.
- [ ] Ten consecutive deaths in a row still produce the reflex tap-to-restart — if any tester reaches for the close button instead, the death→restart path has friction; find it and remove it.

---

# PART II — v2 EXPANSION SPEC

v1 above is frozen as the core skill loop (Classic arc math, scoring, one-tap input, audiovisual language) and stays completely unchanged. Part II adds **layers around** that core to give it long-horizon dopamine hooks: session-to-session progression, variety within a run, and short daily/relaxed alternatives. Same hard constraints apply — one file, zero deps, Canvas 2D + WebAudio, Korean UI, **no currency-for-power, no gambling odds, no dark patterns**. Coins/XP are earned only by playing and spent only on cosmetics at fixed prices; nothing is ever sold or gacha'd.

## 13. Meta-structure

`TITLE/MENU` screen replaces the old bare title: same brush-stroke wordmark, but below it four tappable cards — **클래식 · 데일리 챌린지 · 젠 모드 · 도감** (Daily/도감 gate behind Lv.2, greyed with a lock badge until then). Still canvas-only, still one input primitive (`pointerdown`/`Space`/`Enter` — a "tap" is just tested against whichever button rect it lands in; this is menu navigation, not a second game mechanic). A settings gear (mute already existed top-right; reduced-motion + colorblind-safe palette toggles live in 도감 footer).

States added: `ST_MENU`, `ST_COLLECTION`. `ST_PLAY` now carries a `mode` tag (`classic | daily | zen`) that the verdict/spawn/scoring layer branches on.

## 14. Save schema v2

Key `chalna_save_v2`. On first load, if v2 is absent and legacy `chalna_save_v1` exists, import `bestScore/bestStreak/lifetimePerfects/totalRuns` once (goodwill migration, then v1 key is left untouched/ignored thereafter).

```json
{
  "bestScore": 0, "bestStreak": 0, "lifetimePerfects": 0, "totalRuns": 0,
  "xp": 0, "level": 1, "coins": 0,
  "achievements": { "first_perfect": true, "...": false },
  "unlockedThemes": ["classic"], "unlockedTrails": ["classic"],
  "activeTheme": "classic", "activeTrail": "classic",
  "dailyBestByDate": { "2026-07-14": 725 }, "dailyStreak": 0, "lastDailyDate": "",
  "zenBest": 0,
  "ghost": [{ "t": 0.0, "a": 12.4 }],
  "settings": { "reduceMotion": false, "colorblind": false }
}
```
Same try/catch-degrade-silently rule as v1. Written on every run end, level-up, achievement unlock, and cosmetic purchase.

## 15. Progression math

**XP per run:** `floor(score/8) + runPerfects*3 + chainClears*10`, at **40%** rate in Zen (rounded down), full rate in Classic/Daily.
**Level curve:** level *L*→*L+1* costs `80 + 40*L` XP (cumulative ladder walked on every XP gain). Level-up triggers a banner + `sMilestone`-family stinger, same juice grammar as the 10-hit milestone.
**Coins:** `floor(hits/5)` per run, all modes, no rate change. Spent only in 도감 at fixed prices — no discounts, no timers, no "today only".

**Unlock ladder (by Level, auto-granted; 도감 lets coins buy the *cosmetic* half early):**
| Lv | Unlocks |
|---|---|
| 1 | Classic, Zen, 기본(Navy/Gold) theme |
| 2 | 데일리 챌린지 mode, 도감 |
| 3 | Wobble arcs · 선셋 theme (or 80 coins early) |
| 5 | Shrink arcs · 모노 theme (high-contrast, accessibility-first) |
| 8 | Decoy arcs · 네온 theme + alt needle trail |
| 12 | Chain arcs · prism trail |

## 16. New arc modifiers (Classic + Daily only; Zen uses whatever the player has already unlocked)

At most **one** geometry modifier per arc (never combined with each other; gold-jackpot is a payout/color flag and also never combines with a geometry modifier, to keep every arc read-at-a-glance). Chain is a separate spawn event that replaces normal spawning outright when it triggers.

- **동요 (Wobble)** — Lv.3, ~20% of eligible spawns (hits≥6). Center drifts: `center(t) = spawn + 5° · sin(TAU·f·t + φ)`, `f = 1.1 + 0.02·min(hits,40)` Hz. Verdict always reads the *live* center. Sound: a soft breathing tremolo under the normal click-accelerando.
- **수축 (Shrink)** — Lv.5, ~20% of eligible spawns (hits≥6). Perfect band only: `P(t) = lerp(1.35·P0, 0.65·P0, clamp(travel/dist0,0,1))` — visibly closes as the needle nears. Good band untouched. Sound: a rising 8th-note tick as it closes.
- **디코이 (Decoy)** — Lv.8, ~25% of eligible spawns (hits≥10), never on a gold spawn. A second, desaturated, **dashed** cyan arc (texture-coded, not just color) appears between the needle and the real arc: `decoyCenter = needle + dir·rand(35°,70°)`, `decoyWidth = A(n)·0.75`, resampled up to 5× to keep ≥12° clearance from the real arc. Tapping inside it while outside the real arc is an instant MISS with its own taunt ("미끼 아크에 속았다!") and a distinct short "gotcha" buzz — never confused with the real-arc miss sound.
- **체인 (Chain)** — Lv.12, from hits≥15, 1-in-10 instead of a normal spawn. Three links, same travel direction throughout (no reversal mid-chain): each `w = goodW(n)·0.6`, `p = perfW(n)` (perfect floor unchanged), `dist0 = rand(40°,70°)`. All three PERFECT → **"체인!"** finisher: `+150·mult(streak)` flat bonus, gold-nova visual, ascending 3-note stinger with a bell tail. A GOOD on any link ends the chain early (falls back to a normal single arc, direction reverses as usual); a MISS on any link ends the run exactly like a normal miss — chains raise the stakes, they don't soften them.

## 17. Daily Seed Challenge

Seed = `mulberry32(hash("chalna-" + KST_date))`. That PRNG instance — not `Math.random` — drives every RNG decision inside `spawnArc` for the run (gold roll, modifier roll, `dist0`, decoy placement, chain trigger), so every player who plays on a given date is offered the *identical arc sequence*; only their timing differs. Unlimited retries per day; `dailyBestByDate[today]` keeps the best. `dailyStreak` increments if `lastDailyDate === yesterday`, else resets to 1 — shown as a small flame + count on the mode card. No XP/coin bonus beyond the standard run reward; the hook is purely "same puzzle as everyone today, beat yesterday's ghost."

## 18. Zen Mode

Fixed 60s timer, no death: a MISS is scored and juiced like a GOOD (streak reset, brief "아쉬워요" flash) instead of ending the run, so the loop never breaks — built for low-pressure flow/practice. Ends at 0:00 with the normal results panel. Tracked separately as `zenBest`, never touches `bestScore`/`bestStreak` so a relaxed session can't be mistaken for a real run.

## 19. Ghost replay (Classic only)

Whenever a Classic run sets a new `bestScore`, its needle angle is sampled at ~20Hz into `ghost` (capped ~2400 samples). On every later Classic run, a second needle is drawn at 25% alpha, thin and dashed, interpolated from `ghost` at the current run's elapsed time — purely visual, never read for verdicts, and it simply fades out once the live run either dies or outlasts the recorded length. This is the "race your own best" hook Part I's design explicitly left out; it stays cosmetic so it can't be accused of moving the goalposts.

## 20. Achievements (~18, first-class dopamine hits of their own)

Each is a one-time toast (slide-in top banner, 2.2s, queued if several fire in the same frame) + a permanent tile in 도감. Examples: `first_perfect`, `streak_10`, `streak_20`, `fever_first`, `gold_first`, `chain_clear`, `decoy_fooled` (yes — the *first* time you get fooled is itself an achievement, so the sting doubles as a reward), `lifetime_100`, `lifetime_1000`, `runs_50`, `near_miss_1ms`, `daily_first_play`, `daily_streak_7`, `zen_complete`, `level_5`, `level_10`, `level_12_max`, `record_x5`, `coins_100_spent`.

## 21. Cosmetics

Theme = `{bg, bgFever, needle, good, perfect}` palette swap, applied everywhere v1 used `COL.*`. Every theme keeps the cyan/gold good/perfect pairing (never reassigned to a third hue) so the triple-encoding rule from §9 holds regardless of skin. 모노 theme is the accessibility pick: near-black/white/gold only, maximum contrast, meant to be the recommended default for colorblind players even though decoy/shrink/etc. already avoid hue-only signaling.

## 22. Cut list (v2)

No real-money anything, no ads, no social/share/network features, no PvP or online leaderboard (daily "streak vs yesterday" stays local), no energy/stamina gating replay, no loot-box style randomness on cosmetics (fixed price, fixed catalog, always visible even when locked so there's no mystery-box tension).

---

# PART III — DESKTOP EDITION ("찰나 아케이드")

Where Parts I–II are the single-file web build (`/index.html`, still maintained standalone), Part III describes `/desktop/` — an Electron-packaged arcade **compilation**: CHALNA plus three genre-distinct siblings under one shared shell, aimed at real installable-desktop distribution (Steam-capable) rather than a browser tab. This is a deliberate scope escalation from "one hyper-casual mechanic" to "one cohesive product, several mechanics" — the honest ceiling of what's buildable here: no bitmap/photographic art (no image-generation tool in this environment — the whole visual language stays Canvas 2D vector/glow/particles, the same toolkit that already carried Parts I–II), and no Steamworks submission (that requires the studio's own developer account and store-page process, outside this repo).

## 23. Why a compilation, not one bigger game

The two production gaps named for "sellable" were **visual/art quality** and **content/genre diversity**. Diversity is solved by adding mechanically distinct games rather than bolting more systems onto CHALNA's single rotational-timing loop (which would dilute its own clarity — see Part I §1's original constraints). Visual quality is solved by a shared, disciplined art direction (one palette system, one particle/juice vocabulary, one typographic scale) applied consistently across all four games, rather than each game inventing its own look — consistency reads as "produced," not the number of colors on screen.

## 24. Architecture

```
desktop/
  package.json, main.js, preload.js        — Electron shell (BrowserWindow loading src/index.html)
  src/
    index.html                             — canvas + <script> includes, CSP-locked (script-src 'self')
    core/
      util.js        — math/easing/PRNG, shared by every game
      audio.js        — one WebAudio graph (bus → compressor → master), tone()/noise() synthesis
      sfx.js          — named cross-game sounds (click/milestone/achievement/level-up/miss/good/...)
      fx.js           — shared particle pool, popups, banners (max 3 concurrent slots), stamps,
                        shockwaves, and the one-at-a-time achievement toast queue
      theme.js        — 4 themes × 3 trails, good=cyan-family/perfect=gold-family in every theme
      save.js         — ONE profile: global xp/level/coins/achievements/cosmetics/settings, plus
                        data.games[id] for each game's own local records
      achievements.js  — cross-game unlock ledger; games register their own ids/names at load time
    games/
      _template.js    — the module contract (not loaded by index.html; copy its shape)
      chalna.js        — the flagship, ported from Part II onto the shared core
      seomgwang.js     — 반응속도 (reflex): tap a shrinking-window flash before it expires
      maeari.js        — 기억력 (memory): Simon-says pad sequence, grows one step per round
      nakha.js         — 순발력 (spatial reflex): lane-based catch/dodge under falling objects
    hub.js             — canvas owner, rAF loop, resize, input routing, HOME/GAME/COLLECTION states
```

Every game is a plain object on `window.Games[id]` implementing `init/onEnter/onExit/resize/update/render/onPointer/onKey/summary` (see `_template.js` for the exact contract) — the hub never reaches into a game's internals, and a game never touches the DOM, another game, or global input listeners directly.

## 25. What became global vs. what stayed per-game

Progression is the whole point of a compilation feeling like one product rather than four demos, so **level, XP, coins, cosmetics, and settings are one shared profile** — clearing a round of 메아리 raises the same level that unlocks CHALNA's 체인 arcs. Each game keeps its **own** high-score-shaped records (`Save.gameData(id, defaults)`), its own achievement ids (namespaced, e.g. `chalna_streak_10` vs a future `seomgwang_streak_10`), and — critically — its own internal mode-select/results screens; only the outermost "which game, plus 도감/설정" layer is shared. CHALNA's own in-game 도감 was removed in this port (superseded by the hub's global one); its Lv.2-gated daily-mode card stayed, since "unlock the next thing after a little play" is still a fine per-game rhythm even inside a shared meta-economy.

## 26. Known environment limitation (read before assuming a build was verified end-to-end)

This sandbox's egress policy allows `registry.npmjs.org` but returns 403 on `github.com/*/releases/*` — Electron's own postinstall step downloads its prebuilt binary from a GitHub release, so `npm install` completes but the `electron` binary itself cannot be fetched here, and no `.exe`/`.app`/AppImage has been produced or launched inside this environment. What **was** verified here: every renderer file (`core/*.js`, `hub.js`, `games/*.js`) headlessly in real Chromium via Playwright — the same rendering engine Electron embeds — clicking through hub → each game → results → back, forcing verdict paths via a temporary debug hook (removed before shipping, same technique Part II's build used). `npm install && npm start` on a machine with normal network access is expected to produce a running window from this code as-is; that step has not been exercised on real Electron by this session.
