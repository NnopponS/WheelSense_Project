#!/usr/bin/env node
/**
 * i18n Batch 1 Test — Shared Chrome (RoleShell, RoleSidebar, TopBar, NotificationDrawer)
 * RED test: asserts zero untranslated strings in these files.
 *
 * Run: node scripts/test-i18n-batch1.mjs
 */

import { execSync } from "child_process";
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

function runRipgrep(pattern, file) {
  try {
    const cmd = `cd "${rootDir}" && rg -n "${pattern}" ${file} || true`;
    const output = execSync(cmd, { encoding: "utf-8" });
    return output.trim();
  } catch (e) {
    return "";
  }
}

function checkPattern(pattern, description) {
  let totalHits = 0;
  const results = [];

  for (const file of BATCH_FILES) {
    const output = runRipgrep(pattern, file);
    if (output) {
      const lines = output.split("\n").filter(Boolean);
      totalHits += lines.length;
      results.push({ file, hits: lines });
    }
  }

  return { pattern, description, totalHits, results };
}

function main() {
  console.log("🔍 i18n Batch 1 Test — Shared Chrome");
  console.log("Files:", BATCH_FILES.join(", "));
  console.log();

  const checks = [
    checkPattern('placeholder="[^{]', "placeholder attributes"),
    checkPattern('aria-label="[^{]', "aria-label attributes"),
    checkPattern('title="[^{]', "title attributes"),
    checkPattern('>[^<{}]*[A-Za-zก-๙][^<{}]*<', "raw text nodes"),
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
