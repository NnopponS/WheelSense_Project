# Thesis Subagent Lanes

Use this reference when the user asks to work on more than one thesis chapter, or when the edit is large enough that independent chapter analysis will reduce drift. The user requested GPT-5.5 for thesis subagents; use `gpt-5.5` when available.

## Lane Rules

- Give each subagent a narrow chapter range and a read-only or disjoint write scope.
- Tell every editing subagent it is not alone in the codebase, must not revert unrelated changes, and must list changed files.
- Do not let two subagents edit the same `.tex` file at the same time.
- Ask subagents to inspect current files directly, not rely on memory.
- For analysis lanes, require evidence from file paths and section names.
- For writing lanes, require citation-key verification against `Thesis/latex/bib/refs.bib`.

## Recommended Analysis Split

### Frontmatter + Chapter 1

Scope:

- `Thesis/latex/content/frontmatter/abstract_th.tex`
- `Thesis/latex/content/frontmatter/ack_th.tex`
- `Thesis/latex/content/chapters/chapter1.tex`
- `Thesis/latex/meta/info.tex` if metadata matters

Ask for:

- Abstract paragraph structure.
- Acknowledgement voice.
- Introduction narrowing pattern.
- Objectives/scope/benefits/timeline conventions.
- LaTeX wrapper cautions.

### Chapter 2 + References

Scope:

- `Thesis/latex/content/chapters/chapter2.tex`
- `Thesis/latex/bib/refs.bib`

Ask for:

- Theory-first structure.
- Citation density and missing keys.
- Term introduction rules.
- Related-work gap logic.
- Places where implementation prose should move to Chapter 3.

### Chapter 3

Scope:

- `Thesis/latex/content/chapters/chapter3.tex`
- Current repo docs/code only as needed for architecture truth.

Ask for:

- Component-by-component method structure.
- MQTT/BLE/API/database/AI role consistency.
- Figure/table/label issues.
- Claims that need repo verification.

### Chapter 4

Scope:

- `Thesis/latex/content/chapters/chapter4.tex`
- Scripts/data under `Thesis/latex/scripts` only when metrics are being regenerated.

Ask for:

- Metric consistency.
- Table-to-prose interpretation.
- Overclaiming or missing limitations.
- Figure path and label checks.

### Chapter 5 + Appendices

Scope:

- `Thesis/latex/content/chapters/chapter5.tex`
- `Thesis/latex/content/appendices/*.tex`

Ask for:

- Whether discussion matches Chapter 4 evidence.
- Whether limitations are grouped and bounded.
- Whether recommendations trace to limitations.
- Appendix prose/caption cleanup.

## Baseline Failure Pattern To Prevent

Without this skill, agents can usually infer a broad formal Thai style, but they tend to:

- Produce prose that is too smooth and generic.
- Miss chapter-specific roles.
- Omit metrics, citations, or labels.
- Use broad claims such as "รวดเร็วยิ่งขึ้น" without measured evidence.
- Drift into policy/marketing language.
- Forget that Chapter 4 should be evidence-first and Chapter 2 should be citation-heavy.

## Forward-Test Prompt Template

Use this after editing the skill or before trusting a large thesis rewrite:

```text
Use the skill at .agents/skills/wheelsense-thesis-writing to revise [target file/section] in the WheelSense thesis. Preserve the author's Thai writing style, verify citation keys in Thesis/latex/bib/refs.bib, keep claims bounded to prototype evidence, and report changed files plus verification performed.
```

For read-only tests:

```text
Use the skill at .agents/skills/wheelsense-thesis-writing to analyze [chapter file] and identify the smallest safe edits needed to make it match the existing Thai author style. Do not edit files.
```
