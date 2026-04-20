extends CharacterBody2D

# Define the states our NPC can be in
enum State { WANDERING, FALL, SIT }
var current_state = State.WANDERING

@export var walk_speed: float = 4.0
@export var TILE_SIZE: int = 16

@onready var sprite = $AnimatedSprite2D
@onready var http_request = $HTTPRequest
@onready var action_menu = $Menu

var current_location: String = "Room402"

func _ready():
	input_pickable = true
	
	# Connect the HTTP request signal
	http_request.request_completed.connect(_on_request_completed)
	
	# 1. ส่งชื่อไปเปลี่ยนที่หัวเมนู (ถ้าเป็นคนอื่นก็เปลี่ยนชื่อตรงนี้)
	action_menu.set_patient_name("Wichai")
	action_menu.visible = false
	
	# 2. เชื่อมสัญญาณปุ่ม
	action_menu.force_fall.connect(_on_menu_force_fall)
	action_menu.toggle_ac.connect(_on_menu_toggle_ac)
	action_menu.toggle_lamp.connect(_on_menu_toggle_lamp)

# --- CLICK INTERACTION & STATE LOGIC ---

func _input_event(_viewport, event, _shape_idx):
	var is_left_click = event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed
	var is_touch = event is InputEventScreenTouch and event.pressed
	
	if is_left_click or is_touch:
		if !action_menu.visible:
			sprite.play("playing_phone")
		else:
			sprite.play_backwards("playing_phone")
			await sprite.animation_finished
		action_menu.visible = !action_menu.visible
		
		
func _on_menu_force_fall():
	if current_state == State.WANDERING:
		current_state = State.FALL
		call_closest_doctor() # เรียกหมอ

		
		sprite.play("heart_attack")
		send_patient_data()
		await sprite.animation_finished

# --- HTTP REQUEST LOGIC ---

func send_patient_data():
	var url = "http://127.0.0.1:5000/api/update_status"
	
	# Structuring the payload with dashboard monitoring data
	var data = {
		"patient_name": "Mr.Wichai Phattharaphong",
		"mobility": "Bedridden Patient",
		"status": "An accident occurred",
		"location": current_location
	}
	
	var json_string = JSON.stringify(data)
	var headers = ["Content-Type: application/json"]
	
	print("Sending patient data to Web Portal API...")
	http_request.request(url, headers, HTTPClient.METHOD_POST, json_string)

func _on_request_completed(_result, response_code, _headers, _body):
	if response_code == 200 or response_code == 201:
		print("API Success: Data securely pushed to server.")
	else:
		print("API Error: ", response_code)
		
# --- Call Caregiver ---
func call_closest_doctor():
	# 1. ดึงรายชื่อทุกคนที่อยู่ในกลุ่ม "doctors" มา
	var all_doctors = get_tree().get_nodes_in_group("caregiver")
	
	if all_doctors.size() == 0:
		return # ถ้าไม่มีหมออยู่เลยให้ข้ามไป
		
	var closest_doctor = null
	var min_distance = INF # ตั้งค่าเริ่มต้นให้ระยะทางไกลที่สุดเท่าที่เป็นไปได้
	
	# 2. เอาตลับเมตรวัดระยะทางไปหาหมอทีละคน
	for doc in all_doctors:
		# global_position.distance_to คือคำสั่งวัดระยะทางของ Godot
		var distance = global_position.distance_to(doc.global_position)
		
		# ถ้าเจอคนที่ใกล้กว่าสถิติเดิม ให้จดชื่อคนนั้นไว้
		if distance < min_distance:
			min_distance = distance
			closest_doctor = doc
			
	# 3. สั่งให้ผู้ดูแลคนที่ใกล้ที่สุด เดินมาหา (ส่งตัวเองไปให้หมอรู้จัก)
	if closest_doctor != null:
		# เปลี่ยนจาก global_position เป็น self
		closest_doctor.go_help_patient(self) 
		print("Wichai ตะโกนเรียก: ", closest_doctor.name, " มาช่วยแล้ว!")
		
# --- ระบบรับการปฐมพยาบาล ---

# หมอจะเรียกฟังก์ชันนี้ตอนที่เดินมาถึงตัว
func start_receiving_treatment(doctor_name: String):
	# เปลี่ยนไปเล่นอนิเมชั่นตอนโดนช่วย (เปลี่ยนชื่อเป็นอนิเมชั่นของคุณ)
	if doctor_name == "Male_nurse":
		sprite.play("male_nurse") 
	elif doctor_name == "Female_nurse":
		sprite.play("female_nurse") 
	print("Wichai: กำลังรับการปฐมพยาบาล...หมอ", doctor_name, "!")

# หมอจะเรียกฟังก์ชันนี้ตอนรักษาเสร็จ (ครบ 3 วินาที)
func finish_treatment():
	current_state = State.SIT
	
	sprite.play("idle_south") # เล่นท่าลุกขึ้น
	await sprite.animation_finished # รอจนลุกเสร็จ
	
	current_state = State.WANDERING # กลับมาเดินเล่นได้ปกติ
	print("Wichai: อาการดีขึ้นแล้ว กลับสู่สภาวะปกติ")

		
func _on_menu_toggle_ac(is_on: bool):
	# 1. เหมาเข่งดึงแอร์ทุกตัวในเกมมา
	var all_acs = get_tree().get_nodes_in_group("ac")
	
	# 2. เช็คทีละตัวว่า ตัวไหนอยู่ห้องเดียวกับฉัน?
	for ac in all_acs:
		if "room_name" in ac and ac.room_name == current_location:
			ac.set_state(is_on) # สั่งเปิด/ปิด
			sprite.play_backwards("playing_phone")
			print("สั่งแอร์ห้อง ", current_location, " ให้: ", "เปิด" if is_on else "ปิด")

# เมื่อรับคำสั่งเปิด/ปิดโคมไฟจากเมนู
func _on_menu_toggle_lamp(is_on: bool):
	var all_lamps = get_tree().get_nodes_in_group("lamp")
	
	for lamp in all_lamps:
		if "room_name" in lamp and lamp.room_name == current_location:
			lamp.set_state(is_on)
			sprite.play_backwards("playing_phone")
			print("สั่งโคมไฟห้อง ", current_location, " ให้: ", "เปิด" if is_on else "ปิด")

func is_colliding(relative_vec: Vector2) -> bool:
	return test_move(transform, relative_vec)
