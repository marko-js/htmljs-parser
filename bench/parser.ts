import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

export type ParserAPI = typeof import("../src/index.ts");

/** The parser built from the current working-tree source (no build step). */
export async function loadCurrent(): Promise<ParserAPI> {
  return import("../src/index.ts");
}

/**
 * Loads a baseline parser to A/B against. Resolution order:
 *  - `BASELINE` env var pointing at a dir containing `src/index.ts` (or a file)
 *  - the snapshot created by `npm run bench:snapshot` (bench/.baseline/src)
 * Returns undefined when no baseline is available.
 */
export async function loadBaseline(): Promise<ParserAPI | undefined> {
  const env = process.env.BASELINE;
  const candidates = env
    ? [env, path.join(env, "src/index.ts"), path.join(env, "index.ts")]
    : [path.join(HERE, ".baseline/src/index.ts")];

  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) {
      return import(path.resolve(c));
    }
  }
  return undefined;
}
