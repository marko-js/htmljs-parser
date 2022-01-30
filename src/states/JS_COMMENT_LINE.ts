import { Parser, CODE, STATE } from "../internal";

// We enter STATE.JS_COMMENT_LINE after we encounter a "//" sequence
// when parsing JavaScript code.
// We leave STATE.JS_COMMENT_LINE when we see a newline character.
export const JS_COMMENT_LINE = Parser.createState({
  name: "JS_COMMENT_LINE",

  enter(oldState, comment) {
    comment.kind = "script-line";
    comment.value = "//";
  },

  eol(str, comment) {
    this.exitState();
  },

  eof(comment) {
    this.exitState();
  },

  char(ch, code, comment) {
    if (comment.parentState === STATE.PARSED_TEXT_CONTENT) {
      if (!this.isConcise && code === CODE.OPEN_ANGLE_BRACKET) {
        // First, see if we need to see if we reached the closing tag
        // eg: <script>//foo</script>
        if (this.checkForClosingTag()) {
          return;
        }
      }
    }

    comment.value += ch;
  },
});
