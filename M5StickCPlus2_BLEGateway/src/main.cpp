#include <Arduino.h>
#include <ArduinoJson.h>
#include <BLE2902.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <Preferences.h>
#include <TFT_eSPI.h>
#include <Wire.h>
#include <esp_gap_ble_api.h>
#include <esp_system.h>
#include <math.h>

#define FIRMWARE_VERSION "4.1.0-fall-belt"

namespace {
constexpr const char* SERVICE_UUID = "8f6e0001-b5a3-f393-e0a9-e50e24dcca9e";
constexpr const char* DEVICE_INFO_UUID = "8f6e0002-b5a3-f393-e0a9-e50e24dcca9e";
constexpr const char* TELEMETRY_UUID = "8f6e0003-b5a3-f393-e0a9-e50e24dcca9e";
constexpr const char* COMMAND_UUID = "8f6e0004-b5a3-f393-e0a9-e50e24dcca9e";
constexpr const char* ACK_UUID = "8f6e0005-b5a3-f393-e0a9-e50e24dcca9e";
constexpr const char* ROOM_CONFIG_UUID = "8f6e0006-b5a3-f393-e0a9-e50e24dcca9e";
constexpr const char* TIME_SYNC_UUID = "8f6e0007-b5a3-f393-e0a9-e50e24dcca9e";
constexpr const char* FALL_ALERT_UUID = "8f6e0008-b5a3-f393-e0a9-e50e24dcca9e";

constexpr uint32_t TELEMETRY_INTERVAL_MS = 50;
constexpr uint32_t TELEMETRY_IDLE_INTERVAL_MS = 100;
constexpr uint8_t COMMAND_TARGET = 1;
constexpr uint8_t ROOM_TARGET = 2;
constexpr uint8_t TIME_TARGET = 3;
constexpr uint8_t HOLD_PIN = 4;
constexpr uint8_t BATTERY_ADC_PIN = 38;
constexpr uint8_t BUTTON_A_PIN = 37;
constexpr uint8_t BUTTON_B_PIN = 39;
constexpr uint8_t BUTTON_C_PIN = 35;
constexpr uint8_t INTERNAL_I2C_SDA = 21;
constexpr uint8_t INTERNAL_I2C_SCL = 22;
constexpr uint8_t MPU6886_ADDR = 0x68;
constexpr uint8_t BMI270_PRIMARY_ADDR = 0x69;
constexpr uint8_t BMI270_FALLBACK_ADDR = 0x68;

#include "bmi270_config.inl"

constexpr uint16_t COLOR_PRIMARY = 0x07E0;
constexpr uint16_t COLOR_WARNING = 0xFD20;
constexpr uint16_t COLOR_ERROR = 0xF800;
constexpr uint16_t COLOR_TEXT = 0xFFFF;
constexpr uint16_t COLOR_BG = 0x0000;
constexpr uint16_t COLOR_CYAN = 0x07FF;
constexpr uint16_t COLOR_PANEL = 0x1082;
constexpr uint16_t COLOR_PANEL_2 = 0x18E3;
constexpr uint16_t COLOR_HEADER = 0x10A2;
constexpr uint16_t COLOR_HEADER_INNER = 0x18E3;
constexpr uint16_t COLOR_DIM = 0x7BEF;
constexpr uint32_t DISPLAY_UPDATE_INTERVAL_MS = 200;
constexpr uint32_t STATIC_DISPLAY_UPDATE_INTERVAL_MS = 1000;
constexpr uint32_t BUTTON_SCAN_INTERVAL_MS = 20;
constexpr uint32_t BUTTON_DEBOUNCE_MS = 120;
constexpr uint32_t BOOT_DURATION_MS = 1800;
constexpr uint8_t BUZZER_PIN = 2;
constexpr uint32_t FALL_FREEFALL_MIN_MS = 80;
constexpr uint32_t FALL_IMPACT_WINDOW_MS = 1500;
constexpr uint32_t FALL_STILL_WINDOW_MS = 3500;
constexpr uint32_t FALL_ALERT_COUNTDOWN_MS = 10000;
constexpr uint32_t FALL_TEST_COUNTDOWN_MS = 5000;
constexpr float FALL_STILL_BAND_G = 0.25f;
constexpr float FALL_STILL_GYRO_DPS = 60.0f;
constexpr uint32_t FALL_SIREN_STEP_MS = 160;
constexpr float FALL_FREEFALL_G[3] = {0.50f, 0.60f, 0.70f};
constexpr float FALL_IMPACT_G[3] = {3.0f, 2.4f, 2.0f};
constexpr uint32_t FALL_STILL_MS[3] = {1800, 1500, 1200};
constexpr float FALL_RECOVER_GYRO_DPS = 100.0f;
constexpr float FALL_RECOVER_ACCEL_G = 0.30f;
constexpr uint32_t FALL_RECOVER_MS = 1000;
constexpr uint32_t FALL_RECOVER_GAP_MS = 400;
constexpr float FALL_POSTURE_COS = 0.65f;        // cos <= this = clearly rotated -> alert
constexpr float FALL_POSTURE_COS_REJECT = 0.82f; // cos > this = same posture -> reject; between = recheck
constexpr float STABLE_GRAVITY_ALPHA = 0.02f;    // fast EMA ~0.7s, tracks post-event orientation
constexpr float BASE_GRAVITY_ALPHA = 0.003f;     // slow EMA ~4s, pre-fall baseline (slow falls still count)
constexpr uint32_t SLEEP_TIMEOUT_OPTIONS_MS[] = {10000, 30000, 60000, 0}; // 0 = never
constexpr uint8_t SLEEP_OPTION_COUNT = 4;
constexpr uint8_t kMenuItemCount = 9;

Preferences prefs;
TFT_eSPI display;
BLECharacteristic* deviceInfoChar = nullptr;
BLECharacteristic* telemetryChar = nullptr;
BLECharacteristic* ackChar = nullptr;
BLECharacteristic* fallAlertChar = nullptr;
BLEAdvertising* advertising = nullptr;
BLEServer* bleServer = nullptr;
SemaphoreHandle_t writeMutex = nullptr;

String deviceId;
String deviceName;
String roomId;
String roomName;
float wheelRadiusM = 0.30f;
bool centralConnected = false;
uint16_t activeConnId = 0;
uint16_t activeMtu = 512;
bool recording = false;
String actionLabel;
uint32_t telemetrySeq = 0;
uint32_t lastTelemetryMs = 0;
uint32_t lastDisplayMs = 0;
uint32_t lastButtonMs = 0;
uint32_t recordStartMs = 0;
uint64_t timeBaseEpochMs = 0;
uint32_t timeBaseLocalMs = 0;
float gyroZOffset = 0.0f;
float filteredGyroZ = 0.0f;
float distanceM = 0.0f;
float velocityMs = 0.0f;
float accelMs2 = 0.0f;
float previousVelocityMs = 0.0f;
uint32_t lastMotionMs = 0;
bool pairMode = true;

enum class ScreenMode : uint8_t {
  dashboard,
  menu,
  pair,
  info,
  calibrating,
  fallAlert,
};

enum class FallState : uint8_t {
  monitoring,
  freefall,
  impactWait,
  stillWait,
  alertPending,
  alerted,
};

ScreenMode screenMode = ScreenMode::dashboard;
uint8_t dashboardPage = 0;
uint8_t menuIndex = 0;
FallState fallState = FallState::monitoring;
uint8_t fallSensitivity = 1;
uint8_t fallAlertSeq = 0;
bool fallTestMode = false;
uint32_t fallAlertStartMs = 0;
uint32_t freefallStartMs = 0;
uint32_t impactMs = 0;
uint32_t stillStartMs = 0;
float fallPeakG = 0.0f;
const char* fallCancelSource = "device_button";
bool buzzerOn = false;
uint32_t buzzerToggleMs = 0;
uint8_t sleepOptionIndex = 1;
uint32_t lastActivityMs = 0;
bool screenAsleep = false;
uint32_t recoverStartMs = 0;
uint32_t recoverLastMotionMs = 0;
float stableAx = 0.0f;
float stableAy = 0.0f;
float stableAz = 1.0f;
float baseAx = 0.0f;
float baseAy = 0.0f;
float baseAz = 1.0f;
float preFallAx = 0.0f;
float preFallAy = 0.0f;
float preFallAz = 1.0f;

uint32_t fallCountdownMs() {
  return fallTestMode ? FALL_TEST_COUNTDOWN_MS : FALL_ALERT_COUNTDOWN_MS;
}

bool fallAlertActive() {
  return fallState == FallState::alertPending || fallState == FallState::alerted;
}

struct ButtonState {
  bool lastReading = false;
  bool stablePressed = false;
  bool pressedEvent = false;
  uint32_t lastChangeMs = 0;
};

ButtonState buttonA;
ButtonState buttonB;
ButtonState buttonC;

enum class ImuDriver : uint8_t {
  none,
  mpu6886,
  bmi270,
};

struct SensorFrame {
  float ax = 0.0f;
  float ay = 0.0f;
  float az = 1.0f;
  float gx = 0.0f;
  float gy = 0.0f;
  float gz = 0.0f;
  bool imuValid = false;
  int batteryPercent = -1;
  int batteryVoltageMv = -1;
  bool charging = false;
};

SensorFrame sensorFrame;
ImuDriver imuDriver = ImuDriver::none;
uint8_t imuAddress = 0;

struct PendingWrite {
  String payload;
  uint32_t receivedMs = 0;
};

PendingWrite pendingCommand;
PendingWrite pendingRoom;
PendingWrite pendingTime;

String defaultDeviceId() {
  uint64_t mac = ESP.getEfuseMac();
  char buf[24];
  snprintf(buf, sizeof(buf), "M5_%04X%08X", (uint16_t)(mac >> 32), (uint32_t)mac);
  return String(buf);
}

uint64_t epochMs(uint32_t nowMs) {
  if (timeBaseEpochMs == 0) {
    return 0;
  }
  return timeBaseEpochMs + static_cast<uint64_t>(nowMs - timeBaseLocalMs);
}

String isoTimestamp(uint32_t nowMs) {
  uint64_t epoch = epochMs(nowMs);
  if (epoch == 0) {
    return "";
  }

  time_t seconds = static_cast<time_t>(epoch / 1000ULL);
  struct tm utc = {};
  if (!gmtime_r(&seconds, &utc)) {
    return "";
  }
  char buf[32];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &utc);
  return String(buf);
}

