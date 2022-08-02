import {
  Parser,
  CODE,
  STATE,
  isWhitespaceCode,
  StateDefinition,
  htmlEOF,
  Meta,
} from "../internal";

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

  char(code) {
    if (code === CODE.OPEN_ANGLE_BRACKET) {
      if (STATE.checkForCDATA(this)) return;

      const nextCode = this.lookAtCharCodeAhead(1);

      if (nextCode === CODE.EXCLAMATION) {
        if (
          this.lookAtCharCodeAhead(2) === CODE.HYPHEN &&
          this.lookAtCharCodeAhead(3) === CODE.HYPHEN
        ) {
          this.enterState(STATE.HTML_COMMENT);
          this.pos += 3; // skip !--
        } else {
          // something like:
          // <!DOCTYPE html>
          // NOTE: We already checked for CDATA earlier and <!--
          this.enterState(STATE.DTD);
          this.pos++; // skip !
        }
      } else if (nextCode === CODE.QUESTION) {
        // something like:
        // <?xml version="1.0"?>
        this.enterState(STATE.DECLARATION);
        this.pos++; // skip ?
      } else if (nextCode === CODE.FORWARD_SLASH) {
        // something like:
        // </html>
        this.options.onCloseTagStart?.({
          start: this.pos,
          end: this.pos + 2,
        });
        this.enterState(STATE.CLOSE_TAG);
        this.pos++; // skip /
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
        this.options.onOpenTagStart?.({
          start: this.pos,
          end: this.pos + 1,
        });
        this.enterState(STATE.OPEN_TAG);
      }
    } else if (
      code === CODE.DOLLAR &&
      isWhitespaceCode(this.lookAtCharCodeAhead(1)) &&
      isBeginningOfLine(this)
    ) {
      this.endText();
      this.enterState(STATE.INLINE_SCRIPT);
      this.pos++; // skip space
    } else if (
      code === CODE.FORWARD_SLASH &&
      isWhitespaceCode(this.lookAtCharCodeAhead(-1))
    ) {
      // Check next character to see if we are in a comment
      switch (this.lookAtCharCodeAhead(1)) {
        case CODE.FORWARD_SLASH:
          this.endText();
          this.enterState(STATE.JS_COMMENT_LINE);
          this.pos++; // skip /
          break;
        case CODE.ASTERISK:
          this.endText();
          this.enterState(STATE.JS_COMMENT_BLOCK);
          this.pos++; // skip *
          break;
        default:
          this.startText();
          break;
      }
    } else if (!STATE.checkForPlaceholder(this, code)) {
      this.startText();
    }
  },

  eol(len, content) {
    if (this.beginMixedMode) {
      this.beginMixedMode = false;
      this.endText();
      this.exitState();
    } else if (this.endingMixedModeAtEOL) {
      this.endingMixedModeAtEOL = false;
      this.endText();
      this.exitState();
    } else if (!STATE.handleDelimitedEOL(this, len, content)) {
      this.startText();
    }
  },

  eof: htmlEOF,

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
