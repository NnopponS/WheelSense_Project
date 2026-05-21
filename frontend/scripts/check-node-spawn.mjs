import { spawnSync } from "node:child_process";

const result = spawnSync(process.execPath, ["-v"], {
  encoding: "utf8",
});

const summary = {
  node: process.version,
  execPath: process.execPath,
  status: result.status,
  signal: result.signal,
  error: result.error ? result.error.message : null,
  stdout: result.stdout?.trim() ?? "",
  stderr: result.stderr?.trim() ?? "",
};

console.log(JSON.stringify(summary, null, 2));

if (result.error || result.status !== 0) {
  process.exit(1);
}
