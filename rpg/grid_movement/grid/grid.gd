extends TileMap


enum CellType { ACTOR, OBSTACLE, OBJECT }
export(NodePath) var dialogue_ui

# quest gates: a wall of obstacle tiles that opens permanently once its flag
# is set. Cells are carved at _ready() if the flag is already true (continue/
# load-game), and live via open_gate() the instant the flag is set in-session.
const GATES = {
	"forest_to_cave": {"flag": "looted_thorn_scale_armor", "x": [17, 30], "y": [4, 5]},
	"cave_to_ruins": {"flag": "opened_cave_chest", "x": [48, 50], "y": [4, 5]},
}


func _ready():
	for child in get_children():
		set_cellv(world_to_map(child.position), child.type)
	_apply_open_gates()


func _apply_open_gates():
	for gate_id in GATES:
		if PlayerData.flags.get(GATES[gate_id].flag, false):
			open_gate(gate_id)


func open_gate(gate_id):
	var gate = GATES[gate_id]
	for y in range(gate.y[0], gate.y[1] + 1):
		for x in range(gate.x[0], gate.x[1] + 1):
			set_cellv(Vector2(x, y), -1)


func check_gates():
	for gate_id in GATES:
		if PlayerData.flags.get(GATES[gate_id].flag, false):
			open_gate(gate_id)
	# also refresh any NPC/sign dialogue gated on the same flags so text that
	# was "blocked" updates immediately, not just on the next scene load
	for child in get_children():
		if child.has_method("_apply_epilogue"):
			child._apply_epilogue()


func get_cell_pawn(cell, type = CellType.ACTOR):
	for node in get_children():
		if node.type != type:
			continue
		if world_to_map(node.position) == cell:
			return(node)


func request_move(pawn, direction):
	var cell_start = world_to_map(pawn.position)
	var cell_target = cell_start + direction

	var cell_tile_id = get_cellv(cell_target)
	match cell_tile_id:
		-1:
			set_cellv(cell_target, CellType.ACTOR)
			set_cellv(cell_start, -1)
			return map_to_world(cell_target) + cell_size / 2
		CellType.OBJECT, CellType.ACTOR:
			var target_pawn = get_cell_pawn(cell_target, cell_tile_id)
			print("Cell %s contains %s" % [cell_target, target_pawn.name])

			if not target_pawn.has_node("DialoguePlayer"):
				return
			get_node(dialogue_ui).show_dialogue(pawn, target_pawn.get_node("DialoguePlayer"))