void loadConfig() {
  prefs.begin("wheelsense", true);
  deviceId = prefs.getString("dev", defaultDeviceId());
  deviceName = prefs.getString("name", deviceId);
  roomId = prefs.getString("roomId", "");
  roomName = prefs.getString("roomName", "");
  wheelRadiusM = prefs.getFloat("wheelR", 0.30f);
  fallSensitivity = prefs.getUChar("fallSens", 1);
  if (fallSensitivity > 2) {
    fallSensitivity = 1;
  }
  sleepOptionIndex = prefs.getUChar("sleepIdx", 1);
  if (sleepOptionIndex >= SLEEP_OPTION_COUNT) {
    sleepOptionIndex = 1;
  }
  prefs.end();
  if (deviceName.length() == 0) {
    deviceName = deviceId;
  }
}

void saveConfig() {
  prefs.begin("wheelsense", false);
  prefs.putString("dev", deviceId);
  prefs.putString("name", deviceName);
  prefs.putString("roomId", roomId);
  prefs.putString("roomName", roomName);
  prefs.putFloat("wheelR", wheelRadiusM);
  prefs.putUChar("fallSens", fallSensitivity);
  prefs.putUChar("sleepIdx", sleepOptionIndex);
  prefs.end();
}

uint16_t color565(uint8_t r, uint8_t g, uint8_t b) {
  return display.color565(r, g, b);
}

uint16_t mix565(uint16_t c1, uint16_t c2, uint8_t t) {
  uint8_t r1 = (c1 >> 11) & 0x1F;
  uint8_t g1 = (c1 >> 5) & 0x3F;
  uint8_t b1 = c1 & 0x1F;
  uint8_t r2 = (c2 >> 11) & 0x1F;
  uint8_t g2 = (c2 >> 5) & 0x3F;
  uint8_t b2 = c2 & 0x1F;
  uint8_t r = static_cast<uint8_t>(((r1 * (255 - t)) + (r2 * t)) / 255);
  uint8_t g = static_cast<uint8_t>(((g1 * (255 - t)) + (g2 * t)) / 255);
  uint8_t b = static_cast<uint8_t>(((b1 * (255 - t)) + (b2 * t)) / 255);
  return static_cast<uint16_t>((r << 11) | (g << 5) | b);
}

String trimText(String text, uint8_t maxChars) {
  if (text.length() <= maxChars) {
    return text;
  }
  if (maxChars <= 2) {
    return text.substring(0, maxChars);
  }
  return text.substring(0, maxChars - 2) + "..";
}

// Diff-redraw: erase only the previous glyphs, then print the new value.
// Avoids full-screen clears that caused visible flicker.
struct TextField {
  char prev[40] = "";
  uint16_t prevColor = 0;
};

void resetField(TextField& f) {
  f.prev[0] = '\0';
  f.prevColor = 0;
}

void drawChangedText(TextField& f, const String& next, int x, int y, uint8_t size, uint16_t color, uint16_t eraseColor, uint8_t datum = TL_DATUM) {
  const char* s = next.c_str();
  if (f.prev[0] != '\0' && f.prevColor == color && strcmp(f.prev, s) == 0) {
    return;
  }
  display.setTextSize(size);
  display.setTextDatum(datum);
  if (f.prev[0] != '\0') {
    display.setTextColor(eraseColor);
    display.drawString(f.prev, x, y);
  }
  strlcpy(f.prev, s, sizeof(f.prev));
  f.prevColor = color;
  display.setTextColor(color);
  display.drawString(f.prev, x, y);
  display.setTextDatum(TL_DATUM);
}

