import { CODE, Range, StateDefinition } from "../internal";

export interface RegExpRange extends Range {
  isInCharSet: boolean;
}
export const REGULAR_EXPRESSION: StateDefinition<RegExpRange> = {
  name: "REGULAR_EXPRESSION",
  enter(regExp) {
    regExp.isInCharSet = false;
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

  char(_, code, regExp) {
    if (code === CODE.BACK_SLASH) {
      // Handle escape sequence
      this.skip(1);
    } else if (code === CODE.OPEN_SQUARE_BRACKET && regExp.isInCharSet) {
      regExp.isInCharSet = true;
    } else if (code === CODE.CLOSE_SQUARE_BRACKET && regExp.isInCharSet) {
      regExp.isInCharSet = false;
    } else if (code === CODE.FORWARD_SLASH && !regExp.isInCharSet) {
      this.exitState("/");
    }
  },
};
