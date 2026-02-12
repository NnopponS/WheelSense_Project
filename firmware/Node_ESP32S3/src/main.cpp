/**
 * WheelSense v2.0 - ESP32-S3 BLE Beacon Node Firmware
 * 
 * This device acts as a BLE beacon for indoor positioning.
 * The M5StickCPlus2 gateway scans for these beacons and uses
 * RSSI values for fingerprint-based positioning.
 * 
 * Features:
 * - BLE advertising with unique node ID
 * - Low power consumption for extended battery life
 * - LED status indicator
 * 
 * To configure:
 * 1. Set NODE_ID to a unique number (1, 2, 3, etc.)
 * 2. Flash the firmware
 * 3. Place the node in the designated room
 * 
 * Author: Worapon Sangsasri
 */

#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEServer.h>

// Configuration - CHANGE THIS FOR EACH NODE
#define NODE_ID 1  // Unique identifier for this node (1, 2, 3, etc.)

// BLE Settings
#define DEVICE_PREFIX "WheelSense_"
#define SERVICE_UUID "12345678-1234-5678-1234-56789abcdef0"
#define TX_POWER ESP_PWR_LVL_P9  // Maximum power for better range

// LED Pin (ESP32-S3 DevKitC built-in LED)
#define LED_PIN 48

// Global variables
BLEServer* pServer = nullptr;
BLEAdvertising* pAdvertising = nullptr;
char deviceName[32];
unsigned long lastBlink = 0;
bool ledState = false;

void setup() {
    Serial.begin(115200);
    
    // Setup LED
    pinMode(LED_PIN, OUTPUT);
    digitalWrite(LED_PIN, HIGH);  // LED on during setup
    
    // Create device name
    snprintf(deviceName, sizeof(deviceName), "%s%d", DEVICE_PREFIX, NODE_ID);
    
    Serial.println("================================");
    Serial.println("WheelSense v2.0 BLE Beacon Node");
    Serial.println("================================");
    Serial.printf("Node ID: %d\n", NODE_ID);
    Serial.printf("Device Name: %s\n", deviceName);
    Serial.println();
    
    // Initialize BLE
    Serial.println("Initializing BLE...");
    BLEDevice::init(deviceName);
    
    // Set TX power
    BLEDevice::setPower(TX_POWER);
    
    // Create BLE Server
    pServer = BLEDevice::createServer();
    
    // Create BLE Service
    BLEService* pService = pServer->createService(SERVICE_UUID);
    pService->start();
    
    // Setup advertising
    pAdvertising = BLEDevice::getAdvertising();
    pAdvertising->addServiceUUID(SERVICE_UUID);
    pAdvertising->setScanResponse(true);
    pAdvertising->setMinPreferred(0x06);  // Helps with iPhone connections
    pAdvertising->setMinPreferred(0x12);
    
    // Start advertising
    BLEDevice::startAdvertising();
    
    Serial.println("BLE advertising started!");
    Serial.println("Ready for scanning by gateway.");
    Serial.println();
    
    digitalWrite(LED_PIN, LOW);  // LED off after setup
}

void loop() {
    // Blink LED every 2 seconds to indicate activity
    unsigned long now = millis();
    if (now - lastBlink >= 2000) {
        lastBlink = now;
        ledState = !ledState;
        digitalWrite(LED_PIN, ledState ? HIGH : LOW);
        
        // Log status
        Serial.printf("[%lu] Node %d advertising...\n", now / 1000, NODE_ID);
    }
    
    // Small delay to reduce power consumption
    delay(100);
}

/**
 * Power Saving Notes:
 * 
 * For battery-powered deployment, consider these modifications:
 * 
 * 1. Use deep sleep between advertising bursts:
 *    - Advertise for 1 second
 *    - Deep sleep for 4 seconds
 *    - This extends battery life significantly
 * 
 * 2. Reduce TX power if nodes are close together:
 *    - ESP_PWR_LVL_N12 to ESP_PWR_LVL_P9
 *    - Lower power = longer battery life
 * 
 * 3. Increase advertising interval:
 *    - Default: 100ms
 *    - Battery saving: 500ms - 1000ms
 * 
 * Example deep sleep implementation:
 * 
 * void enterDeepSleep() {
 *     esp_sleep_enable_timer_wakeup(4000000); // 4 seconds
 *     esp_deep_sleep_start();
 * }
 */