void initPowerAndButtons() {
  pinMode(HOLD_PIN, OUTPUT);
  digitalWrite(HOLD_PIN, HIGH);
  pinMode(BUTTON_A_PIN, INPUT);
  pinMode(BUTTON_B_PIN, INPUT);
  pinMode(BUTTON_C_PIN, INPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(BATTERY_ADC_PIN, INPUT);
  analogSetPinAttenuation(BATTERY_ADC_PIN, ADC_11db);
}

void initDisplay() {
  display.init();
  display.setRotation(1);
  #ifdef TFT_BL
  pinMode(TFT_BL, OUTPUT);
  digitalWrite(TFT_BL, TFT_BACKLIGHT_ON);
  #endif
  display.fillScreen(TFT_BLACK);
  display.setTextDatum(TL_DATUM);
  display.setTextColor(COLOR_TEXT);
  display.setTextFont(1);
  display.setTextSize(1);
}

void drawVerticalGradient(uint16_t topColor, uint16_t bottomColor) {
  const int h = display.height();
  const int w = display.width();
  for (int y = 0; y < h; ++y) {
    uint8_t t = h > 1 ? static_cast<uint8_t>((y * 255) / (h - 1)) : 0;
    display.drawFastHLine(0, y, w, mix565(topColor, bottomColor, t));
  }
}

void clearDisplay() {
  drawVerticalGradient(COLOR_BG, 0x0843);
  display.setTextFont(1);
  display.setTextSize(1);
  display.setTextDatum(TL_DATUM);
  display.setTextColor(COLOR_TEXT);
}

void drawHeader(const String& title) {
  const int w = display.width();
  display.fillRoundRect(4, 4, w - 8, 22, 6, COLOR_HEADER);
  display.fillRoundRect(6, 6, w - 12, 18, 5, COLOR_HEADER_INNER);
  display.fillRect(10, 10, 3, 10, COLOR_PRIMARY);
  display.fillCircle(w - 16, 15, 3, centralConnected ? COLOR_PRIMARY : COLOR_WARNING);
  display.setTextColor(COLOR_TEXT);
  display.setTextDatum(MC_DATUM);
  display.setTextSize(1);
  display.drawString(trimText(title, 26), w / 2, 15);
  display.setTextDatum(TL_DATUM);
}

void drawFooter(const char* left, const char* center, const char* right) {
  const int w = display.width();
  const int y = display.height() - 12;
  display.setTextSize(1);
  display.setTextColor(COLOR_DIM);
  if (left && left[0]) {
    display.setTextDatum(ML_DATUM);
    display.drawString(left, 4, y);
  }
  if (center && center[0]) {
    display.setTextDatum(MC_DATUM);
    display.drawString(center, w / 2, y);
  }
  if (right && right[0]) {
    display.setTextDatum(MR_DATUM);
    display.drawString(right, w - 4, y);
  }
  display.setTextDatum(TL_DATUM);
}

void drawBootScreen(const char* subtitle, uint8_t progressPct) {
  clearDisplay();
  const int w = display.width();

  display.fillRoundRect(12, 28, 54, 54, 8, COLOR_PANEL_2);
  display.fillCircle(39, 55, 18, COLOR_CYAN);
  display.fillCircle(39, 55, 9, COLOR_BG);
  display.drawLine(39, 55, 57, 38, COLOR_TEXT);

  display.setTextColor(COLOR_TEXT);
  display.setTextSize(2);
  display.setTextDatum(TL_DATUM);
  display.drawString("WheelSense", 78, 34);
  display.setTextSize(1);
  display.setTextColor(COLOR_CYAN);
  display.drawString("BLE Gateway", 80, 58);
  display.setTextColor(COLOR_DIM);
  display.drawString(FIRMWARE_VERSION, 80, 73);
  display.setTextColor(COLOR_TEXT);
  display.drawString(subtitle, 18, 94);

  const int barX = 18;
  const int barY = 110;
  const int barW = w - 36;
  display.drawRoundRect(barX, barY, barW, 12, 5, COLOR_DIM);
  const int fillW = constrain(static_cast<int>((barW * progressPct) / 100), 0, barW);
  if (fillW > 0) {
    display.fillRect(barX, barY + 1, fillW, 10, COLOR_PRIMARY);
  }
}

// Incremental bar update: no full-screen redraw while booting.
int bootLastFillW = -1;

void updateBootProgress(uint8_t progressPct) {
  const int w = display.width();
  const int barX = 18;
  const int barY = 110;
  const int barW = w - 36;
  const int fillW = constrain(static_cast<int>((barW * progressPct) / 100), 0, barW);
  if (fillW == bootLastFillW) {
    return;
  }
  if (bootLastFillW < 0 || fillW < bootLastFillW) {
    display.fillRect(barX, barY + 1, fillW, 10, COLOR_BG);
  } else {
    display.fillRect(barX + bootLastFillW, barY + 1, fillW - bootLastFillW, 10, COLOR_PRIMARY);
  }
  bootLastFillW = fillW;
}

void drawCalibrationScreenStatic() {
  clearDisplay();
  drawHeader("Calibrate 0");
  display.fillRoundRect(8, 36, display.width() - 16, 72, 7, COLOR_PANEL);
  display.setTextColor(COLOR_TEXT);
  display.setTextDatum(TL_DATUM);
  display.setTextSize(2);
  display.drawString("Keep still", 18, 46);
  display.setTextSize(1);
  display.setTextColor(COLOR_DIM);
  display.drawString("Place device flat for zero gyro", 18, 70);
  display.drawRoundRect(18, 90, display.width() - 36, 10, 5, COLOR_DIM);
  drawFooter("", "Auto start", "");
}

void updateCalibrationProgress(uint32_t remainingMs) {
  static TextField secField;
  const uint32_t clampedRemaining = remainingMs > 3000 ? 3000 : remainingMs;
  const uint32_t done = 3000 - clampedRemaining;
  const int totalW = display.width() - 36;
  const int barW = map(static_cast<long>(done), 0, 3000, 0, totalW);
  display.fillRect(19, 91, barW > 0 ? barW : 1, 8, COLOR_PRIMARY);
  drawChangedText(secField, String((remainingMs + 999) / 1000) + "s", 190, 70, 1, COLOR_WARNING, COLOR_PANEL);
}

void showBootSequence(const char* subtitle) {
  drawBootScreen(subtitle, 0);
  const uint32_t started = millis();
  while (millis() - started < BOOT_DURATION_MS) {
    const uint32_t elapsed = millis() - started;
    uint8_t progress = static_cast<uint8_t>((elapsed * 100) / BOOT_DURATION_MS);
    updateBootProgress(progress);
    delay(60);
  }
  updateBootProgress(100);
}

uint32_t screenSleepTimeoutMs() {
  return SLEEP_TIMEOUT_OPTIONS_MS[sleepOptionIndex];
}

void setBacklight(bool on) {
  #ifdef TFT_BL
  digitalWrite(TFT_BL, on ? TFT_BACKLIGHT_ON : !TFT_BACKLIGHT_ON);
  #endif
}

void wakeScreen(uint32_t nowMs) {
  if (screenAsleep) {
    setBacklight(true);
    screenAsleep = false;
  }
  lastActivityMs = nowMs;
}

void sleepScreen() {
  setBacklight(false);
  screenAsleep = true;
}

void drawMenu() {
  char sleepLabel[24];
  const uint32_t sleepMs = screenSleepTimeoutMs();
  if (sleepMs == 0) {
    snprintf(sleepLabel, sizeof(sleepLabel), "Sleep: Off");
  } else {
    snprintf(sleepLabel, sizeof(sleepLabel), "Sleep: %lus", static_cast<unsigned long>(sleepMs / 1000));
  }
  const char* items[] = {
    "Pair with Phone",
    "Unpair Phone",
    "Device Name",
    "Calibrate 0",
    "Reset Distance",
    "Battery / Info",
    sleepLabel,
    "Test Fall",
    "Dashboard",
  };
  constexpr uint8_t itemCount = sizeof(items) / sizeof(items[0]);
  static_assert(itemCount == kMenuItemCount, "menu item count mismatch");
  clearDisplay();
  drawHeader("Main Menu");

  const int topY = 30;
  const int itemH = 15;
  const int maxVisible = max(1, (display.height() - topY - 18) / itemH);
  int startIdx = 0;
  if (menuIndex >= maxVisible) {
    startIdx = menuIndex - maxVisible + 1;
  }
  if (startIdx > static_cast<int>(itemCount) - maxVisible) {
    startIdx = static_cast<int>(itemCount) - maxVisible;
  }
  if (startIdx < 0) {
    startIdx = 0;
  }

  int visible = itemCount - startIdx;
  if (visible > maxVisible) {
    visible = maxVisible;
  }

  for (int i = 0; i < visible; ++i) {
    const int idx = startIdx + i;
    const int y = topY + i * itemH;
    const bool active = idx == menuIndex;
    const uint16_t fill = active ? COLOR_PRIMARY : COLOR_PANEL_2;
    const uint16_t text = active ? COLOR_BG : COLOR_TEXT;
    display.fillRoundRect(6, y, display.width() - 12, itemH - 2, 4, fill);
    display.setTextColor(text);
    display.setTextDatum(ML_DATUM);
    display.setTextSize(1);
    display.drawString(items[idx], 12, y + (itemH / 2) - 1);
  }
  drawFooter("M5:ENTER", "Side:NEXT", "Power:BACK");
}

String fmtFloat(float value, uint8_t digits) {
  return String(value, static_cast<unsigned int>(digits));
}

void drawStatusChip(int x, int y, int w, const String& label, uint16_t fillColor, bool darkText) {
  display.fillRoundRect(x, y, w, 12, 3, fillColor);
  display.setTextSize(1);
  display.setTextDatum(MC_DATUM);
  display.setTextColor(darkText ? COLOR_BG : COLOR_TEXT);
  display.drawString(label, x + w / 2, y + 6);
  display.setTextDatum(TL_DATUM);
}

struct ChipField {
  char prev[12] = "";
  uint16_t prevFill = 0;
  bool prevDark = false;
  bool drawn = false;
};

int8_t dashboardDrawnPage = -1;
ChipField chipConn, chipImu, chipBat, chipRec;
TextField dashLink, dashSpeed, dashDist, dashAccel;
TextField dashAx, dashAy, dashAz, dashGx, dashGy, dashGz, dashBat, dashVolt, dashBle;
TextField dashHistMax;

constexpr int kSpeedHistoryBars = 55;
float speedHistory[kSpeedHistoryBars] = {0};
int speedHistorySize = 0;

void pushSpeedHistory(float v) {
  if (speedHistorySize < kSpeedHistoryBars) {
    speedHistory[speedHistorySize++] = v;
  } else {
    memmove(speedHistory, speedHistory + 1, sizeof(float) * (kSpeedHistoryBars - 1));
    speedHistory[kSpeedHistoryBars - 1] = v;
  }
}

void resetDashboardFields() {
  struct { ChipField* c; } chips[] = {&chipConn, &chipImu, &chipBat, &chipRec};
  for (auto& e : chips) {
    e.c->prev[0] = '\0';
    e.c->prevFill = 0;
    e.c->prevDark = false;
    e.c->drawn = false;
  }
  TextField* fields[] = {&dashLink, &dashSpeed, &dashDist, &dashAccel,
                         &dashAx, &dashAy, &dashAz, &dashGx, &dashGy, &dashGz,
                         &dashBat, &dashVolt, &dashBle};
  for (TextField* f : fields) {
    resetField(*f);
  }
}

void drawChipDiff(ChipField& chip, int x, int y, int w, const String& label, uint16_t fillColor, bool darkText) {
  if (chip.drawn && chip.prevFill == fillColor && chip.prevDark == darkText && strcmp(chip.prev, label.c_str()) == 0) {
    return;
  }
  drawStatusChip(x, y, w, label, fillColor, darkText);
  strlcpy(chip.prev, label.c_str(), sizeof(chip.prev));
  chip.prevFill = fillColor;
  chip.prevDark = darkText;
  chip.drawn = true;
}

void drawMetricRowStatic(int y, const char* label) {
  display.fillRoundRect(4, y, display.width() - 8, 20, 4, COLOR_PANEL);
  display.setTextDatum(ML_DATUM);
  display.setTextSize(1);
  display.setTextColor(COLOR_CYAN);
  display.drawString(label, 10, y + 10);
  display.setTextDatum(TL_DATUM);
}

void drawDashboardStatic() {
  const int w = display.width();
  clearDisplay();
  resetDashboardFields();
  drawHeader(dashboardPage == 0 ? "Dashboard" : (dashboardPage == 1 ? "IMU Raw" : "Speed History"));

  if (dashboardPage == 0) {
    const int y = 46;
    display.fillRect(4, y - 2, w - 8, 14, COLOR_PANEL);
    drawMetricRowStatic(60, "Speed");
    drawMetricRowStatic(83, "Dist");
    drawMetricRowStatic(106, "Accel");
  } else if (dashboardPage == 1) {
    display.fillRoundRect(4, 32, w - 8, 84, 6, COLOR_PANEL);
    display.setTextSize(1);
    display.setTextDatum(TL_DATUM);
    display.setTextColor(COLOR_DIM);
    display.drawString("AX:", 10, 36);
    display.drawString("AY:", w / 2, 36);
    display.drawString("AZ:", 10, 52);
    display.drawString("GX:", w / 2, 52);
    display.drawString("GY:", 10, 68);
    display.drawString("GZ:", w / 2, 68);
    display.setTextColor(COLOR_TEXT);
    display.drawString("Bat:", 10, 84);
    display.drawString("Name:", 10, 98);
    display.setTextColor(COLOR_CYAN);
    display.drawString("BLE:", 10, 112);
  } else if (dashboardPage == 2) {
    display.fillRoundRect(4, 30, w - 8, 88, 6, COLOR_PANEL);
    display.setTextSize(1);
    display.setTextDatum(TL_DATUM);
    display.setTextColor(COLOR_CYAN);
    display.drawString("Speed m/s (last ~11s)", 12, 34);
    display.setTextColor(COLOR_DIM);
    display.drawFastHLine(12, 110, w - 24, COLOR_DIM);
  }

  drawFooter("M5:PAIR", "Side:PAGE", "Power:MENU");
  dashboardDrawnPage = static_cast<int8_t>(dashboardPage);
}

void updateDashboardDynamic() {
  const int w = display.width();
  pushSpeedHistory(fabsf(velocityMs));
  if (dashboardPage == 0) {
    drawChipDiff(chipConn, 4, 30, 58, centralConnected ? "PHONE" : "PAIR",
                 centralConnected ? COLOR_PRIMARY : COLOR_WARNING, true);
    drawChipDiff(chipImu, 64, 30, 46, sensorFrame.imuValid ? "IMU" : "NOIMU",
                 sensorFrame.imuValid ? COLOR_PRIMARY : COLOR_ERROR, sensorFrame.imuValid);
    drawChipDiff(chipBat, 112, 30, 42, sensorFrame.batteryPercent >= 0 ? "BAT" : "--",
                 sensorFrame.batteryPercent >= 20 ? COLOR_PRIMARY : COLOR_WARNING, true);
    drawChipDiff(chipRec, 156, 30, w - 160, recording ? "REC" : "BLE",
                 recording ? COLOR_WARNING : (centralConnected ? COLOR_PRIMARY : COLOR_PANEL_2),
                 recording || centralConnected);

    drawChangedText(dashLink,
                    trimText(centralConnected ? "Flutter phone connected" : "Flutter > Pair > Scan BLE", 36),
                    10, 46, 1, centralConnected ? COLOR_PRIMARY : COLOR_WARNING, COLOR_PANEL);
    drawChangedText(dashSpeed, fmtFloat(velocityMs, 2) + " m/s", w - 10, 70, 2, COLOR_PRIMARY, COLOR_PANEL, MR_DATUM);
    drawChangedText(dashDist, fmtFloat(distanceM, 2) + " m", w - 10, 93, 2, COLOR_PRIMARY, COLOR_PANEL, MR_DATUM);
    drawChangedText(dashAccel, fmtFloat(accelMs2, 2) + " m/s2", w - 10, 116, 2, COLOR_PRIMARY, COLOR_PANEL, MR_DATUM);
  } else if (dashboardPage == 1) {
    const int x1 = 34;
    const int x2 = w / 2 + 24;
    drawChangedText(dashAx, fmtFloat(sensorFrame.ax, 3), x1, 36, 1, COLOR_TEXT, COLOR_PANEL);
    drawChangedText(dashAy, fmtFloat(sensorFrame.ay, 3), x2, 36, 1, COLOR_TEXT, COLOR_PANEL);
    drawChangedText(dashAz, fmtFloat(sensorFrame.az, 3), x1, 52, 1, COLOR_TEXT, COLOR_PANEL);
    drawChangedText(dashGx, fmtFloat(sensorFrame.gx, 1), x2, 52, 1, COLOR_CYAN, COLOR_PANEL);
    drawChangedText(dashGy, fmtFloat(sensorFrame.gy, 1), x1, 68, 1, COLOR_CYAN, COLOR_PANEL);
    drawChangedText(dashGz, fmtFloat(sensorFrame.gz, 1), x2, 68, 1, COLOR_CYAN, COLOR_PANEL);
    drawChangedText(dashBat,
                    (sensorFrame.batteryPercent >= 0 ? String(sensorFrame.batteryPercent) + "%" : String("--"))
                        + " " + (sensorFrame.batteryVoltageMv > 0 ? fmtFloat(sensorFrame.batteryVoltageMv / 1000.0f, 2) + "V" : String("n/a")),
                    44, 84, 1, COLOR_TEXT, COLOR_PANEL);
    drawChangedText(dashVolt, trimText(deviceName, 22), 44, 98, 1, COLOR_TEXT, COLOR_PANEL);
    drawChangedText(dashBle, centralConnected ? "Connected" : "Advertising", 40, 112, 1, COLOR_CYAN, COLOR_PANEL);
  } else if (dashboardPage == 2) {
    float maxV = 0.5f;
    for (int i = 0; i < speedHistorySize; ++i) {
      if (speedHistory[i] > maxV) {
        maxV = speedHistory[i];
      }
    }
    const int plotBottom = 108;
    const int plotTop = 46;
    const int plotH = plotBottom - plotTop;
    for (int i = 0; i < speedHistorySize; ++i) {
      const int x = 8 + i * 4;
      display.fillRect(x, plotTop, 3, plotH, COLOR_PANEL);
      const int barH = static_cast<int>((speedHistory[i] / maxV) * plotH);
      if (barH > 0) {
        display.fillRect(x, plotBottom - barH, 3, barH, COLOR_PRIMARY);
      }
    }
    drawChangedText(dashHistMax, "peak " + fmtFloat(maxV, 2) + " m/s", 12, 113, 1, COLOR_DIM, COLOR_PANEL);
    drawChangedText(dashSpeed, fmtFloat(velocityMs, 2) + " m/s", w - 12, 34, 1, COLOR_TEXT, COLOR_PANEL, MR_DATUM);
  }
}

void drawDashboard() {
  if (dashboardDrawnPage != static_cast<int8_t>(dashboardPage)) {
    drawDashboardStatic();
  }
  updateDashboardDynamic();
}

void drawPairScreen() {
  clearDisplay();
  drawHeader("Phone Pairing");
  display.fillRoundRect(8, 34, display.width() - 16, 76, 7, COLOR_PANEL);
  display.setTextDatum(TL_DATUM);
  display.setTextSize(2);
  display.setTextColor(centralConnected ? COLOR_PRIMARY : COLOR_WARNING);
  display.drawString(centralConnected ? "Connected" : "Advertising", 18, 44);
  display.setTextSize(1);
  display.setTextColor(COLOR_TEXT);
  display.drawString("Name: " + trimText(deviceName, 24), 18, 70);
  display.setTextColor(COLOR_DIM);
  display.drawString("ID: " + trimText(deviceId, 26), 18, 84);
  display.setTextColor(COLOR_CYAN);
  display.drawString("Flutter app > Pair > Scan BLE", 18, 98);
  drawFooter("M5:ADV", "Side:UNPAIR", "Power:BACK");
}

void drawInfoLine(int& y, const char* label, const String& value, uint16_t valueColor = COLOR_TEXT) {
  display.setTextSize(1);
  display.setTextDatum(TL_DATUM);
  display.setTextColor(COLOR_DIM);
  display.drawString(label, 12, y);
  display.setTextColor(valueColor);
  display.drawString(trimText(value, 25), 86, y);
  y += 12;
}

void drawInfoScreen() {
  clearDisplay();
  drawHeader("Device Info");
  display.fillRoundRect(6, 32, display.width() - 12, 86, 6, COLOR_PANEL);
  int y = 38;
  drawInfoLine(y, "Name", deviceName, COLOR_PRIMARY);
  drawInfoLine(y, "Phone", centralConnected ? "Connected" : "Pair from Flutter", centralConnected ? COLOR_PRIMARY : COLOR_WARNING);
  drawInfoLine(y, "Battery", sensorFrame.batteryPercent >= 0 ? String(sensorFrame.batteryPercent) + "% / " + fmtFloat(sensorFrame.batteryVoltageMv / 1000.0f, 2) + "V" : "n/a");
  drawInfoLine(y, "IMU", sensorFrame.imuValid ? "OK" : "Waiting", sensorFrame.imuValid ? COLOR_PRIMARY : COLOR_WARNING);
  drawInfoLine(y, "Wheel R", fmtFloat(wheelRadiusM, 2) + " m");
  drawInfoLine(y, "FW", FIRMWARE_VERSION);
  display.setTextColor(COLOR_CYAN);
  display.drawString("Rename in Flutter after pairing", 12, 110);
  drawFooter("M5:PAIR", "Side:MENU", "Power:BACK");
}

void drawFallAlert() {
  static uint8_t drawnSeq = 0;
  static int8_t drawnState = -1;
  static int8_t drawnBlink = -1;
  static TextField countField;
  const int w = display.width();
  const int8_t state = fallState == FallState::alerted ? 1 : 0;
  const int8_t blink = state == 1 && ((millis() / 350) & 1) == 0 ? 1 : 0;
  if (drawnSeq != fallAlertSeq || drawnState != state || drawnBlink != blink) {
    const bool inverted = state == 1 && blink == 0;
    const uint16_t bg = inverted ? COLOR_TEXT : COLOR_ERROR;
    const uint16_t fg = inverted ? COLOR_ERROR : COLOR_TEXT;
    display.fillScreen(bg);
    resetField(countField);
    display.setTextDatum(MC_DATUM);
    display.setTextColor(fg);
    if (state == 0) {
      display.setTextSize(2);
      display.drawString("FALL DETECTED?", w / 2, 34);
      display.setTextSize(1);
      display.drawString("M5: I'M OK", w / 2, display.height() - 16);
    } else {
      display.setTextSize(3);
      display.drawString("HELP SENT", w / 2, 52);
      display.setTextSize(1);
      display.drawString(fallTestMode ? "TEST ALERT" : "Emergency contacts notified", w / 2, 86);
      display.drawString("M5: CLEAR", w / 2, display.height() - 16);
    }
    display.setTextDatum(TL_DATUM);
    drawnSeq = fallAlertSeq;
    drawnState = state;
    drawnBlink = blink;
  }
  if (state == 0) {
    const uint32_t elapsed = millis() - fallAlertStartMs;
    const uint32_t countdown = fallCountdownMs();
    const uint32_t remainingS = elapsed >= countdown ? 0 : (countdown - elapsed + 999) / 1000;
    drawChangedText(countField, String(remainingS), w / 2, 78, 6, COLOR_TEXT, COLOR_ERROR, MC_DATUM);
  }
}

void redrawScreen(bool force = false) {
  if (screenAsleep) {
    return;
  }
  const uint32_t now = millis();
  if (!force && now - lastDisplayMs < DISPLAY_UPDATE_INTERVAL_MS && screenMode == ScreenMode::dashboard) {
    return;
  }
  const uint32_t staticInterval =
      screenMode == ScreenMode::fallAlert ? 300 : STATIC_DISPLAY_UPDATE_INTERVAL_MS;
  if (!force && now - lastDisplayMs < staticInterval && screenMode != ScreenMode::dashboard) {
    return;
  }
  lastDisplayMs = now;
  if (force && screenMode == ScreenMode::dashboard) {
    dashboardDrawnPage = -1;
  }
  switch (screenMode) {
    case ScreenMode::dashboard:
      drawDashboard();
      break;
    case ScreenMode::menu:
      drawMenu();
      break;
    case ScreenMode::pair:
      drawPairScreen();
      break;
    case ScreenMode::info:
      drawInfoScreen();
      break;
    case ScreenMode::calibrating:
      break;
    case ScreenMode::fallAlert:
      drawFallAlert();
      break;
  }
}

bool i2cWrite(uint8_t addr, uint8_t reg, const uint8_t* data, size_t len) {
  Wire.beginTransmission(addr);
  Wire.write(reg);
  Wire.write(data, len);
  return Wire.endTransmission() == 0;
}

bool i2cWrite8(uint8_t addr, uint8_t reg, uint8_t value) {
  return i2cWrite(addr, reg, &value, 1);
}

bool i2cRead(uint8_t addr, uint8_t reg, uint8_t* data, size_t len) {
  Wire.beginTransmission(addr);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) {
    return false;
  }
  const size_t received = Wire.requestFrom(static_cast<int>(addr), static_cast<int>(len));
  if (received != len) {
    return false;
  }
  for (size_t i = 0; i < len; ++i) {
    data[i] = Wire.read();
  }
  return true;
}

