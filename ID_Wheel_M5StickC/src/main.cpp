/*************************************************************
 * WheelSense M5StickC Gateway (Enhanced Version)
 * - BLE Scanner หาชื่อ "WheelSense_<node_id>" โดยดูจาก RSSI
 * - คำนวณระยะทาง ความเร็ว จาก IMU ของ M5StickC
 * - ตรวจสอบสถานะ IMU (orientation, spinning, speed)
 * - WiFiManager พร้อม QR Code display สำหรับ setup
 * - ส่งข้อมูลไป MQTT ทุก 1 วินาที พร้อม timestamp
 * - แสดงผลสวยงามบนจอ LCD ตรงกับข้อมูลที่ส่ง MQTT
 *************************************************************/
#include <M5StickC.h>
#include <WiFi.h>
#include <WiFiManager.h>
#include <PubSubClient.h>
#include <NimBLEDevice.h>
#include <ArduinoJson.h>
#include <time.h>
#include <vector>
#include <map>
#include <esp_task_wdt.h>

/* ===== Configuration ===== */
#define DEVICE_ID "M5_001"  // แก้ตาม device ของคุณ (ตัวอย่าง: M5_001, M5_002)

// MQTT Configuration - แก้ให้ตรงกับ server ของคุณ
// *** ใช้ Public broker สำหรับทดสอบ ***
const char* MQTT_SERVER = "broker.emqx.io";  // Public MQTT broker (for testing)
// const char* MQTT_SERVER = "192.168.1.100";  // Local broker (uncomment และแก้ IP ให้ตรง)
const int MQTT_PORT = 1883;
const char* MQTT_TOPIC = "WheelSense/data";
const char* MQTT_USER = "";  // ถ้ามี
const char* MQTT_PASS = "";  // ถ้ามี

// BLE Configuration
#define BLE_SCAN_TIME 1          // วินาที (ลดจาก 3 -> 1 วิ เพื่อความเร็ว)
#define BLE_SCAN_INTERVAL 3000   // มิลลิวินาที (สแกนทุก 3 วิ)
#define RSSI_THRESHOLD -100       // กรอง Node ที่สัญญาณแย่เกินไป
#define NODE_TIMEOUT_MS 5000     // ถ้า Node ไม่ตอบสนองเกิน 5 วิ จะถือว่า offline

// Watchdog Configuration
#define WDT_TIMEOUT 30  // วินาที (30s - ให้เวลา BLE scan และ WiFi reconnect)

// IMU Configuration (สำหรับคำนวณระยะทาง)
static const float WHEEL_RADIUS_M = 0.30f;
static const float R_MIN_G = 0.40f;
static const float R_MAX_G = 1.60f;
static const float DTHETA_DEADBAND = 0.020f;
static const float MAX_DTHETA = 0.50f;
static const uint32_t WINDOW_MS = 1000;
static const float MOVE_THRESH_RAD = 0.10f;
static const float ANGLE_TO_DIST_SCALE = 1.00f;
static const uint32_t SAMPLE_INTERVAL_MS = 50;
static const uint32_t MQTT_SEND_INTERVAL = 1000;  // ส่ง MQTT ทุก 1 วิ

/* ===== Globals ===== */
WiFiClient espClient;
PubSubClient mqtt(espClient);
NimBLEScan* pBLEScan;

// BLE Node Data (แค่เก็บ RSSI และเวลาที่เจอ)
struct NodeData {
  uint8_t nodeId;
  int rssi;
  unsigned long lastSeen;
};

std::map<uint8_t, NodeData> detectedNodes;

// M5 IMU Data
float total_distance_m = 0.0f;
float current_speed_ms = 0.0f;

bool have_theta = false;
float theta_prev = 0.0f;
float ax_hist[3] = {0,0,0};
float ay_hist[3] = {0,0,0};
int hist_idx = 0;

unsigned long winStartMs = 0;
float win_signed_sum = 0.0f;
unsigned long lastSampleMs = 0;
unsigned long lastBLEScanMs = 0;
unsigned long lastMQTTSendMs = 0;
unsigned long lastDisplayMs = 0;
unsigned long lastWiFiCheckMs = 0;
unsigned long wifiLostTime = 0;
bool wifiWasConnected = false;

/* ===== Display Helper Functions ===== */
void drawWheelSenseLogo() {
  M5.Lcd.fillScreen(BLACK);
  M5.Lcd.setTextColor(TFT_CYAN, BLACK);
  M5.Lcd.setTextDatum(MC_DATUM);
  
  // วาด Logo แบบใหญ่
  M5.Lcd.setTextSize(2);
  M5.Lcd.drawString("WheelSense", 80, 20);
  
  M5.Lcd.setTextSize(1);
  M5.Lcd.setTextColor(TFT_WHITE, BLACK);
  M5.Lcd.drawString("M5StickC Gateway", 80, 45);
  
  // วาดไอคอนล้อ (แบบง่าย)
  M5.Lcd.drawCircle(80, 25, 8, TFT_GREEN);
  M5.Lcd.drawCircle(80, 25, 5, TFT_GREEN);
  
  M5.Lcd.setTextDatum(TL_DATUM);
}

