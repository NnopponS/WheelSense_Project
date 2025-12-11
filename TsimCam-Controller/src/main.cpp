/*
 * TsimCam Controller - Video Streaming Only
 * 
 * หน้าที่: ส่ง video stream ไปยัง Backend ผ่าน WebSocket
 * หมายเหตุ: การควบคุมอุปกรณ์ไฟฟ้า (appliances) ถูกย้ายไปที่ ESP8266 nodemcuBase v1.0
 */

#include <WiFi.h>
#include <WebSocketsClient.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include "esp_camera.h"
#include "esp_heap_caps.h"
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"

const char* WIFI_SSID = "KNIGHT";
const char* WIFI_PASSWORD = "192837abcd";

// ===== Network Configuration =====
// วิธีที่ 1: ใช้ Static IP (แนะนำ - fix ค้างไว้)
// ตั้งค่า IP ของ host machine ที่รัน Docker
#define USE_STATIC_IP false
const char* STATIC_MQTT_SERVER = "192.168.137.1";      // IP ของ host machine ที่รัน Docker
const char* STATIC_WEBSOCKET_SERVER = "192.168.137.1"; // IP ของ host machine ที่รัน Docker

// วิธีที่ 2: ใช้ Gateway IP อัตโนมัติ (ใช้ IP ของ router/gateway)
// #define USE_STATIC_IP false

const int MQTT_PORT = 1883;
const int WEBSOCKET_PORT = 8765;
const int STATUS_INTERVAL_MS = 5000;  // ส่ง status ทุก 5 วินาที

// ตัวแปรสำหรับเก็บ IP ที่ resolve แล้ว
String mqttServerIP;
String websocketServerIP;

#define DEVICE_ID "TSIM_003"
#define ROOM_TYPE "bathroom"

// ปรับให้ได้ FPS ~25, drop น้อย, ภาพชัด
#define CAMERA_FRAME_SIZE FRAMESIZE_QVGA   // 320x240 - สมดุลระหว่างคุณภาพและ FPS
#define JPEG_QUALITY 30                    // คุณภาพดี (0-63, ต่ำ = quality สูง) - สมดุลระหว่างชัดและไฟล์เล็ก
#define TARGET_FPS 25                      // ตั้งเป้า FPS 25
#define FRAME_INTERVAL_MS (1000 / TARGET_FPS)  // 40ms per frame = 25 FPS
#define FRAME_BUFFER_COUNT 4               // เพิ่ม buffer เพื่อลด drop
#define FRAME_QUEUE_SIZE 12                // เพิ่มคิวให้ใหญ่ขึ้น

// ปรับขนาด buffer ให้เหมาะกับ QVGA JPEG
#define FRAME_POOL_SIZE 12                 // เพิ่ม pool size มากๆ เพื่อลด drop
#define MAX_FRAME_SIZE 40000               // QVGA JPEG quality 30 ~25-35 KB

/* ===== T-SIM Camera Pins ===== */
#define PWDN_GPIO_NUM     -1
#define RESET_GPIO_NUM     18
#define XCLK_GPIO_NUM     14
#define SIOD_GPIO_NUM     4
#define SIOC_GPIO_NUM     5
#define Y9_GPIO_NUM       15
#define Y8_GPIO_NUM       16
#define Y7_GPIO_NUM       17
#define Y6_GPIO_NUM       12
#define Y5_GPIO_NUM       10
#define Y4_GPIO_NUM       8
#define Y3_GPIO_NUM       9
#define Y2_GPIO_NUM       11
#define VSYNC_GPIO_NUM    6
#define HREF_GPIO_NUM     7
#define PCLK_GPIO_NUM     13

/* ===== Appliance Pins (DEPRECATED - Use ESP8266 instead) ===== */
// Note: Appliance control has been moved to ESP8266 nodemcuBase v1.0
// These pins are kept for backward compatibility but should not be used
// #define LED_LIGHT_PIN    21
// #define LED_AIRCON_PIN   46
// #define LED_FAN_PIN      47
// #define LED_TV_PIN       48

