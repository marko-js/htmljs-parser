import fs from "fs";
import os from "os";
import path from "path";
import cp from "child_process";
import degit from "degit";
import Benchmark from "benchmark";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const API = require("../../dist") as typeof import("..");
const FIXTURES = path.join(__dirname, "fixtures");
const GREP = new RegExp(process.env.GREP || ".", "g");
const COMPARE = process.env.COMPARE;

(async () => {
  let compareModule: undefined | typeof API;

  if (COMPARE) {
    const tempDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "htmljs-parser-bench")
    );
    await degit(
      `https://github.com/marko-js/htmljs-parser.git#${COMPARE}`
    ).clone(tempDir);
    await new Promise<void>((resolve, reject) => {
      cp.exec("npm ci && npm run --if-present build", { cwd: tempDir }, (err) =>
        err ? reject(err) : resolve()
      );
    });

    compareModule = require(tempDir);
  }

  for (const entry of fs.readdirSync(FIXTURES)) {
    const filename = path.join(FIXTURES, entry, "input.marko");
    if (!GREP.test(entry)) continue;

    const src = await fs.promises.readFile(filename, "utf-8");
    const suite = new Benchmark.Suite();
    const { createParser } = API;
    suite.add(entry, () => {
      const parser = createParser({});
      parser.parse(src);
    });

    if (compareModule) {
      const { createParser } = compareModule;
      suite.add(`${entry} #${COMPARE}`, () => {
        const parser = createParser({});
        parser.parse(src);
      });
    }

    suite.on("cycle", (event: Benchmark.Event) => {
      console.log(String(event.target));
    });

    const pending = new Promise((r) => suite.on("complete", r));
    suite.run();
    await pending;

    if (compareModule) {
      console.log(`Fastest is ${suite.filter("fastest").map("name")}\n`);
    }
  }
})();
