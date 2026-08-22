#!/usr/bin/env node
/**
 * i18n Batch 1 Test — Shared Chrome (RoleShell, RoleSidebar, TopBar, NotificationDrawer)
 * RED test: asserts zero untranslated strings in these files.
 *
 * Run: node scripts/test-i18n-batch1.mjs
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");

const BATCH_FILES = [
  "components/RoleShell.tsx",
  "components/RoleSidebar.tsx",
  "components/TopBar.tsx",
  "components/NotificationDrawer.tsx",
];

function checkPattern(pattern, description, ignoreLine = () => false) {
  let totalHits = 0;
  const results = [];

  for (const file of BATCH_FILES) {
    const source = readFileSync(join(rootDir, file), "utf-8");
    const hits = source
      .split(/\r?\n/)
      .map((line, index) => ({ line, lineNumber: index + 1 }))
      .filter(({ line }) => !ignoreLine(line) && pattern.test(line))
      .map(({ line, lineNumber }) => `${lineNumber}:${line}`);
    if (hits.length > 0) {
      totalHits += hits.length;
      results.push({ file, hits });
    }
  }

  return { pattern, description, totalHits, results };
}

function main() {
  console.log("🔍 i18n Batch 1 Test — Shared Chrome");
  console.log("Files:", BATCH_FILES.join(", "));
  console.log();

  const checks = [
    checkPattern(/\bplaceholder="[^"{]/, "placeholder attributes"),
    checkPattern(/\baria-label="[^"{]/, "aria-label attributes"),
    checkPattern(/\btitle="[^"{]/, "title attributes"),
    checkPattern(
      />[^<>{}]*[A-Za-zก-๙][^<>{}]*</,
      "raw text nodes",
      (line) => line.includes("=>") || line.includes("queryFn:"),
    ),
  ];

  let totalFailures = 0;
  for (const check of checks) {
    if (check.totalHits > 0) {
      console.log(`❌ ${check.description}: ${check.totalHits} hit(s)`);
      for (const { file, hits } of check.results) {
        console.log(`   ${file}:`);
        for (const hit of hits) {
          console.log(`     ${hit}`);
        }
      }
      totalFailures += check.totalHits;
    } else {
      console.log(`✅ ${check.description}: 0 hits`);
    }
  }

  console.log();
  if (totalFailures > 0) {
    console.log(`❌ FAILED: ${totalFailures} untranslated string(s) found`);
    process.exit(1);
  } else {
    console.log("✅ PASSED: All strings are i18n'd");
    process.exit(0);
  }
}

main();
