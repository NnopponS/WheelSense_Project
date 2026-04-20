1. ยุบรวมเนื้อหามารวมกัน ไม่ต้องมีหัวข้เอ lit review

Traditional ML approaches such as K-Nearest Neighbors
(KNN) and gradient boosting methods like XGBoost have
demonstrated strong performance in controlled indoor settings
[3], [4]. Although these well-established algorithms continue
to deliver competitive accuracy on structured tabular RSSI
data, they treat each sample as an isolated point or fixed statistical window. This fundamental lack of temporal reasoning
becomes a critical limitation in dynamic environments, where
RSSI fluctuates due to body shadowing, multipath fading, and
zone-boundary ambiguity [5], [6].

BLE RSSI fingerprinting relies primarily on KNN [3] and
gradient boosting [4], which produce strong results on static
tabular data but struggle with temporal dependencies [5], [6].
On the LLM side, Jin et al. [7] proposed Time-LLM, and
Gruver et al. [8] demonstrated zero-shot time-series forecasting, yet neither applied LLMs to RSSI classification. Broader
surveys cover both traditional and emerging indoor localization
methods [1], [2], [9]. Early RSSI fingerprinting work by Bahl
and Padmanabhan [10] established KNN as the dominant
classifier, later extended to BLE by Faragher and Harle [11].
Kalman filtering has been shown to reduce positioning error
by up to 80% [12], and deep learning architectures have
recently been explored [13]. However, all these approaches
remain limited in modeling complex RF multipath effects [14].
None of this prior work has applied LLMs as classifiers for
continuous BLE RSSI streams


2. รวมเนื้อหา "Three scenarios testing body orientation, boundary tran-
sition, and dynamic trajectory under inherently unstable
BLE signal conditions.
3) Robustness analysis under noise injection and anchor
failure, revealing superior LLM resilience to hardware
degradation."  เป็นข้อ 2 

3. เปลี่ยนจาก Methods เป็น Methodology
มี 1 ย่อหน้าอธิบายแนวคิดของ eval framework โดยชี้ประเด็นว่าข้อมูล RSSI ควรจัดอย่างไร เพื่อให้สามารถทำงานได้ทั้ง ML และ LLM
A Experimental Environment
"he experiment uses a single room divided into four zones
(Zone A, B, C, D), each approximately 4×4 m, separated
by cloth partitions as shown in Fig. 3. Hardware components
(Fig. 2) include:
Anchors: Four ESP32-S3 BLE nodes (Fig. 2a), one per
zone center, at 0.7 m height, communicating via MQTT
over Wi-Fi.
• Tag: One M5StickC Plus2 (Fig. 2b) BLE beacon, attached to the participant’s waist at 0.7 m (Fig. 2c),
broadcasting at 5 Hz (200 ms interval).
• Server: Python-based data collection server with synchronized video recording for ground truth labeling.
"ย้ายรูป มาติดข้อความ" สลับ Figure 1 กับ 3

B Experimental Design
" Case 1: Body Orientation Detection. The participant
stands stationary in Zone D, facing four cardinal directions (N,
S, E, W) at two distance ranges from the anchor (≤1 m and
>1 m). Each combination produces two classes: Facing in (0)
and Facing out (1)—body blocks the direct path, causing RSSI
attenuation [6]. Conditions: 4 directions × 2 distances × 2
classes = 16, 3 replicates (48 episodes).
Case 2: Boundary Transition Detection. The participant
stands on demarcation lines between Zone D and adjacent
zones. Binary task: In Zone D (0) or Out (1). Conditions: 2
boundaries × 2 classes × 12 replicates = 48 episodes. This
task is inherently difficult: cloth partitions provide negligible
RF attenuation at 2.4 GHz.
Case 3: Multi-Zone Trajectory. The participant walks
through all four zones in randomized sequences, pausing 5–6 s
in each zone’s center. Task: predict exact ordered sequence of
zone IDs. LLMs receive the full time series; ML models use
four contiguous segments."

C
"ach case comprises 48 episodes. An episode is one continuous recording under fixed experimental conditions. Each
episode lasts approximately 5 seconds. The dataset is split
into 13 training and 35 test episodes by a single random
draw without replacement; the same split is used for all
models. Raw RSSI values from the four anchors form a
4-dimensional feature vector at each time step, recorded
as (timestamp), (r1), (r2), (r3), (r4) where
(r1)--(r4) are the RSSI readings (in dBm) from anchors 1–4 and (timestamp) is the Unix epoch in milliseconds. Missing RSSI readings were forward-filled when
possible; otherwise the most recent valid value was retained.
No smoothing or filtering was applied to preserve the raw
signal dynamics"

