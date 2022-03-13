import { CODE, StateDefinition, Parser, Range } from "../internal";

// We enter STATE.CLOSE_TAG after we see "</"
export const CLOSE_TAG: StateDefinition = {
  name: "CLOSE_TAG",

  enter(start) {
    this.endText();

    return {
      start,
      end: start,
    };
  },

  exit() {},

  char(code, closeTag) {
    if (code === CODE.CLOSE_ANGLE_BRACKET) {
      this.skip(1); // skip >
      this.exitState();
      ensureExpectedCloseTag(this, closeTag);
    }
  },

  eol() {},

  eof(closeTag) {
    this.emitError(
      closeTag,
      "MALFORMED_CLOSE_TAG",
      "EOF reached while parsing closing tag"
    );
  },

  return() {},
};

export function checkForClosingTag(parser: Parser) {
  // Look ahead to see if we found the closing tag that will
  // take us out of the EXPRESSION state...
  const curPos = parser.pos + 1;
  let match = !!parser.lookAheadFor("/>");
  let skip = 3; // skip the </>

  if (!match) {
    const { tagName } = parser.activeTag!;
    const tagNameLen = tagName.end - tagName.start;
    if (tagNameLen) {
      skip += tagNameLen; // skip <TAG_NAME/>
      match =
        (parser.lookAheadFor("/", curPos) &&
          parser.lookAheadFor(">", 1 + curPos + tagNameLen) &&
          parser.matchAtPos(tagName, {
            start: 1 + curPos,
            end: 1 + curPos + tagNameLen,
          })) ||
        false;
    }
  }

  if (match) {
    parser.endText();

    if (
      ensureExpectedCloseTag(parser, {
        start: parser.pos,
        end: parser.skip(skip),
      })
    ) {
      parser.exitState();
    }
    return true;
  }

  return false;
}

function ensureExpectedCloseTag(parser: Parser, closeTag: Range) {
  const activeTag = parser.activeTag;
  const closeTagNameStart = closeTag.start + 2; // strip </
  const closeTagNameEnd = closeTag.end - 1; // strip >

  if (!activeTag) {
    parser.emitError(
      closeTag!,
      "EXTRA_CLOSING_TAG",
      'The closing "' +
        parser.read({ start: closeTagNameStart, end: closeTagNameEnd }) +
        '" tag was not expected'
    );

    return false;
  }

  const closeTagNamePos = {
    start: closeTagNameStart,
    end: closeTagNameEnd,
  };

  if (closeTagNameStart < closeTagNameEnd!) {
    if (
      !parser.matchAtPos(
        closeTagNamePos,
        activeTag.tagName.end > activeTag.tagName.start
          ? activeTag.tagName
          : "div"
      )
    ) {
      if (
        activeTag.shorthandEnd === undefined ||
        !parser.matchAtPos(closeTagNamePos, {
          start: activeTag.tagName.start,
          end: activeTag.shorthandEnd,
        })
      ) {
        parser.emitError(
          closeTag,
          "MISMATCHED_CLOSING_TAG",
          'The closing "' +
            parser.read(closeTagNamePos) +
            '" tag does not match the corresponding opening "' +
            (parser.read(activeTag.tagName) || "div") +
            '" tag'
        );

        return false;
      }
    }
  }

  parser.closeTag(closeTag.start, closeTag.end, closeTagNamePos);
  return true;
}
