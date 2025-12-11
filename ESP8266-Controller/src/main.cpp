/*
 * ESP8266 Home Appliance Controller
 * nodemcuBase ver2.0 - Central Controller
 * 
 * ควบคุมอุปกรณ์ไฟฟ้าทั้งบ้าน 4 ห้อง จากบอร์ดเดียว
 * รับคำสั่งจาก Backend ผ่าน WebSocket และ MQTT (Wildcard)
 * 
 * Rooms: bedroom, bathroom, kitchen, livingroom
 * 
 * Note: TsimCam ESP32 ทำหน้าที่ส่ง Video เท่านั้น
 *       ESP8266 นี้ทำหน้าที่ควบคุมอุปกรณ์ไฟฟ้าทั้งหมด
 */

#include <ESP8266WiFi.h>
#include <WebSocketsClient.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ===== WiFi Configuration =====
#ifndef WIFI_SSID
#define WIFI_SSID "KNIGHT"
#endif

#ifndef WIFI_PASSWORD
#define WIFI_PASSWORD "192837abcd"
#endif

// ===== Network Configuration =====
#define USE_STATIC_IP false
const char* STATIC_MQTT_SERVER = "192.168.137.1";
const char* STATIC_WEBSOCKET_SERVER = "192.168.137.1";

const int MQTT_PORT = 1883;
const int WEBSOCKET_PORT = 8765;
const int STATUS_INTERVAL_MS = 5000;

// Device configuration - บอร์ดเดียวควบคุมทุกห้อง
#define DEVICE_ID "APPLIANCE_CENTRAL"

// ===== Room definitions =====
const char* ROOMS[] = {"bedroom", "bathroom", "kitchen", "livingroom"};
const int NUM_ROOMS = 4;

// Room indices for easy access
#define ROOM_BEDROOM    0
#define ROOM_BATHROOM   1
#define ROOM_KITCHEN    2
#define ROOM_LIVINGROOM 3

// ===== GPIO Pin Configuration for nodemcuBase ver2.0 =====
// NodeMCU ESP8266 GPIO mapping:
// D0 = GPIO16, D1 = GPIO5, D2 = GPIO4, D3 = GPIO0
// D4 = GPIO2, D5 = GPIO14, D6 = GPIO12, D7 = GPIO13, D8 = GPIO15
//
// จัด Pin ตามห้อง (ใช้ LED แสดงสถานะแทน - ในงานจริงต่อ MUX หรือ I2C Expander)
// 
// ห้องนอน (bedroom): D1 = light, D2 = aircon (alarm ใช้ software)
// ห้องน้ำ (bathroom): D0 = light
// ห้องครัว (kitchen): D5 = light (alarm ใช้ software)  
// ห้องนั่งเล่น (livingroom): D6 = light, D7 = fan, D8 = tv, (aircon ใช้ร่วมกับ bedroom)

#define PIN_BEDROOM_LIGHT     D1  // GPIO5
#define PIN_BEDROOM_AIRCON    D2  // GPIO4
#define PIN_BATHROOM_LIGHT    D0  // GPIO16
#define PIN_KITCHEN_LIGHT     D5  // GPIO14
#define PIN_LIVINGROOM_LIGHT  D6  // GPIO12
#define PIN_LIVINGROOM_FAN    D7  // GPIO13
#define PIN_LIVINGROOM_TV     D8  // GPIO15

#define LED_STATUS_PIN        D4  // GPIO2 - Built-in LED (Active LOW)

// ตัวแปรสำหรับเก็บ IP ที่ resolve แล้ว
String mqttServerIP;
String websocketServerIP;

// ===== WiFi and MQTT Clients =====
WiFiClient espClient;
PubSubClient mqtt(espClient);
WebSocketsClient webSocket;

// MQTT topics - ใช้ wildcard สำหรับรับทุกห้อง
const char* MQTT_TOPIC_CONTROL_WILDCARD = "WheelSense/+/control";
char MQTT_TOPIC_STATUS[64];
char MQTT_TOPIC_REGISTRATION[64];

