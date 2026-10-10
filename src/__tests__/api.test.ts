import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createParser, isValidAttrValue } from "../index.ts";

describe("api", () => {
  it("parses without any handlers registered", () => {
    const parser = createParser({});
    // Exercises every optional handler call against an empty handler object.
    parser.parse(
      [
        '<?xml version="1.0"?>',
        "<!DOCTYPE html>",
        "<![CDATA[raw]]>",
        "<!-- html comment -->",
        "// line comment",
        "/* block comment */",
        "$ const scriptlet = 1;",
        "$ { block(); }",
        "static const statement = 1",
        "<div.cls#id/tagVar|p|(arg) a=1 b:=bound ...spread c(x) { body } d<T>(y) { body }>",
        "  ${placeholder}",
        "</div>",
        "<tag<Args> typeArgs=1/>",
        "unclosed(",
      ].join("\n"),
    );
  });

  it("reports locations for offset ranges", () => {
    const parser = createParser({});
    parser.parse("<div>\n  hi\n</div>");
    assert.deepEqual(parser.locationAt({ start: 8, end: 8 }), {
      start: { line: 1, character: 2 },
      end: { line: 1, character: 2 },
    });
    assert.deepEqual(parser.locationAt({ start: 1, end: 12 }), {
      start: { line: 0, character: 1 },
      end: { line: 2, character: 1 },
    });
  });
});

describe("text delimiters", () => {
  function delimiters(src: string) {
    const out: (string | undefined)[] = [];
    const read = (range: { start: number; end: number } | undefined) =>
      range && src.slice(range.start, range.end);
    const parser = createParser({
      onText: (range) => out.push(read(range.delimiter)),
      onPlaceholder: (range) => out.push(read(range.delimiter)),
    });
    parser.parse(src);
    return out;
  }

  it("is the hyphens or backticks that begin the text", () => {
    assert.deepEqual(delimiters("a -- x"), ["--"]);
    assert.deepEqual(delimiters("a ---- x"), ["----"]);
    assert.deepEqual(delimiters("a `x`"), ["`"]);
    assert.deepEqual(delimiters("a ``x``"), ["``"]);
    assert.deepEqual(delimiters("-- x\n`y`"), ["--", "`"]);
  });

  it("applies to every line of a block and to placeholders", () => {
    assert.deepEqual(delimiters("a `\n  x ${y}\n  z\n  `"), [
      "`",
      "`",
      "`",
      "`",
    ]);
    assert.deepEqual(delimiters("a --\n  x\n  z\n  --"), ["--", "--"]);
  });

  it("is absent outside of a block", () => {
    assert.deepEqual(delimiters("<a>x ${y}</a>"), [undefined, undefined]);
    assert.deepEqual(delimiters("a `x`\n<b>y</b>"), ["`", undefined]);
    assert.deepEqual(delimiters("a -- x\nb\n  <c>y</c>"), ["--", undefined]);
  });

  it("covers text until the end of the input", () => {
    assert.deepEqual(delimiters("a `\n  x"), ["`"]);
  });
});

describe("validation internals", () => {
  it("rejects doubled operators followed by a terminator", () => {
    assert.equal(isValidAttrValue(" ++ ,", true), 0);
  });

  it("continues past arrows before terminators", () => {
    assert.equal(isValidAttrValue("a=>,b", true), 2);
  });

  it("rejects identifiers separated by whitespace at end of input", () => {
    assert.equal(isValidAttrValue("x i", true), 0);
  });
});
