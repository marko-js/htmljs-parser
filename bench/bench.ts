// Mitata-based benchmark suite. Runs against the TypeScript source directly
// (Node strips types) so there is no build step between edits.
//
// Usage:
//   node bench/bench.ts                  # per-repo + whole-corpus throughput
//   GREP=examples node bench/bench.ts    # restrict the corpus
//   BASELINE=../old node bench/bench.ts  # A/B current vs a baseline source dir
//   (or run `npm run bench:snapshot` first to compare against a saved snapshot)
import { barplot, bench, group, run, summary } from "mitata";

import { type CorpusFile, corpusStats, loadCorpus } from "./corpus.ts";
import { type BenchSink, createHandlers, newSink } from "./handlers.ts";
import { loadBaseline, loadCurrent, type ParserAPI } from "./parser.ts";

const files = loadCorpus();
const stats = corpusStats(files);
const current = await loadCurrent();
const baseline = await loadBaseline();

console.log(
  `corpus: ${stats.count} files, ${(stats.bytes / 1024).toFixed(1)} KiB` +
    (baseline ? " (comparing current vs baseline)" : ""),
);

// A reusable parser per API keeps the measurement focused on parsing, not
// parser allocation (which is what real consumers do too).
function makeParse(api: ParserAPI) {
  const sink = newSink();
  const parser = api.createParser(createHandlers(sink));
  return (subset: CorpusFile[], s: BenchSink = sink) =>
    () => {
      for (const f of subset) {
        s.src = f.src;
        parser.parse(f.src);
      }
      return s.sum;
    };
}

const parseCurrent = makeParse(current);
const parseBaseline = baseline && makeParse(baseline);

function benchSet(label: string, subset: CorpusFile[]) {
  if (parseBaseline) {
    bench(`${label} (current)`, parseCurrent(subset));
    bench(`${label} (baseline)`, parseBaseline(subset));
  } else {
    bench(label, parseCurrent(subset));
  }
}

// Whole-corpus throughput — the headline number for rapid iteration.
summary(() => {
  barplot(() => {
    benchSet("ALL", files);
  });
});

// Per-repo breakdown so regressions can be localized.
for (const repo of [...stats.byRepo.keys()].sort()) {
  group(repo, () => {
    benchSet(
      repo,
      files.filter((f) => f.repo === repo),
    );
  });
}

await run();
