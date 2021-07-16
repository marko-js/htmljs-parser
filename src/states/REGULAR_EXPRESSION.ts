import { Parser, CODE, STATE } from "../internal";

export const REGULAR_EXPRESSION = Parser.createState({
  name: "REGULAR_EXPRESSION",

  eol() {
    this.notifyError(
      this.pos,
      "INVALID_REGULAR_EXPRESSION",
      "EOL reached while parsing regular expression"
    );
  },

  eof() {
    this.notifyError(
      this.pos,
      "INVALID_REGULAR_EXPRESSION",
      "EOF reached while parsing regular expression"
    );
  },

  char(ch, code) {
    var nextCh;
    this.currentPart.value += ch;
    if (code === CODE.BACK_SLASH) {
      // Handle escape sequence
      nextCh = this.lookAtCharAhead(1);
      this.skip(1);
      this.currentPart.value += nextCh;
    } else if (
      code === CODE.OPEN_SQUARE_BRACKET &&
      this.currentPart.inCharacterSet
    ) {
      this.currentPart.inCharacterSet = true;
    } else if (
      code === CODE.CLOSE_SQUARE_BRACKET &&
      this.currentPart.inCharacterSet
    ) {
      this.currentPart.inCharacterSet = false;
    } else if (
      code === CODE.FORWARD_SLASH &&
      !this.currentPart.inCharacterSet
    ) {
      this.endRegularExpression();
    }
  },
});
