/*
 * WheelSense T-SIMCam Node v3.0.0
 * BLE beacon + camera + MQTT control
 * Simplified from v2 (2100 lines → ~500 lines)
 */
#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <WebServer.h>
#include <Preferences.h>
#include <DNSServer.h>
#include <ArduinoJson.h>
#include "esp_camera.h"
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"
#include "mbedtls/base64.h"
#include "esp_system.h"
#include "esp_mac.h"

// ===== Camera Pins (T-SIMCam) =====
#define PWDN_GPIO     -1
#define RESET_GPIO    -1
#define XCLK_GPIO     14
#define SIOD_GPIO     4
#define SIOC_GPIO     5
#define Y9_GPIO       15
#define Y8_GPIO       16
#define Y7_GPIO       17
#define Y6_GPIO       12
#define Y5_GPIO       10
#define Y4_GPIO        8
#define Y3_GPIO        9
#define Y2_GPIO       11
#define VSYNC_GPIO     6
#define HREF_GPIO      7
#define PCLK_GPIO     13

#define FLASH_GPIO      2
#define BOOT_BUTTON_PIN 0

// ===== Config =====
#define FIRMWARE_VERSION  "3.0.0"
#define NODE_PREFIX       "WSN_"
#define DEFAULT_MQTT      "broker.emqx.io"
#define DEFAULT_MQTT_PORT 1883
#define MQTT_BUF_SIZE     65000 // PubSubClient uses uint16_t for packet size
#define STATUS_INTERVAL   10000
#define CONFIG_PORTAL_TIMEOUT 180000
#define SNAPSHOT_CHUNK_BYTES 12288
#define SNAPSHOT_PAYLOAD_GUARD 60000
#define BATTERY_MIN_V 3.30f
#define BATTERY_MAX_V 4.20f
#ifndef BATTERY_ADC_PIN
#define BATTERY_ADC_PIN -1
#endif
#ifndef BATTERY_DIVIDER_RATIO
#define BATTERY_DIVIDER_RATIO 2.0f
#endif

// ===== State =====
Preferences prefs;
WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);
WebServer server(80);
DNSServer dnsServer;
BLEServer* pBLEServer = nullptr;

String deviceId;
String nodeId;
String wifiSSID, wifiPass;
String mqttBroker, mqttUser, mqttPass;
int mqttPort = DEFAULT_MQTT_PORT;
bool setupDone = false;
bool configMode = false;
bool streamEnabled = false;  // Server controls this via MQTT
int captureIntervalMs = 0;   // 0 = no periodic capture
unsigned long configModeStartTime = 0;

unsigned long lastStatusMs = 0;
unsigned long lastCaptureMs = 0;
unsigned long lastMqttReconnect = 0;
unsigned long framesCaptured = 0;
unsigned long snapshotsOk = 0;
unsigned long snapshotsFailed = 0;
unsigned long lastSnapshotMs = 0;
size_t lastSnapshotBytes = 0;
String lastSnapshotMode = "none";
String lastSnapshotError = "";

/** BLE radio MAC (matches M5 BLE scan); used by server to merge BLE_* stub with CAM_* registry. */
String getBleMacString() {
    uint8_t m[6];
    if (esp_read_mac(m, ESP_MAC_BT) == ESP_OK) {
        char buf[24];
        snprintf(buf, sizeof(buf), "%02X:%02X:%02X:%02X:%02X:%02X",
                 m[0], m[1], m[2], m[3], m[4], m[5]);
        return String(buf);
    }
    return WiFi.macAddress();
}

// ===== Config Load/Save =====
void loadConfig() {
    prefs.begin("wscam", true);
    deviceId   = prefs.getString("devId", "");
    nodeId     = prefs.getString("nodeId", "");
    wifiSSID   = prefs.getString("ssid", "");
    wifiPass   = prefs.getString("pass", "");
    mqttBroker = prefs.getString("mqttBrk", DEFAULT_MQTT);
    mqttPort   = prefs.getInt("mqttPort", DEFAULT_MQTT_PORT);
    mqttUser   = prefs.getString("mqttUser", "");
    mqttPass   = prefs.getString("mqttPass", "");
    setupDone  = prefs.getBool("setup", false);
    prefs.end();

    if (deviceId.length() == 0) {
        uint8_t mac[6];
        WiFi.macAddress(mac);
        char buf[16];
        snprintf(buf, sizeof(buf), "CAM_%02X%02X", mac[4], mac[5]);
        deviceId = String(buf);
    }
    if (nodeId.length() == 0) nodeId = NODE_PREFIX "001";
}

