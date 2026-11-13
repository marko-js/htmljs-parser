import {
  htmlEOF,
  isLineCode,
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
// placeholders. It lexes JavaScript strings, comments and regular expressions,
// so a "</script>" inside one does not end it.
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
          // Skip a regular expression whole, so a quote or "//" in it is not
          // lexed; a "/" that cannot close one on its line stays text.
          this.pos =
            (STATE.isRegExpStart(data, this.pos) &&
              skipRegExp(data, this.pos, maxPos)) ||
            this.pos + 1;
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
          if (
            code === CODE.BACK_SLASH &&
            isEscapableParsedTextCode(data.charCodeAt(this.pos + 1))
          ) {
            // An escaped quote or slash outside a string, eg CSS `.a\"`, is
            // text rather than the start of a string or comment.
            this.pos += 2;
            continue;
          }

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

// A backslash before one of these escapes it; before "<" or a newline it does
// not, so "\</style>" still closes the tag and a delimited block still ends.
function isEscapableParsedTextCode(code: number) {
  switch (code) {
    case CODE.DOUBLE_QUOTE:
    case CODE.SINGLE_QUOTE:
    case CODE.BACKTICK:
    case CODE.FORWARD_SLASH:
    case CODE.BACK_SLASH:
      return true;
    default:
      return false;
  }
}

/**
 * Where the regular expression whose "/" is at `pos` ends, or 0 when no "/"
 * closes it on its line before a "</", which may be the closing tag, or a
 * placeholder, which a CSS body's `url(/${dir}/a.png)` must keep.
 */
function skipRegExp(data: string, pos: number, maxPos: number) {
  let inCharSet = false;
  for (let i = pos + 1; i < maxPos; i++) {
    switch (data.charCodeAt(i)) {
      case CODE.BACK_SLASH:
        i++; // skip the escaped char, which still cannot be a line terminator
        if (!isLineCode(data.charCodeAt(i))) break;
        return 0;
      case CODE.NEWLINE:
      case CODE.CARRIAGE_RETURN:
        return 0;
      case CODE.OPEN_ANGLE_BRACKET:
        if (data.charCodeAt(i + 1) === CODE.FORWARD_SLASH) return 0;
        break;
      case CODE.DOLLAR:
        switch (data.charCodeAt(i + 1)) {
          case CODE.OPEN_CURLY_BRACE: // ${
            return 0;
          case CODE.EXCLAMATION: // $!{
            if (data.charCodeAt(i + 2) === CODE.OPEN_CURLY_BRACE) return 0;
            break;
        }
        break;
      case CODE.OPEN_SQUARE_BRACKET:
        inCharSet = true;
        break;
      case CODE.CLOSE_SQUARE_BRACKET:
        inCharSet = false;
        break;
      case CODE.FORWARD_SLASH:
        if (!inCharSet) return i + 1;
        break;
    }
  }

  return 0;
}

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
