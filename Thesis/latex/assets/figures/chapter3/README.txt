Generated architecture and flow assets for Chapter 3:

  ch3-fig01-architecture.{pdf,png}
    Full WheelSense topology across field devices, MQTT, FastAPI, DB, web, HA, and MCP.

  ch3-fig02-localization-pipeline.{pdf,png}
    Wheelchair telemetry and room-localization flow aligned to current repo truth.

  ch3-fig03-mqtt-topic-map.{pdf,png}
    Current MQTT topics from the server contract.

  ch3-fig04-latency-timeline.{pdf,png}
    End-to-end latency measurement path.

  ch3-fig05-db-logical-model.{pdf,png}
    Simplified logical data model for thesis presentation.

Additional generated flow assets not yet wired into chapter3.tex:

  ch3-fig06-mobile-polar-flow.{pdf,png}
  ch3-fig07-camera-ble-node-flow.{pdf,png}
  ch3-fig08-ai-propose-confirm-execute.{pdf,png}

Source:
  Thesis/latex/scripts/gen_ch3_arch_figures.py

Notes:
  - The Chapter 3 script now generates thesis-ready figures from current repo truth instead of generic placeholders.
  - Existing figure references in chapter3.tex continue to work because the legacy basenames remain present.
