extends Combatant

export(int) var xp_reward = 5
export(int) var gold_reward = 2
export(String) var loot_id = ""
export(String) var loot_name = ""
export(String) var loot_kind = ""
export(int) var loot_bonus = 0


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
