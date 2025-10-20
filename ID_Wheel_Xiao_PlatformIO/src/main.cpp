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

static const float  WHEEL_RADIUS_M = 0.30f;          // รัศมีล้อ 30 ซม.
static const uint16_t DISTANCE_ENCODE_FACTOR = 100;  // m*100 -> uint16

// อัปเดตจอทุก 1 วิ, โฆษณา BLE ทุก 200 ms, อ่านเซนเซอร์ทุก 50 ms
static const uint32_t DISPLAY_INTERVAL_MS = 1000;
static const uint32_t BLE_SEND_INTERVAL_MS = 200;
static const uint32_t SAMPLE_INTERVAL_MS  = 50;      // ~20Hz

// กรอง/กันสั่น
static const float R_MIN_G         = 0.40f;
static const float R_MAX_G         = 1.60f;
static const float DTHETA_DEADBAND = 0.020f;         // ~1.15°
static const float MAX_DTHETA      = 0.50f;

// หน้าต่างสรุป 1 วินาที
static const uint32_t WINDOW_MS    = 1000;
static const float MOVE_THRESH_RAD = 0.10f;  // เคลื่อนที่ถ้า |sum(dθ)| >= 0.10 rad
static const float DIR_BIAS_RAD    = 0.02f;  // bias สำหรับ FWD/BWD

// ใช้ Gyro Y เพื่อตัดสินเลี้ยว (บูรณาการองศาต่อวินาทีเป็นองศาใน 1 วิ)
static const float TURN_ANGLE_THRESH_DEG = 8.0f; // |Δψ| >= 8° => LEFT/RIGHT

// สเกลละเอียดระยะทาง
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

/* ===== AES ===== */
struct AES_ctx ctx;
const uint8_t aes_key[16] = {
  0x11,0x22,0x33,0x44, 0x55,0x66,0x77,0x88,
  0x99,0xAA,0xBB,0xCC, 0xDD,0xEE,0xFF,0x00
};

// ฟอร์แมต 16 ไบต์ที่ฝั่งรับใช้อยู่
// [0]=wheel, [1]=direction, [4..5]=distance*100 (LE), [6]=status, [7]=motion
uint8_t plaintext[16]  = { WHEEL_ID,0,0,0, 0,0, ST_OK, 0, 0,0,0,0, 0,0,0,0 };
uint8_t ciphertext[16] = {0};

/* ===== ระยะทาง/สถานะ ===== */
float total_distance_m = 0.0f;

enum Motion { STOP=0, FORWARD=1, BACKWARD=2 };
Motion report_motion = STOP;

enum Direction { STRAIGHT=0, LEFT=1, RIGHT=2 };
Direction report_dir = STRAIGHT;

/* ===== มุมจาก Accel & ตัวกรอง ===== */
bool  have_theta   = false;
float theta_prev   = 0.0f;

// median-3
float ax_hist[3] = {0,0,0};
float ay_hist[3] = {0,0,0};
int   hist_idx   = 0;

// สำหรับสถานะ
float   last_ax_g = 0.0f, last_ay_g = 0.0f;
uint8_t current_status = ST_OK;
bool    last_dtheta_clipped = false;

/* ===== หน้าต่าง 1 วินาที ===== */
unsigned long winStartMs = 0;
float win_abs_sum     = 0.0f;   // for log
float win_signed_sum  = 0.0f;   // ใช้คำนวณระยะ
float win_gyro_y_angle_deg = 0.0f; // บูรณาการ gyro Y เป็นองศาในช่วงหน้าต่าง

/* ===== Timers ===== */
unsigned long lastDisplayMs = 0;
unsigned long lastBleMs     = 0;
unsigned long lastSampleMs  = 0;

/* ===== Helpers ===== */
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