/* ===== FreeRTOS Task Configuration ===== */
#define CAMERA_TASK_CORE 1
#define CAMERA_TASK_PRIORITY 5
#define WS_TASK_CORE 0
#define WS_TASK_PRIORITY 4
#define CAMERA_TASK_STACK_SIZE 10240
#define WS_TASK_STACK_SIZE 10240

/* ===== Frame Data Structure ===== */
struct FrameData {
  uint8_t* data;
  size_t length;
  bool inUse;
};

/* ===== Frame Pool (Fixed Allocation) ===== */
struct FramePool {
  uint8_t* buffers[FRAME_POOL_SIZE];
  FrameData frames[FRAME_POOL_SIZE];
  bool inUse[FRAME_POOL_SIZE];
  bool initialized;
  
  FramePool() : buffers{nullptr}, frames{}, inUse{false}, initialized(false) {}

  bool init() {
    initialized = false;
    for (int i = 0; i < FRAME_POOL_SIZE; i++) {
      buffers[i] = (uint8_t*)heap_caps_malloc(MAX_FRAME_SIZE, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
      if (!buffers[i]) {
        buffers[i] = (uint8_t*)heap_caps_malloc(MAX_FRAME_SIZE, MALLOC_CAP_8BIT);
      }
      if (!buffers[i]) {
        return false;
      }
      inUse[i] = false;
      frames[i].data = buffers[i];
      frames[i].length = 0;
      frames[i].inUse = false;
    }
    initialized = true;
    return true;
  }
  
  FrameData* allocate(size_t size) {
    if (!initialized || size > MAX_FRAME_SIZE) return nullptr;
    
    for (int i = 0; i < FRAME_POOL_SIZE; i++) {
      if (!inUse[i]) {
        inUse[i] = true;
        frames[i].length = size;
        frames[i].inUse = true;
        return &frames[i];
      }
    }
    return nullptr;
  }
  
  void free(FrameData* frame) {
    if (!frame || !frame->data || !initialized) return;
    
    for (int i = 0; i < FRAME_POOL_SIZE; i++) {
      if (frame == &frames[i]) {
        inUse[i] = false;
        frames[i].length = 0;
        frames[i].inUse = false;
        break;
      }
    }
  }
};

/* ===== Globals ===== */
WiFiClient espClient;
PubSubClient mqtt(espClient);
WebSocketsClient webSocket;

// MQTT topics
char MQTT_TOPIC_REGISTRATION[64];  // สำหรับส่ง IP registration

// Flags
bool mqttRegistered = false;  // บันทึกว่าได้ส่ง IP ผ่าน MQTT แล้วหรือยัง
bool wsWasConnected = false;   // ตรวจสอบว่า WebSocket เคยเชื่อมต่อสำเร็จหรือไม่

QueueHandle_t frameQueue = NULL;
FramePool framePool;

volatile bool wsConnected = false;
volatile unsigned long framesSent = 0;
volatile unsigned long framesDropped = 0;
volatile unsigned long poolExhausted = 0;

unsigned long lastStatusMs = 0;
unsigned long lastReconnectAttempt = 0;
unsigned long startTime = 0;

// ตัวแปรไว้คิด FPS ช่วงล่าสุด
unsigned long lastFpsTime = 0;
unsigned long lastFramesSent = 0;

bool motionDetected = false;

// Note: Appliance control moved to ESP8266
// TsimCam now only handles video streaming

// Forward declarations
void sendStatus();
void reconnectWebSocket();
void resolveServerIPs();
void handleWebSocketMessage(String message);
void registerIPViaMQTT();
void reconnectMQTT();
void setAppliance(const char* name, bool state);

/* ===== Camera Setup ===== */
bool setupCamera() {
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;         // 20MHz - ความเร็วสูงสุด
  config.pixel_format = PIXFORMAT_JPEG;
  config.grab_mode = CAMERA_GRAB_LATEST;  // ดึงเฟรมล่าสุดเสมอ - ไม่รอ
  
  config.frame_size = CAMERA_FRAME_SIZE;
  config.jpeg_quality = JPEG_QUALITY;
  config.fb_count = FRAME_BUFFER_COUNT;
  config.fb_location = psramFound() ? CAMERA_FB_IN_PSRAM : CAMERA_FB_IN_DRAM;
  Serial.printf("[Camera] %s PSRAM, size %d, quality %d, fb %d\n",
                psramFound() ? "Using" : "No",
                CAMERA_FRAME_SIZE, JPEG_QUALITY, FRAME_BUFFER_COUNT);
  
  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("[Camera] Init error: 0x%x\n", err);
    return false;
  }
  