void saveConfig() {
    prefs.begin("wscam", false);
    prefs.putString("devId", deviceId);
    prefs.putString("nodeId", nodeId);
    prefs.putString("ssid", wifiSSID);
    prefs.putString("pass", wifiPass);
    prefs.putString("mqttBrk", mqttBroker);
    prefs.putInt("mqttPort", mqttPort);
    prefs.putString("mqttUser", mqttUser);
    prefs.putString("mqttPass", mqttPass);
    prefs.putBool("setup", setupDone);
    prefs.end();
}

// ===== Camera =====
bool initCamera() {
    camera_config_t cfg;
    cfg.ledc_channel = LEDC_CHANNEL_0;
    cfg.ledc_timer   = LEDC_TIMER_0;
    cfg.pin_d0       = Y2_GPIO;
    cfg.pin_d1       = Y3_GPIO;
    cfg.pin_d2       = Y4_GPIO;
    cfg.pin_d3       = Y5_GPIO;
    cfg.pin_d4       = Y6_GPIO;
    cfg.pin_d5       = Y7_GPIO;
    cfg.pin_d6       = Y8_GPIO;
    cfg.pin_d7       = Y9_GPIO;
    cfg.pin_xclk     = XCLK_GPIO;
    cfg.pin_pclk     = PCLK_GPIO;
    cfg.pin_vsync    = VSYNC_GPIO;
    cfg.pin_href     = HREF_GPIO;
    cfg.pin_sccb_sda = SIOD_GPIO;
    cfg.pin_sccb_scl = SIOC_GPIO;
    cfg.pin_pwdn     = PWDN_GPIO;
    cfg.pin_reset    = RESET_GPIO;
    cfg.xclk_freq_hz = 10000000;
    cfg.pixel_format = PIXFORMAT_JPEG;
    cfg.frame_size   = FRAMESIZE_VGA;
    cfg.jpeg_quality = 14;
    cfg.fb_count     = 2;
    cfg.fb_location  = CAMERA_FB_IN_PSRAM;
    cfg.grab_mode    = CAMERA_GRAB_LATEST;

    if (psramFound()) {
        cfg.frame_size   = FRAMESIZE_VGA;
        cfg.jpeg_quality = 12;
        cfg.fb_count     = 2;
    } else {
        cfg.frame_size   = FRAMESIZE_QVGA;
        cfg.jpeg_quality = 16;
        cfg.fb_count     = 1;
    }

    esp_err_t err = esp_camera_init(&cfg);
    if (err != ESP_OK) {
        Serial.printf("[Camera] Init failed: 0x%x\n", err);
        return false;
    }
    Serial.println("[Camera] Init OK");
    return true;
}

// ===== BLE Beacon =====
void startBleBeacon() {
    BLEDevice::init(nodeId.c_str());
    pBLEServer = BLEDevice::createServer();
    BLEAdvertising* adv = BLEDevice::getAdvertising();

    BLEAdvertisementData scanResp;
    scanResp.setName(nodeId.c_str());
    adv->setScanResponseData(scanResp);

    BLEAdvertisementData advData;
    advData.setFlags(ESP_BLE_ADV_FLAG_GEN_DISC | ESP_BLE_ADV_FLAG_BREDR_NOT_SPT);
    advData.setName(nodeId.c_str());
    adv->setAdvertisementData(advData);

    adv->setAdvertisementType(ADV_TYPE_IND);
    adv->setMinInterval(0x100);
    adv->setMaxInterval(0x200);
    adv->start();
    Serial.printf("[BLE] Beacon: %s\n", nodeId.c_str());
}

// ===== WiFi =====
bool connectWiFi() {
    if (wifiSSID.length() == 0) return false;
    WiFi.mode(WIFI_STA);
    WiFi.begin(wifiSSID.c_str(), wifiPass.c_str());
    Serial.printf("[WiFi] Connecting to %s", wifiSSID.c_str());
    for (int i = 0; i < 30; i++) {
        if (WiFi.status() == WL_CONNECTED) {
            Serial.printf(" OK IP=%s\n", WiFi.localIP().toString().c_str());
            return true;
        }
        delay(500);
        Serial.print(".");
    }
    Serial.println(" FAILED");
    return false;
}