// Flags
bool mqttRegistered = false;
bool wsConnected = false;
bool wsWasConnected = false;

unsigned long lastStatusMs = 0;
unsigned long lastReconnectAttempt = 0;

// ===== Appliance states per room =====
struct RoomAppliances {
    const char* roomName;
    bool light = false;
    bool aircon = false;
    bool fan = false;
    bool tv = false;
    bool alarm = false;
    
    // For sliders
    int airconTemp = 25;
    int fanSpeed = 50;
    int tvVolume = 50;
    int lightBrightness = 100;
};

RoomAppliances roomStates[NUM_ROOMS];

// Forward declarations
void sendStatus();
void sendRoomStatus(int roomIndex);
void reconnectWebSocket();
void resolveServerIPs();
void handleWebSocketMessage(String message);
void reconnectMQTT();
void setAppliance(int roomIndex, const char* appliance, bool state);
void setApplianceValue(int roomIndex, const char* appliance, int value);
void mqttCallback(char* topic, byte* payload, unsigned int length);
int getRoomIndex(const char* roomName);
void updateGPIO(int roomIndex, const char* appliance);

// ===== Get room index from name =====
int getRoomIndex(const char* roomName) {
    for (int i = 0; i < NUM_ROOMS; i++) {
        if (strcmp(ROOMS[i], roomName) == 0) {
            return i;
        }
    }
    return -1; // Not found
}

// ===== Setup Appliance Pins =====
void setupAppliances() {
    // Initialize all GPIO pins
    pinMode(PIN_BEDROOM_LIGHT, OUTPUT);
    pinMode(PIN_BEDROOM_AIRCON, OUTPUT);
    pinMode(PIN_BATHROOM_LIGHT, OUTPUT);
    pinMode(PIN_KITCHEN_LIGHT, OUTPUT);
    pinMode(PIN_LIVINGROOM_LIGHT, OUTPUT);
    pinMode(PIN_LIVINGROOM_FAN, OUTPUT);
    pinMode(PIN_LIVINGROOM_TV, OUTPUT);
    pinMode(LED_STATUS_PIN, OUTPUT);
    
    // Turn off all appliances
    digitalWrite(PIN_BEDROOM_LIGHT, LOW);
    digitalWrite(PIN_BEDROOM_AIRCON, LOW);
    digitalWrite(PIN_BATHROOM_LIGHT, LOW);
    digitalWrite(PIN_KITCHEN_LIGHT, LOW);
    digitalWrite(PIN_LIVINGROOM_LIGHT, LOW);
    digitalWrite(PIN_LIVINGROOM_FAN, LOW);
    digitalWrite(PIN_LIVINGROOM_TV, LOW);
    digitalWrite(LED_STATUS_PIN, HIGH); // LED_STATUS is active LOW
    
    // Initialize room states
    for (int i = 0; i < NUM_ROOMS; i++) {
        roomStates[i].roomName = ROOMS[i];
        roomStates[i].light = false;
        roomStates[i].aircon = false;
        roomStates[i].fan = false;
        roomStates[i].tv = false;
        roomStates[i].alarm = false;
    }
    
    Serial.println("[Appliances] All pins initialized for 4 rooms");
    Serial.println("[Appliances] Room GPIO mapping:");
    Serial.println("  - bedroom:    D1=light, D2=aircon");
    Serial.println("  - bathroom:   D0=light");
    Serial.println("  - kitchen:    D5=light");
    Serial.println("  - livingroom: D6=light, D7=fan, D8=tv");
}

