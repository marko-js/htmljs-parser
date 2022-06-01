import { build, BuildOptions } from "esbuild";

const opts: BuildOptions = {
  bundle: true,
  outdir: "dist",
  platform: "node",
  target: ["node14"],
  entryPoints: ["src/index.ts"],
};

await Promise.all([
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
