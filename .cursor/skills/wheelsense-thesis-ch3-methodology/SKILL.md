---
name: wheelsense-thesis-ch3-methodology
description: Guides writing Chapter 3 methodology for WheelSense-like IoT indoor localization theses, including system design rationale, instruments, protocol clarity, validity/reliability, reproducibility, and figure/table planning.
---

# WheelSense Chapter 3 Skill

## Scope

- Main file: `latex/content/chapters/chapter3.tex`
- References: `latex/bib/refs.bib`
- Figure assets: `latex/assets/figures/chapter3/`

## Method writing workflow

1. Define method goals aligned with Chapter 1 objectives.
2. Describe architecture with clear subsystem roles.
3. Document instruments/hardware/software and data flow.
4. Define experiment protocol and evaluation setup.
5. State validity/reliability considerations and constraints.
6. Separate implemented work from future work.

## Reproducibility checklist

- Hardware and software versions/roles are stated.
- Key parameters and units are explicitly reported.
- Data pipeline steps are clear and repeatable.
- Test conditions and observations are stated.

## Figure/table guidance

- Use architecture and pipeline diagrams where helpful.
- Use tables for hardware roles, service stacks, and parameters.
- Keep labels and captions consistent and referenceable.
---
name: wheelsense-thesis-ch3-methodology
description: >-
  Drafts and revises Thai academic Chapter 3 (Research Methodology) for
  WheelSense-like IoT/BLE/indoor localization theses. Guides method design,
  instruments/datasets, experiment protocol, validity/reliability,
  reproducibility, and figure/table planning. Use when editing or outlining
  chapter 3, methodology sections, experiments, or when the user mentions
  latex/content/chapters/chapter3.tex or วิธีวิจัย/การดำเนินงาน.
---

# WheelSense Thesis — บทที่ 3 วิธีวิจัย (ร่างคำแนะนำสำหรับ Cursor)

## อ้างอิงไฟล์หลักในโปรเจกต์

- เนื้อหาบท: [`latex/content/chapters/chapter3.tex`](latex/content/chapters/chapter3.tex)
- กฎโครงการ LaTeX: [`latex/thesis.tex`](latex/thesis.tex) และ metadata ใน [`latex/meta/info.tex`](latex/meta/info.tex)
- บรรณานุกรม: [`latex/bib/refs.bib`](latex/bib/refs.bib)
- รูปบท: วาง PDF ใต้ `latex/assets/figures/chapter3/` (ตั้งชื่อสอดคล้อง `\includegraphics` ใน `.tex`)

ก่อนแก้บท 3 ให้อ่าน `chapter3.tex` ทั้งไฟล์เพื่อรักษาโครง `\section`/`\subsection` และคำศัพท์เทคนิคที่ใช้แล้ว (เช่น RSSI fingerprinting, KNN, MCP, BLE beacon)

---

## 1) การออกแบบวิธีวิจัย (Method design)

**จุดประสงค์:** อธิบายว่า “ทำอย่างไร” ให้สอดคล้องกับปัญหา/วัตถุประสงค์ในบท 1 และส่งต่อไปยังผล/การวิเคราะห์ในบท 4

**ขั้นตอน (ทำตามลำดับ):**

1. **สรุปแนวคิดเชิงระบบ** — ระบุขอบเขต: การติดตามผู้ใช้เก้าอี้รถเข็น, IoT, indoor localization, pipeline ข้อมูล, การบูรณาการอัตโนมัติ/วิเคราะห์ข้อมูล (ปรับให้ตรงงานจริง)
2. **อธิบายเหตุผลของการออกแบบหลายรุ่น/ต้นแบบ** — ถ้ามี iteration: ระบุข้อจำกัดของรุ่นก่อน (เช่น ความแม่นยำตำแหน่ง, timestamp, การบูรณาการ) แล้วสรุปว่ารุ่นปัจจุบันแก้อย่างไร
3. **สถาปัตยกรรมแบบชั้น (layered)** — ใช้รายการที่อ่านง่าย แยกบทบาทชัด: Sensor / Communication / Localization / Server / Application (หรือโครงเทียบเท่าของโปรเจกต์)
4. **เชื่อมกับ “มาตรฐานการประเมิน”** — ระบุว่าจะวัดอะไร (latency, accuracy ตำแหน่ง, อัตราสำเร็จของ pipeline, ฯลฯ) โดยไม่ซ้ำรายละเอียดผลเต็ม (คงไว้ในบท 4)