uint8_t i2cRead8(uint8_t addr, uint8_t reg) {
  uint8_t value = 0;
  i2cRead(addr, reg, &value, 1);
  return value;
}

int16_t be16(const uint8_t* data) {
  return static_cast<int16_t>((static_cast<uint16_t>(data[0]) << 8) | data[1]);
}

int16_t le16(const uint8_t* data) {
  return static_cast<int16_t>((static_cast<uint16_t>(data[1]) << 8) | data[0]);
}

bool beginMpu6886() {
  const uint8_t whoAmI = i2cRead8(MPU6886_ADDR, 0x75);
  if (whoAmI != 0x19 && whoAmI != 0x68 && whoAmI != 0x71) {
    return false;
  }

  i2cWrite8(MPU6886_ADDR, 0x6B, 0x80);
  delay(100);
  const uint8_t init[][2] = {
    {0x6B, 0x01}, // PWR_MGMT_1
    {0x1C, 0x10}, // ACCEL_CONFIG +-8G
    {0x1B, 0x18}, // GYRO_CONFIG +-2000 dps
    {0x1A, 0x01}, // CONFIG
    {0x19, 0x03}, // SMPLRT_DIV
    {0x37, 0xC0}, // INT_PIN_CFG
    {0x38, 0x00}, // INT_ENABLE
    {0x1D, 0x00}, // ACCEL_CONFIG2
    {0x6A, 0x00}, // USER_CTRL
    {0x23, 0x00}, // FIFO_EN
  };
  for (const auto& item : init) {
    i2cWrite8(MPU6886_ADDR, item[0], item[1]);
    delay(2);
  }
  imuDriver = ImuDriver::mpu6886;
  imuAddress = MPU6886_ADDR;
  Serial.printf("[IMU] MPU6886-compatible device detected: 0x%02X\n", whoAmI);
  return true;
}

