#include <Arduino.h>
#include <Wire.h>
#include <LSM6DS3.h>
#include <U8x8lib.h>
#include <bluefruit.h>
#include <math.h>

/* ===== CONFIG ===== */
#define WHEEL_ID 2

static const float  WHEEL_RADIUS_M = 0.30f;          // wheel radius 30cm
static const uint16_t DISTANCE_ENCODE_FACTOR = 100;  // m*100 -> uint16

// Intervals
static const uint32_t DISPLAY_INTERVAL_MS = 1000;
static const uint32_t BLE_SEND_INTERVAL_MS = 100;    // 100ms = 10Hz BLE
static const uint32_t SAMPLE_INTERVAL_MS  = 50;      // ~20Hz sensor

// Acceleration filtering
static const float R_MIN_G         = 0.40f;
static const float R_MAX_G         = 1.60f;
static const float DTHETA_DEADBAND = 0.020f;         // ~1.15°
static const float MAX_DTHETA      = 0.50f;

// 1 second window for motion detection
static const uint32_t WINDOW_MS    = 1000;
static const float MOVE_THRESH_RAD = 0.10f;
static const float DIR_BIAS_RAD    = 0.02f;

// Turn detection using Gyro Y
static const float TURN_ANGLE_THRESH_DEG = 8.0f;

// Distance scale
static const float ANGLE_TO_DIST_SCALE = 1.00f;

/* ===== Motion/Direction Enums ===== */
enum Motion { STOP=0, FORWARD=1, BACKWARD=2 };
enum Direction { STRAIGHT=0, LEFT=1, RIGHT=2 };

/* ===== Devices ===== */
LSM6DS3 imu(I2C_MODE, 0x6A);
bool imu_ok = false;

U8X8_SSD1306_128X64_NONAME_HW_I2C u8x8(PIN_WIRE_SCL, PIN_WIRE_SDA, U8X8_PIN_NONE);

/* ===== Sensor Data ===== */
float gx = 0.0f, gy = 0.0f, gz = 0.0f;
float ax = 0.0f, ay = 0.0f, az = 0.0f;

/* ===== Motion Calculation ===== */
float total_distance_m = 0.0f;
Motion report_motion = STOP;
Direction report_dir = STRAIGHT;

// Angle from Accel & filters
bool  have_theta   = false;
float theta_prev   = 0.0f;

// median-3 filter
float ax_hist[3] = {0,0,0};
float ay_hist[3] = {0,0,0};
int   hist_idx   = 0;

// 1-second window
unsigned long winStartMs = 0;
float win_abs_sum     = 0.0f;
float win_signed_sum  = 0.0f;
float win_gyro_y_angle_deg = 0.0f;

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

/* ===== BLE Advertisement Data Format ===== 
 * Total 24 bytes in manufacturer data:
 * [0]     = WHEEL_ID (1 byte)
 * [1]     = packet type (0x02 = full data)
 * [2-5]   = gx (float, 4 bytes)
 * [6-9]   = gy (float, 4 bytes)  
 * [10-13] = gz (float, 4 bytes)
 * [14]    = motion (0=STOP, 1=FWD, 2=BWD)
 * [15]    = direction (0=STRAIGHT, 1=LEFT, 2=RIGHT)
 * [16-17] = distance * 100 (uint16, little-endian)
 * [18-21] = reserved
 * [22-23] = checksum (2 bytes)
 */
uint8_t advdata[24] = {0};