// ===== Update GPIO for specific room/appliance =====
void updateGPIO(int roomIndex, const char* appliance) {
    RoomAppliances& room = roomStates[roomIndex];
    
    switch (roomIndex) {
        case ROOM_BEDROOM:
            if (strcmp(appliance, "light") == 0) {
                digitalWrite(PIN_BEDROOM_LIGHT, room.light);
            } else if (strcmp(appliance, "aircon") == 0) {
                digitalWrite(PIN_BEDROOM_AIRCON, room.aircon);
            }
            // alarm = software only (no GPIO)
            break;
            
        case ROOM_BATHROOM:
            if (strcmp(appliance, "light") == 0) {
                digitalWrite(PIN_BATHROOM_LIGHT, room.light);
            }
            break;
            
        case ROOM_KITCHEN:
            if (strcmp(appliance, "light") == 0) {
                digitalWrite(PIN_KITCHEN_LIGHT, room.light);
            }
            // alarm = software only
            break;
            
        case ROOM_LIVINGROOM:
            if (strcmp(appliance, "light") == 0) {
                digitalWrite(PIN_LIVINGROOM_LIGHT, room.light);
            } else if (strcmp(appliance, "fan") == 0) {
                digitalWrite(PIN_LIVINGROOM_FAN, room.fan);
            } else if (strcmp(appliance, "tv") == 0) {
                digitalWrite(PIN_LIVINGROOM_TV, room.tv);
            }
            // aircon shares with bedroom pin (or add MUX)
            break;
    }
    
    // Blink status LED to indicate activity
    digitalWrite(LED_STATUS_PIN, LOW);
    delay(30);
    digitalWrite(LED_STATUS_PIN, HIGH);
}

// ===== Set Appliance State for specific room =====
void setAppliance(int roomIndex, const char* appliance, bool state) {
    if (roomIndex < 0 || roomIndex >= NUM_ROOMS) {
        Serial.printf("[Appliance] Invalid room index: %d\n", roomIndex);
        return;
    }
    
    RoomAppliances& room = roomStates[roomIndex];
    Serial.printf("[Appliance] %s/%s -> %s\n", room.roomName, appliance, state ? "ON" : "OFF");
    
    if (strcmp(appliance, "light") == 0) { 
        room.light = state;
    }
    else if (strcmp(appliance, "aircon") == 0) { 
        room.aircon = state;
    }
    else if (strcmp(appliance, "fan") == 0) { 
        room.fan = state;
    }
    else if (strcmp(appliance, "tv") == 0) { 
        room.tv = state;
    }
    else if (strcmp(appliance, "alarm") == 0) { 
        room.alarm = state;
        // Alarm is software-only (would trigger buzzer or notification)
        if (state) {
            Serial.printf("[ALARM] %s room ALARM TRIGGERED!\n", room.roomName);
        }
    }
    
    // Update physical GPIO
    updateGPIO(roomIndex, appliance);
}

// ===== Set Appliance Value (for sliders) =====
void setApplianceValue(int roomIndex, const char* name, int value) {
    if (roomIndex < 0 || roomIndex >= NUM_ROOMS) {
        Serial.printf("[Appliance] Invalid room index: %d\n", roomIndex);
        return;
    }
    
    RoomAppliances& room = roomStates[roomIndex];
    Serial.printf("[Appliance] %s/%s value -> %d\n", room.roomName, name, value);
    
    if (strcmp(name, "temperature") == 0) {
        room.airconTemp = value;
    }
    else if (strcmp(name, "speed") == 0) {
        room.fanSpeed = value;
    }
    else if (strcmp(name, "volume") == 0) {
        room.tvVolume = value;
    }
    else if (strcmp(name, "brightness") == 0) {
        room.lightBrightness = value;
    }
}

