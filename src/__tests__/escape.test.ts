import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createParser, escapeText, TagType } from "../index.ts";

const texts = [
  "plain text",
  "C:\\Users\\dev",
  "a regexp /\\d+/",
  "${literal}",
  "$!{literal}",
  "a \\${escaped} literal",
  "\\\\",
  "ends with a slash\\",
  "ends with slashes\\\\",
  "$ and { apart",
];

describe("escapeText", () => {
  for (const text of texts) {
    for (const context of ["html", "concise", "parsed"] as const) {
      it(`reads back ${JSON.stringify(text)} as ${context} text`, () => {
        assert.deepEqual(readBack(context, escapeText(text)), [text]);
      });

      it(`reads back ${JSON.stringify(text)} before a placeholder in ${context} text`, () => {
        assert.deepEqual(
          readBack(context, `${escapeText(text, "${x}")}\${x}`),
          [text, "${x}"],
        );
      });

      it(`reads back ${JSON.stringify(text)} before escaped text in ${context} text`, () => {
        const next = escapeText("${y}");
        assert.deepEqual(readBack(context, escapeText(text, next) + next), [
          text + "${y}",
        ]);
      });
    }
  }
});

function readBack(context: "html" | "concise" | "parsed", body: string) {
  const parts: string[] = [];
  let text = "";
  const parser = createParser({
    onOpenTagName: () => (context === "parsed" ? TagType.text : undefined),
    onText(range) {
      text += parser.read(range);
    },
    onPlaceholder(range) {
      if (text) parts.push(text);
      text = "";
      parts.push(parser.read(range));
    },
  });

  parser.parse(context === "concise" ? `div -- ${body}` : `<div>${body}</div>`);
  if (text) parts.push(text);
  return parts;
}
