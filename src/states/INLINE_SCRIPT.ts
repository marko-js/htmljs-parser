import { Parser, CODE, STATE } from "../internal";

export const INLINE_SCRIPT = Parser.createState({
  name: "INLINE_SCRIPT",

  eol(str) {
    if (
      this.currentPart.endMatch ||
      this.currentPart.stringType === CODE.BACKTICK
    ) {
      this.currentPart.value += str;
    } else {
      this.rewind(str.length);
      this.endInlineScript(this.pos);
    }
  },

  eof() {
    if (this.currentPart.endMatch || this.currentPart.stringType) {
      this.notifyError(
        this.currentPart.pos,
        "MALFORMED_SCRIPTLET",
        "EOF reached while parsing scriptet"
      );
    } else {
      this.endInlineScript(this.pos);
    }
  },

  return(childState, childPart) {
    switch (childState) {
      case STATE.JS_COMMENT_LINE:
      case STATE.JS_COMMENT_BLOCK: {
        this.currentPart.value += childPart.rawValue;
        break;
      }
    }
  },

  char(ch, code) {
    if (code === CODE.BACK_SLASH) {
      this.currentPart.value += ch + this.lookAtCharAhead(1);
      this.skip(1);
      return;
    }

    if (this.currentPart.stringType) {
      if (code === this.currentPart.stringType) {
        this.currentPart.stringType = null;
      }

      this.currentPart.value += ch;
      return;
    }

    if (code === CODE.FORWARD_SLASH) {
      // Check next character to see if we are in a comment
      var nextCode = this.lookAtCharCodeAhead(1);
      if (nextCode === CODE.FORWARD_SLASH) {
        this.enterState(STATE.JS_COMMENT_LINE);
        this.skip(1);
        return;
      } else if (nextCode === CODE.ASTERISK) {
        this.enterState(STATE.JS_COMMENT_BLOCK);
        this.skip(1);
        return;
      }
    }

    this.currentPart.value += ch;

    if (code === this.currentPart.endMatch) {
      this.currentPart.endMatch = this.currentPart.endMatches.pop();
      return;
    }

    if (
      code === CODE.SINGLE_QUOTE ||
      code === CODE.DOUBLE_QUOTE ||
      code === CODE.BACKTICK
    ) {
      this.currentPart.stringType = code;
      return;
    }

    var nextMatch = null;

    if (code === CODE.OPEN_PAREN) {
      nextMatch = CODE.CLOSE_PAREN;
    } else if (code === CODE.OPEN_CURLY_BRACE) {
      nextMatch = CODE.CLOSE_CURLY_BRACE;
    } else if (code === CODE.OPEN_SQUARE_BRACKET) {
      nextMatch = CODE.CLOSE_SQUARE_BRACKET;
    }

    if (nextMatch) {
      if (this.currentPart.endMatch) {
        this.currentPart.endMatches.push(this.currentPart.endMatch);
      }
      this.currentPart.endMatch = nextMatch;
    }
  },
});
