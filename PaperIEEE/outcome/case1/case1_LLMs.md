# Case 1: LLMs (Claude Opus 4.6, Gemini 3.1 pro)

Case 1 classifies each episode as **Facing in (0)** or **Facing out (1)** using BLE RSSI from four anchors. The experiment uses one room divided into 4 zones (4×4 m each, cloth partitions). The LLMs receive the same test input as KNN and XGBoost but use no training on this data; they predict from the task description and the raw RSSI time series only.

## Task

Binary classification at **episode level**: predict 0 (Facing in) or 1 (Facing out) per episode. No training; zero-shot from the prompt.

## Input

- Same test CSV as the ML pipeline: columns `id` and `time_based_rssi`. Each row is one episode; `time_based_rssi` is a semicolon-separated list of steps (timestamp,r1,r2,r3,r4). Labels are not provided to the LLM.

## Prompt

The following prompt (and the test CSV) were sent to each LLM. The same text is saved in `LLMs/case1/case1_prompt.txt` (in this supplementary folder).

```
You are predicting labels for a BLE RSSI test dataset (Case 1).

Task: Each row is one episode. Predict whether the person was Facing in (0) or Facing out (1) using only the RSSI time series. Labels are not provided to you.

Attached CSV format:
- id: Row identifier (1, 2, 3, ...). Keep the same order in your output.
- time_based_rssi: One string per episode. Semicolon (;) separates time steps. Each step is timestamp,r1,r2,r3,r4 (RSSI in dBm for 4 BLE anchors). Blanks indicate missing values.

Output: Provide a table with exactly two columns:
- id: Same as in the attached file (one row per episode).
- predicted: Your prediction per episode. Use 0 for Facing in, 1 for Facing out.

I will merge your (id, predicted) output with the held-out labels to get the full table (time_based_rssi, label, predicted) for evaluation.
```

## Output

- Each model returns a table with `id` and `predicted` (0 or 1). Predictions are merged into the outcome CSV as columns **Claude_Opus4.6** and **Gemini_3.1_pro**, aligned by row order with the outcome file.

## Why LLMs can work well

- For Case 1 the discriminative signal is often **level or trend** over the episode (body in path vs not), which can be read from the text representation of the RSSI series.
- They can recognize patterns in the text representation of the RSSI series (e.g. trends, level shifts) that correlate with facing in vs out.
- They reason over the full episode at once, so they may capture temporal structure without an explicit aggregation step.
- No hand-designed features or learned embedding are required; the same raw format is given to all four models for a fair comparison.

## Why they may fail

- They have no access to the training distribution or calibration; predictions are not probability-calibrated.
- Performance can depend on prompt wording and CSV format; small changes may affect results.
- Output may vary across runs (e.g. non-determinism), unlike the fixed KNN and XGBoost pipelines.

## Models

**Claude Opus 4.6** and **Gemini 3.1 pro** are both evaluated with the same prompt and merge process. The app shows their accuracy and confusion counts (TP, TN, FP, FN) alongside KNN and XGBoost.
