# Thesis Improvement — Progress Tracker

> **Purpose:** Shared state for parallel agents. Check here BEFORE starting work on any chapter/phase to avoid duplicate effort.
>
> **Source of truth:** `THESIS_IMPROVEMENT_PLAN.md` (R2, 2026-04-20) — 8 phases in §7.

---

## Phase Status

| Phase | Scope | Status | Owner / Session | Last Update |
|-------|-------|--------|-----------------|-------------|
| 0 | **Abstract (Thai)** rewrite — concise, formal academic Thai | ✅ **DONE** | Opus 4.7 session | 2026-04-20 |
| 1 | Placeholder figures + plot scripts (~34 figures) | ✅ **DONE** | Cascade main session | 2026-04-20 |
| 2 | **Chapter 1 rewrite** (C1 — remove design content) | ✅ **DONE** (rewrite + placeholders + §1.3 restructure) | Opus 4.7 session | 2026-04-20 |
| 3 | Chapter 2 expansion (C2 — prose + citations) | ✅ **DONE** | Cascade session | 2026-04-20 |
| 4 | Chapter 3 alignment (C3 — 6 sections + §3.7) | ✅ **DONE** | Completion roadmap session | 2026-04-20 |
| 5 | Chapter 4 data fill (C4 — mirror §3.2–§3.6) | ✅ **DONE** | Cascade session | 2026-04-20 |
| 6 | Chapter 5 + appendices | ✅ **DONE** | Cascade session | 2026-04-20 |
| 7 | Bibliography (≥35 refs) + cleanup | ✅ **DONE** | Completion roadmap session | 2026-04-20 |
| 8 | Final polish (consistency pass) | ✅ **DONE** | Completion roadmap session | 2026-04-20 |

---

## Phase 1 — Placeholder figures + plot scripts (DONE 2026-04-20)

### What was completed
`Thesis/latex/assets/figures/chapter1/`, `chapter3/`, and `chapter4/` already contain the Phase 1 placeholder asset set aligned to the basenames referenced by the current LaTeX chapters.

`Thesis/latex/scripts/` already contains the scaffold/generator scripts for placeholder and plot work:
- `generate_phase1_figure_placeholders.py`
- `plot_ch4_metrics_stub.py`
- `ch4_percentiles_from_interval_csv.py`
- `merge_ch4_aggregate.py`
- `gen_ch3_arch_figures.py`

### Figure coverage summary
- Chapter 1: planned placeholder basenames referenced by current chapter source are present.
- Chapter 3: planned placeholder/photo/screenshot basenames (`ch3-fig01`–`ch3-fig15`) are present.
- Chapter 4: planned placeholder/photo/chart basenames (`ch4-fig01`–`ch4-fig14`) are present and wired through `\plannedchfourfigure`.
- Chapter 2: no additional Phase 1 asset basenames were generated because `THESIS_IMPROVEMENT_PLAN.md` lists labels for the three new figures but does not specify authoritative filenames yet; existing `chapter2.tex` still uses in-file TikZ for the currently referenced figure.

### Authoritative figure file list for Gemini / Antigravity generation

Use the exact filenames below when generating or replacing assets under `Thesis/latex/assets/figures/`.

#### Chapter 1 — current authoritative filenames from `chapter1.tex`
Directory: `Thesis/latex/assets/figures/chapter1/`

