import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Copies the current src/ into bench/.baseline/src so it can be A/B'd against
// while you edit src/. Run this on a pristine tree *before* optimizing, then
// run the bench with the baseline available to compare current vs baseline.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, "../src");
const DEST = path.join(HERE, ".baseline/src");

fs.rmSync(path.join(HERE, ".baseline"), { recursive: true, force: true });
fs.cpSync(SRC, DEST, { recursive: true });
console.log(`Snapshotted src/ -> ${path.relative(process.cwd(), DEST)}`);
