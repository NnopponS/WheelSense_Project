---
name: wheelsense-chapter2-literature
description: Guides Chapter 2 literature writing for WheelSense in Thai academic style with critical synthesis, citation discipline, anti-plagiarism, and theory-to-system mapping. Use when editing chapter2.tex or refs.bib.
---

# WheelSense Chapter 2 Skill

## Scope

- Main file: `latex/content/chapters/chapter2.tex`
- Bibliography file: `latex/bib/refs.bib`

## Structure pattern

1. Broad domain context (smart environment / AAL).
2. Indoor positioning foundations and trade-offs.
3. Communication and system technologies.
4. Software/data/automation foundations.
5. Optional AI/MCP context (if directly relevant).
6. Chapter synthesis linked to WheelSense architecture choices.

## Synthesis rule

- Write claim -> evidence -> implication for WheelSense.
- Avoid paper-by-paper listing without analysis.
- Compare alternatives using practical criteria (accuracy, cost, complexity, deployment).

## Citation and integrity

- Use key-based LaTeX citations linked to `refs.bib`.
- Add full metadata for new entries.
- Paraphrase in your own words; do not copy source sentences.

## Quality checklist

- Each section has a thesis-relevant purpose.
- Every non-obvious claim has citation support.
- Summary closes with design implications for this thesis.
---
name: wheelsense-chapter2-literature
description: >-
  Drafts and revises Thai academic Chapter 2 (ทฤษฎีหรืองานที่เกี่ยวข้อง) for the
  WheelSense LaTeX thesis: literature synthesis structure, biblatex discipline,
  anti-plagiarism, mapping claims to WheelSense (BLE IPS, gateway, web stack,
  Home Assistant, MCP/LLM). Use when editing `latex/content/chapters/chapter2.tex`,
  adding entries to `latex/bib/refs.bib`, or when the user mentions literature
  review, related work, or Chapter 2.
---

# WheelSense — Chapter 2 (Literature Review) LaTeX Skill

## Scope and primary files

- **Chapter body**: `latex/content/chapters/chapter2.tex` (included from `latex/thesis.tex`).
- **Bibliography**: `latex/bib/refs.bib` (cited via project biblatex setup).
- **Language**: formal academic **Thai** prose; retain widely understood **technical English** where clearer than Thai coinages (e.g. RSSI, BLE beacon, fingerprinting, MQTT, WebSocket, MCP, Indoor Positioning System).

When expanding or restructuring Chapter 2, keep alignment with the existing section spine in `chapter2.tex` unless the user requests a different outline.

---

## Sectioning pattern (literature synthesis, not a bibliography dump)

Use a **funnel + themes** pattern:

1. **Broad context** — Smart environment / Ambient Assisted Living (AAL): why indoor, user-centered support matters for the thesis problem.
2. **Core positioning theme** — Indoor positioning: limitations of GPS indoors; IPS families; why signal-feature methods (e.g. RSSI) and algorithms (trilateration, fingerprinting) appear in related work.
3. **Enabling stack themes** — Communications (BLE vs alternatives, backhaul e.g. Wi-Fi Mesh), protocols (MQTT, HTTP/REST, WebSocket), sensing (IMU), software/data (API, dashboard, relational + time-series data).
4. **Deployment / ops theme** — Containerization, automation platforms (e.g. Home Assistant) if the chapter argues integration with building automation.
5. **Intelligence / tooling theme** (if in scope) — LLM roles and MCP as integration pattern; keep claims proportional to what the thesis actually implements.
6. **Closing synthesis** — Short summary section tying themes to the WheelSense architecture choice (BLE + gateway + web + automation + optional AI), without introducing new citations.

Within each `\section`/`\subsection`:

- **Claim → evidence → implication for WheelSense**: state a synthesizing claim in Thai, support with cited sources, then one or two sentences on how it motivates a design decision in this project.
- Prefer **thematic paragraphs** over isolated “paper A said… paper B said…” lists unless comparing approaches is the goal.
- Use `\subsection` when a section would otherwise mix unrelated ideas (e.g. RSSI behavior vs positioning algorithms).

---

## Citation discipline (`refs.bib` + in-text)

