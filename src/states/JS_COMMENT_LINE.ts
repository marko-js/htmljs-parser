import { BODY_MODE, CODE, STATE, StateDefinition } from "../internal";

// We enter STATE.JS_COMMENT_LINE after we encounter a "//" sequence
// when parsing JavaScript code.
// We leave STATE.JS_COMMENT_LINE when we see a newline character.
export const JS_COMMENT_LINE: StateDefinition = {
  name: "JS_COMMENT_LINE",

  enter(start) {
    return {
      start,
      end: start,
    };
  },

  exit() {},

  char(code) {
    if (
      !this.isConcise &&
      code === CODE.OPEN_ANGLE_BRACKET &&
      this.activeTag?.bodyMode === BODY_MODE.PARSED_TEXT
    ) {
      // First, see if we need to see if we reached the closing tag
      // eg: <script>//foo</script>
      STATE.checkForClosingTag(this);
    }
  },

  eol() {
    this.exitState();
  },

  eof() {
    this.exitState();
  },

  return() {},
};
