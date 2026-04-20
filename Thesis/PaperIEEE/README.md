# BLE Indoor Localization: ML vs LLM Comparative Study

Comparative Performance Evaluation of BLE-Based Indoor Localization Using Machine Learning and Large Language Models.

**Conference:** ECTI-CON 2026 | **Track:** AI, Data & Intelligent Systems

## Project Structure

```
PaperIEEE/
├── paper/                  ← LaTeX paper source
│   ├── Draft_Paper.tex     ← Main paper
│   ├── Draft_Paper.pdf     ← Compiled PDF
│   └── template/           ← IEEE conference template (reference)
├── data-collection/        ← Data collection system
│   ├── app/                ← Streamlit RSSI data collector
│   │   ├── data_collector.py
│   │   ├── experiment_store.py
│   │   └── config.py
│   └── firmware/           ← ESP32/nRF52840 PlatformIO projects
│       ├── station/        ← ESP32-S3 anchor firmware (ESP-IDF)
│       ├── tag/            ← M5StickC Plus2 BLE tag firmware (ESP-IDF)
│       └── _archive/       ← Old Arduino firmware (kept for reference)
├── experiments/            ← ML & LLM experiment scripts
│   └── (KNN, XGBoost, Gemini classifiers - TODO)
├── data/                   ← Collected RSSI datasets
│   └── experiments/        ← Per-experiment folders (CSV + metadata)
├── docs/                   ← Project documentation
│   ├── Brieft.md           ← Project brief & study design
│   └── author.md           ← Author information
└── mosquitto.conf          ← MQTT broker config
```

## Quick Start

### Data Collection
```bash
cd data-collection/app
pip install -r requirements.txt
streamlit run data_collector.py
```

### Compile Paper
```bash
cd paper
pdflatex Draft_Paper.tex
pdflatex Draft_Paper.tex   # 2nd pass for references
```

## Authors
- Supachai Vorapojpisut (vsupacha@engr.tu.ac.th)
- Sairag Saadprai (sairag.saa@allied.tu.ac.th)
- Worapon Sangsasri (worapon.sangs@gmail.com)
- Suppawit Ausawalaithong (suppawit.aus@gmail.com)
