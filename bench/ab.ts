// Robust A/B harness. Spawns measure.ts in a fresh process for each variant,
// alternating current/baseline across many rounds so per-process JIT
// nondeterminism and OS scheduling noise are averaged out. Reports the median
// across rounds plus a sign test (how many rounds favored current) so you can
// tell a real change from noise.
//
//   node bench/ab.ts            # requires a baseline (BASELINE=... or snapshot)
//   ROUNDS=21 node bench/ab.ts
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROUNDS = Number(process.env.ROUNDS || 15);
const MEASURE = path.join(HERE, "measure.ts");

interface Sample {
  perFile: { best: number; median: number };
  steady: { best: number; median: number };
  perFileBytes: number;
  steadyBytes: number;
  checksum: number;
}

function run(variant: string): Sample {
  const res = spawnSync(process.execPath, ["--expose-gc", MEASURE], {
    env: { ...process.env, VARIANT: variant },
    encoding: "utf-8",
  });
  if (res.status !== 0) {
    throw new Error(`measure (${variant}) failed: ${res.stderr}`);
  }
  return JSON.parse(res.stdout.trim().split("\n").pop()!);
}

const cur: Sample[] = [];
const base: Sample[] = [];
const curWins = { perFile: 0, steady: 0 };

process.stdout.write(`running ${ROUNDS} interleaved rounds`);
for (let i = 0; i < ROUNDS; i++) {
  // Alternate which variant runs first each round to cancel ordering bias.
  const currentFirst = i % 2 === 0;
  const c = currentFirst ? run("current") : undefined;
  const b = run("baseline");
  const c2 = currentFirst ? c! : run("current");
  cur.push(c2);
  base.push(b);
  if (c2.perFile.best < b.perFile.best) curWins.perFile++;
  if (c2.steady.best < b.steady.best) curWins.steady++;
  process.stdout.write(".");
}
process.stdout.write("\n\n");

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1];

function summarize(name: string, key: "perFile" | "steady", bytes: number) {
  const c = median(cur.map((s) => s[key].best));
  const b = median(base.map((s) => s[key].best));
  const delta = ((b - c) / b) * 100;
  const mbps = (t: number) => (bytes / 1e6 / (t / 1000)).toFixed(1);
  const wins = curWins[key];
  console.log(
    `${name.padEnd(14)} current ${c.toFixed(3)}ms (${mbps(c)} MB/s)  ` +
      `baseline ${b.toFixed(3)}ms (${mbps(b)} MB/s)`,
  );
  console.log(
    `${" ".repeat(14)} Δ median-of-best ${delta >= 0 ? "+" : ""}${delta.toFixed(
      2,
    )}%  |  current faster in ${wins}/${ROUNDS} rounds`,
  );
}

summarize("per-file", "perFile", cur[0].perFileBytes);
summarize("steady-state", "steady", cur[0].steadyBytes);

const cs = new Set([...cur, ...base].map((s) => s.checksum));
if (cs.size > 1) {
  console.error(`\n⚠️  checksum mismatch across variants: ${[...cs]}`);
  process.exitCode = 1;
}
