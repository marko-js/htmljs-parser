import assert from "node:assert/strict";
import { isValidAttrValue, isValidStatement } from "..";

describe("validation helpers", () => {
  describe("isValidStatement", () => {
    it("accepts single-line expressions", () => {
      assert.equal(isValidStatement("foo + bar"), 2);
    });

    it("accepts indented continuation lines", () => {
      assert.equal(isValidStatement("foo\n  + bar"), 1);
    });

    it("rejects unindented continuation lines", () => {
      assert.equal(isValidStatement("foo\nbar"), 0);
    });

    it("accepts indented ternary continuation", () => {
      assert.equal(isValidStatement("foo ?\n  bar : baz"), 2);
    });

    it("rejects unterminated groups", () => {
      assert.equal(isValidStatement("(foo"), 0);
    });

    it("rejects mismatched closing groups", () => {
      assert.equal(isValidStatement(")"), 0);
    });
  });

  describe("isValidAttrValue", () => {
    it("accepts html attr values with operators", () => {
      assert.equal(isValidAttrValue("foo + bar", false), 2);
    });

    it("accepts html attr values containing =>", () => {
      assert.equal(isValidAttrValue("foo=>bar", false), 2);
    });

    it("rejects html attr values terminated by >", () => {
      assert.equal(isValidAttrValue("foo >", false), 0);
    });

    it("accepts concise attr values with >", () => {
      assert.equal(isValidAttrValue("foo > bar", true), 2);
    });

    it("rejects html attr values terminated by commas", () => {
      assert.equal(isValidAttrValue("foo, bar", false), 0);
    });

    it("accepts html attr values containing semicolons", () => {
      assert.equal(isValidAttrValue("foo;", false), 2);
    });

    it("rejects concise attr values terminated by semicolons", () => {
      assert.equal(isValidAttrValue("foo;", true), 0);
    });

    it("accepts html attr values with decrement operator", () => {
      assert.equal(isValidAttrValue("foo --", false), 2);
    });

    it("rejects concise attr values with decrement operator", () => {
      assert.equal(isValidAttrValue("foo --", true), 0);
    });

    it("rejects attr values separated only by whitespace", () => {
      assert.equal(isValidAttrValue("foo bar", false), 0);
    });

    it("accepts continued multiline logical expression", () => {
      assert.equal(isValidAttrValue("a &&\nb", true), 1);
    });

    it("accepts continued multiline enclosed logical expression", () => {
      assert.equal(isValidAttrValue("a && (\nb\n)", true), 2);
    });
  });
});
