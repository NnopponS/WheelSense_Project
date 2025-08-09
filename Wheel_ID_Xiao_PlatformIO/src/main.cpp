#include <Arduino.h>
#include <Wire.h>
#include <LSM6DS3.h>
#include <U8x8lib.h>
#include <bluefruit.h>
#include <math.h>

extern "C" {
  #include "aes.h" // tiny-AES-c
}

/* ===== CONFIG ===== */
#define WHEEL_ID 1
static const float  WHEEL_RADIUS_M = 0.30f;          // รัศมีล้อ 30 ซม. (เส้นผ่าศูนย์กลาง 60 ซม.)
static const uint16_t DISTANCE_ENCODE_FACTOR = 100;  // m*100 -> uint16

// จอ/Serial อัปเดตทุก 1 วิ, BLE ส่งทุก 200 ms
static const uint32_t DISPLAY_INTERVAL_MS = 1000;
static const uint32_t BLE_SEND_INTERVAL_MS = 200;

// อัตราอ่านเซนเซอร์คงที่
static const uint32_t SAMPLE_INTERVAL_MS  = 50;      // อ่าน/คำนวณมุมทุก 50ms (~20Hz)

// กรอง/รั้ว/กันสั่น
static const float R_MIN_G         = 0.40f;
static const float R_MAX_G         = 1.60f;
static const float DTHETA_DEADBAND = 0.020f;         // ~1.15° เดิมเล็กไป
static const float MAX_DTHETA      = 0.50f;

// สรุปหน้าต่าง 1 วินาที
static const uint32_t WINDOW_MS    = 1000;
static const float MOVE_THRESH_RAD = 0.10f;
static const float DIR_BIAS_RAD    = 0.02f;

// สเกลปรับละเอียด (ถ้ายังคลาดเคลื่อนเล็กน้อยให้จูนค่าตรงนี้)
static const float ANGLE_TO_DIST_SCALE = 1.00f;

/* ===== STATUS BYTES ===== */
#define ST_OK                 0x00
#define ST_IMU_NOT_FOUND      0x01
#define ST_ACCEL_UNRELIABLE   0x02
#define ST_DTHETA_CLIPPED     0x03

/* ===== Devices ===== */
LSM6DS3 imu(I2C_MODE, 0x6A);
bool imu_ok = false;

U8X8_SSD1306_128X64_NONAME_HW_I2C u8x8(PIN_WIRE_SCL, PIN_WIRE_SDA, U8X8_PIN_NONE);

// Battery Service (BLE)
BLEBas blebas;

struct AES_ctx ctx;
const uint8_t aes_key[16] = {
  0x11,0x22,0x33,0x44, 0x55,0x66,0x77,0x88,
  0x99,0xAA,0xBB,0xCC, 0xDD,0xEE,0xFF,0x00
};

uint8_t plaintext[16]  = { WHEEL_ID,0,0,0, 0,0, ST_OK, 0, 0,0,0,0, 0,0,0,0 };
uint8_t ciphertext[16] = {0};

/* ===== Distance / State ===== */
float total_distance_m = 0.0f;

enum Motion { STOP=0, FORWARD=1, BACKWARD=2 };
Motion report_motion = STOP;

/* ===== Angle & Filters ===== */
bool  have_theta   = false;
float theta_prev   = 0.0f;

// median-3
float ax_hist[3] = {0,0,0};
float ay_hist[3] = {0,0,0};
int   hist_idx   = 0;

// สำหรับ payload
float   last_ax_g = 0.0f, last_ay_g = 0.0f;
uint8_t last_batt_pct = 100;          // แบต %
uint8_t current_status = ST_OK;
bool    last_dtheta_clipped = false;

/* ===== หน้าต่าง 1 วินาที ===== */
unsigned long winStartMs = 0;
float win_abs_sum     = 0.0f;   // เก็บไว้ดูสถานะ (แต่จะไม่ใช้คำนวณระยะ)
float win_signed_sum  = 0.0f;   // << ใช้อันนี้คำนวณระยะ

