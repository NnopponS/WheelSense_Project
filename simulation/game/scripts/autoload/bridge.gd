extends Node

## WheelSense Backend Bridge Autoload
##
## Provides a unified interface for Godot game characters to communicate
## with the WheelSense backend via WebSocket. Uses JavaScriptBridge
## to interface with the wheelsense_bridge.js script in web exports.
##
## In desktop/editor mode, all operations are no-ops (safe to call).

# Signals
signal connected()
signal disconnected()
signal message_received(data: Dictionary)
signal bridge_ready()

# State
var _js_interface = null
var _is_web: bool = false
var _is_ready: bool = false

func _ready():
	_is_web = OS.has_feature("web")
	
	if _is_web:
		# Try to get the JavaScript interface
		if Engine.has_singleton("JavaScriptBridge"):
			var js_bridge = Engine.get_singleton("JavaScriptBridge")
			if js_bridge.has_interface("WheelSense"):
				_js_interface = js_bridge.get_interface("WheelSense")
				print("WheelSense Bridge: JavaScript interface acquired")
				
				# Start polling for connection status
				var timer = Timer.new()
				timer.wait_time = 0.5
				timer.autostart = true
				timer.timeout.connect(_check_ready)
				add_child(timer)
			else:
				push_warning("WheelSense Bridge: JavaScript interface not found")
		else:
			push_warning("WheelSense Bridge: JavaScriptBridge singleton not available")
	else:
		print("WheelSense Bridge: Desktop mode - bridge operations are no-ops")

func _check_ready():
	if _js_interface == null:
		return
		
	var ready = _js_interface.isReady()
	if ready and not _is_ready:
		_is_ready = true
		bridge_ready.emit()
		connected.emit()
		print("WheelSense Bridge: Ready")
	elif not ready and _is_ready:
		_is_ready = false
		disconnected.emit()

## Send an event to the WheelSense backend
## 
## @param event_type: Type of event (e.g., "character_event", "character_enter_room")
## @param data: Dictionary containing event data
func send_event(event_type: String, data: Dictionary = {}) -> void:
	var payload = data.duplicate()
	payload["type"] = event_type
	
	if _is_web and _js_interface != null:
		var json = JSON.stringify(payload)
		_js_interface.send(json)
	else:
		# Desktop mode: log to console for debugging
		print("[WheelSense Bridge] Event (desktop mode): ", payload)

## Send a character event (e.g., fall, heart_attack)
##
## @param character: Character name (e.g., "emika", "somchai")
## @param event: Event name (e.g., "fall", "heart_attack")
func send_character_event(character: String, event: String) -> void:
	send_event("character_event", {
		"character": character,
		"event": event
	})

## Send a room enter event
##
## @param character: Character name
## @param room: Room name (e.g., "Room401")
func send_room_enter(character: String, room: String) -> void:
	send_event("character_enter_room", {
		"character": character,
		"room": room
	})

## Check if the bridge is connected and ready
func is_ready() -> bool:
	if _is_web and _js_interface != null:
		return _js_interface.isReady()
	return false

## Get the current connection status as a string
func get_status() -> String:
	if not _is_web:
		return "desktop (no-op)"
	if _js_interface == null:
		return "no interface"
	if is_ready():
		return "connected"
	return "connecting"

## Legacy compatibility: Send patient data (replaces HTTP endpoint)
##
## @param patient_name: Display name of the patient
## @param mobility: Mobility type
## @param status: Status message
## @param location: Current room/location
func send_patient_data(patient_name: String, mobility: String, status: String, location: String) -> void:
	send_event("patient_status", {
		"patient_name": patient_name,
		"mobility": mobility,
		"status": status,
		"location": location
	})


# ---------------------------------------------------------------------------
# NEW: Room Appliance (Lamp/AC) Control Signals
# ---------------------------------------------------------------------------

## Emitted when backend sends room_device_state (lamp/AC state update)
signal room_device_state_received(room_name: String, device_kind: String, state: String)

## Emitted when backend sends room_device_command (lamp/AC toggle command)
signal room_device_command_received(room_name: String, device_kind: String, command: String)

## Emitted when dispatch_request is received (observer needs to accept/decline)
signal dispatch_request_received(alert_id: String, patient_name: String, room_name: String)

## Emitted when dispatch_accepted is received (nurse should go help)
signal dispatch_accepted_received(character_name: String, room_name: String, accepted_by: String)

## Emitted when go_to_room is received (direct movement command)
signal go_to_room_received(character_name: String, room_name: String)


## Handle incoming WebSocket messages from backend
func _on_message_received(data: Dictionary) -> void:
	var msg_type = data.get("type", "")
	match msg_type:
		"room_device_state":
			room_device_state_received.emit(
				data.get("room_name", ""),
				data.get("device_kind", ""),
				data.get("state", "")
			)
		"room_device_command":
			room_device_command_received.emit(
				data.get("room_name", ""),
				data.get("device_kind", ""),
				data.get("command", "")
			)
		"dispatch_request":
			dispatch_request_received.emit(
				data.get("alert_id", ""),
				data.get("patient_name", ""),
				data.get("room_name", "")
			)
		"dispatch_accepted":
			dispatch_accepted_received.emit(
				data.get("character_name", ""),
				data.get("room_name", ""),
				data.get("accepted_by_observer_user_id", "")
			)
		"go_to_room":
			go_to_room_received.emit(
				data.get("character_name", ""),
				data.get("room_name", "")
			)
		_:
			# Unknown message type, emit generic signal
			pass


## Send room device state update to backend
func send_room_device_state(room_name: String, device_kind: String, state: String) -> void:
	send_event("room_device_state", {
		"room_name": room_name,
		"device_kind": device_kind,
		"state": state
	})


## Send dispatch response (accept/decline) to backend
func send_dispatch_response(alert_id: String, accepted: bool, observer_user_id: String) -> void:
	send_event("dispatch_response", {
		"alert_id": alert_id,
		"accepted": accepted,
		"observer_user_id": observer_user_id
	})


## Send distress signal (patient needs help, but don't auto-call doctor)
func send_distress_signal(character: String, room: String, event_type: String) -> void:
	send_event("distress_signal", {
		"character": character,
		"room": room,
		"event_type": event_type
	})
