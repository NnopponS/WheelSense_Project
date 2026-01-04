/*
 * ESP32-S2 Home Appliance Controller
 * CucumberRS-Controller - Central Controller
 *
 * ควบคุมอุปกรณ์ไฟฟ้าทั้งบ้าน 4 ห้อง จากบอร์ดเดียว
 * รับคำสั่งจาก Backend ผ่าน MQTT (Wildcard) เท่านั้น
 *
 * Rooms: bedroom, bathroom, kitchen, livingroom
 *
 * Note: TsimCam ESP32 ทำหน้าที่ส่ง Video เท่านั้น
 *       ESP32-S2 นี้ทำหน้าที่ควบคุมอุปกรณ์ไฟฟ้าทั้งหมด
 */
 
#include <WiFi.h>
#include <WiFiUdp.h>
#include <WiFiManager.h>
#include <WebServer.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <driver/gpio.h>
  
 // ===== WiFi Manager Configuration =====
 #ifndef WIFI_AP_NAME
 #define WIFI_AP_NAME "WheelSense-Setup"
 #endif
  
 #ifndef WIFI_AP_PASSWORD
 #define WIFI_AP_PASSWORD "wheelsense123"
 #endif
  
// ===== Network Configuration =====
#define USE_STATIC_IP false
// const char* STATIC_MQTT_SERVER = "192.168.1.100";
const int UDP_DISCOVERY_PORT = 5555;
  
const int MQTT_PORT = 1883;
const int STATUS_INTERVAL_MS = 5000;
  
 // ===== SSD1306 Display Configuration =====
 #define DISPLAY_WIDTH 128
 #define DISPLAY_HEIGHT 64
  
 #ifndef OLED_I2C_ADDRESS
 #define OLED_I2C_ADDRESS 0x3C
 #endif
  
 #ifndef OLED_SDA_PIN
 #define OLED_SDA_PIN 11   // GPIO11 - I2C SDA for OLED (ESP32-S2-Saola-1)
 #endif
  
 #ifndef OLED_SCL_PIN
 #define OLED_SCL_PIN 12   // GPIO12 - I2C SCL for OLED (ESP32-S2-Saola-1)
 #endif
  
 #ifndef OLED_RESET_PIN
 #define OLED_RESET_PIN -1
 #endif
  
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
  
 // ===== GPIO Pin Configuration for ESP32-S2-Saola-1 =====
 // ESP32-S2 GPIO mapping (Updated 2024-12-27):
 //
 // OLED Display: GPIO11 = SDA, GPIO12 = SCL
 // ห้องครัว (kitchen): GPIO5 = light, GPIO7 = alarm
 // ห้องนั่งเล่น (livingroom): GPIO3 = AC, GPIO1 = TV, GPIO21 = light, GPIO20 = fan
 // ห้องนอน (bedroom): GPIO18 = TV, GPIO26 = light, GPIO33 = AC, GPIO37 = alarm
 // ห้องน้ำ (bathroom): GPIO36 = light
  
 // Kitchen: Alarm GPIO7, Light GPIO5
 #define PIN_KITCHEN_LIGHT     5   // GPIO5
 #define PIN_KITCHEN_ALARM     7   // GPIO7
 
 // Living Room: AC GPIO3, TV GPIO1, Light GPIO21, FAN GPIO20
 #define PIN_LIVINGROOM_AC     4   // GPIO4 - Safe (was GPIO3 - USB D+)
 #define PIN_LIVINGROOM_TV     6   // GPIO6 - Safe (was GPIO1 - USB D-)
 #define PIN_LIVINGROOM_LIGHT 21   // GPIO21 (changed from 46 - input only)
 #define PIN_LIVINGROOM_FAN    8   // GPIO8 - Safe (was GPIO20)
 
 // Bedroom: TV GPIO18, Light GPIO26, AC GPIO33, Alarm GPIO37
 #define PIN_BEDROOM_TV       18   // GPIO18
 #define PIN_BEDROOM_LIGHT    17   // GPIO17 - Safe (was GPIO26 - SPI flash)
 #define PIN_BEDROOM_AIRCON   16   // GPIO16 - Safe (was GPIO33 - PSRAM)
 #define PIN_BEDROOM_ALARM    15   // GPIO15 - Safe (was GPIO37 - may conflict)
 
 // Bathroom: Light GPIO36
 #define PIN_BATHROOM_LIGHT   14   // GPIO14 - Safe (was GPIO36 - INPUT ONLY!)
  
 // ===== Display runtime state =====
 Adafruit_SSD1306 statusDisplay(DISPLAY_WIDTH, DISPLAY_HEIGHT, &Wire, OLED_RESET_PIN);
 bool statusDisplayReady = false;
 bool statusDisplayDirty = true;
 unsigned long lastDisplayRender = 0;
 const unsigned long DISPLAY_REFRESH_MS = 500;
 const uint8_t DISPLAY_LOG_LINES = 2;  // Reduced to fit screen
 const uint8_t DISPLAY_LOG_MAX_CHARS = 20;
 String displayLogBuffer[DISPLAY_LOG_LINES];
  
