---
name: thammasat-thesis-chapter1-thai-wheelsense
description: Guides drafting and revising Chapter 1 (บทนำ) in formal Thai academic style for the WheelSense LaTeX thesis at Thammasat University. Use when editing chapter1.tex, defining motivation/objectives/scope, or preparing Chapter 1 figures and citations.
---

# WheelSense Chapter 1 Skill

## Scope

- Main file: `latex/content/chapters/chapter1.tex`
- Bibliography: `latex/bib/refs.bib`
- Figures: `latex/assets/figures/chapter1/`
- Thesis entry: `latex/thesis.tex` (chapters 1-5 only)

## Workflow

1. Read current Chapter 1 structure and existing labels/references.
2. Draft narrative in this order:
   - background and problem significance,
   - motivation and research gap,
   - objectives,
   - knowledge domains,
   - scope,
   - workflow/milestones and resources (same section as steps; avoid a lone subsection for resources only),
   - expected outcomes.
3. Add citations for non-obvious claims and ensure keys exist in `refs.bib`.
4. Verify figure filenames match `\IfFileExists` paths.
5. Rebuild thesis and fix unresolved references/citations.

## Writing guidance

- Use formal academic Thai; keep accepted technical English terms (BLE beacon, RSSI fingerprinting, KNN, MCP).
- Keep claims precise and evidence-oriented.
- Keep Chapter 1 focused on context, rationale, and scope (not full literature review).

## Quality checklist

- Objectives align with scope and expected outcomes.
- Terminology is consistent with later chapters.
- Figures/tables have captions and labels.
- No template sample chapter content is mixed into thesis body.