**ภาษา:** ทางการ ใช้ศัพท์อังกฤษเฉพาะทางเมื่อคมชัดกว่า; หลีกเลี่ยงการอ้างหมายเลขอ้างอิงใน skill — ให้ผู้เขียนใส่ `\cite` ใน `.tex` เอง

---

## 2) ชุดข้อมูลและเครื่องมือ (Dataset / instruments)

**ฮาร์ดแวร์:** รายการอุปกรณ์ + บทบาท + ข้อมูลที่ได้ (เช่น IMU บน M5StickC Plus2, Polar Verity Sense, ESP32-S3 สำหรับ BLE scan, Raspberry Pi เป็นเซิร์ฟเวอร์)

**ซอฟต์แวร์/บริการ:** ระบุ stack หลัก (เช่น MQTT collector, API, dashboard, DB; ฝั่งเว็บ Next.js/React; การเชื่อม Home Assistant / LLM ผ่าน MCP) โดยเน้น “หน้าที่” ไม่ใช่โค้ดยาว

**ข้อมูล (dataset):** ถ้ามีการเก็บ log / fingerprint / เซสชันทดลอง ให้ระบุอย่างน้อย:

- แหล่งที่มาและช่วงเวลาเก็บ
- หน่วย/ฟิลด์สำคัญ (timestamp, device id, RSSI vector, room/zone label ฯลฯ)
- นโยบายคุณภาพข้อมูล (กรองค่าผิดปกติ, missing data)
- ข้อจำกัดด้านความเป็นส่วนตัว/ความยินยอม (ถ้ามีผู้เข้าร่วม)

---

## 3) โปรโตคอลการทดลอง (Experiment protocol)

จัดเป็นขั้นตอนที่ทำซ้ำได้ โดยแยกประเภททดสอบ:

| ประเภท | สิ่งที่ต้องมีในเนื้อหา |
|--------|-------------------------|
| ทดสอบฮาร์ดแวร์/ยูนิต | เงื่อนไขห้อง/สภาพแวดล้อม, การสอบเทียบ, เกณฑ์ผ่าน/ไม่ผ่าน |
| ทดสอบซอฟต์แวร์/บริการ | เคสทดสอบ, การยืนยันข้อมูล end-to-end |
| ทดสอบแบบบูรณาการ (E2E) | ลำดับการไหลของข้อมูลตั้งแต่เซ็นเซอร์ถึงแดชบอร์ด |
| Localization | การเก็บ fingerprint, พารามิเตอร์ KNN, พื้นที่/เส้นทางอ้างอิง |

**เทมเพลตขั้นตอน (ย่อ):**

1. เตรียมอุปกรณ์และเวอร์ชันซอฟต์แวร์ (ระบุเวอร์ชันเมื่อสำคัญต่อการทำซ้ำ)
2. ตั้งค่าเครือข่าย/ MQTT / เวลา (NTP หรือวิธี sync ที่ใช้)
3. เก็บข้อมูลตามสคริปต์ที่กำหนด (ระยะเวลา, จำนวนรอบ)
4. บันทึกเหตุการณ์ผิดปกติและการแทรกแซงของสภาพแวดล้อม
5. สรุปผลเชิงคุณภาพใน chapter3; ตัวเลขเชิงปริมาณไปบท 4 ตามแนวทางของสาขา

---

## 4) ความเที่ยงตรงและความเชื่อมั่นของเครื่องมือ (Validity / reliability)

**ความเที่ยงตรง (Validity) — “วัดสิ่งที่ตั้งใจวัดหรือไม่”**

- **เนื้อหา (content):** เกณฑ์การทดสอบครอบคลุมฟังก์ชันหลักของระบบหรือไม่
- **สร้าง (construct):** ตัวชี้วัดตำแหน่ง/latency/timestamp alignment สะท้อนเป้าหมายเชิงระบบหรือไม่
- **อ้างอิงภายนอก (criterion-related):** ถ้ามี ground truth (เช่น ตำแหน่งจริงในห้อง) ให้อธิบายการเปรียบเทียบ