  sensor_t *s = esp_camera_sensor_get();
  if (s) {
    s->set_framesize(s, CAMERA_FRAME_SIZE);
    s->set_quality(s, JPEG_QUALITY);
  }
  
  Serial.printf("[Camera] QVGA 320x240, Quality: %d (lower=better), Buffers: %d, Target FPS: %d\n",
                JPEG_QUALITY, FRAME_BUFFER_COUNT, TARGET_FPS);
  return true;
}

/* ===== WebSocket Event Handler ===== */
void webSocketEvent(WStype_t type, uint8_t *payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      wsConnected = false;
      Serial.println("[WebSocket] Disconnected");
      
      // ถ้า WebSocket หลุด ให้ส่ง IP ผ่าน MQTT อีกครั้ง (ถ้ายังไม่ได้ register)
      if (wsWasConnected) {
        mqttRegistered = false;  // Reset flag เพื่อให้ส่ง IP ใหม่
        Serial.println("[MQTT] Will re-register IP after WebSocket disconnect");
      }
      break;
      
    case WStype_CONNECTED: {
      wsConnected = true;
      wsWasConnected = true;  // บันทึกว่าเคยเชื่อมต่อสำเร็จแล้ว
      Serial.printf("[WebSocket] Connected to %s:%d\n", websocketServerIP.c_str(), WEBSOCKET_PORT);
      
      // ส่ง welcome message พร้อม device info
      StaticJsonDocument<256> welcomeDoc;
      welcomeDoc["type"] = "connected";
      welcomeDoc["device_id"] = DEVICE_ID;
      welcomeDoc["room"] = ROOM_TYPE;
      welcomeDoc["buffers"] = FRAME_BUFFER_COUNT;
      welcomeDoc["pool"] = FRAME_POOL_SIZE;
      
      String welcomeMsg;
      serializeJson(welcomeDoc, welcomeMsg);
      webSocket.sendTXT(welcomeMsg);
      
      // ส่ง status ครั้งแรก
      sendStatus();
      
      // หลังจาก WebSocket เชื่อมต่อสำเร็จแล้ว ปิด MQTT (ไม่ต้องใช้แล้ว)
      if (mqtt.connected()) {
        mqtt.disconnect();
        Serial.println("[MQTT] Disconnected - WebSocket is active");
      }
      break;
    }

    case WStype_TEXT: {
      // รับ control commands ผ่าน WebSocket
      String message = String((char*)payload);
      handleWebSocketMessage(message);
      break;
    }
    
    case WStype_BIN:
      // Binary data = video frames (ไม่ต้องทำอะไร)
      break;
      
    case WStype_ERROR:
      Serial.printf("[WebSocket] Error: %s\n", payload);
      break;
      
    default:
      break;
  }
}

