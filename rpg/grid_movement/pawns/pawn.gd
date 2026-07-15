class_name Pawn
extends Node2D


enum CellType { ACTOR, OBSTACLE, OBJECT }
#warning-ignore:unused_class_variable
export(CellType) var type = CellType.ACTOR
# once PlayerData.flags[epilogue_flag] is true, this pawn's dialogue swaps to
# epilogue_dialogue_file — lets NPCs react to story progress without a
# separate scripted cutscene system
export(String) var epilogue_flag = ""
export(String) var epilogue_dialogue_file = ""

var active = true setget set_active


func _ready():
	_apply_epilogue()


func _apply_epilogue():
	if epilogue_flag == "" or not has_node("DialoguePlayer"):
		return
	if PlayerData.flags.get(epilogue_flag, false):
		$DialoguePlayer.dialogue_file = epilogue_dialogue_file


func set_active(value):
	active = value
	set_process(value)
	set_process_input(value)
