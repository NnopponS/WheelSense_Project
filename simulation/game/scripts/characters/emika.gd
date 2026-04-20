extends CharacterBody2D

# Define the states our NPC can be in
enum State { WANDERING, FALL, SIT }
var current_state = State.WANDERING

@export var walk_speed: float = 4.0
@export var TILE_SIZE: int = 16

@onready var sprite = $AnimatedSprite2D
@onready var wait_timer = $Timer
@onready var http_request = $HTTPRequest
@onready var action_menu = $Menu

var is_moving: bool = false
var target_position: Vector2 = Vector2.ZERO
var directions = [Vector2.UP, Vector2.DOWN, Vector2.LEFT, Vector2.RIGHT]
var current_location: String = "Room401"

func _ready():
	input_pickable = true
	
	# Connect the HTTP request signal
	http_request.request_completed.connect(_on_request_completed)
	
	# 1. ส่งชื่อไปเปลี่ยนที่หัวเมนู (ถ้าเป็นคนอื่นก็เปลี่ยนชื่อตรงนี้)
	action_menu.set_patient_name("Emika")
	action_menu.visible = false
	
	# 2. เชื่อมสัญญาณปุ่ม
	action_menu.force_fall.connect(_on_menu_force_fall)
	action_menu.toggle_ac.connect(_on_menu_toggle_ac)
	action_menu.toggle_lamp.connect(_on_menu_toggle_lamp)
	
	# Setup wandering logic
	position = position.snapped(Vector2(TILE_SIZE, TILE_SIZE))
	target_position = position
	wait_timer.one_shot = true
	wait_timer.timeout.connect(_on_timer_timeout)
	
	start_waiting()

func _physics_process(delta):
	# Only allow movement if the NPC is in the WANDERING state
	if current_state == State.WANDERING and is_moving:
		move_npc(delta)

# --- CLICK INTERACTION & STATE LOGIC ---

func _input_event(_viewport, event, _shape_idx):
	var is_left_click = event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed
	var is_touch = event is InputEventScreenTouch and event.pressed
	
	if is_left_click or is_touch:
		if !action_menu.visible:
			is_moving = false
			wait_timer.stop()
			sprite.play("playing_phone")
		else:
			sprite.play_backwards("playing_phone")
			await sprite.animation_finished
			is_moving = true
			wait_timer.start()
		action_menu.visible = !action_menu.visible
		
		
func _on_menu_force_fall():
	if current_state == State.WANDERING:
		current_state = State.FALL
		call_closest_doctor() # เรียกหมอ
		
		is_moving = false
		wait_timer.stop()
		position = target_position 
		
		sprite.play("falling_south")
		send_patient_data()
		await sprite.animation_finished

# --- HTTP REQUEST LOGIC ---

func send_patient_data():
	var url = "http://127.0.0.1:5000/api/update_status"
	
	# Structuring the payload with dashboard monitoring data
	var data = {
		"patient_name": "Mrs.Emika Charoenpho",
		"mobility": "wheelchair",
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
		print("Elena ตะโกนเรียก: ", closest_doctor.name, " มาช่วยแล้ว!")
		
# --- ระบบรับการปฐมพยาบาล ---

# หมอจะเรียกฟังก์ชันนี้ตอนที่เดินมาถึงตัว
func start_receiving_treatment(doctor_name: String):
	# เปลี่ยนไปเล่นอนิเมชั่นตอนโดนช่วย (เปลี่ยนชื่อเป็นอนิเมชั่นของคุณ)
	if doctor_name == "Male_nurse":
		sprite.play("male_nurse") 
	elif doctor_name == "Female_nurse":
		sprite.play("female_nurse") 
	print("Elena: กำลังรับการปฐมพยาบาล...หมอ", doctor_name, "!")

# หมอจะเรียกฟังก์ชันนี้ตอนรักษาเสร็จ (ครบ 3 วินาที)
func finish_treatment():
	current_state = State.SIT
	
	sprite.play("idle_south") # เล่นท่าลุกขึ้น
	await sprite.animation_finished # รอจนลุกเสร็จ
	
	sprite.play("walk_south") 
	current_state = State.WANDERING # กลับมาเดินเล่นได้ปกติ
	start_waiting()
	print("Elena: อาการดีขึ้นแล้ว กลับสู่สภาวะปกติ")

# --- WANDERING MOVEMENT LOGIC ---

func start_waiting():
	if current_state != State.WANDERING:
		return # Don't start timers if we are stuck in an animation state
		
	sprite.stop()
	wait_timer.wait_time = randf_range(1.0, 3.0)
	wait_timer.start()

func _on_timer_timeout():
	if current_state == State.WANDERING:
		choose_random_direction()

func choose_random_direction():
	var random_dir = directions.pick_random()
	var desired_step = random_dir * TILE_SIZE
	
	if not is_colliding(desired_step):
		target_position = position + desired_step
		update_animation(random_dir)
		is_moving = true
	else:
		start_waiting()

func move_npc(delta):
	position = position.move_toward(target_position, walk_speed * TILE_SIZE * delta)
	
	if position == target_position:
		is_moving = false
		start_waiting()

func update_animation(direction: Vector2):
	if direction == Vector2.LEFT:
		sprite.flip_h = true
		sprite.play("walk_east")
	elif direction == Vector2.RIGHT:
		sprite.flip_h = false
		sprite.play("walk_east")
	elif direction == Vector2.UP:
		sprite.flip_h = false
		sprite.play("walk_north")
	elif direction == Vector2.DOWN:
		sprite.flip_h = false
		sprite.play("walk_south")
		
func _on_menu_toggle_ac(is_on: bool):
	# 1. เหมาเข่งดึงแอร์ทุกตัวในเกมมา
	var all_acs = get_tree().get_nodes_in_group("ac")
	
	# 2. เช็คทีละตัวว่า ตัวไหนอยู่ห้องเดียวกับฉัน?
	for ac in all_acs:
		if "room_name" in ac and ac.room_name == current_location:
			ac.set_state(is_on) # สั่งเปิด/ปิด
			sprite.play_backwards("playing_phone")
			await sprite.animation_finished
			is_moving = true
			wait_timer.start()
			print("สั่งแอร์ห้อง ", current_location, " ให้: ", "เปิด" if is_on else "ปิด")

# เมื่อรับคำสั่งเปิด/ปิดโคมไฟจากเมนู
func _on_menu_toggle_lamp(is_on: bool):
	var all_lamps = get_tree().get_nodes_in_group("lamp")
	
	for lamp in all_lamps:
		if "room_name" in lamp and lamp.room_name == current_location:
			lamp.set_state(is_on)
			sprite.play_backwards("playing_phone")
			await sprite.animation_finished
			is_moving = true
			wait_timer.start()
			
			print("สั่งโคมไฟห้อง ", current_location, " ให้: ", "เปิด" if is_on else "ปิด")

func is_colliding(relative_vec: Vector2) -> bool:
	return test_move(transform, relative_vec)
