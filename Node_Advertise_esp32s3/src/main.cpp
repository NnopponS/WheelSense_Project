/*************************************************************
 * WheelSense Node - ESP32-S3 Simple BLE Beacon
 * - Advertise ชื่อ "WheelSense_<NODE_ID>" เท่านั้น
 * - ไม่มี IMU, ไม่คำนวณอะไร
 * - M5StickC จะใช้ RSSI เพื่อหาตำแหน่ง
 * - แบตเตอรี่อึดมาก (แค่ BLE advertise)
 *************************************************************/
#include <Arduino.h>
#include <NimBLEDevice.h>

/* ===== CONFIG ===== */
#define NODE_ID 4 // <-- แก้เป็น ID ของ Node นี้ (1, 2, 3, ...)

// BLE Advertisement Interval (ms)
#define BLE_ADV_INTERVAL_MIN 160  // 100ms
#define BLE_ADV_INTERVAL_MAX 320  // 200ms

/* ===== BLE Objects ===== */
NimBLEAdvertising* pAdvertising;

/* ===== LED (Built-in) ===== */
#define LED_PIN 2  // GPIO2 (built-in LED on most ESP32)
bool ledState = false;
unsigned long lastBlinkMs = 0;

/* ===== Setup ===== */
void setup() {
  Serial.begin(115200);
  delay(500);
  
  // LED Setup
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  
  Serial.println("\n========================================");
  Serial.printf("  WheelSense Node #%d (ESP32-S3)\n", NODE_ID);
  Serial.println("  Simple BLE Beacon");
  Serial.println("========================================");
  Serial.println("Build: " __DATE__ " " __TIME__);
  Serial.println();
  
  // BLE Device Name
  char bleName[32];
  snprintf(bleName, sizeof(bleName), "WheelSense_%d", NODE_ID);
  
  Serial.printf("[Setup] Initializing BLE as '%s'...\n", bleName);
  
  // Initialize BLE
  NimBLEDevice::init(bleName);
  NimBLEDevice::setPower(ESP_PWR_LVL_P9); // Maximum power for better range
  
  // Setup Advertising
  pAdvertising = NimBLEDevice::getAdvertising();
  
  // Set advertising data
  NimBLEAdvertisementData advData;
  advData.setFlags(0x06); // BR_EDR_NOT_SUPPORTED | GENERAL_DISC_MODE
  advData.setName(bleName);
  advData.setCompleteServices(NimBLEUUID("180F")); // Battery Service UUID (dummy)
  
  pAdvertising->setAdvertisementData(advData);
  
  // Set scan response data (optional)
  NimBLEAdvertisementData scanData;
  scanData.setName(bleName);
  pAdvertising->setScanResponseData(scanData);
  
  // Set advertising interval
  pAdvertising->setMinInterval(BLE_ADV_INTERVAL_MIN);
  pAdvertising->setMaxInterval(BLE_ADV_INTERVAL_MAX);
  
  // Start advertising
  pAdvertising->start();
  
  Serial.println("[Setup] BLE advertising started!");
  Serial.printf("[Setup] Device Name: %s\n", bleName);
  Serial.printf("[Setup] Advertising Interval: %d-%d ms\n", 
                (BLE_ADV_INTERVAL_MIN * 625) / 1000, 
                (BLE_ADV_INTERVAL_MAX * 625) / 1000);
  Serial.println("[Setup] Ready!");
  Serial.println("========================================\n");
  
  // Blink LED to indicate ready
  for (int i = 0; i < 5; i++) {
    digitalWrite(LED_PIN, HIGH);
    delay(100);
    digitalWrite(LED_PIN, LOW);
    delay(100);
  }
}

/* ===== Loop ===== */
void loop() {
  // Blink LED every 2 seconds to show it's alive
  unsigned long now = millis();
  if (now - lastBlinkMs >= 2000) {
    lastBlinkMs = now;
    ledState = !ledState;
    digitalWrite(LED_PIN, ledState ? HIGH : LOW);
    
    // Print status every 10 seconds
    static unsigned long lastStatusMs = 0;
    if (now - lastStatusMs >= 10000) {
      lastStatusMs = now;
      Serial.println("===== Node Status =====");
      Serial.printf("Node ID: %d\n", NODE_ID);
      Serial.printf("Uptime: %lu seconds\n", now / 1000);
      Serial.printf("Free Heap: %u bytes\n", ESP.getFreeHeap());
      Serial.println("Status: Advertising...");
      Serial.println("======================\n");
    }
  }
  
  delay(100);
}
