#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");

const templates = {
  local: `# WheelSense local development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/wheelsense?schema=public
MQTT_URL=mqtt://broker.emqx.io:1883
MQTT_TOPIC=wheelsense/#
API_PORT=4000
WEB_PORT=3000
ONLINE_WINDOW_SEC=30
ROUTE_RECOVERY_WINDOW_SEC=120
REDIS_URL=redis://localhost:6379
NEXT_PUBLIC_API_URL=http://localhost:4000
`,
  docker: `# WheelSense docker compose defaults
DATABASE_URL=postgresql://postgres:postgres@db:5432/wheelsense?schema=public
MQTT_URL=mqtt://broker.emqx.io:1883
MQTT_TOPIC=wheelsense/#
API_PORT=4000
WEB_PORT=3000
ONLINE_WINDOW_SEC=30
ROUTE_RECOVERY_WINDOW_SEC=120
REDIS_URL=redis://redis:6379
NEXT_PUBLIC_API_URL=http://api:4000
`
};

const args = process.argv.slice(2);
const force = args.includes("--force");
let mode = "local";
for (const arg of args) {
  if (arg === "--docker") mode = "docker";
  else if (arg.startsWith("--mode=")) {
    const next = arg.split("=")[1];
    if (next && templates[next]) mode = next;
  }
}

const write = (file, content) => {
  const target = resolve(repoRoot, file);
  const dir = dirname(target);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!force && existsSync(target)) {
    console.log(`[setup-env] skip ${file}`);
    return;
  }
  writeFileSync(target, content, "utf8");
  console.log(`[setup-env] wrote ${file}`);
};

write(".env.local", templates.local);
write(".env.docker", templates.docker);
write(".env", templates[mode]);

console.log(`Environment configured using '${mode}' template (use --force to overwrite).`);
