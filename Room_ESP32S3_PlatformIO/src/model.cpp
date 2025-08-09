#include "model.h"

BeaconData beacons[MAX_BEACONS];
int beacon_count = 0;

int upsert(const BeaconData& in) {
  for (int i = 0; i < beacon_count; ++i) {
    if (beacons[i].wheel_id == in.wheel_id) {
      beacons[i] = in;       // overwrite all fields (freshest data)
      beacons[i].stale = false;
      return i;
    }
  }
  if (beacon_count < MAX_BEACONS) {
    beacons[beacon_count] = in;
    return beacon_count++;
  }
  return -1;
}