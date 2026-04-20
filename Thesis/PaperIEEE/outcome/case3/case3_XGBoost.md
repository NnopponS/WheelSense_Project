# Case 3: XGBoost

The experiment is in one room divided into 4 zones (4×4 m each, cloth partitions). Case 3 predicts an **ordered sequence of four zone IDs (1–4)** per episode from BLE RSSI. Data comes from EXP_003_Case3_Trajectory. Labels are space-separated sequences (e.g. `"4 3 2 1"`) derived from trajectory filenames (e.g. R4-R3-R2-R1). The model operates on 8D segment summaries; each episode is split into four segments and we predict one zone per segment, then concatenate into a single sequence.

## Task

Predict the **ordered sequence of 4 zones** (1–4) for each episode. The classifier predicts **one zone (1–4) per segment**; the four segment predictions in order form the episode output. There is no temporal model across segments—each segment is classified independently.

## Features

- **Dimensionality:** 8D per segment.
- **Definition:** For each of the four anchors, we compute **mean** and **standard deviation** of RSSI over the segment: `[mean_a1, std_a1, mean_a2, std_a2, mean_a3, std_a3, mean_a4, std_a4]`.
- **Segmentation:** Each episode’s `time_based_rssi` is split into **4 contiguous segments** by time-step count (equal-sized chunks). If an episode has fewer than 4 rows, we use 4 copies of the episode-level 8D vector with segment stds set to 0 (details in the paper).

## Training

- **Training data:** 13 episodes (from `case3_train.csv`). For each episode we parse the label into 4 zone IDs (1–4), split the time series into 4 segments, and compute 4× 8D vectors. Each (8D, room_id) pair is one training sample. Zones 1–4 are mapped to classes 0–3 for sklearn. So we get many (X_8D, y_room) pairs (4 per episode).
- **Model:** `XGBClassifier` with parameters: `n_estimators=100`, `max_depth=6`, `learning_rate=0.1`, `random_state=42`, `eval_metric='logloss'` (shared with Case 1 and 2; see Method section). This is multi-class classification with 4 classes (0–3).
- **Fit:** Fit on (X_8D, y_room) where y_room ∈ {0,1,2,3} (details in the paper).

## Inference

- For each test episode, compute 4 segment 8D vectors (same segmentation as in training).
- For each of the 4 vectors, call `predict()` → class in {0,1,2,3}. Add 1 to get zone in {1,2,3,4}. Join the four zone IDs as a single space-separated string (e.g. `"2 4 1 3"`).
- If an episode has no valid segments after parsing, the outcome is an empty string.

## Output

The outcome CSV (`case3_outcome.csv`) includes:
- **XGBoost:** Space-separated sequence of 4 zone IDs (e.g. `"4 3 2 1"`). There is no "mean" or "rounded" column; the task is sequence prediction, not binary.

## Notes

- Both KNN and XGBoost treat the four segment positions independently: we fit a single classifier on all (8D, zone) pairs and apply it four times per episode. There is no sequence model (e.g. HMM or RNN) across segments. XGBoost hyperparameters are shared with Case 1 and Case 2 (see Method section).

## Limitations

XGBoost does **not model the time series**. It makes four independent 4-class predictions per episode; there is no RNN, HMM, or transition structure. So it is a **segment-level classifier**. Segment ambiguity and independent decisions limit exact-sequence accuracy; the case illustrates that **sequence prediction benefits from modeling the time series**, not just segment summaries.
