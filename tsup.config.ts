import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  // Keep the CLI shebang so `node dist/index.js` and the `aai` bin both work.
  banner: { js: "#!/usr/bin/env node" },
});
