import { CODE, StateDefinition, ValuePart } from "../internal";

export interface StringPart extends ValuePart {
  quoteChar: string;
  quoteCharCode: number;
}

export const STRING: StateDefinition<StringPart> = {
  name: "STRING",

  enter(string) {
    string.value = string.quoteChar;
  },

  eol(str, string) {
    string.value += str;
  },

  eof(string) {
    this.notifyError(
      string,
      "INVALID_STRING",
      "EOF reached while parsing string expression"
    );
  },

  char(ch, code, string) {
    string.value += ch;

    if (code === CODE.BACK_SLASH) {
      // Handle string escape sequence
      string.value += this.lookAtCharAhead(1);
      this.skip(1);
    } else if (code === string.quoteCharCode) {
      this.exitState(ch);
    }
  },
};