D Machinelearning models for classification 
"KNN (k=5, Euclidean distance): A distance-based
classifier applied to per-sample 4D RSSI vectors. For
Cases 1 and 2, the episode prediction is obtained by
round(mean(predictions))—a soft vote over time
steps. For Case 3, each episode is divided into four contiguous
segments, and 8D features (mean and standard deviation
of RSSI per anchor per segment) are used for 4-class zone
classification.
XGBoost (100 trees, max depth 6, learning rate 0.1): A
gradient boosting decision tree model trained on the same
features and using the same episode-level aggregation as
KNN. Hyperparameters were selected based on commonly
used defaults in RSSI fingerprinting studies"

E Large Language Models for classification
"Claude Opus 4.6 and Gemini 3.1 Pro: Both LLMs receive
the raw RSSI time series from test episodes via a taskspecific prompt (Section II-D). No training data or labels
are provided—predictions are entirely zero-shot. Each LLM
receives the identical prompt and test CSV. This design reflects typical RSSI fingerprinting pipelines where ML models
operate on engineered statistical features, while LLMs process
raw sequences.
"
"To ensure reproducibility and minimize variance in generated outputs, prompt formulations for both LLMs (Claude
Opus 4.6 and Gemini 3.1 Pro) were tightly controlled. The
design enforces strict zero-shot inference: models are provided
the task description, class definitions, and input data format
without any few-shot examples, domain-specific engineering
hints, or physical layout descriptions (e.g., anchor coordinates).
Case 1 prompt: “You are acting as an expert indoor
localization system. Predict labels for the provided BLE RSSI
test dataset (Case 1). Each row in the attached CSV represents
one episode. Based only on the RSSI time series data, classify
whether the participant was Facing in (0) or Facing out (1).
Do not provide explanations. Output strictly a Markdown table
with two columns: ‘id’ and ‘predicted’.”
Case 2 prompt: “You are acting as an expert indoor
localization system. Predict labels for the provided BLE RSSI
test dataset (Case 2). Each row in the attached CSV represents
one episode. Based only on the RSSI time series data, classify
the boundary transition: In zone 4 (0) or Out zone 4 (1). Do
not provide explanations. Output strictly a Markdown table
with two columns: ‘id’ and ‘predicted’.

Case 3 prompt: “You are acting as an expert indoor
localization system. Predict the trajectory sequence for the
provided BLE RSSI test dataset (Case 3). The environment is
a single room divided into 4 equal-sized zones (4×4 m each,
separated by cloth partitions). Based only on the continuous
RSSI time series, predict the exact sequence of 4 zone IDs (1,
2, 3, or 4) visited in order. Example format: ‘4 3 2 1’. Do not
provide explanations. Output strictly a Markdown table with
two columns: ‘id’ and ‘predicted’.”
The input CSV files consistently format each row as
experiment_id followed by a semicolon-separated list
of temporal readings timestamp,r1,r2,r3,r4 (RSSI
values in dBm). For the robustness evaluation (Section III-E),
the identical prompts were deployed with altered CSV data;
the models were intentionally left uninformed regarding the
injected Gaussian noise or anchor failures"


3. Results and Discussion
เกริ่นก่อน 1 ย่อหน้เาว่าเรื่วอะไร (+นิยามสั้นๆ) เป็นตัวเปรียบเทียบ และ Table 1 "able I summarizes performance across all three cases (35
test episodes each). Tables II and III present the confusion
matrices for the binary classification tasks.
"
A Case 1 : Body Orientation
"All four models exceed
88% accuracy, confirming a readily detectable RSSI signature
from body shadowing. Body orientation introduces bodyshadowing, which significantly attenuates RSSI signals. This
produces consistent patterns that both ML and LLM models can capture reliably. Both Claude and XGBoost achiev
97.14% (34/35), each with TN=18, FP=0, FN=1, TP=16. KNN
produces 3 FP due to RSSI overlap at boundary distances.
Gemini achieves 94.29% with a balanced error profile (FP=1,
FN=1). The consistent RSSI level-shift over a 5-second window makes this task well-suited to both gradient boosting and
zero-shot reasoning.
"

B Case 2 : Boundary Transition
"This proves the most
challenging scenario (Table III). KNN leads at 68.57%, followed by Claude (62.86%), XGBoost (57.14%), and Gemini (34.29%—below chance). The difficulty is fundamentally
physical: with only one anchor per zone [14], the system lacks
spatial redundancy to resolve boundary positions. Boundary
transitions produce highly ambiguous RSSI patterns due to
minimal RF attenuation through cloth partitions, explaining
the reduced performance across all models. Furthermore, body
shadowing at boundaries affects all four anchor readings
simultaneously [6], creating overlapping RSSI distributions
that no classifier can cleanly separate.
KNN outperforms XGBoost specifically because of its nonparametric, instance-based nature [15]: it stores all training
instances and adapts flexibly to local RSSI decision surfaces
without assuming a global structure. With the one-anchorper-zone layout, boundary RSSI distributions are irregularly
shaped and position-dependent—KNN naturally captures these
local patterns through distance-weighted voting over nearby
instances [3]. XGBoost, by contrast, builds fixed tree splits
optimized for globally separable features [16]; when boundary
RSSI distributions overlap heavily, its axis-aligned decision
boundaries cannot capture the subtle, position-specific patterns
that KNN exploits. Zero-shot LLMs lack any access to the
training distribution and must rely solely on prompt-time
signal reasoning, placing them at a structural disadvantage on
this ambiguous task.
"

