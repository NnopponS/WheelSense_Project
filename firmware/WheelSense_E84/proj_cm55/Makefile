################################################################################
# \file Makefile
# \version 1.0
#
# \brief
# Makefile for configuring the Cortex-M55 core project
#
################################################################################
# \copyright
# (c) 2025-2026, Infineon Technologies AG, or an affiliate of Infineon
# Technologies AG.  SPDX-License-Identifier: Apache-2.0
# 
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
# 
#     http://www.apache.org/licenses/LICENSE-2.0
# 
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
################################################################################

include ../common.mk

################################################################################
# Basic Configuration
################################################################################

# Name of application (used to derive name of final linked file).
#
# If APPNAME is edited, ensure to update or regenerate launch
# configurations for your IDE.
APPNAME=proj_cm55

# If set to "true" or "1", display full command-lines when building.
VERBOSE=


################################################################################
# Advanced Configuration
################################################################################

# Enable optional code that is ordinarily disabled by default.
#
# Available components depend on the specific targeted hardware and firmware
# in use. In general, if you have
#
#    COMPONENTS=foo bar
#
# ... then code in directories named COMPONENT_foo and COMPONENT_bar will be
# added to the build
#
COMPONENTS+=FREERTOS RTOS_AWARE USBD_BASE
# ponytail: MBEDTLS kept in COMPONENTS unconditionally so WiFi/mbedTLS shared
# lib headers parse correctly even when WS_FEATURE_WIFI=0. --gc-sections strips
# unused WiFi/mbedTLS code from the final ELF. CY_IGNORE does not work for
# shared library paths on Windows/cygwin MTB builds.
COMPONENTS+=LWIP MBEDTLS

# MQTT needs only coreMQTT. Excluding unused AWS/HTTP/PKCS modules also keeps
# generated Windows object paths below ModusToolbox's 260-character limit.
CY_IGNORE+= $(SEARCH_aws-iot-device-sdk-embedded-C)/libraries/aws
CY_IGNORE+= $(SEARCH_aws-iot-device-sdk-embedded-C)/libraries/standard/coreHTTP
CY_IGNORE+= $(SEARCH_aws-iot-device-sdk-embedded-C)/libraries/standard/coreJSON
CY_IGNORE+= $(SEARCH_aws-iot-device-sdk-embedded-C)/libraries/standard/corePKCS11
CY_IGNORE+= $(SEARCH_aws-iot-device-sdk-port)/source/ota

# Like COMPONENTS, but disable optional code that was enabled by default.
DISABLE_COMPONENTS=

# Exclude source directories from auto-discovery when feature flags are off.
# source/net files are #ifdef IM_ENABLE_NET guarded, so they compile to empty
# objects when WS_FEATURE_WIFI=0. source/wifi_configs contains lwipopts.h
# which is needed by lwIP even when WiFi is off. So no CY_IGNORE is needed —
# --gc-sections strips unused code from the final ELF.

CORE=CM55
CORE_NAME=CM55_0

# By default the build system automatically looks in the Makefile's directory
# tree for source code and builds it. The SOURCES variable can be used to
# manually add source code to the build process from a location not searched
# by default, or otherwise not found by the build system.
SOURCES+=../shared/source/ws_protocol.c ../shared/source/ws_ipc_messages.c ../shared/source/ws_ble_payloads.c ../shared/source/ws_ipc_queue.c ../shared/source/ws_ipc_transport.c
SOURCES+=../shared/source/ws_node_contract.c ../shared/source/ws_ui_state.c
ifeq ($(WS_FEATURE_ENVIRONMENT),1)
SOURCES+=../shared/source/ws_environment.c
endif

# Like SOURCES, but for include directories. Value should be paths to
# directories (without a leading -I).
INCLUDES+=./source/wifi_configs ../shared/include

# Custom configuration of mbedtls library.
# ponytail: kept unconditional so WiFi/mbedTLS shared lib headers parse.
MBEDTLSFLAGS = MBEDTLS_USER_CONFIG_FILE='"configs/mbedtls_user_config.h"'

# Add additional defines to the build process (without a leading -D).
# CYBSP_WIFI_CAPABLE is a board capability (not a feature flag) — the board
# has WiFi hardware regardless of whether WS_FEATURE_WIFI enables it.
DEFINES+=$(MBEDTLSFLAGS) CYBSP_WIFI_CAPABLE PB_ENABLE_MALLOC CY_RETARGET_IO_CONVERT_LF_TO_CRLF $(WS_FEATURE_DEFINES)

# Default configuration of mbedtls library.
DEFINES+=MBEDTLS_CONFIG_FILE='"mbedtls/mbedtls_config.h"'
# PSA configuration of mbedtls library.
DEFINES+=MBEDTLS_PSA_CRYPTO_CONFIG_FILE='"configs/ifx_psa_crypto_config.h"'

# Select softfp or hardfp floating point. Default is softfp.
VFP_SELECT+=hardfp

# Additional / custom C compiler flags.
#
# NOTE: Includes and defines should use the INCLUDES and DEFINES variable
# above.
CFLAGS+=-include source/heap.h

# Additional / custom C++ compiler flags.
#
# NOTE: Includes and defines should use the INCLUDES and DEFINES variable
# above.
CXXFLAGS+=-include source/heap.h

# Additional / custom assembler flags.
#
# NOTE: Includes and defines should use the INCLUDES and DEFINES variable
# above.
ASFLAGS+=

# Additional / custom linker flags.
LDFLAGS+=-u _printf_float

# Additional / custom libraries to link in to the application.
LDLIBS+=

# Path to the linker script to use (if empty, use the default linker script).
LINKER_SCRIPT=

# Custom pre-build commands to run.
PREBUILD=

# Custom post-build commands to run.
POSTBUILD=

################################################################################
# Paths
################################################################################

# Relative path to the project directory (default is the Makefile's directory).
#
# This controls where automatic source code discovery looks for code.
CY_APP_PATH=

# Relative path to the shared repo location.
#
# All .mtb files have the format, <URI>#<COMMIT>#<LOCATION>. If the <LOCATION> 
# field begins with $$ASSET_REPO$$, then the repo is deposited in the path 
# specified by the CY_GETLIBS_SHARED_PATH variable. The default location is one 
# directory level above the current app directory. This is used with 
# CY_GETLIBS_SHARED_NAME variable, which specifies the directory name.
CY_GETLIBS_SHARED_PATH=../..

# Directory name of the shared repo location.
#
CY_GETLIBS_SHARED_NAME=mtb_shared

include $(CY_TOOLS_DIR)/make/start.mk