**ความเชื่อมั่นของเครื่องมือ (Reliability) — “ได้ผลสม่ำเสมอหรือไม่”**

- ความเสถียรของ RSSI และผลต่อ fingerprinting
- ความสม่ำเสมอของ timestamp ระหว่างองค์ประกอบ (จุดอ่อนที่มักถูกกล่าวในระบบหลายโหนด)
- การทำซ้ำการทดลองภายใต้เงื่อนไขเดียวกัน (ถ้าทำได้)

**การเขียนใน thesis:** ระบุข้อจำกัดอย่างตรงไปตรงมา (เช่น การแปรผันของสภาพแวดล้อมต่อ RSSI) และเชื่อมกับแนวทางแก้ใน `\section{แนวทางพัฒนาต่อ}`

---

## 5) Checklist การทำซ้ำได้ (Reproducibility)

ใช้เป็นรายการตรวจก่อนส่งบทหรือก่อนแนบภาคผนวก:

- [ ] ระบุรุ่นอุปกรณ์และเวอร์ชันซอฟต์แวร์หลักที่มีผลต่อผลการทดลอง
- [ ] อธิบายการตั้งค่าเครือข่าย, broker, และการซิงก์เวลา
- [ ] ระบุพารามิเตอร์ของอัลกอริทึม (เช่น KNN, fingerprinting) หรืออ้างภาคผนวก/ที่เก็บโค้ด
- [ ] อธิบายรูปแบบข้อมูลที่บันทึก (schema ระดับสูงพอในเนื้อหา หรือส่งต่อภาคผนวก)
- [ ] ระบุสภาพแวดล้อมทดลอง (อาคาร/ห้อง/จำนวน beacon) เพื่อให้ผู้อ่านเข้าใจบริบท
- [ ] แยก “ขั้นตอนที่ทำแล้ว” กับ “ข้อจำกัดที่ยังทำซ้ำยาก” อย่างชัดเจน

---

## 6) การวางแผนรูปและตาราง (Figure / table planning)

**หลักการ:** หนึ่งรูป/หนึ่งข้อความหลัก; คำบรรยายใต้รูป (`\caption`) ต้องพึ่งพาได้แม้อ่านแยกจากเนื้อหา

**แนะนำสำหรับบท 3 (ปรับชื่อไฟล์ให้ตรงโปรเจกต์):**

| รหัส | ประเภท | เนื้อหาโดยสังเขป |
|------|--------|-------------------|
| Fig | สถาปัตยกรรม | แผนภาพชั้น Sensor → … → Application |
| Fig | Pipeline | MQTT → Collector → DB → API → Dashboard |
| Fig | Localization | แผนที่โซน/ beacon layout (ถ้ามี) |
| Table | อุปกรณ์ | รุ่น, หน้าที่, ข้อมูลที่ได้ |
| Table | บริการซอฟต์แวร์ | โมดูล, บทบาท, โปรโตคอลที่เกี่ยวข้อง |
| Table | Schema ย่อ | เอนทิตีหลักและความสัมพันธ์ (ไม่ต้องใส่ทุกฟิลด์ในเนื้อหาหลัก) |

**ขั้นตอนใน LaTeX:** สร้างไฟล์ PDF ใส่ `latex/assets/figures/chapter3/` แล้วใช้ `\IfFileExists` หรือ `\includegraphics` ตามแบบบทอื่นในโปรเจกต์

---

## เช็กลิสต์คุณภาพก่อนปิดบท 3

- [ ] โครงสร้างสอดคล้องกับ [`chapter3.tex`](latex/content/chapters/chapter3.tex) (ไม่ผสมเนื้อหาผลการทดลองเชิงลึกที่เป็นหน้าที่บท 4 โดยไม่จำเป็น)
- [ ] มีคำอธิบาย “ทำไม” ของการออกแบบ ไม่ใช่แค่ “มีอะไรบ้าง”
- [ ] ระบุข้อจำกัดและความเสี่ยงของวิธี (เช่น RSSI, timestamp, deployment) อย่างเป็นระบบ
- [ ] ศัพท์เทคนิคสม่ำเสมอทั้งบท; อ้างอิงเป็น `\cite` ใน `.tex`
- [ ] รูป/ตารางมีคำอธิบายครบ และอ้างในเนื้อหา (`รูปที่ …`, `ตารางที่ …`)