C Case 3 : Multi-Zone Trajectory
"Gemini achieves
97.14% (34/35) and Claude reaches 94.29% (33/35), both
substantially outperforming KNN (88.57%) and XGBoost
(48.57%). Trajectory prediction benefits from temporal structure in the signal sequence, which likely explains the strong
performance of LLMs that reason over sequential patterns.
The advantage lies in the LLMs’ temporal signal reasoning—
recognizing RSSI peak transitions between anchors as zone
changes. Unlike XGBoost, which builds fixed decision trees
on per-segment statistics [16], and KNN, which evaluates each
segment independently [15], LLMs process the entire RSSI
time series in a single inference pass. This enables detection
of outlier time steps and cross-episode pattern correction that
per-sample ML classification cannot achieve [17]. XGBoost’s
85% per-position accuracy compounds to only 0.854 ≈ 52%
exact-sequence accuracy.
"
D Cross-Case Analysis

E LLM Reasoning Process Analysis

4. Robustness Under Signal Degradation
แยกเนือ้หา่าออกเป็น A. Noise resilience และ B. Anchor failure



5. Conclusion ย้ายตรงมามารวม
". Practical Implications
ML models offer sub-10 ms edge inference at zero marginal
cost, while each LLM API call requires 1–3 minutes. This
asymmetry suggests a hybrid architecture: ML for real-time
zone tracking, with LLMs invoked selectively for offline
trajectory reconstruction or when anchor degradation reduces
ML accuracy below acceptable thresholds. A promising application is LLM-based RSSI analysis as a privacy-preserving
alternative to CCTV—detecting abnormal behavior patterns
(e.g., prolonged immobility suggesting a fall) without video
data, particularly suitable for healthcare environments.
G. Limitations
Sample size. Each case uses 35 test episodes (resolution
2.86 pp). A 95% binomial confidence interval at 85% accuracy
spans ±12 pp, so model differences below this threshold
should not be considered significant. Although the dataset size
s limited, each episode contains a continuous RSSI time series
with multiple temporal samples, providing sufficient signal
dynamics for classification analysis. Future work will expand
the dataset and evaluate cross-validation strategies. Single environment and participant. Generalization to different room
geometries, construction materials, and body morphologies
remains unevaluated. LLM non-determinism. All reported
LLM results are from a single evaluation run; repeating
prompts may yield different predictions. Cost. Processing 35
episodes costs $0.50–$2.00 per case per model—negligible for
research but potentially significant at scale."

กับ
"s limited, each episode contains a continuous RSSI time series
with multiple temporal samples, providing sufficient signal
dynamics for classification analysis. Future work will expand
the dataset and evaluate cross-validation strategies. Single environment and participant. Generalization to different room
geometries, construction materials, and body morphologies
remains unevaluated. LLM non-determinism. All reported
LLM results are from a single evaluation run; repeating
prompts may yield different predictions. Cost. Processing 35
episodes costs $0.50–$2.00 per case per model—negligible for
research but potentially significant at scale."



"2. remove  "This work involved human subjects in its research. The author(s) confirm(s) that all human subject research procedures and protocols are exempt from review board approval."

3. add ()  all models. Raw RSSI (r1,r2,r3,r4) time step (timestamp)

4. fix case 3 multi-zone trajectory from pausing 0.5- 1 sec to 5 - 6 sec

5. Case-by-Case Analysis  find paper ref that other paper prove somting and add about 
"KNN is unsupervise case 2 3 because it use post label so the KNN have flexible than XGboost that help to accuracy improve and LLM outperformed everything becasue it can analy whole data not only 1by 1 like ML so it can detect the outlier and correcct analys  

6. fix the result of TABLE 1 2 and 3 the AI is over perfect result that can cause reject of paper change the % of ai max around 96 - 100% and fix the confusion matrix and robust expiremant for me   the final result % should possible from max test data is 35 and add TP TN FP FN

7.  Cross-Case Analysis  find paper ref that other paper prove somting 

8. LM Reasoning Process Analysis  find paper ref that other paper prove somting 

9. obustness Under Signal Degradation  find paper ref that other paper prove somting 

10. fix the fig4 zoom in table at 75 - 100 for see clearly result

11.fix the conclusion "Conclusion
Summarize your key findings. Include important conclusions that can be drawn and further implications for the field. Discuss benefits or shortcomings of your work and suggest future areas for research." 

12.  ACKNOWLEDGMENT 
thank  Thammasat School of Engineering and  CED-Square Innovation Center 


When you add more ref dont forget to add in REFERENCES and remove nonnessesasy ref for me"