/* ===== Timers ===== */
unsigned long lastDisplayMs = 0;
unsigned long lastBleMs     = 0;
unsigned long lastBattMs    = 0;
unsigned long lastSampleMs  = 0;

/* ===== Helper ===== */
static inline float unwrapDelta(float now, float prev) {
  float d = now - prev;
  while (d >  M_PI) d -= 2.0f * M_PI;
  while (d <= -M_PI) d += 2.0f * M_PI;
  return d;
}
static inline float median3(float a, float b, float c) {
  if (a > b) { float t=a; a=b; b=t; }
  if (b > c) { float t=b; b=c; c=t; }
  if (a > b) { float t=a; a=b; b=t; }
  return b;
}
static inline void readAccelXY_direct(float &ax, float &ay) {
  ax = imu.readFloatAccelX(); // g
  ay = imu.readFloatAccelY();
}
static inline int8_t packAxis_g(float g) {
  float scaled = roundf(g * 50.0f); // 0.02g/LSB
  if (scaled > 127.f) scaled = 127.f;
  if (scaled < -128.f) scaled = -128.f;
  return (int8_t)scaled;
}

/* ===== Battery: VBAT -> % (EMA + ตารางโค้ง) ===== */
static float readVBAT_V() {
  analogReadResolution(12);
#if defined(AR_INTERNAL_3_0)
  analogReference(AR_INTERNAL_3_0);   // อ้างอิง 3.0V
#endif
#ifdef PIN_VBAT_ENABLE
  pinMode(PIN_VBAT_ENABLE, OUTPUT);
  digitalWrite(PIN_VBAT_ENABLE, HIGH);
  delay(2);
#endif
#ifdef PIN_VBAT
  int raw = analogRead(PIN_VBAT);
#else
  int raw = analogRead(A7);           // เผื่อบางบอร์ดแมป VBAT มาที่ A7
#endif
#ifdef PIN_VBAT_ENABLE
  digitalWrite(PIN_VBAT_ENABLE, LOW);
#endif
  float v_pin = raw * (3.0f / 4095.0f);  // แปลงเป็นโวลต์ที่ขา ADC
  float vbat  = v_pin * 2.0f;            // divider 2:1
  return vbat;
}

static float lipoPercentFromVoltage(float v) {
  const float vt[] = {3.30f, 3.50f, 3.70f, 3.85f, 4.00f, 4.10f, 4.20f};
  const float pt[] = {   0.f,  10.f,  30.f,  55.f,  80.f,  90.f, 100.f};
  const int   n = sizeof(vt)/sizeof(vt[0]);
  if (v <= vt[0]) return 0.f;
  if (v >= vt[n-1]) return 100.f;
  for (int i=0;i<n-1;i++) {
    if (v >= vt[i] && v <= vt[i+1]) {
      float t = (v - vt[i]) / (vt[i+1] - vt[i]);
      return pt[i] + t * (pt[i+1] - pt[i]);
    }
  }
  return 0.f;
}

static void updateBatteryPercent() {
  static bool  have = false;
  static float ema = 100.f;      // เริ่มต้น 100%
  const  float ALPHA = 0.2f;     // EMA เบา ๆ
  float v = readVBAT_V();
  float p = lipoPercentFromVoltage(v);
  if (!have) { ema = p; have = true; }
  else       { ema = ema + ALPHA*(p - ema); }
  if (ema < 0) ema = 0; if (ema > 100) ema = 100;
  last_batt_pct = (uint8_t)roundf(ema);
  blebas.write(last_batt_pct);   // อัปเดต Battery Service
}

