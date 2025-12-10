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
const char* MQTT_SERVER = "192.168.100.246";
const int MQTT_PORT = 1883;
const char* WEBSOCKET_SERVER = "192.168.100.246";
const int WEBSOCKET_PORT = 8765;

#define DEVICE_ID "TSIM_001"
#define ROOM_TYPE "livingroom"

// ปรับให้เบาลงเพื่อดัน FPS ให้ขึ้น
#define CAMERA_FRAME_SIZE FRAMESIZE_QVGA   // 320x240 แทน VGA
#define JPEG_QUALITY 28                    // เลขมาก = quality ต่ำลง, ไฟล์เล็กลง
#define STREAM_FPS 12                      // ตั้งเป้าสูงนิดนึง ให้ได้จริงแถวๆ 10 FPS
#define FRAME_BUFFER_COUNT 2               // ลด fb ให้ latency น้อยลง
#define FRAME_QUEUE_SIZE 4                 // คิวเล็กๆ กันหน่วง
#define FRAME_INTERVAL_MS (1000 / STREAM_FPS)

#define MQTT_STATUS_INTERVAL_MS 5000

// ปรับขนาด buffer ให้เหมาะกับ QVGA JPEG
#define FRAME_POOL_SIZE 4
#define MAX_FRAME_SIZE 60000               // QVGA JPEG ปกติไม่ควรเกิน 60 KB

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

/* ===== Appliance Pins ===== */
#define LED_LIGHT_PIN    21
#define LED_AIRCON_PIN   46
#define LED_FAN_PIN      47
#define LED_TV_PIN       48

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

char MQTT_TOPIC_STATUS[64];
char MQTT_TOPIC_CONTROL[64];
char MQTT_TOPIC_DETECTION[64];

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

struct {
  bool light = false;
  bool aircon = false;
  bool fan = false;
  bool tv = false;
} appliances;

// Forward declarations
void publishStatus();
void reconnectWebSocket();

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
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  config.grab_mode = CAMERA_GRAB_LATEST;
  
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
  
  Serial.printf("[Camera] QVGA 320x240, Quality: %d, Buffers: %d\n",
                JPEG_QUALITY, FRAME_BUFFER_COUNT);
  return true;
}

/* ===== WebSocket Event Handler ===== */
void webSocketEvent(WStype_t type, uint8_t *payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      wsConnected = false;
      break;
      
    case WStype_CONNECTED: {
      wsConnected = true;
      char welcomeMsg[256];
      snprintf(welcomeMsg, sizeof(welcomeMsg),
               "{\"type\":\"connected\",\"room\":\"%s\",\"device_id\":\"%s\",\"buffers\":%d,\"pool\":%d}",
               ROOM_TYPE, DEVICE_ID, FRAME_BUFFER_COUNT, FRAME_POOL_SIZE);
      webSocket.sendTXT(welcomeMsg);
      break;
    }

    case WStype_TEXT:
    case WStype_BIN:
    case WStype_ERROR:
    default:
      break;
  }
}

/* ===== Camera Capture Task (Core 1) ===== */
void cameraTask(void *parameter) {
  TickType_t lastWakeTime = xTaskGetTickCount();
  const TickType_t frameInterval = pdMS_TO_TICKS(FRAME_INTERVAL_MS);
  
  while (true) {
    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb) {
      vTaskDelay(1);
      continue;
    }
    
    if (wsConnected) {
      FrameData* frame = framePool.allocate(fb->len);
      
      if (frame) {
        memcpy(frame->data, fb->buf, fb->len);
        frame->length = fb->len;
        
        if (xQueueSend(frameQueue, &frame, 0) != pdTRUE) {
          framePool.free(frame);
          framesDropped++;
        }
      } else {
        poolExhausted++;
        framesDropped++;
      }
    }
    
    esp_camera_fb_return(fb);
    vTaskDelayUntil(&lastWakeTime, frameInterval);
  }
}

/* ===== Reconnect WebSocket (ใช้ใน WS task เท่านั้น) ===== */
void reconnectWebSocket() {
  if (wsConnected) return;
  
  unsigned long now = millis();
  if (now - lastReconnectAttempt < 5000) return;
  lastReconnectAttempt = now;
  
  webSocket.begin(WEBSOCKET_SERVER, WEBSOCKET_PORT, "/");
  webSocket.onEvent(webSocketEvent);
}

/* ===== WebSocket Sending Task (Core 0) ===== */
void webSocketTask(void *parameter) {
  while (true) {
    if (!wsConnected) {
      reconnectWebSocket();
    }

    // ดูแล WebSocket ทั้งหมดใน task นี้ตัวเดียว
    webSocket.loop();

    if (wsConnected) {
      FrameData* frame = NULL;
      
      if (xQueueReceive(frameQueue, &frame, pdMS_TO_TICKS(5)) == pdTRUE) {
        if (frame && frame->data && frame->length > 0) {
          webSocket.sendBIN(frame->data, frame->length);
          framesSent++;
        }
        if (frame) {
          framePool.free(frame);
        }
      }
    } else {
      FrameData* frame = NULL;
      while (xQueueReceive(frameQueue, &frame, 0) == pdTRUE) {
        if (frame) framePool.free(frame);
      }
      vTaskDelay(pdMS_TO_TICKS(100));
    }

    vTaskDelay(1);
  }
}

