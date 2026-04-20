## Info

This app shows evaluation results (accuracy, confusion tables, and sequence metrics) for three tasks using Bluetooth Low Energy (BLE) received signal strength indicator (RSSI) in one room with four zones. Data were collected as 48 episodes per case. An *episode* is one continuous recording under fixed conditions. Each case was split into 13 (train) and 35 (test) episodes; the training set was chosen by a single random draw of 13 episodes without replacement, and the same split is used for all models.

## Running the viewer

From the project root (the parent folder of `outcome`), install dependencies and start the app:

1. `pip install -r outcome/requirements.txt` (Python 3.8+ recommended)
2. `streamlit run outcome/app.py`

If this folder is used alone (e.g. unzipped as `outcome/`), run from the `outcome` directory: `pip install -r requirements.txt` (Python 3.8+ recommended) and `streamlit run app.py`.

## Cases at a glance

**Table I.** Overview of the three experimental cases.

| Case   | Task                    | Episode duration | Train set size / Test set size |
|--------|-------------------------|------------------|---------------------------------|
| Case 1 | Facing in / out (binary)| ≈5 s             | 13 / 35                         |
| Case 2 | In zone / Out zone (binary) | ≈10 s        | 13 / 35                         |
| Case 3 | Zone sequence (1–4)    | ≈25–90 s         | 13 / 35                         |

## Environment setup

- **Room and zones:** One room divided into 4 zones (4×4 m each), separated by cloth partitions.
- **Anchors:** Each zone has one BLE anchor (ESP32-S3) placed at the center of the zone. Four anchors and one wearable (M5StickC) collect RSSI.
- **Height:** All anchors and the wearable are at 0.7 m above the floor; all components are aligned in the same horizontal plane.
- **Sampling:** RSSI is recorded at 5 Hz (200 ms sampling interval).

## Experimental setup and data collection

### Case 1

- **Duration & sampling:** 5 s at 5 Hz → 25 time steps per episode.
- **Location:** Zone 4.
- **Conditions:** 4 directions (N, E, S, W) × 2 distance ranges (0.5–1 m, >1 m) × 2 classes (0 = Facing in, 1 = Facing out) → 16 conditions.
- **Replicates / variation:** 3 episodes per condition (48 total). The three are collected under the same condition but the participant’s position varies within the distance range—e.g. for 0.5–1 m they stand somewhere in that range, not at the exact same spot.

### Case 2

- **Duration & sampling:** 10 s at 5 Hz → 50 time steps per episode.
- **Location:** Zone 4’s demarcation lines (zone 4–zone 3 and zone 4–zone 1).
- **Conditions:** 2 demarcation lines (zone 4–zone 3, zone 4–zone 1) × 2 classes (0 = In zone 4, 1 = Out zone 4) → 4 conditions.
- **Replicates / variation:** 12 episodes per condition (48 total). The participant moves in steps of approximately 0.25 m along the demarcation line, covering about 3 m of the 4 m line over the 12 episodes per condition, so positions are not the same spot.

### Case 3

- **Duration & sampling:** RSSI at 5 Hz (200 ms); episode duration varies by path, approximately 25–90 s. The participant pauses 0.5–1 s at the middle of each zone.
- **Location:** Trajectory across all four zones (one room).
- **Conditions:** Zone sequence (order of zones 1–4). For each episode, a sequence is drawn uniformly at random from the set of permutations of zones 1–4, so the same sequence may appear in more than one episode.
- **Replicates / variation:** Each episode is one walk of the drawn sequence (48 total). Even when the sequence repeats, the recorded RSSI differs across episodes because the participant’s trajectory and timing vary from walk to walk, and because of measurement noise and environmental variation. Each label is an ordered sequence of four zone IDs (1–4). The intended path is drawn from permutations; recorded labels may contain repeated zones (e.g. 1 4 1 4) when the participant revisits a zone.

## Labels and metrics

- **Case 1:** Class 0 = Facing in, 1 = Facing out. The app shows accuracy and a confusion table: true positive (TP), true negative (TN), false positive (FP), and false negative (FN) for K-nearest neighbors (KNN), XGBoost, Claude Opus 4.6, and Gemini 3.1 Pro.
- **Case 2:** Class 0 = In zone 4, 1 = Out zone 4. Same metrics as in Case 1 (accuracy and confusion matrix: TP, TN, FP, FN).
- **Case 3:** Label = ordered sequence of four zone IDs 1–4 (e.g. `"4 3 2 1"`); zones may repeat (e.g. `"1 4 1 4"`). The app shows exact sequence accuracy and per-position accuracy for all four models.
