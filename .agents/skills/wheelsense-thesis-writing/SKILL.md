---
name: wheelsense-thesis-writing
description: Use when writing, rewriting, polishing, auditing, or finishing the Thai WheelSense thesis under Thesis/latex, especially when the user asks to keep the old author style, avoid AI-sounding prose, preserve LaTeX structure, or coordinate chapter-by-chapter thesis edits with GPT-5.5 subagents.
---

# WheelSense Thesis Writing

## Overview

This skill preserves the authentic Thai senior thesis voice for `Thesis/latex` based on actual Thammasat University (TU) 4th-year engineering senior thesis documents. It focuses on formal, concrete, and mechanism-driven project-report prose with modest claims and precise LaTeX structural rules (such as section indentation and non-hyphenation of Thai words).

## First Reads

1. Read `.agents/core/source-of-truth.md`.
2. Read `Thesis/latex/thesis.tex`, `Thesis/latex/mystyle.sty`, and the target chapter/frontmatter file.
3. Read `Thesis/latex/bib/refs.bib` before adding or changing `\cite{...}` keys.
4. Read [references/style-guide.md](references/style-guide.md) before drafting Thai thesis prose.
5. Read [references/subagent-lanes.md](references/subagent-lanes.md) when splitting work by chapter.

## Core Rules & TU Thesis Style

- **Preserve the Authentic 4th-Year Student Voice**: Use formal Thai academic engineering prose. It should be direct, descriptive, and mechanism-focused. Avoid flowery, marketing-like, or overly-polished AI phrases.
- **Section Indentation Requirements**:
  - Section (`\section`): Flush left (ชิดซ้าย, no indent).
  - Subsection (`\subsection`): 0.8in indent from the left margin.
  - Subsubsection (`\subsubsection`): 1.1in indent from the left margin.
  - Body paragraphs: 0.8in first-line indent (using `\setlength{\parindent}{0.8in}`).
- **Thai Hyphenation & Word-Breaking Rules**:
  - Disable hyphenated line breaks for Thai text to prevent splitting words across lines (e.g., ประ-เทศ, เทค-นิค).
  - Use `\hyphenpenalty=10000` and `\exhyphenpenalty=10000` in `mystyle.sty` or the thesis preamble. Words must move to the next line instead of being split.
- **Caption Placement Standards**:
  - **Table captions**: Must be placed **ABOVE** the table (e.g., `\caption{...}` precedes tabular environment).
  - **Figure captions**: Must be placed **BELOW** the figure.
- **Academic Honesty & Modest Claims**:
  - Acknowledge errors and limitations honestly (e.g., "พบค่าความคลาดเคลื่อน... แต่ยังอยู่ในเกณฑ์ที่ยอมรับได้ (<5%)").
  - Use bounded terms: "ระบบต้นแบบ", "สะท้อนความเป็นไปได้", "ความเสถียรในระดับห้องหรือโซน", "ประเด็นที่ต้องพัฒนาต่อยอด".
- **Terminology Preservation**:
  - Maintain English names for technical systems/libraries: `WheelSense`, `M5StickC Plus2`, `Polar Verity Sense`, `BLE`, `RSSI`, `MQTT`, `FastAPI`, `PostgreSQL`, `Next.js`, `React Native`, `Ollama`, `FastMCP`, `MCP`.
  - Use Thai-first term introduction on first use: `ระบบระบุตำแหน่งภายในอาคาร (Indoor Positioning System: IPS)`.
- **Chapter Roles**:
  - Chapter 1: Introduction (problem, study site, objectives, scope, benefits).
  - Chapter 2: Literature and citation-backed theory.
  - Chapter 3: Concrete technical implementation, hardware evolution, data schemas, and protocol details.
  - Chapter 4: Factual, quantitative evaluation (tables, figures, and direct patterns without fluff).
  - Chapter 5: Synthesis, discussion of limitations, and future engineering suggestions.

## Chapter Workflow

1. Identify the exact target: frontmatter, chapter, section, subsection, table caption, figure caption, appendix, or reference cleanup.
2. Extract 2-4 nearby source paragraphs from the same chapter and match their sentence rhythm, transitions, terminology, and claim strength.
3. Draft in Thai with chapter-specific role:
   - Chapter 1: broad context -> site problem -> WheelSense response -> objectives/scope/benefits.
   - Chapter 2: literature/theory-first, cite factual and standard claims.
   - Chapter 3: method/system-first, component -> role -> protocol/data path -> processing/failure handling.
   - Chapter 4: evidence-first, setup -> table/figure -> direct result -> technical reason -> improvement.
   - Chapter 5: subsystem synthesis -> meaning -> constraint -> recommendation.
4. Verify references, labels, figure paths, and terminology against existing files.
5. Run the smallest useful verification. For final thesis readiness, use the full `xelatex -> biber -> xelatex -> xelatex` gate from `Thesis/latex`.

## Subagent Rule

When the task spans multiple chapters, split read-only analysis or disjoint editing lanes by chapter. The user requested GPT-5.5 for thesis subagents; use `gpt-5.5` when spawning is available. Keep write scopes disjoint and make each subagent report changed files.

## Anti-AI Red Flags

- Generic sentence chains: "นอกจากนี้... อีกทั้ง... ดังนั้น..." without metrics, citations, or local context.
- Claims like "พร้อมใช้งานจริง", "ยืนยันความปลอดภัย", or "สามารถวินิจฉัย" without evidence.
- Rewriting all chapters into the same polished tone and losing the existing report-like directness.
- Over-translating established technical terms or changing `เก้าอี้รถเข็น`, `ผู้ดูแล`, `ผู้พักอาศัย`, and role terminology inconsistently.
- Repeating table rows in prose instead of interpreting the key pattern.
- Calling the thesis finished without compile/citation/reference verification.

## Completion Checklist

- [ ] Target chapter role is preserved.
- [ ] Thai prose matches nearby paragraphs and avoids AI-marketing tone.
- [ ] Claims are bounded to prototype evidence.
- [ ] Citations exist in `Thesis/latex/bib/refs.bib`.
- [ ] Labels use the chapter's existing prefix style.
- [ ] No accidental edits to generated `.aux`, `.bbl`, `.log`, `.pdf`, or image files.
- [ ] Verification result or blocker is reported.