// ===== WebSocket Event Handler =====
void webSocketEvent(WStype_t type, uint8_t *payload, size_t length) {
    switch (type) {
        case WStype_DISCONNECTED:
            wsConnected = false;
            Serial.println("[WebSocket] Disconnected");
            digitalWrite(LED_STATUS_PIN, HIGH); // Turn off status LED
            
            if (wsWasConnected) {
                mqttRegistered = false;
                Serial.println("[MQTT] Will re-register after WebSocket disconnect");
            }
            break;
            
        case WStype_CONNECTED: {
            wsConnected = true;
            wsWasConnected = true;
            Serial.printf("[WebSocket] Connected to %s:%d\n", websocketServerIP.c_str(), WEBSOCKET_PORT);
            digitalWrite(LED_STATUS_PIN, LOW); // Turn on status LED (active LOW)
            
            // Send welcome message - Central controller controls all rooms
            StaticJsonDocument<512> welcomeDoc;
            welcomeDoc["type"] = "connected";
            welcomeDoc["device_type"] = "appliance_controller_central";
            welcomeDoc["device_id"] = DEVICE_ID;
            
            // List all rooms this controller manages
            JsonArray roomsArr = welcomeDoc.createNestedArray("rooms");
            for (int i = 0; i < NUM_ROOMS; i++) {
                roomsArr.add(ROOMS[i]);
            }
            
            String welcomeMsg;
            serializeJson(welcomeDoc, welcomeMsg);
            webSocket.sendTXT(welcomeMsg);
            
            // Send initial status for all rooms
            sendStatus();
            
            // Disconnect MQTT after WebSocket connected
            if (mqtt.connected()) {
                mqtt.disconnect();
                Serial.println("[MQTT] Disconnected - WebSocket is active");
            }
            break;
        }

        case WStype_TEXT: {
            String message = String((char*)payload);
            handleWebSocketMessage(message);
            break;
        }
        
        case WStype_BIN:
            // Binary data - ignore for appliance controller
            break;
            
        case WStype_ERROR:
            Serial.printf("[WebSocket] Error: %s\n", payload);
            break;
            
        default:
            break;
    }
}

// ===== Handle WebSocket Messages =====
void handleWebSocketMessage(String message) {
    StaticJsonDocument<512> doc;
    DeserializationError error = deserializeJson(doc, message);
    
    if (error) {
        Serial.printf("[WebSocket] JSON parse error: %s\n", error.c_str());
        return;
    }
    
    const char* msgType = doc["type"];
    
    if (msgType && strcmp(msgType, "control") == 0) {
        // Control appliance command - extract room from message
        const char* room = doc["room"];
        const char* appliance = doc["appliance"];
        bool hasState = doc.containsKey("state");
        bool hasValue = doc.containsKey("value");
        
        if (room && appliance) {
            int roomIndex = getRoomIndex(room);
            
            if (roomIndex >= 0) {
                if (hasState) {
                    bool state = doc["state"] | false;
                    setAppliance(roomIndex, appliance, state);
                }
                
                if (hasValue) {
                    int value = doc["value"] | 0;
                    setApplianceValue(roomIndex, appliance, value);
                }
                
                Serial.printf("[WebSocket] Control received: %s/%s\n", room, appliance);
                
                // Send confirmation back
                StaticJsonDocument<256> response;
                response["type"] = "control_ack";
                response["device_id"] = DEVICE_ID;
                response["room"] = room;
                response["appliance"] = appliance;
                if (hasState) response["state"] = doc["state"];
                response["status"] = "ok";
                
                String responseMsg;
                serializeJson(response, responseMsg);
                webSocket.sendTXT(responseMsg);
                
                // Send room status update
                sendRoomStatus(roomIndex);
            } else {
                Serial.printf("[WebSocket] Unknown room: %s\n", room);
            }
        } else {
            Serial.println("[WebSocket] Missing room or appliance in control message");
        }
    } else if (msgType && strcmp(msgType, "ping") == 0) {
        // Ping/Pong for keepalive
        StaticJsonDocument<64> pong;
        pong["type"] = "pong";
        String pongMsg;
        serializeJson(pong, pongMsg);
        webSocket.sendTXT(pongMsg);
    } else if (msgType && strcmp(msgType, "get_status") == 0) {
        // Status request
        sendStatus();
    }
}

