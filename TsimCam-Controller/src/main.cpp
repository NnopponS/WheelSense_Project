/*
 * TsimCam Controller - Custom WiFi Portal + UDP Auto-Discovery
 * 
 * Features:
 * - Custom WiFi Portal (no WiFiManager library)
 * - Initial Setup Portal (only during first boot or when WiFi not configured)
 * - UDP Broadcast Auto-Discovery for server
 * - 24 FPS Video Streaming via WebSocket
 */

#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <ESPmDNS.h>
#include <Preferences.h>
#include <WiFiUdp.h>
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

// ===== BOOT Button Pin =====
#define BOOT_BUTTON_PIN 0  // GPIO0 is BOOT button on most ESP32 (only used during startup)

// ===== Configuration Storage =====
Preferences preferences;

// ===== Configurable Settings =====
String wifiSSID = "";
String wifiPassword = "";
String deviceId = "TSIM_001";
String roomType = "livingroom";
String serverIP = "";  // Empty = use UDP auto-discovery

// ===== Network Configuration =====
const int UDP_DISCOVERY_PORT = 5555;
const int WEBSOCKET_PORT = 8765;
const int MQTT_PORT = 1883;
const int STATUS_INTERVAL_MS = 5000;
const int WS_HEARTBEAT_INTERVAL = 15000;  // Send ping every 15 seconds
const int CONFIG_PORTAL_TIMEOUT = 300000;  // 5 minutes

// ===== Camera Configuration =====
#define CAMERA_FRAME_SIZE FRAMESIZE_VGA
#define JPEG_QUALITY 15
#define TARGET_FPS 15
#define FRAME_INTERVAL_MS (1000 / TARGET_FPS)
#define FRAME_BUFFER_COUNT 4
#define FRAME_QUEUE_SIZE 15
#define FRAME_POOL_SIZE 15
#define MAX_FRAME_SIZE 15000

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

/* ===== FreeRTOS Configuration ===== */
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

/* ===== Frame Pool ===== */
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
      if (!buffers[i]) buffers[i] = (uint8_t*)heap_caps_malloc(MAX_FRAME_SIZE, MALLOC_CAP_8BIT);
      if (!buffers[i]) return false;
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

#define ORIENTATION_OPTION_COUNT 4

enum OrientationMode : uint8_t {
  ORIENTATION_0 = 0,
  ORIENTATION_90 = 1,
  ORIENTATION_180 = 2,
  ORIENTATION_270 = 3
};

const char* const ORIENTATION_LABELS[ORIENTATION_OPTION_COUNT] = {
  "0° (Normal)",
  "90° (Left)",
  "180° (Inverted)",
  "270° (Right)"
};

/* ===== Globals ===== */
WiFiClient espClient;
PubSubClient mqtt(espClient);
WebSocketsClient webSocket;
WebServer server(80);
DNSServer dnsServer;
WiFiUDP udp;

// State
volatile bool configMode = false;
bool wifiConnected = false;
bool serverDiscovered = false;
String discoveredServerIP = "";
OrientationMode orientationMode = ORIENTATION_0;
int previewRotation = 0;  // Preview rotation in degrees (0, 90, 180, 270)

// Server IPs
String mqttServerIP;
String websocketServerIP;

// MQTT
char MQTT_TOPIC_REGISTRATION[64];
bool mqttRegistered = false;
bool wsWasConnected = false;

// Frame handling
QueueHandle_t frameQueue = NULL;
FramePool framePool;

volatile bool wsConnected = false;
volatile unsigned long framesSent = 0;
volatile unsigned long framesDropped = 0;
volatile unsigned long poolExhausted = 0;

unsigned long lastStatusMs = 0;
unsigned long lastReconnectAttempt = 0;
unsigned long startTime = 0;
unsigned long lastFpsTime = 0;
unsigned long lastFramesSent = 0;
unsigned long lastDiscoveryAttempt = 0;
unsigned long configModeStartTime = 0;
unsigned long lastHeartbeatTime = 0;  // WebSocket heartbeat timer

bool motionDetected = false;

// Forward declarations
void sendStatus();
void reconnectWebSocket();
void handleWebSocketMessage(String message);
void registerIPViaMQTT();
void reconnectMQTT();
void loadConfig();
void saveConfig();
void startConfigPortal();
void stopConfigPortal();
void startConfigPortal();
void stopConfigPortal();
bool discoverServer();
void mqttCallback(char* topic, byte* payload, unsigned int length);
void handlePreviewFrame();
String buildOrientationOptions();
void applySensorOrientation();
void rotatePreview(int degrees);
void handleRoot();
void handleRescan();
void handleRotate();
void handleSaveConfig();

