extends CharacterBody2D

enum State { IDLE, WANDERING, HELPING, TREATING, RETURNING }
# เริ่มเกมมาให้หมออยู่ในสถานะเดินเล่นเลย
var current_state = State.WANDERING 

@export var walk_speed: float = 30.0 # ความเร็วตอนเดินเล่นชิลๆ
@export var run_speed: float = 75.0  # ความเร็วตอนวิ่งหน้าตั้งไปช่วยคนไข้
var current_speed: float = walk_speed

# ประกาศตัวแปรไว้ด้านบนสุด (ใต้ var current_speed...)
var target_patient: Node2D = null

@export var standby_station: Node2D
@onready var sprite = $AnimatedSprite2D
@onready var nav_agent = $NavigationAgent2D
@onready var wander_timer = $Timer

func _ready():
	# ตั้งค่า Timer ให้สุ่มเวลาเดินเล่นทุกๆ 2 ถึง 5 วินาที
	wander_timer.wait_time = randf_range(1.0, 5.0)
	wander_timer.timeout.connect(_on_wander_timer_timeout)
	wander_timer.start()

func _physics_process(_delta):
	# === 1. ดักสถานะหยุดนิ่ง (ป้องกันการไถล) ===
	if current_state == State.TREATING:
		velocity = Vector2.ZERO
		return 
	if current_state == State.IDLE:
		velocity = Vector2.ZERO
		sprite.play("idle_south")
		return
	
	# === 2. ดักจังหวะเดินถึงเป้าหมาย ===
	if nav_agent.is_navigation_finished():
		if current_state == State.HELPING:
			# === ถึงตัวคนไข้แล้ว ===
			current_state = State.TREATING
			
			hide() # 1. สั่งให้หมอล่องหน (ซ่อนตัว)
			
			# 2. สะกิดบอกคนไข้ว่า "หมอมาถึงแล้ว เล่นอนิเมชั่นรักษาได้เลย!"
			if target_patient and target_patient.has_method("start_receiving_treatment"):
				target_patient.start_receiving_treatment(name)
			
			# 3. จำลองเวลารักษา (หน่วงเวลาไว้ 2 วินาที)
			await get_tree().create_timer(2.0).timeout
			
			# 4. รักษาเสร็จแล้ว
			show() # สั่งให้หมอเลิกล่องหน
			
			# 5. สะกิดบอกคนไข้ว่า "เสร็จแล้ว ลุกขึ้นได้"
			if target_patient and target_patient.has_method("finish_treatment"):
				target_patient.finish_treatment()
				
			# 6. หมอกลับไปเดินเล่นตามปกติ
			target_patient = null
			
			if standby_station != null:
				current_state = State.RETURNING # เปลี่ยนเป็นสถานะกำลังกลับ
				current_speed = walk_speed # เดินกลับแบบชิลๆ
				nav_agent.target_position = standby_station.global_position # ปักหมุดไปที่ทางเดิน
				print(name, ": รักษาเสร็จแล้ว กำลังเดินกลับไปจุดพัก")
			else:
				# ถ้าลืมใส่จุดพัก ก็ให้เดินเล่นมั่วๆ ต่อไป
				current_state = State.WANDERING
				wander_timer.start()

		# === เพิ่มบล็อกนี้: เมื่อเดินกลับมาถึงจุดพักแล้ว ===
		elif current_state == State.RETURNING:
			current_state = State.IDLE
			velocity = Vector2.ZERO 
			sprite.play("idle_south")
			wander_timer.start() # ให้เริ่มสุ่มเดินเล่นแถวๆ ทางเดินต่อ

		# (บล็อก WANDERING เดิมยังอยู่เหมือนเดิม)
		elif current_state == State.WANDERING:
			current_state = State.IDLE
			velocity = Vector2.ZERO 
			sprite.play("idle_south")
			wander_timer.start()
		return
	
	# === 3. ระบบเดินหลบหลีกอย่างสมูท (เดินเฉียงได้) ===
	var next_path_pos = nav_agent.get_next_path_position()
	var raw_direction = global_position.direction_to(next_path_pos)
	
	velocity = raw_direction * current_speed
	move_and_slide() # เดินและไถลหลบกำแพง
	
	# === 4. ท่าไม้ตาย: ดึงความเร็วจริงๆ หลังจากไถลกำแพงมาใช้หันหน้า ===
	var actual_velocity = get_real_velocity()
	
	# ถ้าความเร็วจริงๆ มากกว่า 5 (ไม่ใช่วิ่งชนกำแพงจนหยุดนิ่ง) ให้หันหน้า
	if actual_velocity.length() > 5.0:
		update_animation(actual_velocity)

	# --- ระบบ AI คำนวณการเดิน (GPS) ---
	# ถาม NavigationAgent ว่าก้าวต่อไปต้องเดินไปทิศไหนถึงจะหลบกำแพงได้
	var current_agent_position = global_position
	var next_path_position = nav_agent.get_next_path_position()

	var direction = current_agent_position.direction_to(next_path_position)
	velocity = direction * current_speed
	
	move_and_slide() # สั่งให้เดินจริง
	update_animation(direction) # หันหน้าให้ถูกทิศ


