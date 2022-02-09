import { CODE, StateDefinition } from "../internal";

export const REGULAR_EXPRESSION: StateDefinition = {
  name: "REGULAR_EXPRESSION",

  exit() {
    this.isWithinRegExpCharset = false;
  },

  eol(_, regExp) {
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

  char(_, code) {
    if (code === CODE.BACK_SLASH) {
      // Handle escape sequence
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