void drawAPMode(const char* ssid, const char* password) {
  M5.Lcd.fillScreen(TFT_ORANGE);
  M5.Lcd.setTextSize(1);
  M5.Lcd.setCursor(5, 10);
  M5.Lcd.setTextColor(TFT_WHITE, TFT_ORANGE);
  
  M5.Lcd.println(" WiFi Setup Mode");
  M5.Lcd.println("");
  M5.Lcd.println(" Connect to:");
  M5.Lcd.setTextColor(TFT_BLACK, TFT_ORANGE);
  M5.Lcd.println(ssid);
  M5.Lcd.setTextColor(TFT_WHITE, TFT_ORANGE);
  M5.Lcd.println("");
  M5.Lcd.print(" Pass: ");
  M5.Lcd.setTextColor(TFT_BLACK, TFT_ORANGE);
  M5.Lcd.println(password);
  M5.Lcd.setTextColor(TFT_WHITE, TFT_ORANGE);
  M5.Lcd.println("");
  M5.Lcd.println(" Portal:");
  M5.Lcd.setTextColor(TFT_YELLOW, TFT_ORANGE);
  M5.Lcd.println(" 192.168.4.1");
}

/* ===== Helper Functions ===== */
static inline float unwrapDelta(float now, float prev) {
  float d = now - prev;
  while (d >  M_PI) d -= 2.0f * M_PI;
  while (d <= -M_PI) d += 2.0f * M_PI;
  return d;
}

static inline float median3(float a, float b, float c) {
  if (a > b) { float t=a; a=b; b=t; }
  if (b > c) { float t=b; b=c; c=t; }
  if (a > b) { float t=a; a=b; b=t; }
  return b;
}

String getTimestamp() {
  time_t now = time(nullptr);
  if (now < 100000) {
    return String("1970-01-01T00:00:00+07:00");
  }
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    return String("1970-01-01T00:00:00+07:00");
  }
  char buffer[30];
  strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%S+07:00", &timeinfo);
  return String(buffer);
}

/* ===== Helper: Clean up offline nodes ===== */
void cleanupOfflineNodes() {
  unsigned long now = millis();
  auto it = detectedNodes.begin();
  while (it != detectedNodes.end()) {
    if (now - it->second.lastSeen > NODE_TIMEOUT_MS) {
      Serial.printf("[BLE] Node %d offline (timeout %lu ms)\n", 
                    it->second.nodeId, now - it->second.lastSeen);
      it = detectedNodes.erase(it);
    } else {
      ++it;
    }
  }
}

/* ===== BLE Scanner Callback ===== */
class MyAdvertisedDeviceCallbacks: public NimBLEAdvertisedDeviceCallbacks {
  void onResult(NimBLEAdvertisedDevice* advertisedDevice) {
    String deviceName = advertisedDevice->getName().c_str();
    
    // ตรวจสอบว่าเป็น WheelSense node หรือไม่
    if (deviceName.startsWith("WheelSense_")) {
      int rssi = advertisedDevice->getRSSI();
      
      // ถ้า RSSI แย่เกินไป ไม่สนใจ
      if (rssi < RSSI_THRESHOLD) return;
      
      // Parse node ID จากชื่อ "WheelSense_1" -> 1
      uint8_t nodeId = deviceName.substring(11).toInt();
      
      // เก็บข้อมูล Node (แค่ NodeID และ RSSI)
      NodeData node;
      node.nodeId = nodeId;
      node.rssi = rssi;
      node.lastSeen = millis();
      
      // เก็บหรืออัพเดท
      detectedNodes[nodeId] = node;
      
      Serial.printf("[BLE] Found Node %d (RSSI: %d dBm)\n", nodeId, rssi);
    }
  }
};

/* ===== IMU Processing ===== */
void processIMU() {
  if (millis() - lastSampleMs < SAMPLE_INTERVAL_MS) return;
  
  float dt_s = (float)(millis() - lastSampleMs) * 0.001f;
  lastSampleMs = millis();
  
  // Read IMU
  float ax, ay, az, gx, gy, gz;
  M5.IMU.getAccelData(&ax, &ay, &az);
  M5.IMU.getGyroData(&gx, &gy, &gz);
  
  // Median filter for accel
  ax_hist[hist_idx] = ax;
  ay_hist[hist_idx] = ay;
  hist_idx = (hist_idx + 1) % 3;
  
  float ax_filt = median3(ax_hist[0], ax_hist[1], ax_hist[2]);
  float ay_filt = median3(ay_hist[0], ay_hist[1], ay_hist[2]);
  
  float r = sqrtf(ax_filt*ax_filt + ay_filt*ay_filt);
  bool reliable = (r >= R_MIN_G && r <= R_MAX_G);
  
  // Calculate theta from accelerometer
  float theta = reliable ? atan2f(ay_filt, ax_filt) : theta_prev;
  
  if (!have_theta) {
    have_theta = true;
    theta_prev = theta;
    winStartMs = millis();
    win_signed_sum = 0.0f;
  }
  
  if (reliable) {
    float dtheta = unwrapDelta(theta, theta_prev);
    if (fabsf(dtheta) < DTHETA_DEADBAND) dtheta = 0.0f;
    if (dtheta >  MAX_DTHETA) dtheta =  MAX_DTHETA;
    if (dtheta < -MAX_DTHETA) dtheta = -MAX_DTHETA;
    theta_prev = theta;
    
    win_signed_sum += dtheta;
  }
  
  // Window processing (1 second)
  if (millis() - winStartMs >= WINDOW_MS) {
    bool moving = (fabsf(win_signed_sum) >= MOVE_THRESH_RAD);
    
    if (moving) {
      float delta_distance = ANGLE_TO_DIST_SCALE * fabsf(win_signed_sum) * WHEEL_RADIUS_M;
      total_distance_m += delta_distance;
      
      // คำนวณความเร็ว (m/s)
      current_speed_ms = delta_distance / (WINDOW_MS / 1000.0f);
    } else {
      current_speed_ms = 0.0f;
    }
    
    // Reset window
    winStartMs = millis();
    win_signed_sum = 0.0f;
  }
}

