import { Parser, CODE, STATE, isWhitespaceCode } from "../internal";

// In STATE.HTML_CONTENT we are looking for tags and placeholders but
// everything in between is treated as text.
export const HTML_CONTENT = Parser.createState({
  name: "HTML_CONTENT",

  placeholder(placeholder) {
    // We found a placeholder while parsing the HTML content. This function is called
    // from endPlaceholder(). We have already notified the listener of the placeholder so there is
    // nothing to do here
  },

  eol(newLine) {
    this.text += newLine;

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

  enter() {
    this.textParseMode = "html";
    this.isConcise = false; // Back into non-concise HTML parsing
  },

  char(ch, code) {
    if (code === CODE.OPEN_ANGLE_BRACKET) {
      if (this.checkForCDATA()) {
        return;
      }

      var nextCode = this.lookAtCharCodeAhead(1);

      if (nextCode === CODE.PERCENT) {
        this.enterState(STATE.SCRIPTLET);
        this.skip(1);
      } else if (this.lookAheadFor("!--")) {
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
        this.closeTagPos = this.pos;
        this.closeTagName = null;

        this.skip(1);
        // something like:
        // </html>
        this.endText();

        this.enterState(STATE.CLOSE_TAG);
      } else if (
        nextCode === CODE.CLOSE_ANGLE_BRACKET ||
        nextCode === CODE.OPEN_ANGLE_BRACKET ||
        isWhitespaceCode(nextCode)
      ) {
        // something like:
        // "<>"
        // "<<"
        // "< "
        // We'll treat this left angle brakect as text
        this.text += "<";
      } else {
        this.beginOpenTag();
        this.currentOpenTag.tagNameStart = this.pos + 1;
      }
    } else if (
      !this.ignorePlaceholders &&
      this.checkForEscapedEscapedPlaceholder(ch, code)
    ) {
      this.text += "\\";
      this.skip(1);
    } else if (
      !this.ignorePlaceholders &&
      this.checkForEscapedPlaceholder(ch, code)
    ) {
      this.text += "$";
      this.skip(1);
    } else if (!this.ignorePlaceholders && this.checkForPlaceholder(ch, code)) {
      // We went into placeholder state...
      this.endText();
    } else if (
      !this.legacyCompatibility &&
      code === CODE.DOLLAR &&
      isWhitespaceCode(this.lookAtCharCodeAhead(1)) &&
      this.isBeginningOfLine()
    ) {
      this.skip(1);
      this.enterState(STATE.INLINE_SCRIPT);
    } else {
      this.text += ch;
    }
  },
});
