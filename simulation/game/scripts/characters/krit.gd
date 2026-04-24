extends CharacterBody2D

# Define the states our NPC can be in
enum State { WANDERING, FALL, SIT }
var current_state = State.WANDERING

@export var walk_speed: float = 4.0
@export var TILE_SIZE: int = 16

@onready var sprite = $AnimatedSprite2D
@onready var wait_timer = $Timer
@onready var action_menu = $Menu
@onready var nav_agent = $NavigationAgent2D

# Game character name for backend bridge
const CHARACTER_NAME = "krit"

var is_moving: bool = false
var target_position: Vector2 = Vector2.ZERO
var directions = [Vector2.UP, Vector2.DOWN, Vector2.LEFT, Vector2.RIGHT]
var current_location: String = "Room403"

func _ready():
	input_pickable = true
	
	# Connect bridge signals for backend communication
	Bridge.connected.connect(_on_bridge_connected)
	Bridge.disconnected.connect(_on_bridge_disconnected)
	Bridge.go_to_room_received.connect(_on_go_to_room)
	
	# 1. ส่งชื่อไปเปลี่ยนที่หัวเมนู (ถ้าเป็นคนอื่นก็เปลี่ยนชื่อตรงนี้)
	action_menu.set_patient_name("Krit")
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
		# Signal distress via Bridge - backend handles dispatch flow
		Bridge.send_distress_signal(CHARACTER_NAME, current_location, "fall")
		
		is_moving = false
		wait_timer.stop()
		position = target_position 
		
		sprite.play("falling_south")
		await sprite.animation_finished

# --- BRIDGE / BACKEND COMMUNICATION ---

func _on_bridge_connected():
	print("Krit: Connected to WheelSense backend")

func _on_bridge_disconnected():
	print("Krit: Disconnected from WheelSense backend")

# --- Backend-Driven Movement ---
func _on_go_to_room(character_name: String, room_name: String):
	if character_name != CHARACTER_NAME:
		return
	
	print("Krit: Received command to go to ", room_name)
	
	var room_position = _get_room_position(room_name)
	if room_position != Vector2.ZERO:
		is_moving = false
		wait_timer.stop()
		nav_agent.target_position = room_position
		current_state = State.WANDERING
		is_moving = true
		print("Krit: Navigating to ", room_name, " at ", room_position)
	else:
		print("Krit: Could not find room ", room_name)

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
		"Mr.Krit Wongwattana",
		"Normal Mobility",
		"An accident occurred",
		current_location
	)
		
# --- Backend-Driven Dispatch ---
# Observers Accept/Decline via mobile app; backend routes to caregiver.
func _on_dispatch_accepted(character_name: String, room_name: String, accepted_by: String):
	if room_name == current_location:
		print("Krit: Dispatch accepted by ", accepted_by, ", nurse will arrive soon")
		
# --- ระบบรับการปฐมพยาบาล ---

# หมอจะเรียกฟังก์ชันนี้ตอนที่เดินมาถึงตัว
func start_receiving_treatment(doctor_name: String):
	# เปลี่ยนไปเล่นอนิเมชั่นตอนโดนช่วย (เปลี่ยนชื่อเป็นอนิเมชั่นของคุณ)
	if doctor_name == "Male_nurse":
		sprite.play("male_nurse") 
	elif doctor_name == "Female_nurse":
		sprite.play("female_nurse") 
	print("Krit: กำลังรับการปฐมพยาบาล...หมอ", doctor_name, "!")

# หมอจะเรียกฟังก์ชันนี้ตอนรักษาเสร็จ (ครบ 3 วินาที)
func finish_treatment():
	current_state = State.SIT
	
	sprite.play("idle_south") # เล่นท่าลุกขึ้น
	await sprite.animation_finished # รอจนลุกเสร็จ
	
	sprite.play("walk_south") 
	current_state = State.WANDERING # กลับมาเดินเล่นได้ปกติ
	start_waiting()
	print("Krit: อาการดีขึ้นแล้ว กลับสู่สภาวะปกติ")

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
	if nav_agent.is_navigation_finished():
		is_moving = false
		start_waiting()
		return
	
	var next_path_pos = nav_agent.get_next_path_position()
	var direction = global_position.direction_to(next_path_pos)
	
	velocity = direction * walk_speed * TILE_SIZE
	move_and_slide()
	
	if velocity.length() > 0.1:
		update_animation(direction)
	
	if global_position.distance_to(nav_agent.target_position) < 5.0:
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
