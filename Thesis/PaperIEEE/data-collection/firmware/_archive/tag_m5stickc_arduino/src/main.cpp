#include <Arduino.h>
#include <M5StickC.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEServer.h>
#include <BLEAdvertising.h>

BLEAdvertising *pAdvertising;

void setup() {
  // Initialize M5StickC hardware (LCD, Power, Serial)
  M5.begin();
  
  M5.Lcd.setRotation(3); // Landscape
  M5.Lcd.fillScreen(BLACK);
  M5.Lcd.setCursor(10, 10);
  M5.Lcd.setTextSize(2);
  M5.Lcd.setTextColor(GREEN);
  M5.Lcd.print("WS_TAG");
  
  M5.Lcd.setCursor(10, 40);
  M5.Lcd.setTextColor(WHITE);
  M5.Lcd.setTextSize(1);
  M5.Lcd.print("Starting BLE...");
  
  Serial.println("Starting BLE Wearable Tag (M5StickC)...");

  BLEDevice::init("WS_TAG");
  
  // Set TX Power - Max for range
  BLEDevice::setPower(ESP_PWR_LVL_P9);

  pAdvertising = BLEDevice::getAdvertising();

  // Initial Advertisement config
  BLEAdvertisementData oAdvertisementData = BLEAdvertisementData();
  oAdvertisementData.setName("WS_TAG");
  oAdvertisementData.setFlags(ESP_BLE_ADV_FLAG_GEN_DISC | ESP_BLE_ADV_FLAG_BREDR_NOT_SPT);

  std::string mfgData = "";
  mfgData += (char)0x57; // 'W'
  mfgData += (char)0x53; // 'S'
  mfgData += (char)0x01; // version
  mfgData += (char)0x00; // placeholder counter
  oAdvertisementData.setManufacturerData(mfgData);

  pAdvertising->setAdvertisementData(oAdvertisementData);

  // Set advertising interval (fixed to ~100ms) 
  // Minimum and Maximum interval values are in 0.625ms units -> 160 * 0.625 = 100ms
  pAdvertising->setMinInterval(160); 
  pAdvertising->setMaxInterval(160);

  // Start advertising
  pAdvertising->start();
  Serial.println("Advertising Started.");
  
  M5.Lcd.fillRect(10, 40, 160, 20, BLACK); // Clear line
  M5.Lcd.setCursor(10, 40);
  M5.Lcd.setTextColor(ORANGE);
  M5.Lcd.print("Broadcasting (100ms)");
}

void loop() {
  // Keep M5 system services running cleanly
  M5.update();
  
  // No start/stop loops needed, just let the hardware pulse BLE
  delay(100);
}
