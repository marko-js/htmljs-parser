import { CODE, StateDefinition, Meta } from "../internal";

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

  char(code, string) {
    switch (code) {
      case CODE.BACK_SLASH:
        // Handle string escape sequence
        this.pos++; // skip \
        break;
      case string.quoteCharCode:
        this.pos++; // skip ' or "
        this.exitState();
        break;
    }
  },

  eol() {},

  eof(string) {
    this.emitError(
      string,
      "INVALID_STRING",
      "EOF reached while parsing string expression"
    );
  },

  return() {},
};