| Label | Exact filename to use | Asset type | What the image should show | Status |
|-------|------------------------|------------|-----------------------------|--------|
| `fig:ch1_nursing_home_context` | `ch1-fig01-nursing-home.jpg` | photo / contextual image | บริบทสถานดูแลผู้สูงอายุที่มีผู้ใช้เก้าอี้รถเข็นและผู้ดูแลในพื้นที่จริง | ready filename |
| `fig:ch1_analog_records` | `ch1-fig02-analog-board.jpg` | photo / contextual image | กระดานบันทึกงาน ตารางเวร หรือบอร์ดข้อมูลแบบแอนะล็อกในสถานดูแล | ready filename |
| `fig:ch1_facility_buildings` | `ch1-fig03-facility-buildings.jpg` | photo / contextual image | ภาพอาคารหลายหลังหรือหลายโซนของสถานดูแลที่สะท้อนปัญหาการประสานงานข้ามพื้นที่ | ready filename |
| `fig:ch1_wheelsense_overview` | `ch1-fig04-wheelsense-overview.pdf` | diagram | ภาพรวมแพลตฟอร์ม WheelSense และผู้มีส่วนเกี่ยวข้องหลัก | ready filename |
| `fig:ch1_scope_diagram` | `ch1-fig05-scope.pdf` | diagram | แผนภาพแสดงสิ่งที่อยู่ในขอบเขตและนอกขอบเขตของโครงงาน | ready filename |

Note: the older Phase 1 plan names `ch1-fig02-problem-tree.pdf` and `ch1-fig04-objectives-map.pdf` are not the current authoritative basenames for the active Chapter 1 source; use the table above.

#### Chapter 2 — filenames assigned here for external asset generation
Directory: `Thesis/latex/assets/figures/chapter2/`

| Label | Exact filename to use | Asset type | What the image should show | Status |
|-------|------------------------|------------|-----------------------------|--------|
| `fig:ch2_nursing_home_workflow` | `ch2-fig01-nursing-home-workflow.pdf` | diagram | รอบงานดูแลในบ้านพักคนชรา: รับเวร ติดตามผู้พักอาศัย บันทึกข้อมูล แจ้งเหตุ และส่งต่อเวร | assigned here |
| `fig:ch2_paper_to_digital` | `ch2-fig02-paper-to-digital.pdf` | diagram | การเปลี่ยนผ่านจากบันทึกกระดาษไปสู่ระบบดิจิทัล/EMR และจุดคอขวดของข้อมูล | assigned here |
| `fig:ch2_llm_mcp_concept` | `ch2-fig03-llm-mcp-concept.pdf` | diagram | ความสัมพันธ์ระหว่าง LLM, MCP tools, resources, prompts, และ human confirmation | assigned here |

Note: `chapter2.tex` currently still contains at least one in-file TikZ figure (`fig:ch2_iot_aal_layers`) that does not need a separate asset file unless later extracted.

#### Chapter 3 — planned filenames for Chapter 3 asset production
Directory: `Thesis/latex/assets/figures/chapter3/`

