import { CODE, StateDefinition, Meta } from "../internal";

interface RegExpMeta extends Meta {
  isInCharSet: boolean;
}
export const REGULAR_EXPRESSION: StateDefinition<RegExpMeta> = {
  name: "REGULAR_EXPRESSION",
  enter(parent, start) {
    return {
      state: REGULAR_EXPRESSION as StateDefinition,
      parent,
      start,
      end: start,
      isInCharSet: false,
    };
  },

  exit() {},

  char(code, regExp) {
    if (code === CODE.BACK_SLASH) {
      // Handle escape sequence
      this.skip(1); // skip \
    } else if (code === CODE.OPEN_SQUARE_BRACKET && regExp.isInCharSet) {
      regExp.isInCharSet = true;
    } else if (code === CODE.CLOSE_SQUARE_BRACKET && regExp.isInCharSet) {
      regExp.isInCharSet = false;
    } else if (code === CODE.FORWARD_SLASH && !regExp.isInCharSet) {
      this.skip(1); // skip /
      this.exitState();
    }
  },

  eol(_, regExp) {
    this.emitError(
      regExp,
      "INVALID_REGULAR_EXPRESSION",
      "EOL reached while parsing regular expression"
    );
  },

  eof(regExp) {
    this.emitError(
      regExp,
      "INVALID_REGULAR_EXPRESSION",
      "EOF reached while parsing regular expression"
    );
  },

  return() {},
};
