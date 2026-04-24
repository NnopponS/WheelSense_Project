---
name: thesis-chapter4-results-discussion
description: Guides drafting Chapter 4 results and discussion in formal Thai academic style with outcome-first reporting, objective linkage, interpretation discipline, and threat-to-validity checks for thesis quality.
---

# WheelSense Chapter 4 Skill

## Scope

- Main file: `latex/content/chapters/chapter4.tex`

## Recommended flow

1. Deployment/setup summary.
2. Component-level test results.
3. End-to-end integration results.
4. Field/real-environment observations.
5. Discussion and implications.

## Writing rules

- Report evidence first, then interpretation.
- Tie each major finding to objectives or research questions.
- Reference supporting figures/tables near each key claim.
- Avoid overclaiming beyond prototype evidence.

## Threat-to-validity prompts

- Internal: confounders and measurement quality.
- External: generalizability to other environments/users.
- Construct: metric definitions vs research intent.
- Conclusion: sample size and uncertainty limitations.

## Quality checklist

- Terms and units match Chapter 3.
- Claims map to observable results.
- Limitation statements are explicit and realistic.
---
name: thesis-chapter4-results-discussion
description: >-
  Guides drafting and revising Thai academic Chapter 4 (ผลการดำเนินงานและอภิปรายผล)
  for the WheelSense thesis: result order, figures/tables, hypothesis/objective links,
  discussion depth, threats to validity, and cross-chapter consistency. Use when writing
  or editing results/discussion in latex/content/chapters/chapter4.tex, or when the user
  mentions Chapter 4, ผลการดำเนินงาน, อภิปรายผล, or thesis results.
---

# Thesis Chapter 4 — Results and Discussion (WheelSense)

**Primary source file:** [`latex/content/chapters/chapter4.tex`](latex/content/chapters/chapter4.tex) (included from [`latex/thesis.tex`](latex/thesis.tex)).

**Language and style:** Formal academic Thai; keep standard English technical terms where they aid precision (e.g. latency, throughput, BLE, MQTT, Mesh). Match the thesis voice used in Chapters 1–3.

---

## Result reporting sequence

Follow a **deployment → component tests → integration → field** arc unless the committee template dictates otherwise. For this project, align section flow with the existing chapter skeleton:

1. **Setup / deployment** — What was installed where (wheel module, nodes/gateway, server stack), and that baseline connectivity worked.
2. **Targeted (component) results** — Hardware tests, then software/service tests; each subsection states what was measured and the outcome in plain terms.
3. **Integration (End-to-End)** — Cross-layer behavior; use a short enumerated list for multi-issue summaries (latency, load, accuracy under stress, recovery), each tied to observable evidence.
4. **Real-environment evaluation** — Indoor movement scenarios, obstacles/interference; behavior/AI interpretation if applicable, with expert or human-in-the-loop evaluation when relevant.
5. **Discussion** — Synthesis: what the prototype achieved vs limitations; bridge to architecture implications (e.g. gateway load, multi-hop paths).

**Ordering rules**

- Present **most objective measurements before interpretation** (numbers, pass/fail, observed phenomena) within each subsection.
- Move **causal claims** (“เพราะ…”, “ส่งผลให้…”) to Discussion unless a short mechanism is needed immediately after a table for readability.
- Use **the same metric names and units** as Chapter 3 (methodology) and the figure/table captions.

---

## Table and figure interpretation

For every `\ref{...}` to a table or figure in Chapter 4:

- **State the claim in one sentence** before the reference (“จากตารางที่ X พบว่า…”).
- **Report direction and magnitude** where applicable (not only “ดีขึ้น”); if the chapter uses ranges or summaries, keep them consistent with the asset file.
- **Acknowledge limits visible in the graphic** (e.g. missing bars, overlapping CIs, sparse samples) in Discussion or a footnote, not only in passing.
- **Do not introduce new metrics** in prose that are absent from the table/figure unless you add the definition or point to where it is defined (Chapter 3).

If a result is **qualitative** (e.g. stability observations), still anchor it: scenario, duration, and what “stable” means in operational terms.

