extends Control

# 찰나 RPG signature mechanic: Attack/Defend open a timed-hit prompt (see
# combat/timing/timing_prompt.gd) instead of resolving instantly. The tier
# it resolves to scales the action's effectiveness — same PERFECT/GOOD/MISS
# language and color coding as the original 찰나 dial game.

const TimingPromptScene = preload("res://combat/timing/timing_prompt.tscn")

const ATTACK_MULTIPLIERS = { "perfect": 1.5, "good": 1.0, "miss": 0.5 }
const DEFEND_MULTIPLIERS = { "perfect": 2.5, "good": 1.0, "miss": 0.3 }

export(NodePath) var combatants_node
export(PackedScene) var info_scene

var _prompt_active = false


func _ready():
	combatants_node = get_node(combatants_node)


func initialize():
	for combatant in combatants_node.get_children():
		var health = combatant.get_node("Health")
		var info = info_scene.instance()
		var health_info = info.get_node("VBoxContainer/Health")
		health_info.value = health.life
		health_info.max_value = health.max_life
		info.get_node("VBoxContainer/Name").text = combatant.display_name if combatant.display_name != "" else combatant.name
		health.connect("health_changed", health_info, "set_value")
		$Combatants.add_child(info)
	$Buttons/GridContainer/Attack.grab_focus()


func _open_timing_prompt(label, on_resolved):
	if _prompt_active:
		return
	_maybe_announce_phase_transition()
	_prompt_active = true
	$Buttons.hide()
	var prompt = TimingPromptScene.instance()
	prompt.label_text = label
	var phase = _opponent_phase()
	if phase != null:
		prompt.sweep_time = phase.sweep_time
		prompt.perfect_half_width = phase.perfect_half_width
		prompt.good_half_width = phase.good_half_width
	add_child(prompt)
	prompt.connect("resolved", self, "_on_prompt_resolved", [prompt, on_resolved], CONNECT_ONESHOT)


func _opponent_phase():
	if not combatants_node.has_node("Opponent"):
		return null
	var opponent = combatants_node.get_node("Opponent")
	if not ("phases" in opponent) or opponent.phases.empty():
		return null
	return opponent.current_phase()


func _maybe_announce_phase_transition():
	if not combatants_node.has_node("Opponent"):
		return
	var opponent = combatants_node.get_node("Opponent")
	if not ("phases" in opponent) or opponent.phases.empty():
		return
	var idx = opponent.current_phase_index()
	if idx <= opponent._last_phase_index:
		return
	var line_index = idx - 1
	if line_index >= 0 and line_index < opponent.phase_transition_dialogue.size():
		_show_boss_line(opponent.phase_transition_dialogue[line_index])
	opponent._last_phase_index = idx


func _show_boss_line(text):
	var label = Label.new()
	label.text = text
	label.align = Label.ALIGN_CENTER
	label.anchor_right = 1.0
	label.margin_top = 20
	label.margin_bottom = 60
	label.add_color_override("font_color", Color(1.0, 0.788, 0.251, 1))
	add_child(label)
	var tween = Tween.new()
	label.add_child(tween)
	tween.interpolate_property(label, "modulate:a", 1.0, 0.0, 1.0, Tween.TRANS_LINEAR, Tween.EASE_IN, 2.0)
	tween.start()
	tween.connect("tween_all_completed", label, "queue_free")


func _on_prompt_resolved(tier, prompt, on_resolved):
	_prompt_active = false
	prompt.queue_free()
	$Buttons.show()
	on_resolved.call_func(tier)


func _on_Attack_button_up():
	if not combatants_node.get_node("Player").active:
		return
	_open_timing_prompt("공격!", funcref(self, "_resolve_attack"))


func _resolve_attack(tier):
	var mult = ATTACK_MULTIPLIERS[tier]
	combatants_node.get_node("Player").attack(combatants_node.get_node("Opponent"), mult)


func _on_Defend_button_up():
	if not combatants_node.get_node("Player").active:
		return
	_open_timing_prompt("방어!", funcref(self, "_resolve_defend"))


func _resolve_defend(tier):
	var mult = DEFEND_MULTIPLIERS[tier]
	combatants_node.get_node("Player").defend(mult)


func _on_Flee_button_up():
	if not combatants_node.get_node("Player").active:
		return
	combatants_node.get_node("Player").flee()
	var loser = combatants_node.get_node("Player")
	var winner = combatants_node.get_node("Opponent")
	get_parent().finish_combat(winner, loser)


func _on_Item_button_up():
	# Consumables are the deliberately "safe" option — no timing prompt, no
	# bonus multiplier, matching CHALNA's own philosophy that the un-timed
	# choice should feel plain next to a well-timed Attack/Defend.
	var player = combatants_node.get_node("Player")
	if not player.active:
		return
	var heal_amount = 0
	for item in PlayerData.inventory:
		if item.id == "potion":
			heal_amount = item.get("heal_amount", 10)
			break
	if heal_amount <= 0:
		return
	PlayerData.remove_item("potion", 1)
	player.get_node("Health").heal(heal_amount)
	player.emit_signal("turn_finished")
