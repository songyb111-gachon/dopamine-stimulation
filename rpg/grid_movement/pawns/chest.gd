extends Pawn

export(String) var chest_flag = ""
export(String) var item_id = ""
export(String) var item_name = ""
export(String) var item_kind = ""
export(int) var item_bonus = 0
export(String) var opened_dialogue_file = ""

var opened = false


func on_dialogue_finished():
	if opened:
		return
	opened = true
	PlayerData.flags[chest_flag] = true
	if item_id != "":
		var item = {"id": item_id, "name": item_name, "kind": item_kind}
		if item_kind == "weapon":
			item["atk_bonus"] = item_bonus
		elif item_kind == "armor":
			item["def_bonus"] = item_bonus
		PlayerData.add_item(item.id, item.name, item.kind, 1, item)
		PlayerData.equip(item)
	if opened_dialogue_file != "" and has_node("DialoguePlayer"):
		$DialoguePlayer.dialogue_file = opened_dialogue_file
	get_parent().check_gates()
