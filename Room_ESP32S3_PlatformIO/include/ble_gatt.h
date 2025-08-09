#pragma once
#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEService.h>
#include <BLECharacteristic.h>

extern BLEScan*           pBLEScan;
extern BLEService*        svcMQTT;
extern BLECharacteristic* chMQTT;

void setupBLEGATT();
void notifyAllSlots();   // notify all wheel slots once