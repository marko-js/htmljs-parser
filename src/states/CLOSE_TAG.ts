import {
  CODE,
  STATE,
  Part,
  StateDefinition,
  ValuePart,
  Parser,
  getTagName,
  peek,
} from "../internal";

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

export function checkForClosingTag(parser: Parser) {
  // Look ahead to see if we found the closing tag that will
  // take us out of the EXPRESSION state...
  const match =
    parser.lookAheadFor("/>") ||
    parser.lookAheadFor("/" + getTagName(peek(parser.blockStack)) + ">");

  if (match) {
    if (parser.state === STATE.JS_COMMENT_LINE) {
      parser.exitState();
    }

    const pos = parser.pos;
    const endPos = parser.skip(match.length + 1);
    parser.endText();
    parser.closeTag(pos, endPos, {
      value: match.slice(1, -1),
      pos: pos + 2,
      endPos: endPos - 1,
    } as ValuePart);
    parser.enterState(STATE.HTML_CONTENT);
    parser.forward = false;
    return true;
  }

  return false;
}
