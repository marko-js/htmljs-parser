import { checkForClosingTag } from ".";
import { CODE, Part, STATE, StateDefinition } from "../internal";

export interface JSCommentLinePart extends Part {
  value: string;
}

// We enter STATE.JS_COMMENT_LINE after we encounter a "//" sequence
// when parsing JavaScript code.
// We leave STATE.JS_COMMENT_LINE when we see a newline character.
export const JS_COMMENT_LINE: StateDefinition<JSCommentLinePart> = {
  name: "JS_COMMENT_LINE",

  enter(comment) {
    comment.value = "//";
  },

  eol() {
    this.exitState();
  },

  eof() {
    this.exitState();
  },

  char(ch, code, comment) {
    if (comment.parentState === STATE.PARSED_TEXT_CONTENT) {
      if (!this.isConcise && code === CODE.OPEN_ANGLE_BRACKET) {
        // First, see if we need to see if we reached the closing tag
        // eg: <script>//foo</script>
        if (checkForClosingTag(this)) return;
      }
    }

    comment.value += ch;
  },
};
