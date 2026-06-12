import type { StateDefinition } from "../internal.ts";
import * as ErrorCode from "../util/error-code.ts";

// We enter STATE.JS_COMMENT_BLOCK after we encounter a "/*" sequence
// We leave STATE.JS_COMMENT_BLOCK when we see a "*/" sequence.
export const JS_COMMENT_BLOCK: StateDefinition = {
  name: "JS_COMMENT_BLOCK",

  enter(parent, start) {
    return {
      state: JS_COMMENT_BLOCK,
      parent,
      start,
      end: start,
    };
  },

  exit() {},

  parse(data, _maxPos, comment) {
    const idx = data.indexOf("*/", this.pos);
    if (idx === -1) {
      return this.emitError(
        comment,
        ErrorCode.MALFORMED_COMMENT,
        "EOF reached while parsing multi-line JavaScript comment",
      );
    }

    this.pos = idx + 2; // skip */
    this.exitState();
  },

  /* node:coverage ignore next */ // never has child states
  return() {},
};