/* --- เข้ารหัส + โฆษณา --- */
static void sendEncryptedAdvertisement() {
  // [4..5] ระยะรวม (LE)
  uint16_t encDist = (uint16_t)(total_distance_m * DISTANCE_ENCODE_FACTOR);
  plaintext[4] = encDist & 0xFF;
  plaintext[5] = (encDist >> 8) & 0xFF;

  // [6] สถานะรวม
  if (!imu_ok) current_status = ST_IMU_NOT_FOUND;
  plaintext[6] = current_status;

  // [7] สถานะเคลื่อน (1s ล่าสุด)
  plaintext[7] = (uint8_t)report_motion;

  // [8] แบต % (0..100)
  plaintext[8] = last_batt_pct;

  // [1],[2] แกน X/Y (int8, 0.02g/LSB)
  plaintext[1] = (uint8_t)packAxis_g(last_ax_g);
  plaintext[2] = (uint8_t)packAxis_g(last_ay_g);

  memcpy(ciphertext, plaintext, 16);
  AES_ECB_encrypt(&ctx, ciphertext);

  Bluefruit.Advertising.clearData();
  Bluefruit.Advertising.addFlags(BLE_GAP_ADV_FLAGS_LE_ONLY_GENERAL_DISC_MODE);
  Bluefruit.Advertising.addTxPower();
  Bluefruit.Advertising.addManufacturerData(ciphertext, sizeof(ciphertext));
  Bluefruit.Advertising.setInterval(320, 320); // 200 ms
  Bluefruit.Advertising.restartOnDisconnect(true);
  Bluefruit.Advertising.start(0);
}

/* ===== Main tick ===== */
static void tick() {
  // อัปเดตแบตทุก 1 วินาที
  if (millis() - lastBattMs >= 1000) {
    lastBattMs = millis();
    updateBatteryPercent();
  }

  if (!imu_ok) {
    if (millis() - lastBleMs >= BLE_SEND_INTERVAL_MS) {
      lastBleMs = millis();
      sendEncryptedAdvertisement();
    }
    if (millis() - lastDisplayMs >= DISPLAY_INTERVAL_MS) {
      lastDisplayMs = millis();
      u8x8.clearDisplay();
      u8x8.setCursor(0,0);
      u8x8.println("IMU ERROR");
      u8x8.printf("Bat: %u%%\n", last_batt_pct);
      u8x8.printf("T: %.2f m\n", total_distance_m);
    }
    return;
  }

  // จำกัดอัตราอ่านให้คงที่
  if (millis() - lastSampleMs >= SAMPLE_INTERVAL_MS) {
    lastSampleMs = millis();

    // อ่าน X,Y + median-3
    float ax_raw, ay_raw; 
    readAccelXY_direct(ax_raw, ay_raw);
    ax_hist[hist_idx] = ax_raw;
    ay_hist[hist_idx] = ay_raw;
    hist_idx = (hist_idx + 1) % 3;

    float ax = median3(ax_hist[0], ax_hist[1], ax_hist[2]);
    float ay = median3(ay_hist[0], ay_hist[1], ay_hist[2]);

    // เก็บไว้ส่ง
    last_ax_g = ax; last_ay_g = ay;

    // เช็กน่าเชื่อถือ
    float r = sqrtf(ax*ax + ay*ay);
    bool reliable = (r >= R_MIN_G && r <= R_MAX_G);

    // มุม
    float theta = reliable ? atan2f(ay, ax) : theta_prev;

    if (!have_theta) {
      have_theta = true;
      theta_prev = theta;
      winStartMs = millis();
      win_abs_sum = win_signed_sum = 0.0f;
    }

    current_status = ST_OK;
    last_dtheta_clipped = false;

    float dtheta = 0.0f;
    if (reliable) {
      dtheta = unwrapDelta(theta, theta_prev);
      if (fabsf(dtheta) < DTHETA_DEADBAND) dtheta = 0.0f;
      if (dtheta >  MAX_DTHETA) { dtheta =  MAX_DTHETA; last_dtheta_clipped = true; }
      if (dtheta < -MAX_DTHETA) { dtheta = -MAX_DTHETA; last_dtheta_clipped = true; }
      theta_prev = theta;

      win_abs_sum    += fabsf(dtheta);
      win_signed_sum += dtheta;
    } else {
      current_status = ST_ACCEL_UNRELIABLE;
    }
    if (last_dtheta_clipped && current_status == ST_OK) current_status = ST_DTHETA_CLIPPED;
  }

  // ครบ 1 วิ → สรุป + อัปเดตระยะรวม
  if (millis() - winStartMs >= WINDOW_MS) {
    bool moving = (fabsf(win_signed_sum) >= MOVE_THRESH_RAD);
    if (moving) {
      total_distance_m += ANGLE_TO_DIST_SCALE * fabsf(win_signed_sum) * WHEEL_RADIUS_M;
      if (fabsf(win_signed_sum) >= DIR_BIAS_RAD)
        report_motion = (win_signed_sum > 0.0f) ? FORWARD : BACKWARD;
      else
        report_motion = STOP;
    } else {
      report_motion = STOP;
    }
    winStartMs = millis();
    win_abs_sum = win_signed_sum = 0.0f;
  }

  // ส่ง BLE ทุก 200 ms
  if (millis() - lastBleMs >= BLE_SEND_INTERVAL_MS) {
    lastBleMs = millis();
    sendEncryptedAdvertisement();
  }

  // อัปเดตจอ/Serial ทุก 1 วิ
  if (millis() - lastDisplayMs >= DISPLAY_INTERVAL_MS) {
    lastDisplayMs = millis();
    const char* state =
      (report_motion == FORWARD)  ? "MOVE FWD" :
      (report_motion == BACKWARD) ? "MOVE BWD" : "STOP";

    u8x8.clearDisplay();
    u8x8.setCursor(0,0);
    u8x8.printf("WHEEL_%02d\n", WHEEL_ID);
    u8x8.printf("X: %.2f g\n", last_ax_g);
    u8x8.printf("Y: %.2f g\n", last_ay_g);
    u8x8.printf("Bat: %u%%\n", last_batt_pct);
    u8x8.printf("T: %.2f m\n", total_distance_m);
    u8x8.printf("State: %s\n", state);

    Serial.println("----- WINDOW(1s) SUMMARY -----");
    Serial.printf("sum|dθ|=%.4f  sum(dθ)=%.4f  -> %s\n",
                  win_abs_sum, win_signed_sum, state);
    Serial.printf("T=%.3f m  R=%.2f m  k=%.2f  status=0x%02X  Batt=%u%%\n\n",
                  total_distance_m, WHEEL_RADIUS_M, ANGLE_TO_DIST_SCALE, current_status, last_batt_pct);
  }
}