bool uploadBmi270Config(uint8_t addr) {
  size_t offset = 0;
  while (offset < sizeof(bmi270_config_file)) {
    const size_t remaining = sizeof(bmi270_config_file) - offset;
    const size_t chunk = remaining > 16 ? 16 : remaining;
    uint8_t addrArray[2] = {
      static_cast<uint8_t>((offset >> 1) & 0x0F),
      static_cast<uint8_t>(offset >> 5),
    };
    if (!i2cWrite(addr, 0x5B, addrArray, sizeof(addrArray))) {
      return false;
    }
    if (!i2cWrite(addr, 0x5E, &bmi270_config_file[offset], chunk)) {
      return false;
    }
    offset += chunk;
    delayMicroseconds(450);
  }
  return true;
}

bool beginBmi270At(uint8_t addr) {
  const uint8_t whoAmI = i2cRead8(addr, 0x00);
  if (whoAmI != 0x24) {
    return false;
  }

  i2cWrite8(addr, 0x7E, 0xB6); // soft reset
  delay(15);
  i2cWrite8(addr, 0x7C, 0x00); // disable power save
  delay(2);
  i2cWrite8(addr, 0x59, 0x00); // prepare config upload
  if (!uploadBmi270Config(addr)) {
    return false;
  }
  i2cWrite8(addr, 0x59, 0x01); // complete config upload
  delay(25);
  i2cWrite8(addr, 0x58, 0xFF); // map data-ready interrupts
  i2cWrite8(addr, 0x7D, 0x0E); // enable accel, gyro, aux
  i2cWrite8(addr, 0x40, 0xA8); // accel normal mode
  i2cWrite8(addr, 0x41, 0x02); // +-8G
  i2cWrite8(addr, 0x42, 0xA9); // gyro normal mode
  i2cWrite8(addr, 0x43, 0x00); // +-2000 dps

  if ((i2cRead8(addr, 0x21) & 0x01) == 0) {
    Serial.println("[IMU] BMI270 config upload did not report init ok");
  }
  imuDriver = ImuDriver::bmi270;
  imuAddress = addr;
  Serial.printf("[IMU] BMI270 detected at 0x%02X\n", addr);
  return true;
}

void beginImu() {
  Wire.begin(INTERNAL_I2C_SDA, INTERNAL_I2C_SCL);
  Wire.setClock(400000);
  if (beginMpu6886()) {
    return;
  }
  if (beginBmi270At(BMI270_PRIMARY_ADDR) || beginBmi270At(BMI270_FALLBACK_ADDR)) {
    return;
  }
  imuDriver = ImuDriver::none;
  imuAddress = 0;
  Serial.println("[IMU] No supported internal IMU detected");
}

bool readMpu6886(SensorFrame& out) {
  uint8_t buf[14];
  if (!i2cRead(imuAddress, 0x3B, buf, sizeof(buf))) {
    return false;
  }
  static constexpr float accelScale = 8.0f / 32768.0f;
  static constexpr float gyroScale = 2000.0f / 32768.0f;
  out.ax = be16(&buf[0]) * accelScale;
  out.ay = be16(&buf[2]) * accelScale;
  out.az = be16(&buf[4]) * accelScale;
  out.gx = be16(&buf[8]) * gyroScale;
  out.gy = be16(&buf[10]) * gyroScale;
  out.gz = be16(&buf[12]) * gyroScale - gyroZOffset;
  return true;
}

bool readBmi270(SensorFrame& out) {
  uint8_t buf[12];
  if (!i2cRead(imuAddress, 0x0C, buf, sizeof(buf))) {
    return false;
  }
  static constexpr float accelScale = 8.0f / 32768.0f;
  static constexpr float gyroScale = 2000.0f / 32768.0f;
  out.ax = le16(&buf[0]) * accelScale;
  out.ay = le16(&buf[2]) * accelScale;
  out.az = le16(&buf[4]) * accelScale;
  out.gx = le16(&buf[6]) * gyroScale;
  out.gy = le16(&buf[8]) * gyroScale;
  out.gz = le16(&buf[10]) * gyroScale - gyroZOffset;
  return true;
}

void updateSensors() {
  const uint32_t nowMs = millis();
  bool ok = false;
  if (imuDriver == ImuDriver::mpu6886) {
    ok = readMpu6886(sensorFrame);
  } else if (imuDriver == ImuDriver::bmi270) {
    ok = readBmi270(sensorFrame);
  }
  sensorFrame.imuValid = ok;
  const uint32_t rawMv = analogReadMilliVolts(BATTERY_ADC_PIN);
  sensorFrame.batteryVoltageMv = rawMv > 0 ? static_cast<int>(rawMv * 2) : -1;
  if (sensorFrame.batteryVoltageMv > 0) {
    sensorFrame.batteryPercent = constrain(map(sensorFrame.batteryVoltageMv, 3300, 4200, 0, 100), 0, 100);
  } else {
    sensorFrame.batteryPercent = -1;
  }
  sensorFrame.charging = false;

  if (!ok) {
    return;
  }
  if (lastMotionMs == 0) {
    lastMotionMs = nowMs;
    return;
  }
  const float dt = (nowMs - lastMotionMs) / 1000.0f;
  lastMotionMs = nowMs;
  if (dt <= 0.0f || dt > 1.0f) {
    return;
  }

  filteredGyroZ = 0.35f * sensorFrame.gz + 0.65f * filteredGyroZ;
  float gyroDps = fabsf(filteredGyroZ) < 2.5f ? 0.0f : filteredGyroZ;
  velocityMs = gyroDps * 0.0174532925f * wheelRadiusM;
  accelMs2 = (velocityMs - previousVelocityMs) / dt;
  previousVelocityMs = velocityMs;
  distanceM += fabsf(velocityMs) * dt;
}

void calibrateImu() {
  if (imuDriver == ImuDriver::none || fallState != FallState::monitoring) {
    return;
  }
  Serial.println("[IMU] Calibrating gyro Z offset");
  screenMode = ScreenMode::calibrating;
  float sumZ = 0.0f;
  int samples = 0;
  const uint32_t startMs = millis();
  drawCalibrationScreenStatic();
  while (millis() - startMs < 3000) {
    const uint32_t elapsed = millis() - startMs;
    updateCalibrationProgress(3000 - (elapsed > 3000 ? 3000 : elapsed));
    SensorFrame frame;
    bool ok = false;
    if (imuDriver == ImuDriver::mpu6886) {
      ok = readMpu6886(frame);
    } else if (imuDriver == ImuDriver::bmi270) {
      ok = readBmi270(frame);
    }
    if (ok) {
      sumZ += frame.gz + gyroZOffset;
      samples++;
    }
    delay(2);
  }
  gyroZOffset = samples > 0 ? sumZ / samples : 0.0f;
  filteredGyroZ = 0.0f;
  velocityMs = 0.0f;
  accelMs2 = 0.0f;
  previousVelocityMs = 0.0f;
  lastActivityMs = millis();
  screenMode = ScreenMode::dashboard;
  redrawScreen(true);
  Serial.printf("[IMU] Gyro Z offset %.2f dps (%d samples)\n", gyroZOffset, samples);
}