| Label | Exact filename to use | Asset type | What the image should show | Status |
|-------|------------------------|------------|-----------------------------|--------|
| `fig:ch3_arch_overview` | `ch3-fig01-architecture.pdf` | diagram | สถาปัตยกรรมรวม 4 ชั้นของ WheelSense: edge devices, server/data, AI, HMI | existing placeholder present |
| `fig:ch3_role_journey` | `ch3-fig02-role-journey.pdf` | diagram | บทบาทผู้ใช้ 5 กลุ่มและเส้นทางการใช้งานหลักของแต่ละบทบาท | existing placeholder present |
| `fig:ch3_wheelchair_module` | `ch3-fig03-wheelchair.jpg` | product photo / contextual image | อุปกรณ์บนเก้าอี้รถเข็น M5StickC Plus2 หรือภาพใกล้เคียงของโมดูลติดตั้งจริง | existing placeholder present |
| `fig:ch3_imu_payload` | `ch3-fig04-imu-flow.pdf` | diagram | flow ข้อมูล IMU จากการสุ่มสัญญาณไปสู่ feature extraction และ classification | existing placeholder present |
| `fig:ch3_camera_node` | `ch3-fig05-camera-node.jpg` | product photo / contextual image | โหนด Node Tsimcam หรืออุปกรณ์กล้อง/สแกน BLE ที่ติดตั้งในพื้นที่ | existing placeholder present |
| `fig:ch3_loc_pipeline` | `ch3-fig06-loc-pipeline.pdf` | diagram | pipeline การระบุตำแหน่งจาก RSSI vector ไปสู่ KNN และผลทำนายห้อง | existing placeholder present |
| `fig:ch3_pi_server` | `ch3-fig07-pi-server.jpg` | product photo / contextual image | ชุดเซิร์ฟเวอร์ Raspberry Pi 5 หรือ server box ของต้นแบบ | existing placeholder present |
| `fig:ch3_docker_topology` | `ch3-fig08-docker.pdf` | diagram | topology ของ Docker Compose, services, volumes, และการเชื่อมต่อหลัก | existing placeholder present |
| `fig:ch3_mqtt_topic_map` | `ch3-fig09-mqtt-topics.pdf` | diagram | แผนภาพ topic hierarchy ของ MQTT ภายในระบบ | existing placeholder present |
| `fig:ch3_db_er` | `ch3-fig10-er-diagram.pdf` | diagram | ER diagram ของ users, devices, rooms, alerts, tasks, และ records หลัก | existing placeholder present |
| `fig:ch3_easeai_pipeline` | `ch3-fig11-easeai.pdf` | diagram | EaseAI 5-layer pipeline ตั้งแต่ deterministic routing ถึง safety/execution | existing placeholder present |
| `fig:ch3_chat_actions_flow` | `ch3-fig12-chat-flow.pdf` | diagram | ลำดับ propose → confirm → execute ของ AI assistant | existing placeholder present |
| `fig:ch3_prompt_taxonomy` | `ch3-fig13-prompts.pdf` | diagram | taxonomy ของ 6 role prompts และขอบเขตการใช้งาน | existing placeholder present |
| `fig:ch3_web_dashboards` | `ch3-fig14-web-grid.png` | screenshot collage / UI mock | ภาพรวมหน้าจอเว็บแดชบอร์ดตามบทบาทต่าง ๆ | existing placeholder present |
| `fig:ch3_mobile_app` | `ch3-fig15-mobile-grid.png` | screenshot collage / UI mock | ภาพรวมหน้าจอแอปมือถือสำหรับผู้ป่วย/ผู้ดูแล | existing placeholder present |

#### Chapter 4 — current authoritative filenames from `chapter4.tex`
Directory: `Thesis/latex/assets/figures/chapter4/`

| Label | Exact filename to use | Asset type | What the image should show | Status |
|-------|------------------------|------------|-----------------------------|--------|
| `fig:ch4_site_floorplan` | `ch4-fig01-site.pdf` | floorplan / diagram | แผนผังพื้นที่ทดสอบภายในมหาวิทยาลัยธรรมศาสตร์ | existing placeholder present |
| `fig:ch4_install_nodes` | `ch4-fig02-install.jpg` | photo / contextual image | ภาพติดตั้งโหนด BLE และโหนดกล้องในพื้นที่ทดสอบ | existing placeholder present |
| `fig:ch4_install_server` | `ch4-fig03-server.jpg` | photo / contextual image | ภาพชุดเซิร์ฟเวอร์และอุปกรณ์เครือข่ายที่ใช้ในการทดสอบ | existing placeholder present |
| `fig:ch4_imu_rate` | `ch4-fig04-imu-rate.pdf` | chart | histogram หรือ distribution ของ IMU effective rate | existing placeholder present |
| `fig:ch4_telemetry_gap` | `ch4-fig05-telem-gap.pdf` | chart | distribution ของช่องว่างระหว่าง telemetry packets | existing placeholder present |
| `fig:ch4_loc_confusion` | `ch4-fig06-loc-confusion.pdf` | chart | confusion matrix ของการทำนายห้อง | existing placeholder present |
| `fig:ch4_loc_robust` | `ch4-fig07-loc-robust.pdf` | chart | accuracy เทียบกับระดับสัญญาณรบกวน | existing placeholder present |
| `fig:ch4_server_throughput` | `ch4-fig08-throughput.pdf` | chart | throughput ของ MQTT/REST ภายใต้ load ต่าง ๆ | existing placeholder present |
| `fig:ch4_llm_latency_box` | `ch4-fig09-llm-latency.pdf` | chart | boxplot เวลาแฝงของ pipeline LLM/MCP | existing placeholder present |
| `fig:ch4_llm_similarity_bar` | `ch4-fig10-llm-similarity.pdf` | chart | cosine similarity แยกตาม scenario | existing placeholder present |
| `fig:ch4_ai_conversation` | `ch4-fig11-ai-chat.png` | screenshot / UI mock | ภาพบทสนทนา AI assistant ในโหมด propose-confirm-execute | existing placeholder present |
| `fig:ch4_ux_likert_chart` | `ch4-fig12-ux-likert.pdf` | chart | Likert bar chart จากผลแบบสอบถาม UX จริง | existing placeholder present |
| `fig:ch4_e2e_latency` | `ch4-fig13-e2e-latency.pdf` | chart | latency ของเส้นทางหลักแบบ normal vs stress | existing placeholder present |
| `fig:ch4_feedback_session` | `ch4-fig14-feedback.jpg` | photo / contextual image | ภาพการนำเสนอระบบต้นแบบและรับ feedback ที่บ้านพักคนชรา | existing placeholder present |

