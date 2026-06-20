// Reproducible corpus collection. Gathers every *.marko file from sibling
// Marko repos, dedupes by content, flattens paths, and writes them under
// bench/corpus/<repo>/. The collected corpus is committed so the bench is
// self-contained; re-run this only to refresh it.
//
//   node bench/collect.ts [../sibling-repos-root]
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadCorpus } from "./corpus.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CORPUS = path.join(HERE, "corpus");
const ROOT = path.resolve(process.argv[2] ?? path.join(HERE, "../.."));
const REPOS = ["htmljs-parser", "prettier", "language-server", "examples"];

function walk(dir: string, out: string[] = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    // Never descend into this suite's own directory: it lives inside the
    // htmljs-parser repo we also walk and only contains tooling plus generated
    // artifacts (corpus, steady-state.marko, the .baseline snapshot).
    if (full === HERE) continue;
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".marko")) out.push(full);
  }
  return out;
}

fs.rmSync(CORPUS, { recursive: true, force: true });
const seen = new Set<string>();
let total = 0;
let dupes = 0;
const perRepo: Record<string, number> = {};

for (const repo of REPOS) {
  const base = path.join(ROOT, repo);
  if (!fs.existsSync(base)) {
    console.warn(`skip ${repo}: not found at ${base}`);
    continue;
  }
  perRepo[repo] = 0;
  for (const file of walk(base).sort()) {
    total++;
    const src = fs.readFileSync(file);
    const hash = crypto.createHash("md5").update(src).digest("hex");
    if (seen.has(hash)) {
      dupes++;
      continue;
    }
    seen.add(hash);
    const rel = path.relative(base, file).replace(/[/\\]/g, "__");
    const dest = path.join(CORPUS, repo, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, src);
    perRepo[repo]++;
  }
}

console.log(
  `collected ${total - dupes} unique files (${dupes} dupes skipped of ${total})`,
);
for (const [repo, n] of Object.entries(perRepo)) console.log(`  ${repo}: ${n}`);

// Build a single large, error-free input for steady-state throughput
// measurement. Greedily concatenate fixtures (largest first) keeping only
// those that don't introduce a parse error, so one parse exercises the hot
// loops without bailing early. Order is deterministic, so output is stable.
const { createParser } = await import("../src/index.ts");
const all = loadCorpus()
  .slice()
  .sort((a, b) => b.bytes - a.bytes);
let blob = "";
let kept = 0;
for (const f of all) {
  const candidate = blob ? `${blob}\n${f.src}` : f.src;
  let errored = false;
  try {
    createParser({
      onError() {
        errored = true;
      },
    }).parse(candidate);
  } catch {
    errored = true;
  }
  if (!errored) {
    blob = candidate;
    kept++;
  }
}
fs.writeFileSync(path.join(HERE, "steady-state.marko"), blob);
console.log(`steady-state.marko: ${kept} files, ${blob.length} bytes`);