void updateDeviceInfo() {
  StaticJsonDocument<768> doc;
  char buf[768];
  doc["device_id"] = deviceId;
  doc["device_name"] = deviceName;
  doc["device_type"] = "wheelchair";
  doc["hardware_type"] = "companion_m5";
  doc["firmware"] = FIRMWARE_VERSION;
  doc["model"] = "M5StickCPlus2";
  doc["transport"] = "ble";
  doc["service_uuid"] = SERVICE_UUID;
  doc["telemetry_uuid"] = TELEMETRY_UUID;
  doc["command_uuid"] = COMMAND_UUID;
  doc["ack_uuid"] = ACK_UUID;
  doc["room_config_uuid"] = ROOM_CONFIG_UUID;
  doc["time_sync_uuid"] = TIME_SYNC_UUID;
  doc["fall_alert_uuid"] = FALL_ALERT_UUID;
  doc["fall_detection"] = true;
  doc["room_id"] = roomId;
  doc["room_name"] = roomName;
  size_t n = serializeJson(doc, buf, sizeof(buf));
  if (deviceInfoChar && n > 0 && n < sizeof(buf)) {
    deviceInfoChar->setValue(reinterpret_cast<uint8_t*>(buf), n);
  }
}

void notifyAck(const char* command, const char* status, const char* message, const String& commandId = "") {
  if (!ackChar || !centralConnected) {
    return;
  }
  StaticJsonDocument<384> doc;
  char buf[384];
  doc["device_id"] = deviceId;
  doc["command"] = command;
  if (commandId.length() > 0) {
    doc["command_id"] = commandId;
  }
  doc["status"] = status;
  doc["message"] = message;
  doc["uptime_ms"] = millis();
  size_t n = serializeJson(doc, buf, sizeof(buf));
  if (n > 0 && n < sizeof(buf)) {
    ackChar->setValue(reinterpret_cast<uint8_t*>(buf), n);
    ackChar->notify();
  }
}

void notifyFallAlert(const char* event) {
  if (!centralConnected || !fallAlertChar) {
    return;
  }
  StaticJsonDocument<256> doc;
  char buf[256];
  const uint32_t nowMs = millis();
  doc["event"] = event;
  doc["device_id"] = deviceId;
  doc["uptime_ms"] = nowMs;
  const uint64_t ts = epochMs(nowMs);
  if (ts > 0) {
    doc["ts"] = ts;
  }
  if (strcmp(event, "fall_suspect") == 0) {
    doc["countdown_s"] = static_cast<int>(fallCountdownMs() / 1000);
  } else if (strcmp(event, "fall_detected") == 0) {
    doc["peak_g"] = fallPeakG;
    if (sensorFrame.batteryPercent >= 0) {
      doc["battery_pct"] = sensorFrame.batteryPercent;
    }
    doc["reason"] = "freefall_impact_stillness";
  } else if (strcmp(event, "fall_canceled") == 0) {
    doc["source"] = fallCancelSource;
  } else if (strcmp(event, "fall_test") == 0) {
    doc["reason"] = "test";
    if (fallPeakG > 0.0f) {
      doc["peak_g"] = fallPeakG;
    }
  }
  size_t n = serializeJson(doc, buf, sizeof(buf));
  if (n > 0 && n < sizeof(buf)) {
    fallAlertChar->setValue(reinterpret_cast<uint8_t*>(buf), n);
    fallAlertChar->notify();
  }
}

void enterAlertPending(uint32_t nowMs, bool testMode) {
  fallState = FallState::alertPending;
  fallTestMode = testMode;
  fallAlertStartMs = nowMs;
  recoverStartMs = 0;
  recoverLastMotionMs = 0;
  fallAlertSeq++;
  buzzerOn = false;
  buzzerToggleMs = 0;
  wakeScreen(nowMs);
  screenMode = ScreenMode::fallAlert;
  notifyFallAlert("fall_suspect");
  redrawScreen(true);
}

void cancelFallAlert(const char* source) {
  if (fallState != FallState::alertPending && fallState != FallState::alerted) {
    return;
  }
  noTone(BUZZER_PIN);
  buzzerOn = false;
  fallCancelSource = source;
  notifyFallAlert("fall_canceled");
  fallState = FallState::monitoring;
  fallTestMode = false;
  screenMode = ScreenMode::dashboard;
  redrawScreen(true);
}

void startFallTest() {
  fallPeakG = 0.0f;
  enterAlertPending(millis(), true);
}

void registerFallImpact(uint32_t nowMs, float impactG) {
  impactMs = nowMs;
  stillStartMs = 0;
  preFallAx = baseAx;
  preFallAy = baseAy;
  preFallAz = baseAz;
  fallPeakG = impactG;
  fallState = FallState::stillWait;
}

void updateFallDetection(uint32_t nowMs) {
  const float accelSvm = sqrtf(sensorFrame.ax * sensorFrame.ax + sensorFrame.ay * sensorFrame.ay +
                               sensorFrame.az * sensorFrame.az);
  const float gyroSvm = sqrtf(sensorFrame.gx * sensorFrame.gx + sensorFrame.gy * sensorFrame.gy +
                              sensorFrame.gz * sensorFrame.gz);

  // EMAs of the gravity direction, frozen during motion/impact.
  // fast = post-event orientation; slow = baseline from seconds ago so slow falls still register.
  if (sensorFrame.imuValid && fabsf(accelSvm - 1.0f) < FALL_STILL_BAND_G) {
    stableAx += STABLE_GRAVITY_ALPHA * (sensorFrame.ax - stableAx);
    stableAy += STABLE_GRAVITY_ALPHA * (sensorFrame.ay - stableAy);
    stableAz += STABLE_GRAVITY_ALPHA * (sensorFrame.az - stableAz);
    baseAx += BASE_GRAVITY_ALPHA * (sensorFrame.ax - baseAx);
    baseAy += BASE_GRAVITY_ALPHA * (sensorFrame.ay - baseAy);
    baseAz += BASE_GRAVITY_ALPHA * (sensorFrame.az - baseAz);
  }

  // Getting back up = ~1s episode of strong motion; brief dips don't reset it.
  if (fallAlertActive() && sensorFrame.imuValid) {
    const bool moving =
        gyroSvm > FALL_RECOVER_GYRO_DPS || fabsf(accelSvm - 1.0f) > FALL_RECOVER_ACCEL_G;
    if (moving) {
      recoverLastMotionMs = nowMs;
      if (recoverStartMs == 0) {
        recoverStartMs = nowMs;
      }
    } else if (nowMs - recoverLastMotionMs > FALL_RECOVER_GAP_MS) {
      recoverStartMs = 0;
    }
    if (recoverStartMs != 0 && nowMs - recoverStartMs >= FALL_RECOVER_MS) {
      cancelFallAlert("user_recovered");
      return;
    }
  }

  if (fallState == FallState::alertPending) {
    const uint32_t countdown = fallCountdownMs();
    const uint32_t elapsed = nowMs - fallAlertStartMs;
    const uint32_t remaining = elapsed >= countdown ? 0 : countdown - elapsed;
    const uint32_t beepPeriod = remaining <= 3000 ? 250 : 1000;
    if (buzzerOn && nowMs - buzzerToggleMs >= 100) {
      noTone(BUZZER_PIN);
      buzzerOn = false;
    } else if (!buzzerOn && nowMs - buzzerToggleMs >= beepPeriod) {
      tone(BUZZER_PIN, 2200);
      buzzerOn = true;
      buzzerToggleMs = nowMs;
    }
    if (elapsed >= countdown) {
      fallState = FallState::alerted;
      notifyFallAlert(fallTestMode ? "fall_test" : "fall_detected");
      redrawScreen(true);
    }
    return;
  }
  if (fallState == FallState::alerted) {
    if (nowMs - buzzerToggleMs >= FALL_SIREN_STEP_MS) {
      buzzerOn = !buzzerOn;
      tone(BUZZER_PIN, buzzerOn ? 2600 : 1800);
      buzzerToggleMs = nowMs;
    }
    return;
  }
  if (!sensorFrame.imuValid) {
    return;
  }

  const uint8_t sens = fallSensitivity > 2 ? 1 : fallSensitivity;
  const float freefallThreshG = FALL_FREEFALL_G[sens];
  const float impactThreshG = FALL_IMPACT_G[sens];
  const uint32_t stillRequiredMs = FALL_STILL_MS[sens];
  if (accelSvm > fallPeakG) {
    fallPeakG = accelSvm;
  }

  switch (fallState) {
    case FallState::monitoring:
      if (accelSvm < freefallThreshG) {
        fallState = FallState::freefall;
        freefallStartMs = nowMs;
        fallPeakG = accelSvm;
        fallTestMode = false;
      } else if (accelSvm >= impactThreshG) {
        // Body falls aren't ballistic: impact alone also arms the stillness check.
        registerFallImpact(nowMs, accelSvm);
      }
      break;
    case FallState::freefall:
      if (accelSvm >= impactThreshG) {
        registerFallImpact(nowMs, accelSvm);
      } else if (accelSvm < freefallThreshG) {
        if (nowMs - freefallStartMs >= FALL_FREEFALL_MIN_MS) {
          fallState = FallState::impactWait;
        }
      } else {
        fallState = FallState::monitoring;
      }
      break;
    case FallState::impactWait:
      if (accelSvm >= impactThreshG) {
        registerFallImpact(nowMs, accelSvm);
      } else if (nowMs - freefallStartMs > FALL_IMPACT_WINDOW_MS) {
        fallState = FallState::monitoring;
      }
      break;
    case FallState::stillWait:
      if (accelSvm >= impactThreshG) {
        registerFallImpact(nowMs, accelSvm); // second impact re-arms the window
      } else if (nowMs - impactMs > FALL_STILL_WINDOW_MS) {
        fallState = FallState::monitoring;
      } else {
        const bool still = fabsf(accelSvm - 1.0f) < FALL_STILL_BAND_G && gyroSvm < FALL_STILL_GYRO_DPS;
        if (still) {
          if (stillStartMs == 0) {
            stillStartMs = nowMs;
          }
          if (nowMs - stillStartMs >= stillRequiredMs) {
            const float sLen = sqrtf(stableAx * stableAx + stableAy * stableAy + stableAz * stableAz);
            const float pLen = sqrtf(preFallAx * preFallAx + preFallAy * preFallAy + preFallAz * preFallAz);
            const float cosA = sLen > 0.0f && pLen > 0.0f
                                   ? (stableAx * preFallAx + stableAy * preFallAy + stableAz * preFallAz) /
                                         (sLen * pLen)
                                   : 1.0f;
            if (cosA <= FALL_POSTURE_COS) {
              enterAlertPending(nowMs, false);
            } else if (cosA > FALL_POSTURE_COS_REJECT) {
              // Orientation unchanged — a bump/knock, not a posture-changing fall.
              fallState = FallState::monitoring;
            }
            // borderline band: keep waiting, re-evaluate on the next still sample
          }
        } else {
          stillStartMs = 0;
        }
      }
      break;
    default:
      break;
  }
}

