import { Parser, CODE, STATE } from "../internal";

// We enter STATE.CLOSE_TAG after we see "</"
export const CLOSE_TAG = Parser.createState({
  name: "CLOSE_TAG",

  enter(oldState, closeTag) {
    const tagNamePos = closeTag.pos + 2;
    closeTag.tagName = {
      value: "",
      pos: tagNamePos,
      endPos: tagNamePos,
    };
  },

  eof(closeTag) {
    this.notifyError(
      closeTag.pos,
      "MALFORMED_CLOSE_TAG",
      "EOF reached while parsing closing tag"
    );
  },

  char(ch, code, closeTag) {
    if (code === CODE.CLOSE_ANGLE_BRACKET) {
      this.exitState(">");
      this.closeTag(closeTag);
      this.enterState(STATE.HTML_CONTENT);
    } else {
      closeTag.tagName.value += ch;
      closeTag.tagName.endPos++;
    }
  },
});
