import { Parser, CODE, STATE } from "../internal";

// We enter STATE.JS_COMMENT_BLOCK after we encounter a "/*" sequence
// while in STATE.ATTRIBUTE_VALUE or STATE.DELIMITED_EXPRESSION.
// We leave STATE.JS_COMMENT_BLOCK when we see a "*/" sequence.
export const JS_COMMENT_BLOCK = Parser.createState({
  name: "JS_COMMENT_BLOCK",

  eol(str) {
    this.currentPart.value += str;
  },

  eof() {
    this.notifyError(
      this.currentPart.pos,
      "MALFORMED_COMMENT",
      "EOF reached while parsing multi-line JavaScript comment"
    );
  },

  char(ch, code) {
    if (code === CODE.ASTERISK) {
      var nextCode = this.lookAtCharCodeAhead(1);
      if (nextCode === CODE.FORWARD_SLASH) {
        this.currentPart.endPos = this.pos + 2;
        this.endJavaScriptComment();
        this.skip(1);
        return;
      }
    }

    this.currentPart.value += ch;
  },
});