#### Quick handoff rules for Gemini / Antigravity
- For `.jpg` / `.png`: generate raster images and save with the exact filename above.
- For `.pdf` diagrams: generate the visual concept first, then convert/export to the exact `.pdf` basename required by LaTeX.
- For charts in Chapter 4: prefer data-driven generation from scripts when possible; only use Gemini for visual placeholders or concept art, not final quantitative charts.
- If you replace an existing placeholder, keep the basename unchanged so the LaTeX source does not need to change.

---

## Phase 2 — Chapter 1 (DONE 2026-04-20)

### What was changed
`Thesis/latex/content/chapters/chapter1.tex` — full rewrite (266 → ~260 lines, restructured).

### Section mapping (new → old)
| New section | Status | Notes |
|-------------|--------|-------|
| §1.1 ที่มาและความสำคัญ | rewritten as flowing prose | wheelchair users **primary**, elderly + other disabled **secondary**; motivation includes บ้านพักคนชราวาสนะเวศม์; 3 problem axes (safety / paper records / caregiver workload) |
| §1.2 วัตถุประสงค์ | rewritten | 8 objectives at **deliverable level** (no tech names per C1) — covers device/localization/server/web/mobile/clinical workflows/on-prem AI/evaluation |
| §1.3 ขอบเขตงานวิจัย | rewritten (v2, 2026-04-20 late) | **flat `enumerate` with label `1.3.1`–`1.3.7`** per senior-thesis style; no `\subsection*{}` (prevents sub-items in TOC); closing prose paragraph lists what's out-of-scope; test-site split retained (TU technical + วาสนะเวศม์ feedback-only) |
| §1.4 ประโยชน์ที่คาดว่าจะได้รับ | rewritten, **moved before** timeline | 7 benefits |
| §1.5 แผนการดำเนินงาน | rewritten | Gantt table kept with updated row labels (generic, no tech names); resource/equipment table simplified |

### C1 compliance
- No protocol names, library names, or hardware specs in Ch.1 prose. (`M5StickC Plus2`, `Gemma 4B`, `MCP`, `Next.js`, `KNN`, `MQTT`, `Raspberry Pi 5`, `BLE` etc. — all removed or deferred to §3.1).
- Exception: equipment table (§1.5) keeps generic item names ("อุปกรณ์บนเก้าอี้รถเข็น (รวม IMU ในตัว)") for budget purposes.
- Removed labels that were used nowhere else: `sec:ch1_boundaries`, `sec:ch1_research_questions`, `sec:ch1_contributions` (grep-verified 0 external refs).

### Figures (placeholder via `\IfFileExists` fallback)
Directory: `Thesis/latex/assets/figures/chapter1/`