---

## Linking to hypotheses and objectives

Before adding or rewriting paragraphs, pull the **numbered objectives / hypotheses / RQs** from Chapter 1 (and any evaluation criteria from Chapter 3).

**Per major result block, include:**

- **Map**: Which objective(s)/hypothesis/RQ the evidence addresses — use the same numbering as Chapter 1.
- **Direction**: Supported / partially supported / not supported / inconclusive — phrase conservatively if \(n\) is small or conditions are narrow.
- **Evidence pointer**: Figure/table/section where the reader can verify the claim.

**Avoid**

- Claiming full objective satisfaction from a single subsystem test unless Chapter 3 scoped the claim that way.
- New objectives appearing only in Chapter 4.

---

## Discussion depth

Structure **อภิปรายผล** as synthesis, not a second results dump:

- **Paragraph 1 — Answer in plain language:** What was demonstrated end-to-end and under what realistic constraints.
- **Paragraph 2 — Interpretation:** Why the main bottlenecks or errors arise (network path, hop count, broker path, sensor fusion limits), without overclaiming causality.
- **Paragraph 3 — Implications:** What this means for a production-oriented architecture (e.g. reducing gateway load, fewer hops for critical streams) and what remains future work.

Keep **parallelism** with limitations already listed in integration testing (e.g. latency, scalability, recovery) so Discussion does not introduce contradictions.

---

## Threats to validity — paragraph prompts

Draft short subsections or paragraphs using these **prompts** (adapt headings to faculty rules; keep one threat per paragraph or subsubsection):

**Internal validity**

- *Confounds:* Could observed latency or accuracy changes be explained by concurrent load, time of day, or firmware version rather than the factor named in the hypothesis?
- *Measurement:* Were ground truth labels, timestamps, or positions obtained with sufficient precision for the claim?

**External validity**

- *Setting:* To what extent do results from the chosen building/layout/general traffic generalize to other floors, densities, or RF conditions?
- *Participants / devices:* Are wheelchair units, node placements, or user tasks representative of the intended deployment?

**Construct validity**

- Do operational definitions (e.g. “recovery time”, “correct position”, “abnormal stop”) match what Chapter 3 promised to measure?

**Conclusion validity (statistical / sampling)**

- Sample size, repetitions, and whether reported differences are descriptive only vs inferential; avoid over-interpreting noise.

**Use in text:** End with **mitigation** (what was done) or **honest residual risk** (what remains uncontrolled).

---

## Consistency checks

Run this checklist when editing Chapter 4 (and when adding figures/tables cited there):

**Cross-chapter**

- [ ] Terminology for system layers (XIAO, node, gateway, broker, dashboard) matches Chapters 1–3.
- [ ] Metrics (latency, throughput, accuracy, recovery) defined in Chapter 3 appear with compatible units and meanings.
- [ ] Limitations stated in Chapter 4 do not contradict Chapter 5 (conclusions) or the abstract; if refined, update downstream chapters.

**Within Chapter 4**

- [ ] Section order matches **Result reporting sequence** above unless explicitly reorganized with a bridging sentence.
- [ ] Every strong claim has a nearby pointer to evidence (table/figure/test description).
- [ ] Enumerated lists in integration results remain parallel (same grammatical pattern; avoid mixed abstraction levels).
- [ ] Discussion does not restate the entire results section verbatim; it adds **why** and **so what**.

**LaTeX / assets**

- [ ] Labels and `\ref` resolve; figure files live under [`latex/assets/figures/`](latex/assets/figures/) per project conventions.
- [ ] Captions are self-contained; abbreviations expanded on first use in the chapter or in caption.

---

## Quick agent workflow

1. Read [`latex/content/chapters/chapter4.tex`](latex/content/chapters/chapter4.tex) and the relevant methodology slice in Chapter 3.
2. Extract objectives/RQs from Chapter 1; build a small mapping table (objective → evidence in Ch.4).
3. Draft or revise text following **sequence → evidence → link → discussion → threats** as appropriate.
4. Run **Consistency checks** before finishing.
