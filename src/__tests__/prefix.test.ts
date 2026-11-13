import assert from "node:assert/strict";
import { it } from "node:test";

import fs from "fs";
import path from "path";

import { createParser, type Handlers, type Range } from "../index.ts";

const FIXTURES = path.join(import.meta.dirname, "fixtures");

// Every prefix of every fixture is an EOF at each position, the state of a
// template being typed. Each one must parse without throwing, and every range
// it reports must lie within the input and not be inverted.
it("reports in-range ranges for every prefix of every fixture", async () => {
  const problems: string[] = [];
  for (const entry of fs.readdirSync(FIXTURES)) {
    const file = path.join(FIXTURES, entry, "input.marko");
    if (!fs.existsSync(file)) continue;
    const src = await fs.promises.readFile(file, "utf-8");

    for (let len = 0; len <= src.length; len++) {
      const check = (name: string, value: unknown) => {
        if (!value || typeof value !== "object") return;
        const range = value as Range;
        if (typeof range.start === "number" && typeof range.end === "number") {
          if (range.start < 0 || range.start > range.end || range.end > len) {
            problems.push(
              `${entry}@${len} ${name} ${range.start}..${range.end}`,
            );
          }
        }
        for (const key of Object.keys(value)) {
          check(`${name}.${key}`, (value as Record<string, unknown>)[key]);
        }
      };

      const handlers = new Proxy({} as Handlers, {
        get: (_, name) =>
          typeof name === "string" && name.startsWith("on")
            ? (range: unknown) => check(name, range)
            : undefined,
      });
      createParser(handlers).parse(src.slice(0, len));
    }
  }

  assert.deepEqual(problems.slice(0, 20), []);
});
