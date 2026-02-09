import assert from "node:assert/strict";
import { isValidAttrValue, isValidStatement } from "..";

describe("validation helpers", () => {
  describe("isValidStatement", () => {
    it("accepts single-line expressions", () => {
      assert.equal(isValidStatement("foo + bar"), true);
    });

    it("accepts indented continuation lines", () => {
      assert.equal(isValidStatement("foo\n  + bar"), true);
    });

    it("rejects unindented continuation lines", () => {
      assert.equal(isValidStatement("foo\nbar"), false);
    });

    it("accepts indented ternary continuation", () => {
      assert.equal(isValidStatement("foo ?\n  bar : baz"), true);
    });

    it("rejects unterminated groups", () => {
      assert.equal(isValidStatement("(foo"), false);
    });

    it("rejects mismatched closing groups", () => {
      assert.equal(isValidStatement(")"), false);
    });
  });

  describe("isValidAttrValue", () => {
    it("accepts html attr values with operators", () => {
      assert.equal(isValidAttrValue("foo + bar", false), true);
    });

    it("accepts html attr values containing =>", () => {
      assert.equal(isValidAttrValue("foo=>bar", false), true);
    });

    it("rejects html attr values terminated by >", () => {
      assert.equal(isValidAttrValue("foo >", false), false);
    });

    it("accepts concise attr values with >", () => {
      assert.equal(isValidAttrValue("foo > bar", true), true);
    });

    it("rejects html attr values terminated by commas", () => {
      assert.equal(isValidAttrValue("foo, bar", false), false);
    });

    it("accepts html attr values containing semicolons", () => {
      assert.equal(isValidAttrValue("foo;", false), true);
    });

    it("rejects concise attr values terminated by semicolons", () => {
      assert.equal(isValidAttrValue("foo;", true), false);
    });

    it("accepts html attr values with decrement operator", () => {
      assert.equal(isValidAttrValue("foo --", false), true);
    });

    it("rejects concise attr values with decrement operator", () => {
      assert.equal(isValidAttrValue("foo --", true), false);
    });

    it("rejects attr values separated only by whitespace", () => {
      assert.equal(isValidAttrValue("foo bar", false), false);
    });
  });
});
