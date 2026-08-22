#include "ws_build_config.h"

#if defined(WS_TEST_EXPECT_MINIMAL)
_Static_assert(WS_FEATURE_WIFI == 0, "minimal Wi-Fi");
_Static_assert(WS_FEATURE_BLE == 0, "minimal BLE");
_Static_assert(WS_FEATURE_CAMERA == 0, "minimal camera");
_Static_assert(WS_FEATURE_ENVIRONMENT == 0, "minimal environment");
_Static_assert(WS_FEATURE_MICROPHONE == 0, "minimal microphone");
_Static_assert(WS_FEATURE_SPEAKER == 0, "minimal speaker");
_Static_assert(WS_FEATURE_TOUCH == 0, "minimal touch");
_Static_assert(WS_FEATURE_MOTION_AI == 0, "minimal motion AI");
#else
_Static_assert(WS_FEATURE_WIFI == 1, "default Wi-Fi");
_Static_assert(WS_FEATURE_BLE == 1, "default BLE");
_Static_assert(WS_FEATURE_CAMERA == 1, "default camera");
_Static_assert(WS_FEATURE_ENVIRONMENT == 1, "default environment");
_Static_assert(WS_FEATURE_MICROPHONE == 0, "default microphone deferred");
_Static_assert(WS_FEATURE_SPEAKER == 0, "default speaker deferred");
_Static_assert(WS_FEATURE_TOUCH == 1, "default touch");
_Static_assert(WS_FEATURE_MOTION_AI == 0, "default motion AI");
#endif

#if defined(WS_TEST_EXPECT_HOST)
_Static_assert(WS_FEATURE_HOST_SIM == 1, "host simulation");
#else
_Static_assert(WS_FEATURE_HOST_SIM == 0, "target build");
#endif

_Static_assert(WS_FEATURE_BITSTREAM == 0, "BitStream stays disabled");
_Static_assert(WS_FEATURE_SENSOR_STUDIO == 0, "Sensor Studio stays disabled");
_Static_assert(WS_FEATURE_DIGITAL_TWIN == 0, "Digital Twin stays disabled");
