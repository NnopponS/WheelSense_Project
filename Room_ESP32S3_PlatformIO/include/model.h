#pragma once
#include <Arduino.h>
#include "config.h"

struct BeaconData {
  uint8_t  wheel_id;
  float    distance_m;
  uint8_t  status;     // 0 OK, 1 IMU_NOT_FOUND, 2 ACCEL_UNRELIABLE, 3 DTHETA_CLIPPED
  uint8_t  motion;     // 0 STOP, 1 FWD, 2 BWD
  int8_t   x_i8;       // 0.02 g/LSB
  int8_t   y_i8;
  float    x_g, y_g;
  uint8_t  batt_pct;   // 0..100
  int      rssi;
  unsigned long last_seen_ms;
  bool     stale;
};

extern BeaconData beacons[MAX_BEACONS];
extern int beacon_count;

// upsert beacon (always overwrite with newest, including RSSI)
int upsert(const BeaconData& in);