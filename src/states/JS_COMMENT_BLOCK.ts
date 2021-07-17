import { Parser, CODE, STATE } from "../internal";

// We enter STATE.JS_COMMENT_BLOCK after we encounter a "/*" sequence
// while in STATE.ATTRIBUTE_VALUE or STATE.DELIMITED_EXPRESSION.
// We leave STATE.JS_COMMENT_BLOCK when we see a "*/" sequence.
export const JS_COMMENT_BLOCK = Parser.createState({
  name: "JS_COMMENT_BLOCK",

  enter(oldState, comment) {
    comment.value = "";
    comment.type = "block";
  },

  exit(comment) {
    comment.rawValue = "/*" + comment.value + "*/";
  },

  eol(str, comment) {
    comment.value += str;
  },

  eof(comment) {
    this.notifyError(
      comment.pos,
      "MALFORMED_COMMENT",
      "EOF reached while parsing multi-line JavaScript comment"
    );
  },

  char(ch, code, comment) {
    if (code === CODE.ASTERISK) {
      var nextCode = this.lookAtCharCodeAhead(1);
      if (nextCode === CODE.FORWARD_SLASH) {
        comment.endPos = this.pos + 2;
        this.exitState();
        this.skip(1);
        return;
      }
    }

    comment.value += ch;
  },
});
