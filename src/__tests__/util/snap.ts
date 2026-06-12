import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const UPDATE = !!process.env.UPDATE_SNAPSHOTS;

/**
 * Compares `output` against `<dir>/__snapshots__/<title>.expected<ext>`,
 * creating it when missing and rewriting it when UPDATE_SNAPSHOTS is set.
 * On mismatch a sibling `.actual` file (gitignored) is written for diffing.
 */
export default async function snap(
  output: string,
  { dir, title, ext }: { dir: string; title: string; ext: string },
) {
  const snapshotDir = path.join(dir, "__snapshots__");
  const expectedFile = path.join(snapshotDir, `${title}.expected${ext}`);
  const actualFile = path.join(snapshotDir, `${title}.actual${ext}`);
  const expected = await fs.promises
    .readFile(expectedFile, "utf-8")
    .catch(() => undefined);

  if (UPDATE || expected === undefined) {
    await fs.promises.mkdir(snapshotDir, { recursive: true });
    await fs.promises.writeFile(expectedFile, output, "utf-8");
    await fs.promises.rm(actualFile, { force: true });
    return;
  }

  try {
    // Normalize expected newlines for checkouts with windows line endings.
    assert.strictEqual(
      output,
      expected.replace(/\r\n/g, "\n"),
      path.relative(process.cwd(), actualFile),
    );
    await fs.promises.rm(actualFile, { force: true });
  } catch (err) {
    await fs.promises.writeFile(actualFile, output, "utf-8");
    throw err;
  }
}
