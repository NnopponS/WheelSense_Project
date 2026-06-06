import fs from "node:fs";
import path from "node:path";
import { demoTheaterAssets } from "./assets";

function collectUrls(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    if (value.startsWith("/demo-theater/")) out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectUrls(item, out);
    return out;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectUrls(item, out);
  }
  return out;
}

describe("demo theater assets", () => {
  it("only references files that exist in public assets", () => {
    const urls = collectUrls(demoTheaterAssets).filter((url) => !url.endsWith("/fonts/pixelart.ttf"));
    const missing = urls.filter((url) => {
      const relative = url.replace(/^\/demo-theater\//, "");
      return !fs.existsSync(path.join(process.cwd(), "public", "demo-theater", relative));
    });

    expect(missing).toEqual([]);
  });
});