void applyBleDeviceName() {
  if (deviceName.length() == 0) {
    deviceName = deviceId;
  }
  esp_ble_gap_set_device_name(deviceName.c_str());
  updateDeviceInfo();
}

void startPairAdvertising() {
  pairMode = true;
  BLEDevice::startAdvertising();
  screenMode = ScreenMode::pair;
  redrawScreen(true);
}

void disconnectPhone() {
  if (bleServer && centralConnected) {
    bleServer->disconnect(activeConnId);
  }
  centralConnected = false;
  BLEDevice::startAdvertising();
  screenMode = ScreenMode::pair;
  redrawScreen(true);
}

void resetMotionCounters() {
  distanceM = 0.0f;
  velocityMs = 0.0f;
  accelMs2 = 0.0f;
  previousVelocityMs = 0.0f;
  filteredGyroZ = 0.0f;
  telemetrySeq = 0;
}

void queueWrite(uint8_t target, const String& payload) {
  if (!writeMutex) {
    return;
  }
  xSemaphoreTake(writeMutex, portMAX_DELAY);
  PendingWrite* pending = nullptr;
  if (target == COMMAND_TARGET) {
    pending = &pendingCommand;
  } else if (target == ROOM_TARGET) {
    pending = &pendingRoom;
  } else if (target == TIME_TARGET) {
    pending = &pendingTime;
  }
  if (pending) {
    pending->payload = payload;
    pending->receivedMs = millis();
  }
  xSemaphoreGive(writeMutex);
}

bool takeWrite(uint8_t target, PendingWrite& out) {
  if (!writeMutex) {
    return false;
  }
  xSemaphoreTake(writeMutex, portMAX_DELAY);
  PendingWrite* pending = nullptr;
  if (target == COMMAND_TARGET) {
    pending = &pendingCommand;
  } else if (target == ROOM_TARGET) {
    pending = &pendingRoom;
  } else if (target == TIME_TARGET) {
    pending = &pendingTime;
  }
  const bool hasWrite = pending && pending->payload.length() > 0;
  if (hasWrite) {
    out = *pending;
    pending->payload = "";
    pending->receivedMs = 0;
  }
  xSemaphoreGive(writeMutex);
  return hasWrite;
}

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer*) override {
    centralConnected = true;
    pairMode = false;
    activeMtu = 512;
    Serial.println("[BLE] Central connected");
    redrawScreen(true);
  }

  void onConnect(BLEServer*, esp_ble_gatts_cb_param_t* param) override {
    centralConnected = true;
    pairMode = false;
    activeConnId = param->connect.conn_id;
    activeMtu = 512;
    Serial.println("[BLE] Central connected");
    redrawScreen(true);
  }

  void onMtuChanged(BLEServer*, esp_ble_gatts_cb_param_t* param) override {
    activeMtu = param->mtu.mtu > 3 ? param->mtu.mtu : 512;
    Serial.printf("[BLE] MTU negotiated: %u\n", activeMtu);
  }

  void onDisconnect(BLEServer*) override {
    centralConnected = false;
    Serial.println("[BLE] Central disconnected; advertising");
    delay(100);
    BLEDevice::startAdvertising();
    redrawScreen(true);
  }

  void onDisconnect(BLEServer*, esp_ble_gatts_cb_param_t*) override {
    centralConnected = false;
    Serial.println("[BLE] Central disconnected; advertising");
    delay(100);
    BLEDevice::startAdvertising();
    redrawScreen(true);
  }
};

class WriteCallbacks : public BLECharacteristicCallbacks {
 public:
  explicit WriteCallbacks(uint8_t target) : target_(target) {}

  void onWrite(BLECharacteristic* characteristic) override {
    std::string raw = characteristic->getValue();
    queueWrite(target_, String(raw.c_str()));
  }

 private:
  uint8_t target_;
};

void handleCommand(const String& payload) {
  StaticJsonDocument<384> doc;
  DeserializationError err = deserializeJson(doc, payload);
  if (err) {
    notifyAck("invalid_json", "error", "Invalid command JSON");
    return;
  }

  String command = doc["command"] | doc["cmd"] | "";
  String commandId = doc["command_id"] | "";
  command.trim();
  command.toLowerCase();

  if (command == "start_record" || command == "start_recording") {
    recording = true;
    actionLabel = doc["label"] | "ble_recording";
    recordStartMs = millis();
    notifyAck(command.c_str(), "accepted", "Recording started", commandId);
  } else if (command == "stop_record" || command == "stop_recording") {
    recording = false;
    actionLabel = "";
    notifyAck(command.c_str(), "accepted", "Recording stopped", commandId);
  } else if (command == "identify") {
    notifyAck(command.c_str(), "ok", "Identify complete", commandId);
    screenMode = ScreenMode::pair;
    redrawScreen(true);
  } else if (command == "pair" || command == "pair_mode") {
    startPairAdvertising();
    notifyAck(command.c_str(), "ok", "Pair mode enabled", commandId);
  } else if (command == "unpair" || command == "disconnect") {
    notifyAck(command.c_str(), "ok", "Phone disconnected", commandId);
    disconnectPhone();
  } else if (command == "calibrate_zero" || command == "calibrate") {
    notifyAck(command.c_str(), "accepted", "Calibration started", commandId);
    calibrateImu();
    notifyAck(command.c_str(), "ok", "Calibration complete", commandId);
  } else if (command == "set_name" || command == "rename") {
    String nextName = doc["device_name"] | doc["name"] | "";
    nextName.trim();
    if (nextName.length() == 0 || nextName.length() > 24) {
      notifyAck(command.c_str(), "error", "Device name must be 1-24 characters", commandId);
      return;
    }
    deviceName = nextName;
    saveConfig();
    applyBleDeviceName();
    notifyAck(command.c_str(), "ok", "Device name updated", commandId);
    redrawScreen(true);
  } else if (command == "reset_distance") {
    resetMotionCounters();
    notifyAck(command.c_str(), "ok", "Motion counters reset", commandId);
  } else if (command == "fall_test") {
    startFallTest();
    notifyAck(command.c_str(), "ok", "Fall test started", commandId);
  } else if (command == "fall_cancel") {
    if (fallAlertActive()) {
      cancelFallAlert("ble_command");
      notifyAck(command.c_str(), "ok", "Fall alert canceled", commandId);
    } else {
      notifyAck(command.c_str(), "ok", "No fall alert active", commandId);
    }
  } else if (command == "fall_sensitivity") {
    const int level = doc["level"] | -1;
    if (level < 0 || level > 2) {
      notifyAck(command.c_str(), "error", "level must be 0, 1 or 2", commandId);
      return;
    }
    fallSensitivity = static_cast<uint8_t>(level);
    saveConfig();
    notifyAck(command.c_str(), "ok", "Fall sensitivity saved", commandId);
  } else {
    notifyAck(command.length() ? command.c_str() : "unknown", "unsupported", "Unsupported command", commandId);
  }
}

void handleRoomConfig(const String& payload) {
  StaticJsonDocument<384> doc;
  DeserializationError err = deserializeJson(doc, payload);
  if (err) {
    notifyAck("room_config", "error", "Invalid room/config JSON");
    return;
  }

  if (doc.containsKey("device_id")) {
    deviceId = doc["device_id"].as<const char*>();
  }
  if (doc.containsKey("device_name")) {
    deviceName = doc["device_name"].as<const char*>();
  } else if (doc.containsKey("name")) {
    deviceName = doc["name"].as<const char*>();
  }
  if (doc.containsKey("room_id")) {
    roomId = doc["room_id"].as<const char*>();
  }
  if (doc.containsKey("room_name")) {
    roomName = doc["room_name"].as<const char*>();
  }
  if (doc.containsKey("wheel_radius_m")) {
    wheelRadiusM = doc["wheel_radius_m"].as<float>();
  }
  saveConfig();
  applyBleDeviceName();
  notifyAck("room_config", "ok", "Room/config saved");
  redrawScreen(true);
}

void handleTimeSync(const String& payload, uint32_t nowMs) {
  StaticJsonDocument<192> doc;
  uint64_t epoch = 0;
  DeserializationError err = deserializeJson(doc, payload);
  if (!err) {
    epoch = doc["epoch_ms"] | 0ULL;
    if (epoch == 0 && doc.containsKey("epoch_s")) {
      epoch = doc["epoch_s"].as<uint64_t>() * 1000ULL;
    }
  } else {
    epoch = strtoull(payload.c_str(), nullptr, 10);
  }

  if (epoch < 1700000000000ULL) {
    notifyAck("time_sync", "error", "Invalid epoch");
    return;
  }
  timeBaseEpochMs = epoch;
  timeBaseLocalMs = nowMs;
  notifyAck("time_sync", "ok", "Time synchronized");
}

