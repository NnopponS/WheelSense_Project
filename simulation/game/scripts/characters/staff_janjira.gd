extends CharacterBody2D

enum State { IDLE, WANDERING, HELPING, TREATING, RETURNING }
var current_state = State.WANDERING 

@export var walk_speed: float = 30.0
@export var run_speed: float = 75.0
var current_speed: float = walk_speed

var target_patient: Node2D = null
const CHARACTER_NAME = "Janjira"

@export var standby_station: Node2D
@onready var sprite = $AnimatedSprite2D
@onready var nav_agent = $NavigationAgent2D
@onready var wander_timer = $Timer

func _ready():
	wander_timer.wait_time = randf_range(1.0, 5.0)
	wander_timer.timeout.connect(_on_wander_timer_timeout)
	wander_timer.start()
	
	Bridge.go_to_room_received.connect(_on_go_to_room)

func _physics_process(_delta):
	if current_state == State.TREATING:
		velocity = Vector2.ZERO
		return 
	if current_state == State.IDLE:
		velocity = Vector2.ZERO
		sprite.play("idle_south")
		return
	
	if nav_agent.is_navigation_finished():
		if current_state == State.HELPING:
			current_state = State.TREATING
			hide()
			if target_patient and target_patient.has_method("start_receiving_treatment"):
				target_patient.start_receiving_treatment(name)
			await get_tree().create_timer(2.0).timeout
			show()
			if target_patient and target_patient.has_method("finish_treatment"):
				target_patient.finish_treatment()
			target_patient = null
			if standby_station != null:
				current_state = State.RETURNING
				current_speed = walk_speed
				nav_agent.target_position = standby_station.global_position
			else:
				current_state = State.WANDERING
				wander_timer.start()
		elif current_state == State.RETURNING:
			current_state = State.IDLE
			velocity = Vector2.ZERO 
			sprite.play("idle_south")
			wander_timer.start()
		elif current_state == State.WANDERING:
			current_state = State.IDLE
			velocity = Vector2.ZERO 
			sprite.play("idle_south")
			wander_timer.start()
		return
	
	var next_path_pos = nav_agent.get_next_path_position()
	var raw_direction = global_position.direction_to(next_path_pos)
	velocity = raw_direction * current_speed
	move_and_slide()
	var actual_velocity = get_real_velocity()
	if actual_velocity.length() > 5.0:
		update_animation(actual_velocity)
	
	var current_agent_position = global_position
	var next_path_position = nav_agent.get_next_path_position()
	var direction = current_agent_position.direction_to(next_path_position)
	velocity = direction * current_speed
	move_and_slide()
	update_animation(direction)

func go_help_patient(patient_node: Node2D):
	target_patient = patient_node 
	current_state = State.HELPING
	current_speed = run_speed
	wander_timer.stop()
	var direction_to_patient = global_position.direction_to(patient_node.global_position)
	var offset_position = patient_node.global_position - (direction_to_patient * 25.0)
	nav_agent.target_position = offset_position

func _on_wander_timer_timeout():
	if current_state != State.HELPING:
		current_state = State.WANDERING
		current_speed = walk_speed
		var random_x = randf_range(-80, 80)
		var random_y = randf_range(-80, 80)
		var random_target = global_position + Vector2(random_x, random_y)
		nav_agent.target_position = random_target

func _on_go_to_room(character_name: String, room_name: String):
	if character_name != CHARACTER_NAME:
		return
	
	print("Janjira: Received command to go to ", room_name)
	var room_position = _get_room_position(room_name)
	if room_position != Vector2.ZERO:
		current_state = State.WANDERING
		current_speed = walk_speed
		wander_timer.stop()
		nav_agent.target_position = room_position
		print("Janjira: Navigating to ", room_name, " at ", room_position)
	else:
		print("Janjira: Could not find room ", room_name)

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

func update_animation(vel: Vector2):
	var abs_x = abs(vel.x)
	var abs_y = abs(vel.y)
	if abs_x > abs_y * 1.1:
		if vel.x > 0:
			sprite.flip_h = false
			sprite.play("walk_east")
		else:
			sprite.flip_h = true
			sprite.play("walk_east")
	elif abs_y > abs_x * 1.1:
		sprite.flip_h = false
		if vel.y > 0:
			sprite.play("walk_south")
		else:
			sprite.play("walk_north")
