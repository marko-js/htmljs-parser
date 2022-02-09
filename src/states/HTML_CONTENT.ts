import {
  checkForEscapedEscapedPlaceholder,
  checkForEscapedPlaceholder,
  checkForPlaceholder,
} from ".";
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
    this.addText(newLine);

    if (this.beginMixedMode) {
      this.beginMixedMode = false;
      this.endHtmlBlock();
    } else if (this.endingMixedModeAtEOL) {
      this.endingMixedModeAtEOL = false;
      this.endHtmlBlock();
    } else if (this.isWithinSingleLineHtmlBlock) {
      // We are parsing "HTML" and we reached the end of the line. If we are within a single
      // line HTML block then we should return back to the state to parse concise HTML.
      // A single line HTML block can be at the end of the tag or on its own line:
      //
      // span class="hello" - This is an HTML block at the end of a tag
      //     - This is an HTML block on its own line
      //
      this.endHtmlBlock();
    } else if (this.htmlBlockDelimiter) {
      this.handleDelimitedBlockEOL(newLine);
    }
  },

  eof: Parser.prototype.htmlEOF,

  char(ch, code) {
    if (code === CODE.OPEN_ANGLE_BRACKET) {
      if (this.checkForCDATA()) {
        return;
      }

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
        this.endText();
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
        this.addText("<");
      } else {
        this.enterState(STATE.OPEN_TAG);
      }
    } else if (checkForEscapedEscapedPlaceholder(this, code)) {
      this.addText("\\");
      this.skip(1);
    } else if (checkForEscapedPlaceholder(this, code)) {
      this.addText("$");
      this.skip(1);
    } else if (checkForPlaceholder(this, code)) {
      // We went into placeholder state...
      this.endText();
    } else if (
      code === CODE.DOLLAR &&
      isWhitespaceCode(this.lookAtCharCodeAhead(1)) &&
      /^\s*$/.test(this.substring(0, this.pos).split("\n").pop()!) // beginning of line
    ) {
      this.skip(1);
      this.enterState(STATE.INLINE_SCRIPT);
    } else {
      this.addText(ch);
    }
  },
};