static void sendBleAdvertisement() {
  // Pack data with company ID prefix (2 bytes)
  // Using 0xFFFF as custom/test company ID
  uint8_t mfr_payload[26];  // 2 bytes company ID + 24 bytes data
  
  // Company ID (little-endian) - 0xFFFF for testing
  mfr_payload[0] = 0xFF;
  mfr_payload[1] = 0xFF;
  
  // Data starts at offset 2
  mfr_payload[2] = (uint8_t)WHEEL_ID;
  mfr_payload[3] = 0x02;  // packet type: full data

  // Pack gyro as floats (little-endian)
  memcpy(&mfr_payload[4], &gx, sizeof(float));
  memcpy(&mfr_payload[8], &gy, sizeof(float));
  memcpy(&mfr_payload[12], &gz, sizeof(float));

  // Motion & Direction
  mfr_payload[16] = (uint8_t)report_motion;
  mfr_payload[17] = (uint8_t)report_dir;

  // Distance * 100 (little-endian)
  uint16_t encDist = (uint16_t)(total_distance_m * DISTANCE_ENCODE_FACTOR);
  mfr_payload[18] = encDist & 0xFF;
  mfr_payload[19] = (encDist >> 8) & 0xFF;

  // Reserved
  mfr_payload[20] = 0;
  mfr_payload[21] = 0;
  mfr_payload[22] = 0;
  mfr_payload[23] = 0;

  // Simple checksum (over data portion only, bytes 2-23)
  uint16_t checksum = 0;
  for (int i = 2; i < 24; i++) {
    checksum += mfr_payload[i];
  }
  mfr_payload[24] = checksum & 0xFF;
  mfr_payload[25] = (checksum >> 8) & 0xFF;

  // Update BLE advertisement
  Bluefruit.Advertising.stop();
  Bluefruit.Advertising.clearData();
  Bluefruit.Advertising.addFlags(BLE_GAP_ADV_FLAGS_LE_ONLY_GENERAL_DISC_MODE);
  
  // Add raw manufacturer data (includes company ID)
  Bluefruit.Advertising.addData(BLE_GAP_AD_TYPE_MANUFACTURER_SPECIFIC_DATA, mfr_payload, sizeof(mfr_payload));
  
  Bluefruit.Advertising.setInterval(160, 160);  // 100ms
  Bluefruit.Advertising.restartOnDisconnect(true);
  Bluefruit.Advertising.start(0);
}

