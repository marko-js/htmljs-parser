import { CODE, StateDefinition, ValuePart } from "../internal";

// We enter STATE.JS_COMMENT_BLOCK after we encounter a "/*" sequence
// We leave STATE.JS_COMMENT_BLOCK when we see a "*/" sequence.
export const JS_COMMENT_BLOCK: StateDefinition<ValuePart> = {
  name: "JS_COMMENT_BLOCK",

  enter(comment) {
    comment.value = "/*";
  },

  eol(str, comment) {
    comment.value += str;
  },

  eof(comment) {
    this.notifyError(
      comment,
      "MALFORMED_COMMENT",
      "EOF reached while parsing multi-line JavaScript comment"
    );
  },

  char(ch, code, comment) {
    if (
      code === CODE.ASTERISK &&
      this.lookAtCharCodeAhead(1) === CODE.FORWARD_SLASH
    ) {
      comment.value += "*/";
      this.exitState("*/");
    } else {
      comment.value += ch;
    }
  },
};
