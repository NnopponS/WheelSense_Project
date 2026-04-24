extends CharacterBody2D

# Define the states our NPC can be in
enum State { WANDERING, FALL, SIT }
var current_state = State.WANDERING

@export var walk_speed: float = 4.0
@export var TILE_SIZE: int = 16

@onready var sprite = $AnimatedSprite2D
@onready var action_menu = $Menu
@onready var nav_agent = $NavigationAgent2D

# Game character name for backend bridge
const CHARACTER_NAME = "wichai"

var current_location: String = "Room402"

func _ready():
	input_pickable = true
	
	# Connect bridge signals for backend communication
	Bridge.connected.connect(_on_bridge_connected)
	Bridge.disconnected.connect(_on_bridge_disconnected)
	Bridge.go_to_room_received.connect(_on_go_to_room)
	
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
		# Signal distress via Bridge - backend will handle dispatch flow
		# instead of auto-calling closest doctor
		Bridge.send_distress_signal(CHARACTER_NAME, current_location, "heart_attack")
		
		sprite.play("heart_attack")
		await sprite.animation_finished

# --- BRIDGE / BACKEND COMMUNICATION ---

func _on_bridge_connected():
	print("Wichai: Connected to WheelSense backend")

func _on_bridge_disconnected():
	print("Wichai: Disconnected from WheelSense backend")

# --- Backend-Driven Movement ---
func _on_go_to_room(character_name: String, room_name: String):
	if character_name != CHARACTER_NAME:
		return
	
	print("Wichai: Received command to go to ", room_name)
	
	var room_position = _get_room_position(room_name)
	if room_position != Vector2.ZERO:
		nav_agent.target_position = room_position
		print("Wichai: Navigating to ", room_name, " at ", room_position)
	else:
		print("Wichai: Could not find room ", room_name)

func _get_room_position(room_name: String) -> Vector2:
	match room_name:
		"Room 401", "Room401":
			return Vector2(77.5, -398)
		"Room 402", "Room402":
			return Vector2(453, -384.5)
		"Room 403", "Room403":
			return Vector2(69, 154)
		"Room 404", "Room404":
			return Vector2(454, 146.75)
		_:
			return Vector2.ZERO

func send_patient_data():
	# Send via WheelSense Bridge (WebSocket) instead of legacy HTTP
	print("Sending patient data to WheelSense backend via Bridge...")
	Bridge.send_patient_data(
		"Mr.Wichai Phattharaphong",
		"Bedridden Patient",
		"An accident occurred",
		current_location
	)
		
# --- Backend-Driven Dispatch ---
# Observers now Accept/Decline via mobile app before nurse is dispatched.
# Patient only signals distress; backend routes to available caregiver.
func _on_dispatch_accepted(character_name: String, room_name: String, accepted_by: String):
	# Called when backend confirms an observer accepted the dispatch
	if character_name == CHARACTER_NAME and room_name == current_location:
		print("Wichai: Dispatch accepted by ", accepted_by, ", nurse will arrive soon")
		
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