const char CONFIG_PAGE_HTML[] PROGMEM = R"rawhtml(
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>WheelSense Camera Config</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:#f4f7f6;color:#333;padding:16px}
h1{color:#0052cc;font-size:1.5em;margin-bottom:6px;font-weight:700}
.sub{color:#666;font-size:.9em;margin-bottom:20px}
.card{background:#fff;border-radius:12px;padding:20px;margin-bottom:16px;box-shadow:0 2px 8px rgba(0,0,0,0.04);border:1px solid #e1e4e8}
.card h2{color:#0052cc;font-size:1.1em;margin-bottom:12px;border-bottom:1px solid #eee;padding-bottom:8px}
label{display:block;color:#555;font-size:.85em;font-weight:600;margin-bottom:4px;margin-top:12px}
input,select{width:100%;padding:10px 12px;border-radius:8px;border:1px solid #ccc;background:#fafbfc;color:#333;font-size:.95em;transition:border-color .2s}
input:focus,select:focus{outline:none;border-color:#0052cc;background:#fff}
.help{font-size:0.75em;color:#888;margin-top:4px}
.btn{width:100%;padding:14px;border:none;border-radius:10px;background:#0052cc;color:#fff;font-size:1.05em;font-weight:700;cursor:pointer;margin-top:20px;box-shadow:0 4px 12px rgba(0,82,204,0.3);transition:transform .1s,background .2s}
.btn:active{transform:scale(.98);background:#0043a8}
.foot{text-align:center;color:#888;font-size:.75em;margin-top:20px}
</style>
<script>
function toggleSSID() {
  var sel = document.getElementById("ssid_sel");
  var txt = document.getElementById("ssid_txt");
  if (sel.value === "__MANUAL__") {
    txt.style.display = "block";
    txt.required = true;
    txt.name = "ssid";
    sel.name = "";
  } else {
    txt.style.display = "none";
    txt.required = false;
    txt.name = "";
    sel.name = "ssid";
  }
}
</script>
</head>
<body onload="toggleSSID()">
<h1>&#x1F4F7; Camera Config</h1>
<p class="sub">Configure your T-SIMCam settings</p>
<form method="POST" action="/save">

<div class="card">
<h2>&#x1F4E1; WiFi Settings</h2>
<label>Network (SSID)</label>
<select id="ssid_sel" onchange="toggleSSID()">
%WIFI_OPTIONS%
</select>
<input id="ssid_txt" style="display:none;margin-top:8px;" placeholder="Type SSID Manually..." value="%WIFI_SSID%" maxlength="32">
<label>Password</label>
<input name="pass" type="password" value="%WIFI_PASS%" maxlength="63">
</div>

<div class="card">
<h2>&#x1F4E8; MQTT Setup</h2>
<label>Broker URL / IP</label>
<input name="mqtt" value="%MQTT_BROKER%" maxlength="40">
<label>Port</label>
<input name="mqttPort" type="number" value="%MQTT_PORT%" min="1" max="65535">
<label>Username</label>
<input name="mqttUser" value="%MQTT_USER%" maxlength="24">
<label>Password</label>
<input name="mqttPass" type="password" value="%MQTT_PASS%" maxlength="24">
</div>

<div class="card">
<h2>&#x2699;&#xFE0F; Device Info</h2>
<label>Node ID</label>
<input name="nodeId" value="%NODE_ID%" maxlength="20">
</div>

<button class="btn" type="submit">&#x1F4BE; Save &amp; Reboot</button>
</form>
<p class="foot">Firmware v%FW_VER% &bull; Changes require reboot to apply.</p>
</body>
</html>
)rawhtml";

const char SAVED_HTML[] PROGMEM = R"rawhtml(
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Saved!</title>
<style>
body{font-family:-apple-system,sans-serif;background:#f4f7f6;color:#333;display:flex;justify-content:center;align-items:center;min-height:100vh}
.box{text-align:center;background:#fff;padding:32px 24px;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.05);border:1px solid #e1e4e8}
h1{color:#10b981;font-size:1.6em;margin-bottom:8px}
p{color:#555;line-height:1.5}
</style>
</head>
<body>
<div class="box">
<h1>&#x2705; Configuration Saved</h1>
<p>The camera is restarting.<br>Please wait while it connects to WiFi.</p>
</div>
</body>
</html>
)rawhtml";

void startConfigPortal() {
    configMode = true;
    configModeStartTime = millis();

    // Scan WiFi first
    Serial.println("[Config] Scanning WiFi networks...");
    WiFi.disconnect(true);
    delay(100);
    WiFi.mode(WIFI_STA);
    int n = WiFi.scanNetworks();
    
    String wifiOptions = "";
    bool currentFound = false;
    if (n > 0) {
        for (int i = 0; i < n; ++i) {
            String ssid = WiFi.SSID(i);
            if (ssid.length() == 0) continue;
            
            String selected = "";
            if (ssid == wifiSSID && !currentFound) {
                selected = " selected";
                currentFound = true;
            }
            wifiOptions += "<option value=\"" + ssid + "\"" + selected + ">" + ssid + " (" + String(WiFi.RSSI(i)) + " dBm)</option>\n";
        }
    }
    
    if (!currentFound && wifiSSID.length() > 0) {
        wifiOptions += "<option value=\"" + wifiSSID + "\" selected>" + wifiSSID + " (Saved)</option>\n";
    }
    wifiOptions += "<option value=\"__MANUAL__\">-- Enter manually --</option>\n";
    
    WiFi.scanDelete();

    // Now start the AP
    WiFi.mode(WIFI_AP);
    WiFi.softAP(("WS-Camera-" + deviceId).c_str());
    dnsServer.start(53, "*", WiFi.softAPIP());

    server.on("/", HTTP_GET, [wifiOptions]() {
        String page = FPSTR(CONFIG_PAGE_HTML);
        page.replace("%WIFI_OPTIONS%", wifiOptions);
        page.replace("%WIFI_SSID%", wifiSSID);
        page.replace("%WIFI_PASS%", wifiPass);
        page.replace("%MQTT_BROKER%", mqttBroker);
        page.replace("%MQTT_PORT%", String(mqttPort));
        page.replace("%MQTT_USER%", mqttUser);
        page.replace("%MQTT_PASS%", mqttPass);
        page.replace("%NODE_ID%", nodeId);
        page.replace("%FW_VER%", FIRMWARE_VERSION);
        server.send(200, "text/html", page);
    });

    server.on("/save", HTTP_POST, []() {
        if (server.hasArg("nodeId"))   nodeId     = server.arg("nodeId");
        if (server.hasArg("ssid")) {
            String ssid = server.arg("ssid");
            if (ssid != "__MANUAL__" && ssid.length() > 0) wifiSSID = ssid;
        }
        if (server.hasArg("pass"))     wifiPass   = server.arg("pass");
        if (server.hasArg("mqtt"))     mqttBroker = server.arg("mqtt");
        if (server.hasArg("mqttPort")) mqttPort   = server.arg("mqttPort").toInt();
        if (server.hasArg("mqttUser")) mqttUser   = server.arg("mqttUser");
        if (server.hasArg("mqttPass")) mqttPass   = server.arg("mqttPass");
        setupDone = true;
        saveConfig();
        
        server.send(200, "text/html", FPSTR(SAVED_HTML));
        delay(1000);
        ESP.restart();
    });

    server.begin();
    Serial.printf("[Config] AP: WS-Camera-%s IP: %s\n",
                  deviceId.c_str(), WiFi.softAPIP().toString().c_str());
}

bool readBatteryStatus(float &voltageV, int &pct) {
#if BATTERY_ADC_PIN >= 0
    uint32_t mv = analogReadMilliVolts(BATTERY_ADC_PIN);
    if (mv == 0) return false;
    voltageV = (mv / 1000.0f) * BATTERY_DIVIDER_RATIO;
    float ratio = (voltageV - BATTERY_MIN_V) / (BATTERY_MAX_V - BATTERY_MIN_V);
    if (ratio < 0.0f) ratio = 0.0f;
    if (ratio > 1.0f) ratio = 1.0f;
    pct = (int)(ratio * 100.0f);
    return true;
#else
    (void)voltageV;
    (void)pct;
    return false;
#endif
}

String makePhotoId() {
    char id[32];
    unsigned long rnd = (unsigned long)esp_random();
    snprintf(id, sizeof(id), "%08lX%08lX", millis(), rnd);
    return String(id);
}

bool encodeBase64(const uint8_t *src, size_t srcLen, String &out) {
    size_t encodedLen = 4 * ((srcLen + 2) / 3);
    unsigned char *buf = (unsigned char *)malloc(encodedLen + 1);
    if (!buf) return false;
    size_t actualLen = 0;
    int rc = mbedtls_base64_encode(buf, encodedLen + 1, &actualLen, src, srcLen);
    if (rc != 0) {
        free(buf);
        return false;
    }
    buf[actualLen] = '\0';
    out = String((const char *)buf);
    free(buf);
    return true;
}

void publishAck(const String &commandId, const String &command, const String &status, const String &message) {
    if (!mqtt.connected() || commandId.length() == 0) return;
    StaticJsonDocument<384> doc;
    doc["command_id"] = commandId;
    doc["device_id"] = deviceId;
    doc["command"] = command;
    doc["status"] = status;
    doc["message"] = message;
    doc["timestamp_ms"] = millis();
    String body;
    serializeJson(doc, body);
    String topic = "WheelSense/camera/" + deviceId + "/ack";
    mqtt.publish(topic.c_str(), body.c_str());
}

bool publishPhotoChunked(camera_fb_t *fb, String &errorCode) {
    if (!fb || fb->len == 0) {
        errorCode = "capture_empty";
        return false;
    }
    String topic = "WheelSense/camera/" + deviceId + "/photo";
    String photoId = makePhotoId();
    int totalChunks = (int)((fb->len + SNAPSHOT_CHUNK_BYTES - 1) / SNAPSHOT_CHUNK_BYTES);

    for (int idx = 0; idx < totalChunks; idx++) {
        size_t offset = (size_t)idx * SNAPSHOT_CHUNK_BYTES;
        size_t chunkLen = fb->len - offset;
        if (chunkLen > SNAPSHOT_CHUNK_BYTES) chunkLen = SNAPSHOT_CHUNK_BYTES;

        String b64;
        if (!encodeBase64(fb->buf + offset, chunkLen, b64)) {
            errorCode = "base64_encode_failed";
            return false;
        }

        String payload;
        payload.reserve(b64.length() + 220);
        payload += "{\"photo_id\":\"";
        payload += photoId;
        payload += "\",\"device_id\":\"";
        payload += deviceId;
        payload += "\",\"chunk_index\":";
        payload += String(idx);
        payload += ",\"total_chunks\":";
        payload += String(totalChunks);
        payload += ",\"data\":\"";
        payload += b64;
        payload += "\"}";

        if (payload.length() > SNAPSHOT_PAYLOAD_GUARD) {
            errorCode = "chunk_too_large";
            return false;
        }
        if (!mqtt.publish(topic.c_str(), payload.c_str())) {
            errorCode = "chunk_publish_failed";
            return false;
        }
        delay(2);
    }
    return true;
}

bool publishFrameFallback(camera_fb_t *fb, String &errorCode) {
    if (!fb || fb->len == 0) {
        errorCode = "capture_empty";
        return false;
    }
    String frameTopic = "WheelSense/camera/" + deviceId + "/frame";
    if (!mqtt.beginPublish(frameTopic.c_str(), fb->len, false)) {
        errorCode = "frame_begin_failed";
        return false;
    }
    size_t written = mqtt.write(fb->buf, fb->len);
    bool ok = mqtt.endPublish();
    if (!ok || written != fb->len) {
        errorCode = "frame_publish_failed";
        return false;
    }
    return true;
}

bool captureAndPublishSnapshot(String &mode, String &errorCode) {
    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb) {
        errorCode = "capture_failed";
        return false;
    }

    size_t frameLen = fb->len;
    bool ok = publishPhotoChunked(fb, errorCode);
    if (ok) {
        mode = "mqtt_chunked_photo";
    } else {
        String fallbackErr;
        if (publishFrameFallback(fb, fallbackErr)) {
            ok = true;
            mode = "mqtt_frame_fallback";
            errorCode = "";
        } else {
            errorCode += "|" + fallbackErr;
        }
    }

    if (ok) {
        framesCaptured++;
        snapshotsOk++;
        lastSnapshotMs = millis();
        lastSnapshotBytes = frameLen;
        lastSnapshotMode = mode;
        lastSnapshotError = "";
    } else {
        snapshotsFailed++;
        lastSnapshotError = errorCode;
    }

    esp_camera_fb_return(fb);
    return ok;
}

// ===== MQTT =====
void mqttCallback(char* topic, byte* payload, unsigned int length) {
    char msg[length + 1];
    memcpy(msg, payload, length);
    msg[length] = '\0';

    StaticJsonDocument<512> doc;
    if (deserializeJson(doc, msg) != DeserializationError::Ok) return;

    String topicStr(topic);
    String controlTopic = String("WheelSense/camera/") + deviceId + "/control";

    if (topicStr == controlTopic) {
        String cmd = doc["command"] | doc["cmd"] | "";
        String commandId = doc["command_id"] | "";
        cmd.toLowerCase();

        if (cmd == "start_stream") {
            captureIntervalMs = doc["interval_ms"] | 200;  // ~5 FPS default
            streamEnabled = true;
            Serial.printf("[MQTT] Stream started: %dms interval\n", captureIntervalMs);
            publishAck(commandId, cmd, "ok", "stream_started");
        }
        else if (cmd == "stop_stream") {
            streamEnabled = false;
            captureIntervalMs = 0;
            Serial.println("[MQTT] Stream stopped");
            publishAck(commandId, cmd, "ok", "stream_stopped");
        }
        else if (cmd == "capture" || cmd == "capture_frame" || cmd == "snapshot") {
            String mode;
            String errorCode;
            bool ok = captureAndPublishSnapshot(mode, errorCode);
            if (ok) {
                Serial.printf("[Camera] Snapshot sent via %s\n", mode.c_str());
                publishAck(commandId, cmd, "ok", mode);
            } else {
                Serial.printf("[Camera] Snapshot failed: %s\n", errorCode.c_str());
                publishAck(commandId, cmd, "error", errorCode);
            }
        }
        else if (cmd == "set_resolution") {
            String res = doc["resolution"] | "VGA";
            sensor_t* s = esp_camera_sensor_get();
            if (s) {
                if (res == "QVGA") s->set_framesize(s, FRAMESIZE_QVGA);
                else if (res == "VGA") s->set_framesize(s, FRAMESIZE_VGA);
                else if (res == "SVGA") s->set_framesize(s, FRAMESIZE_SVGA);
                else if (res == "XGA") s->set_framesize(s, FRAMESIZE_XGA);
                Serial.printf("[Camera] Resolution: %s\n", res.c_str());
            }
            publishAck(commandId, cmd, "ok", "resolution_updated");
        }
        else if (cmd == "reboot") {
            publishAck(commandId, cmd, "ok", "rebooting");
            delay(200);
            ESP.restart();
        }
        else if (cmd == "enter_config_mode") {
            startConfigPortal();
            publishAck(commandId, cmd, "ok", "entering_config_mode");
        }
        else {
            publishAck(commandId, cmd, "error", "unknown_command");
        }
        return;
    }

    // Config topic
    String cfgTopic = String("WheelSense/config/") + deviceId;
    if (topicStr == cfgTopic || topicStr == "WheelSense/config/all") {
        if (doc.containsKey("wifi_ssid"))     wifiSSID   = doc["wifi_ssid"].as<String>();
        if (doc.containsKey("wifi_password")) wifiPass   = doc["wifi_password"].as<String>();
        if (doc.containsKey("mqtt_broker"))   mqttBroker = doc["mqtt_broker"].as<String>();
        if (doc.containsKey("mqtt_port"))     mqttPort   = doc["mqtt_port"].as<int>();
        if (doc.containsKey("node_id"))       nodeId     = doc["node_id"].as<String>();
        saveConfig();
        if (!(doc["sync_only"] | false)) {
            delay(500);
            ESP.restart();
        }
    }
}

bool connectMQTT() {
    String host = mqttBroker.length() > 0 ? mqttBroker : String(DEFAULT_MQTT);
    uint16_t port = (mqttPort > 0 && mqttPort <= 65535) ? mqttPort : DEFAULT_MQTT_PORT;

    mqtt.setServer(host.c_str(), port);
    mqtt.setCallback(mqttCallback);
    mqtt.setBufferSize(MQTT_BUF_SIZE);
    mqtt.setKeepAlive(45);

    char id[32];
    snprintf(id, sizeof(id), "%s_%04X", deviceId.c_str(), random(0xFFFF));

    bool ok = mqttUser.length() > 0
        ? mqtt.connect(id, mqttUser.c_str(), mqttPass.c_str())
        : mqtt.connect(id);

    if (ok) {
        Serial.printf("[MQTT] Connected: %s:%u\n", host.c_str(), port);
        // Subscribe
        String ctrlTopic = "WheelSense/camera/" + deviceId + "/control";
        mqtt.subscribe(ctrlTopic.c_str());
        String cfgTopic = "WheelSense/config/" + deviceId;
        mqtt.subscribe(cfgTopic.c_str());
        mqtt.subscribe("WheelSense/config/all");

        // Register
        StaticJsonDocument<512> reg;
        reg["type"] = "device_registration";
        reg["device_id"] = deviceId;
        reg["node_id"] = nodeId;
        reg["device_type"] = "camera";
        reg["hardware_type"] = "node";
        reg["ip_address"] = WiFi.localIP().toString();
        reg["firmware"] = FIRMWARE_VERSION;
        {
            String bmac = getBleMacString();
            if (bmac.length() > 0) {
                reg["ble_mac"] = bmac;
            }
        }
        String body;
        serializeJson(reg, body);
        String regTopic = "WheelSense/camera/" + deviceId + "/registration";
        mqtt.publish(regTopic.c_str(), body.c_str(), true);
    }
    return ok;
}

void sendStatus() {
    if (!mqtt.connected()) return;
    StaticJsonDocument<512> doc;
    float batteryV = 0.0f;
    int batteryPct = 0;
    bool hasBattery = readBatteryStatus(batteryV, batteryPct);

    doc["type"] = "status";
    doc["device_id"] = deviceId;
    doc["node_id"] = nodeId;
    doc["device_type"] = "camera";
    doc["hardware_type"] = "node";
    doc["status"] = configMode ? "config" : "online";
    doc["ip_address"] = WiFi.localIP().toString();
    doc["rssi"] = WiFi.RSSI();
    doc["heap"] = ESP.getFreeHeap();
    doc["frames_captured"] = framesCaptured;
    doc["stream_enabled"] = streamEnabled;
    doc["capture_interval_ms"] = captureIntervalMs;
    doc["uptime_s"] = millis() / 1000;
    doc["firmware"] = FIRMWARE_VERSION;
    doc["photo_transport"] = lastSnapshotMode;
    doc["snapshots_ok"] = snapshotsOk;
    doc["snapshots_failed"] = snapshotsFailed;
    doc["last_snapshot_ms"] = lastSnapshotMs;
    doc["last_snapshot_bytes"] = (uint32_t)lastSnapshotBytes;
    doc["last_snapshot_error"] = lastSnapshotError;
    doc["battery_available"] = hasBattery;
    if (hasBattery) {
        doc["battery_pct"] = batteryPct;
        doc["battery_voltage_v"] = batteryV;
    }
    {
        String bmac = getBleMacString();
        if (bmac.length() > 0) {
            doc["ble_mac"] = bmac;
        }
    }

    String body;
    serializeJson(doc, body);
    String topic = "WheelSense/camera/" + deviceId + "/status";
    mqtt.publish(topic.c_str(), body.c_str());
}

// ===== Status web page =====
void setupStatusPage() {
    server.on("/", HTTP_GET, []() {
        String html = "<!DOCTYPE html><html><head><title>WheelSense Camera</title>"
            "<meta name='viewport' content='width=device-width,initial-scale=1'>"
            "<style>body{font-family:monospace;background:#1a1a2e;color:#fff;padding:20px}"
            "h1{color:#e94560}td{padding:4px 12px}</style></head><body>"
            "<h1>WheelSense Camera</h1><table>"
            "<tr><td>Device</td><td>" + deviceId + "</td></tr>"
            "<tr><td>Node</td><td>" + nodeId + "</td></tr>"
            "<tr><td>Stream</td><td>" + String(streamEnabled ? "ON" : "OFF") + "</td></tr>"
            "<tr><td>Frames</td><td>" + String(framesCaptured) + "</td></tr>"
            "<tr><td>MQTT</td><td>" + String(mqtt.connected() ? "OK" : "NO") + "</td></tr>"
            "<tr><td>Heap</td><td>" + String(ESP.getFreeHeap()) + "</td></tr>"
            "<tr><td>Uptime</td><td>" + String(millis() / 1000) + "s</td></tr>"
            "<tr><td>FW</td><td>" FIRMWARE_VERSION "</td></tr>"
            "</table></body></html>";
        server.send(200, "text/html", html);
    });

    // MJPEG single frame endpoint
    server.on("/capture", HTTP_GET, []() {
        camera_fb_t* fb = esp_camera_fb_get();
        if (!fb) {
            server.send(500, "text/plain", "Camera capture failed");
            return;
        }
        WiFiClient client = server.client();
        client.println("HTTP/1.1 200 OK");
        client.println("Content-Type: image/jpeg");
        client.printf("Content-Length: %u\r\n", fb->len);
        client.println("Connection: close");
        client.println();
        client.write(fb->buf, fb->len);
        esp_camera_fb_return(fb);
    });

    // MJPEG stream endpoint
    server.on("/stream", HTTP_GET, []() {
        WiFiClient client = server.client();
        client.println("HTTP/1.1 200 OK");
        client.println("Content-Type: multipart/x-mixed-replace; boundary=frame");
        client.println();
        
        while (client.connected()) {
            camera_fb_t* fb = esp_camera_fb_get();
            if (!fb) break;
            client.printf("--frame\r\nContent-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n", fb->len);
            client.write(fb->buf, fb->len);
            client.println();
            esp_camera_fb_return(fb);
            delay(100); // ~10 FPS
        }
    });
}

// ===== Setup =====
void setup() {
    WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);
    Serial.begin(115200);
    delay(500);

    pinMode(FLASH_GPIO, OUTPUT);
    digitalWrite(FLASH_GPIO, LOW);
    pinMode(BOOT_BUTTON_PIN, INPUT_PULLUP);
#if BATTERY_ADC_PIN >= 0
    pinMode(BATTERY_ADC_PIN, INPUT);
#endif

    Serial.println("\n========================================");
    Serial.println("  WheelSense Camera v" FIRMWARE_VERSION);
    Serial.println("========================================\n");

    loadConfig();

    if (!initCamera()) {
        Serial.println("[Camera] FAILED! Restarting...");
        delay(2000);
        ESP.restart();
    }

    startBleBeacon();

    // Check boot button for config mode
    if (digitalRead(BOOT_BUTTON_PIN) == LOW || !setupDone) {
        Serial.println("[Boot] Entering config mode");
        startConfigPortal();
        return;
    }

    if (!connectWiFi()) {
        Serial.println("[Boot] WiFi failed → config mode");
        startConfigPortal();
        return;
    }

    setupStatusPage();
    server.begin();
    connectMQTT();

    Serial.println("[System] READY");
    Serial.printf("  Device: %s  Node: %s\n", deviceId.c_str(), nodeId.c_str());
    Serial.printf("  http://%s\n", WiFi.localIP().toString().c_str());
}

// ===== Main Loop =====
void loop() {
    unsigned long now = millis();

    if (configMode) {
        dnsServer.processNextRequest();
        server.handleClient();
        if (now - configModeStartTime > CONFIG_PORTAL_TIMEOUT) {
            Serial.println("[Config] Timeout → reboot");
            ESP.restart();
        }
        delay(10);
        return;
    }

    server.handleClient();
    if (mqtt.connected()) mqtt.loop();

    // Reconnect MQTT
    if (!mqtt.connected() && (now - lastMqttReconnect > 5000)) {
        lastMqttReconnect = now;
        connectMQTT();
    }

    // Periodic JPEG capture to MQTT (when server enables streaming)
    if (streamEnabled && captureIntervalMs > 0 && (now - lastCaptureMs >= (unsigned long)captureIntervalMs)) {
        camera_fb_t* fb = esp_camera_fb_get();
        if (fb && mqtt.connected()) {
            String topic = "WheelSense/camera/" + deviceId + "/frame";
            if (fb->len < MQTT_BUF_SIZE) {
                mqtt.beginPublish(topic.c_str(), fb->len, false);
                mqtt.write(fb->buf, fb->len);
                mqtt.endPublish();
                framesCaptured++;
            }
            esp_camera_fb_return(fb);
        } else if (fb) {
            esp_camera_fb_return(fb);
        }
        lastCaptureMs = now;
    }

    // Status report
    if (now - lastStatusMs > STATUS_INTERVAL) {
        lastStatusMs = now;
        sendStatus();
    }

    // Boot button long press → config mode
    static unsigned long btnStart = 0;
    if (digitalRead(BOOT_BUTTON_PIN) == LOW) {
        if (btnStart == 0) btnStart = now;
        else if (now - btnStart > 3000) {
            Serial.println("[System] Long press → config mode");
            startConfigPortal();
            btnStart = 0;
            return;
        }
    } else {
        btnStart = 0;
    }

    delay(10);
}
