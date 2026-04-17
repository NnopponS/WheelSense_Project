#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEScan.h>
#include <BLEAdvertisedDevice.h>
#include <vector>
#include <time.h>

// ------------------------------------------------------------------
// CONFIGURATION
// ------------------------------------------------------------------
const char* WIFI_SSID   = "KNIGHT";
const char* WIFI_PASS   = "192837abcd";
const char* MQTT_HOST   = "192.168.137.1"; // Change to your broker IP on LAN
const int   MQTT_PORT   = 1883;

// Station ID - set correctly for each flashed board (S1, S2, S3)
const char* STATION_ID  = "S3";

// BLE Tag Settings
const char* TARGET_TAG_NAME = "WS_TAG";
const uint8_t TARGET_MFG_PREFIX[] = {0x57, 0x53, 0x01}; // 'W', 'S', 0x01

// Publishing Settings
const int MQTT_QOS = 0;

// NTP Settings
const char* NTP_SERVER_1 = "pool.ntp.org";
const char* NTP_SERVER_2 = "time.nist.gov";
const long  GMT_OFFSET_SEC = 7 * 3600;   // UTC+7 (Bangkok)
const int   DST_OFFSET_SEC = 0;

// ------------------------------------------------------------------
// GLOBALS
// ------------------------------------------------------------------
WiFiClient espClient;
PubSubClient mqttClient(espClient);
BLEScan* pBLEScan;
bool ntpSynced = false;

struct RssiSample {
  int rssi;
  unsigned long local_ts_ms;
  int seq;
  String tag_id;
};

std::vector<RssiSample> sampleBuffer;
int sequenceCounter = 0;

// ------------------------------------------------------------------
// FUNCTION PROTOTYPES
// ------------------------------------------------------------------
void setupWiFi();
void connectMQTT();
void publishBatch();
void syncNTP();
unsigned long long getEpochMillis();

// ------------------------------------------------------------------
// BLE CALLBACK
// ------------------------------------------------------------------
class MyAdvertisedDeviceCallbacks: public BLEAdvertisedDeviceCallbacks {
    void onResult(BLEAdvertisedDevice advertisedDevice) {
      bool isMatch = false;

      // 1. Check Device Name
      if (advertisedDevice.haveName()) {
        if (advertisedDevice.getName() == TARGET_TAG_NAME) {
          isMatch = true;
        }
      }

      // 2. Or check Manufacturer Data
      if (!isMatch && advertisedDevice.haveManufacturerData()) {
        std::string strManufacturerData = advertisedDevice.getManufacturerData();
        if (strManufacturerData.length() >= 3) {
          if (strManufacturerData[0] == TARGET_MFG_PREFIX[0] &&
              strManufacturerData[1] == TARGET_MFG_PREFIX[1] &&
              strManufacturerData[2] == TARGET_MFG_PREFIX[2]) {
             isMatch = true;
          }
        }
      }

      if (isMatch) {
         RssiSample s;
         s.rssi = advertisedDevice.getRSSI();
         s.local_ts_ms = millis();
         s.seq = ++sequenceCounter;
         s.tag_id = TARGET_TAG_NAME;

         // Quick protection against unbounded growth if MQTT is down
         if(sampleBuffer.size() < 100) {
            sampleBuffer.push_back(s);
         }
      }
    }
};

// ------------------------------------------------------------------
// SETUP
// ------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.printf("\n--- Wheelsense Station %s ---\n", STATION_ID);

  setupWiFi();
  syncNTP();
  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  mqttClient.setBufferSize(4096);

  // Initialize BLE Scanner
  BLEDevice::init("");
  pBLEScan = BLEDevice::getScan();
  pBLEScan->setAdvertisedDeviceCallbacks(new MyAdvertisedDeviceCallbacks(), true);
  pBLEScan->setActiveScan(false);
  pBLEScan->setInterval(100);
  pBLEScan->setWindow(99);  // Must be strictly <= interval (ESP32 guideline)
  Serial.println("setup() complete. Waiting for scans...");
}

