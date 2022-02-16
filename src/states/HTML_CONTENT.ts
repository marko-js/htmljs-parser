import { checkForCDATA, checkForPlaceholder } from ".";
import {
  Parser,
  CODE,
  STATE,
  isWhitespaceCode,
  StateDefinition,
} from "../internal";

// In STATE.HTML_CONTENT we are looking for tags and placeholders but
// everything in between is treated as text.
export const HTML_CONTENT: StateDefinition = {
  name: "HTML_CONTENT",

  enter() {
    this.textParseMode = "html";
    this.isConcise = false; // Back into non-concise HTML parsing
  },

  eol(newLine) {
    if (this.beginMixedMode) {
      this.beginMixedMode = false;
      this.endText(newLine.length);
      this.endHtmlBlock();
    } else if (this.endingMixedModeAtEOL) {
      this.endingMixedModeAtEOL = false;
      this.endText();
      this.endHtmlBlock();
    } else if (this.isWithinSingleLineHtmlBlock) {
      // We are parsing "HTML" and we reached the end of the line. If we are within a single
      // line HTML block then we should return back to the state to parse concise HTML.
      // A single line HTML block can be at the end of the tag or on its own line:
      //
      // span class="hello" - This is an HTML block at the end of a tag
      //     - This is an HTML block on its own line
      //
      this.endText();
      this.endHtmlBlock();
    } else if (this.htmlBlockDelimiter) {
      this.handleDelimitedBlockEOL(newLine);
    } else {
      this.startText();
    }
  },

  eof: Parser.prototype.htmlEOF,

  char(_, code) {
    if (code === CODE.OPEN_ANGLE_BRACKET) {
      if (checkForCDATA(this)) return;

      const nextCode = this.lookAtCharCodeAhead(1);

      if (this.lookAheadFor("!--")) {
        this.enterState(STATE.HTML_COMMENT);
        this.skip(3);
      } else if (nextCode === CODE.EXCLAMATION) {
        // something like:
        // <!DOCTYPE html>
        // NOTE: We already checked for CDATA earlier and <!--
        this.enterState(STATE.DTD);
        this.skip(1);
      } else if (nextCode === CODE.QUESTION) {
        // something like:
        // <?xml version="1.0"?>
        this.enterState(STATE.DECLARATION);
        this.skip(1);
      } else if (nextCode === CODE.FORWARD_SLASH) {
        // something like:
        // </html>
        this.enterState(STATE.CLOSE_TAG);
        this.skip(1);
      } else if (
        nextCode === CODE.CLOSE_ANGLE_BRACKET ||
        nextCode === CODE.OPEN_ANGLE_BRACKET ||
        isWhitespaceCode(nextCode)
      ) {
        // something like:
        // "<>"
        // "<<"
        // "< "
        // We'll treat this left angle bracket as text
        this.startText();
      } else {
        this.enterState(STATE.OPEN_TAG);
      }
    } else if (
      code === CODE.DOLLAR &&
      isWhitespaceCode(this.lookAtCharCodeAhead(1)) &&
      isBeginningOfLine(this)
    ) {
      this.endText();
      this.skip(1);
      this.enterState(STATE.INLINE_SCRIPT);
    } else if (!checkForPlaceholder(this, code)) {
      this.startText();
    }
  },
};

function isBeginningOfLine(parser: Parser) {
  let pos = parser.pos;
  do {
    const code = parser.data.charCodeAt(--pos);
    if (isWhitespaceCode(code)) {
      if (code === CODE.NEWLINE) {
        return true;
      }
    } else {
      return false;
    }
  } while (pos > 0);

  return true;
}