/* ===== MQTT Functions ===== */
static unsigned long lastMqttTryMs = 0;
static const unsigned long MQTT_RETRY_MS = 5000;  // ลองเชื่อมต่อใหม่ทุก 5 วิ

void reconnectMQTT() {
  if (mqtt.connected()) return;
  
  // ป้องกันการ retry บ่อยเกินไป
  unsigned long now = millis();
  if (now - lastMqttTryMs < MQTT_RETRY_MS) return;
  lastMqttTryMs = now;
  
  Serial.println("\n[MQTT] ========================================");
  Serial.printf("[MQTT] Attempting connection to %s:%d\n", MQTT_SERVER, MQTT_PORT);
  Serial.printf("[MQTT] WiFi Status: %s\n", WiFi.status() == WL_CONNECTED ? "Connected" : "Disconnected");
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[MQTT] WiFi IP: %s\n", WiFi.localIP().toString().c_str());
    Serial.printf("[MQTT] WiFi RSSI: %d dBm\n", WiFi.RSSI());
    
    // Test DNS resolution
    IPAddress mqttIP;
    Serial.printf("[MQTT] Resolving %s... ", MQTT_SERVER);
    if (WiFi.hostByName(MQTT_SERVER, mqttIP)) {
      Serial.printf("OK (%s)\n", mqttIP.toString().c_str());
    } else {
      Serial.println("FAILED!");
      Serial.println("[MQTT] ⚠️  DNS resolution failed - check internet connection");
    }
  }
  
  // สร้าง client ID แบบ WheelSense_M5_XXX_YYYY
  char clientId[64];
  snprintf(clientId, sizeof(clientId), "WheelSense_%s_%04X", DEVICE_ID, random(0xffff));
  Serial.printf("[MQTT] Client ID: %s\n", clientId);
  
  bool connected = false;
  if (strlen(MQTT_USER) > 0 && strlen(MQTT_PASS) > 0) {
    Serial.printf("[MQTT] Connecting with auth (user: %s)\n", MQTT_USER);
    connected = mqtt.connect(clientId, MQTT_USER, MQTT_PASS);
  } else {
    Serial.println("[MQTT] Connecting without auth");
    connected = mqtt.connect(clientId);
  }
  
  if (connected) {
    Serial.println("[MQTT] ✓✓✓ Connected successfully! ✓✓✓");
    Serial.printf("[MQTT] Publishing to topic: %s\n", MQTT_TOPIC);
  } else {
    int state = mqtt.state();
    Serial.printf("[MQTT] ✗✗✗ Connection FAILED! ✗✗✗\n");
    Serial.printf("[MQTT] Error code: %d\n", state);
    Serial.print("[MQTT] Error meaning: ");
    switch(state) {
      case -4: Serial.println("MQTT_CONNECTION_TIMEOUT"); break;
      case -3: Serial.println("MQTT_CONNECTION_LOST"); break;
      case -2: Serial.println("MQTT_CONNECT_FAILED"); break;
      case -1: Serial.println("MQTT_DISCONNECTED"); break;
      case  1: Serial.println("MQTT_CONNECT_BAD_PROTOCOL"); break;
      case  2: Serial.println("MQTT_CONNECT_BAD_CLIENT_ID"); break;
      case  3: Serial.println("MQTT_CONNECT_UNAVAILABLE"); break;
      case  4: Serial.println("MQTT_CONNECT_BAD_CREDENTIALS"); break;
      case  5: Serial.println("MQTT_CONNECT_UNAUTHORIZED"); break;
      default: Serial.println("UNKNOWN_ERROR"); break;
    }
    Serial.println("[MQTT] Will retry in 5 seconds...");
    Serial.println("[MQTT] Troubleshooting:");
    Serial.println("[MQTT]  1. Check MQTT_SERVER IP/hostname is correct");
    Serial.println("[MQTT]  2. Check MQTT_PORT is correct (usually 1883)");
    Serial.println("[MQTT]  3. Check firewall/network allows connection");
    Serial.println("[MQTT]  4. Test with: mosquitto_sub -h <broker> -t '#' -v");
  }
  Serial.println("[MQTT] ========================================\n");
}