/* ===== Appliances ===== */
void setupAppliances() {
  pinMode(LED_LIGHT_PIN, OUTPUT);
  pinMode(LED_AIRCON_PIN, OUTPUT);
  pinMode(LED_FAN_PIN, OUTPUT);
  pinMode(LED_TV_PIN, OUTPUT);
}

void setAppliance(const char* name, bool state) {
  if (strcmp(name, "light") == 0) { 
    appliances.light = state; 
    digitalWrite(LED_LIGHT_PIN, state); 
  }
  else if (strcmp(name, "aircon") == 0) { 
    appliances.aircon = state; 
    digitalWrite(LED_AIRCON_PIN, state); 
  }
  else if (strcmp(name, "fan") == 0) { 
    appliances.fan = state; 
    digitalWrite(LED_FAN_PIN, state); 
  }
  else if (strcmp(name, "tv") == 0) { 
    appliances.tv = state; 
    digitalWrite(LED_TV_PIN, state); 
  }
}

/* ===== MQTT ===== */
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  StaticJsonDocument<512> doc;
  if (deserializeJson(doc, payload, length)) return;
  
  if (strstr(topic, "/control")) {
    const char* app = doc["appliance"];
    if (app) setAppliance(app, doc["state"] | false);
  } else if (strstr(topic, "/detection")) {
    motionDetected = doc["motion_detected"] | false;
  }
}

void reconnectMQTT() {
  if (mqtt.connected()) return;
  
  char id[32];
  snprintf(id, sizeof(id), "%s_%04X", DEVICE_ID, random(0xFFFF));
  if (mqtt.connect(id)) {
    mqtt.subscribe(MQTT_TOPIC_CONTROL);
    mqtt.subscribe(MQTT_TOPIC_DETECTION);
    publishStatus();
  }
}

void publishStatus() {
  StaticJsonDocument<1024> doc;
  doc["device_id"] = DEVICE_ID;
  doc["room"] = ROOM_TYPE;
  doc["ip_address"] = WiFi.localIP().toString();
  doc["ws_url"] = "ws://" + WiFi.localIP().toString() + ":81";
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
  
  char buf[1024];
  serializeJson(doc, buf);
  mqtt.publish(MQTT_TOPIC_STATUS, buf);
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
  Serial.printf("  Target FPS: %d, Quality: %d, QVGA 320x240\n", STREAM_FPS, JPEG_QUALITY);
  Serial.println("========================================\n");
  
  setupAppliances();
  
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.printf("[WiFi] Connecting to %s", WIFI_SSID);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.printf("\n[WiFi] IP: %s, RSSI: %d dBm\n", 
                WiFi.localIP().toString().c_str(), WiFi.RSSI());
  
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
  
  // เริ่ม WebSocket ครั้งแรก
  reconnectWebSocket();
  
  snprintf(MQTT_TOPIC_STATUS, 64, "WheelSense/%s/status", ROOM_TYPE);
  snprintf(MQTT_TOPIC_CONTROL, 64, "WheelSense/%s/control", ROOM_TYPE);
  snprintf(MQTT_TOPIC_DETECTION, 64, "WheelSense/%s/detection", ROOM_TYPE);
  mqtt.setServer(MQTT_SERVER, MQTT_PORT);
  mqtt.setCallback(mqttCallback);
  
  startTime = millis();
  lastFpsTime = startTime;
  lastFramesSent = framesSent;
  
  Serial.println("[System] READY - Tasks started\n");
}

/* ===== Main Loop (Very Light) ===== */
void loop() {
  unsigned long now = millis();
  
  // ไม่เรียก webSocket.loop() ที่นี่แล้ว ให้ WS อยู่ใน webSocketTask อย่างเดียว

  if (!mqtt.connected()) {
    static unsigned long lastTry = 0;
    if (now - lastTry > 5000) {
      lastTry = now;
      reconnectMQTT();
    }
  } else {
    mqtt.loop();
  }
  
  if (now - lastStatusMs > MQTT_STATUS_INTERVAL_MS) {
    lastStatusMs = now;
    if (mqtt.connected()) {
      publishStatus();
    }
    
    unsigned long dt = now - lastFpsTime;
    unsigned long dFrames = framesSent - lastFramesSent;
    float fps = (dt > 0) ? (1000.0f * dFrames / dt) : 0.0f;
    lastFpsTime = now;
    lastFramesSent = framesSent;
    
    Serial.printf("[Stats] Sent: %lu, Dropped: %lu, PoolEx: %lu, FPS: %.1f, WS: %s, Heap: %lu\n", 
                  framesSent, framesDropped, poolExhausted, fps, 
                  wsConnected ? "YES" : "NO", ESP.getFreeHeap());
  }
  
  delay(10);
}
