---
name: pdf-reader-mcp
description: >-
  Use Sylphx @sylphx/pdf-reader-mcp via Cursor MCP when you need reliable PDF text,
  metadata, page counts, page ranges, or embedded images (base64) from local paths
  or HTTPS URLs — especially large theses, papers, or batch PDFs. Prefer the MCP
  tool read_pdf over guessing PDF contents from binary or screenshots.
---

# PDF Reader MCP (@sylphx/pdf-reader-mcp)

## When to use

- Extract **text**, **metadata**, **page count**, or **images** from PDFs inside the repo or from a URL.
- **Large files**: use metadata or page ranges first; avoid pulling full text in one shot when unnecessary.
- **WheelSense / thesis**: paths such as `Thesis/latex/thesis.pdf` (relative to workspace) work when MCP `cwd` is the project root (see `.cursor/mcp.json`).

## Prerequisites

- Cursor MCP server **`pdf-reader`** enabled (project config: [`.cursor/mcp.json`](../../mcp.json)).
- After adding or editing `mcp.json`, **restart Cursor** so the server loads.
- Upstream package and docs: [SylphxAI/pdf-reader-mcp](https://github.com/SylphxAI/pdf-reader-mcp) · npm `@sylphx/pdf-reader-mcp`.

## Tool: `read_pdf`

Single tool for all operations. Call it through the MCP integration (server name `pdf-reader`).

### Parameters

| Parameter | Type | Default | Role |
|-----------|------|---------|------|
| `sources` | array | (required) | One or more `{ path?, url?, pages? }` |
| `include_full_text` | boolean | `false` | Full document text |
| `include_metadata` | boolean | `true` | Author, title, dates, etc. |
| `include_page_count` | boolean | `true` | Total pages |
| `include_images` | boolean | `false` | Embedded images (base64 + dimensions); large payloads |

### Source object

- `path`: local file — absolute (Windows/Unix) or **relative to server `cwd`**.
- `url`: `http` / `https` link to a PDF.
- `pages`: `"1-5,10,15-20"` or `[1, 2, 3]` for partial extraction.

### Patterns

**Quick inspect (fast):**

```json
{
  "sources": [{ "path": "Thesis/latex/thesis.pdf" }],
  "include_metadata": true,
  "include_page_count": true,
  "include_full_text": false
}
```

**Full text (watch size on long theses):**

```json
{
  "sources": [{ "path": "Thesis/latex/thesis.pdf" }],
  "include_full_text": true,
  "include_metadata": true,
  "include_page_count": true
}
```

**Chapter-style chunks:**

```json
{
  "sources": [{ "path": "Thesis/latex/thesis.pdf", "pages": "1-30" }],
  "include_full_text": true
}
```

**Remote PDF:**

```json
{
  "sources": [{ "url": "https://arxiv.org/pdf/2301.00001.pdf" }],
  "include_full_text": true
}
```

## Operational notes

- **Node**: upstream targets Node **22+**; use a current LTS/newer Node if `npx` fails to start the server.
- **`include_images: true`**: responses can be very large; enable only when images are needed.
- **“File not found”**: confirm path relative to `${workspaceFolder}` or pass an absolute path; fix `cwd` in `.cursor/mcp.json` if you intentionally run from another directory.
- **Manual install (optional):** `npm install -g @sylphx/pdf-reader-mcp` then point MCP `command` to the global binary if you prefer not to use `npx`.

## Relationship to other skills

- This skill is for **Cursor MCP + Sylphx PDF Reader** only. It does not replace [wheelsense-mcp-tools](../wheelsense-mcp-tools/SKILL.md) (WheelSense app MCP tools in `server/app/mcp/`).
