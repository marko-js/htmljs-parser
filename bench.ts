import "./build.ts";

import cp from "child_process";
import degit from "degit";
import fs from "fs/promises";
import { bench, group, run } from "mitata";
import os from "os";
import path from "path";
import { promisify } from "util";

const exec = promisify(cp.exec);
const api = (await import(
  "./dist/index.mjs" as string
)) as unknown as typeof import("./src/index.ts");
const FIXTURES = path.resolve("src/__tests__/fixtures");
const GREP = new RegExp(process.env.GREP || ".", "g");
const COMPARE = process.env.COMPARE;
let compareAPI: undefined | typeof api;

if (COMPARE) {
  const cwd = path.join(os.tmpdir(), `htmljs-bench-${COMPARE}`);
  const exists = await fs.mkdir(cwd).catch(() => true);
  if (!exists) {
    await degit(`marko-js/htmljs-parser#${COMPARE}`).clone(cwd);
    await exec("npm ci && npm run --if-present build", { cwd });
  }

  const pkg = JSON.parse(
    await fs.readFile(path.join(cwd, "package.json"), "utf-8"),
  );
  compareAPI = await import(
    path.join(cwd, pkg.exports?.["."].import ?? pkg.main)
  );
}

for (const entry of await fs.readdir(FIXTURES)) {
  if (!GREP.test(entry)) continue;
  const filename = path.join(FIXTURES, entry, "input.marko");
  const src = await fs.readFile(filename, "utf-8");
  const check = (mod: typeof api) => () => mod.createParser({}).parse(src);
  if (compareAPI) {
    group(() => {
      bench(entry, check(api));
      bench(`${entry}#${COMPARE}`, check(compareAPI!));
    });
  } else {
    bench(entry, check(api));
  }
}

await run();
