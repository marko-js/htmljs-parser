import { Parser, STATE, CODE } from "../internal";
import { HTML_CONTENT } from "./HTML_CONTENT";

// We enter STATE.PARSED_TEXT_CONTENT when we are parsing
// the body of a tag does not contain HTML tags but may contains
// placeholders
export const PARSED_TEXT_CONTENT = Parser.createState({
  name: "PARSED_TEXT_CONTENT",

  enter() {
    this.textParseMode = "parsed-text";
  },

  return(childState, childPart) {
    switch (childState) {
      case STATE.JS_COMMENT_LINE:
      case STATE.JS_COMMENT_BLOCK: {
        this.text += childPart.rawValue;

        if (this.htmlBlockDelimiter && childPart.eol) {
          this.handleDelimitedBlockEOL(childPart.eol);
        }

        break;
      }
    }
  },

  placeholder: HTML_CONTENT.placeholder,

  templateString(templateString) {
    this.text += templateString.value;
  },

  eol(newLine) {
    this.text += newLine;

    if (this.isWithinSingleLineHtmlBlock) {
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
    if (!this.isConcise && code === CODE.OPEN_ANGLE_BRACKET) {
      // First, see if we need to see if we reached the closing tag
      // and then check if we encountered CDATA
      if (this.checkForClosingTag()) {
        return;
      } else if (this.checkForCDATA()) {
        return;
      } else if (this.lookAtCharCodeAhead(1) === CODE.PERCENT) {
        this.enterState(STATE.SCRIPTLET);
        this.skip(1);
        return;
      }
    }

    if (code === CODE.FORWARD_SLASH) {
      if (this.lookAtCharCodeAhead(1) === CODE.ASTERISK) {
        // Skip over code inside a JavaScript block comment
        this.enterState(STATE.JS_COMMENT_BLOCK);
        this.skip(1);
        return;
      } else if (this.lookAtCharCodeAhead(1) === CODE.FORWARD_SLASH) {
        this.enterState(STATE.JS_COMMENT_LINE);
        this.skip(1);
        return;
      }
    }

    if (code === CODE.BACKTICK) {
      this.beginTemplateString();
      return;
    }

    if (
      !this.ignorePlaceholders &&
      this.checkForEscapedEscapedPlaceholder(ch, code)
    ) {
      this.skip(1);
    } else if (
      !this.ignorePlaceholders &&
      this.checkForEscapedPlaceholder(ch, code)
    ) {
      this.text += "$";
      this.skip(1);
      return;
    } else if (!this.ignorePlaceholders && this.checkForPlaceholder(ch, code)) {
      // We went into placeholder state...
      this.endText();
      return;
    }

    this.text += ch;
  },
});
