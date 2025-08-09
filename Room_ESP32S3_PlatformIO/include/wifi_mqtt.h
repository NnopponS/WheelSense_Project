#pragma once
#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include "model.h"

extern WiFiClient espClient;
extern PubSubClient client;

void setup_wifi();
void reconnect_mqtt();

// publish per-wheel (retain)
void publishWheelMqtt(const BeaconData& b);