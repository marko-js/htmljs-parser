import {
  htmlEOF,
  isWhitespaceCode,
  type Meta,
  Parser,
  STATE,
  type StateDefinition,
} from "../internal.ts";
import * as CODE from "../util/codes.ts";

export interface HTMLContentMeta extends Meta {
  indent: string;
  singleLine: boolean;
  delimiter: undefined | string;
}

// In STATE.HTML_CONTENT we are looking for tags and placeholders but
// everything in between is treated as text.
export const HTML_CONTENT: StateDefinition<HTMLContentMeta> = {
  name: "HTML_CONTENT",

  enter(parent, start) {
    this.isConcise = false; // Back into non-concise HTML parsing
    return {
      state: HTML_CONTENT as StateDefinition,
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

        if (this.beginMixedMode) {
          this.beginMixedMode = false;
          this.endText();
          this.exitState();
          return; // parent handles newline at same pos
        }

        if (this.endingMixedModeAtEOL) {
          this.endingMixedModeAtEOL = false;
          this.endText();
          this.exitState();
          return; // parent handles newline at same pos
        }

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

      if (code === CODE.OPEN_ANGLE_BRACKET) {
        if (STATE.checkForCDATA(this)) return;

        const nextCode = data.charCodeAt(this.pos + 1);

        if (nextCode === CODE.EXCLAMATION) {
          if (
            data.charCodeAt(this.pos + 2) === CODE.HYPHEN &&
            data.charCodeAt(this.pos + 3) === CODE.HYPHEN
          ) {
            this.enterState(STATE.HTML_COMMENT);
            this.pos += 4; // skip <!--
          } else {
            this.enterState(STATE.DTD);
            this.pos += 2; // skip <!
          }
        } else if (nextCode === CODE.QUESTION) {
          this.enterState(STATE.DECLARATION);
          this.pos += 2; // skip <?
        } else if (nextCode === CODE.FORWARD_SLASH) {
          this.options.onCloseTagStart?.({
            start: this.pos,
            end: this.pos + 2,
          });
          this.enterState(STATE.CLOSE_TAG);
          this.pos += 2; // skip </
        } else if (
          nextCode === CODE.CLOSE_ANGLE_BRACKET ||
          nextCode === CODE.OPEN_ANGLE_BRACKET ||
          isWhitespaceCode(nextCode)
        ) {
          this.startText();
          this.pos++;
          continue;
        } else {
          this.options.onOpenTagStart?.({
            start: this.pos,
            end: this.pos + 1,
          });
          this.enterState(STATE.OPEN_TAG);
          this.pos++; // skip <
        }
        return;
      }

      if (
        code === CODE.DOLLAR &&
        isWhitespaceCode(data.charCodeAt(this.pos + 1)) &&
        isBeginningOfLine(this)
      ) {
        this.endText();
        this.enterState(STATE.INLINE_SCRIPT);
        this.pos += 2; // skip $ and space
        return;
      }

      if (
        code === CODE.FORWARD_SLASH &&
        isWhitespaceCode(data.charCodeAt(this.pos - 1))
      ) {
        switch (data.charCodeAt(this.pos + 1)) {
          case CODE.FORWARD_SLASH:
            this.endText();
            this.enterState(STATE.JS_COMMENT_LINE);
            this.pos += 2; // skip //
            return;
          case CODE.ASTERISK:
            this.endText();
            this.enterState(STATE.JS_COMMENT_BLOCK);
            this.pos += 2; // skip /*
            return;
          default:
            this.startText();
            this.pos++;
            continue;
        }
      }

      if (
        (code === CODE.DOLLAR || code === CODE.BACK_SLASH) &&
        STATE.checkForPlaceholder(this, code)
      ) {
        return; // checkForPlaceholder entered PLACEHOLDER+EXPRESSION
      }

      this.startText();
      // Eagerly consume the run of chars that cannot match a branch above.
      do {
        this.pos++;
      } while (
        this.pos < maxPos &&
        !isSpecialHtmlContentCode(data.charCodeAt(this.pos))
      );
    }
  },

  return(child) {
    switch (child.state) {
      case STATE.JS_COMMENT_LINE:
        this.options.onComment?.({
          start: child.start,
          end: child.end,
          value: {
            start: child.start + 2, // strip //
            end: child.end,
          },
        });
        break;
      case STATE.JS_COMMENT_BLOCK: {
        this.options.onComment?.({
          start: child.start,
          end: child.end,
          value: {
            start: child.start + 2, // strip /*
            end: child.end - 2, // strip */,
          },
        });
        break;
      }
    }
  },
};

// Matches every char that can begin one of the parse branches above.
function isSpecialHtmlContentCode(code: number) {
  switch (code) {
    case CODE.NEWLINE:
    case CODE.CARRIAGE_RETURN:
    case CODE.OPEN_ANGLE_BRACKET:
    case CODE.DOLLAR:
    case CODE.FORWARD_SLASH:
    case CODE.BACK_SLASH:
      return true;
    default:
      return false;
  }
}

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
    // The loop exit below is unreachable: html mode always begins after a
    // non-whitespace char.
    /* node:coverage disable */
  } while (pos > 0);
  return true;
  /* node:coverage enable */
}
