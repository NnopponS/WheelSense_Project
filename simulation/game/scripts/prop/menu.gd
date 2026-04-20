extends Control

# ดึงโหนดต่างๆ มาใช้งาน (อย่าลืมเช็คชื่อโหนดให้ตรงกับใน Scene ของคุณนะครับ)
@onready var title_label = $NinePatchRect/Label
@onready var btn_ac = $NinePatchRect/Button_AC
@onready var btn_lamp = $NinePatchRect/Button_Lamp
@onready var btn_fall = $NinePatchRect/Button_Fall

# ตัวแปรเก็บสถานะ
var is_ac_on: bool = false
var is_lamp_on: bool = false
var patientname: String = ""

# สร้าง Signal เอาไว้ส่งคำสั่งไปให้ตัวละครหรือระบบห้อง
signal toggle_ac(state)
signal toggle_lamp(state)
signal force_fall()

func _ready():
	# เชื่อมปุ่มกดเข้ากับฟังก์ชัน
	btn_ac.pressed.connect(_on_ac_pressed)
	btn_lamp.pressed.connect(_on_lamp_pressed)
	btn_fall.pressed.connect(_on_fall_pressed)
	update_button_text()

# ฟังก์ชันนี้เอาไว้ให้ตัวละครอื่นเรียกใช้เพื่อเปลี่ยนชื่อหัวเมนู
func set_patient_name(patient_name: String):
	title_label.text = patient_name.to_upper() + "'S REQUESTS"
	patientname = patient_name

# อัปเดตข้อความบนปุ่ม
func update_button_text():
	if is_ac_on:
		btn_ac.text = "Turn Off AC\n(Current: ON)"
	else:
		btn_ac.text = "Turn On AC\n(Current: OFF)"
		
	if is_lamp_on:
		btn_lamp.text = "Turn Off Lamp\n(Current: ON)"
	else:
		btn_lamp.text = "Turn On Lamp\n(Current: OFF)"
		
	if patientname == "Wichai":
		btn_fall.text = "Heart Attack"
	else:
		btn_fall.text = "Force Fall"

# เมื่อกดปุ่มแอร์
func _on_ac_pressed():
	is_ac_on = !is_ac_on # สลับ On เป็น Off, Off เป็น On
	update_button_text()
	toggle_ac.emit(is_ac_on) # ส่งสัญญาณไปบอกระบบแอร์
	visible = false # ซ่อนเมนูหลังจากสั่งให้ล้ม

# เมื่อกดปุ่มโคมไฟ
func _on_lamp_pressed():
	is_lamp_on = !is_lamp_on
	update_button_text()
	toggle_lamp.emit(is_lamp_on) # ส่งสัญญาณไปบอกโคมไฟ
	visible = false # ซ่อนเมนูหลังจากสั่งให้ล้ม

# เมื่อกดปุ่มล้ม
func _on_fall_pressed():
	force_fall.emit() # ส่งคำสั่งให้ตัวละครล้ม
	visible = false # ซ่อนเมนูหลังจากสั่งให้ล้ม
