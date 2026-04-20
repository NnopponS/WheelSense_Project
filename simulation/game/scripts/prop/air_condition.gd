extends Node2D # เปลี่ยนให้ตรงกับโหนดหลักของเรา

# @export ทำให้เราพิมพ์บอกได้ว่าแอร์ตัวนี้อยู่ห้องไหนผ่าน Inspector
@export var room_name: String = "Room 401" 
@onready var sprite = $AnimatedSprite2D

func set_state(is_on: bool):
	if is_on:
		# สั่งเล่นอนิเมชั่นเปิด (เปลี่ยนชื่อ "on" เป็นชื่ออนิเมชั่นของคุณ)
		sprite.play("ON") 
		# ถ้าใช้ Sprite2D ธรรมดาที่เปลี่ยนรูป ให้ใช้: texture = load("res://...รูปเปิด.png")
	else:
		# สั่งเล่นอนิเมชั่นปิด
		sprite.play("OFF")
