#include "SensorManager.h"
#include "Config.h"
#include <math.h>

SensorManager SensorMgr;

static constexpr float DEG_TO_RAD_F = 0.0174532925f;
static constexpr float RAD_TO_DEG_F = 57.2957795f;

SensorManager::SensorManager() {}

void SensorManager::begin() {
    memset(&data, 0, sizeof(data));
    data.batPercentage = -1;
    data.imuValid = false;
    data.distanceM = 0.0f;
    data.velocityMs = 0.0f;
    data.accelMs2 = 0.0f;
    data.direction = 0;
    lastImuReadMs = millis();
    winStartMs = millis();
    winDistanceM = 0.0f;
    prevVelocityMs = 0.0f;
    lastBatterySampleMs = 0;
    batteryFilterInit = false;
    chargeDebounceInit = false;
}

void SensorManager::update() {
    updateIMU();
    updateBattery();
}

void SensorManager::updateIMU() {
    if (!M5.Imu.update()) {
        data.imuValid = false;
        return;
    }

    const unsigned long nowMs = millis();
    const float dt = (nowMs - lastImuReadMs) / 1000.0f;
    lastImuReadMs = nowMs;

    auto imu_data = M5.Imu.getImuData();
    data.accelX = imu_data.accel.x;
    data.accelY = imu_data.accel.y;
    data.accelZ = imu_data.accel.z;
    data.gyroX = imu_data.gyro.x;
    data.gyroY = imu_data.gyro.y;
    data.gyroZ = imu_data.gyro.z;
    data.imuValid = true;

    // Orientation from accelerometer
    data.roll  = atan2f(data.accelY, data.accelZ) * RAD_TO_DEG_F;
    data.pitch = atan2f(-data.accelX,
                        sqrtf(data.accelY * data.accelY + data.accelZ * data.accelZ)) * RAD_TO_DEG_F;

    // --- Gyroscope-based distance/velocity/acceleration ---
    // gyroZ = angular velocity of wheel rotation (dps)
    // Mount M5StickC so Z-axis is perpendicular to wheel plane.
    if (dt > 0.0f && dt < 1.0f) {
        float gzDps = data.gyroZ;

        // Apply deadband
        if (fabsf(gzDps) < GYRO_DEADBAND_DPS) {
            gzDps = 0.0f;
        }

        // Convert to rad/s and integrate
        float angularVelRad = gzDps * DEG_TO_RAD_F;
        float angularDelta = angularVelRad * dt;
        float wheelRadius = ConfigMgr.getConfig().wheelRadiusM;
        if (wheelRadius < 0.05f || wheelRadius > 1.0f) wheelRadius = DEFAULT_WHEEL_RADIUS_M;

        float distDelta = fabsf(angularDelta) * wheelRadius;
        data.distanceM += distDelta;
        winDistanceM += distDelta;

        // Direction from sign of gyroZ
        if (fabsf(gzDps) >= GYRO_DEADBAND_DPS) {
            data.direction = (gzDps > 0.0f) ? 1 : -1;
        } else {
            data.direction = 0;
        }
    }

    // Compute velocity and acceleration over sliding window
    if (nowMs - winStartMs >= WINDOW_MS) {
        float windowSec = (nowMs - winStartMs) / 1000.0f;
        if (windowSec > 0.0f) {
            float velocity = winDistanceM / windowSec;
            if (velocity > MAX_SPEED_MPS) velocity = MAX_SPEED_MPS;
            data.accelMs2 = (velocity - prevVelocityMs) / windowSec;
            data.velocityMs = velocity;
            prevVelocityMs = velocity;
        }
        winStartMs = nowMs;
        winDistanceM = 0.0f;
    }
}

// ---- Battery ----

