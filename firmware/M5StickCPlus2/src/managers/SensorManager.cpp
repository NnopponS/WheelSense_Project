#include "SensorManager.h"
#include "Config.h"
#include <math.h>

SensorManager SensorMgr;

// Wheelchair status and speed estimation thresholds
static constexpr float R_MIN_G = 0.40f;
static constexpr float R_MAX_G = 1.60f;
static constexpr float DTHETA_DEADBAND = 0.020f;
static constexpr float MAX_DTHETA = 0.50f;
static constexpr float ANGLE_TO_DIST_SCALE = 1.00f;
static constexpr unsigned long WINDOW_MS = 1000;
static constexpr float MOVE_THRESH_RAD = 0.10f;
static constexpr float GYRO_THRESHOLD_DPS = 200.0f;
static constexpr float MAX_SPEED_MPS = 3.0f;

static inline float unwrapDelta(float now, float prev) {
    float d = now - prev;
    while (d > PI) d -= 2.0f * PI;
    while (d <= -PI) d += 2.0f * PI;
    return d;
}

static inline float median3(float a, float b, float c) {
    if (a > b) { float t = a; a = b; b = t; }
    if (b > c) { float t = b; b = c; c = t; }
    if (a > b) { float t = a; a = b; b = t; }
    return b;
}

SensorManager::SensorManager() {}

void SensorManager::begin() {
    memset(&data, 0, sizeof(data));
    data.batPercentage = -1;
    data.batVoltage = 0.0f;
    data.imuValid = false;
    data.distanceM = 0.0f;
    data.speedMps = 0.0f;
    data.wheelchairStatusBits = 0;
    data.motionDirection = 0;

    // IMU is init in M5.begin() usually, but safe to ensure
    // M5.Imu.Init(); // handled by main M5.begin
    auto imu_data = M5.Imu.getImuData();
    axHist[0] = axHist[1] = axHist[2] = imu_data.accel.x;
    ayHist[0] = ayHist[1] = ayHist[2] = imu_data.accel.y;
    haveTheta = false;
    winStartMs = millis();
    winSignedSum = 0.0f;
}

void SensorManager::update() {
    updateIMU();
    
    // Update battery less frequently? M5.Power calls are fast enough
    updateBattery();
}

void SensorManager::updateIMU() {
    if (!M5.Imu.update()) {
        data.imuValid = false;
        return;
    }

    auto imu_data = M5.Imu.getImuData();
    data.accelX = imu_data.accel.x;
    data.accelY = imu_data.accel.y;
    data.accelZ = imu_data.accel.z;
    data.gyroX = imu_data.gyro.x;
    data.gyroY = imu_data.gyro.y;
    data.gyroZ = imu_data.gyro.z;
    data.imuValid = true;

    // Fall Detection
    float magnitude = sqrtf(data.accelX * data.accelX + data.accelY * data.accelY + data.accelZ * data.accelZ);
    filteredAccelMagnitude = (0.8f * filteredAccelMagnitude) + (0.2f * magnitude);

    const float threshold = max(1.2f, ConfigMgr.getConfig().fallThreshold);
    const unsigned long now = millis();
    bool triggered = filteredAccelMagnitude > threshold;
    if (triggered && (now - lastFallEventMs) > 1000) {
        data.isFallDetected = true;
        lastFallEventMs = now;
        M5.Speaker.tone(4000, 120);
    } else {
        data.isFallDetected = false;
    }
    
    // Simple activity metric
    data.activityLevel = (abs(data.accelX) + abs(data.accelY) + abs(data.accelZ) - 1.0f) * 10.0f;
    data.activityLevel = constrain(data.activityLevel, 0.0f, 10.0f);
    data.isMoving = data.activityLevel > 0.5;

    // Distance/speed estimate from wheel-plane angle
    axHist[histIdx] = data.accelX;
    ayHist[histIdx] = data.accelY;
    histIdx = (histIdx + 1) % 3;

    float axFilt = median3(axHist[0], axHist[1], axHist[2]);
    float ayFilt = median3(ayHist[0], ayHist[1], ayHist[2]);

    float r = sqrtf(axFilt * axFilt + ayFilt * ayFilt);
    bool reliable = (r >= R_MIN_G && r <= R_MAX_G);
    float theta = reliable ? atan2f(ayFilt, axFilt) : thetaPrev;

    if (!haveTheta) {
        haveTheta = true;
        thetaPrev = theta;
        winStartMs = millis();
        winSignedSum = 0.0f;
    }

    if (reliable) {
        float dtheta = unwrapDelta(theta, thetaPrev);
        if (fabsf(dtheta) < DTHETA_DEADBAND) dtheta = 0.0f;
        if (dtheta > MAX_DTHETA) dtheta = MAX_DTHETA;
        if (dtheta < -MAX_DTHETA) dtheta = -MAX_DTHETA;
        thetaPrev = theta;
        winSignedSum += dtheta;
    }

    const unsigned long nowMs = millis();
    if (nowMs - winStartMs >= WINDOW_MS) {
        const bool moving = (fabsf(winSignedSum) >= MOVE_THRESH_RAD);
        if (moving) {
            float wheelRadiusM = ConfigMgr.getConfig().wheelRadiusM;
            if (wheelRadiusM < 0.05f || wheelRadiusM > 1.0f) wheelRadiusM = DEFAULT_WHEEL_RADIUS_M;
            float deltaDistance = ANGLE_TO_DIST_SCALE * fabsf(winSignedSum) * wheelRadiusM;
            data.distanceM += deltaDistance;
            data.speedMps = deltaDistance / (WINDOW_MS / 1000.0f);
            data.motionDirection = (winSignedSum > 0.0f) ? 1 : -1;
        } else {
            data.speedMps = 0.0f;
            data.motionDirection = 0;
        }
        winStartMs = nowMs;
        winSignedSum = 0.0f;
    }

    // Unified wheelchair status (matches MQTT/dashboard fields)
    uint8_t statusBits = 0;
    const bool magnitudeOk = (magnitude >= R_MIN_G && magnitude <= R_MAX_G);
    const bool orientationOk = (fabsf(data.accelZ) < 0.5f) && (fabsf(data.accelX) > 0.3f || fabsf(data.accelY) > 0.3f);
    const float gyroMag = sqrtf(data.gyroX * data.gyroX + data.gyroY * data.gyroY + data.gyroZ * data.gyroZ);

    if (!magnitudeOk) statusBits |= WS_STATUS_IMU_NOT_WORKING;
    if (magnitudeOk && !orientationOk) statusBits |= WS_STATUS_IMU_WRONG_ORIENTATION;
    if (gyroMag > GYRO_THRESHOLD_DPS) statusBits |= WS_STATUS_SPINNING_TOO_FAST;
    if (data.speedMps > MAX_SPEED_MPS) statusBits |= WS_STATUS_SPEED_ABNORMAL;

    data.wheelchairStatusBits = statusBits;

}