// ===== MQTT Callback =====
// Topic format: WheelSense/<room>/control
void mqttCallback(char* topic, byte* payload, unsigned int length) {
    String message;
    for (unsigned int i = 0; i < length; i++) {
        message += (char)payload[i];
    }
    
    Serial.printf("[MQTT] Message on %s: %s\n", topic, message.c_str());
    
    // Extract room from topic: WheelSense/<room>/control
    String topicStr = String(topic);
    int firstSlash = topicStr.indexOf('/');
    int secondSlash = topicStr.indexOf('/', firstSlash + 1);
    
    if (firstSlash < 0 || secondSlash < 0) {
        Serial.println("[MQTT] Invalid topic format");
        return;
    }
    
    String roomStr = topicStr.substring(firstSlash + 1, secondSlash);
    int roomIndex = getRoomIndex(roomStr.c_str());
    
    if (roomIndex < 0) {
        Serial.printf("[MQTT] Unknown room in topic: %s\n", roomStr.c_str());
        return;
    }
    
    // Parse JSON control command
    StaticJsonDocument<512> doc;
    DeserializationError error = deserializeJson(doc, message);
    
    if (error) {
        Serial.printf("[MQTT] JSON parse error: %s\n", error.c_str());
        return;
    }
    
    const char* appliance = doc["appliance"];
    if (appliance) {
        if (doc.containsKey("state")) {
            bool state = doc["state"] | false;
            setAppliance(roomIndex, appliance, state);
        }
        if (doc.containsKey("value")) {
            int value = doc["value"] | 0;
            setApplianceValue(roomIndex, appliance, value);
        }
        
        Serial.printf("[MQTT] Control: %s/%s\n", roomStr.c_str(), appliance);
        
        // Send room status update
        sendRoomStatus(roomIndex);
    }
}

// ===== Resolve Server IPs =====
void resolveServerIPs() {
    if (USE_STATIC_IP) {
        mqttServerIP = String(STATIC_MQTT_SERVER);
        websocketServerIP = String(STATIC_WEBSOCKET_SERVER);
        Serial.printf("[Network] Using Static IP - MQTT: %s, WebSocket: %s\n", 
                      mqttServerIP.c_str(), websocketServerIP.c_str());
    } else {
        IPAddress gateway = WiFi.gatewayIP();
        mqttServerIP = gateway.toString();
        websocketServerIP = gateway.toString();
        Serial.printf("[Network] Using Gateway IP - MQTT: %s, WebSocket: %s\n", 
                      mqttServerIP.c_str(), websocketServerIP.c_str());
    }
}

// ===== Reconnect WebSocket =====
void reconnectWebSocket() {
    if (wsConnected) return;
    
    unsigned long now = millis();
    if (now - lastReconnectAttempt < 5000) return;
    lastReconnectAttempt = now;
    
    if (websocketServerIP.length() == 0) {
        resolveServerIPs();
    }
    
    Serial.printf("[WebSocket] Connecting to %s:%d...\n", websocketServerIP.c_str(), WEBSOCKET_PORT);
    webSocket.begin(websocketServerIP.c_str(), WEBSOCKET_PORT, "/");
    webSocket.onEvent(webSocketEvent);
}

// ===== MQTT IP Registration =====
void registerIPViaMQTT() {
    if (mqttRegistered || !mqtt.connected()) return;
    
    StaticJsonDocument<768> doc;
    doc["type"] = "device_registration";
    doc["device_type"] = "appliance_controller_central";
    doc["device_id"] = DEVICE_ID;
    
    // Register all rooms this controller manages
    JsonArray roomsArr = doc.createNestedArray("rooms");
    for (int i = 0; i < NUM_ROOMS; i++) {
        roomsArr.add(ROOMS[i]);
    }
    
    doc["ip_address"] = WiFi.localIP().toString();
    doc["websocket_port"] = WEBSOCKET_PORT;
    doc["timestamp"] = millis() / 1000;
    
    String regMsg;
    serializeJson(doc, regMsg);
    
    if (mqtt.publish(MQTT_TOPIC_REGISTRATION, regMsg.c_str())) {
        mqttRegistered = true;
        Serial.printf("[MQTT] Central controller registered: %s (device: %s, rooms: 4)\n", 
                      WiFi.localIP().toString().c_str(), DEVICE_ID);
    } else {
        Serial.println("[MQTT] Failed to publish IP registration");
    }
}

