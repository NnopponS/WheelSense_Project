extends Area2D

# @export จะทำให้เราพิมพ์เปลี่ยนชื่อห้องได้จากหน้าต่าง Inspector ด้านนอก!
@export var room_name: String = "Room 000"

func _ready():
	# สั่งให้มันเชื่อมสัญญาณเข้าหาโค้ดตัวเองอัตโนมัติ (ไม่ต้องไปนั่งกดดับเบิ้ลคลิกเองแล้ว!)
	body_entered.connect(_on_body_entered)
	body_exited.connect(_on_body_exited)

func _on_body_entered(body):
	# เช็คว่าคนที่เหยียบ มีป้ายชื่อกลุ่ม npc ไหม?
	if body.is_in_group("NPC"):
		# เช็คให้ชัวร์ว่า NPC ตัวนี้มีตัวแปร current_location ให้เปลี่ยนค่า
		if "current_location" in body:
			body.current_location = room_name
		print(body.name, " เดินเข้ามาใน: ", room_name)
		
		# Send room enter event to WheelSense backend via Bridge
		if "CHARACTER_NAME" in body:
			Bridge.send_room_enter(body.CHARACTER_NAME, room_name)

func _on_body_exited(body):
	if body.is_in_group("NPC"):
		if "current_location" in body and body.current_location == room_name:
			body.current_location = "Hallway"
		print(body.name, " เดินออกไปทางเดิน")
