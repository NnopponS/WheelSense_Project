# Case 3: LLMs (Claude Opus 4.6, Gemini 3.1 pro)

The experiment is in one room divided into 4 zones (4×4 m each, cloth partitions). Case 3 predicts an **ordered sequence of four zone IDs (1–4)** per episode. The LLMs receive the same test input as KNN and XGBoost but use no training on this data; they predict from the task description and the raw RSSI time series only.

## Task

Sequence prediction at **episode level**: output a space-separated sequence of 4 digits (e.g. `"4 3 2 1"`) indicating the zone order. No training; zero-shot from the prompt.

## Input

- Same test CSV as the ML pipeline: columns `id` and `time_based_rssi`. Each row is one episode; `time_based_rssi` is a semicolon-separated list of steps (timestamp,r1,r2,r3,r4). Labels are not provided to the LLM.

## Prompt

The following prompt (and the test CSV) were sent to each LLM. The same text is saved in `LLMs/case3/case3_prompt.txt` (in this supplementary folder).

```
You are predicting labels for a BLE RSSI test dataset (Case 3).

Task: Each row is one episode (a trajectory through 4 zones in one room). Predict the exact sequence of 4 zone IDs (1–4) in order, e.g. "4 3 2 1" means zone 4 then 3 then 2 then 1. Setup: one room divided into 4 zones (4×4 m each, cloth partitions). Use only the RSSI time series. Labels are not provided to you.

Attached CSV format:
- id: Row identifier (1, 2, 3, ...). Keep the same order in your output.
- time_based_rssi: One string per episode. Semicolon (;) separates time steps. Each step is timestamp,r1,r2,r3,r4 (RSSI in dBm for 4 BLE anchors). Blanks indicate missing values.

Output: Provide a table with exactly two columns:
- id: Same as in the attached file (one row per episode).
- predicted: Your prediction per episode. Use a space-separated sequence of 4 digits, e.g. "4 3 2 1" or "2 3 4 3".

I will merge your (id, predicted) output with the held-out labels to get the full table (time_based_rssi, label, predicted) for evaluation.
```

## Output

- Each model returns a table with `id` and `predicted` (a space-separated 4-digit sequence). Predictions are merged into the outcome CSV as columns **Claude_Opus4.6** and **Gemini_3.1_pro**, aligned by row order with the outcome file.

## Why LLMs can work well

- Unlike KNN and XGBoost, they receive the **full RSSI time series** for the episode and can reason over **temporal order and trajectory** (which zone first, second, etc.), so they have the potential to use sequential structure that the segment-only models do not.
- They can recognize patterns in the text representation of the RSSI series (e.g. segment-level signatures) that correlate with zone identity and order.
- They reason over the full episode at once, so they may infer the trajectory without an explicit segment model.
- No hand-designed 8D segment features or learned embedding are required; the same raw format is given to all four models for a fair comparison.

## Why they may fail

- They have no access to the training distribution or calibration; predictions are not probability-calibrated.
- Getting the full sequence exactly right is harder than getting some positions right; exact-match accuracy may be lower than per-position accuracy.
- Performance can depend on prompt wording and CSV format; output may vary across runs (e.g. non-determinism), unlike the fixed KNN and XGBoost pipelines.

## Models

**Claude Opus 4.6** and **Gemini 3.1 pro** are both evaluated with the same prompt and merge process. The app shows their **exact sequence accuracy** and **per-position accuracy** alongside KNN and XGBoost.
