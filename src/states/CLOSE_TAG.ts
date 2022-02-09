import { CODE, STATE, Part, StateDefinition, ValuePart } from "../internal";

export interface CloseTagPart extends Part {
  tagName: ValuePart;
}

// We enter STATE.CLOSE_TAG after we see "</"
export const CLOSE_TAG: StateDefinition<CloseTagPart> = {
  name: "CLOSE_TAG",

  enter(closeTag) {
    const tagNamePos = closeTag.pos + 2;
    closeTag.tagName = {
      value: "",
      pos: tagNamePos,
      endPos: tagNamePos,
    } as ValuePart;
  },

  eof(closeTag) {
    this.notifyError(
      closeTag,
      "MALFORMED_CLOSE_TAG",
      "EOF reached while parsing closing tag"
    );
  },

  char(ch, code, closeTag) {
    if (code === CODE.CLOSE_ANGLE_BRACKET) {
      this.exitState(">");
      this.closeTag(closeTag.pos, closeTag.endPos, closeTag.tagName);
      this.enterState(STATE.HTML_CONTENT);
    } else {
      closeTag.tagName.value += ch;
      closeTag.tagName.endPos++;
    }
  },
};
