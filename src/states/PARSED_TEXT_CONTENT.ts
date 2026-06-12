import {
  htmlEOF,
  type Meta,
  STATE,
  type StateDefinition,
} from "../internal.ts";
import * as CODE from "../util/codes.ts";

export interface ParsedTextContentMeta extends Meta {
  indent: string;
  singleLine: boolean;
  delimiter: undefined | string;
}

// We enter STATE.PARSED_TEXT_CONTENT when we are parsing
// the body of a tag does not contain HTML tags but may contains
// placeholders
export const PARSED_TEXT_CONTENT: StateDefinition<ParsedTextContentMeta> = {
  name: "PARSED_TEXT_CONTENT",

  enter(parent, start) {
    return {
      state: PARSED_TEXT_CONTENT as StateDefinition,
      parent,
      start,
      end: start,
      indent: "",
      singleLine: false,
      delimiter: undefined,
    };
  },

  exit() {},

  parse(data, maxPos, content) {
    if (this.pos === maxPos) {
      htmlEOF.call(this);
      this.pos++;
      return;
    }

    while (this.pos < maxPos) {
      const code = data.charCodeAt(this.pos);

      if (code === CODE.NEWLINE || code === CODE.CARRIAGE_RETURN) {
        const len =
          code === CODE.CARRIAGE_RETURN &&
          data.charCodeAt(this.pos + 1) === CODE.NEWLINE
            ? 2
            : 1;

        const prevState = this.activeState;
        const prevPos = this.pos;
        if (STATE.handleDelimitedEOL(this, len, content)) {
          if (this.activeState !== prevState) return;
          // Still in this delimited block; skip the newline if it wasn't consumed (eg a blank line).
          if (this.pos === prevPos) this.pos += len;
          continue;
        }

        this.startText();
        this.pos += len;
        continue;
      }

      switch (code) {
        case CODE.OPEN_ANGLE_BRACKET:
          if (this.isConcise || !STATE.checkForClosingTag(this)) {
            this.startText();
            this.pos++;
            continue;
          }
          return; // checkForClosingTag advanced pos and called exitState
        case CODE.FORWARD_SLASH:
          this.startText();
          switch (data.charCodeAt(this.pos + 1)) {
            case CODE.ASTERISK:
              this.enterState(STATE.JS_COMMENT_BLOCK);
              this.pos += 2; // skip /*
              return;
            case CODE.FORWARD_SLASH:
              this.enterState(STATE.JS_COMMENT_LINE);
              this.pos += 2; // skip //
              return;
          }
          this.pos++;
          continue;
        case CODE.BACKTICK:
          this.startText();
          this.enterState(STATE.TEMPLATE_STRING);
          this.pos++; // skip `
          return;
        case CODE.DOUBLE_QUOTE:
        case CODE.SINGLE_QUOTE:
          this.startText();
          this.enterState(STATE.PARSED_STRING).quoteCharCode = code;
          this.pos++; // skip opening quote
          return;
        default:
          if (
            (code === CODE.DOLLAR || code === CODE.BACK_SLASH) &&
            STATE.checkForPlaceholder(this, code)
          ) {
            return; // checkForPlaceholder entered PLACEHOLDER+EXPRESSION
          }

          this.startText();
          // Eagerly consume the run of chars that cannot match a case above.
          do {
            this.pos++;
          } while (
            this.pos < maxPos &&
            !isSpecialParsedTextCode(data.charCodeAt(this.pos))
          );
          continue;
      }
    }
  },

  return() {},
};

// Matches every char that can begin one of the parse branches above.
function isSpecialParsedTextCode(code: number) {
  switch (code) {
    case CODE.NEWLINE:
    case CODE.CARRIAGE_RETURN:
    case CODE.OPEN_ANGLE_BRACKET:
    case CODE.FORWARD_SLASH:
    case CODE.BACKTICK:
    case CODE.DOUBLE_QUOTE:
    case CODE.SINGLE_QUOTE:
    case CODE.DOLLAR:
    case CODE.BACK_SLASH:
      return true;
    default:
      return false;
  }
}