float SensorManager::mapBatteryPercentLiIon(float mv) const {
    struct VoltagePoint { float mv; float pct; };
    static const VoltagePoint curve[] = {
        {3200, 0}, {3300, 3}, {3400, 8}, {3500, 14},
        {3600, 24}, {3700, 42}, {3750, 52}, {3800, 62},
        {3850, 72}, {3900, 82}, {3950, 88}, {4000, 93},
        {4050, 96}, {4100, 98}, {4150, 99}, {4200, 100}
    };
    constexpr size_t count = sizeof(curve) / sizeof(curve[0]);
    if (mv <= curve[0].mv) return curve[0].pct;
    if (mv >= curve[count - 1].mv) return curve[count - 1].pct;
    for (size_t i = 1; i < count; i++) {
        if (mv <= curve[i].mv) {
            float t = (mv - curve[i-1].mv) / (curve[i].mv - curve[i-1].mv);
            return curve[i-1].pct + (curve[i].pct - curve[i-1].pct) * t;
        }
    }
    return 100.0f;
}

bool SensorManager::updateChargingState(bool rawState, unsigned long nowMs) {
    if (!chargeDebounceInit) {
        chargeDebounceInit = true;
        chargingStableState = rawState;
        chargingCandidateState = rawState;
        chargingCandidateCount = 0;
        chargingLastSwitchMs = nowMs;
        return chargingStableState;
    }
    if (rawState == chargingStableState) {
        chargingCandidateState = chargingStableState;
        chargingCandidateCount = 0;
        return chargingStableState;
    }
    if (rawState != chargingCandidateState) {
        chargingCandidateState = rawState;
        chargingCandidateCount = 1;
        return chargingStableState;
    }
    if (chargingCandidateCount < 255) chargingCandidateCount++;
    if (chargingCandidateCount >= BATTERY_CHARGE_DEBOUNCE_SAMPLES &&
        (nowMs - chargingLastSwitchMs) >= BATTERY_CHARGE_MIN_SWITCH_MS) {
        chargingStableState = chargingCandidateState;
        chargingLastSwitchMs = nowMs;
        chargingCandidateCount = 0;
    }
    return chargingStableState;
}

void SensorManager::updateBattery() {
    const unsigned long nowMs = millis();
    if (batteryFilterInit && (nowMs - lastBatterySampleMs) < BATTERY_SAMPLE_INTERVAL_MS) return;
    lastBatterySampleMs = nowMs;

    const int rawMv = M5.Power.getBatteryVoltage();
    const bool validRaw = (rawMv >= 3000 && rawMv <= 4500);
    const bool chargingRaw = M5.Power.isCharging();
    const bool chargingStable = updateChargingState(chargingRaw, nowMs);

    float sampleMv = validRaw ? (float)rawMv : filteredBatVoltageMv;
    if (!validRaw && sampleMv <= 0.0f) sampleMv = 3700.0f;

    if (!batteryFilterInit) {
        batteryFilterInit = true;
        filteredBatVoltageMv = sampleMv;
    } else {
        float alpha = chargingStable ? 0.06f : 0.12f;
        filteredBatVoltageMv = (1.0f - alpha) * filteredBatVoltageMv + alpha * sampleMv;
    }

    float percent = mapBatteryPercentLiIon(filteredBatVoltageMv);
    percent = constrain(percent, 0.0f, 100.0f);

    if (stableBatPercent < 0) {
        filteredBatPercent = percent;
        stableBatPercent = (int)roundf(percent);
    } else {
        filteredBatPercent = 0.92f * filteredBatPercent + 0.08f * percent;
        int nextPct = (int)roundf(filteredBatPercent);
        if (chargingStable && nextPct < stableBatPercent && (stableBatPercent - nextPct) <= 2)
            nextPct = stableBatPercent;
        if (!chargingStable && nextPct > stableBatPercent && (nextPct - stableBatPercent) <= 2)
            nextPct = stableBatPercent;
        if (nextPct > stableBatPercent) stableBatPercent++;
        else if (nextPct < stableBatPercent) stableBatPercent--;
        stableBatPercent = constrain(stableBatPercent, 0, 100);
    }

    data.batVoltage = filteredBatVoltageMv / 1000.0f;
    data.batPercentage = stableBatPercent;
    data.batRawMv = rawMv;
    data.batFilteredMv = (int)lroundf(filteredBatVoltageMv);
    data.isCharging = chargingStable;
}

SensorData& SensorManager::getData() {
    return data;
}
