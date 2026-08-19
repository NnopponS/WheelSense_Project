#ifndef WS_BUILD_CONFIG_H
#define WS_BUILD_CONFIG_H

#ifndef WS_FEATURE_WIFI
#define WS_FEATURE_WIFI 1
#endif
#ifndef WS_FEATURE_BLE
#define WS_FEATURE_BLE 1
#endif
#ifndef WS_FEATURE_CAMERA
#define WS_FEATURE_CAMERA 1
#endif
#ifndef WS_FEATURE_ENVIRONMENT
#define WS_FEATURE_ENVIRONMENT 1
#endif
#ifndef WS_FEATURE_MICROPHONE
#define WS_FEATURE_MICROPHONE 1
#endif
#ifndef WS_FEATURE_SPEAKER
#define WS_FEATURE_SPEAKER 1
#endif
#ifndef WS_FEATURE_TOUCH
#define WS_FEATURE_TOUCH 1
#endif
#ifndef WS_FEATURE_MOTION_AI
#define WS_FEATURE_MOTION_AI 0
#endif
#ifndef WS_FEATURE_HOST_SIM
#define WS_FEATURE_HOST_SIM 0
#endif
#ifndef WS_FEATURE_BITSTREAM
#define WS_FEATURE_BITSTREAM 0
#endif
#ifndef WS_FEATURE_SENSOR_STUDIO
#define WS_FEATURE_SENSOR_STUDIO 0
#endif
#ifndef WS_FEATURE_DIGITAL_TWIN
#define WS_FEATURE_DIGITAL_TWIN 0
#endif

#if (((WS_FEATURE_WIFI != 0) && (WS_FEATURE_WIFI != 1)) || \
     ((WS_FEATURE_BLE != 0) && (WS_FEATURE_BLE != 1)) || \
     ((WS_FEATURE_CAMERA != 0) && (WS_FEATURE_CAMERA != 1)) || \
     ((WS_FEATURE_ENVIRONMENT != 0) && (WS_FEATURE_ENVIRONMENT != 1)) || \
     ((WS_FEATURE_MICROPHONE != 0) && (WS_FEATURE_MICROPHONE != 1)) || \
     ((WS_FEATURE_SPEAKER != 0) && (WS_FEATURE_SPEAKER != 1)) || \
     ((WS_FEATURE_TOUCH != 0) && (WS_FEATURE_TOUCH != 1)) || \
     ((WS_FEATURE_MOTION_AI != 0) && (WS_FEATURE_MOTION_AI != 1)) || \
     ((WS_FEATURE_HOST_SIM != 0) && (WS_FEATURE_HOST_SIM != 1)))
#error "WheelSense feature flags must be 0 or 1"
#endif

#if WS_FEATURE_BITSTREAM != 0
#error "BitStream is not a WheelSense runtime dependency"
#endif
#if WS_FEATURE_SENSOR_STUDIO != 0
#error "Sensor Studio is not a WheelSense runtime dependency"
#endif
#if WS_FEATURE_DIGITAL_TWIN != 0
#error "Digital Twin is not a WheelSense runtime dependency"
#endif

#endif
