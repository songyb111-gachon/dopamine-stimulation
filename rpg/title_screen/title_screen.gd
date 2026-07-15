extends Control


func _ready():
	$Panel/VBox/Continue.disabled = not PlayerData.has_save()
	if $Panel/VBox/Continue.disabled:
		$Panel/VBox/NewGame.grab_focus()
	else:
		$Panel/VBox/Continue.grab_focus()


func _on_NewGame_pressed():
	PlayerData.reset_new_game()
	get_tree().change_scene("res://game.tscn")


func _on_Continue_pressed():
	if not PlayerData.has_save():
		return
	PlayerData.load_game()
	get_tree().change_scene("res://game.tscn")
