# WheelSense thesis — rubric-style checklist (front matter + Chapters 1–3)

Use this as a **self-audit** after edits. Target: **9/10** on clarity, correctness, rigor, completeness, and low duplication.

## Correctness (vs current WheelSense repo)

- [ ] Abstracts TH/EN agree: M5StickC collects RSSI; `Node_Tsimcam` / ESP32-S3 = **still photo** path (not IPS input); mobile = React Native + Expo; HA + LLM/MCP with **propose → confirm → execute** where relevant.
- [ ] No claims of “continuous video” or ESP32 doing indoor positioning as primary story.
- [ ] Ch3 MQTT topic names and roles match `docs/ARCHITECTURE.md` / `server/AGENTS.md` (`WheelSense/data`, `WheelSense/mobile/...`, alerts, vitals, room, camera registration/status/photo/control/ack, wheelchair control/ack). Canonical audit table: `tab:ch3_mqtt_topics` under `sec:ch3_mqtt_contract`.
- [ ] **Profile-A** is the only parameter bundle cited for reported numbers in Ch4-bound sections.

## Clarity & structure

- [ ] Front matter: abstracts follow Problem → Approach → Modules → Evaluation (high level) → Limits.
- [ ] Ch1: explicit **contributions**, **research questions (RQ)**, and **system boundaries**; equipment table matches prototype scale.
- [ ] Ch2: figures replace placeholders; **comparison tables** present (IPS tech + literature synthesis table + fingerprinting vs model-based `tab:ch2_fp_vs_model`).
- [ ] Ch2: **RSSI drift** subsection links forward to Ch3 Gaussian noise / KNN vs XGBoost test.
- [ ] Ch3: reader can find **one canonical** place for: MQTT contract (`sec:ch3_mqtt_contract`), multi-stream time issues (`chapter2` `sec:ch2_multistream` + Ch3 ordering), **ground truth** (`sec:ch3_ground_truth`), **schema audit** (`tab:ch3_schema_min`), **localization robustness logs** (`tab:ch3_loc_robust_log`).

## Rigor & reproducibility

- [ ] Ch3: fingerprint protocol + QC gates + deployment/E2E gates + Profile-A freeze evidence listed.
- [ ] Ch3: ingestion steps (`sec:ch3_ingestion_validation`) + ordering (`sec:ch3_ordering`) explicit.
- [ ] Ch3: LLM/MCP minimum log fields (`tab:ch3_llm_log_min`) + robustness log fields (`tab:ch3_loc_robust_log`).
- [ ] Bibliography: cite keys are semantic (no misleading `TBD_*` prefixes); entries live in `bib/refs.bib`. GNSS indoor limits anchored with peer-reviewed `SecoGranados2012_GNSS_indoor_challenges` plus optional industry note `Indoor_GPS_Limitations`.

## Completeness (academic “questions answered”)

- [ ] Ch2 final section: **research gap** + mapping to WheelSense direction remains.
- [ ] Ch3 test plan: **four UX/LLM pillars** + **localization robustness** clearly separated (latter supplementary engineering evidence).

## Duplication control

- [ ] IPS trade-off prose does **not** repeat table row-by-row (cross-ref `tab:ch2_ips_tradeoffs`).
- [ ] IPS theory not re-derived in Ch3 beyond pointers to Ch2 + citations.

## Visual completeness debt (Ch3)

- [ ] **Deferred in this rubric pass:** final PDF/PNG (or TikZ) exports for Chapter 3 architecture figures under `assets/figures/chapter3/`; placeholders may still appear until assets exist.

## Build gate

- [ ] From `Thesis/latex/`: `xelatex` + `biber` + `xelatex` ×2 with no undefined citations/refs; figures compile (TikZ).

---
*Generated as part of the thesis upgrade plan; adjust checklist if faculty rubric differs.*
