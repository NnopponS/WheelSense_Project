import { build } from "tsup";

await build({
  entry: ["src/index.ts"],
  format: ["cjs"],
  outDir: "dist",
  clean: false,
  sourcemap: true,
  dts: false,
  shims: false
});