// ===== Reconnect MQTT =====
void reconnectMQTT() {
    if (wsConnected) return;
    if (mqttRegistered && wsWasConnected) return;
    
    if (mqtt.connected()) {
        if (!mqttRegistered) {
            registerIPViaMQTT();
        }
        return;
    }
    
    if (mqttServerIP.length() == 0) {
        resolveServerIPs();
    }
    
    char id[32];
    snprintf(id, sizeof(id), "%s_%04lX", DEVICE_ID, (unsigned long)random(0x10000));
    
    if (mqtt.connect(id)) {
        Serial.printf("[MQTT] Connected to %s:%d\n", mqttServerIP.c_str(), MQTT_PORT);
        
        // Subscribe to wildcard control topic for ALL rooms
        mqtt.subscribe(MQTT_TOPIC_CONTROL_WILDCARD);
        Serial.printf("[MQTT] Subscribed to: %s (all rooms)\n", MQTT_TOPIC_CONTROL_WILDCARD);
        
        // Register IP
        registerIPViaMQTT();
    } else {
        Serial.printf("[MQTT] Failed to connect to %s:%d\n", mqttServerIP.c_str(), MQTT_PORT);
    }
}

// ===== Send Status for a single room =====
void sendRoomStatus(int roomIndex) {
    if (roomIndex < 0 || roomIndex >= NUM_ROOMS) return;
    
    RoomAppliances& room = roomStates[roomIndex];
    
    StaticJsonDocument<512> doc;
    doc["type"] = "room_status";
    doc["device_type"] = "appliance_controller_central";
    doc["device_id"] = DEVICE_ID;
    doc["room"] = room.roomName;
    doc["ip_address"] = WiFi.localIP().toString();
    
    // Appliance states for this room
    JsonObject appliancesObj = doc.createNestedObject("appliances");
    appliancesObj["light"] = room.light;
    appliancesObj["aircon"] = room.aircon;
    appliancesObj["fan"] = room.fan;
    appliancesObj["tv"] = room.tv;
    appliancesObj["alarm"] = room.alarm;
    
    // Appliance values
    JsonObject valuesObj = doc.createNestedObject("values");
    valuesObj["brightness"] = room.lightBrightness;
    valuesObj["temperature"] = room.airconTemp;
    valuesObj["speed"] = room.fanSpeed;
    valuesObj["volume"] = room.tvVolume;
    
    String statusMsg;
    serializeJson(doc, statusMsg);
    
    // Send via WebSocket
    if (wsConnected) {
        webSocket.sendTXT(statusMsg);
    }
    
    // Send via MQTT to room-specific topic
    if (mqtt.connected()) {
        char roomTopic[64];
        snprintf(roomTopic, sizeof(roomTopic), "WheelSense/%s/status", room.roomName);
        mqtt.publish(roomTopic, statusMsg.c_str());
    }
}

// ===== Send Status for ALL rooms via WebSocket and MQTT =====
void sendStatus() {
    StaticJsonDocument<2048> doc;
    doc["type"] = "central_status";
    doc["device_type"] = "appliance_controller_central";
    doc["device_id"] = DEVICE_ID;
    doc["ip_address"] = WiFi.localIP().toString();
    doc["rssi"] = WiFi.RSSI();
    doc["heap"] = ESP.getFreeHeap();
    doc["ws_connected"] = wsConnected;
    doc["uptime_seconds"] = millis() / 1000;
    doc["num_rooms"] = NUM_ROOMS;
    
    // Create rooms array with all room states
    JsonArray roomsArr = doc.createNestedArray("rooms");
    
    for (int i = 0; i < NUM_ROOMS; i++) {
        RoomAppliances& room = roomStates[i];
        JsonObject roomObj = roomsArr.createNestedObject();
        roomObj["name"] = room.roomName;
        
        JsonObject appliancesObj = roomObj.createNestedObject("appliances");
        appliancesObj["light"] = room.light;
        appliancesObj["aircon"] = room.aircon;
        appliancesObj["fan"] = room.fan;
        appliancesObj["tv"] = room.tv;
        appliancesObj["alarm"] = room.alarm;
        
        JsonObject valuesObj = roomObj.createNestedObject("values");
        valuesObj["brightness"] = room.lightBrightness;
        valuesObj["temperature"] = room.airconTemp;
        valuesObj["speed"] = room.fanSpeed;
        valuesObj["volume"] = room.tvVolume;
    }
    
    String statusMsg;
    serializeJson(doc, statusMsg);
    
    // Send via WebSocket
    if (wsConnected) {
        webSocket.sendTXT(statusMsg);
    }
    
    // Send via MQTT to central topic
    if (mqtt.connected()) {
        mqtt.publish("WheelSense/central/status", statusMsg.c_str());
    }
}

