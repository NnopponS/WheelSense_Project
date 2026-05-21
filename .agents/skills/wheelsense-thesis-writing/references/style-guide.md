# WheelSense Thai Thesis Style Guide

Use this reference when drafting or revising Thai prose in `Thesis/latex`. The goal is not to make the text maximally polished; it is to keep it believable as the same author's engineering thesis.

## Global Voice

The existing voice is formal Thai academic prose with an engineering-project center. It explains what was built, why it matters in a care setting, how the data flows, what was measured, and what remains limited. It is not a sales page and not a medical claim.

Preferred sentence rhythm:

- Start with context or evidence: "จาก...", "การทดสอบ...", "ผลการประเมิน...", "ในระดับ...", "สำหรับ..."
- Use mechanism clauses with "โดย..." and "ภายใต้...".
- Use "ซึ่ง..." to add consequence or reason inside the same paragraph.
- End with bounded meaning: "เพียงพอสำหรับ...", "สะท้อนว่า...", "อาจส่งผล...", "ควรปรับปรุง..."

Avoid:

- Over-polished AI transitions in every sentence.
- Generic promises such as "ช่วยเพิ่มประสิทธิภาพอย่างมาก" without a metric.
- Emotional storytelling, marketing adjectives, or policy-speech phrasing.
- Unsupported certainty: "ยืนยันว่า", "พิสูจน์ว่า", "รับประกัน", "ใช้งานได้จริงเต็มรูปแบบ".

## Natural Thai Writing Filter

Use these rules as a final pass before returning or committing Thai thesis prose. This is adapted from a casual human-writing prompt, but tuned for a Thai engineering thesis: write like a real student wrote it, not like a chatbot, while keeping academic formality where the thesis needs it.

### Language Rules

- Use normal Thai words. Do not choose difficult words just to sound academic.
- Keep each sentence readable. If one sentence carries too many ideas, split it.
- Say the point directly. Remove filler before the main claim.
- Use natural connectors such as "จากนั้น", "อย่างไรก็ตาม", "นอกจากนี้", "ในส่วนนี้", "ดังนั้น", and "จึง".
- Do not force a cheerful tone. Thesis writing should be calm, factual, and honest.
- Keep technical terms only when they are useful: `latency`, `BLE`, `RSSI`, `MQTT`, `dashboard`, `API`, `AI`.

### Style Implementation

- Keep grammar human. Prefer clear Thai sentence order over over-complex academic nesting.
- Cut unnecessary adjectives and adverbs. If a word does not add evidence, remove it.
- Use specific examples from the project instead of abstract claims. Mention the subsystem, metric, figure, table, or test condition.
- Be honest about limits. If the evidence is prototype-level, say prototype-level.
- Avoid making every paragraph sound perfectly balanced. A real report can be direct and practical.
- Use the nearby chapter voice. Chapter 2 may be more formal and citation-heavy; Chapter 4 should be shorter and evidence-first.

### Avoid These AI Giveaways & How to Rewrite Them

Below is a direct comparison of typical AI-generated academic prose versus authentic 4th-year Thai engineering senior thesis phrasing, compiled directly from recent Thammasat University (TU) EE/CPE senior project reports:

| AI-Generated Fluff (Don't Write This) | Authentic 4th-Year Student Phrasing (Write This) | Why? |
| :--- | :--- | :--- |
| **"ปลดล็อกศักยภาพสูงสุดของระบบด้วย..."** | "ปรับปรุงประสิทธิภาพของระบบโดย..." | เน้นกลไกทางวิศวกรรมจริงแทนคำโฆษณา |
| **"เจาะลึกนวัตกรรมสถาปัตยกรรมสุดล้ำ"** | "รายละเอียดการออกแบบสถาปัตยกรรมต้นแบบ..." | สุภาพ เรียบง่าย เป็นข้อเท็จจริง และจำกัดขอบเขต |
| **"แพลตฟอร์มปฏิวัติวงการเพื่อความปลอดภัยขั้นสูง"** | "ระบบต้นแบบสำหรับสนับสนุนการเฝ้าระวังความปลอดภัย" | เขียนคำกล่าวอ้างให้ตรงตามหลักฐานที่เป็นต้นแบบ |
| **"สามารถทำงานได้อย่างเป็นระบบและไร้รอยต่อ"** | "สามารถรับส่งข้อมูลและจัดเก็บได้อย่างต่อเนื่อง" | ระบุฟังก์ชันทางเทคนิคชัดเจน เช่น อัตราการไหลข้อมูล |
| **"ยกระดับการเฝ้าระวังอย่างก้าวกระโดดในทุกมิติ"** | "ช่วยเพิ่มความครอบคลุมในการติดตามระดับโซน" | เน้นข้อมูลพารามิเตอร์เชิงพื้นที่และประสิทธิภาพที่เป็นรูปธรรม |
| **"ใช้ประโยชน์จากโมเดล Gemma เพื่อพลิกโฉม"** | "ประมวลผลผ่านโมเดลภาษาขนาดใหญ่ Gemma สำหรับ..." | ใช้คำว่า "ประมวลผล" หรือ "วิเคราะห์" แทนคำฟุ่มเฟือย |
| **"ยืนยันว่าพร้อมใช้งานจริงในทุกสถานการณ์แบบเรียลไทม์"** | "ทำงานได้ภายใต้สภาวะทดสอบในระดับต้นแบบ" | ไม่โอ้อวดเกินความเป็นจริง ยอมรับข้อจำกัดการทดลอง |

### Natural Sentence Structures & Transition Patterns

Instead of repeating typical chatbot-style bullet points, use structural paragraphs that show steps, mechanisms, or measurements:

* **การเปิดหัวข้อผลลัพธ์ (For Chapter 4)**: 
  * *ดี*: "ทำการทดสอบส่วนนี้เป็นการตรวจสอบการใช้งาน... โดยทำการวัดซ้ำจำนวน 5 ครั้ง เพื่อหาค่าเฉลี่ย..."
  * *หลีกเลี่ยง*: "เราภูมิใจเสนอผลการทดสอบอันยอดเยี่ยมของอุปกรณ์ที่ทำงานได้ดีมากดังต่อไปนี้..."
* **การยอมรับความคลาดเคลื่อน (Academic Honesty)**:
  * *ดี*: "ผลการทดสอบแสดงว่าระบบยังพบข้อผิดพลาด มีความคลาดเคลื่อนในการส่งข้อมูล... แต่อยู่ในเกณฑ์ที่ยอมรับได้ (<5%)"
  * *หลีกเลี่ยง*: "ระบบมีประสิทธิภาพสมบูรณ์แบบปราศจากข้อผิดพลาดใดๆ ทั้งสิ้น"
* **การสรุปผลการทำงาน (For Chapter 5)**:
  * *ดี*: "การปรับปรุงที่แนะนำคือการทำตัวกรองสัญญาณคาลมาน (Kalman filter) เพื่อลดสัญญาณรบกวนของค่า RSSI ในอนาคต..."
  * *หลีกเลี่ยง*: "ดังนั้นระบบนี้จึงเป็นคำตอบสุดท้ายสำหรับทุกปัญหาของผู้สูงอายุทุกคน"

### Final Check

Before finishing, check that the text:

- Sounds like something a Thai engineering student could actually write.
- Uses normal words and direct structure.
- Does not sound like marketing copy.
- Does not oversell WheelSense beyond the evidence.
- Gets to the point quickly.
- Still fits the chapter role and LaTeX/citation rules.

Safer claim verbs:

| Use | Avoid |
|---|---|
| สะท้อนว่า | พิสูจน์ว่า |
| บ่งชี้ว่า | ยืนยันอย่างชัดเจนว่า |
| แสดงให้เห็นในระดับต้นแบบ | พร้อมใช้งานจริง |
| สนับสนุนการเฝ้าระวังเบื้องต้น | ใช้แทนการวินิจฉัย |
| อาจส่งผลต่อ | ทำให้ล้มเหลวโดยตรง |
| ควรพัฒนาต่อยอด | จำเป็นต้องเปลี่ยนทั้งหมด |

## Core Terms

Use these terms consistently:

- `โครงงานนี้` for project-level claims, especially frontmatter and Chapter 1.
- `งานวิจัยนี้` when discussing evaluation, findings, and limitations.
- `ระบบต้นแบบ WheelSense` for the platform as built.
- `ผู้ใช้เก้าอี้รถเข็น`, `ผู้สูงอายุ`, `ผู้พักอาศัย`, `ผู้ดูแล`, `พยาบาลหัวหน้า`, `ผู้สังเกตการณ์`.
- `สถานดูแลผู้สูงอายุ`, `บ้านพักคนชราวาสนะเวศม์`.
- `สัญญาณชีพ`, `การเคลื่อนไหว`, `การระบุตำแหน่งภายในอาคาร`, `ข้อมูล telemetry`, `แดชบอร์ดเว็บ`, `แอปพลิเคชันบนอุปกรณ์เคลื่อนที่`.

Keep technical names in English:

`BLE`, `RSSI`, `KNN`, `MQTT`, `JSON`, `REST API`, `WebSocket`, `JWT`, `HttpOnly cookie`, `FastAPI`, `PostgreSQL`, `Docker Compose`, `Raspberry Pi 5`, `Ollama`, `FastMCP`, `MCP`, `Next.js`, `React Native`, `Expo`, `Home Assistant`.

First-use pattern:

```tex
ระบบระบุตำแหน่งภายในอาคาร (Indoor Positioning System: IPS)
การควบคุมการเข้าถึงตามบทบาท (Role-Based Access Control: RBAC)
อัลกอริทึมเพื่อนบ้านใกล้สุด (K-Nearest Neighbors: KNN)
```

## Frontmatter

### Thai Abstract

Use four compact paragraphs:

1. Problem and proposed platform.
2. Architecture and main modules.
3. Evaluation dimensions and field/prototype context.
4. Results meaning, limitations, and next development direction.

Useful openings:

- "โครงงานนี้เสนอแพลตฟอร์ม WheelSense..."
- "สถาปัตยกรรมของระบบประกอบด้วย..."
- "การประเมินระบบต้นแบบดำเนินการ..."
- "ผลการพัฒนาสะท้อนความเป็นไปได้..."

Do not add headings, keywords, title, author, or advisor inside `content/frontmatter/abstract_th.tex`. The wrapper under `front/5_abstract_th.tex` supplies those.

### Acknowledgements

Use collective voice:

- "คณะผู้จัดทำขอขอบพระคุณ..."
- "ที่ได้ให้คำแนะนำ ข้อเสนอแนะ และคำปรึกษาทางวิชาการ..."
- "ซึ่งเป็นประโยชน์อย่างยิ่งต่อ..."

Keep gratitude tied to concrete contributions: academic guidance, technical advice, field information, user perspective, and project support. Avoid personal emotional storytelling.

## Chapter 1: Introduction

Role: establish national/contextual problem, narrow to the study site, introduce WheelSense, then define objectives, scope, benefits, and timeline.

### ที่มาและความสำคัญ

Shape:

1. National or policy context with citation.
2. Wheelchair/elderly care problem at the study site.
3. Concrete field pain points: distributed buildings, analog records, caregiver workload, alert fatigue.
4. Existing technology gap.
5. "โครงงานนี้จึงเสนอ..." response.

Useful transitions:

- "จากสถานการณ์..."
- "ผู้ใช้เก้าอี้รถเข็นและผู้สูงอายุ..."
- "จากการลงพื้นที่สำรวจ..."
- "นอกจากนี้..."
- "แม้ปัจจุบันจะมี...แต่มัก..."
- "โครงงานนี้จึงเสนอ..."

### วัตถุประสงค์

Use `enumerate`. Every item starts with "เพื่อ". Preferred verbs: `พัฒนา`, `บูรณาการ`, `ประเมิน`.

Do not include detailed results here. State what the project intends to build or evaluate.

### ขอบเขตงานวิจัย

Use `enumerate`. Items start directly with bounded verbs, not "เพื่อ".

Include boundary language when relevant:

```tex
โดยไม่มุ่งหมายเป็นการทดลองทางคลินิกหรือการรับรองเป็นเครื่องมือแพทย์
```

### ประโยชน์ที่คาดว่าจะได้รับ

Use inline bold mini-headings, not subsections:

```tex
\textbf{ประโยชน์ต่อสังคม}
\begin{enumerate}
...
\end{enumerate}

\textbf{องค์ความรู้ที่ได้รับ}
\begin{enumerate}
...
\end{enumerate}
```

Social benefit items usually start with "ช่วย...". Knowledge items usually start with "ได้องค์ความรู้...".

## Chapter 2: Literature and Theory

Role: broad theory and related work. Keep WheelSense as motivation or contrast; do not turn Chapter 2 into implementation documentation.

Section shape:

1. Define the domain concept.
2. Explain its mechanism or categories.
3. State benefit/limitation.
4. Connect to elderly-care monitoring.
5. Cite factual claims and standards.

Subsection shape:

1. Compact definition.
2. Technical explanation.
3. Figure, equation, or table if useful.
4. Variable explanation after equations using "เมื่อ ... คือ ...".
5. Application sentence linking back to WheelSense context.

Citation rules:

- Use `\cite{...}` for definitions, standards, factual claims, statistics, and external tool descriptions.
- Verify keys in `Thesis/latex/bib/refs.bib`.
- Do not edit `Thesis/latex/biblatex-ieee.bib` unless the build source changes; the active source is `bib/refs.bib` through `mystyle.sty`.

Avoid:

- Implementation-heavy prose that belongs in Chapter 3.
- Repeating table rows one by one.
- Inventing source keys such as `HomeAssistantDocs` without checking `refs.bib`.

## Chapter 3: Methodology and System Design

Role: concrete WheelSense implementation. Authority comes from architecture, components, protocols, data schemas, topic names, routes, roles, and failure handling.

Section shape:

1. Name the subsystem and why it exists.
2. Explain component choices.
3. Detail data flow and protocol.
4. Explain processing or validation logic.
5. Connect to the next layer.

Subsection shape:

```text
component used -> role in system -> protocol/data path -> processing sequence -> failure handling -> reason for design
```

Good content includes:

- `M5StickC Plus2` reads IMU and sends MQTT telemetry.
- `Polar Verity Sense` sends HR through BLE to smartphone.
- Smartphone acts as gateway where relevant.
- `Node Tsimcam` supports BLE beacon/context photo path; do not turn it into a primary IPS processor unless current code/docs prove that.
- Backend API validates, stores, and serves data by role.
- MCP tools stay under propose-confirm-execute for state-changing actions.

Do not over-cite Chapter 3. Cite only standards or external technologies when needed.

## Chapter 4: Results

Role: evidence-first reporting. Do not turn it into literature review or product marketing.

Use this pattern:

```text
test setup -> table/figure -> direct finding -> technical reason -> concrete improvement
```

Preferred phrases:

- "การทดสอบ..."
- "ผลการทดสอบ..."
- "จากผลการเปรียบเทียบ..."
- "พบว่า..."
- "ข้อผิดพลาดส่วนใหญ่เกิดจาก..."
- "การปรับปรุงที่แนะนำคือ..."

Numbers carry the argument: `n`, `P50`, `P95`, `accuracy`, `macro-F1`, `Precision`, `Recall`, `F1-Score`, `latency`, `success rate`, `SUS`.

After tables, interpret the important pattern only. Do not restate every row.

Avoid:

- "ยืนยันว่าระบบพร้อมใช้งานจริง".
- Broad claims without test conditions.
- Citation-heavy literature comparison.
- Medical diagnosis claims from HR anomaly detection.

## Chapter 5: Discussion, Summary, Limitations, Recommendations

Role: synthesize the results and state bounded meaning.

### Discussion

Use one paragraph per subsystem:

```text
key result -> meaning in care context -> constraint -> contribution or contrast with prior work
```

Use "สอดคล้องกับงานวิจัยก่อนหน้า" only when the cited or established source is actually available. If a sentence compares against prior work, put a verified `\cite{...}` key in that sentence or rewrite it as an internal synthesis such as "เมื่อพิจารณาร่วมกับผลการทดสอบในบทที่ 4...".

### Summary

Compress the main findings by subsystem. Keep metric consistency with Chapter 4.

Watch for typo normalization:

- Use `เก้าอี้รถเข็น`, not `รถเข็ก`.
- Use `อนุญาต`, not `อนุญาติ`.
- Use `หลอดไฟ`, not `หลองไฟ`.

### Limitations

Group by technical limits, evaluation limits, and reliability/internal validity.

Preferred wording:

- "ยังไม่ครอบคลุม..."
- "อาจส่งผลต่อ..."
- "เพียงพอสำหรับระดับต้นแบบ..."
- "ยังไม่มากพอสำหรับการสรุปผลเชิงประชากร..."

### Recommendations

Keep three lanes:

1. Engineering: Kalman filter, BLE+IMU fusion, health check, backup, smaller/quantized LLM, external GPU.
2. Future research: real care sites, longer duration, broader user groups, AI safety evaluation.
3. Practical deployment: start with low-risk workflows, then expand AI-assisted workflow.

Tie every recommendation to a reported limitation or result.

## Appendices

Appendices are evidence support, not manuals.

- Appendix A: repository/source evidence only.
- Appendix B: questionnaire screenshots and instrument evidence.
- Appendix C: field photos and deployment evidence.

Keep appendix prose short, factual, and non-defensive. Use captions that describe the artifact.

## LaTeX Conventions

Labels:

- Chapter labels: `\label{chapter1}`, `\label{chapter2}`.
- Sections: `sec:chN_*`.
- Figures: `fig:chN-*` or existing local pattern.
- Tables: `tab:chN_*` or existing local pattern.
- Appendices: `app:*`.

Figures commonly follow:

```tex
\begin{figure}[htbp]
    \centering
    \includegraphics[width=0.75\textwidth]{...}
    \captionsetup{justification=centering}
    \caption{...}
    \label{fig:...}
\end{figure}
```

Tables commonly use:

```tex
\small
\renewcommand{\arraystretch}{1.15}
```

For Chapter 1 schedule tables, preserve `[H]`, `\textbullet`, and the Thai note.

Do not edit generated files unless explicitly asked:

- `.aux`, `.bbl`, `.bcf`, `.blg`, `.lof`, `.log`, `.lot`, `.out`, `.run.xml`, `.toc`, `.pdf`.

## Quality Gate Before Returning

Check:

1. The paragraph sounds like the target chapter, not a generic thesis.
2. Every factual claim has either current thesis evidence, repo evidence, or a real citation key.
3. English technical terms match existing usage.
4. The claim is bounded to prototype evidence.
5. LaTeX syntax, labels, braces, and paths remain valid.
6. Any skipped verification is reported as a blocker, not hidden.
