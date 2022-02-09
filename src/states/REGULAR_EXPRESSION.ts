import { CODE, StateDefinition, ValuePart } from "../internal";

export const REGULAR_EXPRESSION: StateDefinition<ValuePart> = {
  name: "REGULAR_EXPRESSION",

  enter(regExp) {
    regExp.value = "/";
  },

  exit() {
    this.isWithinRegExpCharset = false;
  },

  eol(newline, regExp) {
    this.notifyError(
      regExp,
      "INVALID_REGULAR_EXPRESSION",
      "EOL reached while parsing regular expression"
    );
  },

  eof(regExp) {
    this.notifyError(
      regExp,
      "INVALID_REGULAR_EXPRESSION",
      "EOF reached while parsing regular expression"
    );
  },

  char(ch, code, regExp) {
    regExp.value += ch;
    if (code === CODE.BACK_SLASH) {
      // Handle escape sequence
      regExp.value += this.lookAtCharAhead(1);
      this.skip(1);
    } else if (
      code === CODE.OPEN_SQUARE_BRACKET &&
      this.isWithinRegExpCharset
    ) {
      this.isWithinRegExpCharset = true;
    } else if (
      code === CODE.CLOSE_SQUARE_BRACKET &&
      this.isWithinRegExpCharset
    ) {
      this.isWithinRegExpCharset = false;
    } else if (code === CODE.FORWARD_SLASH && !this.isWithinRegExpCharset) {
      this.exitState("/");
    }
  },
};