/* --- เข้ารหัส + โฆษณา (ตามฟอร์แมตฝั่ง Room Node) --- */
static void sendEncryptedAdvertisement() {
  // [0] wheel id
  plaintext[0] = (uint8_t)WHEEL_ID;

  // [1] direction (0=STRAIGHT,1=LEFT,2=RIGHT)
  plaintext[1] = (uint8_t)report_dir;

  // [4..5] distance*100 (LE)
  uint16_t encDist = (uint16_t)(total_distance_m * DISTANCE_ENCODE_FACTOR);
  plaintext[4] = encDist & 0xFF;
  plaintext[5] = (encDist >> 8) & 0xFF;

  // [6] status
  if (!imu_ok) current_status = ST_IMU_NOT_FOUND;
  plaintext[6] = current_status;

  // [7] motion (0=STOP,1=FWD,2=BWD)
  plaintext[7] = (uint8_t)report_motion;

  // อื่น ๆ เคลียร์ 0
  for (int i=2;i<16;i++){
    if (i==4 || i==5 || i==6 || i==7) continue;
    plaintext[i]=0;
  }

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
  if (!imu_ok) {
    if (millis() - lastBleMs >= BLE_SEND_INTERVAL_MS) {
      lastBleMs = millis();
      sendEncryptedAdvertisement();
    }
    if (millis() - lastDisplayMs >= DISPLAY_INTERVAL_MS) {
      lastDisplayMs = millis();
      u8x8.clearDisplay();
      u8x8.setCursor(0,0);
      u8x8.printf("WHEEL_%02d\n", WHEEL_ID);
      u8x8.println("IMU ERROR");
      u8x8.printf("T: %.2f m\n", total_distance_m);
      u8x8.printf("Move: STOP\n");
      u8x8.printf("Dir : STRAIGHT\n");
    }
    return;
  }

  // อ่านเซนเซอร์คงที่
  if (millis() - lastSampleMs >= SAMPLE_INTERVAL_MS) {
    uint32_t now = millis();
    float dt_s = (float)(now - lastSampleMs) * 0.001f;
    lastSampleMs = now;

    // 1) Accel X,Y (g) -> median-3
    float ax_raw = imu.readFloatAccelX();
    float ay_raw = imu.readFloatAccelY();
    ax_hist[hist_idx] = ax_raw;
    ay_hist[hist_idx] = ay_raw;
    hist_idx = (hist_idx + 1) % 3;

    float ax = median3(ax_hist[0], ax_hist[1], ax_hist[2]);
    float ay = median3(ay_hist[0], ay_hist[1], ay_hist[2]);

    last_ax_g = ax; last_ay_g = ay;

    // ความน่าเชื่อถือของ Accel
    float r = sqrtf(ax*ax + ay*ay);
    bool reliable = (r >= R_MIN_G && r <= R_MAX_G);

    // 2) Gyro Y (deg/s) -> integrate เป็น deg ภายในหน้าต่าง
    float gyro_y_dps = -imu.readFloatGyroY();      // หน่วย deg/s จาก LSM6DS3
    win_gyro_y_angle_deg += gyro_y_dps * dt_s;    // สะสมองศา

    // 3) มุม theta จาก Accel
    float theta = reliable ? atan2f(ay, ax) : theta_prev;

    if (!have_theta) {
      have_theta = true;
      theta_prev = theta;
      winStartMs = millis();
      win_abs_sum = win_signed_sum = 0.0f;
      win_gyro_y_angle_deg = 0.0f;
    }

    current_status = ST_OK;
    last_dtheta_clipped = false;

    // 4) dtheta (เมื่อ reliable)
    if (reliable) {
      float dtheta = unwrapDelta(theta, theta_prev);
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

  // ครบ 1 วิ -> สรุปหน้าต่าง
  if (millis() - winStartMs >= WINDOW_MS) {
    // Motion (จาก sum(dθ) ของล้อ)
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

    // Direction (หันซ้าย/ขวา/ตรง จาก Gyro Y แบบบูรณาการ 1 วินาที)
    float turn_angle = win_gyro_y_angle_deg; // องศาในหน้าต่าง
    if (fabsf(turn_angle) < TURN_ANGLE_THRESH_DEG) {
      report_dir = STRAIGHT;
    } else {
      report_dir = (turn_angle > 0.0f) ? RIGHT : LEFT; // ตามแกน Y ของ LSM6DS3
    }

    // รีเซ็ตหน้าต่าง
    winStartMs = millis();
    win_abs_sum = win_signed_sum = 0.0f;
    win_gyro_y_angle_deg = 0.0f;
  }

  // ส่ง BLE ทุก 200 ms
  if (millis() - lastBleMs >= BLE_SEND_INTERVAL_MS) {
    lastBleMs = millis();
    sendEncryptedAdvertisement();
  }

  // อัปเดตจอทุก 1 วิ
  if (millis() - lastDisplayMs >= DISPLAY_INTERVAL_MS) {
    lastDisplayMs = millis();
    const char* moveStr =
      (report_motion == FORWARD)  ? "MOVE FW" :
      (report_motion == BACKWARD) ? "MOVE BW" : "STOP";
    const char* dirStr =
      (report_dir == LEFT) ? "LEFT" :
      (report_dir == RIGHT)? "RIGHT" : "STRAIGHT";

    u8x8.clearDisplay();
    u8x8.setCursor(0,0);
    u8x8.printf("WHEEL_%02d\n", WHEEL_ID);
    u8x8.printf("T: %.2f m\n", total_distance_m);
    u8x8.printf("Move: %s\n", moveStr);
    u8x8.printf("Dir : %s\n", dirStr);

    // Log สั้น ๆ
    Serial.println("----- WINDOW(1s) SUMMARY -----");
    Serial.printf("sum|dθ|=%.4f  sum(dθ)=%.4f\n", win_abs_sum, win_signed_sum);
    Serial.printf("Turn≈ %.1f deg  -> Dir=%s\n",
                  win_gyro_y_angle_deg, dirStr);
    Serial.printf("T=%.3f m  status=0x%02X\n\n",
                  total_distance_m, current_status);
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

  // กำลังส่ง (ปรับได้ตามต้องการ)
  #if defined(NRF52840_XXAA)
    Bluefruit.setTxPower(8);   // สูงสุดบน nRF52840
  #else
    Bluefruit.setTxPower(4);
  #endif

  char bleName[16];
  snprintf(bleName, sizeof(bleName), "Wheel_%02d", WHEEL_ID);
  Bluefruit.setName(bleName);
  Bluefruit.ScanResponse.addName();

  // เริ่มโฆษณา
  sendEncryptedAdvertisement();

  // เตรียม median-3
  float ax0 = imu.readFloatAccelX();
  float ay0 = imu.readFloatAccelY();
  ax_hist[0] = ax_hist[1] = ax_hist[2] = ax0;
  ay_hist[0] = ay_hist[1] = ay_hist[2] = ay0;

  lastBleMs     = millis();
  lastDisplayMs = millis();
  winStartMs    = millis();
  lastSampleMs  = millis();
}

/* ===== Loop ===== */
void loop() {
  tick();
}
