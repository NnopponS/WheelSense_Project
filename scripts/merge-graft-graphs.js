#!/usr/bin/env node
// Merge subproject graft graphs into a root graft/.graph/wiring.json.
// Run from repo root: node scripts/merge-graft-graphs.js
// Idempotent — safe to re-run after `graft build` in any subproject.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SUBPROJECTS = [
  { name: "frontend", dir: "frontend" },
  { name: "server", dir: "server" },
  { name: "firmware", dir: "firmware" },
  { name: "e2e", dir: "e2e" },
  { name: "mobile-app/wheelsense-gateway-flutter", dir: "mobile-app/wheelsense-gateway-flutter" },
  { name: "scripts", dir: "scripts" },
];
const OUT_DIR = path.join(ROOT, "graft", ".graph");
const OUT_FILE = path.join(OUT_DIR, "wiring.json");

function loadGraph(project) {
  const file = path.join(ROOT, project.dir, "graft", ".graph", "wiring.json");
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function prefixPath(p, sub) {
  if (!p) return p;
  // graft paths are relative to subproject root; prefix with sub/
  return `${sub}/${p}`;
}

function prefixId(id, sub) {
  if (!id) return id;
  return `${sub}/${id}`;
}

const merged = {
  meta: {
    origin: "merged-subproject-graphs",
    subprojects: SUBPROJECTS.map(({ name }) => name),
    merged_at: new Date().toISOString(),
    note: "Root graft build OOMs on Windows V8 Zone; this file merges the per-project graphs listed above. Re-run scripts/merge-graft-graphs.js after `graft build` in any project.",
  },
  nodes: [],
  edges: [],
};

let totalNodes = 0;
let totalEdges = 0;

for (const project of SUBPROJECTS) {
  const g = loadGraph(project);
  if (!g) {
    console.warn(`skip ${project.name}: no graft/.graph/wiring.json`);
    continue;
  }

  // Merge nodes — prefix id and path with sub/ (nodes is an array)
  const nodes = Array.isArray(g.nodes) ? g.nodes : Object.values(g.nodes || {});
  for (const node of nodes) {
    const newId = prefixId(node.id, project.name);
    merged.nodes.push({
      ...node,
      id: newId,
      path: prefixPath(node.path, project.name),
    });
    totalNodes++;
  }

  // Merge edges — prefix from/to ids (edges is an array)
  const edges = Array.isArray(g.edges) ? g.edges : [];
  for (const e of edges) {
    merged.edges.push({
      ...e,
      from: e.from ? prefixId(e.from, project.name) : e.from,
      to: e.to ? prefixId(e.to, project.name) : e.to,
    });
    totalEdges++;
  }

  console.log(`merged ${project.name}: ${nodes.length} nodes, ${edges.length} edges`);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify(merged, null, 0));
console.log(`\nroot graft: ${totalNodes} nodes, ${totalEdges} edges → ${path.relative(ROOT, OUT_FILE)}`);