/* ===== Handle WebSocket Messages ===== */
void handleWebSocketMessage(String message) {
  StaticJsonDocument<512> doc;
  DeserializationError error = deserializeJson(doc, message);
  
  if (error) {
    Serial.printf("[WebSocket] JSON parse error: %s\n", error.c_str());
    return;
  }
  
  const char* msgType = doc["type"];
  
  if (msgType && strcmp(msgType, "control") == 0) {
    // Control appliance command
    const char* appliance = doc["appliance"];
    bool state = doc["state"] | false;
    
    if (appliance) {
      setAppliance(appliance, state);
      Serial.printf("[WebSocket] Control: %s = %s\n", appliance, state ? "ON" : "OFF");
      
      // ส่ง confirmation กลับ
      StaticJsonDocument<128> response;
      response["type"] = "control_ack";
      response["appliance"] = appliance;
      response["state"] = state;
      response["status"] = "ok";
      
      String responseMsg;
      serializeJson(response, responseMsg);
      webSocket.sendTXT(responseMsg);
    }
  } else if (msgType && strcmp(msgType, "detection") == 0) {
    // Motion detection update
    motionDetected = doc["motion_detected"] | false;
    Serial.printf("[WebSocket] Detection: %s\n", motionDetected ? "DETECTED" : "NONE");
  } else if (msgType && strcmp(msgType, "ping") == 0) {
    // Ping/Pong for keepalive
    StaticJsonDocument<64> pong;
    pong["type"] = "pong";
    String pongMsg;
    serializeJson(pong, pongMsg);
    webSocket.sendTXT(pongMsg);
  }
}

/* ===== Camera Capture Task (Core 1) ===== */
// Optimized: ควบคุม FPS ที่ 25, drop น้อย, ภาพชัด
void cameraTask(void *parameter) {
  TickType_t lastWakeTime = xTaskGetTickCount();
  const TickType_t frameInterval = pdMS_TO_TICKS(FRAME_INTERVAL_MS);
  
  while (true) {
    // ดึงเฟรมล่าสุดเสมอ (CAMERA_GRAB_LATEST จะ skip เฟรมเก่า)
    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb) {
      vTaskDelay(1);
      continue;
    }
    
    // ถ้า WebSocket เชื่อมต่ออยู่ ให้ส่งเฟรม
    if (wsConnected) {
      // ตรวจสอบขนาดก่อน allocate
      if (fb->len <= MAX_FRAME_SIZE) {
        FrameData* frame = framePool.allocate(fb->len);
        
        if (frame) {
          // Copy เฟรมไปยัง pool
          memcpy(frame->data, fb->buf, fb->len);
          frame->length = fb->len;
          
          // ส่งเข้า queue (non-blocking)
          if (xQueueSend(frameQueue, &frame, 0) != pdTRUE) {
            // Queue เต็ม - drop frame และ free pool
            framePool.free(frame);
            framesDropped++;
          }
          // ถ้าส่งสำเร็จ ไม่ต้องทำอะไร - frame จะถูก free ใน WebSocket task
        } else {
          // Pool เต็ม - skip เฟรมนี้ (ไม่ copy, ไม่ drop counter เพิ่ม)
          // เพราะ WebSocket task ยังส่งไม่ทัน
          poolExhausted++;
          framesDropped++;
        }
      } else {
        // เฟรมใหญ่เกินไป - drop
        framesDropped++;
      }
    }
    
    // Return frame buffer กลับไปยัง camera driver ทันที
    esp_camera_fb_return(fb);
    
    // ควบคุม FPS ที่ 25 (40ms per frame)
    vTaskDelayUntil(&lastWakeTime, frameInterval);
  }
}

/* ===== Resolve Server IPs ===== */
void resolveServerIPs() {
  if (USE_STATIC_IP) {
    // ใช้ Static IP ที่ fix ค้างไว้
    mqttServerIP = String(STATIC_MQTT_SERVER);
    websocketServerIP = String(STATIC_WEBSOCKET_SERVER);
    Serial.printf("[Network] Using Static IP - MQTT: %s, WebSocket: %s\n", 
                  mqttServerIP.c_str(), websocketServerIP.c_str());
  } else {
    // ใช้ Gateway IP อัตโนมัติ (IP ของ router/host machine)
    IPAddress gateway = WiFi.gatewayIP();
    mqttServerIP = gateway.toString();
    websocketServerIP = gateway.toString();
    Serial.printf("[Network] Using Gateway IP - MQTT: %s, WebSocket: %s\n", 
                  mqttServerIP.c_str(), websocketServerIP.c_str());
  }
}

