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

  parse(data, maxPos, regExp) {
    while (this.pos < maxPos) {
      const code = data.charCodeAt(this.pos);
      switch (code) {
        case CODE.BACK_SLASH: {
          // Line terminators are invalid in a regex even when escaped.
          const escaped = data.charCodeAt(this.pos + 1);
          if (escaped !== CODE.NEWLINE && escaped !== CODE.CARRIAGE_RETURN) {
            this.pos += 2; // skip escape sequence
            break;
          }
        }
        // falls through to the EOL error
        case CODE.NEWLINE:
        case CODE.CARRIAGE_RETURN:
          return this.emitError(
            regExp,
            ErrorCode.INVALID_REGULAR_EXPRESSION,
            "EOL reached while parsing regular expression",
          );
        case CODE.OPEN_SQUARE_BRACKET:
          regExp.isInCharSet = true;
          this.pos++;
          break;
        case CODE.CLOSE_SQUARE_BRACKET:
          regExp.isInCharSet = false;
          this.pos++;
          break;
        case CODE.FORWARD_SLASH:
          if (!regExp.isInCharSet) {
            this.pos++; // skip /
            this.exitState();
            return;
          }
          this.pos++;
          break;
        default:
          this.pos++;
          break;
      }
    }
    this.emitError(
      regExp,
      ErrorCode.INVALID_REGULAR_EXPRESSION,
      "EOF reached while parsing regular expression",
    );
  },

  return() {},
};
