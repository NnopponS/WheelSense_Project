# Case 2: LLMs (Claude Opus 4.6, Gemini 3.1 pro)

Case 2 classifies each episode as **In zone 4 (0)** or **Out zone 4 (1)** from BLE RSSI. The experiment uses one room divided into 4 zones (4×4 m each, cloth partitions). The LLMs receive the same test input as KNN and XGBoost but use no training on this data; they predict from the task description and the raw RSSI time series only.

## Task

Binary classification at **episode level**: predict 0 (In zone 4) or 1 (Out zone 4) per episode. No training; zero-shot from the prompt.

## Input

- Same test CSV as the ML pipeline: columns `id` and `time_based_rssi`. Each row is one episode; `time_based_rssi` is a semicolon-separated list of steps (timestamp,r1,r2,r3,r4). Labels are not provided to the LLM.

## Prompt

The following prompt (and the test CSV) were sent to each LLM. The same text is saved in `LLMs/case2/case2_prompt.txt` (in this supplementary folder).

```
You are predicting labels for a BLE RSSI test dataset (Case 2).

Task: Each row is one episode. Predict whether the person was In zone 4 (0) or Out zone 4 (1), i.e. boundary transition, using only the RSSI time series. Labels are not provided to you.

Attached CSV format:
- id: Row identifier (1, 2, 3, ...). Keep the same order in your output.
- time_based_rssi: One string per episode. Semicolon (;) separates time steps. Each step is timestamp,r1,r2,r3,r4 (RSSI in dBm for 4 BLE anchors). Blanks indicate missing values.

Output: Provide a table with exactly two columns:
- id: Same as in the attached file (one row per episode).
- predicted: Your prediction per episode. Use 0 for In zone 4, 1 for Out zone 4.

I will merge your (id, predicted) output with the held-out labels to get the full table (time_based_rssi, label, predicted) for evaluation.
```

## Output

- Each model returns a table with `id` and `predicted` (0 or 1). Predictions are merged into the outcome CSV as columns **Claude_Opus4.6** and **Gemini_3.1_pro**, aligned by row order with the outcome file.

## Why LLMs can work well

- They can recognize patterns in the text representation of the RSSI series (e.g. boundary transitions, level changes) that correlate with in zone 4 vs out zone 4.
- They reason over the full episode at once, so they may capture temporal structure without an explicit aggregation step.
- No hand-designed features or learned embedding are required; the same raw format is given to all four models for a fair comparison.

## Why they may fail

- The boundary is ambiguous in the text (cloth does not cause a sharp RSSI change), so inferring "in" vs "out" from the series alone can be difficult.
- They have no access to the training distribution or calibration; predictions are not probability-calibrated.
- Performance can depend on prompt wording and CSV format; small changes may affect results.
- Output may vary across runs (e.g. non-determinism), unlike the fixed KNN and XGBoost pipelines.

## Models

**Claude Opus 4.6** and **Gemini 3.1 pro** are both evaluated with the same prompt and merge process. The app shows their accuracy and confusion counts (TP, TN, FP, FN) alongside KNN and XGBoost.
