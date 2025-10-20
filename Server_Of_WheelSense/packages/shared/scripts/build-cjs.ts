import { build } from "tsup";

await build({
  entry: ["src/index.ts"],
  format: ["cjs"],
  outDir: "dist",
  sourcemap: true,
  clean: false,
  shims: false,
  dts: false
});
