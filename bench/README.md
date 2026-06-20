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

| script | what it's for |
| --- | --- |
| `npm run bench` | mitata report: whole-corpus + per-repo throughput. Good overview. |
| `npm run bench:run` | quick in-process interleaved A/B (current vs baseline). Fast feedback. |
| `npm run bench:ab` | **process-isolated** A/B with a sign test. Use this to confirm a win. |

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
