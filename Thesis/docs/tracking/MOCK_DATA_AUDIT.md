# Mock Data Audit — Chapter 4

เอกสารนี้สรุปค่าที่ถูกเติมใน Phase 5 ของ Chapter 4 เพื่อให้ผู้ใช้สามารถย้อนกลับมาแทนที่ด้วยผลจริงภายหลังได้อย่างเป็นระบบ

## Source-backed sections

| Location | Status | Source |
|---|---|---|
| `chapter4.tex` §4.7.1–§4.7.3 | source-backed | `Thesis/data/analysis/llm_mcp_eval_results.json` |
| `chapter4.tex` §4.8.1–§4.8.3 | source-backed | `Thesis/data/surveys/WheelSense UX_UI - Feedback (การตอบกลับ) - การตอบแบบฟอร์ม 1.csv` |
| `chapter4.tex` §4.5.2–§4.5.3 | companion-study backed | IEEE companion results summarized in thesis narrative |
| `chapter4.tex` §4.10 | qualitative source-backed | field presentation / feedback session at บ้านพักคนชราวาสนะเวศม์ |

## Mock-backed sections annotated in `chapter4.tex`

| Location | Values currently filled | Why marked mock | Replace with |
|---|---|---|---|
| §4.4.1 `อัตราการสุ่ม IMU จริงและความสม่ำเสมอของข้อมูล` | effective rate 19.7 Hz, range 18.9–20.2 Hz, `n=180` | ยังไม่มี consolidated IMU log file ที่ freeze แล้ว | exported IMU interval summary / per-window rate CSV |
| §4.4.2 `ความเสถียรของ MQTT และความครบถ้วนของ telemetry` | ingest 99.73%, BLE jitter ±12 ms | ยังไม่มี aggregate telemetry log ชุดสุดท้าย | merged MQTT/telemetry ingest summary |
| §4.4.3 `ความถูกต้องของการจำแนกการเคลื่อนไหวและการตรวจจับการล้ม` | macro F1 0.91, fall recall 0.92 | รอชุด annotation สุดท้ายของเหตุการณ์ภาคสนาม | labeled event evaluation output |
| §4.5.1 `การครอบคลุมของโหนด BLE และเส้นทางภาพจากโหนดสภาพแวดล้อม` | 95% coverage, median RSSI -67 dBm, image success 98.6%, reassembly 1.18 s | ตัวเลขสรุปภาคสนามยังไม่ถูก freeze เป็น artifact กลาง | localization/site survey aggregate and camera transfer logs |
| §4.6.1 `ความเสถียรของบริการและความพร้อมใช้งาน` | availability 99.2%, recovery 12/28 s | ยังไม่มี deployment/runtime log pack ชุดสรุป | uptime/restart logs |
| §4.6.2 `ปริมาณงานและเวลาแฝงของ MQTT และ REST` | telemetry 60 rows/min, predictions 30/min, image 120 chunks/min, API 180 req/min; stress values | เป็นค่าประมาณ anchored กับ topology ของต้นแบบ | benchmark/export from load runs |
| §4.6.4 `การทดสอบโดเมนคลินิกและปฏิบัติการ` | alerts 12/12, tasks 10/10, messages 18/18, medication 8/8 | execution logs ยังไม่รวมเป็นรายงานเดียว | workflow execution audit export |
| §4.8.4 `ผลการทดสอบแอปมือถือและขอบเขตของการแจ้งเตือนเชิงกฎ` | first-pair success 91.7%, p50 1.6 s, p95 3.4 s | ยังไม่มี mobile telemetry latency summary กลาง | mobile pairing / bridge latency logs |
| §4.9 `ผลการทดสอบแบบปลายถึงปลายของระบบ` | all latency, throughput, integrity, recovery numbers in §4.9.1–§4.9.4 | เป็นชุดค่าบรรยายสมรรถนะระบบที่ยังรอ benchmark round สุดท้าย | end-to-end benchmark sheets / merged aggregate CSV |

## Figures tied to real or mock data

| Figure | Current basis | Note |
|---|---|---|
| `ch4-fig09-llm-latency.pdf` | real-source backed | should continue to reflect `data/analysis/llm_mcp_eval_results.json` |
| `ch4-fig10-llm-similarity.pdf` | real-source backed | should continue to reflect `data/analysis/llm_mcp_eval_results.json` |
| `ch4-fig12-ux-likert.pdf` | real-source backed | should continue to reflect UX CSV (`n=6`) |
| `ch4-fig04`, `ch4-fig05`, `ch4-fig08`, `ch4-fig13` | mock-anchored / placeholder-ready | replace after final metric export freeze |
| `ch4-fig06`, `ch4-fig07` | companion-study backed | keep aligned with IEEE companion analysis |

## Replacement order

1. Replace §4.4 field-device metrics once IMU and telemetry aggregates are frozen.
2. Replace §4.6 and §4.9 server/E2E metrics from final benchmark exports.
3. Replace §4.8.4 mobile metrics from final pairing and bridge latency logs.
4. Rebuild any affected Chapter 4 plots after each data replacement pass.
