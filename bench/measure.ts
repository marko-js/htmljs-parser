// Single-variant measurement worker, intended to be spawned by ab.ts so that
// each variant is JIT-compiled in its own process (no cross-talk between the
// current and baseline builds, which is the dominant source of A/B noise in a
// single process). Prints one JSON line with the best/median timings.
//
//   VARIANT=current|baseline node --expose-gc bench/measure.ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { corpusStats, loadCorpus } from "./corpus.ts";
import { createHandlers, newSink } from "./handlers.ts";
import { loadBaseline, loadCurrent } from "./parser.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ITERS = Number(process.env.ITERS || 150);
const WARMUP = Number(process.env.WARMUP || 40);
const variant = process.env.VARIANT === "baseline" ? "baseline" : "current";

const files = loadCorpus();
const stats = corpusStats(files);
const blob = fs.readFileSync(path.join(HERE, "steady-state.marko"), "utf-8");

const api = variant === "baseline" ? await loadBaseline() : await loadCurrent();
if (!api) {
  console.error("no baseline available");
  process.exit(2);
}

const sink = newSink();
const parser = api.createParser(createHandlers(sink));

function bestMedian(work: () => void) {
  for (let i = 0; i < WARMUP; i++) work();
  (globalThis as { gc?: () => void }).gc?.();
  const ts: number[] = [];
  for (let i = 0; i < ITERS; i++) {
    const t = performance.now();
    work();
    ts.push(performance.now() - t);
  }
  ts.sort((a, b) => a - b);
  return { best: ts[0], median: ts[ts.length >> 1] };
}

const perFile = bestMedian(() => {
  for (const f of files) {
    sink.src = f.src;
    parser.parse(f.src);
  }
});
const steady = bestMedian(() => {
  sink.src = blob;
  parser.parse(blob);
});

process.stdout.write(
  JSON.stringify({
    variant,
    perFile,
    steady,
    perFileBytes: stats.bytes,
    steadyBytes: Buffer.byteLength(blob),
    checksum: sink.sum,
  }) + "\n",
);
