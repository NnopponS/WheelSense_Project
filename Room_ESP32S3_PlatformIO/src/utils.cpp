#include "utils.h"

const char* motionStr(uint8_t m){
  switch(m){ case 1: return "FWD"; case 2: return "BWD"; default: return "STOP"; }
}
const char* statusStr(uint8_t s){
  switch(s){
    case 0: return "OK";
    case 1: return "IMU_NOT_FOUND";
    case 2: return "ACCEL_UNRELIABLE";
    case 3: return "DTHETA_CLIPPED";
    default: return "UNKNOWN";
  }
}

bool extract16(const std::string& m, uint8_t out16[16]) {
  if (m.size() < 16) return false;
  if (m.size() >= 18) { memcpy(out16, m.data()+2, 16); return true; } // skip 2B CompanyID
  if (m.size() == 16) { memcpy(out16, m.data(), 16);   return true; }
  memcpy(out16, m.data() + (m.size() - 16), 16);
  return true;
}