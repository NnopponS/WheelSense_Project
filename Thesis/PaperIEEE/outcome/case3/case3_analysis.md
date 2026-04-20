# Case 3: Analysis

## Summary

Case 3 predicts an **ordered sequence of four zone IDs (1–4)** per episode. Labels may include repeated zones (e.g. 1 4 1 4). The experiment uses one room divided into 4 zones (4×4 m each, cloth partitions).

**Physical interpretation.** The participant **walks through all four zones** in some order; each zone has an anchor and boundaries are cloth. Segment-level RSSI reflects **proximity** to each zone’s anchor and **body movement/orientation** along the path. Because boundaries are soft, **zone signatures in RSSI can overlap**; the **order** of zones (trajectory) is a temporal structure.

Features are **8D** per segment (mean and std of RSSI per anchor); each episode is split into four contiguous segments and each segment is classified into one of four zones. There is no temporal model across segments—each segment is predicted independently. Both KNN and XGBoost output a space-separated sequence (e.g. `"4 3 2 1"`) per episode; there is no mean/rounded aggregation.

## Limitation of KNN and XGBoost

KNN and XGBoost **do not model the time series**. They use 8D **segment summaries** and predict each segment’s zone **independently**; there is no temporal or sequence model (no RNN, HMM, or transition structure). So they are **segment-level classifiers**, not sequence or trajectory models. When segment 8D features are ambiguous (overlapping zones, cloth, body), independent classification leads to errors that could be reduced by using temporal structure. **Lower exact-sequence accuracy is therefore expected** for these models; the case illustrates the **need for temporal or sequence modeling** for trajectory inference.

## Metrics (test set)

The app shows metrics for **all four models** (KNN, XGBoost, Claude Opus 4.6, Gemini 3.1 pro):

- **Exact sequence accuracy:** fraction of test episodes where the predicted sequence **exactly matches** the ground-truth label (e.g. `"4 3 2 1"` vs `"4 3 2 1"`). No partial credit; the full sequence must agree.
- **Per-position accuracy:** fraction of individual positions that are correct across all episodes (correct positions / (number of episodes × 4)). A model can have high per-position accuracy but lower exact accuracy if it gets most zones right but rarely the full sequence.

Both metrics are shown in the app table for each model.

## Models

### KNN and XGBoost

- **KNN** in 8D segment space uses the 5 nearest training (8D, zone) pairs. It is simple and interpretable (neighbors in mean/std RSSI space) and can work well when zone signatures are locally consistent. Segment-to-segment variation and noise can make 8D vectors overlap across zones, where KNN may be more sensitive.

- **XGBoost** fits a multi-class (4-class) model on the same 8D segment features. It can capture non-linear boundaries between zone classes in the 8D summary space and may generalize better when segment statistics are noisy or when zone signatures overlap. It is less interpretable than KNN.

Exact and per-position accuracy are computed from the outcome table (label vs each model’s sequence) and are shown above for the current test set.

### LLMs (Claude Opus 4.6, Gemini 3.1 pro)

The LLMs receive the same input (`time_based_rssi` from the test CSV, no labels) and output a space-separated 4-digit sequence per episode, with **no training** on this data. The prompt used is in `LLMs/case3/case3_prompt.txt`. Their results are interpreted in the same way as KNN and XGBoost: exact and per-position accuracy are shown in the app.

LLMs may do well when the RSSI series exhibits segment-level patterns that correlate with zone identity and order; they may lag on exact sequence match (getting all four positions right is harder) or when the task requires the training distribution or calibration. Unlike KNN and XGBoost, they receive the **full RSSI time series** and can reason over **temporal order and trajectory**, so they have the potential to use sequential structure that the segment-only models do not.

## Conclusion

Case 3 shows that **sequence prediction from RSSI is harder** when using only segment-level, non-temporal models; the results motivate temporal or sequence-aware models (or explain the contrast with LLMs that see the full series). See model explanations below for per-model strengths and limitations.