- **Single source of truth**: every factual or attributable statement that is not common knowledge should resolve to a **BibTeX key** in `latex/bib/refs.bib`, cited with the project’s citation commands (e.g. `\cite{...}`, `\parencite{...}` — follow existing `chapter1`–`chapter5` usage). **Do not** rely on manual bracket numbers like `[18][19]` in new or revised text unless the thesis explicitly standardizes on that style; prefer consistent biblatex/bibtex-cite keys.
- **Entry hygiene**: for each new `@article`, `@inproceedings`, `@online`, etc., fill author, title, venue, year, and DOI/URL when available; use consistent `journal`/`journaltitle` fields per project convention; avoid duplicate keys.
- **Citation placement**: cite **after** the claim the source supports, not only at paragraph end if mid-paragraph claims differ.
- **Secondary sources**: if the thesis must cite a survey or textbook, say so clearly (“ตามที่สรุปใน …”) and cite that source; avoid implying you read primary studies you did not use.
- **Thai institutional / Thai-language references**: allowed when authoritative; same metadata rigor as English entries.

---

## Anti-plagiarism and academic integrity

- **Synthesis, not transcription**: do not copy sentences from PDFs or the web. Close the source, write the idea in **new Thai sentences**, then add the citation.
- **Quotation**: if a direct quote is necessary, use LaTeX quoting conventions, keep it short, and cite the exact source and page (if available).
- **Paraphrase check**: if two consecutive clauses mirror the source’s order and wording, rewrite.
- **Self-reuse**: if material exists elsewhere (e.g. proposal, report), disclose to the user and avoid duplicating large passages verbatim across documents unless the program allows it.
- **Figures/tables**: only reuse with permission/license; cite the origin in the caption if required.

---

## Mapping theory to the WheelSense topic

When adding a paragraph, explicitly tie it to **this** system where relevant:

| Theme | Map to WheelSense (examples) |
|--------|-------------------------------|
| AAL / smart environment | Wheelchair user indoors; safety, convenience, autonomy. |
| IPS / RSSI / BLE | BLE beacons + client device; room-level or zone-level tracking constraints. |
| Algorithms | Fingerprinting, trilateration, hybrid distance + calibration — match what the implementation actually does. |
| Networking | BLE for device links; Wi-Fi Mesh or LAN for backhaul to gateway/server. |
| Edge / gateway | ESP32-S3 (or equivalent) as gateway role if that is the thesis hardware story. |
| Server / web | FastAPI, React/Vite dashboard, real-time updates — only claim what is implemented or strictly as “แนวทางที่พบในวรรณกรรม”. |
| Automation | Home Assistant + MQTT discovery — tie to contextual alerts/automation. |
| AI / MCP | Local vs cloud LLM and MCP as **integration** pattern; avoid overstating experimental results. |

If the literature supports a **trade-off** (e.g. UWB accuracy vs cost), state it honestly and connect to **why BLE was chosen** for the prototype.

---

## Checklist before submitting Chapter 2

- [ ] Each section has a clear **thesis-relevant** purpose; cut tangents.
- [ ] Terminology: Thai academic tone; English technical terms consistent with Chapter 1 and the rest of the thesis.
- [ ] Every non-obvious claim has a **citation** or is framed as author reasoning (“จากการออกแบบในโครงงานนี้…”).
- [ ] No manual mystery citation numbers left inconsistent with `refs.bib`.
- [ ] `refs.bib` has no duplicate keys; UTF-8 and brace conventions preserved.
- [ ] Summary section restates **integration** (stack + rationale), not new technical depth.
- [ ] Cross-references: if referring to figures/chapters, use `\ref`/`\Cref` as per project packages.

---

## Verification steps (agent or author)

1. **Build**: from `latex/`, compile `thesis.tex` with the project’s documented tool chain (e.g. XeLaTeX + biber); fix undefined citations and bibliography warnings.
2. **Citation audit**: grep `chapter2.tex` for `\cite` / `\parencite` / manual `[n]` patterns; ensure each key exists in `refs.bib`.
3. **Consistency**: skim Chapter 1 problem statement and Chapter 3 methodology so Chapter 2 does not contradict later chapters.
4. **Plagiarism pass**: for each new paragraph, confirm it is not a close copy of a single source; merge multiple sources into synthesized prose where appropriate.
5. **Scope**: confirm MCP/LLM subsection depth matches institutional expectations (some committees want minimal hype; adjust on user request).

---

## Examples of good vs weak synthesis (Thai)

- **Weak**: หลายงานวิจัยใช้ RSSI [x][y][z]. (list of citations only)
- **Strong**: งานวิจัยด้าน IPS ส่วนใหญ่ประเมินตำแหน่งจากคุณสมบัติของสัญญาณ เช่น RSSI แล้วจึงใช้อัลกอริทึมเช่น fingerprinting \parencite{...} ซึ่งสอดคล้องกับบริบทอาคารที่มีการสะท้อนและดูดกลืนคลื่น จึงสนับสนุนให้โครงงานนี้เลือก BLE beacon เป็นแหล่งสัญญาณอ้างอิงภายในอาคาร

(Adjust cite keys and prose to match actual `refs.bib` entries.)