// ------------------------------------------------------------------
// LOOP
// ------------------------------------------------------------------
void loop() {
  // Reconnect WiFi if needed
  if (WiFi.status() != WL_CONNECTED) {
    setupWiFi();
  }

  // Reconnect MQTT if needed
  if (!mqttClient.connected()) {
    connectMQTT();
  }
  mqttClient.loop();

  // BLE scan for 1 second (ESP32 minimum), publishes after each cycle
  pBLEScan->start(1, false);  // cannot go below 1 second on ESP32
  pBLEScan->clearResults(); 

  // Always publish after each scan (even if no tag detected)
  if (mqttClient.connected()) {
    publishBatch();
  }
}

// ------------------------------------------------------------------
// NTP SYNC
// ------------------------------------------------------------------
void syncNTP() {
  Serial.print("Syncing NTP time...");
  configTime(GMT_OFFSET_SEC, DST_OFFSET_SEC, NTP_SERVER_1, NTP_SERVER_2);

  // Wait up to 10 seconds for time to sync
  int retries = 20;
  struct tm timeinfo;
  while (!getLocalTime(&timeinfo) && retries-- > 0) {
    delay(500);
    Serial.print(".");
  }

  if (retries > 0) {
    ntpSynced = true;
    Serial.println(" OK!");
    Serial.printf("  Current time: %04d-%02d-%02d %02d:%02d:%02d (UTC+7)\n",
                  timeinfo.tm_year + 1900, timeinfo.tm_mon + 1, timeinfo.tm_mday,
                  timeinfo.tm_hour, timeinfo.tm_min, timeinfo.tm_sec);
  } else {
    ntpSynced = false;
    Serial.println(" FAILED (will use millis() fallback)");
  }
}

unsigned long long getEpochMillis() {
  struct timeval tv;
  gettimeofday(&tv, NULL);
  return (unsigned long long)tv.tv_sec * 1000ULL + (unsigned long long)(tv.tv_usec / 1000);
}

// ------------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------------
void setupWiFi() {
  Serial.print("Connecting to WiFi: ");
  Serial.println(WIFI_SSID);
  
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected.");
}

void connectMQTT() {
  while (!mqttClient.connected()) {
    Serial.print("Attempting MQTT connection to ");
    Serial.print(MQTT_HOST);
    Serial.print("...");
    
    String clientId = "WheelsenseStation-";
    clientId += String(STATION_ID);
    
    if (mqttClient.connect(clientId.c_str())) {
      Serial.println("connected");
    } else {
      Serial.print("failed, rc=");
      Serial.print(mqttClient.state());
      Serial.println(" try again in 2 seconds");
      delay(2000);
    }
  }
}

void publishBatch() {
  // Always publish, even if no tag was detected (empty samples array)
  // This lets the server know the station is alive and eliminates None values

  // Get NTP-synced epoch milliseconds
  unsigned long long epoch_ms = getEpochMillis();

  DynamicJsonDocument doc(4096); 
  
  doc["station_id"] = STATION_ID;
  doc["server_ts_ms"] = epoch_ms;  // NTP-synced epoch millis — all stations share same time base
  doc["ntp_synced"] = ntpSynced;
  
  JsonArray samples = doc.createNestedArray("samples");

  for (const auto& s : sampleBuffer) {
    JsonObject sampleObj = samples.createNestedObject();
    sampleObj["rssi"] = s.rssi;
    sampleObj["local_ts_ms"] = s.local_ts_ms;
    sampleObj["seq"] = s.seq;
    sampleObj["tag_id"] = s.tag_id;
  }

  char output[4096];
  serializeJson(doc, output);

  String topic = String("wheelsense/rssi/") + STATION_ID;
  
  bool success = mqttClient.publish(topic.c_str(), output);
  
  if(success) {
     Serial.printf("Published batch of %d samples to %s (ts=%llu)\n", sampleBuffer.size(), topic.c_str(), epoch_ms);
     sampleBuffer.clear();
  } else {
     Serial.println("MQTT Publish failed, keeping buffer.");
  }
}
