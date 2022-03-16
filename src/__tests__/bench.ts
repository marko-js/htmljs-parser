import fs from "fs";
import os from "os";
import path from "path";
import cp from "child_process";
import degit from "degit";
import Benchmark from "benchmark";
import { repository } from "../../package.json";
import { createParser } from "..";

const FIXTURES = path.join(__dirname, "fixtures");
const GREP = new RegExp(process.env.GREP || ".", "g");
const COMPARE = process.env.COMPARE;

(async () => {
  let altParser:
    | undefined
    | {
        createParser(handlers: unknown): {
          parse(src: string, filename: string): void;
        };
      };

  if (COMPARE) {
    const tempDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "htmljs-parser-bench")
    );
    await degit(`${repository.url}#${COMPARE}`).clone(tempDir);
    await new Promise<void>((resolve, reject) => {
      cp.exec("npm ci && npm run --if-present build", { cwd: tempDir }, (err) =>
        err ? reject(err) : resolve()
      );
    });

    altParser = require(tempDir);
  }

  for (const entry of fs.readdirSync(FIXTURES)) {
    const filename = path.join(FIXTURES, entry, "input.marko");
    if (!GREP.test(entry)) continue;

    const src = await fs.promises.readFile(filename, "utf-8");
    const suite = new Benchmark.Suite();
    suite.add(entry, () => {
      const parser = createParser({
        onError() {},
        onText() {},
        onCDATA() {},
        onDoctype() {},
        onDeclaration() {},
        onComment() {},
        onTagName() {},
        onTagShorthandId() {},
        onTagShorthandClass() {},
        onTagVar() {},
        onTagArgs() {},
        onTagParams() {},
        onAttrName() {},
        onAttrArgs() {},
        onAttrValue() {},
        onAttrMethod() {},
        onAttrSpread() {},
        onOpenTagEnd() {},
        onCloseTag() {},
        onScriptlet() {},
      });
      parser.parse(src, filename);
    });

    if (altParser) {
      suite.add(`${entry} #${COMPARE}`, () => {
        const parser = altParser!.createParser({});
        parser.parse(src, filename);
      });
    }

    suite.on("cycle", (event: Benchmark.Event) => {
      console.log(String(event.target));
    });

    const pending = new Promise((r) => suite.on("complete", r));
    suite.run();
    await pending;

    if (altParser) {
      console.log(`Fastest is ${suite.filter("fastest").map("name")}`);
    }
  }
})();
