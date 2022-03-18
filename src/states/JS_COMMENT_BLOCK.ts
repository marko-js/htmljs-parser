import { CODE, StateDefinition } from "../internal";

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

  char(code) {
    if (
      code === CODE.ASTERISK &&
      this.lookAtCharCodeAhead(1) === CODE.FORWARD_SLASH
    ) {
      this.pos += 2; // skip */
      this.exitState();
    }
  },

  eol() {},

  eof(comment) {
    this.emitError(
      comment,
      "MALFORMED_COMMENT",
      "EOF reached while parsing multi-line JavaScript comment"
    );
  },

  return() {},
};