/* ===== Reconnect WebSocket (ใช้ใน WS task เท่านั้น) ===== */
void reconnectWebSocket() {
  if (wsConnected) return;
  
  unsigned long now = millis();
  if (now - lastReconnectAttempt < 5000) return;
  lastReconnectAttempt = now;
  
  if (websocketServerIP.length() == 0) {
    resolveServerIPs();
  }
  
  webSocket.begin(websocketServerIP.c_str(), WEBSOCKET_PORT, "/");
  webSocket.onEvent(webSocketEvent);
}

/* ===== WebSocket Sending Task (Core 0) ===== */
// Optimized: ส่งเฟรมเร็วที่สุด, ลด drop, รองรับ FPS 25
void webSocketTask(void *parameter) {
  while (true) {
    if (!wsConnected) {
      reconnectWebSocket();
    }

    // ดูแล WebSocket ทั้งหมดใน task นี้ตัวเดียว
    webSocket.loop();

    if (wsConnected) {
      // ดึงเฟรมจาก queue และส่งทันที (non-blocking)
      // ส่งหลายเฟรมถ้ามีใน queue เพื่อลด drop และเพิ่ม FPS
      int framesProcessed = 0;
      const int MAX_FRAMES_PER_LOOP = 5;  // เพิ่มเป็น 5 เฟรมต่อ loop เพื่อลด drop
      
      while (framesProcessed < MAX_FRAMES_PER_LOOP) {
        FrameData* frame = NULL;
        
        if (xQueueReceive(frameQueue, &frame, 0) == pdTRUE) {
          if (frame && frame->data && frame->length > 0) {
            // ส่งเฟรมผ่าน WebSocket (binary)
            webSocket.sendBIN(frame->data, frame->length);
            framesSent++;
            framesProcessed++;
          }
          // Free frame กลับไปยัง pool ทันทีหลังส่ง
          if (frame) {
            framePool.free(frame);
          }
        } else {
          // ไม่มีเฟรมใน queue แล้ว
          break;
        }
      }
      
      // Process WebSocket events อีกครั้งเพื่อให้ส่งข้อมูลจริงๆ
      webSocket.loop();
    } else {
      // ถ้าไม่เชื่อมต่อ ให้ clear queue
      FrameData* frame = NULL;
      while (xQueueReceive(frameQueue, &frame, 0) == pdTRUE) {
        if (frame) framePool.free(frame);
      }
      vTaskDelay(pdMS_TO_TICKS(100));
    }

    // Delay เล็กน้อยเพื่อให้ CPU มีโอกาสทำงาน task อื่น
    // ถ้ามีเฟรมใน queue ให้ delay น้อยลง
    if (wsConnected && uxQueueMessagesWaiting(frameQueue) > 0) {
      vTaskDelay(0);  // ไม่ delay ถ้ามีเฟรมรอ
    } else {
      vTaskDelay(1);
    }
  }
}

/* ===== Appliances (DEPRECATED) ===== */
// Note: Appliance control has been moved to ESP8266 nodemcuBase v1.0
// These functions are kept as stubs for backward compatibility
void setupAppliances() {
  // No-op: Appliances now controlled by ESP8266
  Serial.println("[Appliances] Moved to ESP8266 controller");
}

void setAppliance(const char* name, bool state) {
  // No-op: Forward to ESP8266 if needed
  Serial.printf("[Appliances] Control '%s' -> ESP8266 (not handled here)\n", name);
}