void publishData() {
  // ลบ Node ที่ offline ออกก่อน
  cleanupOfflineNodes();
  
  // ตรวจสอบ WiFi ก่อน
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[MQTT] WiFi not connected, skipping publish");
    return;
  }
  
  if (!mqtt.connected()) {
    reconnectMQTT();
    if (!mqtt.connected()) {
      Serial.println("[MQTT] Not connected, skipping publish");
      return;
    }
  }
  
  DynamicJsonDocument doc(1536);  // ลดขนาดเพื่อประหยัด memory
  
  // ใช้ DEVICE_ID โดยตรง (ตัวอย่าง: M5_001)
  doc["device_id"] = String("WheelSense_") + DEVICE_ID;
  doc["timestamp"] = getTimestamp();
  
  // M5 Wheelchair IMU Data (คำนวณจาก M5StickC)
  JsonObject m5data = doc.createNestedObject("wheelchair");
  m5data["distance_m"] = total_distance_m;
  m5data["speed_ms"] = current_speed_ms;
  
  // ตรวจสอบสถานะการติดตั้ง IMU (ดูจาก accelerometer magnitude และทิศทาง)
  float ax, ay, az, gx, gy, gz;
  M5.IMU.getAccelData(&ax, &ay, &az);
  M5.IMU.getGyroData(&gx, &gy, &gz);
  float accel_magnitude = sqrtf(ax*ax + ay*ay + az*az);
  
  // รวบรวมสถานะทั้งหมดในฟิลด์เดียว
  String status = "";
  bool has_issue = false;
  
  // 1. ตรวจสอบ IMU magnitude (ต้องอยู่ในช่วงปกติ)
  bool magnitude_ok = (accel_magnitude >= R_MIN_G && accel_magnitude <= R_MAX_G);
  
  // 2. ตรวจสอบทิศทางการติดตั้ง (M5StickC ติดตั้งถูกต้อง: ax, ay ≈ 0.7-1.0g, az ≈ 0)
  // เมื่อติดตั้งถูกต้อง gravity จะอยู่ใน xy plane (wheel rotation plane)
  // ถ้า az มีค่ามาก แสดงว่าพลิกผิดทิศ
  bool orientation_ok = (fabsf(az) < 0.5f);  // az ต้องน้อยกว่า 0.5g
  
  // ตรวจสอบว่า ax หรือ ay มีค่าพอสมควร (ไม่ใช่ติดแนวตั้ง)
  bool xy_ok = (fabsf(ax) > 0.3f || fabsf(ay) > 0.3f);
  
  if (!magnitude_ok) {
    status += "IMU_NOT_WORKING;";
    has_issue = true;
  }
  
  if (magnitude_ok && (!orientation_ok || !xy_ok)) {
    status += "IMU_WRONG_ORIENTATION;";
    has_issue = true;
  }
  
  // 2. ตรวจสอบหมุนเร็วเกินไป (gyro > threshold)
  float gyro_magnitude = sqrtf(gx*gx + gy*gy + gz*gz);
  const float GYRO_THRESHOLD = 200.0f;  // องศา/วินาที
  if (gyro_magnitude > GYRO_THRESHOLD) {
    status += "SPINNING_TOO_FAST;";
    has_issue = true;
  }
  
  // 3. ตรวจสอบความเร็วผิดปกติ (เร็วเกินไป)
  const float MAX_SPEED = 3.0f;  // m/s (เกิน 3 m/s = 10.8 km/h ผิดปกติ)
  if (current_speed_ms > MAX_SPEED) {
    status += "SPEED_ABNORMAL;";
    has_issue = true;
  }
  
  // 4. ถ้าไม่มีปัญหา ให้แสดง OK
  if (!has_issue) {
    status = "OK";
  } else {
    // ลบเครื่องหมาย ; ตัวสุดท้าย
    if (status.endsWith(";")) {
      status.remove(status.length() - 1);
    }
  }
  
  m5data["status"] = status;
  
  // หา Node ที่มี RSSI แรงที่สุด (ที่ยัง online)
  int strongestRSSI = -200;
  uint8_t strongestNodeId = 0;
  unsigned long now = millis();
  
  for (auto& pair : detectedNodes) {
    unsigned long age = now - pair.second.lastSeen;
    if (age < NODE_TIMEOUT_MS &&  // ยัง online
        pair.second.rssi > strongestRSSI && 
        pair.second.rssi > RSSI_THRESHOLD) {
      strongestRSSI = pair.second.rssi;
      strongestNodeId = pair.first;
    }
  }
  
  // ข้อมูล Node ที่เลือก (strongest RSSI)
  if (strongestNodeId > 0) {
    NodeData& node = detectedNodes[strongestNodeId];
    JsonObject selectedNode = doc.createNestedObject("selected_node");
    selectedNode["node_id"] = node.nodeId;
    selectedNode["rssi"] = node.rssi;
  }
  
  // รายการ Node ทั้งหมดที่ online (ยกเว้นตัวที่เลือกแล้ว)
  JsonArray nodesArray = doc.createNestedArray("nearby_nodes");
  for (auto& pair : detectedNodes) {
    unsigned long age = now - pair.second.lastSeen;
    // ไม่เอา node ที่เลือกแล้วเข้า nearby_nodes
    if (age < NODE_TIMEOUT_MS && pair.second.nodeId != strongestNodeId) {
      JsonObject nodeObj = nodesArray.createNestedObject();
      nodeObj["node_id"] = pair.second.nodeId;
      nodeObj["rssi"] = pair.second.rssi;
    }
  }
  
  String payload;
  serializeJson(doc, payload);
  
  if (mqtt.publish(MQTT_TOPIC, payload.c_str())) {
    Serial.println("[MQTT] ✓ Published");
    Serial.println(payload);
  } else {
    Serial.println("[MQTT] ✗ Publish failed!");
  }
}

