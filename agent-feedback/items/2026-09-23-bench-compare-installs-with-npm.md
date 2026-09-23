---
type: dx
impact: low
effort: low
site: bench.ts
---

# Install the COMPARE build with pnpm in the bench

`COMPARE=<ref> pnpm run bench` clones the ref and runs `npm ci && npm run --if-present build` in it, but the repo only has a `pnpm-lock.yaml`, so `npm ci` exits with `EUSAGE` and the comparison never runs. Run `pnpm install --frozen-lockfile && pnpm run build` instead. Because the clone's directory is created before the install, a failed run also leaves it behind, and the next run sees it and skips the install, then fails to import the unbuilt `dist`. Only treat the clone as ready once its build has finished.

Check: `rm -rf "$TMPDIR/htmljs-bench-main" /tmp/htmljs-bench-main; COMPARE=main GREP=attr-comma pnpm run bench` fails with `The npm ci command can only install with an existing package-lock.json`.