/* ===== Load Configuration =====  */
void loadConfig() {
  preferences.begin("wheelsense", true);
  wifiSSID = preferences.getString("ssid", "");
  wifiPassword = preferences.getString("password", "");
  deviceId = preferences.getString("deviceId", "TSIM_001");
  roomType = preferences.getString("roomType", "livingroom");
  serverIP = preferences.getString("serverIP", "");
  orientationMode = static_cast<OrientationMode>(preferences.getUChar("orientation", ORIENTATION_0));
  preferences.end();
  
  Serial.printf("[Config] SSID=%s, Device=%s, Room=%s\n", 
                wifiSSID.c_str(), deviceId.c_str(), roomType.c_str());
}

/* ===== Save Configuration ===== */
void saveConfig() {
  preferences.begin("wheelsense", false);
  preferences.putString("ssid", wifiSSID);
  preferences.putString("password", wifiPassword);
  preferences.putString("deviceId", deviceId);
  preferences.putString("roomType", roomType);
  preferences.putString("serverIP", serverIP);
  preferences.putUChar("orientation", static_cast<uint8_t>(orientationMode));
  preferences.end();
  Serial.println("[Config] Saved!");
}

/* ===== Scan WiFi Networks ===== */
String scanNetworks() {
  int n = WiFi.scanNetworks();
  String options = "";
  for (int i = 0; i < n; i++) {
    options += "<option value='" + WiFi.SSID(i) + "'";
    if (WiFi.SSID(i) == wifiSSID) options += " selected";
    options += ">" + WiFi.SSID(i) + " (" + String(WiFi.RSSI(i)) + " dBm)</option>";
  }
  if (n == 0) options = "<option value=''>No networks found</option>";
  return options;
}

String buildOrientationOptions() {
  String options = "";
  for (int i = 0; i < ORIENTATION_OPTION_COUNT; ++i) {
    options += "<option value='" + String(i) + "'";
    if ((uint8_t)orientationMode == i) options += " selected";
    options += ">" + String(ORIENTATION_LABELS[i]) + "</option>";
  }
  return options;
}

void applySensorOrientation() {
  sensor_t *s = esp_camera_sensor_get();
  if (!s) return;
  
  bool mirrorHorizontal = false;
  bool flipVertical = false;
  
  switch (orientationMode) {
    case ORIENTATION_0:
    case ORIENTATION_90: // 90 treated as 0 in hardware (software must handle rotation)
      mirrorHorizontal = false;
      flipVertical = false;
      break;
    case ORIENTATION_180:
    case ORIENTATION_270: // 270 treated as 180 in hardware (software must handle rotation)
      mirrorHorizontal = true; 
      flipVertical = true;
      break;
  }
  
  s->set_hmirror(s, mirrorHorizontal);
  s->set_vflip(s, flipVertical);
}

void rotatePreview(int degrees) {
  // Cycle rotation: 0 -> 90 -> 180 -> 270 -> 0
  int current = static_cast<int>(orientationMode);
  int next = (current + 1) % 4;
  
  // If specific degrees provided (legacy support or direct set)
  if (degrees != -1) {
    // allow setting directly if needed, but primarily we use the cycle
  }
  
  orientationMode = static_cast<OrientationMode>(next);
  applySensorOrientation();
  saveConfig();
  Serial.printf("[Preview] Rotated to mode: %d (%s)\n", orientationMode, ORIENTATION_LABELS[orientationMode]);
}

