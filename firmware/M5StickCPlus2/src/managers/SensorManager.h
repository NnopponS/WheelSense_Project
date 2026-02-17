#ifndef SENSOR_MANAGER_H
#define SENSOR_MANAGER_H

#include <M5StickCPlus2.h>
#include "ConfigManager.h"

struct SensorData {
    // IMU
    float accelX, accelY, accelZ;
    float gyroX, gyroY, gyroZ;
    float pitch, roll, yaw;
    
    // Analyzed Data
    bool isFallDetected;
    bool isMoving;
    float activityLevel; // 0.0 - 10.0
    
    // Battery
    int batPercentage;
    float batVoltage;
    bool isCharging;
    bool isChargingRaw;
    int batRawMv;
    int batFilteredMv;

    // Health
    bool imuValid;

    // Wheelchair metrics for MQTT/dashboard
    float distanceM;
    float speedMps;
    uint8_t wheelchairStatusBits; // 0=OK, bitmask for warnings/errors
    int8_t motionDirection; // -1=backward, 0=stop, 1=forward
};

enum WheelchairStatusBits : uint8_t {
    WS_STATUS_IMU_NOT_WORKING     = 0x01,
    WS_STATUS_IMU_WRONG_ORIENTATION = 0x02,
    WS_STATUS_SPINNING_TOO_FAST   = 0x04,
    WS_STATUS_SPEED_ABNORMAL      = 0x08
};

class SensorManager {
public:
    SensorManager();
    void begin();
    void update();
    void calibrate();
    
    SensorData& getData();
    String getWheelchairStatusPayload() const;
    String getWheelchairStatusShort() const;
    String getMotionShort() const;
    
private:
    SensorData data;
    
    void updateIMU();
    void updateBattery();
    
    // Fall Detection
    unsigned long lastFallCheck = 0;
    unsigned long lastFallEventMs = 0;
    float filteredAccelMagnitude = 1.0f;
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

    // Wheel-distance/speed estimation
    bool haveTheta = false;
    float thetaPrev = 0.0f;
    float axHist[3] = {0.0f, 0.0f, 0.0f};
    float ayHist[3] = {0.0f, 0.0f, 0.0f};
    int histIdx = 0;
    unsigned long winStartMs = 0;
    float winSignedSum = 0.0f;

    float mapBatteryPercentLiIon(float mv) const;
    bool updateChargingState(bool rawState, unsigned long nowMs);
};

extern SensorManager SensorMgr;

#endif
