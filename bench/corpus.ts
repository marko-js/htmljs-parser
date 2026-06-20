import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CORPUS_DIR = path.join(HERE, "corpus");

export interface CorpusFile {
  /** `<repo>/<flattened-name>.marko` */
  name: string;
  /** Source repo the fixture came from. */
  repo: string;
  src: string;
  bytes: number;
}

/**
 * Loads every fixture in the committed corpus, optionally filtered by a regexp
 * provided via the `GREP` env var (matched against the file name).
 */
export function loadCorpus(grep = process.env.GREP): CorpusFile[] {
  const filter = grep ? new RegExp(grep) : undefined;
  const files: CorpusFile[] = [];

  for (const repo of fs.readdirSync(CORPUS_DIR).sort()) {
    const repoDir = path.join(CORPUS_DIR, repo);
    if (!fs.statSync(repoDir).isDirectory()) continue;
    for (const entry of fs.readdirSync(repoDir).sort()) {
      const name = `${repo}/${entry}`;
      if (filter && !filter.test(name)) continue;
      const src = fs.readFileSync(path.join(repoDir, entry), "utf-8");
      files.push({ name, repo, src, bytes: Buffer.byteLength(src) });
    }
  }

  return files;
}

export function corpusStats(files: CorpusFile[]) {
  const byRepo = new Map<string, { files: number; bytes: number }>();
  let bytes = 0;
  for (const f of files) {
    bytes += f.bytes;
    const e = byRepo.get(f.repo) ?? { files: 0, bytes: 0 };
    e.files++;
    e.bytes += f.bytes;
    byRepo.set(f.repo, e);
  }
  return { count: files.length, bytes, byRepo };
}
