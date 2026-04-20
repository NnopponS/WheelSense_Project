# Case 1: K-Nearest Neighbors (KNN)

Case 1 classifies each episode as **Facing in (0)** or **Facing out (1)** using BLE RSSI from four anchors. The experiment uses one room divided into 4 zones (4×4 m each, cloth partitions). Data comes from EXP_001_Case1_Room4; labels are derived from filenames ("Facing-Out" → 1). The model operates on per-time-step 4D RSSI; we then aggregate predictions to a single episode label.

## Task

Binary classification at **episode level**. The classifier is trained and applied at **per-sample** (per time step) level; the final episode prediction is obtained by aggregating per-sample predictions (see Inference).

## Features

- **Dimensionality:** 4D per time step.
- **Names:** `rssi_a1`, `rssi_a2`, `rssi_a3`, `rssi_a4` (see Method section).
- **Source:** The `time_based_rssi` column is parsed from semicolon-separated steps; each step is `timestamp,r1,r2,r3,r4`. Rows with any missing RSSI are dropped. Each valid step yields one 4D feature vector.

## Training

- **Training data:** 13 episodes (from `case1_train.csv`) are expanded into per-sample rows: every valid time step of an episode becomes one row with that 4D vector and the **episode’s** label (0 or 1). Thus we get many (X_4D, y_binary) pairs.
- **Model:** `KNeighborsClassifier(n_neighbors=5, metric='euclidean')`. The value k=5 and metric='euclidean' are the same for all cases that use KNN.
- **Fit:** The model is fit on (X_4D, y_binary). No feature scaling is applied; distance is Euclidean in raw RSSI space.
- **Implementation:** Episodes are expanded into per-sample rows via `episode_to_samples()`; the model is fit and evaluated per case (details in the paper).

## Inference

- For each test episode, `time_based_rssi` is parsed into a matrix of 4D rows (with NaNs dropped).
- `predict()` is called on each row. The episode prediction is **round(mean(predictions))** (e.g. `round(pk.mean())` in code), i.e. a soft vote over time steps is rounded to 0 or 1.
- If an episode has no valid rows after parsing, the outcome is NaN for that episode.

## Output

The outcome CSV (`case1_outcome.csv`) includes:
- **KNN_mean:** Mean of per-sample KNN predictions for that episode.
- **KNN_rounded:** Episode-level label: `round(KNN_mean)` (0 or 1).

## Notes

- KNN is instance-based: no explicit parametric model; predictions are driven by the k nearest training points in RSSI space. This makes the decision boundary interpretable as “neighbors in 4D RSSI.”
- For Case 1, orientation tends to produce relatively stable 4D RSSI regions per class, so KNN's local decision boundary fits the task. No temporal model is needed because the episode label is constant.
- k=5 and metric='euclidean' are used for all cases that use KNN.
