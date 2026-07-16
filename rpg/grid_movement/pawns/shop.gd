extends Pawn

export(String) var npc_name = ""
# set directly on the instance in exploration.tscn as a literal Array of
# Dictionaries: {id, name, kind, price, effect}
export(Array) var catalog = []


func on_dialogue_finished():
	get_tree().call_group("shop_ui", "open_shop", self, npc_name, catalog)
