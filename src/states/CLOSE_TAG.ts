import {
  CODE,
  STATE,
  Part,
  StateDefinition,
  Parser,
  peek,
  Pos,
} from "../internal";

export interface CloseTagPart extends Part {
  tagName: Pos;
}

// We enter STATE.CLOSE_TAG after we see "</"
export const CLOSE_TAG: StateDefinition<CloseTagPart> = {
  name: "CLOSE_TAG",

  eof(closeTag) {
    this.notifyError(
      closeTag,
      "MALFORMED_CLOSE_TAG",
      "EOF reached while parsing closing tag"
    );
  },

  char(_, code, closeTag) {
    if (code === CODE.CLOSE_ANGLE_BRACKET) {
      this.exitState(">");
      this.closeTag(closeTag);
    }
  },
};

export function checkForClosingTag(parser: Parser) {
  // Look ahead to see if we found the closing tag that will
  // take us out of the EXPRESSION state...
  // TODO: instead of substringing the tagName, we should string compare two ranges in the source text.
  const match =
    parser.lookAheadFor("/>") ||
    parser.lookAheadFor(
      "/" + parser.read((peek(parser.blockStack) as any).tagName) + ">"
    );

  if (match) {
    if (parser.state === STATE.JS_COMMENT_LINE) {
      parser.exitState();
    }

    parser.endText();
    parser.closeTag({ pos: parser.pos, endPos: parser.skip(match.length + 1) });
    parser.forward = false;
    return true;
  }

  return false;
}
