extends Combatant

# Pulls live stats from the PlayerData autoload at the start of every fight
# (so leveling/equipment actually matter) and writes HP back when the fight
# ends, since PlayerData — not this node — is what survives scene changes.


func _ready():
	damage = PlayerData.get_attack()
	defense = PlayerData.get_defense()
	$Health.max_life = PlayerData.get_max_hp()
	$Health.base_armor = 0
	$Health.armor = 0
	$Health.life = clamp(PlayerData.current_hp, 1, $Health.max_life)


func sync_to_player_data():
	PlayerData.current_hp = max(0, $Health.life)
