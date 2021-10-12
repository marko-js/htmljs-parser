import { Parser, CODE, STATE } from "../internal";

// We enter STATE.JS_COMMENT_LINE after we encounter a "//" sequence
// when parsing JavaScript code.
// We leave STATE.JS_COMMENT_LINE when we see a newline character.
export const JS_COMMENT_LINE = Parser.createState({
  name: "JS_COMMENT_LINE",

  enter(oldState, comment) {
    comment.value = "";
    comment.type = "line";
  },

  exit(comment) {
    comment.rawValue = "//" + comment.value;
  },

  eol(str, comment) {
    this.exitState();
  },

  eof(comment) {
    this.exitState();
  },

  char(ch, code, comment) {
    // TODO: this really shouldn't be done.
    // nothing should end a JS_COMMENT_LINE except a newline
    // eg: <script>//foo</script>
    if (comment.parentState === STATE.PARSED_TEXT_CONTENT) {
      if (!this.isConcise && code === CODE.OPEN_ANGLE_BRACKET) {
        // First, see if we need to see if we reached the closing tag
        // and then check if we encountered CDATA
        if (this.checkForClosingTag()) {
          return;
        }
      }
    }

    comment.value += ch;
  },
});
