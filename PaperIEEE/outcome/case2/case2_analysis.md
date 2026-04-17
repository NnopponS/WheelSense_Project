# Case 2: Analysis

## Summary

Case 2 is **binary classification** at episode level: each episode is labeled **In zone 4 (0)** or **Out zone 4 (1)** from BLE RSSI. The experiment is conducted in one room divided into 4 zones (4×4 m each, separated by cloth partitions).

**Physical interpretation.** Zones are separated only by **cloth**; at 2.4 GHz cloth has limited attenuation, so there is no strong RF boundary. The participant stands **on the demarcation line** (between zone 4 and zone 3 or zone 1); the wearable is at the boundary and can be almost as close to an anchor in the adjacent zone as to zone 4’s. So “in zone 4” vs “out zone 4” is not “which side of a strong barrier”—the main discriminant is **body position/orientation** relative to the anchors (which link is blocked). The task is **inherently difficult**: discrimination relies on body-induced attenuation rather than partition-induced attenuation.

Features are **4D** per time step (`rssi_a1`–`rssi_a4`). Training expands episodes into per-sample rows; both KNN and XGBoost predict each time step, then the episode prediction is **round(mean(predictions))** so one label per episode is produced.

## Metrics (test set)

The app shows metrics for **all four models** (KNN, XGBoost, Claude Opus 4.6, Gemini 3.1 pro): **accuracy** (fraction of test episodes predicted correctly) and a **confusion table** with TP, TN, FP, FN. Here **positive = 1** (Out zone 4) and **negative = 0** (In zone 4). TP = predicted Out zone 4 when true Out zone 4; TN = predicted In zone 4 when true In zone 4; FP = predicted Out zone 4 when true In zone 4; FN = predicted In zone 4 when true Out zone 4.

## Models

### KNN and XGBoost

- **KNN** is instance-based and uses the 5 nearest training points in 4D RSSI space (Euclidean). It has no hyperparameters beyond k and metric, is easy to interpret (neighbors in RSSI space), and can capture local structure well when in zone 4/out zone 4 boundaries are smooth. It may be more sensitive to noise and to the local density of training points.

- **XGBoost** fits gradient-boosted trees and can model non-linear decision boundaries in 4D RSSI. With the same 4D inputs and episode-level aggregation, it often achieves comparable or better accuracy when the boundary between in zone 4 and out zone 4 is complex. It is less interpretable than KNN but can be more robust to noisy RSSI.

The 4D RSSI regions for the two classes **overlap more** than in Case 1 because the physical boundary is soft, so we expect more confusion and moderate accuracy. LLMs may pick up boundary transitions, but those transitions can be subtle in the text.

Accuracy and confusion counts are computed from the outcome table (label vs each model’s predictions) and are shown above for the current test set.

### LLMs (Claude Opus 4.6, Gemini 3.1 pro)

The LLMs receive the same input (`time_based_rssi` from the test CSV, no labels) and output 0 or 1 per episode, with **no training** on this data. The prompt used is in `LLMs/case2/case2_prompt.txt`. Their results are interpreted in the same way as KNN and XGBoost: accuracy and TP/TN/FP/FN are shown in the app.

LLMs may do well when the RSSI series exhibits patterns (e.g. boundary transitions) that correlate with in zone 4/out zone 4 and can be recognized from the text representation; they may lag when the task requires the training distribution, calibration, or when prompt or format sensitivity affects output.

## Conclusion

Case 2 illustrates the **limit of zone discrimination with soft boundaries**; performance reflects how well models can use body-induced RSSI differences when the partition does not create a clear RF boundary. See model explanations below for per-model strengths and limitations.