| Label | Expected filename | Content |
|-------|-------------------|---------|
| `fig:ch1_nursing_home_context` | `ch1-fig01-nursing-home.jpg` | **ภาพจริง** ผู้สูงอายุ/ผู้ใช้เก้าอี้รถเข็นที่วาสนะเวศม์ |
| `fig:ch1_analog_records` | `ch1-fig02-analog-board.jpg` | **ภาพจริง** กระดานบันทึก/ตาราง analog |
| `fig:ch1_facility_buildings` | `ch1-fig03-facility-buildings.jpg` | **ภาพจริง** อาคารหลายหลังของสถานดูแล |
| `fig:ch1_wheelsense_overview` | `ch1-fig04-wheelsense-overview.pdf` | TikZ overview (stakeholders + platform) |
| `fig:ch1_scope_diagram` | `ch1-fig05-scope.pdf` | TikZ scope in/out diagram |

All 5 figures render a bordered fallback box with descriptive caption if the file is missing — safe to compile now without images.

### Build verification
- Compile verification was **deferred** (user runs `xelatex` locally).
- Static checks done: no broken cross-refs to removed labels (grep clean).
- Citations used in §1.1 (all already in `biblatex-ieee.bib`): `WHO_Disability_Health`, `Vimarlund2021AAL_challenges`, `Indoor_GPS_Limitations`, `BLE_Fingerprint_Survey_IEEE`, `WiFi_BLE_IPS_Systematic_Review`.

---

## Phase 3 — Chapter 2 (DONE 2026-04-20)

### What was changed
`Thesis/latex/content/chapters/chapter2.tex` — confirmed complete against the revised Chapter 2 plan structure in `THESIS_IMPROVEMENT_PLAN.md` with academic prose flow across §2.1–§2.10.

`Thesis/latex/bib/refs.bib` — added the missing bibliography entries required by Chapter 2 so all `\cite{}` keys used in the chapter now resolve from the thesis bibliography file actually loaded by `biblatex`.

### Scope closure
| Area | Status | Notes |
|------|--------|-------|
| §2.1–§2.10 structure | complete | Matches the planned theory-to-application progression for elderly care, IoT, IPS, wearable sensing, pub-sub communication, LLM, MCP, security, UX/statistics, and related work |
| Prose style under C2 | complete | Chapter is written as connected academic prose rather than figure-block stacking |
| Citation coverage | complete | Every technical paragraph in the current chapter text carries at least one `\cite{}` |
| Related-work synthesis table | complete | `tab:ch2_related_work` present and connected to surrounding prose |

### References added to `refs.bib`
- Elderly care / nursing home context
- IoT / AAL foundation
- Indoor positioning and BLE localization
- Wearable sensing and sampling theory
- Publish-subscribe / MQTT / soft real-time foundations
- LLM / MCP / tool-using agent literature
- RBAC / JWT / OAuth / usability / inter-rater agreement references

### Verification
- RED: Chapter 2 contained unresolved citation keys because `chapter2.tex` cited entries not present in `bib/refs.bib`.
- GREEN: static key-resolution check now returns `OK: all chapter2 citation keys exist in refs.bib`.
- Compile verification remains **deferred** (user runs `xelatex` / `biber` locally if desired).

---

## Phase 5 — Chapter 4 data fill (DONE 2026-04-20)

### What was changed
`Thesis/latex/content/chapters/chapter4.tex` — completed the planned Phase 5 closure pass around the already-populated Chapter 4 draft.

`Thesis/docs/tracking/MOCK_DATA_AUDIT.md` — added the planned audit file listing which Chapter 4 values are source-backed versus mock-backed and what should replace each set later.

