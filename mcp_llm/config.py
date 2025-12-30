"""
Configuration constants for the MCP Smart Environment system.
"""

# Model configuration
# Note: deepseek-r1:latest uses Q4_K_M quantization (4-bit, ~5.2 GB)
# An explicitly named Q4 variant is available as: deepseek-r1:q4
MODEL_NAME = "qwen2.5:7b"  # Can be changed to "deepseek-r1:q4" for explicit Q4 naming
OLLAMA_HOST = "http://127.0.0.1:11434"

# Room and device definitions
ROOMS = {
    "Bedroom": ["Light", "Alarm", "AC"],
    "Bathroom": ["Light"],
    "Kitchen": ["Light", "Alarm"],
    "Living Room": ["Light", "TV", "AC", "Fan"]
}

# Default user location
DEFAULT_USER_LOCATION = "Bedroom"

# Feature flags for optimizations
USE_COMPACT_PROMPT = False  # Set to True to use compact prompt (30-40% smaller)