// ===== Setup =====
void setup() {
    Serial.begin(115200);
    delay(500);
    
    Serial.println("\n========================================");
    Serial.println("  WheelSense Appliance Controller");
    Serial.println("  ESP8266 nodemcuBase ver2.0 CENTRAL");
    Serial.println("========================================");
    Serial.printf("  Device: %s\n", DEVICE_ID);
    Serial.printf("  Controlling %d rooms:\n", NUM_ROOMS);
    for (int i = 0; i < NUM_ROOMS; i++) {
        Serial.printf("    - %s\n", ROOMS[i]);
    }
    Serial.println("========================================\n");
    
    setupAppliances();
    
    // Connect to WiFi
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    Serial.printf("[WiFi] Connecting to %s", WIFI_SSID);
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
        // Blink status LED while connecting
        digitalWrite(LED_STATUS_PIN, !digitalRead(LED_STATUS_PIN));
    }
    Serial.printf("\n[WiFi] IP: %s, Gateway: %s, RSSI: %d dBm\n", 
                  WiFi.localIP().toString().c_str(), 
                  WiFi.gatewayIP().toString().c_str(),
                  WiFi.RSSI());
    
    // Resolve server IPs
    resolveServerIPs();
    
    // Setup MQTT topics - use central topics
    snprintf(MQTT_TOPIC_STATUS, 64, "WheelSense/central/status");
    snprintf(MQTT_TOPIC_REGISTRATION, 64, "WheelSense/central/registration");
    
    // Setup MQTT
    mqtt.setServer(mqttServerIP.c_str(), MQTT_PORT);
    mqtt.setCallback(mqttCallback);
    
    // Initial MQTT connection
    reconnectMQTT();
    
    // Initial WebSocket connection
    reconnectWebSocket();
    
    Serial.println("[System] READY - Central controller active");
    Serial.printf("[System] MQTT wildcard: %s\n", MQTT_TOPIC_CONTROL_WILDCARD);
    Serial.println("[System] WebSocket primary, MQTT backup\n");
}

// ===== Main Loop =====
void loop() {
    unsigned long now = millis();
    
    // Handle WebSocket
    webSocket.loop();
    
    // Handle MQTT when WebSocket is not connected
    if (!wsConnected) {
        static unsigned long lastMQTTTry = 0;
        if (now - lastMQTTTry > 5000) {
            lastMQTTTry = now;
            reconnectMQTT();
            reconnectWebSocket();
        }
        
        if (mqtt.connected()) {
            mqtt.loop();
        }
    } else {
        // Disconnect MQTT if WebSocket is connected
        if (mqtt.connected() && mqttRegistered) {
            mqtt.disconnect();
            Serial.println("[MQTT] Disconnected - WebSocket is active");
        }
    }
    
    // Send status periodically
    if (now - lastStatusMs > STATUS_INTERVAL_MS) {
        lastStatusMs = now;
        
        if (wsConnected) {
            sendStatus();
        }
        
        Serial.printf("[Stats] WiFi: %d dBm, Heap: %d, WS: %s, MQTT: %s\n", 
                      WiFi.RSSI(), ESP.getFreeHeap(),
                      wsConnected ? "YES" : "NO",
                      mqtt.connected() ? "YES" : "NO");
        
        // Print appliance states for all rooms
        Serial.println("[Appliances] Room Status:");
        for (int i = 0; i < NUM_ROOMS; i++) {
            RoomAppliances& room = roomStates[i];
            Serial.printf("  %s: L=%s A=%s F=%s T=%s\n",
                          room.roomName,
                          room.light ? "ON" : "off",
                          room.aircon ? "ON" : "off",
                          room.fan ? "ON" : "off",
                          room.tv ? "ON" : "off");
        }
    }
    
    delay(10);
}
