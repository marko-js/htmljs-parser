import { CODE, STATE, type StateDefinition, TagType } from "../internal";

// We enter STATE.JS_COMMENT_LINE after we encounter a "//" sequence
// when parsing JavaScript code.
// We leave STATE.JS_COMMENT_LINE when we see a newline character.
export const JS_COMMENT_LINE: StateDefinition = {
  name: "JS_COMMENT_LINE",

  enter(parent, start) {
    return {
      state: JS_COMMENT_LINE,
      parent,
      start,
      end: start,
    };
  },

  exit() {},

  parse(data, maxPos) {
    while (this.pos < maxPos) {
      const code = data.charCodeAt(this.pos);
      if (code === CODE.NEWLINE || code === CODE.CARRIAGE_RETURN) {
        // Leave pos at the newline for the parent state to handle.
        this.exitState();
        return;
      } else if (
        !this.isConcise &&
        code === CODE.OPEN_ANGLE_BRACKET &&
        this.activeTag?.type === TagType.text &&
        STATE.checkForClosingTag(this)
      ) {
        // We reached the closing tag of a text-only tag (eg "<script>//foo</script>").
        // checkForClosingTag exited this comment; also exit the text content state.
        this.exitState();
        return;
      } else {
        this.pos++;
      }
    }
    // EOF
    this.exitState();
  },

  /* c8 ignore next -- never has child states */
  return() {},
};
