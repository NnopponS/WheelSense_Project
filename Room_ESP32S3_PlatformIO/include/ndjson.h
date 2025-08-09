#pragma once
#include <string>
#include <cstdio>
#include "model.h"
#include "utils.h"
#include "config.h"

// Build single wheel JSON object (compact) as std::string
static inline std::string build_wheel_json(const BeaconData& b, int room_id) {
  char payload[256];
  int pn = snprintf(payload, sizeof(payload),
    "{\"wheel\":%u,\"rssi\":%d,\"distance\":%.2f,"
    "\"status\":\"%s\",\"motion\":\"%s\","
    "\"batt\":%u,\"x\":%.2f,\"y\":%.2f,"
    "\"room\":%d,\"stale\":%s}",
    b.wheel_id, b.rssi, b.distance_m,
    statusStr(b.status), motionStr(b.motion),
    b.batt_pct, b.x_g, b.y_g,
    room_id, b.stale ? "true" : "false");
  if (pn < 0) return "{}";
  if (pn >= (int)sizeof(payload)) {
    // truncated, but still return what we have
  }
  return std::string(payload);
}

// Build aggregate NDJSON string (each line = one wheel JSON)
static inline std::string build_aggregate_ndjson(const BeaconData* arr, int count, int room_id, bool fallback_when_empty=true) {
  if (count <= 0) {
    if (fallback_when_empty) {
      char tmp[64];
      snprintf(tmp, sizeof(tmp), "{\"room\":%d,\"devices\":0}", room_id);
      return std::string(tmp);
    } else {
      return std::string();
    }
  }
  std::string out;
  out.reserve(count * 200);
  for (int i = 0; i < count; ++i) {
    out += build_wheel_json(arr[i], room_id);
    if (i != count - 1) out += "\n";
  }
  return out;
}