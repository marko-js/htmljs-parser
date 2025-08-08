import { CODE, type StateDefinition, type Meta, ErrorCode } from "../internal";

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
    switch (code) {
      case CODE.BACK_SLASH:
        // Handle escape sequence
        this.pos++; // skip \
        break;
      case CODE.OPEN_SQUARE_BRACKET:
        regExp.isInCharSet = true;
        break;
      case CODE.CLOSE_SQUARE_BRACKET:
        regExp.isInCharSet = false;
        break;
      case CODE.FORWARD_SLASH:
        if (!regExp.isInCharSet) {
          this.pos++; // skip /
          this.exitState();
        }
        break;
    }
  },

  eol(_, regExp) {
    this.emitError(
      regExp,
      ErrorCode.INVALID_REGULAR_EXPRESSION,
      "EOL reached while parsing regular expression",
    );
  },

  eof(regExp) {
    this.emitError(
      regExp,
      ErrorCode.INVALID_REGULAR_EXPRESSION,
      "EOF reached while parsing regular expression",
    );
  },

  return() {},
};
