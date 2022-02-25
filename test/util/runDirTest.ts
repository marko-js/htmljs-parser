import fs from "fs";
import TreeBuilder from "./TreeBuilder";
import { createLegacyParser } from "../../src";

export default function runTest() {
  return function ({ test, resolve, snapshot }) {
    test(function () {
      const inputPath = resolve("input.htmljs");
      const testOptionsPath = resolve("test.js");
      const main = fs.existsSync(testOptionsPath) && require(testOptionsPath);

      snapshot(
        parse(
          main?.getSource?.() ??
            fs.readFileSync(inputPath, "utf8").replace(/\r\n|\n/g, "\n"),
          inputPath
        )
      );
    });
  };
}

function parse(text, inputPath) {
  const builder = new TreeBuilder(text);
  const parser = createLegacyParser(builder.listeners);
  parser.parse(text, inputPath);
  return builder.toString();
}
