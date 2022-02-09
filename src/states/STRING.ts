import { CODE, Part, StateDefinition } from "../internal";

export interface StringPart extends Part {
  quoteCharCode: number;
}

export const STRING: StateDefinition<StringPart> = {
  name: "STRING",

  eof(string) {
    this.notifyError(
      string,
      "INVALID_STRING",
      "EOF reached while parsing string expression"
    );
  },

  char(ch, code, string) {
    if (code === CODE.BACK_SLASH) {
      // Handle string escape sequence
      this.skip(1);
    } else if (code === string.quoteCharCode) {
      this.exitState(ch);
    }
  },
};