// ตัวแปรสำหรับเก็บ IP ที่ resolve แล้ว
String mqttServerIP;
  
// ===== WiFi and MQTT Clients =====
// ===== WiFi and MQTT Clients =====
WiFiClient espClient;
PubSubClient mqtt(espClient);
WiFiUDP udp;

// ===== WiFi Manager and Web Server =====
WiFiManager wifiManager;
WebServer webServer(80);
bool wifiManagerConfigMode = false;
  
 // MQTT topics - ใช้ wildcard สำหรับรับทุกห้อง
 const char* MQTT_TOPIC_CONTROL_WILDCARD = "WheelSense/+/control";
 const char* MQTT_TOPIC_STATE_SYNC_WILDCARD = "WheelSense/+/state_sync";  // For receiving state sync from backend
 const char* MQTT_TOPIC_STATE_SYNC_REQUEST = "WheelSense/central/state_sync_request";  // For requesting state sync
 char MQTT_TOPIC_STATUS[64];
 char MQTT_TOPIC_REGISTRATION[64];
  
// Flags
bool mqttRegistered = false;
bool mqttDisplayConnected = false;
  
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
void resolveServerIPs();
void reconnectMQTT();
void requestInitialState();  // Request current state from backend (Dashboard is master)
 void setAppliance(int roomIndex, const char* appliance, bool state);
 void setApplianceValue(int roomIndex, const char* appliance, int value);
 void mqttCallback(char* topic, byte* payload, unsigned int length);
 int getRoomIndex(const char* roomName);
 void updateGPIO(int roomIndex, const char* appliance);
 void initDisplay();
 void refreshDisplay(bool force = false);
 void pushDisplayLog(const String& line);
 void markDisplayDirty();
 void drawStatusIndicator(int16_t x, int16_t y, const char* label, bool isOn);
  
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
     // Kitchen
     pinMode(PIN_KITCHEN_LIGHT, OUTPUT);
     pinMode(PIN_KITCHEN_ALARM, OUTPUT);
     
     // Living Room
     pinMode(PIN_LIVINGROOM_AC, OUTPUT);
     pinMode(PIN_LIVINGROOM_TV, OUTPUT);
     pinMode(PIN_LIVINGROOM_LIGHT, OUTPUT);
     pinMode(PIN_LIVINGROOM_FAN, OUTPUT);
     
     // Bedroom
     pinMode(PIN_BEDROOM_TV, OUTPUT);
     pinMode(PIN_BEDROOM_LIGHT, OUTPUT);
     pinMode(PIN_BEDROOM_AIRCON, OUTPUT);
     pinMode(PIN_BEDROOM_ALARM, OUTPUT);
     
     // Bathroom
     pinMode(PIN_BATHROOM_LIGHT, OUTPUT);
    
     // Turn off all appliances
     // Kitchen
     digitalWrite(PIN_KITCHEN_LIGHT, LOW);
     digitalWrite(PIN_KITCHEN_ALARM, LOW);
     
     // Living Room
     digitalWrite(PIN_LIVINGROOM_AC, LOW);
     digitalWrite(PIN_LIVINGROOM_TV, LOW);
     digitalWrite(PIN_LIVINGROOM_LIGHT, LOW);
     digitalWrite(PIN_LIVINGROOM_FAN, LOW);
     
     // Bedroom
     digitalWrite(PIN_BEDROOM_TV, LOW);
     digitalWrite(PIN_BEDROOM_LIGHT, LOW);
     digitalWrite(PIN_BEDROOM_AIRCON, LOW);
     digitalWrite(PIN_BEDROOM_ALARM, LOW);
     
     // Bathroom
     digitalWrite(PIN_BATHROOM_LIGHT, LOW);
     
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
     Serial.println("[Appliances] Room GPIO mapping (Updated):");
     Serial.println("  - kitchen:    GPIO5=light, GPIO7=alarm");
     Serial.println("  - livingroom: GPIO3=AC, GPIO1=TV, GPIO21=light, GPIO20=fan");
     Serial.println("  - bedroom:    GPIO18=TV, GPIO26=light, GPIO33=AC, GPIO37=alarm");
     Serial.println("  - bathroom:   GPIO36=light");
     Serial.println("  - OLED:       GPIO11=SDA, GPIO12=SCL");
 }
  
 // ===== Display helpers =====
 void markDisplayDirty() {
     statusDisplayDirty = true;
 }
  
 void pushDisplayLog(const String& line) {
     if (line.length() == 0) return;
    
     String sanitized = line;
     sanitized.replace('\r', ' ');
     sanitized.replace('\n', ' ');
    
     if (sanitized.length() > DISPLAY_LOG_MAX_CHARS) {
         sanitized = sanitized.substring(0, DISPLAY_LOG_MAX_CHARS - 3);
         sanitized += "...";
     }
    
     for (int i = DISPLAY_LOG_LINES - 1; i > 0; --i) {
         displayLogBuffer[i] = displayLogBuffer[i - 1];
     }
     displayLogBuffer[0] = sanitized;
     markDisplayDirty();
 }
  
 void drawStatusIndicator(int16_t x, int16_t y, const char* label, bool isOn) {
     if (!statusDisplayReady) return;
    
     statusDisplay.drawCircle(x, y, 3, SSD1306_WHITE);
     if (isOn) {
         statusDisplay.fillCircle(x, y, 2, SSD1306_WHITE);
     }
    
     statusDisplay.setCursor(x + 8, y - 3);
     statusDisplay.print(label);
     statusDisplay.print(isOn ? ":OK" : ":NO");
 }
  
 void refreshDisplay(bool force) {
     if (!statusDisplayReady) return;
    
     unsigned long now = millis();
     if (!force && !statusDisplayDirty && (now - lastDisplayRender) < DISPLAY_REFRESH_MS) {
         return;
     }
    
     lastDisplayRender = now;
     statusDisplayDirty = false;
    
     statusDisplay.clearDisplay();
     statusDisplay.setTextColor(SSD1306_WHITE);
     statusDisplay.setTextSize(1);
    
     // Compact header box (reduced from 32 to 24 pixels)
     statusDisplay.drawRoundRect(0, 0, DISPLAY_WIDTH, 24, 2, SSD1306_WHITE);
    
     // Line 1: Title
     statusDisplay.setCursor(4, 2);
     statusDisplay.print("WheelSense");
    
     // Line 2: Device ID (truncated if too long)
     statusDisplay.setCursor(4, 10);
     String deviceId = String(DEVICE_ID);
     if (deviceId.length() > 12) {
         deviceId = deviceId.substring(0, 12);
     }
     statusDisplay.print(deviceId);
    
     // Line 3: IP and RSSI (compact)
     statusDisplay.setCursor(4, 18);
     if (WiFi.status() == WL_CONNECTED) {
         String ip = WiFi.localIP().toString();
         // Truncate IP if needed: show last 2 octets only if too long
         if (ip.length() > 12) {
             int lastDot = ip.lastIndexOf('.');
             if (lastDot > 0) {
                 ip = "..." + ip.substring(lastDot + 1);
             }
         }
         statusDisplay.print(ip);
         statusDisplay.print(" ");
         statusDisplay.print(WiFi.RSSI());
         statusDisplay.print("dB");
     } else {
         statusDisplay.print("WiFi...");
     }
    
     // Status indicators (compact, moved to right)
     drawStatusIndicator(95, 6, "MQ", mqtt.connected());
    
     // Separator line
     statusDisplay.drawLine(0, 26, DISPLAY_WIDTH, 26, SSD1306_WHITE);
    
     // Log section header (compact)
     statusDisplay.setCursor(0, 28);
     statusDisplay.print("Log:");
    
     // Log lines (2 lines, 8 pixels spacing)
     for (uint8_t i = 0; i < DISPLAY_LOG_LINES; i++) {
         statusDisplay.setCursor(0, 36 + (i * 8));
         String logLine = displayLogBuffer[i];
         // Truncate if too long
         if (logLine.length() > DISPLAY_LOG_MAX_CHARS) {
             logLine = logLine.substring(0, DISPLAY_LOG_MAX_CHARS - 3) + "...";
         }
         statusDisplay.print(logLine);
     }
    
     statusDisplay.display();
 }
  
 void initDisplay() {
     Serial.println("[Display] Initializing I2C...");
    
     // Initialize I2C with custom pins for ESP32-S2
     Wire.begin(OLED_SDA_PIN, OLED_SCL_PIN);
     Wire.setClock(100000);  // Set I2C clock to 100kHz (standard speed)
     delay(100);  // Give I2C time to stabilize
     Serial.printf("[Display] I2C initialized on SDA=GPIO%d, SCL=GPIO%d\n",
                   OLED_SDA_PIN, OLED_SCL_PIN);
    
     Serial.println("[Display] Initializing OLED...");
     bool oledFound = false;
     uint8_t oledAddress = 0x3C;
    
     // Try 0x3C first (most common)
     Serial.println("[Display] Trying address 0x3C...");
     if (statusDisplay.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
         Serial.println("[Display] ✅ OLED found at address 0x3C");
         oledFound = true;
         oledAddress = 0x3C;
     } else {
         // Try 0x3D (alternative address)
         Serial.println("[Display] ❌ 0x3C failed, trying 0x3D...");
         delay(100);
         if (statusDisplay.begin(SSD1306_SWITCHCAPVCC, 0x3D)) {
             Serial.println("[Display] ✅ OLED found at address 0x3D");
             oledFound = true;
             oledAddress = 0x3D;
         }
     }
    
     if (!oledFound) {
         Serial.println("\n[Display] ❌ SSD1306 allocation failed!");
         Serial.println("\n[Display] Troubleshooting:");
         Serial.println("  1. Check I2C wiring:");
         Serial.printf("     SDA -> GPIO%d\n", OLED_SDA_PIN);
         Serial.printf("     SCL -> GPIO%d\n", OLED_SCL_PIN);
         Serial.println("  2. Verify power:");
         Serial.println("     VCC -> 3.3V (NOT 5V!)");
         Serial.println("     GND -> GND");
         Serial.println("  3. Check I2C address (tried 0x3C and 0x3D)");
         Serial.println("  4. Try disconnecting and reconnecting power");
         Serial.println("  5. Check if OLED module is working");
         Serial.flush();
         statusDisplayReady = false;
         return;
     }
    
     Serial.println("[Display] ✅ OLED initialized successfully");
     Serial.flush();
    
     statusDisplayReady = true;
     statusDisplay.clearDisplay();
     statusDisplay.setTextColor(SSD1306_WHITE);
     statusDisplay.setTextSize(1);
     statusDisplay.setCursor(0, 0);
     statusDisplay.println("WheelSense");
     statusDisplay.println("Display ready");
     statusDisplay.display();
    
     pushDisplayLog("Display ready");
     markDisplayDirty();
     refreshDisplay(true);
 }
  
 // ===== Update GPIO for specific room/appliance =====
 void updateGPIO(int roomIndex, const char* appliance) {
     RoomAppliances& room = roomStates[roomIndex];
     
     switch (roomIndex) {
         case ROOM_BEDROOM:
             // Bedroom: TV GPIO18, Light GPIO26, AC GPIO34, Alarm GPIO38
             if (strcmp(appliance, "light") == 0) {
                 digitalWrite(PIN_BEDROOM_LIGHT, room.light ? HIGH : LOW);
                 Serial.printf("[GPIO] Bedroom light -> GPIO%d = %s\n", PIN_BEDROOM_LIGHT, room.light ? "HIGH" : "LOW");
             } else if (strcmp(appliance, "AC") == 0) {
                 digitalWrite(PIN_BEDROOM_AIRCON, room.aircon ? HIGH : LOW);
                 Serial.printf("[GPIO] Bedroom AC -> GPIO%d = %s\n", PIN_BEDROOM_AIRCON, room.aircon ? "HIGH" : "LOW");
             } else if (strcmp(appliance, "alarm") == 0) {
                 digitalWrite(PIN_BEDROOM_ALARM, room.alarm ? HIGH : LOW);
                 Serial.printf("[GPIO] Bedroom alarm -> GPIO%d = %s\n", PIN_BEDROOM_ALARM, room.alarm ? "HIGH" : "LOW");
             } else if (strcmp(appliance, "tv") == 0) {
                 digitalWrite(PIN_BEDROOM_TV, room.tv ? HIGH : LOW);
                 Serial.printf("[GPIO] Bedroom TV -> GPIO%d = %s\n", PIN_BEDROOM_TV, room.tv ? "HIGH" : "LOW");
             }
             break;
             
         case ROOM_BATHROOM:
             // Bathroom: Light GPIO40
             if (strcmp(appliance, "light") == 0) {
                 digitalWrite(PIN_BATHROOM_LIGHT, room.light ? HIGH : LOW);
                 Serial.printf("[GPIO] Bathroom light -> GPIO%d = %s\n", PIN_BATHROOM_LIGHT, room.light ? "HIGH" : "LOW");
             }
             break;
             
         case ROOM_KITCHEN:
             // Kitchen: Light GPIO5, Alarm GPIO7
             if (strcmp(appliance, "light") == 0) {
                 digitalWrite(PIN_KITCHEN_LIGHT, room.light ? HIGH : LOW);
                 Serial.printf("[GPIO] Kitchen light -> GPIO%d = %s\n", PIN_KITCHEN_LIGHT, room.light ? "HIGH" : "LOW");
             } else if (strcmp(appliance, "alarm") == 0) {
                 digitalWrite(PIN_KITCHEN_ALARM, room.alarm ? HIGH : LOW);
                 Serial.printf("[GPIO] Kitchen alarm -> GPIO%d = %s\n", PIN_KITCHEN_ALARM, room.alarm ? "HIGH" : "LOW");
             }
             break;
             
         case ROOM_LIVINGROOM:
             // Living Room: AC GPIO3, TV GPIO1, Light GPIO46, FAN GPIO20
             if (strcmp(appliance, "light") == 0) {
                 digitalWrite(PIN_LIVINGROOM_LIGHT, room.light ? HIGH : LOW);
                 Serial.printf("[GPIO] Living room light -> GPIO%d = %s\n", PIN_LIVINGROOM_LIGHT, room.light ? "HIGH" : "LOW");
             } else if (strcmp(appliance, "fan") == 0) {
                 digitalWrite(PIN_LIVINGROOM_FAN, room.fan ? HIGH : LOW);
                 Serial.printf("[GPIO] Living room fan -> GPIO%d = %s\n", PIN_LIVINGROOM_FAN, room.fan ? "HIGH" : "LOW");
             } else if (strcmp(appliance, "tv") == 0) {
                 digitalWrite(PIN_LIVINGROOM_TV, room.tv ? HIGH : LOW);
                 Serial.printf("[GPIO] Living room TV -> GPIO%d = %s\n", PIN_LIVINGROOM_TV, room.tv ? "HIGH" : "LOW");
             } else if (strcmp(appliance, "AC") == 0) {
                 digitalWrite(PIN_LIVINGROOM_AC, room.aircon ? HIGH : LOW);
                 Serial.printf("[GPIO] Living room AC -> GPIO%d = %s\n", PIN_LIVINGROOM_AC, room.aircon ? "HIGH" : "LOW");
             }
             break;
     }
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
     else if (strcmp(appliance, "AC") == 0) {
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
     
     // Check for state_sync topic (WheelSense/<room>/state_sync)
     // This is received from backend when we request initial state or when dashboard updates state
     if (topicStr.endsWith("/state_sync")) {
         Serial.printf("[MQTT] State sync received for room: %s\n", roomStr.c_str());
         int roomIndex = getRoomIndex(roomStr.c_str());
         if (roomIndex < 0) {
             Serial.printf("[MQTT] Unknown room in state_sync: %s\n", roomStr.c_str());
             return;
         }
         
         // Parse JSON state sync
         StaticJsonDocument<512> doc;
         DeserializationError error = deserializeJson(doc, message);
         if (error) {
             Serial.printf("[MQTT] State sync JSON parse error: %s\n", error.c_str());
             return;
         }
         
         // Update local state from backend (Dashboard is master)
         JsonObject appliances = doc["appliances"];
         if (!appliances.isNull()) {
             for (JsonPair kv : appliances) {
                 const char* device = kv.key().c_str();
                 bool state = kv.value().as<bool>();
                 setAppliance(roomIndex, device, state);
                 Serial.printf("[MQTT] Synced from backend: %s/%s = %s\n", 
                              roomStr.c_str(), device, state ? "ON" : "OFF");
             }
             pushDisplayLog("State synced");
             markDisplayDirty();
         }
         return;
     }
     
     // Handle control topic (WheelSense/<room>/control)
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
        bool hasState = doc.containsKey("state");
        bool hasValue = doc.containsKey("value");
        bool state = false;
        int value = 0;
        
        if (hasState) {
            state = doc["state"] | false;
            setAppliance(roomIndex, appliance, state);
        }
        if (hasValue) {
            value = doc["value"] | 0;
            // Map appliance type to value name for setApplianceValue
            const char* valueName = appliance; // Default to appliance name
            if (strcmp(appliance, "light") == 0) {
                valueName = "brightness";
            } else if (strcmp(appliance, "AC") == 0) {
                valueName = "temperature";
            } else if (strcmp(appliance, "tv") == 0) {
                valueName = "volume";
            } else if (strcmp(appliance, "fan") == 0) {
                valueName = "speed";
            }
            setApplianceValue(roomIndex, valueName, value);
        }
        
        Serial.printf("[MQTT] Control: %s/%s", roomStr.c_str(), appliance);
        if (hasState) {
            Serial.printf(" = %s", state ? "ON" : "OFF");
        }
        if (hasValue) {
            Serial.printf(" = %d", value);
        }
        Serial.println();
        
        // Display log on OLED
        // Map appliance to display name (AC instead of aircon) - case insensitive
        String applianceDisplay = String(appliance);
        // Check all possible variations (case insensitive) - only AC and aircon
        if (strcasecmp(appliance, "AC") == 0 || 
            strcasecmp(appliance, "aircon") == 0) {
            applianceDisplay = "AC";
        }
        // Limit to 4 chars for display
        if (applianceDisplay.length() > 4) {
            applianceDisplay = applianceDisplay.substring(0, 4);
        }
        String mqttLog = String("MQTT ") + roomStr.substring(0, 3) + "/" + applianceDisplay;
        if (hasState) {
            mqttLog += state ? ":ON" : ":OFF";
        } else if (hasValue) {
            mqttLog += String(":") + String(value);
        }
        pushDisplayLog(mqttLog);
        markDisplayDirty();
        
        // Send room status update
        sendRoomStatus(roomIndex);
    }
 }
  
 // ===== Resolve Server IPs (Auto-Discovery) =====
 void resolveServerIPs() {
     if (USE_STATIC_IP) {
        //  mqttServerIP = String(STATIC_MQTT_SERVER);
         Serial.printf("[Network] Configured for static IP, but using Auto-Discovery override\n");
     } 
     
     // UDP Auto-Discovery
     Serial.println("[Discovery] Broadcasting to find server...");
     pushDisplayLog("Finding Server...");
     
     // Send broadcast
     udp.beginPacket(IPAddress(255, 255, 255, 255), UDP_DISCOVERY_PORT);
     udp.print("WHEELSENSE_DISCOVER");
     udp.endPacket();
     
     // Wait for response (up to 3 seconds)
     unsigned long startWait = millis();
     while (millis() - startWait < 3000) {
         int packetSize = udp.parsePacket();
         if (packetSize > 0) {
             char buffer[256];
             int len = udp.read(buffer, 255);
             if (len > 0) {
                 buffer[len] = 0;
                 
                 StaticJsonDocument<256> doc;
                 DeserializationError error = deserializeJson(doc, buffer);
                 if (!error && doc["type"] == "WHEELSENSE_SERVER") {
                     String serverIP = doc["ip"].as<String>();
                     mqttServerIP = serverIP;
                     Serial.printf("[Discovery] Found server at: %s\n", mqttServerIP.c_str());
                     pushDisplayLog("Found: " + mqttServerIP);
                     return;
                 }
             }
         }
         delay(100);
     }
     
     Serial.println("[Discovery] No server found via UDP");
     pushDisplayLog("Server not found");
     
     // Fallback to configured static or gateway if auto-discovery fails
     if (mqttServerIP.length() == 0) {
          IPAddress gateway = WiFi.gatewayIP();
          mqttServerIP = gateway.toString();
          Serial.printf("[Network] Fallback to Gateway IP - MQTT: %s\n", mqttServerIP.c_str());
          pushDisplayLog("Use Gateway IP");
     }
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

// ===== Request Initial State from Backend =====
// Dashboard (database) is the single source of truth.
// On startup, request current state from backend to sync local state.
void requestInitialState() {
    if (!mqtt.connected()) return;
    
    StaticJsonDocument<256> doc;
    doc["type"] = "state_sync_request";
    doc["device_id"] = DEVICE_ID;
    doc["timestamp"] = millis() / 1000;
    
    String reqMsg;
    serializeJson(doc, reqMsg);
    
    if (mqtt.publish(MQTT_TOPIC_STATE_SYNC_REQUEST, reqMsg.c_str())) {
        Serial.println("[MQTT] Requested initial state sync from backend (Dashboard is master)");
        pushDisplayLog("Sync requested");
    } else {
        Serial.println("[MQTT] Failed to request state sync");
    }
}
  
 // ===== Reconnect MQTT =====
 void reconnectMQTT() {
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
         if (!mqttDisplayConnected) {
             pushDisplayLog("MQTT online");
             mqttDisplayConnected = true;
         }
        
         // Subscribe to wildcard control topic for ALL rooms
         mqtt.subscribe(MQTT_TOPIC_CONTROL_WILDCARD);
         Serial.printf("[MQTT] Subscribed to: %s (all rooms)\n", MQTT_TOPIC_CONTROL_WILDCARD);
         
         // Subscribe to state sync topic to receive current state from backend
         mqtt.subscribe(MQTT_TOPIC_STATE_SYNC_WILDCARD);
         Serial.printf("[MQTT] Subscribed to: %s (state sync from backend)\n", MQTT_TOPIC_STATE_SYNC_WILDCARD);
        
         // Register IP
         registerIPViaMQTT();
         
         // Request current state from backend (Dashboard is master source of truth)
         requestInitialState();
     } else {
         Serial.printf("[MQTT] Failed to connect to %s:%d\n", mqttServerIP.c_str(), MQTT_PORT);
         if (mqttDisplayConnected) {
             pushDisplayLog("MQTT offline");
             mqttDisplayConnected = false;
         }
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
     appliancesObj["AC"] = room.aircon;
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
    
    // Send via MQTT to room-specific topic
    if (mqtt.connected()) {
        char roomTopic[64];
        snprintf(roomTopic, sizeof(roomTopic), "WheelSense/%s/status", room.roomName);
        mqtt.publish(roomTopic, statusMsg.c_str());
    }
}
  
 // ===== Send Status for ALL rooms via MQTT =====
 void sendStatus() {
     StaticJsonDocument<2048> doc;
     doc["type"] = "central_status";
     doc["device_type"] = "appliance_controller_central";
     doc["device_id"] = DEVICE_ID;
    doc["ip_address"] = WiFi.localIP().toString();
    doc["rssi"] = WiFi.RSSI();
    doc["heap"] = ESP.getFreeHeap();
    doc["mqtt_connected"] = mqtt.connected();
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
         appliancesObj["AC"] = room.aircon;
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
    
    // Send via MQTT to central topic
    if (mqtt.connected()) {
        mqtt.publish("WheelSense/central/status", statusMsg.c_str());
    }
}
  
 // ===== Setup =====
 void setup() {
     // Initialize serial communication
     Serial.begin(115200);
     delay(1000);  // Give serial time to initialize
     Serial.flush();  // Clear any pending output
    
     Serial.println("\n========================================");
     Serial.println("  WheelSense Appliance Controller");
     Serial.println("  ESP32-S2-Saola-1 CucumberRS CENTRAL");
     Serial.println("========================================");
     Serial.printf("  Device: %s\n", DEVICE_ID);
     Serial.printf("  Controlling %d rooms:\n", NUM_ROOMS);
     for (int i = 0; i < NUM_ROOMS; i++) {
         Serial.printf("    - %s\n", ROOMS[i]);
     }
     Serial.println("========================================\n");
    
     setupAppliances();
     initDisplay();
     pushDisplayLog("GPIO ready");
    
     // ===== WiFi Manager Setup =====
     Serial.println("[WiFi] Setting up WiFi Manager...");
     pushDisplayLog("WiFi Setup...");
     
     // Set WiFi Manager callbacks
     wifiManager.setConfigPortalBlocking(true);
     wifiManager.setConfigPortalTimeout(180);  // 3 minutes timeout
     
     // Try to connect, if fails start config portal
     if (!wifiManager.autoConnect(WIFI_AP_NAME, WIFI_AP_PASSWORD)) {
         Serial.println("[WiFi] Failed to connect and hit timeout");
         pushDisplayLog("WiFi Failed!");
         delay(3000);
         ESP.restart();
     }
     
     Serial.printf("\n[WiFi] Connected! IP: %s, Gateway: %s, RSSI: %d dBm\n",
                   WiFi.localIP().toString().c_str(),
                   WiFi.gatewayIP().toString().c_str(),
                   WiFi.RSSI());
     pushDisplayLog(String("WiFi ") + WiFi.localIP().toString());
     markDisplayDirty();
     refreshDisplay(true);
    
     // ===== Setup HTTP API Endpoints for Dashboard =====
     
     // WiFi status endpoint
     webServer.on("/wifi/status", HTTP_GET, []() {
         StaticJsonDocument<256> doc;
         doc["connected"] = WiFi.status() == WL_CONNECTED;
         doc["ssid"] = WiFi.SSID();
         doc["ip"] = WiFi.localIP().toString();
         doc["gateway"] = WiFi.gatewayIP().toString();
         doc["rssi"] = WiFi.RSSI();
         doc["mac"] = WiFi.macAddress();
         
         String response;
         serializeJson(doc, response);
         webServer.sendHeader("Access-Control-Allow-Origin", "*");
         webServer.send(200, "application/json", response);
     });
     
     // WiFi networks scan endpoint
     webServer.on("/wifi/networks", HTTP_GET, []() {
         int n = WiFi.scanNetworks();
         StaticJsonDocument<1024> doc;
         JsonArray networks = doc.createNestedArray("networks");
         
         for (int i = 0; i < n && i < 10; i++) {
             JsonObject network = networks.createNestedObject();
             network["ssid"] = WiFi.SSID(i);
             network["rssi"] = WiFi.RSSI(i);
             network["encryption"] = WiFi.encryptionType(i) != WIFI_AUTH_OPEN;
         }
         
         String response;
         serializeJson(doc, response);
         WiFi.scanDelete();
         webServer.sendHeader("Access-Control-Allow-Origin", "*");
         webServer.send(200, "application/json", response);
     });
     
     // WiFi reset endpoint (trigger config portal)
     webServer.on("/wifi/reset", HTTP_POST, []() {
         webServer.sendHeader("Access-Control-Allow-Origin", "*");
         webServer.send(200, "application/json", "{\"status\":\"resetting\"}");
         delay(1000);
         wifiManager.resetSettings();
         ESP.restart();
     });
     
     // Device status endpoint
     webServer.on("/device/status", HTTP_GET, []() {
         StaticJsonDocument<2048> doc;
         doc["device_id"] = DEVICE_ID;
         doc["type"] = "appliance_controller_central";
         doc["ip"] = WiFi.localIP().toString();
         doc["rssi"] = WiFi.RSSI();
         doc["heap"] = ESP.getFreeHeap();
         doc["mqtt_connected"] = mqtt.connected();
         doc["uptime_seconds"] = millis() / 1000;
         doc["num_rooms"] = NUM_ROOMS;
         
         JsonArray roomsArr = doc.createNestedArray("rooms");
         for (int i = 0; i < NUM_ROOMS; i++) {
             RoomAppliances& room = roomStates[i];
             JsonObject roomObj = roomsArr.createNestedObject();
             roomObj["name"] = room.roomName;
             
             JsonObject appliances = roomObj.createNestedObject("appliances");
             appliances["light"] = room.light;
             appliances["AC"] = room.aircon;
             appliances["fan"] = room.fan;
             appliances["tv"] = room.tv;
             appliances["alarm"] = room.alarm;
         }
         
         String response;
         serializeJson(doc, response);
         webServer.sendHeader("Access-Control-Allow-Origin", "*");
         webServer.send(200, "application/json", response);
     });
     
     webServer.begin();
     Serial.println("[WebServer] HTTP API server started on port 80");
     pushDisplayLog("HTTP API ready");
    
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
    
    Serial.println("[System] READY - Central controller active");
    Serial.printf("[System] MQTT wildcard: %s\n", MQTT_TOPIC_CONTROL_WILDCARD);
    Serial.println("[System] WiFi Manager + HTTP API enabled\n");
}
  
 // ===== Main Loop =====
 void loop() {
     unsigned long now = millis();
    
     // Handle MQTT
     static unsigned long lastMQTTTry = 0;
     if (now - lastMQTTTry > 5000) {
         lastMQTTTry = now;
         reconnectMQTT();
     }
    
     if (mqtt.connected()) {
         mqtt.loop();
     }
    
     // Handle HTTP requests
     webServer.handleClient();
    
     // Send status periodically
     if (now - lastStatusMs > STATUS_INTERVAL_MS) {
         lastStatusMs = now;
        
         if (mqtt.connected()) {
             sendStatus();
         }
        
         Serial.printf("[Stats] WiFi: %d dBm, Heap: %d, MQTT: %s\n",
                       WiFi.RSSI(), ESP.getFreeHeap(),
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
    
     refreshDisplay();
     delay(10);
 }