import fs from "node:fs/promises";
import path from "node:path";

import { build, type BuildOptions } from "esbuild";

const opts: BuildOptions = {
  bundle: true,
  outdir: "dist",
  platform: "node",
  target: ["node14"],
  entryPoints: ["src/index.ts"],
  minifySyntax: true,
};

await Promise.all([
  // The repo root is type=module for the TS sources; mark dist as commonjs
  // so the .js bundle and .d.ts files keep their original semantics.
  fs.writeFile(
    path.join(opts.outdir!, "package.json"),
    JSON.stringify({ type: "commonjs" }) + "\n",
  ),
  build({
    ...opts,
    format: "cjs",
  }),
  build({
    ...opts,
    format: "esm",
    outExtension: { ".js": ".mjs" },
  }),
]);
