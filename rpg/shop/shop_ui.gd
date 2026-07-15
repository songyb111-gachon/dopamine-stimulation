extends Control

var _player = null


func _ready():
	hide()
	add_to_group("shop_ui")


func open_shop(pawn, npc_name, catalog):
	_player = pawn.get_parent().get_node("Player")
	_player.active = false
	$Panel/VBox/Title.text = npc_name
	_refresh(catalog)
	show()
	$Panel/VBox/Close.grab_focus()


func _refresh(catalog):
	$Panel/VBox/Gold.text = "소지금: %d G" % PlayerData.gold
	for c in $Panel/VBox/ItemsScroll/Items.get_children():
		c.queue_free()
	for entry in catalog:
		var row = HBoxContainer.new()
		row.size_flags_horizontal = SIZE_EXPAND_FILL
		var label = Label.new()
		label.text = "%s  —  %s G" % [entry.name, entry.price]
		label.size_flags_horizontal = SIZE_EXPAND_FILL
		row.add_child(label)
		var buy_btn = Button.new()
		buy_btn.text = "구매"
		buy_btn.disabled = PlayerData.gold < entry.price
		buy_btn.connect("pressed", self, "_on_buy", [entry, catalog])
		row.add_child(buy_btn)
		$Panel/VBox/ItemsScroll/Items.add_child(row)


func _on_buy(entry, catalog):
	if PlayerData.gold < entry.price:
		return
	PlayerData.add_gold(-entry.price)
	var item = {"id": entry.id, "name": entry.name, "kind": entry.kind}
	if entry.kind == "potion":
		item["heal_amount"] = int(entry.effect)
	elif entry.kind == "weapon":
		item["atk_bonus"] = int(entry.effect)
	elif entry.kind == "armor":
		item["def_bonus"] = int(entry.effect)
	PlayerData.add_item(item.id, item.name, item.kind, 1, item)
	if entry.kind != "potion":
		PlayerData.equip(item)
	_refresh(catalog)


func _on_Close_pressed():
	hide()
	if _player:
		_player.active = true
		_player = null
