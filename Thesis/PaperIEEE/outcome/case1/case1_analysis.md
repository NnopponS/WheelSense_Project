# Case 1: Analysis

## Summary

Case 1 is **binary classification** at episode level: each episode is labeled **Facing in (0)** or **Facing out (1)** from BLE RSSI. The experiment is conducted in one room divided into 4 zones (4×4 m each, cloth partitions).

**Physical interpretation.** The participant is in Zone 4 at fixed distance and direction; only **orientation** (facing toward vs away from the anchor) changes. When the body is between the wearable and the anchor, the path is obstructed and RSSI is typically lower; when facing away, the path is less obstructed. So the task is to detect **body blockage / orientation** from RSSI. Case 1 demonstrates that **body orientation is detectable** from BLE RSSI via this attenuation effect.

Features are **4D** per time step (`rssi_a1`–`rssi_a4`). Training expands episodes into per-sample rows; both KNN and XGBoost predict each time step, then the episode prediction is **round(mean(predictions))** so one label per episode is produced.

## Metrics (test set)

The app shows metrics for **all four models** (KNN, XGBoost, Claude Opus 4.6, Gemini 3.1 pro): **accuracy** (fraction of test episodes predicted correctly) and a **confusion table** with TP, TN, FP, FN. Here **positive = 1** (Facing out) and **negative = 0** (Facing in). So: TP = predicted Facing out when true Facing out; TN = predicted Facing in when true Facing in; FP = predicted Facing out when true Facing in; FN = predicted Facing in when true Facing out.

## Models

### KNN and XGBoost

- **KNN** is instance-based and uses the 5 nearest training points in 4D RSSI space (Euclidean). It has no hyperparameters beyond k and metric, is easy to interpret (neighbors in RSSI space), and can capture local structure well when class boundaries are smooth. It may be more sensitive to noise and to the local density of training points. For this task the two classes tend to form distinct regions in 4D RSSI, so a per-timestep classifier with episode aggregation is sufficient; there is no explicit temporal model (acceptable here because the label is constant over the episode).

- **XGBoost** fits gradient-boosted trees and can model non-linear decision boundaries in 4D RSSI. With the same 4D inputs and episode-level aggregation, it often achieves comparable or better accuracy when the boundary between facing in/out is complex. It is less interpretable than KNN but can be more robust to noisy RSSI. As with KNN, no temporal model is needed for this single-label-per-episode task.

Accuracy and confusion counts are computed from the outcome table (label vs each model’s predictions) and are shown above for the current test set.

### LLMs (Claude Opus 4.6, Gemini 3.1 pro)

The LLMs receive the same input (`time_based_rssi` from the test CSV, no labels) and output 0 or 1 per episode, with **no training** on this data. The prompt used is in `LLMs/case1/case1_prompt.txt`. Their results are interpreted in the same way as KNN and XGBoost: accuracy and TP/TN/FP/FN are shown in the app.

LLMs may do well when the RSSI series exhibits patterns (e.g. level or trend changes) that correlate with facing in/out and can be recognized from the text representation; they may lag when the task requires the training distribution, calibration, or when prompt or format sensitivity affects output. For Case 1 the useful signal is often **level or trend** over the episode (body in path vs not), which can be read from the text.

## Conclusion

Case 1 shows that **body orientation is detectable** from BLE RSSI; the comparison illustrates how well classical ML (KNN, XGBoost) and zero-shot LLMs capture this effect. See model explanations below for per-model strengths and limitations.
