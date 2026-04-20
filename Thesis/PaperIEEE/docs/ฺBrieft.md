# Comparative Performance Evaluation of BLE-Based Indoor Localization Using Machine Learning and Large Language Models

## 1. Introduction and Research Overview
This study presents a pilot engineering investigation into the feasibility and comparative performance of BLE RSSI-based indoor localization systems. It contrasts traditional machine learning algorithms (KNN and XGBoost) with a novel Large Language Model (LLM)-based approach. The primary objective is to evaluate whether LLM-based time-series classification can achieve competitive or superior performance in room-level indoor localization under realistic signal variability conditions, especially considering contextual continuity.

This study specifically focuses on real-world challenges, such as signal attenuation due to body shadowing and boundary ambiguity, while analyzing the trade-offs between accuracy, computational latency, and API costs.

## 2. System Architecture and Study Design

### 2.1 Hardware and Environment Setup
The experiment is conducted in a 4-room residential environment (Bedroom, Bathroom, Livingroom, Kitchen) using a single-subject design to evaluate system-level feasibility. 
- **Anchors:** 4 fixed ESP32-S3 BLE anchor nodes (one per room) communicating via MQTT over Wi-Fi.
- **Tag:** 1 Nordic nRF52840 BLE beacon attached to the participant's waist.
- **Sampling Rate:** 5 Hz.
- **Server:** Central Python-based logging server with digital video camera validation for ground truth.

### 2.2 Sample Size Justification
Based on diagnostic sensitivity estimation ($Z=1.96$, $Se=0.90$, $W=0.10$), the minimum required sample size is approximately 35 episodes per behavior, totaling at least 105 episodes across the three experimental cases to ensure statistical reliability.

### 2.3 Signal Preprocessing & Calibration
A simplified room-level coarse fingerprinting (60 seconds per room, 3 rounds) is conducted to establish baseline RSSI distributions. To mitigate high RSSI instability from multipath fading, a discrete 1D Kalman filter is applied to the raw signal prior to model inference.

## 3. Methodology and Models

Three classification systems are evaluated on identical preprocessed feature vectors:
1. **K-Nearest Neighbors (KNN):** A baseline distance-based classifier representing classic fingerprinting.
2. **XGBoost:** A gradient boosting decision tree model known for strong performance on tabular RSSI data and low-latency edge deployment.
3. **Gemini 3.1 Pro (LLM-based Classifier):** The core novelty of this study. The LLM is provided with time-windowed RSSI sequences via carefully engineered prompts. The evaluation focuses on zero-shot/few-shot capabilities, constrained JSON outputs, and the LLM's inherent ability to understand sequence context (e.g., recognizing that sudden signal drops do not imply instantaneous teleportation between rooms).

## 4. Experimental Evaluation Scenarios

To explicitly evaluate the models against real-world indoor localization challenges, the behavioral cases are designed as follows:

### Case 1: Static Stability under Body Shadowing
*   **Objective:** Evaluate room classification stability when the signal is heavily attenuated by the human body (waist-mounted beacon).
*   **Protocol:** The participant stands stationary in the center of a room and rotates to face four cardinal directions (North, South, East, West), spending 30 seconds in each orientation.
*   **Measurement Target:** Robustness against sudden RSSI drops. Traditional ML might react to the drop by misclassifying the room, whereas the LLM is hypothesized to infer the contextual persistence of the user's location.

### Case 2: Boundary "Ping-Pong" Effect
*   **Objective:** Investigate the models' susceptibility to spurious transitions (false classifications) at ambiguous room boundaries (e.g., open doorways).
*   **Protocol:** The participant walks from Room A to the doorway of Room B, steps briefly into Room B for 3-5 seconds, and retreats back into Room A.
*   **Measurement Target:** Spurious transition rates. This case highlights the weakness of point-by-point classifiers (like KNN) that often output flickering predictions (A -> B -> A -> B) at boundaries, compared to the potentially smoothed, logical inference of the time-windowed LLM.

### Case 3: Multi-Room Dynamic Trajectory
*   **Objective:** Evaluate trajectory-level accuracy, transition timing, and sequence consistency during continuous movement.
*   **Protocol:** The participant walks continuously across 3 to 4 rooms (e.g., Bedroom -> Livingroom -> Kitchen -> Livingroom), pausing for 20-30 seconds in each.
*   **Measurement Target:** Transition detection F1-score, mean absolute transition time error, and sequence edit distance. This case validates the overall performance of the models in a standard dynamic usage scenario.

## 5. Robustness and Performance Evaluation Metrics

To thoroughly benchmark model resilience, offline robustness tests are conducted by applying simulated signal degradations to the test dataset:
*   **Signal Degradation:** Random RSSI masking (e.g., 20% drop rate) and Gaussian noise injection ($\sigma = 6$ dBm).
*   **Anchor Failure:** Simulating the loss of 1 or 2 anchor nodes.

**Key Evaluation Metrics:**
*   **Room-Level Accuracy:** Overall Accuracy, Macro-F1 Score, Precision, and Recall.
*   **Trajectory-Level Metrics:** Sequence Edit Distance, Dwell Time Mean Absolute Error.

## 6. Computational Performance and Cost Analysis
A critical dimension of this study is the engineering trade-off between the sophisticated reasoning capabilities of LLMs and the operational efficiency of traditional ML:

### 6.1 The Necessity of LLM for Contextual Reasoning
While traditional ML models (like XGBoost) excel at processing numerical features at high speeds, they natively lack "situational awareness." In complex indoor environments, RSSI fluctuations are often non-linear and context-dependent (e.g., a sudden 15 dBm drop might mean a person walked behind a dense object, not that they teleported 10 meters away). 

The use of an LLM is necessitated by its ability to process sequential time-windows of data as a *narrative* or *contextual sequence*. By treating consecutive RSSI readings as a logical progression, the LLM can apply inherent commonsense reasoning to smooth out anomalies, recognize impossible trajectories, and handle ambiguous boundary states (like the "Ping-Pong" effect) without requiring excessively complex, hand-crafted feature engineering or rigid state-machine logic.

### 6.2 The Cost-Efficiency Trade-off
Despite the advanced reasoning benefits of the LLM, traditional ML models unequivocally win in terms of deployment cost and resource efficiency:
*   **Inference Latency:** ML models can execute inferences on edge devices (like the ESP32 or a local gateway) in milliseconds, whereas querying a commercial LLM API introduces unavoidable network latency (often measurable in seconds) per time-window.
*   **Operational Cost:** Executing local ML models incurs zero marginal cost per prediction. In contrast, sending high-frequency time-series data to an LLM API incurs ongoing token-based financial costs.

Therefore, this analysis demonstrates that while ML is the definitive choice for low-cost, high-frequency, edge-deployable systems, the LLM approach represents a necessary paradigm shift for scenarios requiring high-level contextual reasoning and extreme robustness against complex environmental noise.

## 7. Conclusion
This formalized evaluation framework balances scientific rigor with the practical constraints of a 6-page IEEE paper format. By focusing the experimental design on edge cases (body shadowing and boundary ping-pong) alongside standard trajectory testing, this study aims to clearly delineate the unique contextual advantages of Large Language Models against the efficiency of traditional algorithms in BLE indoor localization.