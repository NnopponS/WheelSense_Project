# LLM/MCP evaluation — thesis implementation brief

This document bridges **`export_thesis_llm_mcp_results.py`** output to Chapter 4 tables in `latex/content/chapters/chapter4.tex`. Use it when filling `\ref{tab:ch4_llm_eval_freeze}`, `\ref{tab:ch4_irr_summary}`, `\ref{tab:ch4_text_similarity}`, and `\ref{tab:ch4_llm_latency}`.

---

## 1. Run provenance (must match prose)

| Field | Value in this snapshot |
|--------|-------------------------|
| Generated (UTC) | 2026-04-18T13:22:14Z |
| Profile-A freeze | warmup \(w{=}3\), repeat \(r{=}5\) per scenario (`tab:ch4_llm_eval_freeze`) |
| Scenarios | `mcp_llm/eval/scenarios.yaml` (6 scenarios × 5 logged repeats = 30 JSONL rows) |
| `MODEL_NAME` / Ollama | **`gemma3:4b`** (align thesis wording **Gemma 4B (local)**; do not cite other vendor/model names) / `http://127.0.0.1:11434` |
| Embedding model (text similarity) | `all-MiniLM-L6-v2` |

### Thesis alignment checklist (before locking numbers in PDF)

1. **Model name:** Export uses Ollama tag **`gemma3:4b`**; thesis prose uses **Gemma 4B (local)** consistently—do not introduce alternative model/vendor tags in Chapter 4 that are not used in production.
2. **Hardware:** Latency is host-specific; state device (e.g. PC vs Raspberry Pi) in methodology or table footnote—Chapter 4 already warns about load (`sec:ch4_eval_llm_latency`).
3. **Human IRR:** Table `tab:ch4_irr_summary` expects **Cohen’s \(\kappa\)**, \(R{=}2\). The JSON **`irr_proxy`** is an **automated routing agreement** vs `gold_tool`; it is **not** \(\kappa\). Either add a supplementary sentence + optional proxy column, or keep \(\kappa\) as “—” until raters complete `mcp_llm/eval/irr_rater_template.csv`.

---

## 2. Mapping: export JSON → Chapter 4 latency (`tab:ch4_llm_latency`)

Thai row labels follow the thesis table (`sec:ch4_eval_llm_latency`). JSON keys come from `latency_ms.chapter4_labels`.

| Thai row (thesis) | Export key | \(n\) | p50 (ms) | p95 (ms) | Notes |
|-------------------|-------------|------:|----------:|----------:|-------|
| รับคำถาม → เรียกเครื่องมือ MCP ครั้งแรก | `question_to_first_tool_start_ms` | 30 | 24,665 | 100,123 | Intent + queue to first tool |
| *(optional thesis row: LLM-only phase)* | `llm_phase_timestamp_received_to_t_after_llm_ms` | 30 | 24,665 | 100,123 | Same intervals when first “tool” starts right after LLM returns |
| เรียกเครื่องมือ → ได้ผลจากเครื่องมือ | `tool_call_to_tool_result_ms_router_execute` | 38 | 178 | 639 | Router/MCP execution; segment count can exceed 30 when multiple tools per turn |
| ได้ผลจากเครื่องมือสุดท้าย → ลำดับงานเสร็จสิ้น | `last_tool_result_to_workflow_done_ms` | 30 | 0 | 25 | Near-instant median; small p95 tail |
| รับคำถาม → ตอบกลับข้อความสุดท้าย | `question_to_final_response_workflow_done_ms` | 30 | 24,960 | 100,171 | End-to-end workflow |

**Suggested LaTeX narrative:** Report p50/p95 + \(n\) together; cite frozen \(w,r\) from `tab:ch4_llm_eval_freeze`.

---

## 3. Mapping: text similarity (`tab:ch4_text_similarity`)

Metric: **cosine similarity** on **sentence-transformers** embeddings (`text_similarity.embedding_model`). Values are **not** clinical quality scores—cite `sec:ch4_eval_text_sim` limitations.

Thesis rows ↔ `text_similarity.by_text_similarity_row`:

| Thesis row (ประเภทสถานการณ์) | Group key | \(n\) | Mean cosine | Stdev |
|-------------------------------|-----------|------:|-------------:|------:|
| สรุปสถานะล่าสุดจากเครื่องมืออ่านข้อมูล | `status_tools` | 15 | 0.610 | 0.078 |
| อธิบายเหตุการณ์แจ้งเตือน/กฎ | `alert_rules` | 5 | 0.847 | 0.000 |
| คำแนะนำเชิงปฏิบัติ (ไม่ใช่การวินิจฉัย) | `practical_advice` | 10 | 0.405 | 0.243 |

**Per-scenario detail** (for appendix or discussion): see `by_scenario` in Section 6 JSON — e.g. `rag_style_health` shows higher variance (\(\sigma \approx 0.36\)) after routing/content changes; interpret cautiously.

---

## 4. Mapping: IRR (`tab:ch4_irr_summary`) vs automated proxy

**Thesis table** targets **human** raters and **\(\kappa\)**.

**This export** provides **`irr_proxy`** only:

| Metric | Value |
|--------|------:|
| Method | First executed MCP tool vs `gold_tool` in `scenarios.yaml` |
| Overall agreement | 1.00 (30/30) |
| Per-scenario agreement | 1.00 for all six scenarios (\(n{=}5\) each) |

