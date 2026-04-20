extends Node2D

@onready var sprite = $AnimatedSprite2D
@onready var solid_collision = $StaticBody2D/CollisionShape2D
@onready var sensor = $Area2D

func _ready():
	close_door()

# ฟังก์ชันเปิดประตู
func open_door():
	sprite.play("open")
	# ปิดกำแพง ให้เดินทะลุได้ 
	solid_collision.set_deferred("disabled", true)

# ฟังก์ชันปิดประตู
func close_door():
	sprite.play("close") 
	# เปิดกำแพงขวางไว้เหมือนเดิม
	solid_collision.set_deferred("disabled", false)


func _on_area_2d_body_entered(body: Node2D) -> void:
	if body is CharacterBody2D:
		open_door()


func _on_area_2d_body_exited(body: Node2D) -> void:
	if body is CharacterBody2D:
		var bodies_in_area = sensor.get_overlapping_bodies()
		var character_count = 0
		
		for b in bodies_in_area:
			if b is CharacterBody2D:
				character_count += 1
				
		if character_count == 0:
			close_door()
