#pragma once
#include <Arduino.h>
#include <string>

const char* motionStr(uint8_t m);
const char* statusStr(uint8_t s);

// Extract the 16-byte payload from manufacturer data
bool extract16(const std::string& m, uint8_t out16[16]);