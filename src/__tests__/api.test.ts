import assert from "node:assert/strict";
import { createParser, isValidAttrValue } from "..";

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