/* ===== Config Portal HTML ===== */
String getConfigPageHTML() {
  String networks = scanNetworks();
  String orientationOptions = buildOrientationOptions();
  
  String html = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WheelSense Camera Setup</title>
  <style>
    * { box-sizing: border-box; font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; }
    body { 
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh; padding: 20px;
      display: flex; justify-content: center; align-items: center;
    }
    .container { 
      background: white; border-radius: 20px;
      padding: 30px; max-width: 400px; width: 100%;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    h1 { color: #333; text-align: center; margin-bottom: 5px; font-size: 24px; }
    .logo { text-align: center; font-size: 48px; }
    .subtitle { text-align: center; color: #666; margin-bottom: 25px; font-size: 14px; }
    label { display: block; color: #333; font-weight: 600; margin-bottom: 5px; margin-top: 15px; }
    input, select { 
      width: 100%; padding: 12px; border: 2px solid #e0e0e0;
      border-radius: 10px; font-size: 16px;
    }
    input:focus, select:focus { border-color: #667eea; outline: none; }
    .btn { 
      width: 100%; padding: 15px; border: none; border-radius: 10px;
      font-size: 16px; font-weight: 600; cursor: pointer;
      margin-top: 20px; transition: all 0.3s;
    }
    .btn-primary { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
    .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 5px 20px rgba(102,126,234,0.4); }
    .btn-secondary { background: #e0e0e0; color: #333; margin-top: 10px; }
    .info { background: #e3f2fd; padding: 12px; border-radius: 8px; margin-top: 20px; font-size: 13px; }
    .info b { color: #1565c0; }
    .section { border-top: 1px solid #eee; padding-top: 15px; margin-top: 15px; }
    .section-title { font-size: 14px; color: #888; margin-bottom: 10px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">📷</div>
    <h1>WheelSense Camera</h1>
    <p class="subtitle">Configuration Portal</p>
    
    <form action="/save" method="POST">
      <label>📶 WiFi Network</label>
      <select name="ssid" required>
        )rawliteral" + networks + R"rawliteral(
      </select>
      
      <label>🔑 WiFi Password</label>
      <input type="password" name="password" value=")rawliteral" + wifiPassword + R"rawliteral(" placeholder="Enter password">
      
      <div class="section">
        <div class="section-title">DEVICE SETTINGS</div>
        
        <label>🏷️ Device ID</label>
        <input type="text" name="deviceId" value=")rawliteral" + deviceId + R"rawliteral(" required>
        
        <label>🏠 Room</label>
        <select name="room">
          <option value="livingroom" )rawliteral" + (roomType == "livingroom" ? "selected" : "") + R"rawliteral(>Living Room</option>
          <option value="bedroom" )rawliteral" + (roomType == "bedroom" ? "selected" : "") + R"rawliteral(>Bedroom</option>
          <option value="bathroom" )rawliteral" + (roomType == "bathroom" ? "selected" : "") + R"rawliteral(>Bathroom</option>
          <option value="kitchen" )rawliteral" + (roomType == "kitchen" ? "selected" : "") + R"rawliteral(>Kitchen</option>
        </select>
        
        <label>Video Orientation</label>
        <select name="orientation">)rawliteral" + orientationOptions + R"rawliteral(</select>
        
        <label>🖥️ Server IP (leave empty for auto-discovery)</label>
        <input type="text" name="serverIP" value=")rawliteral" + serverIP + R"rawliteral(" placeholder="Auto-discover on LAN">
      </div>
      
      <button type="submit" class="btn btn-primary">💾 Save & Connect</button>
    </form>
    
    <button onclick="location.href='/rescan'" class="btn btn-secondary">🔄 Rescan WiFi</button>
    
    <div class="section">
      <div class="section-title">CAMERA PREVIEW</div>
      <div style="background:#000;border-radius:12px;overflow:hidden;display:flex;justify-content:center;align-items:center;min-height:240px;">
        <img id="previewImage" src="/preview.jpg?t=0" style="width:100%;height:auto;display:block;max-height:260px;object-fit:contain;transition:transform 0.3s ease;">
      </div>
      <div style="margin-top:10px;display:flex;gap:5px;justify-content:center;">
        <button type="button" onclick="rotateCamera()" class="btn-rotate" style="padding:10px 20px;border:2px solid #667eea;background:white;border-radius:8px;cursor:pointer;font-size:14px;font-weight:bold;">↻ Rotate 90°</button>
      </div>
      <p style="margin-top:8px;font-size:12px;color:#666;text-align:center;">Current: <span id="rotLabel">)rawliteral" + String(ORIENTATION_LABELS[orientationMode]) + R"rawliteral(</span></p>
    </div>

    <div class="info">
      <b>Tip:</b> Leave Server IP empty to auto-discover the WheelSense server on your network.
    </div>
  </div>
  <script>
    let currentMode = )rawliteral" + String((int)orientationMode) + R"rawliteral(;
    
    function updatePreviewStyle() {
       const img = document.getElementById('previewImage');
       if(!img) return;
       // 0=0, 1=90, 2=180, 3=270
       // Use CSS to rotate
       let deg = currentMode * 90;
       img.style.transform = 'rotate(' + deg + 'deg)';
       // Adjust spacing if 90/270 (portrait) to fit better?
    }
  
    (function(){
      const img = document.getElementById('previewImage');
      updatePreviewStyle(); 
      setInterval(function(){
        if(!img) return;
        img.src = '/preview.jpg?t=' + Date.now();
      }, 2000);
    })();
    
    const LABELS = ["0° (Normal)", "90° (Left)", "180° (Inverted)", "270° (Right)"];
    
    function rotateCamera() {
      fetch('/rotate?deg=90', {method: 'GET'}) // deg=90 signals "step"
        .then(() => {
          // Update local state immediately for UI responsiveness
          currentMode = (currentMode + 1) % 4;
          updatePreviewStyle();
          document.getElementById('rotLabel').innerText = LABELS[currentMode];
          
          // Refresh preview
          const img = document.getElementById('previewImage');
          if(img) img.src = '/preview.jpg?t=' + Date.now();
        })
        .catch(err => console.error('Rotation failed:', err));
    }
  </script>
</body>
</html>
)rawliteral";
  return html;
}

/* ===== Handle Save Config ===== */
void handleSaveConfig() {
  wifiSSID = server.arg("ssid");
  wifiPassword = server.arg("password");
  deviceId = server.arg("deviceId");
  roomType = server.arg("room");
  serverIP = server.arg("serverIP");
  String orientationArg = server.arg("orientation");
  if (orientationArg.length() > 0) {
    int newMode = orientationArg.toInt();
    newMode = constrain(newMode, 0, ORIENTATION_OPTION_COUNT - 1);
    orientationMode = static_cast<OrientationMode>(newMode);
    applySensorOrientation();
  }
  
  saveConfig();
  
  String html = R"(
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="5;url=/">
  <title>Saved!</title>
  <style>
    body { 
      background: linear-gradient(135deg, #4caf50 0%, #2e7d32 100%);
      min-height: 100vh; margin: 0; display: flex;
      justify-content: center; align-items: center;
      font-family: 'Segoe UI', sans-serif; color: white; text-align: center;
    }
    h1 { font-size: 60px; margin: 0; }
  </style>
</head>
<body>
  <div>
    <h1>✅</h1>
    <h2>Configuration Saved!</h2>
    <p>Connecting to WiFi...</p>
    <p style="font-size:14px;opacity:0.8;">Device will restart in 5 seconds</p>
  </div>
  <script>
    (function(){
      const img = document.getElementById('previewImage');
      setInterval(function(){
        if(!img) return;
        img.src = '/preview.jpg?t=' + Date.now();
      }, 2000);
    })();
  </script>
</body>
</html>
)";
  server.send(200, "text/html", html);
  delay(2000);
  ESP.restart();
}

/* ===== Config Preview Frame ===== */
void handlePreviewFrame() {
  if (!configMode) {
    server.send(409, "text/plain", "Preview available only in config mode");
    return;
  }

  // Apply current orientation before capture
  applySensorOrientation();

  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) {
    server.send(503, "text/plain", "Camera busy");
    return;
  }

  WiFiClient client = server.client();
  if (!client) {
    esp_camera_fb_return(fb);
    return;
  }

  client.print("HTTP/1.1 200 OK\r\n");
  client.print("Content-Type: image/jpeg\r\n");
  client.print("Content-Length: ");
  client.print(fb->len);
  client.print("\r\nCache-Control: no-cache, no-store, must-revalidate\r\n");
  client.print("Pragma: no-cache\r\nExpires: 0\r\n\r\n");
  client.write(fb->buf, fb->len);
  esp_camera_fb_return(fb);
}


/* ===== Handle Rotate ===== */
void handleRotate() {
  if (!configMode) {
    server.send(403, "text/plain", "Only available in config mode");
    return;
  }
  String degParam = server.arg("deg");
  if (degParam.length() > 0) {
    int degrees = degParam.toInt();
    rotatePreview(degrees);
    server.send(200, "text/plain", "OK");
  } else {
    server.send(400, "text/plain", "Missing deg parameter");
  }
}

/* ===== Handle Rescan ===== */
void handleRescan() {
  if (!configMode) {
    server.send(403, "text/plain", "Only available in config mode");
    return;
  }
  WiFi.scanNetworks(true);
  delay(3000);
  server.sendHeader("Location", "/");
  server.send(302);
}

/* ===== Handle 404 / Captive Portal ===== */
void handleNotFound() {
  if (configMode) {
    // If in config mode, redirect everything to root (Captive Portal)
    server.sendHeader("Location", "http://" + WiFi.softAPIP().toString());
    server.send(302);
  } else {
    server.send(404, "text/plain", "Not Found");
  }
}

/* ===== Start Config Portal ===== */
void startConfigPortal() {
  if (configMode) return; // Already in config mode
  
  configMode = true;
  configModeStartTime = millis();
  
  // Clear frame queue
  if (frameQueue != NULL) {
    FrameData* pending = nullptr;
    while (xQueueReceive(frameQueue, &pending, 0) == pdTRUE) {
      if (pending) framePool.free(pending);
    }
  }
  
  Serial.println("\n[Config] Starting Config Portal...");
  
  // Stop existing server and WiFi
  server.stop();
  WiFi.disconnect(true);
  delay(100);
  
  // Start AP mode
  WiFi.mode(WIFI_AP);
  String apName = "WheelSense-" + deviceId;
  WiFi.softAP(apName.c_str(), "12345678");
  delay(100);
  
  IPAddress apIP = WiFi.softAPIP();
  Serial.printf("[Config] AP Started: %s\n", apName.c_str());
  Serial.printf("[Config] Open: http://%s\n", apIP.toString().c_str());
  
  // Start DNS for Captive Portal
  dnsServer.start(53, "*", apIP);
  
  // Re-register routes for Config Mode (server was stopped)
  server.on("/", HTTP_GET, handleRoot);
  server.on("/save", HTTP_POST, handleSaveConfig);
  server.on("/rescan", HTTP_GET, handleRescan);
  server.on("/preview.jpg", HTTP_GET, handlePreviewFrame);
  server.on("/rotate", HTTP_GET, handleRotate);
  server.on("/api/status", HTTP_GET, []() {
    StaticJsonDocument<512> doc;
    doc["device_id"] = deviceId;
    doc["room"] = roomType;
    doc["ip"] = WiFi.softAPIP().toString();
    doc["config_mode"] = true;
    String response;
    serializeJson(doc, response);
    server.send(200, "application/json", response);
  });
  server.onNotFound([]() {
    // Captive Portal: redirect all requests to root
    server.sendHeader("Location", "http://" + WiFi.softAPIP().toString());
    server.send(302);
  });
  
  // Start Web Server
  server.begin();
  Serial.println("[Config] Web server started");
}

/* ===== Stop Config Portal ===== */
void stopConfigPortal() {
  if (!configMode) return;
  configMode = false;
  dnsServer.stop();
  WiFi.softAPdisconnect(true);
  Serial.println("[Config] Portal stopped");
}

/* ===== UDP Server Discovery ===== */
bool discoverServer() {
  if (!serverIP.isEmpty()) {
    discoveredServerIP = serverIP;
    serverDiscovered = true;
    Serial.printf("[Discovery] Using configured server: %s\n", serverIP.c_str());
    return true;
  }
  
  Serial.println("[Discovery] Broadcasting to find server...");
  
  // Send broadcast
  udp.beginPacket(IPAddress(255, 255, 255, 255), UDP_DISCOVERY_PORT);
  udp.print("WHEELSENSE_DISCOVER");
  udp.endPacket();
  
  // Wait for response
  unsigned long startWait = millis();
  while (millis() - startWait < 3000) {
    int packetSize = udp.parsePacket();
    if (packetSize > 0) {
      char buffer[256];
      int len = udp.read(buffer, 255);
      buffer[len] = 0;
      
      StaticJsonDocument<256> doc;
      if (deserializeJson(doc, buffer) == DeserializationError::Ok) {
        if (doc["type"] == "WHEELSENSE_SERVER") {
          discoveredServerIP = doc["ip"].as<String>();
          serverDiscovered = true;
          Serial.printf("[Discovery] Found server at: %s\n", discoveredServerIP.c_str());
          return true;
        }
      }
    }
    delay(100);
  }
  
  Serial.println("[Discovery] No server found via UDP");
  
  // FALLBACK 1: Try Hardcoded Host IP (User's PC)
  // No fallback IP - rely on discovery or config
  serverDiscovered = false;
  return false;

  // FALLBACK 2: Gateway (Commented out for now as it's wrong in this setup)
  // discoveredServerIP = WiFi.gatewayIP().toString();
  // return false;
}

/* ===== Connect to WiFi ===== */
bool connectToWiFi() {
  if (wifiSSID.isEmpty()) {
    Serial.println("[WiFi] No SSID configured");
    return false;
  }
  
  Serial.printf("[WiFi] Connecting to %s", wifiSSID.c_str());
  WiFi.mode(WIFI_STA);
  WiFi.begin(wifiSSID.c_str(), wifiPassword.c_str());
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    Serial.printf("\n[WiFi] Connected! IP: %s\n", WiFi.localIP().toString().c_str());
    return true;
  }
  
  Serial.println("\n[WiFi] Connection failed!");
  return false;
}

/* ===== Setup Status Web Server ===== */
/* ===== Get Status Page HTML ===== */
String getStatusPageHTML() {
  String html = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="10">
  <title>WheelSense Camera Status</title>
  <style>
    * { box-sizing: border-box; font-family: 'Segoe UI', Arial; }
    body { 
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      min-height: 100vh; margin: 0; padding: 20px;
      display: flex; justify-content: center; align-items: center;
    }
    .container { 
      background: white; border-radius: 20px;
      padding: 30px; max-width: 400px; width: 100%;
    }
    .logo { text-align: center; font-size: 48px; }
    h1 { text-align: center; color: #333; margin: 10px 0; }
    .info { background: #f5f5f5; padding: 15px; border-radius: 10px; margin: 10px 0; }
    .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
    .row:last-child { border: none; }
    .label { font-weight: 600; color: #555; }
    .value { color: #333; }
    .online { color: #4caf50; }
    .offline { color: #f44336; }
    .btn { 
      width: 100%; padding: 15px; border: none; border-radius: 10px;
      font-size: 16px; cursor: pointer; margin-top: 15px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">📷</div>
    <h1>)rawliteral" + deviceId + R"rawliteral(</h1>
    
    <div class="info">
      <div class="row"><span class="label">Room</span><span class="value">)rawliteral" + roomType + R"rawliteral(</span></div>
      <div class="row"><span class="label">IP Address</span><span class="value">)rawliteral" + WiFi.localIP().toString() + R"rawliteral(</span></div>
      <div class="row"><span class="label">WiFi Signal</span><span class="value">)rawliteral" + String(WiFi.RSSI()) + R"rawliteral( dBm</span></div>
      <div class="row"><span class="label">Server</span><span class="value">)rawliteral" + discoveredServerIP + R"rawliteral(</span></div>
      <div class="row"><span class="label">Backend</span><span class="value )rawliteral" + String(wsConnected ? "online" : "offline") + R"rawliteral(">)rawliteral" + String(wsConnected ? "✅ Connected" : "❌ Disconnected") + R"rawliteral(</span></div>
      <div class="row"><span class="label">Frames Sent</span><span class="value">)rawliteral" + String(framesSent) + R"rawliteral(</span></div>
      <div class="row"><span class="label">Uptime</span><span class="value">)rawliteral" + String(millis()/1000) + R"rawliteral( sec</span></div>
    </div>
    
  </div>
  <script>
    (function(){
      const img = document.getElementById('previewImage');
      setInterval(function(){
        if(!img) return;
        img.src = '/preview.jpg?t=' + Date.now();
      }, 2000);
    })();
  </script>
</body>
</html>
)rawliteral";
  return html;
}

/* ===== Handle Root (Unified) ===== */
void handleRoot() {
  if (configMode) {
    server.send(200, "text/html", getConfigPageHTML());
  } else {
    server.send(200, "text/html", getStatusPageHTML());
  }
}

/* ===== Register Web Routes (One-time) ===== */
void registerWebRoutes() {
  // 1. Root Handler (Switch based on configMode)
  server.on("/", HTTP_GET, handleRoot);
  
  // 2. Config Actions
  server.on("/save", HTTP_POST, handleSaveConfig);
  server.on("/rescan", HTTP_GET, handleRescan);
  server.on("/preview.jpg", HTTP_GET, handlePreviewFrame);
  server.on("/rotate", HTTP_GET, handleRotate);
  
  // 3. API Status
  server.on("/api/status", HTTP_GET, []() {
    StaticJsonDocument<512> doc;
    doc["device_id"] = deviceId;
    doc["room"] = roomType;
    doc["ip"] = WiFi.localIP().toString();
    doc["rssi"] = WiFi.RSSI();
    doc["ws_connected"] = wsConnected;
    doc["frames_sent"] = framesSent;
    doc["uptime"] = millis() / 1000;
    
    String response;
    serializeJson(doc, response);
    server.send(200, "application/json", response);
  });
  
  // Endpoint to trigger config mode from external (e.g., yolo_test_app.py)
  server.on("/config", HTTP_POST, []() {
    server.send(200, "text/html", "<html><body><h1>Entering Config Mode...</h1><p>Device will restart in config mode.</p></body></html>");
    delay(500);
    startConfigPortal();
  });
  
  // Captive portal redirect
  server.onNotFound([]() {
    server.sendHeader("Location", "http://" + WiFi.softAPIP().toString());
    server.send(302);
  });
  
  Serial.println("[System] Web Routes registered");
}

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
  applySensorOrientation();
  
  return true;
}

/* ===== WebSocket Event Handler ===== */
void webSocketEvent(WStype_t type, uint8_t *payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      wsConnected = false;
      Serial.println("[WebSocket] Disconnected");
      mqttRegistered = false;
      break;
      
    case WStype_CONNECTED: {
      wsConnected = true;
      wsWasConnected = true;
      Serial.printf("[WebSocket] Connected to %s\n", discoveredServerIP.c_str());
      
      StaticJsonDocument<256> doc;
      doc["type"] = "connected";
      doc["device_id"] = deviceId;
      doc["room"] = roomType;
      doc["device_type"] = "camera";
      doc["ip"] = WiFi.localIP().toString();
      
      String msg;
      serializeJson(doc, msg);
      webSocket.sendTXT(msg);
      sendStatus();
      break;
    }

    case WStype_TEXT: {
      handleWebSocketMessage(String((char*)payload));
      break;
    }
    
    default:
      break;
  }
}

void handleWebSocketMessage(String message) {
  StaticJsonDocument<512> doc;
  if (deserializeJson(doc, message)) return;
  
  const char* msgType = doc["type"];
  if (msgType && strcmp(msgType, "ping") == 0) {
    webSocket.sendTXT("{\"type\":\"pong\"}");
  }
}

/* ===== Camera Capture Task ===== */
void cameraTask(void *parameter) {
  TickType_t lastWakeTime = xTaskGetTickCount();
  const TickType_t frameInterval = pdMS_TO_TICKS(FRAME_INTERVAL_MS);
  
  while (true) {
    if (configMode) {
      vTaskDelay(pdMS_TO_TICKS(100));
      continue;
    }
    
    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb) {
      static unsigned long lastCamWarn = 0;
      if (millis() - lastCamWarn > 5000) {
        lastCamWarn = millis();
        Serial.println("[Camera] Failed to get frame buffer!");
      }
      vTaskDelay(1);
      continue;
    }
    
    if (wsConnected && fb->len <= MAX_FRAME_SIZE) {
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

/* ===== WebSocket Sending Task ===== */
void webSocketTask(void *parameter) {
  while (true) {
    if (configMode) {
      vTaskDelay(pdMS_TO_TICKS(100));
      continue;
    }
    
    webSocket.loop();

    if (wsConnected) {
      int count = 0;
      while (count < 5) {
        FrameData* frame = NULL;
        if (xQueueReceive(frameQueue, &frame, 0) == pdTRUE) {
          if (frame && frame->data && frame->length > 0) {
            webSocket.sendBIN(frame->data, frame->length);
            framesSent++;
            count++;
          }
          if (frame) framePool.free(frame);
        } else break;
      }
      webSocket.loop();
      // Note: Library heartbeat enabled in reconnectWebSocket() handles keep-alive
    } else {
      FrameData* frame;
      while (xQueueReceive(frameQueue, &frame, 0) == pdTRUE) {
        if (frame) framePool.free(frame);
      }
      vTaskDelay(pdMS_TO_TICKS(100));
    }

    vTaskDelay(wsConnected && uxQueueMessagesWaiting(frameQueue) > 0 ? 0 : 1);
  }
}

/* ===== Reconnect WebSocket ===== */
void reconnectWebSocket() {
  if (wsConnected || configMode) return;
  
  unsigned long now = millis();
  if (now - lastReconnectAttempt < 5000) return;
  lastReconnectAttempt = now;
  
  // Try discovery if not found
  if (!serverDiscovered || discoveredServerIP.isEmpty()) {
    discoverServer();
  }
  
  if (!discoveredServerIP.isEmpty()) {
    Serial.printf("[WebSocket] Connecting to %s:%d\n", discoveredServerIP.c_str(), WEBSOCKET_PORT);
    webSocket.begin(discoveredServerIP.c_str(), WEBSOCKET_PORT, "/");
    webSocket.onEvent(webSocketEvent);
    webSocket.setReconnectInterval(3000);  // Auto-reconnect every 3s if disconnected
    webSocket.enableHeartbeat(10000, 3000, 2);  // Ping every 10s, timeout 3s, 2 retries
  }
}

/* ===== MQTT Registration ===== */
void registerIPViaMQTT() {
  if (mqttRegistered || !mqtt.connected()) return;
  
  StaticJsonDocument<512> doc;
  doc["type"] = "device_registration";
  doc["device_id"] = deviceId;
  doc["room"] = roomType;
  doc["device_type"] = "camera";
  doc["ip_address"] = WiFi.localIP().toString();
  
  String msg;
  serializeJson(doc, msg);
  
  if (mqtt.publish(MQTT_TOPIC_REGISTRATION, msg.c_str())) {
    mqttRegistered = true;
    Serial.printf("[MQTT] Registered\n");
  }
}

/* ===== MQTT Callback ===== */
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  char msg[length + 1];
  memcpy(msg, payload, length);
  msg[length] = '\0';
  
  Serial.printf("[MQTT] Message on %s: %s\n", topic, msg);
  
  StaticJsonDocument<512> doc;
  DeserializationError error = deserializeJson(doc, msg);
  
  if (error) {
    Serial.print("[MQTT] JSON parse failed: ");
    Serial.println(error.c_str());
    return;
  }
  
}

void reconnectMQTT() {
  if (wsConnected || configMode) return; // Allow reconnecting if not in config mode
  
  // Update server if discovered changed
  if (discoveredServerIP.length() > 0 && mqttServerIP != discoveredServerIP) {
      mqttServerIP = discoveredServerIP;
      mqtt.setServer(mqttServerIP.c_str(), MQTT_PORT);
      mqtt.setCallback(mqttCallback);
  }

  if (mqtt.connected()) {
    if (!mqttRegistered) registerIPViaMQTT();
    mqtt.loop();
    return;
  }
  
  char id[32];
  snprintf(id, sizeof(id), "%s_%04X", deviceId.c_str(), random(0xFFFF));
  
  if (mqtt.connect(id)) {
    Serial.println("[MQTT] Connected");
    
    // Subscribe to control topics
    char topic[64];
    // Specific device control
    snprintf(topic, 64, "WheelSense/%s/control", deviceId.c_str());
    mqtt.subscribe(topic);
    Serial.printf("[MQTT] Subscribed to %s\n", topic);
    
    // Room control
    snprintf(topic, 64, "WheelSense/%s/control", roomType.c_str());
    mqtt.subscribe(topic);
    Serial.printf("[MQTT] Subscribed to %s\n", topic);
    
    registerIPViaMQTT();
  }
}

/* ===== Status Reporting ===== */
void sendStatus() {
  if (!wsConnected) return;
  
  StaticJsonDocument<1024> doc;
  doc["type"] = "status";
  doc["device_type"] = "camera";
  doc["device_id"] = deviceId;
  doc["room"] = roomType;
  doc["ip_address"] = WiFi.localIP().toString();
  doc["rssi"] = WiFi.RSSI();
  doc["heap"] = ESP.getFreeHeap();
  doc["frames_sent"] = framesSent;
  doc["frames_dropped"] = framesDropped;
  doc["ws_connected"] = wsConnected;
  doc["uptime_seconds"] = millis() / 1000;
  doc["orientation_mode"] = static_cast<int>(orientationMode);
  doc["target_fps"] = TARGET_FPS;
  
  String msg;
  serializeJson(doc, msg);
  webSocket.sendTXT(msg);
}

/* ===== Setup ===== */
void setup() {
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);
  
  Serial.begin(115200);
  delay(500);
  
  pinMode(1, OUTPUT);
  digitalWrite(1, HIGH);
  
  Serial.println("\n========================================");
  Serial.println("  WheelSense Camera");
  Serial.println("========================================\n");
  
  loadConfig();
  
  // Initialize Web Server Routes (Dynamic handling based on configMode)
  // Don't start server.begin() yet - wait for WiFi
  registerWebRoutes();
  
  if (!setupCamera()) {
    Serial.println("[Camera] FAILED!");
    delay(2000);
    ESP.restart();
  }
  
  // Check if BOOT button is pressed during startup
  if (digitalRead(BOOT_BUTTON_PIN) == LOW) {
    Serial.println("[Boot] BOOT button pressed - entering config mode");
    startConfigPortal();
    return;
  }
  
  // Try to connect to WiFi
  if (!connectToWiFi()) {
    Serial.println("[Boot] No WiFi - entering config mode");
    startConfigPortal();
    return;
  }
  
  // Setup UDP for discovery
  udp.begin(UDP_DISCOVERY_PORT + 1);
  
  // Start Web Server for Status Page
  server.begin();
  Serial.println("[System] Web Server started");
  
  // Discover server
  discoverServer();
  
  // Start mDNS
  if (MDNS.begin("wheelsense-camera")) {
    Serial.println("[mDNS] Started: wheelsense-camera.local");
  }
  
  // Create frame queue and pool
  frameQueue = xQueueCreate(FRAME_QUEUE_SIZE, sizeof(FrameData*));
  if (!frameQueue || !framePool.init()) {
    Serial.println("[Error] Memory allocation failed!");
    ESP.restart();
  }

  // Start FreeRTOS tasks
  xTaskCreatePinnedToCore(cameraTask, "CameraTask", CAMERA_TASK_STACK_SIZE, 
                          NULL, CAMERA_TASK_PRIORITY, NULL, CAMERA_TASK_CORE);
  
  xTaskCreatePinnedToCore(webSocketTask, "WebSocketTask", WS_TASK_STACK_SIZE,
                          NULL, WS_TASK_PRIORITY, NULL, WS_TASK_CORE);
  
  // Setup MQTT
  snprintf(MQTT_TOPIC_REGISTRATION, 64, "WheelSense/%s/registration", roomType.c_str());
  mqtt.setServer(discoveredServerIP.c_str(), MQTT_PORT);
  mqtt.setCallback(mqttCallback);
  
  // Setup status web server (Already done in setupWebServer)
  // setupStatusServer(); 
  
  reconnectMQTT();
  reconnectWebSocket();
  
  startTime = millis();
  lastFpsTime = startTime;
  
  Serial.println("\n[System] READY!");
  Serial.printf("  Device: %s (%s)\n", deviceId.c_str(), roomType.c_str());
  Serial.printf("  Status: http://%s\n", WiFi.localIP().toString().c_str());
  Serial.printf("  Server: %s\n\n", discoveredServerIP.c_str());
}

/* ===== Main Loop ===== */
void loop() {
  unsigned long now = millis();
  
  if (configMode) {
    // Handle config portal (only during initial setup)
    dnsServer.processNextRequest();
    server.handleClient();
    
    // Timeout check
    if (now - configModeStartTime > CONFIG_PORTAL_TIMEOUT) {
      Serial.println("[Config] Timeout - restarting");
      ESP.restart();
    }
    
    delay(10);
    return;
  }
  
  // Check for BOOT button long press to enter config mode
  static unsigned long btnPressStart = 0;
  if (digitalRead(BOOT_BUTTON_PIN) == LOW) {
    if (btnPressStart == 0) btnPressStart = now;
    else if (now - btnPressStart > 3000) {
      Serial.println("\n[System] BOOT button held > 3s. Entering Config Mode...");
      // Flash LED if available (GPIO 1 is usually built-in LED on some boards, but often serial TX. T-SimCam typically has GPIO 4 for flash?)
      // We'll stick to Serial for now or the existing LED pin 1.
      startConfigPortal();
      btnPressStart = 0; // Reset
      return;
    }
  } else {
    btnPressStart = 0;
  }
  
  // Normal operation
  server.handleClient();
  
  // Reconnect if needed
  if (!wsConnected) {
    static unsigned long lastTry = 0;
    if (now - lastTry > 5000) {
      lastTry = now;
      reconnectWebSocket();
      reconnectMQTT();
      if (mqtt.connected()) mqtt.loop();
    }
  } else if (mqtt.connected() && mqttRegistered) {
    mqtt.disconnect();
  }
  
  // Status reporting
  if (now - lastStatusMs > STATUS_INTERVAL_MS) {
    lastStatusMs = now;
    if (wsConnected) sendStatus();
    
    unsigned long dt = now - lastFpsTime;
    unsigned long dFrames = framesSent - lastFramesSent;
    float fps = (dt > 0) ? (1000.0f * dFrames / dt) : 0.0f;
    lastFpsTime = now;
    lastFramesSent = framesSent;
    
    Serial.printf("[Stats] FPS: %.1f, Sent: %lu, WS: %s, Server: %s\n", 
                  fps, framesSent, wsConnected ? "YES" : "NO", discoveredServerIP.c_str());
  }
  
  delay(10);
}