void SensorManager::updateBattery() {
    // BruceDevices-style voltage->percent conversion with smoothing to reduce jitter.
    const int rawMv = M5.Power.getBatteryVoltage();
    const bool validRaw = (rawMv >= 2800 && rawMv <= 4600);
    const float mv = validRaw ? (float)rawMv : 3700.0f;

    if (!batteryFilterInit) {
        batteryFilterInit = true;
        filteredBatVoltageMv = mv;
    } else {
        filteredBatVoltageMv = (0.9f * filteredBatVoltageMv) + (0.1f * mv);
    }

    const float MIN_VOLTAGE_MV = 3300.0f;
    const float MAX_VOLTAGE_MV = 4150.0f;
    float percent = ((filteredBatVoltageMv - MIN_VOLTAGE_MV) / (MAX_VOLTAGE_MV - (MIN_VOLTAGE_MV + 50.0f))) * 100.0f;
    if (percent < 1.0f) percent = 1.0f;
    if (percent > 100.0f) percent = 100.0f;

    if (stableBatPercent < 0) {
        filteredBatPercent = percent;
        stableBatPercent = (int)roundf(percent);
    } else {
        filteredBatPercent = (0.85f * filteredBatPercent) + (0.15f * percent);
        int nextPct = (int)roundf(filteredBatPercent);
        // 1% hysteresis: keep value unless it actually changes by >=1.
        if (abs(nextPct - stableBatPercent) >= 1) {
            stableBatPercent = nextPct;
        }
    }

    data.batVoltage = filteredBatVoltageMv / 1000.0f;
    data.batPercentage = stableBatPercent;
    data.isCharging = M5.Power.isCharging();
}

SensorData& SensorManager::getData() {
    return data;
}

String SensorManager::getWheelchairStatusPayload() const {
    if (data.wheelchairStatusBits == 0) return "OK";

    String status = "";
    if (data.wheelchairStatusBits & WS_STATUS_IMU_NOT_WORKING) status += "IMU_NOT_WORKING;";
    if (data.wheelchairStatusBits & WS_STATUS_IMU_WRONG_ORIENTATION) status += "IMU_WRONG_ORIENTATION;";
    if (data.wheelchairStatusBits & WS_STATUS_SPINNING_TOO_FAST) status += "SPINNING_TOO_FAST;";
    if (data.wheelchairStatusBits & WS_STATUS_SPEED_ABNORMAL) status += "SPEED_ABNORMAL;";
    if (status.endsWith(";")) status.remove(status.length() - 1);
    return status;
}

String SensorManager::getWheelchairStatusShort() const {
    if (data.wheelchairStatusBits == 0) return "OK";
    if (data.wheelchairStatusBits & WS_STATUS_IMU_NOT_WORKING) return "IMU_ERR";
    if (data.wheelchairStatusBits & WS_STATUS_IMU_WRONG_ORIENTATION) return "W_DIR";
    if (data.wheelchairStatusBits & WS_STATUS_SPINNING_TOO_FAST) return "SPIN_FAST";
    if (data.wheelchairStatusBits & WS_STATUS_SPEED_ABNORMAL) return "SPD_HIGH";
    return "WARN";
}

String SensorManager::getMotionShort() const {
    if (data.motionDirection > 0) return "FWD";
    if (data.motionDirection < 0) return "BWD";
    return "STP";
}