/* ===== Display Update ===== */
void updateDisplay() {
  M5.Lcd.fillScreen(BLACK);
  M5.Lcd.setTextSize(1);
  
  // หา Node ที่แรงที่สุด (เฉพาะที่ online)
  int onlineCount = 0;
  int strongestRSSI = -200;
  uint8_t strongestNodeId = 0;
  unsigned long now = millis();
  
  for (auto& pair : detectedNodes) {
    unsigned long age = now - pair.second.lastSeen;
    if (age < NODE_TIMEOUT_MS) {
      onlineCount++;
      if (pair.second.rssi > strongestRSSI) {
        strongestRSSI = pair.second.rssi;
        strongestNodeId = pair.first;
      }
    }
  }
  
  // คำนวณ Status (เหมือนที่ส่ง MQTT)
  float ax, ay, az, gx, gy, gz;
  M5.IMU.getAccelData(&ax, &ay, &az);
  M5.IMU.getGyroData(&gx, &gy, &gz);
  float accel_magnitude = sqrtf(ax*ax + ay*ay + az*az);
  
  bool magnitude_ok = (accel_magnitude >= R_MIN_G && accel_magnitude <= R_MAX_G);
  bool orientation_ok = (fabsf(az) < 0.5f);
  bool xy_ok = (fabsf(ax) > 0.3f || fabsf(ay) > 0.3f);
  
  float gyro_magnitude = sqrtf(gx*gx + gy*gy + gz*gz);
  const float GYRO_THRESHOLD = 200.0f;
  const float MAX_SPEED = 3.0f;
  
  String status = "OK";
  if (!magnitude_ok) {
    status = "IMU_ERR";
  } else if (!orientation_ok || !xy_ok) {
    status = "WRONG_DIR";
  } else if (gyro_magnitude > GYRO_THRESHOLD) {
    status = "SPIN_FAST";
  } else if (current_speed_ms > MAX_SPEED) {
    status = "SPD_HIGH";
  }
  
  // === Header ===
  M5.Lcd.setTextColor(TFT_CYAN, BLACK);
  M5.Lcd.setCursor(0, 0);
  M5.Lcd.print(" WheelSense ");
  M5.Lcd.setTextColor(TFT_YELLOW, BLACK);
  M5.Lcd.println(DEVICE_ID);
  
  // === Connection Status ===
  M5.Lcd.setTextColor(TFT_WHITE, BLACK);
  M5.Lcd.print(" WiFi:");
  M5.Lcd.setTextColor(WiFi.status() == WL_CONNECTED ? TFT_GREEN : TFT_RED, BLACK);
  M5.Lcd.print(WiFi.status() == WL_CONNECTED ? "OK " : "NO ");
  
  M5.Lcd.setTextColor(TFT_WHITE, BLACK);
  M5.Lcd.print("MQTT:");
  M5.Lcd.setTextColor(mqtt.connected() ? TFT_GREEN : TFT_RED, BLACK);
  M5.Lcd.println(mqtt.connected() ? "OK" : "NO");
  
  // === Divider ===
  M5.Lcd.drawLine(0, 18, 160, 18, TFT_DARKGREY);
  
  // === Wheelchair Data (ตรงกับ MQTT) ===
  M5.Lcd.setTextColor(TFT_YELLOW, BLACK);
  M5.Lcd.setCursor(0, 22);
  M5.Lcd.println(" WHEELCHAIR");
  
  M5.Lcd.setTextColor(TFT_WHITE, BLACK);
  M5.Lcd.printf(" Dist: ");
  M5.Lcd.setTextColor(TFT_CYAN, BLACK);
  M5.Lcd.printf("%.2fm\n", total_distance_m);
  
  M5.Lcd.setTextColor(TFT_WHITE, BLACK);
  M5.Lcd.printf(" Speed: ");
  M5.Lcd.setTextColor(TFT_CYAN, BLACK);
  M5.Lcd.printf("%.2fm/s\n", current_speed_ms);
  
  M5.Lcd.setTextColor(TFT_WHITE, BLACK);
  M5.Lcd.printf(" Status: ");
  M5.Lcd.setTextColor(status == "OK" ? TFT_GREEN : TFT_RED, BLACK);
  M5.Lcd.println(status);
  
  // === Divider ===
  M5.Lcd.drawLine(0, 56, 160, 56, TFT_DARKGREY);
  
  // === Selected Node (ตรงกับ MQTT) - แบบกระชับ ===
  M5.Lcd.setTextColor(TFT_YELLOW, BLACK);
  M5.Lcd.setCursor(0, 60);
  
  if (strongestNodeId > 0) {
    M5.Lcd.print(" NODE ");
    M5.Lcd.setTextColor(TFT_GREEN, BLACK);
    M5.Lcd.print(strongestNodeId);
    M5.Lcd.setTextColor(TFT_WHITE, BLACK);
    M5.Lcd.print(" [");
    M5.Lcd.setTextColor(TFT_GREEN, BLACK);
    M5.Lcd.print(strongestRSSI);
    M5.Lcd.setTextColor(TFT_WHITE, BLACK);
    M5.Lcd.println("dBm]");
    
    M5.Lcd.setTextColor(TFT_WHITE, BLACK);
    M5.Lcd.print(" Nearby: ");
    M5.Lcd.setTextColor(TFT_CYAN, BLACK);
    M5.Lcd.println(onlineCount - 1);
  } else {
    M5.Lcd.setTextColor(TFT_RED, BLACK);
    M5.Lcd.println(" No node");
  }
}