/* ===== MQTT IP Registration ===== */
void registerIPViaMQTT() {
  if (mqttRegistered || !mqtt.connected()) return;
  
  StaticJsonDocument<512> doc;
  doc["type"] = "device_registration";
  doc["device_id"] = DEVICE_ID;
  doc["room"] = ROOM_TYPE;
  doc["ip_address"] = WiFi.localIP().toString();
  doc["websocket_port"] = WEBSOCKET_PORT;
  doc["timestamp"] = millis() / 1000;
  
  String regMsg;
  serializeJson(doc, regMsg);
  
  if (mqtt.publish(MQTT_TOPIC_REGISTRATION, regMsg.c_str())) {
    mqttRegistered = true;
    Serial.printf("[MQTT] IP registered: %s (device: %s, room: %s)\n", 
                  WiFi.localIP().toString().c_str(), DEVICE_ID, ROOM_TYPE);
  } else {
    Serial.println("[MQTT] Failed to publish IP registration");
  }
}

void reconnectMQTT() {
  // ถ้า WebSocket เชื่อมต่ออยู่แล้ว ไม่ต้องใช้ MQTT
  if (wsConnected) return;
  
  // ถ้าเคย register แล้วและ WebSocket ยังไม่หลุด ไม่ต้อง reconnect
  if (mqttRegistered && wsWasConnected) return;
  
  if (mqtt.connected()) {
    // ถ้าเชื่อมต่ออยู่แล้ว แต่ยังไม่ได้ register ให้ register
    if (!mqttRegistered) {
      registerIPViaMQTT();
    }
    return;
  }
  
  if (mqttServerIP.length() == 0) {
    resolveServerIPs();
  }
  
  char id[32];
  snprintf(id, sizeof(id), "%s_%04X", DEVICE_ID, random(0xFFFF));
  
  if (mqtt.connect(id)) {
    Serial.printf("[MQTT] Connected to %s:%d\n", mqttServerIP.c_str(), MQTT_PORT);
    // ส่ง IP registration ทันที
    registerIPViaMQTT();
  } else {
    Serial.printf("[MQTT] Failed to connect to %s:%d\n", mqttServerIP.c_str(), MQTT_PORT);
  }
}

/* ===== Status Reporting via WebSocket ===== */
void sendStatus() {
  if (!wsConnected) return;
  
  StaticJsonDocument<1024> doc;
  doc["type"] = "status";
  doc["device_type"] = "camera";  // Mark as camera-only device
  doc["device_id"] = DEVICE_ID;
  doc["room"] = ROOM_TYPE;
  doc["ip_address"] = WiFi.localIP().toString();
  doc["rssi"] = WiFi.RSSI();
  doc["heap"] = ESP.getFreeHeap();
  doc["frames_sent"] = framesSent;
  doc["frames_dropped"] = framesDropped;
  doc["pool_exhausted"] = poolExhausted;
  doc["ws_connected"] = wsConnected;
  doc["motion_detected"] = motionDetected;
  doc["uptime_seconds"] = millis() / 1000;
  doc["frame_buffers"] = FRAME_BUFFER_COUNT;
  doc["frame_pool_size"] = FRAME_POOL_SIZE;
  
  // Note: Appliance control moved to ESP8266
  // This camera device only streams video
  doc["note"] = "appliances_on_esp8266";
  
  String statusMsg;
  serializeJson(doc, statusMsg);
  webSocket.sendTXT(statusMsg);
}

