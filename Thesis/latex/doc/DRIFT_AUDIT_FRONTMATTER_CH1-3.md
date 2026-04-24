# Drift audit - front matter + Chapters 1–3 (rubric push)

**Purpose:** Map planned rubric phases to repository artifacts and record **remaining debt** so future edits do not silently diverge from `server/AGENTS.md`, bibliography hygiene, or deferred scope.

**Dates in `meta/info.tex`:** unchanged per author constraint (2025 / 2568 path).

## Phase → files touched

| Phase / theme | Primary artifacts |
|---------------|-------------------|
| MQTT single source of truth | `content/chapters/chapter3.tex`: `\ref{sec:ch3_mqtt_contract}`, table `\label{tab:ch3_mqtt_topics}` aligned to repo `server/AGENTS.md`; shortened camera/mobile MQTT prose with cross-refs. |
| Bibliography cite keys | `bib/refs.bib`: former `TBD_*` keys renamed to semantic keys; `\cite{}` updates in `chapter1.tex`, `chapter2.tex`, `chapter3.tex`. |
| GNSS / indoor limitation rigor | `bib/refs.bib`: `SecoGranados2012_GNSS_indoor_challenges`; `chapter2.tex` GNSS subsection cites peer-reviewed source first, industry blog second (`Indoor_GPS_Limitations`). |
| Ch2 synthesis + FP vs model | `chapter2.tex`: table `\label{tab:ch2_fp_vs_model}`; synthesis after IPS taxonomy; bridge paragraph before research-gap subsection. |
| Acronyms | `content/frontmatter/acronyms.tex`: GNSS, UWB, PPG, JSON, TLS, REST, E2E. |
| Rubric documentation | This file; `doc/RUBRIC_CHECKLIST_FRONTMATTER_CH1-3.md` refreshed. |

## Explicitly deferred (known ceiling)

- **Chapter 3 diagram PDF/PNG assets:** `assets/figures/chapter3/` remains without final figures; `chapter3.tex` still uses `\IfFileExists` placeholders until TikZ-in-chapter or exported assets are added.

## Quick verification commands (from `Thesis/latex/`)

```text
xelatex -interaction=nonstopmode thesis.tex
biber thesis
xelatex -interaction=nonstopmode thesis.tex
xelatex -interaction=nonstopmode thesis.tex
```

Resolve any undefined citations after `refs.bib` key changes.
