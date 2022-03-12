import { Parser, STATE, CODE, StateDefinition, Range } from "../internal";

export interface ParsedTextContentMeta extends Range {
  singleLine: boolean;
  indent: string;
  delimiter: undefined | string;
}

// We enter STATE.PARSED_TEXT_CONTENT when we are parsing
// the body of a tag does not contain HTML tags but may contains
// placeholders
export const PARSED_TEXT_CONTENT: StateDefinition<ParsedTextContentMeta> = {
  name: "PARSED_TEXT_CONTENT",

  enter() {},

  exit() {},

  char(code) {
    switch (code) {
      case CODE.OPEN_ANGLE_BRACKET:
        if (
          this.isConcise ||
          !(STATE.checkForClosingTag(this) || STATE.checkForCDATA(this))
        ) {
          this.startText();
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
        if (!STATE.checkForPlaceholder(this, code)) this.startText();
        break;
    }
  },

  eol(len, content) {
    if (!STATE.handleDelimitedEOL(this, len, content)) {
      this.startText();
    }
  },

  eof: Parser.prototype.htmlEOF,

  return() {},
};