/* ===== Setup ===== */
void setup() {
  Serial.begin(115200);
  delay(300);

  // OLED
  u8x8.begin();
  u8x8.setFont(u8x8_font_chroma48medium8_r);
  u8x8.clearDisplay();
  u8x8.setCursor(0,0);
  u8x8.println("Wheel AES Beacon");

  // IMU
  imu_ok = (imu.begin() == 0);

  // AES
  AES_init_ctx(&ctx, aes_key);

  // BLE
  Bluefruit.begin();

  // ★ ตั้งกำลังส่งสูงสุด: nRF52840 = +8 dBm, รุ่นอื่น = +4 dBm
  #if defined(NRF52840_XXAA)
    Bluefruit.setTxPower(-8);
  #else
    Bluefruit.setTxPower(4);
  #endif

  char bleName[16];
  snprintf(bleName, sizeof(bleName), "Wheel_%02d", WHEEL_ID);
  Bluefruit.setName(bleName);
  Bluefruit.ScanResponse.addName();

  // Battery Service
  blebas.begin();
  blebas.write(100);

  // เริ่มโฆษณา
  sendEncryptedAdvertisement();

  // เตรียม median-3
  float ax0 = imu.readFloatAccelX();
  float ay0 = imu.readFloatAccelY();
  ax_hist[0] = ax_hist[1] = ax_hist[2] = ax0;
  ay_hist[0] = ay_hist[1] = ay_hist[2] = ay0;

  lastBleMs     = millis();
  lastDisplayMs = millis();
  lastBattMs    = 0;         // บังคับอ่านแบตรอบแรกทันที
  winStartMs    = millis();
  lastSampleMs  = millis();
}

/* ===== Loop ===== */
void loop() {
  tick();
}
