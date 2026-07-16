extends Node
# Autoload singleton (res://autoload/player_data.gd). Persists across every
# scene change — exploration, combat, area transitions — since it's the one
# thing that has to survive all of them: level, HP, inventory, equipment,
# world position, and story flags.

signal leveled_up(new_level)
signal xp_changed(xp, xp_needed)
signal inventory_changed()
signal gold_changed(gold)

const SAVE_PATH = "user://savegame.json"

var level = 1
var xp = 0
var base_max_hp = 20
var base_attack = 3
var base_defense = 1

var current_hp = 20
var gold = 0
var inventory = []          # [{id, name, kind, count, heal_amount?}]
var equipped_weapon = null  # {id, name, atk_bonus}
var equipped_armor = null   # {id, name, def_bonus}
var flags = {}              # story/quest state, e.g. {"met_elder": true}

var current_area = "village"
var spawn_point = ""


func xp_to_next(lvl):
	return 20 + 10 * lvl


func get_max_hp():
	return base_max_hp + (level - 1) * 4


func get_attack():
	var bonus = equipped_weapon.atk_bonus if equipped_weapon else 0
	return base_attack + (level - 1) + bonus


func get_defense():
	var bonus = equipped_armor.def_bonus if equipped_armor else 0
	return base_defense + (level - 1) + bonus


func grant_xp(amount):
	if amount <= 0:
		return
	xp += amount
	while xp >= xp_to_next(level):
		xp -= xp_to_next(level)
		level += 1
		current_hp = get_max_hp()
		emit_signal("leveled_up", level)
	emit_signal("xp_changed", xp, xp_to_next(level))


func add_gold(amount):
	gold = max(0, gold + amount)
	emit_signal("gold_changed", gold)


func add_item(id, item_name, kind, count = 1, extra = {}):
	for item in inventory:
		if item.id == id:
			item.count += count
			emit_signal("inventory_changed")
			return
	var entry = {"id": id, "name": item_name, "kind": kind, "count": count}
	for k in extra:
		entry[k] = extra[k]
	inventory.append(entry)
	emit_signal("inventory_changed")


func remove_item(id, count = 1):
	for item in inventory:
		if item.id == id:
			item.count -= count
			if item.count <= 0:
				inventory.erase(item)
			emit_signal("inventory_changed")
			return true
	return false


func has_item(id):
	for item in inventory:
		if item.id == id:
			return item.count > 0
	return false


func use_item(id):
	for item in inventory:
		if item.id != id:
			continue
		if item.kind == "potion":
			current_hp = min(get_max_hp(), current_hp + item.get("heal_amount", 10))
		remove_item(id, 1)
		return true
	return false


func equip(item_dict):
	if item_dict.kind == "weapon":
		equipped_weapon = item_dict
	elif item_dict.kind == "armor":
		equipped_armor = item_dict


func reset_new_game():
	level = 1
	xp = 0
	current_hp = get_max_hp()
	gold = 10
	inventory = []
	equipped_weapon = null
	equipped_armor = null
	flags = {}
	current_area = "village"
	spawn_point = ""
	add_item("potion", "회복 물약", "potion", 2, {"heal_amount": 10})


func has_save():
	return File.new().file_exists(SAVE_PATH)


func save_game():
	var data = {
		"level": level, "xp": xp, "current_hp": current_hp, "gold": gold,
		"inventory": inventory, "equipped_weapon": equipped_weapon,
		"equipped_armor": equipped_armor, "flags": flags,
		"current_area": current_area, "spawn_point": spawn_point,
	}
	var f = File.new()
	f.open(SAVE_PATH, File.WRITE)
	f.store_string(to_json(data))
	f.close()


func load_game():
	if not has_save():
		return false
	var f = File.new()
	f.open(SAVE_PATH, File.READ)
	var text = f.get_as_text()
	f.close()
	var parsed = parse_json(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		return false
	level = parsed.get("level", 1)
	xp = parsed.get("xp", 0)
	current_hp = parsed.get("current_hp", get_max_hp())
	gold = parsed.get("gold", 0)
	inventory = parsed.get("inventory", [])
	equipped_weapon = parsed.get("equipped_weapon", null)
	equipped_armor = parsed.get("equipped_armor", null)
	flags = parsed.get("flags", {})
	current_area = parsed.get("current_area", "village")
	spawn_point = parsed.get("spawn_point", "")
	return true
