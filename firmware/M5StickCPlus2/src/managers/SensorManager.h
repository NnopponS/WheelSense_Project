#ifndef SENSOR_MANAGER_H
#define SENSOR_MANAGER_H

#include <M5StickCPlus2.h>
#include "ConfigManager.h"

struct SensorData {
    // Raw IMU (6-axis)
    float accelX, accelY, accelZ;   // g
    float gyroX, gyroY, gyroZ;      // dps
    float pitch, roll;              // degrees (from accelerometer)
    bool imuValid;

    // Computed motion (from gyroscope integration)
    float distanceM;                // cumulative distance (m)
    float velocityMs;               // current velocity (m/s)
    float accelMs2;                 // current acceleration (m/s²)
    int8_t direction;               // -1=backward, 0=stop, 1=forward

    // Battery
    int batPercentage;
    float batVoltage;
    bool isCharging;
    int batRawMv;
    int batFilteredMv;
};

class SensorManager {
public:
    SensorManager();
    void begin();
    void update();
    SensorData& getData();

private:
    SensorData data;

    void updateIMU();
    void updateBattery();

    // Gyro-based distance/velocity/acceleration
    static constexpr float GYRO_DEADBAND_DPS = 3.0f;
    static constexpr float MAX_SPEED_MPS = 3.0f;
    static constexpr unsigned long WINDOW_MS = 500;
    unsigned long lastImuReadMs = 0;
    unsigned long winStartMs = 0;
    float winDistanceM = 0.0f;
    float prevVelocityMs = 0.0f;

    // Battery filtering
    bool batteryFilterInit = false;
    float filteredBatVoltageMv = 0.0f;
    float filteredBatPercent = 0.0f;
    int stableBatPercent = -1;
    unsigned long lastBatterySampleMs = 0;
    bool chargeDebounceInit = false;
    bool chargingStableState = false;
    bool chargingCandidateState = false;
    uint8_t chargingCandidateCount = 0;
    unsigned long chargingLastSwitchMs = 0;

    float mapBatteryPercentLiIon(float mv) const;
    bool updateChargingState(bool rawState, unsigned long nowMs);
};

extern SensorManager SensorMgr;

#endif
