# Agent Feedback

Actionable observations that were out of scope for the task that surfaced them. In scope: fix it. Out of scope: file it here. Never expand a task's diff to fix an item recorded here.

One item per file in `items/`, named `YYYY-MM-DD-<slug>.md`.

## When to file

Anything a future contributor should act on:

- `bug`: a suspected defect left unpursued
- `cleanup`: duplication, dead code, inconsistency, refactor opportunity
- `perf`: speed, memory, payload or bundle size, build time
- `dx`: friction in builds, tests, tooling, or repo workflows
- `unclear`: code or docs that were confusing, and what would have clarified them

## Rules

1. **Verify first.** A guess is not feedback. Every item ends with a check that reproduces the claim.
2. **Dedupe first.** `grep -ril '<path or symbol>' agent-feedback/items`. If a file covers it, edit that file only when you add new information.
3. **Check the code site.** An intent comment there means the behavior is deliberate. Do not file it.
4. **Self-contained.** Paths, symbols, reasoning. Never reference conversation context or "earlier analysis".
5. **Cite by stable symbol**, never line number.
6. **State the defect and the check.** Never describe what works. Never narrate a landed fix.
7. **Direction is preventive for `unclear` and `dx`.** Name what would have stopped the trip: a comment, a doc line, a lint rule, a compile error, a debug-only warning. The goal is that the next agent does not hit it.
8. **Resolve by deleting the file in the same PR as the fix.** A partial fix rewrites the file to what remains.
9. **Won't-fix is a maintainer's call, never an agent's.** Add a comment (two lines max) at the code site stating the behavior and why it is deliberate, then delete the file. The comment is what stops re-filing. Never consult git history to learn whether something was resolved; if it is not in `items/` and not commented at the site, it is unresolved.

## Item format

`items/YYYY-MM-DD-<slug>.md`:

```md
---
type: bug | cleanup | perf | dx | unclear
impact: high | med | low
effort: high | med | low
site: <path/to/file.ts> › <nearestStableSymbol>
---

# <one-line imperative title>

<2-6 sentences: the problem, why it matters, a concrete direction. Cut evidence a fixer can re-derive from the site.>

Check: <command, input, or observation that reproduces the claim>
```

`impact`: what breaks or is lost if ignored. `effort`: expected size of the fix. Both are the filer's estimate; triage re-judges.

## Repo notes

Single package, pnpm, ESM TypeScript run directly by Node's type stripping. No build step is needed to reproduce.

**Reproduce a claim.** Drive the parser from `src/index.ts` directly:

```sh
node --input-type=module -e 'import{createParser,TagType}from"./src/index.ts";const p=createParser({onError:e=>console.log("ERR",e.message),onText:r=>console.log("text",JSON.stringify(p.read(r)))});p.parse("<div/>")'
```

`createParser` takes one handler object; every range handed to a handler is an offset pair, so read it back with `p.read(range)`. `onOpenTagName` returns a `TagType` to choose the body mode (`TagType.text` for `<style>`/`<script>`).

**Guard tests.** Fixture directories under `src/__tests__/fixtures/<name>/`, each holding an `input.marko` (plus optional `test.ts` for options). The runner walks the directory; there is no index to register. Snapshots live beside the fixture and are regenerated with `pnpm test:update` (`UPDATE_SNAPSHOTS=1`). Never hand-edit a snapshot. `pnpm test` runs `node --test` over `src/**/__tests__/*.test.ts`.

**Pre-ship.** `pnpm run lint` (tsc, eslint, prettier check) and `pnpm test`. `pnpm run build` for a release-shaped check. Add a changeset with `pnpm run change` for any behavior change.

**Gotchas.** State machine files under `src/states/` are mutually recursive through `STATE`; a change to one state's `parse`/`return`/`exitState` usually needs the mirror change in its sibling. Error text is part of the snapshot, so a diagnostic reword shows up as a fixture diff. `pnpm run bench` measures parse throughput; run it when a change touches a hot text-scanning loop.