/* ===== Main tick ===== */
static void tick() {
  if (!imu_ok) {
    if (millis() - lastBleMs >= BLE_SEND_INTERVAL_MS) {
      lastBleMs = millis();
      sendBleAdvertisement();
    }
    if (millis() - lastDisplayMs >= DISPLAY_INTERVAL_MS) {
      lastDisplayMs = millis();
      u8x8.clearDisplay();
      u8x8.setCursor(0,0);
      u8x8.printf("WHEEL_%02d\n", WHEEL_ID);
      u8x8.println("IMU ERROR");
    }
    return;
  }

  // Read sensor at fixed interval
  if (millis() - lastSampleMs >= SAMPLE_INTERVAL_MS) {
    uint32_t now = millis();
    float dt_s = (float)(now - lastSampleMs) * 0.001f;
    lastSampleMs = now;

    // 1) Read Gyro (degrees per second)
    gx = imu.readFloatGyroX();
    gy = imu.readFloatGyroY();
    gz = imu.readFloatGyroZ();

    // 2) Read Accel (g) -> median-3 filter
    float ax_raw = imu.readFloatAccelX();
    float ay_raw = imu.readFloatAccelY();
    ax_hist[hist_idx] = ax_raw;
    ay_hist[hist_idx] = ay_raw;
    hist_idx = (hist_idx + 1) % 3;

    ax = median3(ax_hist[0], ax_hist[1], ax_hist[2]);
    ay = median3(ay_hist[0], ay_hist[1], ay_hist[2]);
    az = imu.readFloatAccelZ();

    // Check acceleration reliability
    float r = sqrtf(ax*ax + ay*ay);
    bool reliable = (r >= R_MIN_G && r <= R_MAX_G);

    // Integrate gyro Y for turn detection
    float gyro_y_dps = -gy;
    win_gyro_y_angle_deg += gyro_y_dps * dt_s;

    // Calculate theta from accel
    float theta = reliable ? atan2f(ay, ax) : theta_prev;

    if (!have_theta) {
      have_theta = true;
      theta_prev = theta;
      winStartMs = millis();
      win_abs_sum = win_signed_sum = 0.0f;
      win_gyro_y_angle_deg = 0.0f;
    }

    // Calculate dtheta when reliable
    if (reliable) {
      float dtheta = unwrapDelta(theta, theta_prev);
      if (fabsf(dtheta) < DTHETA_DEADBAND) dtheta = 0.0f;
      if (dtheta >  MAX_DTHETA) dtheta =  MAX_DTHETA;
      if (dtheta < -MAX_DTHETA) dtheta = -MAX_DTHETA;
      theta_prev = theta;

      win_abs_sum    += fabsf(dtheta);
      win_signed_sum += dtheta;
    }

    // Debug output
    Serial.printf("GX:%.1f GY:%.1f GZ:%.1f | AX:%.2f AY:%.2f AZ:%.2f\n",
                  gx, gy, gz, ax, ay, az);
  }

  // 1-second window: calculate motion/direction
  if (millis() - winStartMs >= WINDOW_MS) {
    // Motion detection
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

    // Direction detection (using gyro Y integration)
    float turn_angle = win_gyro_y_angle_deg;
    if (fabsf(turn_angle) < TURN_ANGLE_THRESH_DEG) {
      report_dir = STRAIGHT;
    } else {
      report_dir = (turn_angle > 0.0f) ? RIGHT : LEFT;
    }

    // Reset window
    winStartMs = millis();
    win_abs_sum = win_signed_sum = 0.0f;
    win_gyro_y_angle_deg = 0.0f;

    Serial.printf(">> Motion:%d Dir:%d Dist:%.2fm\n", 
                  report_motion, report_dir, total_distance_m);
  }

  // Send BLE advertisement
  if (millis() - lastBleMs >= BLE_SEND_INTERVAL_MS) {
    lastBleMs = millis();
    sendBleAdvertisement();
  }

  // Update OLED display every 1 second
  if (millis() - lastDisplayMs >= DISPLAY_INTERVAL_MS) {
    lastDisplayMs = millis();
    
    const char* moveStr =
      (report_motion == FORWARD)  ? "FWD" :
      (report_motion == BACKWARD) ? "BWD" : "STOP";
    const char* dirStr =
      (report_dir == LEFT) ? "LEFT" :
      (report_dir == RIGHT)? "RIGHT" : "STRAIGHT";

    u8x8.clearDisplay();
    u8x8.setCursor(0,0);
    u8x8.printf("WHEEL_%02d\n", WHEEL_ID);
    u8x8.printf("GX:%.0f GY:%.0f\n", gx, gy);
    u8x8.printf("GZ:%.0f\n", gz);
    u8x8.printf("D:%.2fm\n", total_distance_m);
    u8x8.printf("M:%s %s\n", moveStr, dirStr);
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
  u8x8.println("Wheel Sensor");
  u8x8.println("Starting...");

  // IMU
  imu_ok = (imu.begin() == 0);
  if (imu_ok) {
    Serial.println("IMU initialized OK");
    u8x8.println("IMU: OK");
    
    // Initialize median filter
    float ax0 = imu.readFloatAccelX();
    float ay0 = imu.readFloatAccelY();
    ax_hist[0] = ax_hist[1] = ax_hist[2] = ax0;
    ay_hist[0] = ay_hist[1] = ay_hist[2] = ay0;
  } else {
    Serial.println("IMU FAIL!");
    u8x8.println("IMU: FAIL");
  }

  // BLE
  Bluefruit.begin();
  
  #if defined(NRF52840_XXAA)
    Bluefruit.setTxPower(8);
  #else
    Bluefruit.setTxPower(4);
  #endif

  char bleName[16];
  snprintf(bleName, sizeof(bleName), "Wheel_%02d", WHEEL_ID);
  Bluefruit.setName(bleName);
  Bluefruit.ScanResponse.addName();

  // Start advertising
  sendBleAdvertisement();

  Serial.println("================================");
  Serial.printf("Wheel Sensor - ID: %d\n", WHEEL_ID);
  Serial.println("Sending: Gyro + Motion + Direction + Distance");
  Serial.println("No AES encryption");
  Serial.println("================================");

  lastBleMs = millis();
  lastDisplayMs = millis();
  winStartMs = millis();
  lastSampleMs = millis();
}

/* ===== Loop ===== */
void loop() {
  tick();
}