#pragma pack(push, 1)
struct WheelTelemetryPacket {
  uint32_t seq;
  uint32_t timestamp_ms;
  int16_t  ax;            // mG (1000 = 1.000g)
  int16_t  ay;            // mG
  int16_t  az;            // mG
  int16_t  gx;            // 0.1 dps
  int16_t  gy;            // 0.1 dps
  int16_t  gz;            // 0.1 dps
  uint8_t  battery_pct;   // 0..100%
  uint16_t battery_mv;    // mV
  int16_t  velocity_cms;  // cm/s
  uint32_t distance_cm;   // cm
  uint8_t  flags;         // bit 0: isRecording, bit 1: imuValid, bit 2: charging, bit 3: fallAlert
};
#pragma pack(pop)

static_assert(sizeof(WheelTelemetryPacket) == 30, "Packet must be exactly 30 bytes");

void notifyTelemetry(uint32_t nowMs) {
  if (!telemetryChar || !centralConnected) {
    return;
  }

  WheelTelemetryPacket pkt;
  pkt.seq = telemetrySeq++;
  pkt.timestamp_ms = nowMs;
  pkt.ax = static_cast<int16_t>(sensorFrame.ax * 1000.0f);
  pkt.ay = static_cast<int16_t>(sensorFrame.ay * 1000.0f);
  pkt.az = static_cast<int16_t>(sensorFrame.az * 1000.0f);
  pkt.gx = static_cast<int16_t>(sensorFrame.gx * 10.0f);
  pkt.gy = static_cast<int16_t>(sensorFrame.gy * 10.0f);
  pkt.gz = static_cast<int16_t>(sensorFrame.gz * 10.0f);
  pkt.battery_pct = static_cast<uint8_t>(sensorFrame.batteryPercent >= 0 ? sensorFrame.batteryPercent : 0);
  pkt.battery_mv = static_cast<uint16_t>(sensorFrame.batteryVoltageMv > 0 ? sensorFrame.batteryVoltageMv : 0);
  pkt.velocity_cms = static_cast<int16_t>(velocityMs * 100.0f);
  pkt.distance_cm = static_cast<uint32_t>(distanceM * 100.0f);
  pkt.flags = (recording ? 1 : 0) | (sensorFrame.imuValid ? 2 : 0) | (sensorFrame.charging ? 4 : 0) |
              (fallAlertActive() ? 8 : 0);

  telemetryChar->setValue(reinterpret_cast<uint8_t*>(&pkt), sizeof(pkt));
  telemetryChar->notify();
}

void setupBle() {
  writeMutex = xSemaphoreCreateMutex();
  BLEDevice::init(deviceName.c_str());
  BLEDevice::setMTU(517);

  bleServer = BLEDevice::createServer();
  bleServer->setCallbacks(new ServerCallbacks());
  BLEService* service = bleServer->createService(SERVICE_UUID);

  deviceInfoChar = service->createCharacteristic(DEVICE_INFO_UUID, BLECharacteristic::PROPERTY_READ);
  telemetryChar = service->createCharacteristic(
      TELEMETRY_UUID, BLECharacteristic::PROPERTY_NOTIFY | BLECharacteristic::PROPERTY_READ);
  BLE2902* telemetry2902 = new BLE2902();
  telemetry2902->setNotifications(true);
  telemetryChar->addDescriptor(telemetry2902);

  BLECharacteristic* commandChar = service->createCharacteristic(
      COMMAND_UUID, BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
  commandChar->setCallbacks(new WriteCallbacks(COMMAND_TARGET));

  ackChar = service->createCharacteristic(
      ACK_UUID, BLECharacteristic::PROPERTY_NOTIFY | BLECharacteristic::PROPERTY_READ);
  BLE2902* ack2902 = new BLE2902();
  ack2902->setNotifications(true);
  ackChar->addDescriptor(ack2902);

  BLECharacteristic* roomChar = service->createCharacteristic(
      ROOM_CONFIG_UUID, BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
  roomChar->setCallbacks(new WriteCallbacks(ROOM_TARGET));

  BLECharacteristic* timeChar = service->createCharacteristic(
      TIME_SYNC_UUID, BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
  timeChar->setCallbacks(new WriteCallbacks(TIME_TARGET));

  fallAlertChar = service->createCharacteristic(
      FALL_ALERT_UUID, BLECharacteristic::PROPERTY_NOTIFY | BLECharacteristic::PROPERTY_READ);
  BLE2902* fall2902 = new BLE2902();
  fall2902->setNotifications(true);
  fallAlertChar->addDescriptor(fall2902);

  updateDeviceInfo();
  service->start();

  advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID);
  advertising->setScanResponse(true);
  advertising->setMinPreferred(0x06);
  advertising->setMaxPreferred(0x12);
  BLEDevice::startAdvertising();
}

void updateButton(ButtonState& button, uint8_t pin, uint32_t nowMs) {
  const bool reading = digitalRead(pin) == LOW;
  button.pressedEvent = false;
  if (reading != button.lastReading) {
    button.lastReading = reading;
    button.lastChangeMs = nowMs;
  }
  if ((nowMs - button.lastChangeMs) >= BUTTON_DEBOUNCE_MS && reading != button.stablePressed) {
    button.stablePressed = reading;
    if (button.stablePressed) {
      button.pressedEvent = true;
    }
  }
}

void handleMenuSelect() {
  switch (menuIndex) {
    case 0:
      startPairAdvertising();
      break;
    case 1:
      disconnectPhone();
      break;
    case 2:
      screenMode = ScreenMode::info;
      redrawScreen(true);
      break;
    case 3:
      calibrateImu();
      break;
    case 4:
      resetMotionCounters();
      screenMode = ScreenMode::dashboard;
      redrawScreen(true);
      break;
    case 5:
      screenMode = ScreenMode::info;
      redrawScreen(true);
      break;
    case 6:
      sleepOptionIndex = (sleepOptionIndex + 1) % SLEEP_OPTION_COUNT;
      saveConfig();
      redrawScreen(true);
      break;
    case 7:
      startFallTest();
      break;
    default:
      screenMode = ScreenMode::dashboard;
      redrawScreen(true);
      break;
  }
}

void handleButtons() {
  const uint32_t now = millis();
  if (now - lastButtonMs < BUTTON_SCAN_INTERVAL_MS) {
    return;
  }
  lastButtonMs = now;
  updateButton(buttonA, BUTTON_A_PIN, now);
  updateButton(buttonB, BUTTON_B_PIN, now);
  updateButton(buttonC, BUTTON_C_PIN, now);

  if (buttonA.pressedEvent || buttonB.pressedEvent || buttonC.pressedEvent) {
    lastActivityMs = now;
    if (screenAsleep) {
      wakeScreen(now);
      redrawScreen(true);
      return; // first press while asleep only wakes the screen
    }
  }

  if (fallAlertActive()) {
    if (buttonA.pressedEvent) {
      cancelFallAlert("device_button");
    }
    return;
  }

  if (screenMode == ScreenMode::menu) {
    if (buttonB.pressedEvent) {
      menuIndex = (menuIndex + 1) % kMenuItemCount;
      redrawScreen(true);
    }
    if (buttonA.pressedEvent) {
      handleMenuSelect();
    }
    if (buttonC.pressedEvent) {
      screenMode = ScreenMode::dashboard;
      redrawScreen(true);
    }
    return;
  }

  if (screenMode == ScreenMode::dashboard) {
    if (buttonA.pressedEvent) {
      startPairAdvertising();
    }
    if (buttonB.pressedEvent) {
      dashboardPage = (dashboardPage + 1) % 3;
      redrawScreen(true);
    }
    if (buttonC.pressedEvent) {
      menuIndex = 0;
      screenMode = ScreenMode::menu;
      redrawScreen(true);
    }
    return;
  }

  if (screenMode == ScreenMode::pair) {
    if (buttonA.pressedEvent) {
      startPairAdvertising();
    }
    if (buttonB.pressedEvent) {
      disconnectPhone();
    }
    if (buttonC.pressedEvent) {
      screenMode = ScreenMode::dashboard;
      redrawScreen(true);
    }
    return;
  }

  if (screenMode == ScreenMode::info) {
    if (buttonA.pressedEvent) {
      startPairAdvertising();
    }
    if (buttonB.pressedEvent) {
      screenMode = ScreenMode::menu;
      redrawScreen(true);
    }
    if (buttonC.pressedEvent) {
      screenMode = ScreenMode::dashboard;
      redrawScreen(true);
    }
  }
}
}

void setup() {
  Serial.begin(115200);
  delay(100);
  initPowerAndButtons();
  initDisplay();
  loadConfig();
  showBootSequence("Loading display and BLE");
  beginImu();
  drawBootScreen("Hold still for Calibrate 0", 82);
  calibrateImu();
  setupBle();
  lastActivityMs = millis();
  screenMode = ScreenMode::dashboard;
  redrawScreen(true);
  Serial.printf("WheelSense BLE Gateway %s advertising as %s (%s)\n", FIRMWARE_VERSION, deviceName.c_str(), deviceId.c_str());
}

void loop() {
  const uint32_t now = millis();
  updateSensors();
  handleButtons();
  updateFallDetection(now);
  PendingWrite event;
  while (takeWrite(COMMAND_TARGET, event)) {
    handleCommand(event.payload);
  }
  while (takeWrite(ROOM_TARGET, event)) {
    handleRoomConfig(event.payload);
  }
  while (takeWrite(TIME_TARGET, event)) {
    handleTimeSync(event.payload, now);
  }

  const uint32_t interval = recording ? TELEMETRY_INTERVAL_MS : TELEMETRY_IDLE_INTERVAL_MS;
  if (now - lastTelemetryMs >= interval) {
    notifyTelemetry(now);
    lastTelemetryMs = now;
  }
  const uint32_t sleepMs = screenSleepTimeoutMs();
  if (!screenAsleep && !fallAlertActive() && sleepMs > 0 && now - lastActivityMs >= sleepMs) {
    sleepScreen();
  }
  redrawScreen();
  delay(10);
}
