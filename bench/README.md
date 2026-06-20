# htmljs-parser benchmark suite

A corpus-driven benchmark suite for the parser, designed for **rapid iteration**:
it runs against the TypeScript source directly (Node strips types), so there is
**no build step** between edits.

## Corpus

`corpus/` contains 1027 unique `.marko` fixtures gathered from the Marko
ecosystem (`htmljs-parser`, `prettier`, `language-server`, `examples`),
deduplicated by content and grouped by source repo. `steady-state.marko` is a
single ~155 KB error-free document built by greedily concatenating fixtures that
parse without errors — it isolates steady-state parsing throughput from the
fixed per-parse overhead that dominates the many tiny fixtures.

Both are committed so the suite is self-contained. Regenerate them (e.g. after
pulling new fixtures into sibling repos) with:

```sh
npm run bench:collect      # node bench/collect.ts [../sibling-repos-root]
```

## Measuring

The parser parses fast and the per-change deltas are small (1–3%), so naive
timing is dominated by noise. The suite offers three tools, in increasing order
of rigor:

| script              | what it's for                                                          |
| ------------------- | ---------------------------------------------------------------------- |
| `npm run bench`     | mitata report: whole-corpus + per-repo throughput. Good overview.      |
| `npm run bench:run` | quick in-process interleaved A/B (current vs baseline). Fast feedback. |
| `npm run bench:ab`  | **process-isolated** A/B with a sign test. Use this to confirm a win.  |

### A/B workflow

```sh
git stash                  # or check out a pristine tree
npm run bench:snapshot     # copy src/ -> bench/.baseline/src
git stash pop              # bring your changes back
npm run bench:ab           # compares current src vs the snapshot
```

`bench:ab` spawns each variant in its own process (so the two builds don't share
a JIT and contaminate each other's measurements), alternates run order, and
repeats `ROUNDS` times (default 15; use `ROUNDS=30` for a high-confidence read).
It reports the median-of-best delta **and a sign test** — "current faster in
N/ROUNDS rounds". On this hardware the steady-state metric is the reliable
signal; treat a change as real only when the sign test is lopsided (e.g.
≥`0.8·ROUNDS`). It also fails if the parser output checksum changes, catching
accidental behavior changes.

Useful env vars: `GREP` (filter corpus by name), `ITERS`, `WARMUP`, `ROUNDS`,
`BASELINE` (path to an alternate baseline source dir instead of the snapshot).

## Profiling

```sh
node --cpu-prof --cpu-prof-dir=/tmp/prof bench/run.ts
```

As of this writing the hot spots on the steady-state corpus are, in order:
`EXPRESSION.parse` (~25%), the main dispatch loop (~12%), `HTML_CONTENT.parse`
(~9%), `OPEN_TAG.parse` (~7%), and `exitState` (~5%). Roughly 10% of time is GC,
driven mostly by the range objects allocated for handler callbacks (inherent to
the API).

## Notes for future optimization work

- The state objects all share a uniform shape (`enter`/`exit`/`parse`/`return`).
  Keep it that way: making `exit`/`return` optional to skip empty no-ops was
  measured as a **~4% regression** because it made the state objects polymorphic
  and deoptimized the dispatch property loads.
- Hoisting monomorphic property reads out of hot loops is neutral — V8 already
  handles them. Look for eliminated work (skipped indirect calls, skipped
  scans), not fewer property reads.
- The `this.activeState.parse.call(this, …)` dispatch convention is **already
  optimal**. A microbenchmark of megamorphic dispatch found `fn.call(this, …)`
  ~14% _faster_ than passing the parser as an explicit first argument
  (`fn(parser, …)`), so the common "thread context explicitly" refactor would
  regress. Don't bother rewriting the state method signatures.
- Eager run-consumption (a tight inner `do { pos++ } while (…)` loop) is a big
  win for **long** runs — HTML text between tags already uses it — but a
  _regression_ for short runs: applying it to identifier characters in
  `EXPRESSION` was measurably slower (2/24 rounds) because expression
  identifiers are short and the inner-loop overhead isn't amortized. The plain
  `pos++; continue;` word-character fast path is faster.
- A whitespace fast path in `EXPRESSION` (skip the termination checks for
  insignificant whitespace) was only marginal (steady ~+1%, per-file slightly
  negative) — the extra `isWhitespaceCode` check on every punctuation char
  roughly cancels the gain. Not worth it.

### Allocation / GC

Per parse of the steady-state corpus the parser makes ~21k handler-payload
allocations (one range object per `on*` callback) plus a comparable number of
internal allocations (one `Meta` per `enterState`, a `groupStack: []` per
`EXPRESSION`, `quasis`/`expressions` per tag). GC is ~10% of wall time. The
handler payloads are inherent to the API; the internal allocations are
reducible (e.g. lazy/ shared `groupStack`, sharing an empty `expressions`
array) but the measured upside is small (~1%) and the changes risk
re-introducing polymorphism, so they have not been pursued. Parsing with no
handlers (`{}`) is only ~13% faster, so allocation is not the dominant cost —
the per-character state-machine work is.

### Bulk (native) text scanning — large win for long runs

The text-consuming states (`HTML_CONTENT`, `PARSED_TEXT_CONTENT`) advance over
runs of "boring" characters until the next special one. A per-character JS loop
is optimal for short runs but slow for long ones; a native scan (a sticky
`RegExp` finding the next special char) is the opposite. Measured crossover
(`/tmp/scan.mjs` style microbench):

| run length | regex vs char-loop |
| ---------- | ------------------ |
| 3          | 1.8× slower        |
| 8          | 1.3× slower        |
| 20         | 1.5× faster        |
| 80         | 2.4× faster        |
| 2000       | 3.4× faster        |

A naive "always regex" or a "per-char threshold counter" both regress dense
markup. The version that works is an **adaptive hybrid** that keeps the
per-character cost at two comparisons by folding a length threshold into the
loop bound, then switches to the native scan only once a run passes the
threshold (~16 chars):

```ts
const limit = this.pos + BULK_SCAN_THRESHOLD;
const stop = limit < maxPos ? limit : maxPos;
do {
  this.pos++;
} while (this.pos < stop && !isSpecial(data.charCodeAt(this.pos)));
if (
  this.pos === limit &&
  limit < maxPos &&
  !isSpecial(data.charCodeAt(this.pos))
) {
  RE.lastIndex = this.pos;
  const next = RE.exec(data);
  this.pos = next === null ? maxPos : next.index;
}
```

Results vs the per-character loop:

- **Content-heavy templates (prose between tags): ~+43%** (255 → 447 MB/s).
- **Script/style-heavy templates: ~+47%** (271 → 517 MB/s).
- **Dense fixture corpus: within ±1% (measurement noise floor).** The extra
  work is per-run (a couple of ops + one short-circuiting comparison), not
  per-char, so the common dense case is not measurably affected.

This is a genuine large-scale lever, but the corpus that represents typical
Marko is dense markup, where it is a wash — the upside is realised only on
content- or script-heavy templates. Whether to ship it is a workload call.