### Scope closure
| Area | Status | Notes |
|------|--------|-------|
| Chapter 4 mirror to Chapter 3 | complete enough for draft | `chapter4.tex` remains aligned to the current Ch.3 module flow: field devices, localization/environment, server, AI, HMI, end-to-end, and nursing-home feedback |
| Nursing-home field context | added | inserted a dedicated subsection in §4.3 to clarify that วาสนะเวศม์ is feedback/context only, not the source of technical benchmark numbers |
| AI conversation example | present and retained | propose--confirm--execute subsection remains in §4.7 with the screenshot figure hook |
| Mock auditability | complete for current draft | added `% MOCK:` annotations in mock-backed subsections and created `MOCK_DATA_AUDIT.md` |
| Cross-reference cleanup | partial static cleanup complete | fixed broken Ch.3 references found during the pass; compile-time verification still deferred locally |

### Source-backed vs mock-backed outcome
- **Source-backed kept as-is**: AI evaluation tables sourced from `Thesis/data/analysis/llm_mcp_eval_results.json`, UX summary sourced from `Thesis/data/surveys/WheelSense UX_UI - Feedback (การตอบกลับ) - การตอบแบบฟอร์ม 1.csv`, and qualitative nursing-home feedback retained as narrative evidence.
- **Mock-backed and explicitly marked**: field-device performance, selected localization/site-installation summaries, server throughput/availability, mobile latency, and end-to-end benchmark figures/tables.

### Verification
- Static review confirmed that `chapter4.tex` now contains explicit `% MOCK:` markers for mock-backed sections.
- Static review confirmed the planned audit artifact now exists at `Thesis/docs/tracking/MOCK_DATA_AUDIT.md`.
- Compile verification remains **deferred** (user runs `xelatex` / `biber` locally).

---

## Phase 6 — Chapter 5 + appendices (DONE 2026-04-20)

### What was changed
`Thesis/latex/content/chapters/chapter5.tex` — rewritten so Chapter 5 now reflects the actual Chapter 4 evidence state after the Phase 5 fill, removes stale unresolved references, and separates conclusions, limitations, obstacles, engineering recommendations, research recommendations, and Thai deployment recommendations.

`Thesis/latex/content/appendices/appendixA.tex` through `appendixF.tex` — appendix set reorganized into a coherent A–F sequence aligned with the thesis plan:
- Appendix A: repository structure and installation guide
- Appendix B: MQTT / telemetry contract
- Appendix C: MCP tool registry
- Appendix D: Alembic migration pack
- Appendix E: UX form and evaluation procedure
- Appendix F: MCP / IRR evaluation pack

`Thesis/latex/thesis.tex` — updated appendix includes so the compiled thesis now pulls in appendices A–F.

### Scope closure
| Area | Status | Notes |
|------|--------|-------|
| Chapter 5 rewrite | complete | conclusion chapter now matches the current Ch.4 narrative instead of the pre-Phase-5 draft |
| Broken/static reference cleanup in Ch.5 | complete | removed stale references to nonexistent Ch.3 labels and old “รอสกัด” framing |
| Appendix C–F deliverables | complete | all four planned appendices were created with repo-backed content |
| Appendix set coherence | complete | old A/B stopgaps were replaced so the thesis now has a planned A–F appendix order |

### Verification
- Static review confirmed Chapter 5 no longer references the stale `tab:ch3_*` labels that previously existed there.
- Static review confirmed `thesis.tex` now includes appendices `appendixA` through `appendixF`.
- Static review confirmed the new appendix labels used by Chapter 5 are present in the appendix files.
- Compile verification remains **deferred** (user runs `xelatex` / `biber` locally).

---

## Known downstream impact (for subsequent phases)

- **Phase 4 (Ch.3) must absorb** the design rationale removed from old Ch.1: contribution list, spec numbers, protocol names, hardware model numbers → belongs in §3.1 (System Design) and §3.2–§3.7.
- **Phase 3 (Ch.2) is now closed** — subsequent phases should reuse the terminology already stabilized there ("ผู้ใช้เก้าอี้รถเข็น" / "ผู้ดูแล" / "แพลตฟอร์ม WheelSense" / "การระบุตำแหน่งในอาคาร").
- **Phase 5 (Ch.4) is now closed for draft purposes** — later sessions should replace values listed in `Thesis/docs/tracking/MOCK_DATA_AUDIT.md` with final exports instead of rewriting the structure again.
- **Phase 6 (Ch.5 + appendices) is now closed for draft purposes** — later sessions should focus on bibliography, citation cleanup, and compile-time consistency rather than reshaping the appendix architecture again.