/* ===== Setup ===== */
void setup() {
  // Initialize M5StickC
  M5.begin();
  M5.IMU.Init();
  M5.Lcd.setRotation(3);
  
  Serial.begin(115200);
  delay(500);
  
  // แสดง Logo ตอนเริ่มต้น
  drawWheelSenseLogo();
  delay(2000);
  
  Serial.println("\n=================================");
  Serial.println("  WheelSense M5StickC Gateway");
  Serial.println("  (Simplified - No Encryption)");
  Serial.println("=================================");
  Serial.printf("Free Heap: %u bytes\n", ESP.getFreeHeap());
  Serial.println();
  
  // Configure WiFi sleep mode BEFORE WiFi starts
  // ESP32 requires modem sleep when using WiFi + BLE together!
  WiFi.setSleep(WIFI_PS_MIN_MODEM);  // Minimum modem sleep (balance between power and stability)
  Serial.println("[Setup] WiFi sleep mode: MIN_MODEM (required for WiFi+BLE)");
  
  // BLE Setup - ต้อง init ก่อน WiFi เพื่อป้องกัน memory overflow!
  M5.Lcd.fillScreen(BLACK);
  M5.Lcd.setCursor(0, 0);
  M5.Lcd.setTextSize(1);
  M5.Lcd.setTextColor(TFT_CYAN, BLACK);
  M5.Lcd.println("BLE Init...");
  Serial.println("[Setup] Initializing BLE (before WiFi)...");
  
  NimBLEDevice::init("");
  NimBLEDevice::setPower(ESP_PWR_LVL_P9);
  
  pBLEScan = NimBLEDevice::getScan();
  pBLEScan->setAdvertisedDeviceCallbacks(new MyAdvertisedDeviceCallbacks());
  pBLEScan->setActiveScan(true);
  pBLEScan->setInterval(100);
  pBLEScan->setWindow(99);
  
  Serial.println("[Setup] BLE initialized successfully");
  Serial.printf("Free Heap after BLE: %u bytes\n", ESP.getFreeHeap());
  delay(500);
  
  // WiFi Manager
  M5.Lcd.setTextColor(TFT_WHITE, BLACK);
  M5.Lcd.println("\nWiFi Setup...");
  Serial.println("[Setup] Starting WiFi Manager...");
  
  // ตรวจสอบปุ่ม B - ถ้ากดค้างไว้จะ reset WiFi
  M5.update();
  if (M5.BtnB.isPressed()) {
    M5.Lcd.fillScreen(TFT_RED);
    M5.Lcd.setCursor(0, 0);
    M5.Lcd.setTextColor(TFT_WHITE, TFT_RED);
    M5.Lcd.println("Reset WiFi!");
    M5.Lcd.println("Please wait...");
    Serial.println("[Setup] Button B pressed - Resetting WiFi settings...");
    
    WiFiManager wm_reset;
    wm_reset.resetSettings();
    
    delay(2000);
    M5.Lcd.println("Done! Restarting...");
    Serial.println("[Setup] WiFi reset complete. Restarting...");
    delay(1000);
    ESP.restart();
  }
  
  // สร้างชื่อ WiFi AP แบบ WheelSense_M5_XXX-Setup
  char apName[32];
  char apPassword[] = "12345678";
  snprintf(apName, sizeof(apName), "WheelSense_%s-Setup", DEVICE_ID);
  
  WiFiManager wm;
  
  // Callback เมื่อเข้า Config Portal mode (AP mode)
  wm.setAPCallback([](WiFiManager *wm) {
    // แสดงข้อมูล AP
    char apName[32];
    snprintf(apName, sizeof(apName), "WheelSense_%s-Setup", DEVICE_ID);
    drawAPMode(apName, "12345678");
  });
  
  // หรือ uncomment บรรทัดนี้เพื่อ reset WiFi settings ทุกครั้งที่ boot (สำหรับทดสอบ)
  // wm.resetSettings();
  
  // WiFiManager configuration
  wm.setDebugOutput(true);
  wm.setConfigPortalBlocking(true);
  wm.setConnectTimeout(5);           // ลด timeout เป็น 5 วิ ต่อการลอง
  wm.setConnectRetries(1);           // ลองแค่ 1 ครั้ง ถ้าไม่ได้เปิด AP เลย!
  wm.setConfigPortalTimeout(300);    // เวลา portal 5 นาที
  wm.setAPClientCheck(true);         // ตรวจสอบว่ามี client เชื่อมต่อ
  
  // เปิด captive portal เพื่อ auto-popup
  wm.setCaptivePortalEnable(true);   // เปิด captive portal (auto-redirect)
  
  Serial.println("[WiFi] Quick fallback: If WiFi not found in 5s, AP mode opens");
  Serial.println("[WiFi] If portal doesn't auto-open, go to: http://192.168.4.1");
  Serial.printf("[WiFi] AP Name: %s\n", apName);
  Serial.printf("[WiFi] AP Password: %s\n", apPassword);
  
  bool res = wm.autoConnect(apName, apPassword);
  
  if (!res) {
    M5.Lcd.fillScreen(TFT_RED);
    M5.Lcd.setCursor(0, 0);
    M5.Lcd.setTextColor(TFT_WHITE, TFT_RED);
    M5.Lcd.println("WiFi Failed!");
    M5.Lcd.println("Restarting...");
    Serial.println("[Setup] Failed to connect to WiFi, restarting...");
    delay(3000);
    ESP.restart();
  } else {
    M5.Lcd.fillScreen(TFT_GREEN);
    M5.Lcd.setCursor(0, 0);
    M5.Lcd.setTextSize(1);
    M5.Lcd.setTextColor(TFT_WHITE, TFT_GREEN);
    M5.Lcd.println(" WiFi Connected!");
    M5.Lcd.println("");
    M5.Lcd.setTextColor(TFT_BLACK, TFT_GREEN);
    M5.Lcd.print(" IP: ");
    M5.Lcd.println(WiFi.localIP());
    
    Serial.println("[Setup] WiFi connected!");
    Serial.print("[Setup] IP: ");
    Serial.println(WiFi.localIP());
    Serial.printf("[Setup] WiFi RSSI: %d dBm\n", WiFi.RSSI());
    Serial.println("[Setup] WiFi sleep: MIN_MODEM (WiFi+BLE coexistence)");
    
    // Configure DNS servers (Google DNS + Cloudflare)
    IPAddress dns1(8, 8, 8, 8);       // Google DNS
    IPAddress dns2(1, 1, 1, 1);       // Cloudflare DNS
    // Use WiFi.config() to set DNS (ESP32 doesn't have setDNS)
    // Parameters: local_ip, gateway, subnet, dns1, dns2
    WiFi.config(INADDR_NONE, INADDR_NONE, INADDR_NONE, dns1, dns2);
    Serial.println("[Setup] DNS configured: 8.8.8.8, 1.1.1.1");
    
    delay(2000);
  }
  
  // NTP Time sync
  M5.Lcd.fillScreen(BLACK);
  M5.Lcd.setCursor(0, 0);
  M5.Lcd.setTextColor(TFT_CYAN, BLACK);
  M5.Lcd.println("Syncing time...");
  Serial.println("[Setup] Syncing time...");
  
  // Test DNS first
  Serial.print("[Setup] Testing DNS... ");
  IPAddress testIP;
  if (WiFi.hostByName("pool.ntp.org", testIP)) {
    Serial.printf("OK (pool.ntp.org = %s)\n", testIP.toString().c_str());
  } else {
    Serial.println("FAILED - Internet may not be available");
  }
  
  configTime(7 * 3600, 0, "pool.ntp.org", "time.nist.gov");
  
  // รอ NTP sync (สูงสุด 10 วิ)
  int retry = 0;
  while (time(nullptr) < 100000 && retry < 20) {
    delay(500);
    retry++;
    Serial.print(".");
  }
  Serial.println();
  
  if (time(nullptr) < 100000) {
    Serial.println("[Setup] ⚠️  NTP sync failed - no internet connection");
  }
  Serial.printf("[Setup] Time: %s\n", getTimestamp().c_str());
  
  // MQTT Setup
  mqtt.setServer(MQTT_SERVER, MQTT_PORT);
  mqtt.setBufferSize(1536);  // ลด buffer จาก 2048 -> 1536 เพื่อประหยัด memory
  mqtt.setKeepAlive(60);  // Keep-alive interval (seconds)
  Serial.printf("[Setup] MQTT server: %s:%d\n", MQTT_SERVER, MQTT_PORT);
  Serial.println("[Setup] MQTT buffer: 1536 bytes, keep-alive: 60s");
  Serial.printf("Free Heap after MQTT: %u bytes\n", ESP.getFreeHeap());
  
  // Watchdog Timer Setup
  M5.Lcd.setTextColor(TFT_WHITE, BLACK);
  M5.Lcd.println("Init system...");
  Serial.printf("[Setup] Initializing Watchdog Timer (%d seconds)...\n", WDT_TIMEOUT);
  esp_task_wdt_init(WDT_TIMEOUT, true);  // timeout, panic on timeout
  esp_task_wdt_add(NULL);  // Add current thread to WDT watch
  Serial.println("[Setup] Watchdog Timer initialized");
  
  M5.Lcd.fillScreen(TFT_GREEN);
  M5.Lcd.setCursor(0, 20);
  M5.Lcd.setTextSize(2);
  M5.Lcd.setTextColor(TFT_WHITE, TFT_GREEN);
  M5.Lcd.println(" READY!");
  Serial.println("[Setup] System ready!");
  Serial.printf("Free Heap final: %u bytes\n", ESP.getFreeHeap());
  Serial.println("=================================\n");
  delay(1500);
  
  // Initialize IMU history
  float ax, ay, az;
  M5.IMU.getAccelData(&ax, &ay, &az);
  ax_hist[0] = ax_hist[1] = ax_hist[2] = ax;
  ay_hist[0] = ay_hist[1] = ay_hist[2] = ay;
  
  lastSampleMs = millis();
  lastBLEScanMs = millis();
  lastMQTTSendMs = millis();
  lastDisplayMs = millis();
  lastWiFiCheckMs = millis();
  winStartMs = millis();
  wifiWasConnected = true;  // เริ่มต้นเป็น true เพราะเพิ่ง connected
  
  Serial.println("\n=== System Running ===\n");
}

