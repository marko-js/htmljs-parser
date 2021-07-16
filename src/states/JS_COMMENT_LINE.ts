import { Parser, CODE, STATE } from "../internal";

// We enter STATE.JS_COMMENT_LINE after we encounter a "//" sequence
// when parsing JavaScript code.
// We leave STATE.JS_COMMENT_LINE when we see a newline character.
export const JS_COMMENT_LINE = Parser.createState({
  name: "JS_COMMENT_LINE",

  eol(str) {
    this.rewind(str.length);
    this.currentPart.endPos = this.pos;
    this.endJavaScriptComment();
  },

  eof() {
    this.currentPart.endPos = this.pos;
    this.endJavaScriptComment();
  },

  char(ch, code) {
    if (this.currentPart.parentState === STATE.PARSED_TEXT_CONTENT) {
      if (!this.isConcise && code === CODE.OPEN_ANGLE_BRACKET) {
        // First, see if we need to see if we reached the closing tag
        // and then check if we encountered CDATA
        if (this.checkForClosingTag()) {
          return;
        }
      }
    }

    this.currentPart.value += ch;
  },
});
