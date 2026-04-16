/**
 * Applies patches/packagename+version.patch into node_modules/packagename using `git apply`.
 * (patch-package's own parser fails on some valid unified diffs that git accepts.)
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const patchesDir = path.join(root, "patches");

function runGit(args, cwd) {
  return spawnSync("git", args, { cwd, encoding: "utf8", shell: false });
}

function applyOne(patchPath, pkgName) {
  const pkgPath = path.join(root, "node_modules", pkgName);
  if (!fs.existsSync(pkgPath)) {
    console.warn(`apply-node-patches: skip (missing package) ${pkgName}`);
    return;
  }
  const absPatch = path.resolve(patchPath);

  // Prefer reverse-check first: if the tree already matches the patched result, skip.
  const reverseOk = runGit(["apply", "--check", "-R", absPatch], pkgPath);
  if (reverseOk.status === 0) {
    console.log(`apply-node-patches: already applied ${path.basename(patchPath)}`);
    return;
  }

  const forwardOk = runGit(["apply", "--check", absPatch], pkgPath);
  if (forwardOk.status === 0) {
    const applied = runGit(["apply", absPatch], pkgPath);
    if (applied.status !== 0) {
      throw new Error(`git apply failed for ${path.basename(patchPath)}: ${applied.stderr || applied.stdout}`);
    }
    console.log(`apply-node-patches: applied ${path.basename(patchPath)}`);
    return;
  }

  throw new Error(
    `Cannot apply ${path.basename(patchPath)}: ${forwardOk.stderr || forwardOk.stdout || reverseOk.stderr || reverseOk.stdout}`,
  );
}

function main() {
  if (!fs.existsSync(patchesDir)) return;
  const files = fs.readdirSync(patchesDir).filter((f) => f.endsWith(".patch"));
  for (const f of files) {
    const base = f.replace(/\.patch$/, "");
    const plus = base.indexOf("+");
    if (plus === -1) continue;
    const pkgName = base.slice(0, plus);
    applyOne(path.join(patchesDir, f), pkgName);
  }
}

try {
  main();
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