/* ===== Loop ===== */
void loop() {
  M5.update();
  
  // Reset watchdog timer
  esp_task_wdt_reset();
  
  // ตรวจสอบ WiFi ทุก 5 วินาที
  if (millis() - lastWiFiCheckMs >= 5000) {
    lastWiFiCheckMs = millis();
    
    if (WiFi.status() != WL_CONNECTED) {
      if (wifiWasConnected) {
        // WiFi เพิ่งหลุด
        wifiLostTime = millis();
        wifiWasConnected = false;
        Serial.println("[WiFi] ⚠️  Connection lost!");
        
        M5.Lcd.fillScreen(TFT_RED);
        M5.Lcd.setCursor(0, 20);
        M5.Lcd.setTextSize(1);
        M5.Lcd.setTextColor(TFT_WHITE, TFT_RED);
        M5.Lcd.println(" WiFi Lost!");
        M5.Lcd.println(" Starting AP...");
      }
      
      // ถ้าหลุดเกิน 10 วินาที ให้เปิด AP mode
      if (millis() - wifiLostTime > 10000) {
        Serial.println("[WiFi] Opening AP mode for reconfiguration...");
        
        // สร้าง WiFiManager instance ใหม่
        char apName[32];
        snprintf(apName, sizeof(apName), "WheelSense_%s-Setup", DEVICE_ID);
        
        WiFiManager wm;
        wm.setConfigPortalBlocking(true);
        wm.setConfigPortalTimeout(300);
        wm.setCaptivePortalEnable(true);
        
        // แสดง AP mode บนจอ
        drawAPMode(apName, "12345678");
        
        // เปิด config portal
        if (wm.startConfigPortal(apName, "12345678")) {
          Serial.println("[WiFi] Reconnected successfully!");
          wifiWasConnected = true;
          
          // แสดงว่า connected
          M5.Lcd.fillScreen(TFT_GREEN);
          M5.Lcd.setCursor(0, 20);
          M5.Lcd.setTextSize(1);
          M5.Lcd.setTextColor(TFT_WHITE, TFT_GREEN);
          M5.Lcd.println(" WiFi Connected!");
          M5.Lcd.println("");
          M5.Lcd.print(" IP: ");
          M5.Lcd.println(WiFi.localIP());
          delay(2000);
        } else {
          Serial.println("[WiFi] Config portal timeout, restarting...");
          ESP.restart();
        }
      }
    } else {
      wifiWasConnected = true;
    }
  }
  
  // ลอง reconnect MQTT ถ้าหลุด
  if (!mqtt.connected()) {
    reconnectMQTT();
  }
  
  // MQTT loop (สำคัญ!)
  mqtt.loop();
  
  // Process IMU
  processIMU();
  
  // Publish to MQTT (ทุก 1 วิ - ส่งก่อน BLE scan เพื่อไม่ให้สะดุด)
  if (millis() - lastMQTTSendMs >= MQTT_SEND_INTERVAL) {
    lastMQTTSendMs = millis();
    publishData();
  }
  
  // BLE Scan (ทุกๆ BLE_SCAN_INTERVAL)
  if (millis() - lastBLEScanMs >= BLE_SCAN_INTERVAL) {
    lastBLEScanMs = millis();
    
    Serial.printf("[BLE] Scanning for %d second...\n", BLE_SCAN_TIME);
    NimBLEScanResults foundDevices = pBLEScan->start(BLE_SCAN_TIME, false);
    Serial.printf("[BLE] Scan complete. Found %d devices\n", foundDevices.getCount());
    pBLEScan->clearResults();
    
    // ลบ Node offline หลัง scan
    cleanupOfflineNodes();
  }
  
  // Update display
  if (millis() - lastDisplayMs >= 1000) {
    lastDisplayMs = millis();
    updateDisplay();
  }
  
  // Button handler (optional - กด M5 button A เพื่อ reset WiFi)
  if (M5.BtnA.wasPressed()) {
    M5.Lcd.fillScreen(BLACK);
    M5.Lcd.setCursor(0, 0);
    M5.Lcd.println("Hold 3s to");
    M5.Lcd.println("Reset WiFi");
  }
  
  if (M5.BtnA.pressedFor(3000)) {
    M5.Lcd.fillScreen(RED);
    M5.Lcd.setCursor(0, 0);
    M5.Lcd.println("WiFi Reset!");
    M5.Lcd.println("Restarting...");
    
    WiFiManager wm;
    wm.resetSettings();
    delay(1000);
    ESP.restart();
  }
  
  delay(10);
}