func go_help_patient(patient_node: Node2D):
	target_patient = patient_node 
	current_state = State.HELPING
	current_speed = run_speed
	wander_timer.stop()
	
	
	# 1. หาว่าหมอกับผู้ป่วยอยู่ทิศไหนต่อกัน
	var direction_to_patient = global_position.direction_to(patient_node.global_position)
	
	# 2. เอาตำแหน่งผู้ป่วย หักลบด้วยทิศทาง (ถอยหลังออกมา 25 พิกเซล)
	var offset_position = patient_node.global_position - (direction_to_patient * 25.0)
	
	# 3. ส่งจุดที่หักลบแล้วไปให้ AI เดิน
	nav_agent.target_position = offset_position


# --- ฟังก์ชันเดินเล่น (ทำงานเมื่อ Timer นับถอยหลังเสร็จ) ---
func _on_wander_timer_timeout():
	# ถ้าไม่ได้กำลังไปช่วยคนไข้ ถึงจะอนุญาตให้เดินเล่นได้
	if current_state != State.HELPING:
		current_state = State.WANDERING
		current_speed = walk_speed
		
		# สุ่มตำแหน่งใหม่รอบๆ ตัวหมอ (รัศมี 80 พิกเซล)
		var random_x = randf_range(-80, 80)
		var random_y = randf_range(-80, 80)
		var random_target = global_position + Vector2(random_x, random_y)
		
		# ปักหมุด GPS ไปที่ตำแหน่งสุ่ม
		nav_agent.target_position = random_target

# --- ระบบหันหน้า (เหมือนเดิม) ---
func update_animation(vel: Vector2):
	var abs_x = abs(vel.x)
	var abs_y = abs(vel.y)
	
	# เช็คว่าแรงเดินไปทางแกนไหนมากกว่ากัน (ใส่ตัวคูณ 1.1 เพื่อป้องกันการสลับไปมาเวลาเดินเฉียง 45 องศา)
	if abs_x > abs_y * 1.1:
		# เน้นเดินซ้าย-ขวา
		if vel.x > 0:
			sprite.flip_h = false
			sprite.play("walk_east")
		else:
			sprite.flip_h = true
			sprite.play("walk_east")
	elif abs_y > abs_x * 1.1:
		# เน้นเดินบน-ล่าง
		sprite.flip_h = false
		if vel.y > 0:
			sprite.play("walk_south")
		else:
			sprite.play("walk_north")
	# ถ้า abs_x กับ abs_y ใกล้เคียงกันมากๆ (เดินทแยงเป๊ะๆ) โค้ดจะข้ามไป 
	# ทำให้มันคงอนิเมชั่นทิศทางเดิมไว้ ภาพเลยไม่สั่นครับ!
