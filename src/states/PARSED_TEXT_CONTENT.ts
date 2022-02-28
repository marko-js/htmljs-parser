import { checkForCDATA, checkForClosingTag, checkForPlaceholder } from ".";
import { Parser, STATE, CODE, StateDefinition, Range } from "../internal";

export interface ParsedTextContentMeta extends Range {
  singleLine: boolean;
}

// We enter STATE.PARSED_TEXT_CONTENT when we are parsing
// the body of a tag does not contain HTML tags but may contains
// placeholders
export const PARSED_TEXT_CONTENT: StateDefinition<ParsedTextContentMeta> = {
  name: "PARSED_TEXT_CONTENT",

  enter(content) {
    content.singleLine = content.singleLine === true;
  },

  eol(len, content) {
    if (content.singleLine) {
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
      this.handleDelimitedBlockEOL(len);
    } else {
      this.startText();
    }
  },

  eof: Parser.prototype.htmlEOF,

  char(code) {
    switch (code) {
      case CODE.OPEN_ANGLE_BRACKET:
        if (!this.isConcise) {
          checkForClosingTag(this) || checkForCDATA(this);
        }
        break;
      case CODE.FORWARD_SLASH:
        this.startText();
        switch (this.lookAtCharCodeAhead(1)) {
          case CODE.ASTERISK:
            this.enterState(STATE.JS_COMMENT_BLOCK);
            this.skip(1); // skip /
            break;
          case CODE.FORWARD_SLASH:
            this.enterState(STATE.JS_COMMENT_LINE);
            this.skip(1); // skip *
            break;
        }
        break;
      case CODE.BACKTICK:
        this.startText();
        this.enterState(STATE.TEMPLATE_STRING);
        break;
      default:
        if (!checkForPlaceholder(this, code)) this.startText();
        break;
    }
  },
};