**How to write this honestly:**  
- Title the automated column e.g. “ข้อตกลงเชิงอัตโนมัติ (proxy)” or place it in prose / supplementary note.  
- Keep \(\kappa\) as **pending** until two raters score the pack in `app:mcp_irr_pack`.

---

## 5. One-line claims you can defend from this file

- **Routing (proxy):** Under Profile-A freeze and current `gold_tool` definitions, **100%** first-tool agreement was observed over **30** logged repeats (automated proxy, not \(\kappa\)).
- **Latency (this host, Gemma 4B class via `gemma3:4b`):** p50/p95 on the order of **~25--100 s** for question→first tool and question→final response; tool execution spans **~0.18--0.64 s** p50/p95—always tie to host load and Profile-A.
- **Text similarity:** Report **by-row** means above; acknowledge variability in `practical_advice` and scenario-level spread.

---

## 6. Full export JSON (source of truth)

```json
{
  "metadata": {
    "generated_at_utc": "2026-04-18T13:22:14.980250Z",
    "freeze_profile_A": {
      "warmup_per_scenario": 3,
      "repeat_per_scenario": 5
    },
    "model_name_env": "gemma3:4b",
    "ollama_host_env": "http://127.0.0.1:11434",
    "jsonl_temp_path": "C:\\Users\\PC\\AppData\\Local\\Temp\\tmpujzjr9ib.jsonl",
    "scenarios_file": "D:\\witty\\Doc\\Thesis\\mcp_llm\\eval\\scenarios.yaml",
    "disclaimer_cohens_kappa": "True Cohen's kappa with R=2 human raters requires offline scoring; see eval/irr_rater_template.csv.",
    "irr_human_template_relative": "mcp_llm/eval/irr_rater_template.csv"
  },
  "latency_ms": {
    "chapter4_labels": {
      "question_to_first_tool_start_ms": {
        "n": 30,
        "mean_ms": 34268.31,
        "p50_ms": 24665.304,
        "p95_ms": 100123.396
      },
      "llm_phase_timestamp_received_to_t_after_llm_ms": {
        "n": 30,
        "mean_ms": 34268.291,
        "p50_ms": 24665.304,
        "p95_ms": 100123.396
      },
      "tool_call_to_tool_result_ms_router_execute": {
        "n": 38,
        "mean_ms": 245.95,
        "p50_ms": 177.569,
        "p95_ms": 638.919
      },
      "last_tool_result_to_workflow_done_ms": {
        "n": 30,
        "mean_ms": 4.221,
        "p50_ms": 0.0,
        "p95_ms": 24.566
      },
      "question_to_final_response_workflow_done_ms": {
        "n": 30,
        "mean_ms": 34582.863,
        "p50_ms": 24959.535,
        "p95_ms": 100171.0
      }
    },
    "notes": "Segments align with tab:ch4_llm_latency when tools exist; rows with no tools omit first-tool and tool-span pool may be smaller."
  },
  "text_similarity": {
    "embedding_model": "all-MiniLM-L6-v2",
    "metric": "cosine_similarity_embedding",
    "by_scenario": {
      "dev_light_on": {
        "n": 5,
        "mean": 0.5512,
        "stdev": 0.0
      },
      "dev_tv_off": {
        "n": 5,
        "mean": 0.5619,
        "stdev": 0.0
      },
      "chat_greeting": {
        "n": 5,
        "mean": 0.452,
        "stdev": 0.0068
      },
      "schedule_add": {
        "n": 5,
        "mean": 0.8469,
        "stdev": 0.0
      },
      "rag_style_health": {
        "n": 5,
        "mean": 0.3571,
        "stdev": 0.356
      },
      "multi_device": {
        "n": 5,
        "mean": 0.7156,
        "stdev": 0.0
      }
    },
    "by_text_similarity_row": {
      "status_tools": {
        "n": 15,
        "mean": 0.6095,
        "stdev": 0.0777
      },
      "practical_advice": {
        "n": 10,
        "mean": 0.4045,
        "stdev": 0.2426
      },
      "alert_rules": {
        "n": 5,
        "mean": 0.8469,
        "stdev": 0.0
      }
    }
  },
  "irr_proxy": {
    "method": "Automated proxy: compare gold_tool from scenarios.yaml to first executed_tools[].tool; __content_only__ matches __no_tool__. This is not Cohen's kappa between human raters.",
    "overall_accuracy": 1.0,
    "total_comparisons": 30,
    "per_scenario": {
      "dev_light_on": {
        "gold_tool": "e_device_control",
        "agreement_rate": 1.0,
        "n": 5
      },
      "dev_tv_off": {
        "gold_tool": "e_device_control",
        "agreement_rate": 1.0,
        "n": 5
      },
      "chat_greeting": {
        "gold_tool": "chat_message",
        "agreement_rate": 1.0,
        "n": 5
      },
      "schedule_add": {
        "gold_tool": "schedule_modifier",
        "agreement_rate": 1.0,
        "n": 5
      },
      "rag_style_health": {
        "gold_tool": "rag_query",
        "agreement_rate": 1.0,
        "n": 5
      },
      "multi_device": {
        "gold_tool": "e_device_control",
        "agreement_rate": 1.0,
        "n": 5
      }
    },
    "mismatches": [],
    "mismatches_truncated": false
  }
}
```

**Machine-readable copy:** `data/analysis/llm_mcp_eval_results.json` (same content when last export was written).
