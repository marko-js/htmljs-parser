import { CODE, STATE, StateDefinition, Parser, Range } from "../internal";

export interface CloseTagRange extends Range {
  tagName: Range;
}

// We enter STATE.CLOSE_TAG after we see "</"
export const CLOSE_TAG: StateDefinition<CloseTagRange> = {
  name: "CLOSE_TAG",

  enter() {
    this.endText();
  },

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
  const curPos = parser.pos + 1;
  let match = !!parser.lookAheadFor("/>");
  let skip = 3; // skip the </>

  if (!match) {
    const { tagName } = parser.activeTag!;
    const tagNameLen = tagName.endPos - tagName.pos;
    if (tagNameLen) {
      skip += tagNameLen; // skip <TAG_NAME/>
      match =
        (parser.lookAheadFor("/", curPos) &&
          parser.lookAheadFor(">", 1 + curPos + tagNameLen) &&
          parser.matchAtPos(tagName, {
            pos: 1 + curPos,
            endPos: 1 + curPos + tagNameLen,
          })) ||
        false;
    }
  }

  if (match) {
    if (parser.activeState === STATE.JS_COMMENT_LINE) {
      parser.exitState();
    }

    parser.endText();
    parser.closeTag({ pos: parser.pos, endPos: parser.skip(skip) });
    parser.forward = false;
    return true;
  }

  return false;
}
