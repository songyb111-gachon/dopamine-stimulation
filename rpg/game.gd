extends Node


const PLAYER_WIN = "res://dialogue/dialogue_data/player_won.json"
const PLAYER_LOSE = "res://dialogue/dialogue_data/player_lose.json"

export(NodePath) var combat_screen
export(NodePath) var exploration_screen


func _ready():
	exploration_screen = get_node(exploration_screen)
	combat_screen = get_node(combat_screen)
	combat_screen.connect("combat_finished", self, "_on_combat_finished")
	for n in $Exploration/Grid.get_children():
		if not n.type == n.CellType.ACTOR:
			continue
		if not n.has_node("DialoguePlayer"):
			continue
		n.get_node("DialoguePlayer").connect("dialogue_finished", self,
			"_on_opponent_dialogue_finished", [n])
	remove_child(combat_screen)


func start_combat(combat_actors):
	remove_child($Exploration)
	$AnimationPlayer.play("fade")
	yield($AnimationPlayer, "animation_finished")
	add_child(combat_screen)
	combat_screen.show()
	combat_screen.initialize(combat_actors)
	$AnimationPlayer.play_backwards("fade")


func _on_opponent_dialogue_finished(opponent):
	if opponent.lost:
		return
	var player = $Exploration/Grid/Player
	var combatants = [player.combat_actor, opponent.combat_actor]
	start_combat(combatants)


func _on_combat_finished(winner, loser):
	remove_child(combat_screen)
	$AnimationPlayer.play_backwards("fade")
	add_child(exploration_screen)
	var dialogue = load("res://dialogue/dialogue_player/dialogue_player.tscn").instance()
	if winner.name == "Player":
		winner.sync_to_player_data()
		PlayerData.grant_xp(loser.xp_reward)
		PlayerData.add_gold(loser.gold_reward)
		if loser.loot_id != "" and not PlayerData.flags.get("looted_" + loser.loot_id, false):
			var item = {"id": loser.loot_id, "name": loser.loot_name, "kind": loser.loot_kind}
			if loser.loot_kind == "weapon":
				item["atk_bonus"] = loser.loot_bonus
			elif loser.loot_kind == "armor":
				item["def_bonus"] = loser.loot_bonus
			PlayerData.add_item(item.id, item.name, item.kind, 1, item)
			PlayerData.equip(item)
			PlayerData.flags["looted_" + loser.loot_id] = true
		dialogue.dialogue_file = PLAYER_WIN
	else:
		# soft defeat: revive at half HP rather than a hard game-over screen —
		# consequences without a wall, same no-punishing-dead-ends ethos as
		# the rest of this project.
		PlayerData.current_hp = max(1, PlayerData.get_max_hp() / 2)
		dialogue.dialogue_file = PLAYER_LOSE
	yield($AnimationPlayer, "animation_finished")
	var player = $Exploration/Grid/Player
	exploration_screen.get_node("DialogueUI").show_dialogue(player, dialogue)
	combat_screen.clear_combat()
	yield(dialogue, "dialogue_finished")
	dialogue.queue_free()
