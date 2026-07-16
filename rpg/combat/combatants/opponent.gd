extends Combatant

export(int) var xp_reward = 5
export(int) var gold_reward = 2
export(String) var loot_id = ""
export(String) var loot_name = ""
export(String) var loot_kind = ""
export(int) var loot_bonus = 0
# multi-phase difficulty curve, e.g. for bosses — each entry is a Dictionary
# {hp_threshold_pct, sweep_time, perfect_half_width, good_half_width, label_text}.
# Empty for ordinary (single-phase) enemies.
export(Array) var phases = []
export(Array) var phase_transition_dialogue = []
var _last_phase_index = 0


func current_phase_index():
	if phases.empty():
		return -1
	var hp_pct = 100.0
	if $Health.max_life > 0:
		hp_pct = 100.0 * $Health.life / float($Health.max_life)
	var idx = 0
	for i in range(phases.size()):
		if hp_pct <= phases[i].hp_threshold_pct:
			idx = i
	return idx


func current_phase():
	var idx = current_phase_index()
	if idx < 0:
		return null
	return phases[idx]


func set_active(value):
	.set_active(value)
	if not active:
		return

	if not $Timer.is_inside_tree():
		return
	$Timer.start()
	yield($Timer, "timeout")
	var target
	for actor in get_parent().get_children():
		if not actor == self:
			target = actor
			break
	attack(target)
