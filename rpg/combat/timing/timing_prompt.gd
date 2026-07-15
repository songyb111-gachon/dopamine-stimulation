extends Control
class_name TimingPrompt

# 찰나 RPG's signature mechanic — the same precision-timing dopamine hook as
# the original 찰나 dial game, carried into turn-based combat. A marker
# sweeps once across a track; press at the right instant for a bonus.
#
# Tiers, matching the original game's color language exactly:
#   PERFECT (gold band, inner)  -> best outcome
#   GOOD    (cyan band, outer)  -> normal outcome
#   MISS    (outside both)      -> worst outcome (never "no effect": this is
#                                   combat, not a dial that kills you outright)

signal resolved(tier)

export(float) var sweep_time = 0.85
export(float) var perfect_half_width = 0.045
export(float) var good_half_width = 0.16
export(String) var label_text = "공격!"

var _t = 0.0
var _active = false
var _resolved_tier = ""

const COL_BG = Color(0.04, 0.055, 0.1, 0.92)
const COL_TRACK = Color(1, 1, 1, 0.12)
const COL_GOOD = Color(0.224, 0.773, 0.910)
const COL_PERFECT = Color(1.0, 0.788, 0.251)
const COL_MARKER = Color(0.961, 0.969, 0.980)
const COL_MISS = Color(1.0, 0.353, 0.353)

const KOREAN_FONT = "res://theme/fonts/NanumGothic-Bold.ttf"
var _font_cache = {}

func _ready():
	_t = 0.0
	_active = true
	set_process(true)
	set_process_input(true)


func _process(delta):
	if not _active:
		return
	_t += delta / sweep_time
	if _t >= 1.0:
		_t = 1.0
		_resolve_at(_t)
	update()


func _input(event):
	if not _active:
		return
	var pressed = false
	if event is InputEventKey and event.pressed and not event.echo:
		if event.scancode == KEY_SPACE or event.scancode == KEY_ENTER:
			pressed = true
	elif event is InputEventMouseButton and event.pressed and event.button_index == BUTTON_LEFT:
		pressed = true
	elif event is InputEventScreenTouch and event.pressed:
		pressed = true
	if pressed:
		get_tree().set_input_as_handled()
		_resolve_at(_t)


func _resolve_at(t):
	if not _active:
		return
	_active = false
	var d = abs(t - 0.5)
	if d <= perfect_half_width:
		_resolved_tier = "perfect"
	elif d <= good_half_width:
		_resolved_tier = "good"
	else:
		_resolved_tier = "miss"
	update()
	var tw = Tween.new()
	add_child(tw)
	tw.interpolate_property(self, "modulate:a", 1.0, 0.0, 0.35, Tween.TRANS_QUAD, Tween.EASE_IN, 0.25)
	tw.start()
	yield(tw, "tween_all_completed")
	emit_signal("resolved", _resolved_tier)


func _draw():
	var w = rect_size.x
	var h = rect_size.y
	draw_rect(Rect2(0, 0, w, h), COL_BG, true)

	var track_y = h * 0.62
	var track_h = h * 0.16
	var track_rect = Rect2(w * 0.08, track_y - track_h / 2, w * 0.84, track_h)
	draw_rect(track_rect, COL_TRACK, true)

	var good_w = good_half_width * 2.0 * track_rect.size.x
	var good_x = track_rect.position.x + track_rect.size.x * 0.5 - good_w / 2.0
	draw_rect(Rect2(good_x, track_rect.position.y - 4, good_w, track_h + 8), COL_GOOD, true)

	var perf_w = perfect_half_width * 2.0 * track_rect.size.x
	var perf_x = track_rect.position.x + track_rect.size.x * 0.5 - perf_w / 2.0
	draw_rect(Rect2(perf_x, track_rect.position.y - 8, perf_w, track_h + 16), COL_PERFECT, true)

	if _active:
		var mx = track_rect.position.x + _t * track_rect.size.x
		draw_rect(Rect2(mx - 3, track_rect.position.y - 20, 6, track_h + 40), COL_MARKER, true)
	else:
		var col = COL_MISS
		var txt = "놓쳤다..."
		if _resolved_tier == "perfect":
			col = COL_PERFECT
			txt = "퍼펙트!"
		elif _resolved_tier == "good":
			col = COL_GOOD
			txt = "명중"
		draw_rect(Rect2(0, 0, w, h), Color(col.r, col.g, col.b, 0.10), true)
		_draw_centered_text(txt, h * 0.30, col, 40)

	_draw_centered_text(label_text, h * 0.14, COL_MARKER, 26)


func _get_font(size):
	if not _font_cache.has(size):
		var dfont = DynamicFont.new()
		dfont.font_data = load(KOREAN_FONT)
		dfont.size = size
		_font_cache[size] = dfont
	return _font_cache[size]


func _draw_centered_text(text, y, color, size):
	var dfont = _get_font(size)
	var text_w = dfont.get_string_size(text).x
	draw_string(dfont, Vector2(rect_size.x / 2.0 - text_w / 2.0, y), text, color)
