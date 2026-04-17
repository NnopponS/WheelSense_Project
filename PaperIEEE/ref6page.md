Comparative Performance Evaluation of BLE-Based
Indoor Localization Using Machine Learning and
Large Language Models
1st Worapon Sangsasri
Dept. of ECE
Thammasat School of Engineering
Pathum Thani, Thailand
worapon.sangs@gmail.com
4th Sairag Saadprai
Dept. of Sports Science
and Sports Development
Thammasat University
Pathum Thani, Thailand
sairag.saa@allied.tu.ac.th
2nd Suppawit Ausawalaithong
Dept. of ECE
Thammasat School of Engineering
Pathum Thani, Thailand
suppawit.aus@gmail.com
5th Supachai Vorapojpisut
Faculty of Engineering
Thammasat School of Engineering
Pathum Thani, Thailand
vsupacha@engr.tu.ac.th
Abstract—This paper presents a comparative evaluation of
Bluetooth Low Energy (BLE) Received Signal Strength Indicator
(RSSI)-based indoor localization using four classifiers: K-Nearest
Neighbors (KNN), eXtreme Gradient Boosting (XGBoost), and
two zero-shot Large Language Model (LLM) classifiers—Claude
Opus 4.6 and Gemini 3.1 Pro. Experiments are conducted
in a single room divided into four zones by cloth partitions,
instrumented with four ESP32-S3 BLE anchor nodes and one
M5StickC Plus2 wearable tag. Three scenarios evaluate body ori
entation detection, boundary transition classification, and multi
zone trajectory sequencing. Claude achieves 97.14% accuracy on
body orientation, KNN leads boundary transition at 68.57%, and
Gemini achieves 97.14% exact-sequence accuracy on trajectory
prediction. Robustness experiments under noise injection and
anchor failure reveal that LLMs demonstrate strong robustness
under hardware degradation, with Claude retaining 91.43% even
with two anchors lost. These findings suggest that zero-shot LLMs
can achieve competitive performance compared to trained ML
models on structured BLE RSSI classification tasks, particularly
when temporal reasoning or clear signal patterns are present.
3rd Darawadee Panich
Dept. of Medical Engineering
Thammasat University
Pathum Thani, Thailand
darawadeemookpanich@gmail.com
Traditional ML approaches such as K-Nearest Neighbors
(KNN) and gradient boosting methods like XGBoost have
demonstrated strong performance in controlled indoor settings
[3], [4]. Although these well-established algorithms continue
to deliver competitive accuracy on structured tabular RSSI
data, they treat each sample as an isolated point or fixed sta
tistical window. This fundamental lack of temporal reasoning
becomes a critical limitation in dynamic environments, where
RSSI fluctuates due to body shadowing, multipath fading, and
zone-boundary ambiguity [5], [6].
Index Terms—Indoor Localization, Bluetooth Low Energy,
Large Language Models, Machine Learning, RSSI Fingerprint
ing, Time-Series Classification
I. INTRODUCTION
Indoor localization has become essential for applications
including asset tracking, elderly care monitoring, and smart
building management [1]. Among available radio technologies,
Bluetooth Low Energy (BLE) has gained widespread adoption
due to its low power consumption and ubiquity in consumer
devices [2]. BLE-based systems commonly rely on Received
Signal Strength Indicator (RSSI) fingerprinting, where ma
chine learning (ML) models map observed signal patterns to
known locations [3].
Concurrently, advances in Large Language Model (LLM)
reasoning have opened a fundamentally different paradigm:
when raw numerical data is presented to an LLM as text, the
model can apply contextual reasoning without domain-specific
training. This raises a compelling question—can LLM reason
ing handle numeric sensor data as effectively as traditional
ML for localization problems? If so, LLMs could serve as
zero-shot classifiers that require no labeled training data, no
feature engineering, and no model retraining when deployment
conditions change. Recent work has explored LLMs for time
series analysis [7], [8], yet their application as zero-shot
classifiers for continuous BLE RSSI signals remains an open
research gap.
We select the localization problem as a test bed specifically
because BLE signal strength is inherently unstable—RSSI val
ues fluctuate due to multipath propagation, body shadowing,
and hardware variability. This instability makes it a compelling
benchmark for contrasting the two paradigms. To represent the
ML spectrum, we employ KNN as a distance-based classifier,
and XGBoost as a supervised gradient-boosted tree model. On
the LLM side, we evaluate Claude Opus 4.6 and Gemini 3.1
Pro as zero-shot reasoners that receive raw RSSI data without
any training examples. The main contributions of this work
are:
1) A systematic evaluation framework comparing trained
ML against zero-shot LLM classifiers for BLE RSSI
zone-level localization.
2) Three scenarios testing body orientation, boundary tran
sition, and dynamic trajectory under inherently unstable
BLE signal conditions.
3) Robustness analysis under noise injection and anchor
failure, revealing superior LLM resilience to hardware
degradation.
4) Analysis of LLM reasoning traces, providing insight
into how zero-shot reasoning succeeds on structured
localization data.
A. Related Work
BLE RSSI fingerprinting relies primarily on KNN [3] and
gradient boosting [4], which produce strong results on static
tabular data but struggle with temporal dependencies [5], [6].
On the LLM side, Jin et al. [7] proposed Time-LLM, and
Gruver et al. [8] demonstrated zero-shot time-series forecast
ing, yet neither applied LLMs to RSSI classification. Broader
surveys cover both traditional and emerging indoor localization
methods [1], [2], [9]. Early RSSI fingerprinting work by Bahl
and Padmanabhan [10] established KNN as the dominant
classifier, later extended to BLE by Faragher and Harle [11].
Kalman filtering has been shown to reduce positioning error
by up to 80% [12], and deep learning architectures have
recently been explored [13]. However, all these approaches
remain limited in modeling complex RF multipath effects [14].
None of this prior work has applied LLMs as classifiers for
continuous BLE RSSI streams.
II. METHODS
A. Data Collection
Each case comprises 48 episodes. An episode is one con
tinuous recording under fixed experimental conditions. Each
episode lasts approximately 5 seconds. The dataset is split
into 13 training and 35 test episodes by a single random
draw without replacement; the same split is used for all
models. Raw RSSI values from the four anchors form a
4-dimensional feature vector at each time step, recorded
as (timestamp), (r1), (r2), (r3), (r4) where
(r1)--(r4) are the RSSI readings (in dBm) from an
chors 1–4 and (timestamp) is the Unix epoch in mil
liseconds. Missing RSSI readings were forward-filled when
possible; otherwise the most recent valid value was retained.
No smoothing or filtering was applied to preserve the raw
signal dynamics.
B. Hardware and Environment
The experiment uses a single room divided into four zones
(Zone A, B, C, D), each approximately 4×4 m, separated
by cloth partitions as shown in Fig. 3. Hardware components
(Fig. 2) include:
• Anchors: Four ESP32-S3 BLE nodes (Fig. 2a), one per
zone center, at 0.7 m height, communicating via MQTT
over Wi-Fi.
• Tag: One M5StickC Plus2 (Fig. 2b) BLE beacon, at
tached to the participant’s waist at 0.7 m (Fig. 2c),
broadcasting at 5 Hz (200 ms interval).
• Server: Python-based data collection server with syn
chronized video recording for ground truth labeling.
C. Classification Models
KNN (k=5, Euclidean distance): A distance-based
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
used defaults in RSSI fingerprinting studies.
Claude Opus 4.6 and Gemini 3.1 Pro: Both LLMs receive
the raw RSSI time series from test episodes via a task
specific prompt (Section II-D). No training data or labels
are provided—predictions are entirely zero-shot. Each LLM
receives the identical prompt and test CSV. This design re
f
lects typical RSSI fingerprinting pipelines where ML models
operate on engineered statistical features, while LLMs process
raw sequences.
D. LLM Prompt Design
To ensure reproducibility and minimize variance in gen
erated outputs, prompt formulations for both LLMs (Claude
Opus 4.6 and Gemini 3.1 Pro) were tightly controlled. The
design enforces strict zero-shot inference: models are provided
the task description, class definitions, and input data format
without any few-shot examples, domain-specific engineering
hints, or physical layout descriptions (e.g., anchor coordi
nates).
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
with two columns: ‘id’ and ‘predicted’.”
40
Case 1: Body Orientation (Near, Facing In)
Case 2: Boundary Transition
Case 3: Trajectory Sequence
RSSI (dBm)
50
60
70
80
12:38:09
12:38:10
Time
12:38:11
12:38:13
15:09:04
15:09:06
15:09:08
Time
15:09:10
A1 (Zone A)
A2 (Zone B)
A3 (Zone C)
A4 (Zone D)
13:04:18
13:04:23
13:04:28
Time
Fig. 1. Example continuous RSSI time-series for Case 1 (Left), Case 2 (Center), and Case 3 (Right).
13:04:34
13:04:39
attenuation [6]. Conditions: 4 directions × 2 distances × 2
classes = 16, 3 replicates (48 episodes).
Case 2: Boundary Transition Detection. The participant
stands on demarcation lines between Zone D and adjacent
zones. Binary task: In Zone D (0) or Out (1). Conditions: 2
boundaries × 2 classes × 12 replicates = 48 episodes. This
task is inherently difficult: cloth partitions provide negligible
RF attenuation at 2.4 GHz.
Fig. 2. Hardware: (a) ESP32-S3 anchor, (b) M5StickC Plus2 tag, (c) tag on
waist.
Zone A
Zone B
1 2
Zone C
Zone D
3 4
Dashed lines = cloth partitions
Fig. 3. Floor plan with BLE anchor positions (numbered 1–4).
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
injected Gaussian noise or anchor failures.
E. Experimental Design
Case 1: Body Orientation Detection. The participant
stands stationary in Zone D, facing four cardinal directions (N,
S, E, W) at two distance ranges from the anchor (≤1 m and
>1 m). Each combination produces two classes: Facing in (0)
and Facing out (1)—body blocks the direct path, causing RSSI
Case 3: Multi-Zone Trajectory. The participant walks
through all four zones in randomized sequences, pausing 5–6 s
in each zone’s center. Task: predict exact ordered sequence of
zone IDs. LLMs receive the full time series; ML models use
four contiguous segments.
III. RESULTS AND DISCUSSION
A. Classification Performance
Table I summarizes performance across all three cases (35
test episodes each). Tables II and III present the confusion
matrices for the binary classification tasks.
TABLE I
CLASSIFICATION PERFORMANCE (%, n=35)
Model Acc. Prec. Rec. F1
Case 1: Body Orientation (Facing In/Out)
KNN 88.57 84.21 94.12 88.89
XGBoost 97.14 100.00 94.12 96.97
Claude Opus 4.6 97.14 100.00 94.12 96.97
Gemini 3.1 Pro 94.29 94.12 94.12 94.12
Case 2: Boundary Transition (In/Out Zone D)
KNN 68.57 68.75 64.71 66.67
XGBoost 57.14 54.55 70.59 61.54
Claude Opus 4.6 62.86 64.29 52.94 58.06
Gemini 3.1 Pro 34.29 36.36 47.06 41.03
Case 3: Trajectory (Exact Seq. / Per-Position)
KNN 88.57 Per-pos:97.14
XGBoost 48.57 Per-pos: 85.00
Claude Opus 4.6 94.29 Per-pos: 98.57
Gemini 3.1 Pro 97.14 Per-pos: 98.57
B. Case-by-Case Analysis
Case 1 — Body Orientation. All four models exceed
88% accuracy, confirming a readily detectable RSSI signature
from body shadowing. Body orientation introduces body
shadowing, which significantly attenuates RSSI signals. This
produces consistent patterns that both ML and LLM mod
els can capture reliably. Both Claude and XGBoost achieve
TABLE II
CONFUSION MATRIX — CASE 1 (n=35)
KNN XGBoost Claude Gemini
P0 P1 P0 P1 P0 P1 P0 P1
A0 TN=15 FP=3 TN=18 FP=0 TN=18 FP=0 TN=17 FP=1
A1 FN=1 TP=16 FN=1 TP=16 FN=1 TP=16 FN=1 TP=16
TABLE III
CONFUSION MATRIX — CASE 2 (n=35)
KNN XGBoost Claude Gemini
P0 P1 P0 P1 P0 P1 P0 P1
A0 TN=13 FP=5 TN=8 FP=10 TN=13 FP=5 TN=4 FP=14
A1 FN=6 TP=11 FN=5 TP=12 FN=8 TP=9 FN=9 TP=8
97.14% (34/35), each with TN=18, FP=0, FN=1, TP=16. KNN
produces 3 FP due to RSSI overlap at boundary distances.
Gemini achieves 94.29% with a balanced error profile (FP=1,
FN=1). The consistent RSSI level-shift over a 5-second win
dow makes this task well-suited to both gradient boosting and
zero-shot reasoning.
Case 2 — Boundary Transition. This proves the most
challenging scenario (Table III). KNN leads at 68.57%, fol
lowed by Claude (62.86%), XGBoost (57.14%), and Gem
ini (34.29%—below chance). The difficulty is fundamentally
physical: with only one anchor per zone [14], the system lacks
spatial redundancy to resolve boundary positions. Boundary
transitions produce highly ambiguous RSSI patterns due to
minimal RF attenuation through cloth partitions, explaining
the reduced performance across all models. Furthermore, body
shadowing at boundaries affects all four anchor readings
simultaneously [6], creating overlapping RSSI distributions
that no classifier can cleanly separate.
KNN outperforms XGBoost specifically because of its non
parametric, instance-based nature [15]: it stores all training
instances and adapts flexibly to local RSSI decision surfaces
without assuming a global structure. With the one-anchor
per-zone layout, boundary RSSI distributions are irregularly
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
Case 3 — Multi-Zone Trajectory. Gemini achieves
97.14% (34/35) and Claude reaches 94.29% (33/35), both
substantially outperforming KNN (88.57%) and XGBoost
(48.57%). Trajectory prediction benefits from temporal struc
ture in the signal sequence, which likely explains the strong
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
C. Cross-Case Analysis
A consistent pattern emerges across the three scenarios:
LLMs excel when signal patterns are physically distinctive
or when temporal reasoning is required (Cases 1 and 3),
whereas trained ML models prove more robust when sig
nal boundaries are ambiguous and require learned statisti
cal decision surfaces (Case 2) [5]. This dichotomy aligns
with theoretical expectations: KNN and XGBoost optimize
discriminative boundaries from labeled examples [15], [16],
whereas LLMs perform inductive reasoning from the full
context window without any training signal [17]. Between
the two LLMs, Claude demonstrates stronger performance on
binary classification tasks where a single boundary decision
must be made, while Gemini excels at sequential reasoning
requiring multi-step ordering. The nearly 29-percentage-point
gap between the best performance in Case 2 (KNN: 68.57%)
and Cases 1/3 (Claude/Gemini: ≥94%) underscores that the
physical characteristics of zone boundaries—rather than model
architecture—are the dominant factor governing classification
difficulty [5], [6].
KNN XGBoost Claude Gemini
Accuracy (%)
100
75
50
25
0
Case 3
Case 2
Case 1
Fig. 4. Accuracy comparison across three cases (0–100%).
D. LLM Reasoning Process Analysis
A distinctive advantage of LLM-based classifiers lies in
their ability to reason over the entire input dataset in a single
inference pass. Traditional ML models are stateless: KNN
and XGBoost apply a fixed function to each feature vector
independently [15], [16]. LLMs operate over a full context
window encompassing the entire test set, enabling them to
identify recurring patterns, detect outliers, and leverage cross
episode consistency [17].
Chain-of-thought (CoT) reasoning [18] traces reveal that
LLMs spontaneously execute structured analytical workflows.
A Case 1 trace demonstrates: (1) feature identification (“ob
served varying r4 mean values”), (2) pattern discovery (“two
cluster division”), (3) cluster validation, and (4) self-correction
(“found discrepancy on IDs 11 and 18”)—a spontaneous
execution of the analytical pipeline [18]. Case 3 traces show
even more sophisticated behavior—the LLM evaluates multi
ple segmentation strategies, constructs state transition models,
and proactively verifies edge cases.
The effectiveness stems from three factors: (i) BLE RSSI
exhibits physically grounded patterns—stronger signal implies
TABLE V
proximity [6]; (ii) the data is compact, fitting within the
model’s working memory; and (iii) the task maps to com
parative reasoning across anchors [7], [8].
Fig. 5. Ground truth video frame showing participant position.
E. Robustness Under Signal Degradation
Two offline experiments evaluate robustness: (1) Gaussian
noise injection (σ = 2–12 dBm) added to each RSSI sample,
and (2) simulated anchor failure by replacing 1 or 2 anchors
with −100 dBm. Gaussian noise with standard deviation of
σ dBm was injected to simulate environmental fluctuations.
Anchor failure was simulated by removing RSSI readings from
selected anchors. The same prompts from Section II-D are
reused without modification.
1) Gaussian Noise Injection: Table IV shows accuracy
under increasing noise. ML fluctuations (e.g., KNN Case 1
rising at σ=2) are expected with stochastic noise and n=35.
TABLE IV
ACCURACY UNDER GAUSSIAN NOISE (%)
Case σ KNN XGB Claude Gemini
0 88.57 97.14 97.14 94.29
2 91.43 97.14 88.57 91.43
4 88.57 100.00 88.57 91.43
1 6 91.43 97.14 85.71 88.57
8 85.71 94.29 85.71 82.86
10 94.29 94.29 88.57 85.71
12 85.71 82.86 85.71 77.14
0 68.57 57.14 62.86 34.29
2 68.57 54.29 60.00 31.43
4 71.43 62.86 57.14 34.29
2 6 60.00 62.86 54.29 28.57
8 60.00 65.71 51.43 31.43
10 60.00 51.43 48.57 25.71
12 62.86 62.86 45.71 25.71
0 57.14 45.71 94.29 97.14
2 60.00 34.29 91.43 97.14
4 62.86 34.29 88.57 97.14
3 6 54.29 37.14 85.71 91.43
8 62.86 28.57 82.86 91.43
10 54.29 40.00 80.00 85.71
12 51.43 22.86 74.29 82.86
2) Anchor Failure: Table V shows accuracy when 1 or 2
anchors fail. ML results are averaged over all possible anchor
combinations; LLM results are from a single representative
combination.
3) Robustness Analysis: The robustness results reveal a
distinctive advantage of LLM-based classifiers under hardware
degradation, summarized as follows.
Noise resilience. In Case 1, all models maintain >77%
accuracy at σ=12 dBm, confirming that the body-shadowing
signal margin exceeds typical indoor noise levels [14]. Claude
degrades 12 pp (97.14→85.71%), Gemini 17 pp, while ML
ACCURACY UNDER ANCHOR FAILURE (%)
Case Cond. KNN XGB Claude Gemini
All 4 88.57 97.14 97.14 94.29
1 1lost 75.71 84.29 94.29 85.71
2lost 56.67 70.95 91.43 74.29
All 4 68.57 57.14 62.86 34.29
2 1lost 51.43 65.71 54.29 31.43
2lost 50.00 65.71 48.57 28.57
All 4 57.14 45.71 94.29 97.14
3 1lost 15.00 24.29 80.00 85.71
2lost 4.29 9.05 62.86 68.57
models show non-monotonic fluctuations due to stochastic ef
fects with n=35. In Case 3, LLMs demonstrate superior noise
resilience: at σ=12, Claude (74.29%) and Gemini (82.86%)
both outperform the ML baselines at σ=0 (KNN: 57.14%,
XGBoost: 45.71%), indicating that temporal reasoning over
the full time series provides inherent noise tolerance that
per-sample classification cannot achieve [14]. Case 2 shows
minimal additional degradation from noise across all models,
confirming that the boundary-task difficulty is dominated by
the physical ambiguity of cloth partitions rather than signal
noise [5].
Anchor failure. In Case 1, Claude retains 91.43% accu
racy even with 2 anchors lost, while KNN drops to 56.67%
(−32 pp) and XGBoost to 70.95% (−26 pp). This occurs
because ML models’ fixed 4D feature space is fundamentally
disrupted when dimensions are replaced with −100 dBm,
whereas the LLM processes the time series as text and can
adaptively ignore anomalous channels [17]. This behavior
parallels the LLM context-filtering capability described by
Gruver et al. [8]—the model down-weights obviously cor
rupted channels without being explicitly instructed to do so.
Case 3 reveals the largest ML–LLM gap under degradation:
with 2 anchors lost, KNN drops to 4.29% (−53 pp), XGBoost
to 9.05% (−37 pp), while Claude retains 62.86% (−31 pp)
and Gemini 68.57% (−31 pp). The 8D segment features used
by ML become meaningless when half the anchors report
−100 dBm, as the mean and standard deviation statistics no
longer represent valid spatial information [14].
F. Practical Implications
MLmodels offer sub-10 ms edge inference at zero marginal
cost, while each LLM API call requires 1–3 minutes. This
asymmetry suggests a hybrid architecture: ML for real-time
zone tracking, with LLMs invoked selectively for offline
trajectory reconstruction or when anchor degradation reduces
ML accuracy below acceptable thresholds. A promising ap
plication is LLM-based RSSI analysis as a privacy-preserving
alternative to CCTV—detecting abnormal behavior patterns
(e.g., prolonged immobility suggesting a fall) without video
data, particularly suitable for healthcare environments.
G. Limitations
Sample size. Each case uses 35 test episodes (resolution
2.86 pp). A 95% binomial confidence interval at 85% accuracy
spans ±12 pp, so model differences below this threshold
should not be considered significant. Although the dataset size
Accuracy (%)
Accuracy (%)
Accuracy (%)
100
95
90
85
80
75
0
2
4
6
8
10
Noise σ (dBm)
12
Fig. 6. Case 1 noise degradation (Y-axis 75–100%).
is limited, each episode contains a continuous RSSI time series
with multiple temporal samples, providing sufficient signal
dynamics for classification analysis. Future work will expand
the dataset and evaluate cross-validation strategies. Single en
vironment and participant. Generalization to different room
geometries, construction materials, and body morphologies
remains unevaluated. LLM non-determinism. All reported
LLM results are from a single evaluation run; repeating
prompts may yield different predictions. Cost. Processing 35
episodes costs $0.50–$2.00 per case per model—negligible for
research but potentially significant at scale.
IV. CONCLUSION
This study presents a comparative evaluation of traditional
machine learning algorithms, specifically K-Nearest Neigh
bors and eXtreme Gradient Boosting, against Large Language
Models, namely Claude Opus 4.6 and Gemini 3.1 Pro, for
zero-shot BLE RSSI indoor localization. Experimental results
across a multi-zone layout reveal that Large Language Models
excel in trajectory prediction and body orientation detection,
demonstrating an exceptional capacity for temporal reasoning
and pattern extraction directly from raw numerical sequences.
Conversely, for highly ambiguous boundary transitions where
partitioning materials provide minimal RF attenuation, tra
ditional instance-based machine learning algorithms remain
superior.
Crucially, robustness evaluations confirm that LLMs possess
a marked advantage under hardware degradation, maintaining
usable accuracy even when half the anchor nodes fail—a
scenario that critically disrupted standard ML models. From
this study, we foresee that while sub-10 ms ML inference is
necessary for real-time tracking at the edge, the integration
of LLMs for offline trajectory analysis, fault-tolerant redun
dancy, and zero-shot deployment will make increasingly vital
contributions to robust indoor localization systems.
Future work will expand environments, integrate few-shot
learning for ambiguous boundaries, and explore compact lan
guage models to bridge the inference latency gap for real-time
applications.
ACKNOWLEDGMENT
The authors thank the Thammasat School of Engineering
and the CED-Square Innovation Center for providing the
research facilities, equipment, and support that made this work
possible.
100
75
50
25
0
0
2
4
6
8
10
Noise σ (dBm)
12
Fig. 7. Case 2 noise degradation.
100
75
50
25
0
0
2
4
6
8
10
Noise σ (dBm)
12
Fig. 8. Case 3 noise degradation.
■ KNN ▲XGBoost ◦ Claude ♦ Gemini
REFERENCES
[1] A. Yassin et al., “Recent Advances in Indoor Localization: A Survey on
Theoretical Approaches and Applications,” IEEE Commun. Surv. Tuts.,
vol. 19, no. 2, pp. 1327–1346, 2017.
[2] P. Spachos and K. N. Plataniotis, “BLE Beacons for Indoor Positioning
at an Interactive IoT-Based Smart Museum,” IEEE Syst. J., vol. 14, no. 3,
pp. 3483–3493, 2020.
[3] S. He and S.-H. G. Chan, “Wi-Fi Fingerprint-Based Indoor Positioning:
Recent Advances and Comparisons,” IEEE Commun. Surv. Tuts., vol. 18,
no. 1, pp. 466–490, 2016.
[4] Y. Li et al., “Two-Step XGBoost Model for Indoor Localization Using
RSSI,” IEEE Access, vol. 8, pp. 47528–47541, 2020.
[5] A. F. Syafri, S. Yuliana, and R. Arifuddin, “Comparative Analysis of
Machine Learning Algorithms for BLE RSSI-Based Indoor Localiza
tion,” Proc. IEEE Int. Conf. Commun., Netw. Satell. (COMNETSAT),
pp. 142–148, 2023.
[6] D. Giovanelli et al., “Bluetooth-Based Indoor Positioning Through
Angle of Arrival Estimation: Body Shadowing Compensation and Per
formance Analysis,” IEEE Trans. Instrum. Meas., vol. 70, pp. 1–12,
2021.
[7] M. Jin et al., “Time-LLM: Time Series Forecasting by Reprogram
ming Large Language Models,” Proc. Int. Conf. Learn. Representations
(ICLR), 2024.
[8] N. Gruver et al., “Large Language Models Are Zero-Shot Time Series
Forecasters,” Proc. Adv. Neural Inf. Process. Syst. (NeurIPS), vol. 36,
2023.
[9] F. Zafari, A. Gkelias, and K. K. Leung, “A Survey of Indoor Localization
Systems and Technologies,” IEEE Commun. Surv. Tuts., vol. 21, no. 3,
pp. 2550–2599, 2019.
[10] R. Faragher and R. Harle, “Location Fingerprinting with Bluetooth
Low Energy Beacons,” IEEE J. Sel. Areas Commun., vol. 33, no. 11,
pp. 2418–2428, 2015.
[11] P. Bahl and V. N. Padmanabhan, “RADAR: An In-Building RF-Based
User Location and Tracking System,” Proc. IEEE INFOCOM, pp. 775
784, 2000.
[12] K. S. Ahn and O. S. Shin, “Deep Learning-Based Indoor Localization
Using Wi-Fi RSSI,” IEEE Access, vol. 9, pp. 141852–141865, 2021.
[13] T. S. Rappaport, Wireless Communications: Principles and Practice, 2nd
ed. Prentice Hall, 2001.
[14] K. Kaemarungsi and P. Krishnamurthy, “Analysis of WLAN’s Received
Signal Strength Indication for Indoor Location Fingerprinting,” Perva
sive Mobile Comput., vol. 8, no. 2, pp. 292–316, 2012.
[15] T. M. Cover and P. E. Hart, “Nearest Neighbor Pattern Classification,”
IEEE Trans. Inf. Theory, vol. 13, no. 1, pp. 21–27, 1967.
[16] T. Chen and C. Guestrin, “XGBoost: A Scalable Tree Boosting System,”
Proc. ACM SIGKDD Int. Conf. Knowl. Discov. Data Min., pp. 785–794,
2016.
[17] T. Zhou et al., “One Fits All: Power General Time Series Analysis by
Pretrained LM,” Proc. Adv. Neural Inf. Process. Syst. (NeurIPS), vol. 36,
2023.
[18] J. Wei et al., “Chain-of-Thought Prompting Elicits Reasoning in Large
Language Models,” Proc. Adv. Neural Inf. Process. Syst. (NeurIPS),
vol. 35, 2022.