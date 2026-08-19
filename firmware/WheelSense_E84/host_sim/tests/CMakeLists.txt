# Host-side protocol and contract tests.
#
# These tests run on the development machine (not the E84 target) and verify
# byte-exact wire encoding/decoding, malformed-input rejection, and the
# frozen type/feature contracts.

set(SHARED_INCLUDE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../shared/include")
set(SHARED_SOURCE_DIR  "${CMAKE_CURRENT_SOURCE_DIR}/../../shared/source")

set(WS_COMPILE_FLAGS -Wall -Wextra -Werror -std=c11)

# --- Protocol codec test (P1.4) — runtime executable with main() ---
add_executable(test_protocol
    test_protocol.c
    ${SHARED_SOURCE_DIR}/ws_protocol.c
)
target_include_directories(test_protocol PRIVATE ${SHARED_INCLUDE_DIR})
target_compile_options(test_protocol PRIVATE ${WS_COMPILE_FLAGS})
add_test(NAME ws_protocol COMMAND test_protocol)

# --- IPC message codec test (P1.5) — runtime executable with main() ---
add_executable(test_ipc_messages
    test_ipc_messages.c
    ${SHARED_SOURCE_DIR}/ws_protocol.c
    ${SHARED_SOURCE_DIR}/ws_ipc_messages.c
    ${SHARED_SOURCE_DIR}/ws_ble_payloads.c
)
target_include_directories(test_ipc_messages PRIVATE ${SHARED_INCLUDE_DIR})
target_compile_options(test_ipc_messages PRIVATE ${WS_COMPILE_FLAGS})
add_test(NAME ws_ipc_messages COMMAND test_ipc_messages)

# --- IPC queue test (P1.6) — bounded FIFO, loopback, queue-full, sequence gap ---
add_executable(test_ipc_queue
    test_ipc_queue.c
    ${SHARED_SOURCE_DIR}/ws_protocol.c
    ${SHARED_SOURCE_DIR}/ws_ipc_messages.c
    ${SHARED_SOURCE_DIR}/ws_ipc_queue.c
)
target_include_directories(test_ipc_queue PRIVATE ${SHARED_INCLUDE_DIR})
target_compile_options(test_ipc_queue PRIVATE ${WS_COMPILE_FLAGS})
add_test(NAME ws_ipc_queue COMMAND test_ipc_queue)

# --- IPC transport test (P1.6) — real shared queue, two-instance cross-core sim ---
add_executable(test_ipc_transport
    test_ipc_transport.c
    ${SHARED_SOURCE_DIR}/ws_protocol.c
    ${SHARED_SOURCE_DIR}/ws_ipc_messages.c
    ${SHARED_SOURCE_DIR}/ws_ipc_queue.c
    ${SHARED_SOURCE_DIR}/ws_ipc_transport.c
)
target_include_directories(test_ipc_transport PRIVATE ${SHARED_INCLUDE_DIR})
target_compile_options(test_ipc_transport PRIVATE ${WS_COMPILE_FLAGS})
add_test(NAME ws_ipc_transport COMMAND test_ipc_transport)

# --- Shared types static-assert test (P1.3) — compile-only ---
add_library(test_shared_types OBJECT test_shared_types.c)
target_include_directories(test_shared_types PRIVATE ${SHARED_INCLUDE_DIR})
target_compile_options(test_shared_types PRIVATE ${WS_COMPILE_FLAGS})

# --- Feature matrix static-assert tests (P1.2) — compile-only ---
# Default flags (all features = 1)
add_library(test_feature_matrix_default OBJECT test_feature_matrix.c)
target_include_directories(test_feature_matrix_default PRIVATE ${SHARED_INCLUDE_DIR})
target_compile_options(test_feature_matrix_default PRIVATE ${WS_COMPILE_FLAGS})

# Minimal flags (all optional features = 0)
add_library(test_feature_matrix_minimal OBJECT test_feature_matrix.c)
target_include_directories(test_feature_matrix_minimal PRIVATE ${SHARED_INCLUDE_DIR})
target_compile_definitions(test_feature_matrix_minimal PRIVATE
    WS_TEST_EXPECT_MINIMAL
    WS_FEATURE_WIFI=0 WS_FEATURE_BLE=0 WS_FEATURE_CAMERA=0
    WS_FEATURE_ENVIRONMENT=0 WS_FEATURE_MICROPHONE=0 WS_FEATURE_SPEAKER=0
    WS_FEATURE_TOUCH=0 WS_FEATURE_MOTION_AI=0
)
target_compile_options(test_feature_matrix_minimal PRIVATE ${WS_COMPILE_FLAGS})

# Host sim flag
add_library(test_feature_matrix_host OBJECT test_feature_matrix.c)
target_include_directories(test_feature_matrix_host PRIVATE ${SHARED_INCLUDE_DIR})
target_compile_definitions(test_feature_matrix_host PRIVATE
    WS_TEST_EXPECT_HOST WS_FEATURE_HOST_SIM=1
)
target_compile_options(test_feature_matrix_host PRIVATE ${WS_COMPILE_FLAGS})

enable_testing()