/* ===== Setup ===== */
void setup() {
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);
  
  Serial.begin(115200);
  delay(500);
  
  pinMode(1, OUTPUT);
  digitalWrite(1, HIGH);
  delay(100);
  
  Serial.println("\n========================================");
  Serial.println("  WheelSense Camera - Multitasking");
  Serial.println("========================================");
  Serial.printf("  Target FPS: %d, Quality: %d, QVGA 320x240\n", TARGET_FPS, JPEG_QUALITY);
  Serial.println("========================================\n");
  
  setupAppliances();
  
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.printf("[WiFi] Connecting to %s", WIFI_SSID);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.printf("\n[WiFi] IP: %s, Gateway: %s, RSSI: %d dBm\n", 
                WiFi.localIP().toString().c_str(), 
                WiFi.gatewayIP().toString().c_str(),
                WiFi.RSSI());
  
  // Resolve server IPs หลังจาก WiFi เชื่อมต่อแล้ว
  resolveServerIPs();
  
  if (!setupCamera()) {
    Serial.println("[Camera] FAILED!");
    delay(2000);
    ESP.restart();
  }
  
  frameQueue = xQueueCreate(FRAME_QUEUE_SIZE, sizeof(FrameData*));
  if (frameQueue == NULL) {
    Serial.println("[Error] Failed to create frame queue!");
    ESP.restart();
  }
  
  if (!framePool.init()) {
    Serial.println("[Error] Frame pool alloc failed!");
    ESP.restart();
  }

  xTaskCreatePinnedToCore(
    cameraTask,
    "CameraTask",
    CAMERA_TASK_STACK_SIZE,
    NULL,
    CAMERA_TASK_PRIORITY,
    NULL,
    CAMERA_TASK_CORE
  );
  
  xTaskCreatePinnedToCore(
    webSocketTask,
    "WebSocketTask",
    WS_TASK_STACK_SIZE,
    NULL,
    WS_TASK_PRIORITY,
    NULL,
    WS_TASK_CORE
  );
  
  // Setup MQTT สำหรับ IP registration
  snprintf(MQTT_TOPIC_REGISTRATION, 64, "WheelSense/%s/registration", ROOM_TYPE);
  mqtt.setServer(mqttServerIP.c_str(), MQTT_PORT);
  
  // เชื่อมต่อ MQTT ครั้งแรกเพื่อส่ง IP
  reconnectMQTT();
  
  // เริ่ม WebSocket
  reconnectWebSocket();
  
  startTime = millis();
  lastFpsTime = startTime;
  lastFramesSent = framesSent;
  
  Serial.println("[System] READY - WebSocket primary, MQTT for IP registration only\n");
}

/* ===== Main Loop (Very Light) ===== */
void loop() {
  unsigned long now = millis();
  
  // จัดการ MQTT เฉพาะตอนที่ WebSocket ยังไม่เชื่อมต่อ
  // หรือตอนที่ WebSocket หลุดแล้ว (เพื่อส่ง IP ใหม่)
  if (!wsConnected) {
    static unsigned long lastMQTTTry = 0;
    if (now - lastMQTTTry > 5000) {  // ลองทุก 5 วินาที
      lastMQTTTry = now;
      reconnectMQTT();
      
      // ถ้า MQTT เชื่อมต่ออยู่ ให้ maintain connection
      if (mqtt.connected()) {
        mqtt.loop();
      }
    }
  } else {
    // ถ้า WebSocket เชื่อมต่ออยู่แล้ว และ MQTT ยังเชื่อมต่ออยู่ ให้ปิด MQTT
    if (mqtt.connected() && mqttRegistered) {
      mqtt.disconnect();
      Serial.println("[MQTT] Disconnected - WebSocket is active");
    }
  }
  
  // ส่ง status ผ่าน WebSocket เป็นระยะๆ
  if (now - lastStatusMs > STATUS_INTERVAL_MS) {
    lastStatusMs = now;
    if (wsConnected) {
      sendStatus();
    }
    
    // Calculate FPS
    unsigned long dt = now - lastFpsTime;
    unsigned long dFrames = framesSent - lastFramesSent;
    float fps = (dt > 0) ? (1000.0f * dFrames / dt) : 0.0f;
    lastFpsTime = now;
    lastFramesSent = framesSent;
    
    Serial.printf("[Stats] Sent: %lu, Dropped: %lu, PoolEx: %lu, FPS: %.1f, WS: %s, MQTT: %s, Heap: %lu\n", 
                  framesSent, framesDropped, poolExhausted, fps, 
                  wsConnected ? "YES" : "NO",
                  mqtt.connected() ? "YES" : "NO",
                  ESP.getFreeHeap());
  }
  
  delay(10);
}