---

## Phase 4 — Chapter 3 (DONE 2026-04-20, Completion Roadmap)

### What was changed
`Thesis/latex/content/chapters/chapter3.tex`:
- Added `\plannedchthreefigure` macro (`\IfFileExists` fallback to bordered placeholder).
- Wired 11 planned figures via the new macro (hardware, server, AI, HMI).
- Added 2 numbered equations: `conf(r)` for localization confidence (§3.3.2), `cosine similarity` for AI embedding safety (§3.5.3).
- Added citations across §3.4–§3.7 (REST, layered architecture, MQTT, RBAC, ReAct, Toolformer, sentence embeddings, alert fatigue, nursing workload, AAL).
- Fixed TikZ `step` style name collision with built-in PGF key (renamed to `stepbox`).

Final verified shape: 2 equations, 17 figures, 31 citations.

---

## Phase 7 — Bibliography (DONE 2026-04-20, Completion Roadmap)

### What was changed
`Thesis/latex/bib/refs.bib`:
- Added 3 missing entries flagged by the resolution scan:
  - `Field2013DiscoveringStats` (statistics textbook).
  - `Lara2013HumanActivityRecognition` (IEEE Surveys & Tutorials).
  - `Welch2006KalmanFilter` (UNC technical report).
- Verified all 83 unique `\cite{}` keys across Ch.2–Ch.5 resolve against 100 bib entries.

---

## Phase 8 — Final polish (DONE 2026-04-20, Completion Roadmap)

### What was changed
`Thesis/latex/content/chapters/chapter2.tex`:
- Added 5 numbered equations per §11.1 of the improvement plan: RSSI log-distance path-loss (§2.3), Euclidean distance for $k$-NN (§2.4), weighted $k$-NN decision rule, Little's Law and end-to-end latency decomposition (§2.5).
- Fixed TikZ parser errors in pre-existing figures: RSSI model node coordinate wrapped in braces, PPG node annotations given `align=center`, MCP topology node `\\&` collapsed to plain `\&`, RSSI legend given `align=center`.
- Corrected undefined reference `chapter:results` → `chapter4`.

`Thesis/latex/content/chapters/chapter4.tex`:
- Added 6 numbered equations: effective sampling rate (§4.4.1), {Precision, Recall, Accuracy, F1} block (§4.4.3), Cohen's $\kappa$ (§4.7.2), percentile linear interpolation (§4.7.4), Likert CI with $t$-distribution (§4.8).
- Added 15+ citations in the localization evaluation (§4.5), LLM/MCP evaluation setup (§4.7), cosine similarity interpretation, and nursing-home feedback framing.
- Fixed undefined reference `sec:ch3_ai_safety` → `sec:ch3_ai_tools_safety`.

`Thesis/latex/content/chapters/chapter5.tex`:
- Added 3 tables: Objective-to-evidence traceability (Obj-1..8 → Ch.4 tables), limitations with impact and short-term mitigation, future-work priority matrix.

### Build verification
- `xelatex → biber → xelatex × 2` pipeline now completes cleanly.
- No `Package tikz Error`, no `Not allowed in LR mode`, no `Reference ... undefined`, no `Citation ... undefined` warnings in the final log.
- Produced `Thesis/latex/thesis.pdf` (~1.95 MB) with the full updated content.
- Remaining warnings are only `Overfull \hbox` cosmetic line-breaking notes (pre-existing, do not affect correctness).

---

## Update protocol for agents

When you claim a phase:
1. Change status to `in_progress` in the table above.
2. Fill in `Owner / Session` + `Last Update` (YYYY-MM-DD).
3. On completion, change to ✅ **DONE** and add a per-phase section below with the same template as Phase 2.
