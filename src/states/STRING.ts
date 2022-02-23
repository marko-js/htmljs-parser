import { CODE, Range, StateDefinition } from "../internal";

interface StringMeta extends Range {
  quoteCharCode: number;
}

export const STRING: StateDefinition<StringMeta> = {
  name: "STRING",

  eof(string) {
    this.emitError(
      string,
      "INVALID_STRING",
      "EOF reached while parsing string expression"
    );
  },

  char(code, string) {
    switch (code) {
      case CODE.BACK_SLASH:
        // Handle string escape sequence
        this.skip(1); // skip \
        break;
      case string.quoteCharCode:
        this.skip(1); // skip ' or "
        this.exitState();
        break;
    }
  },
};
