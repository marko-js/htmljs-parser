import { CODE, type StateDefinition, type Meta, ErrorCode } from "../internal";

interface StringMeta extends Meta {
  quoteCharCode: number;
}

export const STRING: StateDefinition<StringMeta> = {
  name: "STRING",

  enter(parent, start) {
    return {
      state: STRING as StateDefinition,
      parent,
      start,
      end: start,
      quoteCharCode: CODE.DOUBLE_QUOTE,
    };
  },

  exit() {},

  parse(data, maxPos, string) {
    while (this.pos < maxPos) {
      const code = data.charCodeAt(this.pos);
      switch (code) {
        case CODE.BACK_SLASH:
          this.pos += 2; // skip \ and escaped char
          break;
        case string.quoteCharCode:
          this.pos++; // skip closing quote
          this.exitState();
          return;
        default:
          this.pos++;
          break;
      }
    }
    this.emitError(
      string,
      ErrorCode.INVALID_STRING,
      "EOF reached while parsing string expression",
    );
  },

  return() {},
};
