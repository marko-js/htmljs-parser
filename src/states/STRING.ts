import { Parser, CODE, STATE } from "../internal";

export const STRING = Parser.createState({
  name: "STRING",

  enter(oldState, string) {
    string.value = string.quoteChar;
  },

  exit(string) {
    string.value = this.notifiers.notifyString(string);
  },

  eol(str, string) {
    string.value += str;
  },

  eof() {
    this.notifyError(
      this.pos,
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
});
