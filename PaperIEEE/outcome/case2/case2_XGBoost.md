# Case 2: XGBoost

Case 2 classifies each episode as **In zone 4 (0)** or **Out zone 4 (1)** using BLE RSSI from four anchors. The experiment uses one room divided into 4 zones (4×4 m each, cloth partitions). Data comes from EXP_004_Case2_Boundary_Transition; labels are derived from filenames ("Out_Room" → 1). The model operates on per-time-step 4D RSSI; we then aggregate predictions to a single episode label.

## Task

Binary classification at **episode level**. The classifier is trained and applied at **per-sample** (per time step) level; the final episode prediction is obtained by aggregating per-sample predictions (see Inference).

## Features

- **Dimensionality:** 4D per time step.
- **Names:** `rssi_a1`, `rssi_a2`, `rssi_a3`, `rssi_a4` (see Method section).
- **Source:** The `time_based_rssi` column is parsed from semicolon-separated steps; each step is `timestamp,r1,r2,r3,r4`. Rows with any missing RSSI are dropped. Each valid step yields one 4D feature vector.

## Training

- **Training data:** 13 episodes (from `case2_train.csv`) are expanded into per-sample rows: every valid time step of an episode becomes one row with that 4D vector and the **episode’s** label (0 or 1). Thus we get many (X_4D, y_binary) pairs.
- **Model:** `XGBClassifier` with parameters: `n_estimators=100`, `max_depth=6`, `learning_rate=0.1`, `random_state=42`, `eval_metric='logloss'` (see Method section).
- **Fit:** The model is fit on the same (X_4D, y_binary) as KNN (details in the paper).

## Inference

- For each test episode, `time_based_rssi` is parsed into a matrix of 4D rows (with NaNs dropped).
- `predict()` is called on each row. The episode prediction is **round(mean(predictions))**, i.e. a soft vote over time steps is rounded to 0 or 1.
- If an episode has no valid rows after parsing, the outcome is NaN for that episode.

## Output

The outcome CSV (`case2_outcome.csv`) includes:
- **XGBoost_mean:** Mean of per-sample XGBoost predictions for that episode.
- **XGBoost_rounded:** Episode-level label: `round(XGBoost_mean)` (0 or 1).

## Notes

- XGBoost fits gradient-boosted decision trees and can capture non-linear decision boundaries in 4D RSSI space. Hyperparameters are shared across all cases (see Method section). Feature importance is not computed in the current pipeline but could be added for interpretation.
- The two classes are less separable in 4D than in Case 1, so moderate accuracy is expected.
