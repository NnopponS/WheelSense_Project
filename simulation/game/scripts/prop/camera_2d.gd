extends Camera2D

# ตัวแปรเช็คว่ากำลังกดค้างอยู่หรือไม่
var is_dragging: bool = false

# ใช้ _unhandled_input เพื่อป้องกันไม่ให้ไปกวนเวลาเราคลิกปุ่ม UI อื่นๆ
func _unhandled_input(event: InputEvent) -> void:
	
	# 1. ตรวจสอบการกดเมาส์ "คลิกขวา" (MOUSE_BUTTON_RIGHT)
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_RIGHT:
		if event.pressed:
			is_dragging = true
		else:
			is_dragging = false
			
	# 2. ตรวจสอบการ "แตะหน้าจอ" (Touch Screen)
	elif event is InputEventScreenTouch:
		if event.pressed:
			is_dragging = true
		else:
			is_dragging = false
			
	# 3. จัดการตอนที่เลื่อนเมาส์ หรือ ปัดนิ้วบนหน้าจอ
	elif event is InputEventMouseMotion or event is InputEventScreenDrag:
		if is_dragging:
			# ใช้ event.relative (ระยะกระจัดจากเฟรมที่แล้ว) มาลบออกจาก position 
			# หารด้วย zoom เพื่อให้ความเร็วการลากสัมพันธ์กับระยะซูม (ถ้าซูมเข้า ลากนิดเดียวกล้องจะไปไกล)
			position -= event.relative / zoom
